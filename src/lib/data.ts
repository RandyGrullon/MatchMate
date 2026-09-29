/**
 * Capa de datos de la app: los mismos nombres y parámetros que en BowlingX, ahora sobre el backend
 * (src/lib/backend: Supabase o PGlite local). Cada tema vive en src/lib/data/*.ts:
 * - lecturas con la caché de consultas (src/lib/db/query.ts), con la forma `Live<T>` de siempre;
 * - escrituras por RPC; las de cancha (anotar, en vivo, «Voy», +1 juego, envíos) por la cola sin conexión
 *   (src/lib/db/outbox.ts), que se ven en pantalla de una vez y salen solas al volver la señal.
 */

export { useOutboxSnapshot, useCurrentOutbox, setDataUser, type Live } from './data/client';

export {
  useLeague,
  usePublicLeagues,
  useAllLeagues,
  useLeaguesByIds,
  createLeague,
  updateLeague,
  deleteLeague,
  createTournament,
  getInviteCode,
  renewInviteCode,
  getInvite,
  isJoining,
  useJoining,
  joinLeague,
  joinLeagueClaim,
  type LeagueInput,
} from './data/leagues';

export { memberId, useMembership, useMyMemberships, useLeagueMembers, useUsers, removeMember, setMemberRole, setMemberScorer, setSuperadmin } from './data/members';

export {
  usePlayers,
  usePlayer,
  fetchEffectiveAverages,
  createPlayer,
  updatePlayer,
  deletePlayer,
  claimPlayer,
  createOwnPlayer,
  ensurePlayer,
  linkAccountToPlayer,
  unlinkAccount,
} from './data/players';

export { useEvents, useEvent, createEvent, updateEvent, deleteEvent, addEventGame, setRsvp, practiceForDate, type EventInput } from './data/events';

export { addTeam, renameTeam, applyTeams, deleteTeam } from './data/teams';

export {
  useAllEntries,
  useEventEntries,
  usePlayerEntries,
  useEntriesOfEvents,
  fetchEntriesOfEvents,
  addEntries,
  updateEntry,
  updateEntries,
  saveGame,
  removeEntry,
  saveVerifiedGames,
  type VerifiedWrite,
} from './data/entries';

export {
  useEventSubmissions,
  useSubmissions,
  usePlayerSubmissions,
  submitGames,
  setSubmissionScan,
  approveSubmission,
  rejectSubmission,
  deleteOldPhotos,
} from './data/submissions';

export { useEventLive, publishLiveScores } from './data/liveScores';

export { useReactionsOfEvents, useCommentsOfEvents, setReaction, addComment, deleteComment, MAX_COMMENT, COMMENT_PACE_S } from './data/social';

export { sendSuggestion, useSuggestions, markSuggestions, deleteSuggestion, MAX_SUGGESTION, SUGGESTION_PACE_S } from './data/suggestions';

export { usePlayerAcrossLeagues, useLeagueFeeds, type PlayerInLeague, type LeagueFeed } from './data/feeds';

/** Foto del marcador (URL firmada de Storage): la implementa el módulo de fotos. */
export { usePhoto } from './photos';
