import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { CalendarSearch } from 'lucide-react-native';
import { displayName, useAuth } from '@mm/lib/auth';
import { dayLabel } from '@mm/lib/calendar';
import { joinAgendaItem, useAgenda, type AgendaItem } from '@mm/lib/data/agenda';
import { saveErrorMessage } from '@mm/lib/errorText';
import { toIsoDate } from '@mm/lib/format';
import { useNow } from '@mm/lib/useNow';
import { useIsPro } from '@mm/lib/useMode';
import { sportMeta, sportsOf } from '@mm/sports/registry';
import {
  AGENDA_ALL,
  agendaEmpty,
  agendaFilters,
  agendaHint,
  agendaJoinStep,
  agendaReturn,
  agendaView,
  joinedLabel,
  joinedMessage,
  loginNext,
  myLeagueIds,
  showDayFilter,
  type AgendaView,
} from '@mm/components/agenda/logic';
import { useActivity, useMyLeagues } from '@mm/components/home/activity';
import { toast } from '@/components/feedback';
import { Chips, type ChipItem } from '@/components/notifications/NoticeList';
import { BackBar, Card, LoadError, Loading, Screen, Segmented, Txt } from '@/components/ui';
import { openLink } from '@/lib/links';
import { TITLE_PRO } from '@/components/home/proLook';
import { useColors } from '@/theme/theme';
import { AgendaRow } from './AgendaRow';
import { useJoinFlow } from './joinFlow';
import { WeekAgenda } from './WeekAgenda';

type Params = { deporte?: string; dia?: string; ver?: string; apuntar?: string };

/** El ?… de ahora (los filtros), para volver aquí después de entrar a la cuenta. */
const searchOf = (p: Params) => {
  const q = new URLSearchParams();
  for (const k of ['deporte', 'dia', 'ver'] as const) if (p[k]) q.set(k, p[k]!);
  const s = q.toString();
  return s ? `?${s}` : '';
};

/**
 * El Calendario (`/agenda`, AgendaPage de la web con su misma lógica: src/components/agenda/logic.ts). «‹ Ligas», el
 * título y, con ligas, «Tus ligas | Abiertas»:
 * - Tus ligas (`?ver=mias`): la semana de tus ligas con sus fechas, «Voy» en las prácticas y las semanas que vienen (la
 *   misma de la hoja Calendario de Hoy).
 * - Abiertas («¿Dónde juego esta semana?»): lo que viene en los próximos 14 días en las ligas públicas donde uno se
 *   puede apuntar y hay lugar, cada fecha en una fila con «Me apunto» al lado; filtro por deporte (`?deporte=`) y, en
 *   Pro, por día (`?dia=`; en Lite solo si viene en el link). En Pro, las filas más bajas. «Me apunto» usa el flujo de
 *   siempre; sin cuenta, primero a entrar; en una liga de la que no es miembro, primero se une («¿Quién eres?» si hay
 *   jugadores sin cuenta). Un torneo de raqueta (categoría, pareja) se apunta en su evento. Tocar la fila abre el evento.
 */
