/**
 * Individual o dobles: en tenis y pickleball la misma liga puede tener partidos de los dos (una liga de
 * individuales y una escalera de dobles, por ejemplo), y las estadísticas y el ranking van por separado.
 * Un partido es de dobles si algún lado tiene dos jugadores (los del partido o, si no hay, los de la pareja), o
 * si sus reglas dicen dobles. Puro.
 */
import type { Match, MatchSide } from '../../../../lib/data/matches';

export type Modality = 'individual' | 'dobles';

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

const sideSize = (s: MatchSide, rosterOf?: (teamId: string) => readonly string[]) =>
  s.players.length || (s.teamId && rosterOf ? rosterOf(s.teamId).length : 0) || (s.teamId ? 2 : 0);

/** El partido es de dobles. */
export function isDoublesMatch(m: Pick<Match, 'sides' | 'rules'>, rosterOf?: (teamId: string) => readonly string[]): boolean {
  const byPlayers = m.sides.some((s) => sideSize(s, rosterOf) >= 2);
  if (byPlayers) return true;
  const rules = isObj(m.rules) && isObj(m.rules.match) ? m.rules.match : null;
  // Sin jugadores todavía (cuadro por definir): lo que digan sus reglas.
  if (rules && m.sides.every((s) => sideSize(s, rosterOf) === 0)) return rules.doubles === true;
  return false;
}

export const modalityOf = (m: Pick<Match, 'sides' | 'rules'>, rosterOf?: (teamId: string) => readonly string[]): Modality =>
  isDoublesMatch(m, rosterOf) ? 'dobles' : 'individual';

/** Separa los partidos por modalidad (en el mismo orden). */
export function byModality<M extends Pick<Match, 'sides' | 'rules'>>(list: readonly M[], rosterOf?: (teamId: string) => readonly string[]): Record<Modality, M[]> {
  const out: Record<Modality, M[]> = { individual: [], dobles: [] };
  for (const m of list) out[modalityOf(m, rosterOf)].push(m);
  return out;
}

export const MODALITY_LABEL: Record<Modality, string> = { individual: 'Individual', dobles: 'Dobles' };
