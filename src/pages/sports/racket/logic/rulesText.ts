/** Las reglas del partido en palabras («Punto de oro · al mejor de 3 · el 3.º a súper tie-break a 10»). Puro. */
import { RULE_PRESETS, type RacketRules, type RacketSport, type RulePreset } from '../../../../sports/racket';

const DEUCE: Record<string, string> = { golden: 'Punto de oro', ad: 'Con ventaja', noad: 'Sin ventaja', star: 'Star Point' };
const ORD: Record<number, string> = { 1: '1.º', 2: '2.º', 3: '3.º', 4: '4.º', 5: '5.º' };

export function rulesText(r: RacketRules): string {
  if (r.sport === 'pickleball') {
    const parts = [
      r.doubles ? 'Dobles' : 'Individual',
      r.bestOf === 1 ? `un juego a ${r.gameTo}` : `al mejor de ${r.bestOf} juegos a ${r.gameTo}`,
      r.winBy === 2 ? 'ganando por 2' : 'ganando por 1',
      r.scoring === 'rally' ? 'conteo por rally' : 'solo puntúa el que saca',
    ];
    return parts.join(' · ');
  }
  const parts = [r.deuce === 'star' ? `Star Point (${r.starAdvantages} ventaja${r.starAdvantages === 1 ? '' : 's'})` : DEUCE[r.deuce]];
  parts.push(r.bestOf === 1 ? 'a un set' : `al mejor de ${r.bestOf}`);
  if (r.gamesPerSet !== 6) parts.push(`sets a ${r.gamesPerSet}`);
  if (r.tiebreakAt === null) parts.push('sin tie-break');
  if (r.finalSet === 'tiebreak' && r.bestOf > 1) parts.push(`el ${ORD[r.bestOf] ?? r.bestOf} a súper tie-break a ${r.finalTiebreakTo}`);
  return parts.filter(Boolean).join(' · ');
}

/** La plantilla que coincide con estas reglas (o null si son a medida). */
export function presetOf(sport: RacketSport, r: RacketRules): RulePreset | null {
  const list = RULE_PRESETS[sport] as RulePreset[];
  const same = (a: RacketRules, b: RacketRules) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
  return list.find((p) => same(p.rules, r)) ?? null;
}

export const presetsOf = (sport: RacketSport) => RULE_PRESETS[sport] as RulePreset[];
