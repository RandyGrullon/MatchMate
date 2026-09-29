/**
 * Carga un torneo histórico (JSON sacado del Excel) dentro de una liga de MatchMate, con las RPC de verdad
 * (como un admin de la liga desde la app). Es el scripts/importar-torneo.mjs de BowlingX pasado a Supabase.
 * Los juegos quedan anotados sin foto ('sin-foto'): cuentan en la tabla y el promedio como siempre. 'importado' (juego
 * validado, B2) solo lo escribe el importador de BowlingX con la clave secreta; desde una sesión de admin la base no lo
 * acepta (update_entry, …1110): un admin no puede validar juegos que él mismo escribe.
 *
 * El archivo:
 *   {
 *     "event": { "id": "torneo-2025", "type": "torneo", "name": "Torneo 2025", "date": "2025-11-15", "games": 3,
 *                "hcpBase": 230, "hcpPercent": 80, "individualRankBy": "hcp", "teamRankBy": "scratch",
 *                "categoryCuts": [200, 175, 160], "teamSize": 3 },
 *     "teams": ["Los Strikes", "Los Spares"],
 *     "players": [{ "name": "Ana Pérez", "average": 180, "handicap": 40, "team": "Los Strikes", "scores": [190, 175, 201] }]
 *   }
 *
 * - El evento lleva un uuid fijo (del id del archivo): si ya existe (o hay otro con el mismo nombre y fecha)
 *   no se toca, salvo con `replace` (se borra con sus juegos y se carga de nuevo).
 * - Reusa los jugadores de la liga con el mismo nombre (sin acentos ni mayúsculas); crea los que falten.
 * - El handicap se guarda fijo solo si no es el de la fórmula.
 */
import { calcHandicap, normalizeName, slots } from '../../src/lib/stats';
import type { Backend } from '../../src/lib/backend/types';
import { uuidv5 } from './ids';

export interface TournamentFile {
  event: {
    id: string;
    type?: 'torneo' | 'practica';
    name: string;
    date: string;
    games: number;
    hcpBase: number;
    hcpPercent: number;
    individualRankBy?: 'hcp' | 'scratch' | null;
    teamRankBy?: 'hcp' | 'scratch' | null;
    categoryCuts?: [number, number, number] | null;
    teamSize?: number | null;
  };
  teams: string[];
  players: { name: string; average: number; handicap: number; team?: string | null; scores: (number | null)[] }[];
}

export interface TournamentResult {
  eventId: string;
  /** Jugadores nuevos en la liga. */
  created: number;
  /** Inscritos en el torneo. */
  entered: number;
  teams: number;
  /** Se borró uno que ya estaba. */
  replaced: boolean;
}

/** Uuid del evento: el mismo archivo en la misma liga da siempre el mismo. */
export const tournamentEventId = (leagueId: string, fileEventId: string) => uuidv5(`tournament/${leagueId}/${fileEventId}`);

/** Revisa el archivo antes de tocar nada; devuelve la lista de problemas (vacía si sirve). */
export function checkTournamentFile(data: unknown): string[] {
  const d = data as Partial<TournamentFile> | null;
  const out: string[] = [];
  const ev = d?.event;
  if (!ev || typeof ev !== 'object') return ['falta "event"'];
  if (!ev.id || typeof ev.id !== 'string') out.push('event.id vacío');
  if (!ev.name || typeof ev.name !== 'string') out.push('event.name vacío');
  if (typeof ev.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ev.date)) out.push('event.date tiene que ser AAAA-MM-DD');
  if (!Number.isInteger(ev.games) || ev.games! < 1 || ev.games! > 10) out.push('event.games tiene que ser de 1 a 10');
  if (ev.type && ev.type !== 'torneo' && ev.type !== 'practica') out.push('event.type: torneo o practica');
  if (!Array.isArray(d?.teams)) out.push('falta "teams" (puede ser [])');
  if (!Array.isArray(d?.players) || !d.players.length) out.push('falta "players"');
  (d?.players ?? []).forEach((p, i) => {
    if (!p?.name?.trim()) out.push(`players[${i}]: sin nombre`);
    if (typeof p?.average !== 'number' || p.average < 0 || p.average > 300) out.push(`players[${i}] ${p?.name}: promedio de 0 a 300`);
    if (!Array.isArray(p?.scores) || p.scores.some((s) => s != null && (!Number.isInteger(s) || s < 0 || s > 300))) {
      out.push(`players[${i}] ${p?.name}: pinos de 0 a 300 (o null)`);
    } else if (p.scores.length > (ev.games ?? 10)) out.push(`players[${i}] ${p?.name}: más juegos que el evento`);
    if (p?.team && Array.isArray(d?.teams) && !d.teams.includes(p.team)) out.push(`players[${i}] ${p.name}: el equipo «${p.team}» no está en "teams"`);
  });
  return out;
}

