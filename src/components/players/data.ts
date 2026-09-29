import { createPlayer, type MinorInput } from '../../lib/data/players';
import { invalidate, rpc, select, useLive, type Live } from '../../lib/data/client';
import { tags } from '../../lib/data/keys';
import { setGolfIndex } from '../../lib/data/golf';
import { setLevel } from '../../pages/sports/racket/levels';
import type { RacketSport } from '../../sports/racket';
import { readTeamPrefs, statKind, withTeamPrefs, type MinorLine, type PlayerStatsInput, type TeamPrefs } from './logic';

/** attrs de cada jugador de la liga (id → attrs): el número del deporte que sale en la lista. */
export async function fetchPlayerAttrs(lid: string): Promise<Record<string, unknown>> {
  const rows = await select<{ id: string; attrs: unknown }>({
    table: 'players',
    columns: 'id,attrs',
    filters: [{ col: 'league_id', op: 'eq', value: lid }],
  });
  const out: Record<string, unknown> = {};
  for (const r of rows) out[r.id] = r.attrs;
  return out;
}

export const usePlayerAttrs = (lid: string | undefined): Live<Record<string, unknown>> =>
  useLive<Record<string, unknown>>(lid ? `players:attrs:${lid}` : null, lid ? { kind: 'playerAttrs', lid } : null, () => fetchPlayerAttrs(lid!), {
    initial: {},
    tags: lid ? [tags.league(lid), tags.players(lid)] : [],
  });

/** Admin: posición y dorsal preferidos (players.attrs.team). Conserva lo demás de attrs. */
export async function setTeamPrefs(lid: string, playerId: string, prefs: TeamPrefs) {
  const rows = await select<{ id: string; attrs: unknown }>({ table: 'players', columns: 'id,attrs', filters: [{ col: 'id', op: 'eq', value: playerId }] });
  const current = rows[0]?.attrs;
  const before = readTeamPrefs(current);
  if (before.position === prefs.position && before.jersey === prefs.jersey) return;
  await rpc('update_player', { p_player: playerId, p_patch: { attrs: withTeamPrefs(current, prefs) } });
  invalidate(tags.players(lid));
}

/**
 * Guarda el número del deporte de un jugador (el promedio del boliche va con el nombre, en create/update_player).
 * `before`: lo que tenía (al editar), para no escribir lo que no cambió.
 */
export async function saveSportStats(lid: string, sport: string, playerId: string, stats: PlayerStatsInput, before?: PlayerStatsInput) {
  const kind = statKind(sport);
  if (kind === 'racket') {
    if (before ? before.level !== stats.level : stats.level != null) await setLevel(lid, playerId, sport as RacketSport, stats.level);
  } else if (kind === 'golf') {
    if (before ? before.index !== stats.index : stats.index != null) await setGolfIndex(lid, playerId, stats.index);
  } else if (kind === 'team') {
    if (before ? before.position !== stats.position || before.jersey !== stats.jersey : stats.position != null || stats.jersey != null)
      await setTeamPrefs(lid, playerId, { position: stats.position, jersey: stats.jersey });
  }
}

/**
 * Admin: agrega a alguien sin cuenta con el número de su deporte (y, si es menor, con su tutor y el permiso). Si
 * el jugador entra pero su número no se guarda, `statsSaved` es false (queda en la lista y se corrige al editarlo).
 */
export async function addPlayerWithStats(
  lid: string,
  sport: string,
  name: string,
  stats: PlayerStatsInput,
  minor: MinorInput | null = null,
): Promise<{ id: string; statsSaved: boolean }> {
  const id = await createPlayer(lid, name, statKind(sport) === 'bowling' ? stats.averageOverride : null, minor);
  try {
    await saveSportStats(lid, sport, id, stats);
    return { id, statsSaved: true };
  } catch (e) {
    console.error(e);
    return { id, statsSaved: false };
  }
}

/** Admin: agrega varios sin cuenta, uno tras otro. Devuelve cuántos entraron y los que fallaron. */
export async function addManyPlayers(lid: string, names: readonly string[]): Promise<{ added: number; failed: string[] }> {
  let added = 0;
  const failed: string[] = [];
  for (const n of names) {
    try {
      await createPlayer(lid, n, null);
      added++;
    } catch (e) {
      console.error(e);
      failed.push(n);
    }
  }
  return { added, failed };
}

/**
 * Admin: agrega varios menores sin cuenta, cada uno con su tutor (`consent`: los tutores dieron permiso). Devuelve
 * cuántos entraron y los que fallaron.
 */
export async function addManyMinors(lid: string, rows: readonly MinorLine[], consent: boolean): Promise<{ added: number; failed: string[] }> {
  let added = 0;
  const failed: string[] = [];
  for (const r of rows) {
    try {
      await createPlayer(lid, r.name, null, { guardianName: r.guardianName, guardianPhone: r.guardianPhone || null, consent });
      added++;
    } catch (e) {
      console.error(e);
      failed.push(r.name);
    }
  }
  return { added, failed };
}
