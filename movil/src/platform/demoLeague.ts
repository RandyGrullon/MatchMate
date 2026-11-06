/**
 * Solo en la demostración en memoria (demoBackend.ts, /dev/empresa): una liga de boliche ficticia para probar Hoy, el
 * evento, «Enviar mis juegos», «Por aprobar» y «Cómo van todos» sin el Supabase real. La cuenta de prueba es la admin
 * de la liga y juega; hay otro jugador con un envío pendiente y uno con juegos aprobados. Lo que cambia (envíos,
 * aprobar, rechazar) se guarda en sessionStorage y se borra al salir de la demostración. Todos los datos son ficticios.
 */
import { toIsoDate } from '@mm/lib/format';

const KEY = 'mm-demo-liga';
export const DEMO_LEAGUE = '00000000-0000-7000-8000-00000000f001';
const EVENT = '00000000-0000-7000-8000-00000000f0e1';
const ME_PLAYER = '00000000-0000-7000-8000-00000000f101';
const OTHER = '00000000-0000-7000-8000-00000000f102';
const THIRD = '00000000-0000-7000-8000-00000000f103';
// Dos prácticas pasadas, con juegos aprobados de los tres (para la tabla y «Mis números»).
const PAST = ['00000000-0000-7000-8000-00000000f0e2', '00000000-0000-7000-8000-00000000f0e3'];
const DAY = 86_400_000;
const dayAgo = (n: number) => toIsoDate(new Date(Date.now() - n * DAY));
const pastEntry = (n: number, eventId: string, playerId: string, scores: number[]): Row => ({
  id: `00000000-0000-7000-8000-0000000f5${String(n).padStart(3, '0')}`,
  league_id: DEMO_LEAGUE,
  event_id: eventId,
  player_id: playerId,
  team_id: null,
  average: 180,
  handicap_override: null,
  scores,
  photos: scores.map(() => 'ok'),
  frames: null,
});
const PAST_ENTRIES: Row[] = [
  pastEntry(1, PAST[0], ME_PLAYER, [188, 201, 176]),
  pastEntry(2, PAST[0], OTHER, [212, 190, 199]),
  pastEntry(3, PAST[0], THIRD, [170, 185, 193]),
  pastEntry(4, PAST[1], ME_PLAYER, [195, 207, 183]),
  pastEntry(5, PAST[1], OTHER, [180, 221, 204]),
  pastEntry(6, PAST[1], THIRD, [166, 178, 190]),
];

type Row = Record<string, unknown>;
interface State {
  entries: Row[];
  submissions: Row[];
}

const iso = (ms = 0) => new Date(Date.now() + ms).toISOString();
const practice = (id: string, date: string): Row => ({
  id,
  league_id: DEMO_LEAGUE,
  type: 'practica',
  name: '',
  date,
  start_time: null,
  games: 3,
  hcp_base: 0,
  hcp_percent: 0,
  individual_rank_by: null,
  team_rank_by: null,
  category_cuts: null,
  team_size: 1,
  announcement: '',
  player_count: 3,
  created_at: iso(-30 * 86_400_000),
});

function seed(): State {
  return {
    entries: [
      { id: '00000000-0000-7000-8000-00000000f201', league_id: DEMO_LEAGUE, event_id: EVENT, player_id: THIRD, team_id: null, average: 180, handicap_override: null, scores: [198, 176, null], photos: ['ok', 'ok', null], frames: null },
    ],
    submissions: [
      {
        id: '00000000-0000-7000-8000-00000000f301',
        league_id: DEMO_LEAGUE,
        player_id: OTHER,
        event_id: EVENT,
        date: null,
        scores: [181, 204],
        scanned: null,
        scanned_name: null,
        frames: null,
        photo_id: '00000000-0000-7000-8000-00000000f401',
        status: 'pendiente',
        note: null,
        created_by: null,
        created_at: iso(-20 * 60_000),
        reviewed_at: null,
        reviewed_by: null,
      },
    ],
  };
}

function load(): State {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as State;
  } catch {
    // sin sessionStorage: lo de fábrica
  }
  return seed();
}

function save(s: State) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // sin sessionStorage
  }
}

export function forgetDemoLeague() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // sin sessionStorage
  }
}

