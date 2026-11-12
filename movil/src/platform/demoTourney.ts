/**
 * Solo en la demostración en memoria (demoBackend.ts, /dev/empresa): un torneo de boliche sin liga, «Torneo Suelto de
 * Ejemplo», para ver su inicio (la liga es el torneo: TournamentHome de la web). Lo organiza la cuenta de prueba; se
 * jugó ayer, individual y por scratch, con tres jugadores ficticios y sus juegos aprobados. Pone sus filas encima de
 * `leagues`, `memberships`, `players`, `events` y `entries` (solo mirar: no contesta RPC). Todos los datos son ficticios.
 */
import { toIsoDate } from '@mm/lib/format';

type Row = Record<string, unknown>;
type Filter = { col: string; op: string; value: unknown };
type Read = (table: string) => Row[] | null;

export const DEMO_TOURNEY = '00000000-0000-7000-8000-00000000b001';
const EVENT = '00000000-0000-7000-8000-00000000b0e1';
const PLAYER = (n: number) => `00000000-0000-7000-8000-00000000b10${n}`;
const DAY = 86_400_000;

function rows(uid: string): Record<string, Row[]> {
  const now = Date.now();
  const iso = (ms: number) => new Date(now + ms).toISOString();
  const yesterday = toIsoDate(new Date(now - DAY));
  const entry = (n: number, scores: number[]): Row => ({
    id: `00000000-0000-7000-8000-00000000b5${String(n).padStart(2, '0')}`,
    league_id: DEMO_TOURNEY,
    event_id: EVENT,
    player_id: PLAYER(n),
    team_id: null,
    average: 180,
    handicap_override: null,
    scores,
    photos: scores.map(() => 'ok'),
    frames: null,
  });
  return {
    leagues: [
      {
        id: DEMO_TOURNEY,
        sport: 'bowling',
        kind: 'torneo',
        visibility: 'private',
        name: 'Torneo Suelto de Ejemplo',
        owner_id: uid,
        venue: 'Bolera de Ejemplo',
        schedule: '',
        season_start: null,
        season_end: null,
        contact_name: 'Juan Pérez',
        contact_phone: '809-000-0000',
        require_photo: false,
        has_minors: false,
        tz: 'America/Santo_Domingo',
        logo_path: null,
        created_at: iso(-10 * DAY),
      },
    ],
    memberships: [{ league_id: DEMO_TOURNEY, user_id: uid, role: 'owner', is_scorer: false, display_name: 'Juan Pérez', player_id: PLAYER(1), scorer_only: false }],
    players: [
      { id: PLAYER(1), league_id: DEMO_TOURNEY, user_id: uid, name: 'Juan Pérez', average_override: null, is_minor: false },
      { id: PLAYER(2), league_id: DEMO_TOURNEY, user_id: null, name: 'Jugador Uno', average_override: null, is_minor: false },
      { id: PLAYER(3), league_id: DEMO_TOURNEY, user_id: null, name: 'Jugadora Dos', average_override: null, is_minor: false },
    ],
    events: [
      {
        id: EVENT,
        league_id: DEMO_TOURNEY,
        type: 'torneo',
        name: 'Torneo Suelto de Ejemplo',
        date: yesterday,
        start_time: null,
        games: 3,
        hcp_base: 0,
        hcp_percent: 0,
        individual_rank_by: 'scratch',
        team_rank_by: null,
        category_cuts: null,
        team_size: 1,
        announcement: '',
        player_count: 3,
        created_at: iso(-10 * DAY),
      },
    ],
    entries: [entry(1, [196, 211, 187]), entry(2, [178, 202, 190]), entry(3, [215, 181, 204])],
  };
}

const matches = (r: Row, filters: readonly Filter[]) =>
  filters.every((f) => {
    if (f.op === 'eq') return r[f.col] === f.value;
    if (f.op === 'in') return Array.isArray(f.value) && f.value.includes(r[f.col]);
    if (f.op === 'gt') return typeof r[f.col] === 'number' && (r[f.col] as number) > (f.value as number);
    return true;
  });

/** Las filas del torneo encima de las de abajo (`read`: la tabla con las otras capas, sin filtrar); null si no es suya. */
export function demoTourneySelect(uid: string, table: string, filters: readonly Filter[] = [], read: Read): Row[] | null {
  const mine = rows(uid)[table];
  if (!mine) return null;
  return [...(read(table) ?? []), ...mine].filter((r) => matches(r, filters));
}
