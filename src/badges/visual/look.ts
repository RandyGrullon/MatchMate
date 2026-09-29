/**
 * Arma un BadgeLook con las reglas de §4: el campo sale del deporte (o la marca en las de varios deportes y de
 * cuenta), el emblema del deporte si no se pide otro, y los puntos del nivel. Lo usan `lookOf` (catálogo + otorgamiento)
 * y las vistas previas.
 */
import { sportColor } from '../../components/share/palette';
import type { SportId } from '../../sports/types';
import { FALLBACK_ICON, SPORT_EMBLEM, isBadgeIconKey } from './icons';
import { BRAND_FIELD, TIERS, TIER_ORDER } from './palette';
import type { BadgeLook, BadgeLookTier, BadgeShape, BadgeTier, PeriodRibbon } from './types';

/** Metal de un nivel del catálogo: 0 = única (se pinta en oro, sin puntos), 1 bronce … 5 diamante. */
export const tierOfLevel = (level: number): BadgeTier | 'unico' => (level >= 1 && level <= 5 ? TIER_ORDER[level - 1] : 'unico');

export interface LookInput {
  shape: BadgeShape;
  tier: BadgeLookTier;
  /** null o sin deporte: de varios deportes o de cuenta (campo del morado de la marca). */
  sport?: SportId | 'all' | null;
  /** Clave de la lista curada, o 'sport' (o nada) para el emblema del deporte. */
  icon?: string;
  period?: PeriodRibbon | null;
  /** Puntos de nivel: por defecto los del metal (bronce 1 … diamante 5); 0 para ninguno (podios, por ejemplo). */
  pips?: number;
  notches?: number;
  top?: string;
  origin?: 'app' | 'liga';
}

export function makeLook(i: LookInput): BadgeLook {
  const sport = i.sport && i.sport !== 'all' ? i.sport : null;
  const icon = i.icon && i.icon !== 'sport' && isBadgeIconKey(i.icon) ? i.icon : sport ? SPORT_EMBLEM[sport] : FALLBACK_ICON;
  const level = typeof i.tier === 'string' && i.tier !== 'unico' ? TIERS[i.tier].level : 0;
  const pips = Math.max(0, Math.min(5, Math.trunc(i.pips ?? level))) as BadgeLook['pips'];
  return {
    shape: i.shape,
    tier: i.tier,
    field: sport ? sportColor(sport) : BRAND_FIELD,
    icon,
    period: i.period ?? null,
    pips,
    notches: i.notches,
    top: i.top,
    origin: i.origin ?? 'app',
  };
}
