/**
 * Solo en la demostración en memoria (demoBackend.ts, /dev/empresa): `profile_stats` (la pestaña «Estadísticas» del
 * perfil y el resumen por deporte de Yo), con la misma forma que la base (ProfileStats de src/lib/data/profileGames.ts).
 * El boliche sale de los juegos de la cuenta de prueba en las ligas ficticias (una serie por evento); los partidos son
 * números fijos y descaradamente ficticios. No guarda nada (lee las tablas de las otras capas): sin clave ni `forget`.
 */
import type { ProfileStats } from '@mm/lib/data/profileGames';

type Row = Record<string, unknown>;
type Read = (table: string) => Row[];

/** Los partidos de ejemplo de la cuenta de prueba (ficticios). */
const DEMO_MATCHES: ProfileStats['matches'] = [{ sport: 'padel', played: 5, won: 3, lost: 2, drawn: 0 }];

/** Las series de boliche de la cuenta: los juegos de cada evento de sus jugadores (sin los vacíos). */
function bowlingOf(uid: string, read: Read): ProfileStats['bowling'] {
  const mine = new Set(read('memberships').flatMap((m) => (m.user_id === uid && typeof m.player_id === 'string' ? [m.player_id] : [])));
  const series = read('entries')
    .filter((e) => typeof e.player_id === 'string' && mine.has(e.player_id))
    .map((e) => (Array.isArray(e.scores) ? e.scores.filter((s): s is number => typeof s === 'number' && Number.isFinite(s)) : []))
    .filter((s) => s.length > 0);
  return series.length ? { sessions: series.length, series } : null;
}

/** `profile_stats` de la cuenta de prueba; undefined si es otra función u otra cuenta (esa llega vacía, como sin ligas en común). */
export function statsRpc(uid: string, fn: string, a: Record<string, unknown>, read: Read): unknown {
  if (fn !== 'profile_stats' || a.p_user !== uid) return undefined;
  const stats: ProfileStats = { bowling: bowlingOf(uid, read), matches: DEMO_MATCHES, golf: null, swim: null };
  return stats;
}
