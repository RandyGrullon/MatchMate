/**
 * «Inscribir» y «Armar grupos» de una ronda de golf sin React (lo usan GolfPlayers.tsx de la web y las hojas de la app):
 * quiénes quedan por inscribir, repartir de a 4 por handicap, el grupo de cada tarjeta y, con salida simultánea, el
 * hoyo por el que sale cada grupo.
 */
import type { GolfCardDoc } from '../../../lib/data/golf';

/** Los jugadores de la liga que todavía no están en la ronda y cuyo nombre lleva lo buscado. */
export function playersToAdd<P extends { id: string; name: string }>(players: readonly P[], cards: readonly Pick<GolfCardDoc, 'playerId'>[], query: string): P[] {
  const inside = new Set(cards.map((c) => c.playerId));
  const q = query.trim().toLowerCase();
  return players.filter((p) => !inside.has(p.id) && p.name.toLowerCase().includes(q));
}

/** Hasta cuántos jugadores lleva un grupo. */
export const GROUP_MAX = 4;

/** Reparte en grupos de hasta 4 por handicap de juego (los de handicap parecido juntos). */
export function autoGroups<T extends { id: string; playingHcp: number }>(cards: readonly T[]): Map<string, number> {
  const sorted = [...cards].sort((a, b) => a.playingHcp - b.playingHcp);
  const count = Math.ceil(sorted.length / GROUP_MAX);
  const out = new Map<string, number>();
  // Tamaños parejos: con 10 jugadores, 4 + 3 + 3 (no 4 + 4 + 2).
  let k = 0;
  for (let g = 0; g < count; g++) {
    const size = Math.floor(sorted.length / count) + (g < sorted.length % count ? 1 : 0);
    for (let i = 0; i < size; i++) out.set(sorted[k++].id, g + 1);
  }
  return out;
}

/** El grupo de cada tarjeta (id → grupo o null) y el hoyo de salida de cada grupo. */
export interface GroupsDraft {
  groupOf: Record<string, number | null>;
  startOf: Record<number, number>;
}

/** Al abrir «Armar grupos»: lo que ya tienen las tarjetas. */
export function groupsDraft(cards: readonly Pick<GolfCardDoc, 'id' | 'groupNo' | 'startHole'>[]): GroupsDraft {
  const startOf: Record<number, number> = {};
  for (const c of cards) if (c.groupNo != null) startOf[c.groupNo] = c.startHole;
  return { groupOf: Object.fromEntries(cards.map((c) => [c.id, c.groupNo])), startOf };
}

/**
 * «Repartir de a 4 por handicap»: los grupos de `autoGroups` y, con salida simultánea, cada grupo por un hoyo (de dos
 * en dos: 1, 3, 5…). Sin salida simultánea los hoyos de salida no cambian (`startOf` null).
 */
export function autoDraft(
  cards: readonly Pick<GolfCardDoc, 'id' | 'playingHcp'>[],
  holeNumbers: readonly number[],
  shotgun: boolean,
): { groupOf: Record<string, number | null>; startOf: Record<number, number> | null } {
  const auto = autoGroups(cards);
  const first = holeNumbers[0] ?? 1;
  const groupOf = Object.fromEntries(cards.map((c) => [c.id, auto.get(c.id) ?? null]));
  if (!shotgun) return { groupOf, startOf: null };
  const startOf: Record<number, number> = {};
  [...new Set(auto.values())].forEach((g, i) => (startOf[g] = holeNumbers[(i * 2) % Math.max(1, holeNumbers.length)] ?? first));
  return { groupOf, startOf };
}

/**
 * Cómo van los grupos: hasta qué número se ofrece (la mitad de los inscritos, o el más alto que ya se usa), los que se
 * usan (en orden) y si alguno tiene más de 4.
 */
export function groupsState(cardCount: number, groupOf: Record<string, number | null>): { maxGroup: number; used: number[]; tooBig: boolean } {
  const maxGroup = Math.max(1, Math.ceil(cardCount / 2), ...Object.values(groupOf).map((g) => g ?? 0));
  const sizes = new Map<number, number>();
  for (const g of Object.values(groupOf)) if (g != null) sizes.set(g, (sizes.get(g) ?? 0) + 1);
  return { maxGroup, used: [...sizes.keys()].sort((a, b) => a - b), tooBig: [...sizes.values()].some((n) => n > GROUP_MAX) };
}

/** Lo que se guarda: el grupo de cada tarjeta y, con salida simultánea, su hoyo (el primero si no se eligió). */
export function groupsPayload(
  cards: readonly Pick<GolfCardDoc, 'id'>[],
  draft: GroupsDraft,
  shotgun: boolean,
  first: number,
): { cardId: string; groupNo: number | null; startHole: number | null }[] {
  return cards.map((c) => {
    const g = draft.groupOf[c.id] ?? null;
    return { cardId: c.id, groupNo: g, startHole: g != null && shotgun ? (draft.startOf[g] ?? first) : null };
  });
}
