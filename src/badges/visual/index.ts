/**
 * Núcleo visual de las insignias (docs/insignias.md §4): tipos, paletas, íconos, cinta de periodo, geometría por
 * tamaño y estado, y los componentes de React. Las pantallas importan desde aquí.
 */
export type { BadgeLook, BadgeLookTier, BadgeShape, BadgeSize, BadgeState, BadgeTier, PeriodRibbon } from './types';
export {
  BRAND_FIELD,
  LEAGUE_TAB,
  SURFACES,
  TIERS,
  TIER_LABEL,
  TIER_ORDER,
  TOKENS,
  badgePaletteFrom,
  badgeThemeVars,
  resolvePalette,
  tierDot,
  type CustomPalette,
  type ResolvedPalette,
  type ThemeColor,
  type TierPalette,
} from './palette';
export {
  BADGE_ICONS,
  BADGE_ICON_KEYS,
  FALLBACK_ICON,
  ICON_TABS,
  SPORT_EMBLEM,
  UI_ICONS,
  iconNode,
  iconToPath,
  isBadgeIconKey,
  normalizeSearch,
  searchIcons,
  type BadgeIconDef,
  type BadgeIconKey,
  type IconNode,
  type IconTab,
} from './icons';
export { MONTH_ABBR, RIBBON_MAX, badgeLabel, humanPeriod, periodFromKey, periodLabel, periodRibbon, type PeriodBadgeText, type PeriodSpec } from './period';
export {
  BADGE_SIZES,
  RIBBONS,
  SHAPES,
  SHAPE_ORDER,
  SIZE_DETAIL,
  VIEWBOX,
  badgeModel,
  ribbonTextWidth,
  type BadgeModelOptions,
  type BadgeNode,
  type BadgeScene,
  type GradientDef,
  type Paint,
  type SizeDetail,
} from './geometry';
export { SHARED_DEFS, SHARED_GRADIENTS, badgeDefsMarkup, badgeSvg, nodesToElements, type BadgeSvgOptions, type PaintMode, type SvgElement } from './svg';
export { svgToReact } from './svgReact';
export { makeLook, tierOfLevel, type LookInput } from './look';
export { Insignia, type InsigniaProps } from './Insignia';
export { BADGE_DEFS_ID, BadgeDefs, ensureBadgeDefs, useBadgeDefs } from './BadgeDefs';
export { CALM_MS, UNLOCK_MS, UnlockInsignia, prefersCalm, type UnlockInsigniaProps } from './UnlockInsignia';
