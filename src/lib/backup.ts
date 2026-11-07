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
  // Pistas del boliche.
  'event_lanes',
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
  'event_signups',
  'league_announcements',
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
  // Temporadas con sus premios y tablas guardadas, y los playoffs con su llave.
  'seasons',
  'season_awards',
  'playoffs',
  'playoff_series',
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

/** El respaldo armado: el nombre del archivo y su texto (el JSON). La web lo descarga; la app del teléfono lo comparte. */
export interface BackupFile {
  name: string;
  text: string;
}

/** «matchmate-liga-norte-2026-10-12.json» y el JSON con la marca de la app, la versión y cuándo se hizo. */
export function backupFile(data: object, name: string, now: Date = new Date()): BackupFile {
  return {
    name: `matchmate-${name}-${toIsoDate(now)}.json`,
    text: JSON.stringify({ app: 'MatchMate', version: 2, exportedAt: now.toISOString(), ...data }, null, 2),
  };
}

function download(file: BackupFile) {
  const blob = new Blob([file.text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'liga';

/** Admin de la liga: todos sus datos en un JSON (sin descargarlo) y cuánto lleva. */
export async function leagueBackup(league: { id: string; name: string }, now: Date = new Date()) {
  const [row] = await select<Record<string, unknown>>({ table: 'leagues', filters: [{ col: 'id', op: 'eq', value: league.id }] });
  const data = await leagueData(league.id);
  return {
    file: backupFile({ league: row ?? { ...league }, ...data }, slug(league.name), now),
    counts: { players: data.players.length, events: data.events.length, entries: data.entries.length },
  };
}

/** Admin de la liga: descarga todos sus datos en un JSON. */
export async function downloadLeagueBackup(league: { id: string; name: string }) {
  const { file, counts } = await leagueBackup(league);
  download(file);
  return counts;
}

/** Superadmin: todas las ligas y las cuentas. */
export async function downloadFullBackup() {
  const leagues = await select<Record<string, unknown> & { id: string }>({ table: 'leagues' });
  const all = [];
  for (const l of leagues) all.push({ ...l, ...(await leagueData(l.id)) });
  const users = await select<Record<string, unknown>>({ table: 'profiles' });
  download(backupFile({ leagues: all, users }, 'completo'));
  return { leagues: leagues.length, users: users.length };
}
