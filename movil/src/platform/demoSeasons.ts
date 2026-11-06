/**
 * Solo en la demostración en memoria (demoBackend.ts, /dev/empresa): las temporadas de «Liga de Ejemplo»
 * (demoLeague.ts) y «Suspender un día». Contesta las RPC de src/lib/data/seasons.ts y seasonAdmin.ts (league_seasons,
 * league_champions, close_season, start_season) y de src/lib/data/organizer.ts (suspend_day_preview, suspend_day),
 * con la misma forma que la base (20260929000700_temporadas.sql y 20260929000600_organizador.sql), y pone lo cambiado
 * encima de las filas de la liga: las fechas de la temporada en `leagues` (start_season) y los eventos movidos o
 * cancelados en `events` (suspend_day). De fábrica: una temporada cerrada con su tabla final y sus premios, y la de
 * ahora (empezó antes de las prácticas de ejemplo, así todo lo jugado es de ella). Se guarda en sessionStorage y se
 * borra al salir de la demostración (forgetDemoSeasons). Todos los datos son ficticios.
 */
import { BackendError, type BackendErrorKind } from '@mm/lib/backend/types';
import { uuidv7 } from '@mm/lib/db/ids';
import type { AwardKind, Season, SeasonAward, SeasonChampion } from '@mm/lib/seasons';
import { MIN_RANK_GAMES } from '@mm/lib/stats';
import { addDays, todayIn } from '@mm/pages/sports/racket/logic/time';
import { suspendNotice } from '@mm/components/organizer/logic';
import { makeSnapshot, snapshotTable, type SeasonSnapshot } from '@mm/components/season/logic';
import { announceRpc } from './demoAnnounce';
import { DEMO_LEAGUE } from './demoLeague';

type Row = Record<string, unknown>;
type Filter = { col: string; op: string; value: unknown };
/** Las filas de una tabla de las ligas ficticias, sin filtrar (null si no es de ellas). */
type Read = (table: string) => Row[] | null;

const KEY = 'mm-demo-temporadas';
const DAY = 86_400_000;

// Los jugadores de «Liga de Ejemplo» (demoLeague.ts): Juan Pérez (la cuenta de prueba), Jugador Uno y Jugadora Dos.
const ME_PLAYER = '00000000-0000-7000-8000-00000000f101';
const OTHER = '00000000-0000-7000-8000-00000000f102';
const THIRD = '00000000-0000-7000-8000-00000000f103';

/** La temporada cerrada y la de ahora de «Liga de Ejemplo». */
export const DEMO_SEASON_CLOSED = '00000000-0000-7000-8000-00000000f5a1';
export const DEMO_SEASON_ACTIVE = '00000000-0000-7000-8000-00000000f5a2';
const AWARD = (n: number) => `00000000-0000-7000-8000-00000000f5b${n}`;

const TZ = 'America/Santo_Domingo';
const dayFrom = (n: number) => addDays(todayIn(TZ), n);
const isoAgo = (days: number) => new Date(Date.now() - days * DAY).toISOString();

/** La tabla final de la temporada cerrada: la misma foto que guarda el boliche al cerrar (bowlingSnapshot). */
function closedSnapshot(at: string): SeasonSnapshot {
  const rows = [
    { rank: 1, playerId: OTHER, name: 'Jugador Uno', games: 24, average: 198, high: 245, series: 652 },
    { rank: 2, playerId: ME_PLAYER, name: 'Juan Pérez', games: 24, average: 191, high: 231, series: 621 },
    { rank: 3, playerId: THIRD, name: 'Jugadora Dos', games: 21, average: 184, high: 226, series: 608 },
  ];
  const who = (r: (typeof rows)[number]) => ({ name: r.name, playerId: r.playerId });
  return makeSnapshot(
    'bowling',
    [
      snapshotTable(
        { key: 'promedio', title: 'Promedio', nameLabel: 'Jugador', note: `Con ${MIN_RANK_GAMES} juegos verificados o más en la temporada.` },
        rows,
        [
          { label: 'Juegos', title: 'Juegos verificados', value: (r) => r.games },
          { label: 'Máx', title: 'Mejor juego', wide: true, value: (r) => r.high },
          { label: 'Prom.', title: 'Promedio', value: (r) => r.average },
        ],
        who,
      ),
      snapshotTable(
        { key: 'juego', title: 'Mejor juego', nameLabel: 'Jugador' },
        rows,
        [
          { label: 'Juegos', title: 'Juegos verificados', value: (r) => r.games },
          { label: 'Serie', title: 'Mejor serie de 3', wide: true, value: (r) => r.series },
          { label: 'Juego', title: 'Mejor juego', value: (r) => r.high },
        ],
        who,
      ),
    ],
    Date.parse(at),
  );
}

