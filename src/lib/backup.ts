import { select } from './data/client';
import { toIsoDate } from './format';

/**
 * Respaldo en JSON (gratis, sin plan de pago), leído de Postgres con los permisos de quien lo baja: el admin
 * baja su liga; el superadmin, todo. Las filas van tal cual están en la base (snake_case). Las fotos no (pesan
 * mucho y están en Storage); los juegos guardan qué foto los verificó.
 */
const LEAGUE_TABLES = [
  'players',
  'player_private',
  'events',
  'teams',
  'event_rsvps',
  'entries',
  'submissions',
  'reactions',
  'comments',
  'suggestions',
  'memberships',
  // Partidos (raqueta y equipos), equipos de temporada, convocatorias, escaleras y sanciones.
  'matches',
  'match_sides',
  'match_players',
  'team_players',
  'match_rsvps',
  'match_officials',
  'ladder_rungs',
  'ladder_challenges',
  'football_sanctions',
  // Golf y natación.
  'golf_courses',
  'golf_tournaments',
  'golf_rounds',
  'golf_cards',
  'swim_clubs',
  'swim_swimmers',
  'swim_meets',
  'swim_events',
  'swim_entries',
] as const;

async function leagueData(lid: string) {
  const out: Record<string, unknown[]> = {};
  for (const table of LEAGUE_TABLES) {
    // Lo que no se puede leer (p. ej. datos privados sin ser admin) queda vacío en vez de romper el respaldo.
    out[table] = await select<Record<string, unknown>>({ table, filters: [{ col: 'league_id', op: 'eq', value: lid }] }).catch((e) => {
      console.warn('[respaldo]', table, e);
      return [];
    });
  }
  return out;
}

function download(data: object, name: string) {
  const blob = new Blob([JSON.stringify({ app: 'MatchMate', version: 2, exportedAt: new Date().toISOString(), ...data }, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `matchmate-${name}-${toIsoDate(new Date())}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'liga';

/** Admin de la liga: descarga todos sus datos en un JSON. */
export async function downloadLeagueBackup(league: { id: string; name: string }) {
  const [row] = await select<Record<string, unknown>>({ table: 'leagues', filters: [{ col: 'id', op: 'eq', value: league.id }] });
  const data = await leagueData(league.id);
  download({ league: row ?? { ...league }, ...data }, slug(league.name));
  return { players: data.players.length, events: data.events.length, entries: data.entries.length };
}

/** Superadmin: todas las ligas y las cuentas. */
export async function downloadFullBackup() {
  const leagues = await select<Record<string, unknown> & { id: string }>({ table: 'leagues' });
  const all = [];
  for (const l of leagues) all.push({ ...l, ...(await leagueData(l.id)) });
  const users = await select<Record<string, unknown>>({ table: 'profiles' });
  download({ leagues: all, users }, 'completo');
  return { leagues: leagues.length, users: users.length };
}
