import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { CalendarSearch, Check } from 'lucide-react';
import { displayName, useAuth } from '../lib/auth';
import { dayLabel } from '../lib/calendar';
import { joinAgendaItem, useAgenda, type AgendaItem } from '../lib/data/agenda';
import { useMyMemberships } from '../lib/data/members';
import { parseDate, toIsoDate } from '../lib/format';
import { useNow } from '../lib/useNow';
import { isSportId, sportMeta, sportsOf } from '../sports/registry';
import { SportIcon } from './sports/SportBits';
import {
  agendaJoinStep,
  agendaSports,
  agendaTitle,
  filterAgenda,
  groupByDay,
  JOIN_PARAM,
  joinedMessage,
  loginNext,
  mineLabel,
  spotsText,
} from '../components/agenda/logic';
import { BusyIcon } from '../components/busy';
import { useAction, useFeedback } from '../components/feedback';
import { useActivity, useMyLeagues } from '../components/home/useHomeData';
import { WeekAgenda } from '../components/home/WeekAgenda';
import { useJoinFlow } from '../components/league/WhoAreYou';
import { useIsPro } from '../components/mode';
import { FilterChips, type ChipItem } from '../components/notifications/FilterChips';
import { ScreenTitle, ScreenTop } from '../components/screens/ScreenBits';
import { AppShell } from '../components/Shell';
import { Card, DateBlock, ListRow, ListSkeleton, LoadError, Segmented, cx } from '../components/ui';

const ALL = 'todos';

/** «hasta el 3 oct, 6:00 p. m.» */
const untilLabel = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-DO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
};

/** Las dos partes del Calendario: tus ligas, o lo abierto en las ligas públicas («¿Dónde juego esta semana?»). */
export type AgendaView = 'mias' | 'abiertas';

/** `?ver=mias` abre tus ligas; si no, lo abierto (los links de «¿Dónde juego esta semana?» y de Ligas llevan aquí). */
export const agendaView = (raw: string | null, canMine: boolean): AgendaView => (raw === 'mias' && canMine ? 'mias' : 'abiertas');

const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/** Debajo del nombre: «Sábado · 7:00 pm · Liga de los martes · Bolera Sambil · Quedan 3 lugares · hasta el 3 oct». */
export function agendaLine(
  item: Pick<AgendaItem, 'date' | 'timeLabel' | 'leagueName' | 'venue' | 'join' | 'cap' | 'taken' | 'spotsLeft' | 'waitlist' | 'until'>,
  today: string,
): string {
  const day = item.date === today ? 'Hoy' : WEEKDAYS[parseDate(item.date).getDay()];
  const until = item.until ? untilLabel(item.until) : '';
  return [day, item.timeLabel, item.leagueName, item.venue?.trim(), spotsText(item), until && `hasta el ${until}`]
    .filter(Boolean)
    .join(' · ');
}

/**
 * El Calendario (`/agenda`, rediseño «Calma y foco»: un solo calendario en vez de tres). «‹ Ligas», el título y, con
 * ligas, «Tus ligas | Abiertas»:
 * - Tus ligas (`?ver=mias`): la semana de tus ligas con sus fechas, «Voy» en las prácticas y las semanas que vienen
 *   (la misma de la hoja Calendario de Hoy).
 * - Abiertas («¿Dónde juego esta semana?»): lo que viene en los próximos 14 días en las ligas públicas donde uno se
 *   puede apuntar y hay lugar (boliche, golf, noches y torneos de raqueta), cada fecha en una fila (OCT / 13, la liga,
 *   la hora y los lugares) con «Me apunto» al lado; filtro por deporte (`?deporte=`) y, en Pro, por día (`?dia=`).
 *   «Me apunto» usa el flujo de siempre; sin cuenta, primero entra y vuelve aquí a apuntarse; en una liga de la que no
 *   es miembro, primero se une como en todas partes («¿Quién eres?» si hay jugadores sin cuenta). Tocar la fila abre el
 *   evento.
 */