export async function importTournament(
  b: Backend,
  leagueId: string,
  data: TournamentFile,
  opts: { replace?: boolean; log?: (msg: string) => void } = {},
): Promise<TournamentResult> {
  const log = opts.log ?? (() => undefined);
  const problems = checkTournamentFile(data);
  if (problems.length) throw new Error(`El archivo no sirve:\n- ${problems.join('\n- ')}`);
  const { event, teams, players } = data;

  const [league] = await b.select<{ id: string; name: string }>({ table: 'leagues', columns: 'id,name', filters: [{ col: 'id', op: 'eq', value: leagueId }] });
  if (!league) throw new Error(`No existe la liga ${leagueId} (o tu cuenta no la puede ver).`);
  log(`Liga: ${league.name}`);

  // ¿Ya está? Por su uuid o por el mismo nombre y fecha (p. ej. uno que vino de BowlingX en la migración).
  const eventId = tournamentEventId(leagueId, event.id);
  const sameDay = await b.select<{ id: string; name: string }>({
    table: 'events',
    columns: 'id,name',
    filters: [
      { col: 'league_id', op: 'eq', value: leagueId },
      { col: 'date', op: 'eq', value: event.date },
    ],
  });
  const old = sameDay.filter((e) => e.id === eventId || normalizeName(e.name) === normalizeName(event.name));
  if (old.length && !opts.replace) {
    throw new Error(`El torneo «${event.name}» (${event.date}) ya está en la liga. Usa --reemplazar para volver a cargarlo.`);
  }
  for (const e of old) await b.rpc('delete_event', { p_event: e.id });

  await b.rpc('create_event', {
    p_league: leagueId,
    p_type: event.type ?? 'torneo',
    p_date: event.date,
    p_name: event.name.trim(),
    p_games: event.games,
    p_hcp_base: event.hcpBase,
    p_hcp_percent: event.hcpPercent,
    p_individual_rank_by: event.individualRankBy ?? null,
    p_team_rank_by: event.teamRankBy ?? null,
    // Sin cortes en el archivo: los de siempre (200/175/160), igual que la app.
    p_category_cuts: event.categoryCuts ?? undefined,
    p_team_size: event.teamSize ?? 3,
    p_announcement: '',
    p_id: eventId,
  });

  // Jugadores: reusa los de la liga con el mismo nombre; crea los que falten.
  const existing = await b.select<{ id: string; name: string }>({ table: 'players', columns: 'id,name', filters: [{ col: 'league_id', op: 'eq', value: leagueId }] });
  const byName = new Map(existing.map((p) => [normalizeName(p.name), p.id]));
  const ids: string[] = [];
  let created = 0;
  for (const p of players) {
    let id = byName.get(normalizeName(p.name));
    if (!id) {
      id = await b.rpc<string>('create_player', { p_league: leagueId, p_name: p.name.trim() });
      byName.set(normalizeName(p.name), id);
      created++;
    }
    ids.push(id);
  }
  // El mismo jugador dos veces en el archivo: cuenta una sola inscripción (la primera).
  const seen = new Set<string>();
  const rows = players.map((p, i) => ({ p, id: ids[i] })).filter(({ id }) => !seen.has(id) && !!seen.add(id));
  const entered = await b.rpc<number>('add_entries', { p_event: eventId, p_players: rows.map(({ p, id }) => ({ player_id: id, average: p.average })) });

  const entries = await b.select<{ id: string; player_id: string }>({
    table: 'entries',
    columns: 'id,player_id',
    filters: [{ col: 'event_id', op: 'eq', value: eventId }],
  });
  const entryOf = new Map(entries.map((e) => [e.player_id, e.id]));

  if (teams.length) {
    await b.rpc('apply_teams', {
      p_event: eventId,
      p_groups: teams.map((name) => ({
        team_id: null,
        name,
        entry_ids: rows.filter(({ p }) => p.team === name).map(({ id }) => entryOf.get(id)),
      })),
    });
  }

  await b.rpc('update_entries', {
    p_patches: rows.map(({ p, id }) => {
      const scores = slots(p.scores, event.games, null);
      const formula = calcHandicap(p.average, event.hcpBase, event.hcpPercent);
      return {
        id: entryOf.get(id),
        patch: {
          scores,
          photos: scores.map((s) => (s == null ? null : 'sin-foto')),
          handicap_override: p.handicap === formula ? null : p.handicap,
        },
      };
    }),
  });

  return { eventId, created, entered, teams: teams.length, replaced: old.length > 0 };
}
