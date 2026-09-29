import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { Check, ChevronRight, Clock, MapPin, Search, Users } from 'lucide-react';
import { displayName, useAuth } from '../lib/auth';
import { dayLabel } from '../lib/calendar';
import { joinAgendaItem, useAgenda, type AgendaItem } from '../lib/data/agenda';
import { toIsoDate } from '../lib/format';
import { useNow } from '../lib/useNow';
import { isSportId, sportMeta } from '../sports/registry';
import { SportBadge, SportIcon } from './sports/SportBits';
import { agendaSports, agendaTitle, filterAgenda, groupByDay, JOIN_PARAM, joinedMessage, joinsInEvent, loginNext, mineLabel, spotsText } from '../components/agenda/logic';
import { BackLink } from '../components/BackLink';
import { useAction, useFeedback } from '../components/feedback';
import { SportTint } from '../components/home/SportTint';
import { FilterChips, type ChipItem } from '../components/notifications/FilterChips';
import { AppShell } from '../components/Shell';
import { Badge, Button, Card, Empty, ListSkeleton, LoadError, cx } from '../components/ui';

const ALL = 'todos';

/** «Inscripción hasta el 3 oct, 6:00 p. m.» */
const untilLabel = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-DO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
};

/**
 * «¿Dónde juego esta semana?» (`/agenda`): lo que viene en los próximos 14 días en las ligas públicas donde uno se
 * puede apuntar y hay lugar (boliche, golf, noches y torneos de raqueta), por día, con filtro por deporte (`?deporte=`)
 * y por día (`?dia=`). «Me apunto» usa el flujo de siempre; sin cuenta, primero entra y vuelve aquí a apuntarse.
 */