export function AgendaScreen() {
  const c = useColors();
  const auth = useAuth();
  const agenda = useAgenda();
  const pro = useIsPro();
  const titleStyle = pro ? TITLE_PRO : undefined;
  const params = useLocalSearchParams<Params>();
  const today = toIsoDate(useNow());
  const [busy, setBusy] = useState<string | null>(null);
  const [joined, setJoined] = useState<Record<string, string>>({});
  // Tus ligas (si tienes): la semana de siempre, la de la hoja Calendario de Hoy; y sus ids para «Me apunto».
  const my = useMyLeagues();
  const myLeagues = myLeagueIds(my.memberships.loading, my.memberships.data);

  const items = agenda.data.items;
  const { sport, sports, days, day, shown } = agendaFilters(items, params.deporte, params.dia);
  const setParam = (key: keyof Params, value: string | null) => router.setParams({ [key]: value ?? undefined });

  async function apuntar(item: AgendaItem) {
    if (!auth.user) return;
    setBusy(item.eventId);
    try {
      const r = await joinAgendaItem(item, { uid: auth.user.uid, name: displayName(auth) });
      setJoined((j) => ({ ...j, [item.eventId]: joinedLabel(item, r) }));
      toast(joinedMessage(item, r));
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  // Todavía no es de la liga: se une como en todas partes y, ya dentro, se apunta.
  const waiting = useRef<AgendaItem | null>(null);
  const flow = useJoinFlow((t) => {
    const item = waiting.current;
    waiting.current = null;
    if (item && item.leagueId === t.lid) void apuntar(item);
  });

  async function join(item: AgendaItem) {
    switch (agendaJoinStep(item, { signedIn: !!auth.user, leagues: myLeagues })) {
      case 'event':
        // Un torneo de raqueta (categoría, pareja) se apunta en su evento.
        if (auth.user) openLink(item.url);
        else router.push({ pathname: '/login', params: { next: item.url } });
        return;
      case 'login':
        router.push(loginNext(searchOf(params), item.eventId) as never);
        return;
      case 'league':
        waiting.current = item;
        await flow.start({
          lid: item.leagueId,
          name: item.leagueName,
          sport: item.sport,
          kind: item.leagueKind === 'torneo' ? 'torneo' : 'liga',
          next: agendaReturn('', item.eventId),
        });
        return;
      default:
        await apuntar(item);
    }
  }

  // De vuelta de entrar con ?apuntar=<evento>: se apunta una sola vez y se quita de la dirección.
  const pending = params.apuntar;
  const done = useRef(false);
  useEffect(() => {
    // Espera también sus ligas: si todavía no es de esa, primero «¿Quién eres?».
    if (!pending || done.current || !auth.user || agenda.loading || !myLeagues) return;
    done.current = true;
    router.setParams({ apuntar: undefined });
    const item = items.find((i) => i.eventId === pending);
    // Después del efecto: «Me apunto» cambia lo de la pantalla (la ruedita de la fila, cómo quedó).
    if (item && !item.mine) setTimeout(() => void join(item), 0);
  });

  const canMine = !!auth.user && my.all.length > 0;
  const view = agendaView(params.ver, canMine);
  // El filtro por día es de Pro (en Lite solo si ya viene en el link, `?dia=`).
  const showDays = showDayFilter(days.length, pro, day);
  const empty = agendaEmpty(items.length > 0);

  const sportChips: ChipItem<string>[] = [
    { key: AGENDA_ALL, label: 'Todos' },
    ...sports.map((s) => {
      const Icon = sportMeta(s)?.icon;
      const on = (sport ?? AGENDA_ALL) === s;
      return { key: s, label: sportMeta(s)?.short ?? 'Otro deporte', icon: Icon ? <Icon size={16} color={on ? c.accentFg : c.fg} /> : undefined };
    }),
  ];
  const dayChips: ChipItem<string>[] = [{ key: AGENDA_ALL, label: 'Todos los días' }, ...days.map((d) => ({ key: d, label: dayLabel(d, today) }))];

  let open;
  if (agenda.error && !items.length) open = <LoadError error={agenda.error} />;
  else if (agenda.loading && !items.length) open = <Loading label="Cargando el calendario" />;
  else if (!shown.length) {
    open = (
      <Card style={{ alignItems: 'center', paddingVertical: 32 }}>
        <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <CalendarSearch size={28} color={c.accent} />
        </View>
        <Txt variant="cardTitle" style={{ marginTop: 16, textAlign: 'center' }}>
          {empty.title}
        </Txt>
        <Txt tone="muted" style={{ marginTop: 8, textAlign: 'center', maxWidth: 384 }}>
          {empty.text}
        </Txt>
      </Card>
    );
  } else {
    open = (
      <Card padded={false} style={{ overflow: 'hidden' }}>
        {shown.map((item, i) => (
          <AgendaRow
            key={item.eventId}
            item={item}
            today={today}
            first={i === 0}
            dense={pro}
            busy={busy === item.eventId || flow.busy === item.leagueId}
            joined={joined[item.eventId] ?? null}
            onJoin={() => void join(item)}
          />
        ))}
      </Card>
    );
  }

  return (
    <Screen>
      <BackBar label="Ligas" fallback="/ligas" />
      <View style={{ gap: 4 }}>
        <Txt variant="title" accessibilityRole="header" style={titleStyle}>
          Calendario
        </Txt>
        <Txt variant="meta" tone="muted">
          {agendaHint(view)}
        </Txt>
      </View>
      {canMine && (
        <Segmented<AgendaView>
          label="Qué fechas ver"
          options={[
            { key: 'mias', label: 'Tus ligas' },
            { key: 'abiertas', label: 'Abiertas' },
          ]}
          value={view}
          onChange={(k) => setParam('ver', k === 'mias' ? 'mias' : null)}
        />
      )}
      {view === 'mias' ? (
        <MyWeeks leagues={my.leagues} uid={my.uid} />
      ) : (
        <View style={{ gap: 14 }}>
          {sports.length > 1 && <Chips label="Filtrar por deporte" items={sportChips} value={sport ?? AGENDA_ALL} onChange={(k) => setParam('deporte', k === AGENDA_ALL ? null : k)} />}
          {showDays && <Chips label="Filtrar por día" items={dayChips} value={day ?? AGENDA_ALL} onChange={(k) => setParam('dia', k === AGENDA_ALL ? null : k)} />}
          {open}
        </View>
      )}
      {flow.modal}
    </Screen>
  );
}

/** Tus ligas: la semana con sus fechas y «Voy», y las semanas que vienen (hasta 8). */
function MyWeeks({ leagues, uid }: { leagues: Parameters<typeof useActivity>[0]; uid: string | undefined }) {
  const act = useActivity(leagues, uid);
  const manySports = sportsOf(leagues).length > 1;
  if (act.loading && !act.feeds.length) return <Loading label="Cargando tus fechas" />;
  if (!act.feeds.length && !act.mine.length) {
    return (
      <Txt variant="meta" tone="muted" style={{ marginHorizontal: 4 }}>
        Todavía no hay fechas en tus ligas.
      </Txt>
    );
  }
  return <WeekAgenda feeds={act.feeds} leagues={act.leagues} matches={act.mine} today={act.today} showSport={manySports} />;
}