/** Las filas fijas (la liga, los jugadores, la práctica de hoy) y lo que cambia (planilla y envíos). */
function tables(uid: string): Record<string, Row[]> {
  const s = load();
  return {
    leagues: [
      {
        id: DEMO_LEAGUE,
        sport: 'bowling',
        kind: 'liga',
        visibility: 'private',
        name: 'Liga de Ejemplo',
        owner_id: uid,
        venue: 'Bolera de Ejemplo',
        schedule: 'Martes 7:00 p. m.',
        season_start: null,
        season_end: null,
        contact_name: '',
        contact_phone: '',
        require_photo: true,
        has_minors: false,
        tz: 'America/Santo_Domingo',
        logo_path: null,
        created_at: iso(-60 * 86_400_000),
      },
    ],
    memberships: [{ league_id: DEMO_LEAGUE, user_id: uid, role: 'owner', is_scorer: false, display_name: 'Juan Pérez', player_id: ME_PLAYER, scorer_only: false }],
    players: [
      { id: ME_PLAYER, league_id: DEMO_LEAGUE, user_id: uid, name: 'Juan Pérez', average_override: null, is_minor: false },
      { id: OTHER, league_id: DEMO_LEAGUE, user_id: null, name: 'Jugador Uno', average_override: null, is_minor: false },
      { id: THIRD, league_id: DEMO_LEAGUE, user_id: null, name: 'Jugadora Dos', average_override: null, is_minor: false },
    ],
    events: [
      practice(PAST[0], dayAgo(14)),
      practice(PAST[1], dayAgo(7)),
      {
        id: EVENT,
        league_id: DEMO_LEAGUE,
        type: 'practica',
        name: '',
        date: toIsoDate(new Date()),
        start_time: null,
        games: 3,
        hcp_base: 0,
        hcp_percent: 0,
        individual_rank_by: null,
        team_rank_by: null,
        category_cuts: null,
        team_size: 1,
        announcement: '',
        player_count: 3,
        created_at: iso(-86_400_000),
      },
    ],
    entries: [...PAST_ENTRIES, ...s.entries],
    submissions: s.submissions,
    // Las pistas de hoy, ya publicadas: tú en la 7 con Jugador Uno.
    event_lanes: [
      { event_id: EVENT, player_id: ME_PLAYER, lane: 7, position: 1, published_at: iso(-3_600_000) },
      { event_id: EVENT, player_id: OTHER, lane: 7, position: 2, published_at: iso(-3_600_000) },
      { event_id: EVENT, player_id: THIRD, lane: 8, position: 1, published_at: iso(-3_600_000) },
    ],
  };
}

type Filter = { col: string; op: string; value: unknown };

/** Las filas de una tabla de la liga ficticia con los filtros más comunes (eq e in); null si no es de la liga. */
export function demoLeagueSelect(uid: string, table: string, filters: readonly Filter[] = []): Row[] | null {
  const all = tables(uid)[table];
  if (!all) return null;
  return all.filter((r) =>
    filters.every((f) => {
      if (f.op === 'eq') return r[f.col] === f.value;
      if (f.op === 'in') return Array.isArray(f.value) && f.value.includes(r[f.col]);
      return true;
    }),
  );
}

/** Las RPC de la liga ficticia: enviar, aprobar y rechazar. undefined si no es de la liga. */
export function demoLeagueRpc(uid: string, fn: string, a: Record<string, unknown>): unknown {
  const s = load();
  if (fn === 'submit_games') {
    if (a.p_league !== DEMO_LEAGUE) return undefined;
    s.submissions.push({
      id: a.p_id,
      league_id: DEMO_LEAGUE,
      player_id: a.p_player,
      event_id: a.p_event,
      date: a.p_date ?? null,
      scores: a.p_scores,
      scanned: a.p_scanned ?? null,
      scanned_name: null,
      frames: a.p_frames ?? null,
      photo_id: a.p_photo ?? null,
      status: 'pendiente',
      note: null,
      created_by: uid,
      created_at: iso(),
      reviewed_at: null,
      reviewed_by: null,
    });
    save(s);
    return a.p_id;
  }
  if (fn === 'approve_submission' || fn === 'reject_submission') {
    const sub = s.submissions.find((x) => x.id === a.p_submission);
    if (!sub) return undefined;
    sub.status = fn === 'approve_submission' ? 'aprobado' : 'rechazado';
    sub.reviewed_at = iso();
    if (fn === 'reject_submission') sub.note = a.p_note ?? null;
    if (fn === 'approve_submission') {
      const values = (a.p_values ?? {}) as Record<string, number>;
      let entry = s.entries.find((e) => e.event_id === EVENT && e.player_id === sub.player_id);
      if (!entry) {
        entry = { id: `00000000-0000-7000-8000-${String(Date.now()).slice(-12)}`, league_id: DEMO_LEAGUE, event_id: EVENT, player_id: sub.player_id, team_id: null, average: Number(a.p_average ?? 0), handicap_override: null, scores: [null, null, null], photos: [null, null, null], frames: null };
        s.entries.push(entry);
      }
      const scores = [...((entry.scores as (number | null)[]) ?? [])];
      const photos = [...((entry.photos as (string | null)[]) ?? [])];
      for (const [i, v] of Object.entries(values)) {
        scores[+i] = v;
        photos[+i] = (sub.photo_id as string | null) ?? 'sin-foto';
      }
      entry.scores = scores;
      entry.photos = photos;
    }
    save(s);
    return fn === 'approve_submission' ? { entry_id: 'demo', event_id: EVENT } : null;
  }
  return undefined;
}