/**
 * Las temporadas de fábrica de «Liga de Ejemplo» (la forma de league_seasons, de la más nueva a la más vieja): la de
 * ahora, que empezó hace 40 días y termina (previsto) en 60, y la anterior, cerrada hace 41 días con su tabla final,
 * campeón, subcampeón, tercero, más mejorado y un premio «Mejor serie».
 */
export function demoSeasonsSeed(uid: string): Season[] {
  const closedAt = isoAgo(41);
  const award = (n: number, kind: AwardKind, label: string, playerId: string, name: string, note: string | null = null): SeasonAward => ({
    id: AWARD(n),
    kind,
    label,
    name,
    playerId,
    teamId: null,
    note,
  });
  return [
    {
      id: DEMO_SEASON_ACTIVE,
      name: 'Temporada de Ejemplo 2',
      startsOn: dayFrom(-40),
      endsOn: dayFrom(60),
      status: 'active',
      closedAt: null,
      closedBy: null,
      standings: null,
      awards: [],
      playoffs: [],
    },
    {
      id: DEMO_SEASON_CLOSED,
      name: 'Temporada de Ejemplo 1',
      startsOn: dayFrom(-200),
      endsOn: dayFrom(-41),
      status: 'closed',
      closedAt,
      closedBy: uid,
      standings: closedSnapshot(closedAt),
      awards: [
        award(1, 'campeon', 'Campeón', OTHER, 'Jugador Uno'),
        award(2, 'subcampeon', 'Subcampeón', ME_PLAYER, 'Juan Pérez'),
        award(3, 'tercero', 'Tercer lugar', THIRD, 'Jugadora Dos'),
        award(4, 'mas_mejorado', 'Más mejorado', THIRD, 'Jugadora Dos'),
        award(5, 'otro', 'Mejor serie', OTHER, 'Jugador Uno', 'Serie de 652'),
      ],
      playoffs: [],
    },
  ];
}

interface State {
  /** Las temporadas de «Liga de Ejemplo» como quedaron; null = las de fábrica. */
  seasons: Season[] | null;
  /** Las fechas de la temporada en la liga (start_season las pone); null = las de la temporada de ahora de fábrica. */
  leagueDates: { start: string | null; end: string | null } | null;
  /** Eventos que suspend_day pasó a otra fecha (id → 'YYYY-MM-DD'). */
  moved: Record<string, string>;
  /** Eventos que suspend_day canceló (sin nada adentro). */
  cancelled: string[];
}

const empty = (): State => ({ seasons: null, leagueDates: null, moved: {}, cancelled: [] });

function load(): State {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return { ...empty(), ...(JSON.parse(raw) as Partial<State>) };
  } catch {
    // sin sessionStorage: nada cambiado
  }
  return empty();
}

function save(s: State) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // sin sessionStorage: sigue en memoria hasta recargar
  }
}

export function forgetDemoSeasons() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // sin sessionStorage
  }
}

const fail = (message: string, kind: BackendErrorKind, code: string | null = null): never => {
  throw new BackendError(message, kind, code);
};
const invalid = () => fail('invalido', 'validation', 'invalido');
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const sortDesc = (list: Season[]) => [...list].sort((a, b) => (a.startsOn < b.startsOn ? 1 : a.startsOn > b.startsOn ? -1 : 0));
const seasonsOf = (s: State, uid: string) => s.seasons ?? demoSeasonsSeed(uid);