export default function AgendaPage() {
  const auth = useAuth();
  const agenda = useAgenda();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const { toast } = useFeedback();
  const run = useAction();
  const now = useNow();
  const today = toIsoDate(now);
  const [busy, setBusy] = useState<string | null>(null);
  const [joined, setJoined] = useState<Record<string, string>>({});

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

  const join = useCallback(
    async (item: AgendaItem) => {
      // Un torneo de raqueta (categoría, pareja) se apunta en su evento.
      if (joinsInEvent(item)) {
        navigate(auth.user ? item.url : `/login?next=${encodeURIComponent(item.url)}`);
        return;
      }
      if (!auth.user) {
        navigate(loginNext(location.search, item.eventId));
        return;
      }
      setBusy(item.eventId);
      const r = await run(() => joinAgendaItem(item, { uid: auth.user!.uid, name: displayName(auth) }));
      setBusy(null);
      if (r) {
        setJoined((j) => ({ ...j, [item.eventId]: r.kind === 'wait' ? 'En espera' : mineLabel(item) }));
        toast(joinedMessage(item, r));
      }
    },
    [auth, location.search, navigate, run, toast],
  );

  // De vuelta del login con ?apuntar=<evento>: se apunta una sola vez y se quita de la dirección.
  const pending = params.get(JOIN_PARAM);
  const done = useRef(false);
  useEffect(() => {
    if (!pending || done.current || !auth.user || agenda.loading) return;
    done.current = true;
    setParam(JOIN_PARAM, null);
    const item = items.find((i) => i.eventId === pending);
    if (item && !item.mine) void join(item);
  }, [pending, auth.user, agenda.loading, items, join, setParam]);

  const sportChips: ChipItem<string>[] = [
    { key: ALL, label: 'Todos' },
    ...sports.map((s) => ({ key: s, label: sportMeta(s)?.short ?? 'Otro deporte', icon: <SportIcon sport={s} className="size-4" /> })),
  ];
  const dayChips: ChipItem<string>[] = [{ key: ALL, label: 'Todos los días' }, ...days.map((d) => ({ key: d, label: dayLabel(d, today) }))];

  return (
    <AppShell>
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-2">
          <BackLink fallback="/" className="mt-0.5" />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold tracking-tight">¿Dónde juego esta semana?</h1>
            <p className="text-sm text-muted">Lo que viene en las ligas públicas donde te puedes apuntar y hay lugar.</p>
          </div>
        </div>

        {sports.length > 1 && (
          <FilterChips items={sportChips} value={sport ?? ALL} onChange={(k) => setParam('deporte', k === ALL ? null : k)} label="Filtrar por deporte" />
        )}
        {days.length > 1 && <FilterChips items={dayChips} value={day ?? ALL} onChange={(k) => setParam('dia', k === ALL ? null : k)} label="Filtrar por día" />}

        {agenda.error && !items.length ? (
          <LoadError error={agenda.error} />
        ) : agenda.loading && !items.length ? (
          <ListSkeleton rows={4} />
        ) : !shown.length ? (
          <Empty icon={<Search className="size-8" />} title={items.length ? 'Nada con ese filtro' : 'Nada abierto por ahora'}>
            {items.length
              ? 'Prueba con otro deporte u otro día.'
              : 'Cuando una liga pública abra una práctica, una ronda o una noche con lugar, sale aquí.'}
          </Empty>
        ) : (
          shown.map((g) => (
            <section key={g.date} className="flex flex-col gap-2" aria-label={dayLabel(g.date, today)}>
              <h2 className="text-sm font-semibold text-muted first-letter:uppercase">{dayLabel(g.date, today)}</h2>
              <div className="stagger flex flex-col gap-3">
                {g.items.map((item, i) => (
                  <AgendaCard
                    key={item.eventId}
                    item={item}
                    i={i}
                    showSport={sports.length > 1 && !sport}
                    busy={busy === item.eventId}
                    joined={joined[item.eventId] ?? null}
                    onJoin={() => void join(item)}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </AppShell>
  );
}

/** Una tarjeta de la agenda: qué, dónde, a qué hora, cuántos lugares y «Me apunto». */
export function AgendaCard({
  item,
  i = 0,
  showSport,
  busy,
  joined,
  onJoin,
}: {
  item: AgendaItem;
  i?: number;
  showSport?: boolean;
  busy?: boolean;
  /** Se acaba de apuntar aquí: cómo quedó («Vas», «En espera»…). */
  joined?: string | null;
  onJoin: () => void;
}) {
  const mine = joined ?? (item.mine ? mineLabel(item) : null);
  return (
    <Card className="flex flex-col gap-3 p-4" style={{ '--i': i } as CSSProperties}>
      <div className="flex items-start gap-3">
        <SportTint sport={item.sport} className="shrink-0">
          <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent" aria-hidden="true">
            <SportIcon sport={item.sport} className="size-5" />
          </span>
        </SportTint>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{agendaTitle(item)}</p>
          <p className="truncate text-xs text-muted">{item.leagueName}</p>
        </div>
        {showSport && <SportBadge sport={item.sport} className="shrink-0" />}
      </div>

      <ul className="flex flex-col gap-1 text-sm text-muted">
        <li className="flex items-center gap-1.5">
          <Clock className="size-4 shrink-0" aria-hidden="true" />
          {item.timeLabel ?? 'Hora por confirmar'}
        </li>
        {item.venue && (
          <li className="flex min-w-0 items-center gap-1.5">
            <MapPin className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{item.venue}</span>
          </li>
        )}
        <li className="flex items-center gap-1.5">
          <Users className="size-4 shrink-0" aria-hidden="true" />
          {spotsText(item)}
        </li>
        {item.until && untilLabel(item.until) && <li className="text-xs">Inscripción hasta el {untilLabel(item.until)}</li>}
      </ul>

      <div className="flex items-center gap-2">
        {mine ? (
          <Badge tone="ok" className="h-8 px-3 text-sm">
            <Check className="size-4" aria-hidden="true" /> {mine}
          </Badge>
        ) : (
          <Button variant="primary" className="h-11 flex-1 sm:flex-none" loading={busy} onClick={onJoin}>
            Me apunto
          </Button>
        )}
        <Link
          to={item.url}
          className={cx('inline-flex h-11 items-center gap-1 rounded-xl px-3 text-sm font-medium text-accent transition hover:bg-accent-soft', mine && 'ml-auto')}
        >
          Ver evento <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </Card>
  );
}
