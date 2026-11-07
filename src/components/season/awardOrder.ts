/**
 * El orden de los premios de una temporada cerrada (el campeón arriba), sin pantallas (puro). Lo usan SeasonSelect.tsx
 * de la web (SeasonAwardsCard) y la app del teléfono (movil/).
 */
import type { SeasonAward } from '../../lib/seasons';

export const AWARD_ORDER: Readonly<Record<SeasonAward['kind'], number>> = {
  campeon: 0,
  subcampeon: 1,
  tercero: 2,
  mvp: 3,
  mas_mejorado: 4,
  fair_play: 5,
  otro: 6,
};

/** Los premios en su orden, y el campeón aparte (null si no hay). */
export function sortedAwards<A extends Pick<SeasonAward, 'kind'>>(awards: readonly A[]): { champion: A | null; rest: A[] } {
  const list = [...awards].sort((a, b) => AWARD_ORDER[a.kind] - AWARD_ORDER[b.kind]);
  const champion = list.find((a) => a.kind === 'campeon') ?? null;
  return { champion, rest: list.filter((a) => a !== champion) };
}