export default function AgendaPage() {
  const auth = useAuth();
  const agenda = useAgenda();
  const pro = useIsPro();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const { toast } = useFeedback();
  const run = useAction();
  const now = useNow();
  const today = toIsoDate(now);
  const [busy, setBusy] = useState<string | null>(null);
  const [joined, setJoined] = useState<Record<string, string>>({});
  const memberships = useMyMemberships(auth.user?.uid);
  const myLeagues = useMemo(
    () => (memberships.loading && !memberships.data.length ? null : new Set(memberships.data.map((m) => m.leagueId))),
    [memberships.loading, memberships.data],
  );

  const items = agenda.data.items;
  const rawSport = params.get('deporte');
  const sport = rawSport && isSportId(rawSport) ? rawSport : null;
  const sports = useMemo(() => {
    const list = agendaSports(items);
    return sport && !list.includes(sport) ? [...list, sport] : list;
  }, [items, sport]);
  const bySport = useMemo(() => filterAgenda(items, sport, null), [items, sport]);
  const days = useMemo(() => [...new Set(bySport.map((i) => i.date))], [bySport]);
  const rawDay = params.get('dia');
  const day = rawDay && days.includes(rawDay) ? rawDay : null;
  const shown = useMemo(() => groupByDay(filterAgenda(bySport, null, day)), [bySport, day]);

  const setParam = useCallback(
    (key: string, value: string | null) =>
      setParams(
        (p) => {
          const next = new URLSearchParams(p);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  const apuntar = useCallback(
    async (item: AgendaItem) => {
      if (!auth.user) return;
      setBusy(item.eventId);
      const r = await run(() => joinAgendaItem(item, { uid: auth.user!.uid, name: displayName(auth) }));
      setBusy(null);
      if (r) {
        setJoined((j) => ({ ...j, [item.eventId]: r.kind === 'wait' ? 'En espera' : mineLabel(item) }));
        toast(joinedMessage(item, r));
      }
    },
    [auth, run, toast],
  );

  // Todavía no es de la liga: se une como en todas partes y, ya dentro, se apunta.
  const waiting = useRef<AgendaItem | null>(null);
  const flow = useJoinFlow((t) => {
    const item = waiting.current;
    waiting.current = null;
    if (item && item.leagueId === t.lid) void apuntar(item);
  });
  const startJoin = flow.start;

  const join = useCallback(
    async (item: AgendaItem) => {
      switch (agendaJoinStep(item, { signedIn: !!auth.user, leagues: myLeagues })) {
        case 'event':
          // Un torneo de raqueta (categoría, pareja) se apunta en su evento.
          navigate(auth.user ? item.url : `/login?next=${encodeURIComponent(item.url)}`);
          return;
        case 'login':
          navigate(loginNext(location.search, item.eventId));
          return;
        case 'league':
          waiting.current = item;
          await startJoin({
            lid: item.leagueId,
            name: item.leagueName,
            sport: item.sport,
            kind: item.leagueKind === 'torneo' ? 'torneo' : 'liga',
            next: `/agenda?${JOIN_PARAM}=${encodeURIComponent(item.eventId)}`,
          });
          return;
        default:
          await apuntar(item);
      }
    },
    [auth.user, myLeagues, location.search, navigate, startJoin, apuntar],
  );

  // De vuelta del login con ?apuntar=<evento>: se apunta una sola vez y se quita de la dirección.
  const pending = params.get(JOIN_PARAM);
  const done = useRef(false);
  useEffect(() => {
    // Espera también sus ligas: si todavía no es de esa, primero «¿Quién eres?».
    if (!pending || done.current || !auth.user || agenda.loading || !myLeagues) return;
    done.current = true;
    setParam(JOIN_PARAM, null);
    const item = items.find((i) => i.eventId === pending);
    if (item && !item.mine) void join(item);
  }, [pending, auth.user, agenda.loading, myLeagues, items, join, setParam]);

  const sportChips: ChipItem<string>[] = [
    { key: ALL, label: 'Todos' },
    ...sports.map((s) => ({ key: s, label: sportMeta(s)?.short ?? 'Otro deporte', icon: <SportIcon sport={s} className="size-4" /> })),
  ];
  const dayChips: ChipItem<string>[] = [{ key: ALL, label: 'Todos los días' }, ...days.map((d) => ({ key: d, label: dayLabel(d, today) }))];

  // Tus ligas (si tienes): la semana de siempre, la de la hoja Calendario de Hoy.
  const my = useMyLeagues();
  const canMine = !!auth.user && my.all.length > 0;
  const view = agendaView(params.get('ver'), canMine);
  const showDays = days.length > 1 && (pro || !!day);
  const shownItems = shown.flatMap((g) => g.items);

  const open = (
    <div className="flex flex-col gap-3.5">
      {sports.length > 1 && (
        <FilterChips items={sportChips} value={sport ?? ALL} onChange={(k) => setParam('deporte', k === ALL ? null : k)} label="Filtrar por deporte" />
      )}
      {showDays && <FilterChips items={dayChips} value={day ?? ALL} onChange={(k) => setParam('dia', k === ALL ? null : k)} label="Filtrar por día" />}

      {agenda.error && !items.length ? (
        <LoadError error={agenda.error} />
      ) : agenda.loading && !items.length ? (
        <ListSkeleton rows={4} />
      ) : !shownItems.length ? (
        <Card className="flex flex-col items-center px-5 py-8 text-center">
          <span aria-hidden="true" className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
            <CalendarSearch className="size-7" />
          </span>
          <h2 className="mt-4 text-card-title">{items.length ? 'Nada con ese filtro' : 'Nada abierto por ahora'}</h2>
          <p className="mt-2 max-w-sm text-body text-muted">
            {items.length ? 'Prueba con otro deporte u otro día.' : 'Cuando una liga pública abra una fecha con lugar, sale aquí.'}
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {shownItems.map((item) => (
            <AgendaRow
              key={item.eventId}
              item={item}
              today={today}
              dense={pro}
              showSport={sports.length > 1 && !sport}
              busy={busy === item.eventId || flow.busy === item.leagueId}
              joined={joined[item.eventId] ?? null}
              onJoin={() => void join(item)}
            />
          ))}
        </Card>
      )}
    </div>
  );

  return (
    <AppShell>
      <div className="flex flex-col px-2">
        <ScreenTop label="Ligas" fallback="/ligas" />
        <ScreenTitle
          title="Calendario"
          hint={view === 'mias' ? 'Tus ligas, semana por semana' : 'Ligas públicas con lugar en los próximos días'}
          pro={pro}
        />
        {canMine && (
          <Segmented<AgendaView>
            label="Qué fechas ver"
            full
            className="mt-5"
            options={[
              { key: 'mias', label: 'Tus ligas' },
              { key: 'abiertas', label: 'Abiertas' },
            ]}
            value={view}
            onChange={(k) => setParam('ver', k === 'mias' ? 'mias' : null)}
          />
        )}
        <div className="mt-5">{view === 'mias' ? <MyWeeks leagues={my.leagues} uid={my.uid} /> : open}</div>
      </div>
      {flow.modal}
    </AppShell>
  );
}

/** Tus ligas: la semana con sus fechas y «Voy», y las semanas que vienen (hasta 8). */
function MyWeeks({ leagues, uid }: { leagues: Parameters<typeof useActivity>[0]; uid: string | undefined }) {
  const act = useActivity(leagues, uid);
  const manySports = sportsOf(leagues).length > 1;
  if (act.loading && !act.feeds.length) return <ListSkeleton rows={4} />;
  if (!act.feeds.length && !act.mine.length) return <p className="mx-1 text-meta text-muted">Todavía no hay fechas en tus ligas.</p>;
  return <WeekAgenda feeds={act.feeds} leagues={act.leagues} matches={act.mine} today={act.today} showSport={manySports} />;
}

/**
 * Una fecha abierta: el bloque de la fecha (OCT / 13), qué es, «Sábado · 7:00 pm · la liga · cuántos lugares», y «Me
 * apunto» al lado (o cómo quedó: «Vas», «En espera»…). Toda la fila abre el evento.
 */
export function AgendaRow({
  item,
  today,
  dense,
  showSport,
  busy,
  joined,
  onJoin,
}: {
  item: AgendaItem;
  today: string;
  dense?: boolean;
  /** La lista trae varios deportes: el ícono de cada uno. */
  showSport?: boolean;
  busy?: boolean;
  /** Se acaba de apuntar aquí: cómo quedó («Vas», «En espera»…). */
  joined?: string | null;
  onJoin: () => void;
}) {
  const mine = joined ?? (item.mine ? mineLabel(item) : null);
  const title = agendaTitle(item);
  return (
    <ListRow
      dense={dense}
      to={item.url}
      ariaLabel={`${title}, ${item.leagueName}`}
      leading={
        // El deporte de cada fecha, en una esquina del bloque, cuando la lista trae varios.
        <span className="relative shrink-0">
          <DateBlock date={item.date} />
          {showSport && (
            <span aria-hidden="true" className="absolute -right-1.5 -bottom-1.5 grid size-6 place-items-center rounded-lg bg-surface text-accent shadow-sm">
              <SportIcon sport={item.sport} className="size-3.5" />
            </span>
          )}
        </span>
      }
      // En 360 px el botón deja poco ancho: el nombre baja a dos líneas en vez de cortarse en «Práctica d…».
      title={<span className="line-clamp-2 whitespace-normal">{title}</span>}
      subtitle={agendaLine(item, today)}
      trailing={
        mine ? (
          <span className="inline-flex h-9 items-center gap-1 rounded-full bg-accent-soft px-3 text-sm font-[650] text-accent">
            <Check aria-hidden="true" className="size-4" strokeWidth={2.6} /> {mine}
          </span>
        ) : (
          <button
            type="button"
            onClick={onJoin}
            disabled={busy}
            aria-busy={busy || undefined}
            aria-label={`Me apunto a ${title}`}
            className={cx(
              "relative inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-accent px-3.5 text-sm font-[650] text-accent-fg transition after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] active:scale-[0.97]",
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-80',
            )}
          >
            <span aria-hidden="true" className={cx(busy && 'text-transparent')}>
              Me apunto
            </span>
            <BusyIcon busy={!!busy} className="absolute inset-0 m-auto size-4" />
          </button>
        )
      }
    />
  );
}
