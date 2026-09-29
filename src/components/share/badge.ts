import { resolvePalette } from '../../badges/visual/palette';
import type { BadgeLook } from '../../badges/visual/types';
import type { ShareBadgeSpec } from './cards';

/** Lo que hace falta para la tarjeta de una insignia (lo arma src/components/badges con el catálogo). */
export interface BadgeShareInput {
  name: string;
  look: BadgeLook;
  /** «Oro · Octubre 2026». */
  levelLine: string;
  description: string;
  /** Quién la ganó. */
  player: string;
  league?: string | null;
  /** Rareza («Solo el 4 % …») u «Otorgada por …». */
  footnote?: string | null;
  /** Texto que va con la imagen (sin el link). */
  caption?: string;
}

/** La tarjeta para compartir una insignia (docs/insignias.md §4.9). El nivel va en el color de su cinta. */
export function badgeShare(i: BadgeShareInput): ShareBadgeSpec {
  return {
    kind: 'badge',
    title: i.name,
    look: i.look,
    levelLine: i.levelLine,
    levelColor: resolvePalette(i.look).ribbon,
    description: i.description,
    player: i.player,
    ...(i.league ? { league: i.league } : {}),
    ...(i.footnote ? { footnote: i.footnote } : {}),
    ...(i.caption ? { caption: i.caption } : {}),
  };
}
