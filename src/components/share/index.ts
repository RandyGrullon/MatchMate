/**
 * Compartir tablas y resultados como imagen para WhatsApp (con el link), sin librerías: la tarjeta se arma como
 * figuras (cards.ts), se pinta en un canvas (paint.ts) y sale en PNG; se comparte con el menú del teléfono o se
 * descarga (actions.ts). Pantallas: `ShareButton` con una función que arma la tarjeta al tocar.
 */
export { ShareButton, shareDate, shareFrame } from './ShareButton';
export { ShareImageModal } from './ShareImageModal';
export {
  BADGE_CARD_HEIGHT,
  CARD_WIDTH,
  DEFAULT_MAX_ROWS,
  buildScene,
  linkLabel,
  shareCaption,
  type CardFrame,
  type ShareBadgeSpec,
  type ShareCard,
  type ShareColumn,
  type ShareResultSide,
  type ShareResultSpec,
  type ShareRow,
  type ShareScoreCell,
  type ShareSection,
  type ShareTableSpec,
} from './cards';
export {
  leadersShare,
  medalPointsShare,
  plain,
  pointsText,
  standingsShare,
  type LeaderColumnLike,
  type MedalPointsLike,
  type TableColumnLike,
} from './adapters';
export { resultShare, type ResultShareOptions, type ShareMatch } from './match';
export { golfBoardShare, thruLabel, toParLabel, type GolfBoardRowLike } from './golf';
export { badgeShare, type BadgeShareInput } from './badge';
export { SPORT_COLORS, sportColor } from './palette';
export { canShareFiles, copyText, downloadFile, shareFile, shareFileName, type ShareOutcome } from './actions';
export { renderCardPng } from './paint';
export { sceneToSvg } from './svg';