const matches = (r: Row, filters: readonly Filter[]) =>
  filters.every((f) => {
    if (f.op === 'eq') return r[f.col] === f.value;
    if (f.op === 'is') return f.value === null ? r[f.col] == null : r[f.col] === f.value;
    if (f.op === 'in') return Array.isArray(f.value) && f.value.includes(r[f.col]);
    if (f.op === 'gt') return typeof r[f.col] === 'number' && (r[f.col] as number) > (f.value as number);
    return true;
  });

/** Una tabla de la liga ficticia con lo cambiado encima (sin filtrar); null si no es de las que tocan las temporadas. */
function overlay(s: State, table: string, read: Read): Row[] | null {
  if (table === 'leagues') {
    const base = read('leagues');
    if (!base) return null;
    const active = seasonsOf(s, '').find((x) => x.status === 'active') ?? null;
    const dates = s.leagueDates ?? { start: active?.startsOn ?? null, end: active?.endsOn ?? null };
    return base.map((l) => (l.id === DEMO_LEAGUE ? { ...l, season_start: dates.start, season_end: dates.end } : l));
  }
  if (table === 'events') {
    const base = read('events');
    if (!base) return null;
    if (!s.cancelled.length && !Object.keys(s.moved).length) return base;
    return base.filter((e) => !s.cancelled.includes(String(e.id))).map((e) => (String(e.id) in s.moved ? { ...e, date: s.moved[String(e.id)] } : e));
  }
  return null;
}

/**
 * Las filas de `table` con lo cambiado en las temporadas y los filtros (eq, is, in y gt); null si la tabla no es de
 * las que tocan las temporadas (leagues, events). `read`: las filas de la liga ficticia sin filtrar.
 */
export function demoSeasonsSelect(table: string, filters: readonly Filter[] = [], read: Read): Row[] | null {
  const rows = overlay(load(), table, read);
  return rows ? rows.filter((r) => matches(r, filters)) : null;
}

const FNS = ['league_seasons', 'league_champions', 'close_season', 'start_season', 'suspend_day_preview', 'suspend_day'];

const DEFAULT_LABEL: Record<AwardKind, string | null> = {
  campeon: 'Campeón',
  subcampeon: 'Subcampeón',
  tercero: 'Tercer lugar',
  mvp: 'MVP',
  mas_mejorado: 'Más mejorado',
  fair_play: 'Fair play',
  otro: null,
};
const KINDS = Object.keys(DEFAULT_LABEL) as AwardKind[];

/** Lo de un día en la liga (private.suspend_plan): sus eventos, con lo que ya tiene resultados y lo que tiene adentro. */
function plan(lid: string, date: string, read: (table: string) => Row[]) {
  const events = (overlay(load(), 'events', read) ?? []).filter((e) => e.league_id === lid && e.date === date);
  const entries = read('entries');
  const subs = read('submissions');
  const teams = read('teams');
  const lanes = read('event_lanes');
  return events
    .map((e) => {
      const mine = entries.filter((x) => x.event_id === e.id);
      const locked =
        mine.some((x) => Array.isArray(x.scores) && (x.scores as unknown[]).some((v) => v != null)) || subs.some((x) => x.event_id === e.id && x.status === 'pendiente');
      const content = mine.length > 0 || subs.some((x) => x.event_id === e.id) || teams.some((x) => x.event_id === e.id) || lanes.some((x) => x.event_id === e.id);
      return {
        id: String(e.id),
        label: String(e.name || (e.type === 'practica' ? 'Práctica' : 'Evento')),
        sub: 'bowling',
        startTime: typeof e.start_time === 'string' ? e.start_time.slice(0, 5) : null,
        locked,
        reason: locked ? ('con_resultado' as const) : null,
        content,
      };
    })
    .sort((a, b) => String(a.startTime ?? '').localeCompare(String(b.startTime ?? '')) || a.id.localeCompare(b.id));
}

/**
 * Las RPC de las temporadas y de «Suspender un día» en «Liga de Ejemplo». `read`: las filas de una tabla como están
 * ahora (con lo cambiado en Jugadores, Equipos y aquí; sin filtrar). undefined si no es de las temporadas o lo pedido
 * no es de «Liga de Ejemplo» (sigue demoBackend como siempre).
 */
