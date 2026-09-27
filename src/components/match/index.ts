/** Piezas de pantalla comunes a los deportes de partido (raqueta y equipos). Contrato: docs/partidos.md. */
export { MatchCard } from './MatchCard';
export { ConfirmResultBanner } from './ConfirmResultBanner';
export { StandingsTable, defaultColumns, type StandingsColumn } from './StandingsTable';
export { ResultEntryModal } from './ResultEntryModal';
export { ScheduleList, groupSchedule, type ScheduleGroup } from './ScheduleList';
export { BracketView } from './BracketView';
export { ShareResultCard } from './ShareResultCard';
export {
  autoConfirmText,
  dayKey,
  flipScoreText,
  matchShareText,
  roundLabel,
  scoreColumns,
  sideName,
  statusInfo,
  whatsappShareUrl,
  whenText,
  type ShareInput,
  type Tone,
} from './format';
export { pointsResultParser, racketResultParser, tryParse, twoNumbersParser, type ParsedResult, type ResultParser } from './parsers';
