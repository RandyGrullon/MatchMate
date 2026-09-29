/**
 * Tipos del sistema visual de las insignias (docs/insignias.md §4). La forma dice la categoría, el metal dice el
 * nivel, y el color del campo y el emblema dicen el deporte.
 */
import type { BadgeIconKey } from './icons';

/** Forma del marco (§4.2): cada categoría tiene la suya. */
export type BadgeShape = 'hex' | 'shield' | 'circle' | 'star' | 'medal' | 'medal_laurel' | 'square';

/** Los cinco metales (§4.3). */
export type BadgeTier = 'bronce' | 'plata' | 'oro' | 'platino' | 'diamante';

/**
 * Metal de una insignia: un nivel, `unico` (sin niveles: se pinta en oro, sin puntos ni tachas) o un color libre
 * de liga (solo en el creador; el campo, la cinta y los bordes salen de ese color, ajustados para leerse).
 */
export type BadgeLookTier = BadgeTier | 'unico' | { custom: string };

/** Tamaños en píxeles reales. Cada uno tiene su propio nivel de detalle (§4.6), no es solo escalar. */
export type BadgeSize = 24 | 40 | 64 | 128;

/**
 * Estados (§4.7): `locked` silueta, `progress` silueta con arco de progreso, `unlocked` completa, `new` con anillo y
 * punto «Nueva», `review` atenuada con reloj de arena, `hidden` atenuada con ojo tachado.
 */
export type BadgeState = 'locked' | 'progress' | 'unlocked' | 'new' | 'review' | 'hidden';

/** Texto de la cinta de abajo en sus dos largos (§4.5): `long` a 128 px (≤ 10), `short` a 64 px (≤ 7). */
export interface PeriodRibbon {
  long: string;
  short: string;
}

/** Todo lo que hace falta para dibujar una insignia: une el catálogo (o el creador) con lo visual. */
export interface BadgeLook {
  shape: BadgeShape;
  tier: BadgeLookTier;
  /** Color sólido del campo: el del deporte (`sportColor`), la marca `#4338ca` o un color ajustado. */
  field: string;
  icon: BadgeIconKey;
  /** Banda de texto de arriba (≤ 14), solo a 128 px. */
  top?: string;
  /** Cinta de periodo: mes, año, temporada, torneo, racha o texto libre del creador. */
  period?: PeriodRibbon | null;
  /** Puntos de nivel (1 a 5), desde 64 px. */
  pips?: 0 | 1 | 2 | 3 | 4 | 5;
  /** Solo `circle`: muescas en el marco con el largo de la racha (hasta 12), desde 40 px. */
  notches?: number;
  /** `app`: marquita Dúo de MatchMate a 128 px; `liga`: pestaña «LIGA» (insignias del creador). */
  origin: 'app' | 'liga';
}