export function seasonsRpc(uid: string, fn: string, a: Record<string, unknown>, read: (table: string) => Row[]): unknown {
  if (!FNS.includes(fn)) return undefined;
  const s = load();
  const list = seasonsOf(s, uid).map((x) => ({ ...x, awards: [...x.awards] }));
  const requireAdmin = (league: unknown) => {
    if (!read('memberships').some((m) => m.league_id === league && m.user_id === uid && (m.role === 'owner' || m.role === 'admin'))) fail('no_permitido', 'permission', 'no_permitido');
  };
  const commit = <T,>(out: T): T => {
    s.seasons = list;
    save(s);
    return out;
  };

  // ---------- Lecturas ----------

  if (fn === 'league_seasons' || fn === 'league_champions') {
    if (a.p_league !== DEMO_LEAGUE) return undefined;
    const sorted = sortDesc(list);
    if (fn === 'league_seasons') return sorted;
    return sorted
      .filter((x) => x.status === 'closed')
      .map((x): SeasonChampion => {
        const champ = x.awards.find((w) => w.kind === 'campeon');
        return {
          seasonId: x.id,
          name: x.name,
          startsOn: x.startsOn,
          endsOn: x.endsOn,
          closedAt: x.closedAt,
          champion: champ ? { label: champ.label, name: champ.name, playerId: champ.playerId, teamId: champ.teamId } : null,
          awards: x.awards.map(({ id: _id, ...rest }) => rest),
        };
      });
  }

  // ---------- Cerrar (o corregir) una temporada ----------

  if (fn === 'close_season') {
    const season = list.find((x) => x.id === a.p_season);
    if (!season) return undefined;
    requireAdmin(DEMO_LEAGUE);
    const standings = a.p_standings;
    if (standings == null || typeof standings !== 'object') invalid();
    const given = a.p_awards == null ? [] : a.p_awards;
    if (!Array.isArray(given) || given.length > 30) invalid();
    const players = read('players').filter((p) => p.league_id === DEMO_LEAGUE);
    const teams = read('teams').filter((t) => t.league_id === DEMO_LEAGUE);
    let champion: string | null = null;
    // Primero se revisa todo (nada se escribe con un premio malo).
    const awards = (given as unknown[]).map((raw): SeasonAward => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) invalid();
      const w = raw as Row;
      const kind = w.kind as AwardKind;
      if (!KINDS.includes(kind)) invalid();
      const player = typeof w.player_id === 'string' && w.player_id ? w.player_id : null;
      const team = typeof w.team_id === 'string' && w.team_id ? w.team_id : null;
      if ((player ? 1 : 0) + (team ? 1 : 0) !== 1) invalid();
      const name = player ? players.find((p) => p.id === player)?.name : teams.find((t) => t.id === team)?.name;
      if (typeof name !== 'string') invalid();
      const label = (typeof w.label === 'string' && w.label.trim() ? w.label.trim() : null) ?? DEFAULT_LABEL[kind];
      const note = typeof w.note === 'string' && w.note.trim() ? w.note.trim() : null;
      if (!label || label.length > 40 || (note?.length ?? 0) > 200) invalid();
      if (kind === 'campeon') {
        if (champion != null) invalid();
        champion = name as string;
      }
      return { id: uuidv7(), kind, label: label as string, name: (name as string).slice(0, 80), playerId: player, teamId: team, note };
    });
    const wasActive = season.status === 'active';
    const today = todayIn(TZ);
    Object.assign(season, {
      status: 'closed',
      closedAt: season.closedAt ?? new Date().toISOString(),
      closedBy: wasActive ? uid : season.closedBy,
      endsOn: wasActive ? (season.startsOn > today ? season.startsOn : today) : season.endsOn,
      standings,
      awards,
    });
    if (wasActive) {
      // El aviso a la liga (en la base es automático y no cuenta para el tope del día; aquí va con los avisos de
      // ejemplo y, si ya se mandaron los de hoy, no sale).
      const body = `Terminó ${season.name}${champion ? `: campeón ${champion}` : ''}`.slice(0, 180);
      try {
        announceRpc(DEMO_LEAGUE, 'league_announce', { p_league: DEMO_LEAGUE, p_body: body });
      } catch {
        // el tope de avisos de la demostración
      }
    }
    return commit(null);
  }

  // ---------- Empezar la temporada nueva ----------

  if (fn === 'start_season') {
    if (a.p_league !== DEMO_LEAGUE) return undefined;
    requireAdmin(DEMO_LEAGUE);
    if (list.some((x) => x.status === 'active')) invalid();
    const startsOn = typeof a.p_starts_on === 'string' && DATE.test(a.p_starts_on) ? a.p_starts_on : invalid();
    const endsOn = a.p_ends_on == null || a.p_ends_on === '' ? null : typeof a.p_ends_on === 'string' && DATE.test(a.p_ends_on) ? a.p_ends_on : invalid();
    if (endsOn && endsOn < startsOn) invalid();
    const prev = sortDesc(list)[0];
    if (prev && startsOn <= (prev.endsOn ?? prev.startsOn)) invalid();
    const name = typeof a.p_name === 'string' ? a.p_name.trim() : '';
    if (name.length < 1 || name.length > 60) invalid();
    const id = uuidv7();
    list.push({ id, name, startsOn, endsOn, status: 'active', closedAt: null, closedBy: null, standings: null, awards: [], playoffs: [] });
    // Pone las fechas en la liga (copiar equipos es de las ligas de equipos: el boliche no).
    s.leagueDates = { start: startsOn, end: endsOn };
    return commit(id);
  }

  // ---------- Suspender un día ----------

  const lid = a.p_league;
  if (lid !== DEMO_LEAGUE) return undefined;
  requireAdmin(lid);
  const date = typeof a.p_date === 'string' && DATE.test(a.p_date) ? a.p_date : invalid();
  const p = plan(DEMO_LEAGUE, date, read);
  const open = p.filter((e) => !e.locked);

  if (fn === 'suspend_day_preview') {
    return {
      date,
      matches: [],
      events: p,
      counts: { matches: 0, bowlingEvents: open.length, golfRounds: 0, swimMeets: 0, otherEvents: 0, locked: p.length - open.length },
      withNewDate: { matches: 0, events: open.length },
      withoutDate: { postponed: 0, cancelled: open.filter((e) => !e.content).length, kept: open.filter((e) => e.content).length },
    };
  }

  // suspend_day
  const reason = String(a.p_reason ?? '')
    .replace(/\n/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
  const newDate = a.p_new_date == null || a.p_new_date === '' ? null : typeof a.p_new_date === 'string' && DATE.test(a.p_new_date) ? a.p_new_date : invalid();
  if (reason.length < 1 || reason.length > 90 || /[\u0000-\u001f\u007f]/.test(reason) || (newDate && (newDate === date || newDate < todayIn(TZ)))) invalid();
  let moved = 0;
  let cancelled = 0;
  let kept = 0;
  if (newDate) {
    for (const e of open) s.moved[e.id] = newDate;
    moved = open.length;
  } else {
    for (const e of open) {
      if (e.content) kept += 1;
      else {
        s.cancelled.push(e.id);
        cancelled += 1;
      }
    }
  }
  save(s);
  const body = suspendNotice(date, reason, newDate);
  let announced = false;
  let skipped: 'nada' | 'duplicado' | 'limite' | null = null;
  let recipients = 0;
  // Si nada cambió (solo hay eventos con inscritos y no hay fecha nueva), el aviso diría algo que no pasó.
  if (moved + cancelled === 0) skipped = 'nada';
  else if (read('league_announcements').some((x) => x.league_id === lid && x.body === body && Date.now() - Date.parse(String(x.created_at)) < 10 * 60_000)) skipped = 'duplicado';
  else {
    try {
      recipients = Number(announceRpc(DEMO_LEAGUE, 'league_announce', { p_league: DEMO_LEAGUE, p_body: body })) || 0;
      announced = true;
    } catch {
      skipped = 'limite';
    }
  }
  return {
    date,
    newDate,
    matches: { moved: 0, postponed: 0 },
    events: { moved, cancelled, kept },
    locked: p.length - open.length,
    announced,
    skipped,
    recipients,
    body,
  };
}
