/**
 * Lo que no es pantalla de Organizar › Jugadores (src/pages/PlayersPage.tsx), para la web y la app del teléfono: los
 * números de cada jugador, su línea en la lista, a quién se busca, los miembros sin jugador, con qué cuenta se puede
 * vincular, si cambió lo de menor y los textos de las preguntas (eliminar, vincular, desvincular). Funciones puras.
 */
import { averageSourceLabel, averageSourceShort, type SeasonAverage } from '../../lib/bowlingSeason';
import type { GuardianInfo } from '../../lib/data/players';
import { MIN_RANK_GAMES, playerStats, type PlayerStats } from '../../lib/stats';
import type { Entry, Member, Player } from '../../lib/types';
import { emptyGuardian, statKind, type GuardianDraft } from './logic';

/** Los números de cada jugador (id → playerStats de sus participaciones). */
export function statsByPlayer(entries: readonly Entry[]): Map<string, PlayerStats> {
  const groups = new Map<string, Entry[]>();
  for (const e of entries) groups.set(e.playerId, [...(groups.get(e.playerId) ?? []), e]);
  const map = new Map<string, PlayerStats>();
  groups.forEach((list, id) => map.set(id, playerStats(list)));
  return map;
}

/** Un jugador sin participaciones. */
export const noStats: PlayerStats = { games: 0, pins: 0, autoAverage: null, high: 0, highSeries: 0, pending: 0 };

/** El promedio del handicap (o «—» si todavía no tiene). */
export const handicapValue = (value: SeasonAverage | undefined): number | null => (value && value.source !== 'ninguno' ? value.average : null);

/**
 * Debajo del nombre de un jugador: «prom. fijo · 12 juegos · mejor 245» (boliche: de dónde sale su promedio si no es el de la
 * temporada, cuántos juegos y el mejor), «Sin cuenta» o «Menor · sin cuenta», el número de su deporte y lo que falta
 * por aprobar («3 sin foto»).
 */
export function playerLine(o: {
  bowling: boolean;
  hasAccount: boolean;
  isMinor?: boolean;
  games: number;
  high: number;
  pending: number;
  source?: SeasonAverage['source'] | null;
  summary?: string | null;
}): string {
  const short = o.bowling && o.source ? averageSourceShort(o.source) : null;
  return [
    !o.hasAccount && (o.isMinor ? 'Menor · sin cuenta' : 'Sin cuenta'),
    short && `prom. ${short}`,
    o.bowling && `${o.games} ${o.games === 1 ? 'juego' : 'juegos'}`,
    o.bowling && o.high > 0 && `mejor ${o.high}`,
    o.summary,
    o.pending > 0 && `${o.pending} sin foto`,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** El buscador de la lista: los que tienen lo escrito en el nombre (sin importar mayúsculas). */
export const filterPlayers = <P extends Pick<Player, 'name'>>(players: readonly P[], q: string): P[] =>
  players.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));

/** Cuentas sin jugador (quien entró solo para anotar no juega: no sale para vincular). */
export const membersWithoutPlayer = <M extends Pick<Member, 'playerId' | 'scorerOnly'>>(members: readonly M[]): M[] =>
  members.filter((m) => !m.playerId && !m.scorerOnly);

/** Con qué cuentas se puede vincular a un jugador sin cuenta: todas menos la que ya juega con él. */
export const linkCandidates = <M extends Pick<Member, 'playerId'>>(members: readonly M[], playerId: string): M[] =>
  members.filter((m) => m.playerId !== playerId);

/** La cuenta en la lista para vincular: su nombre y, si ya juega con otro nombre, «(hoy: …)». */
export function accountOptionLabel(m: Pick<Member, 'name' | 'playerId'>, nameOf: (id: string | null) => string | null): string {
  const current = m.playerId ? nameOf(m.playerId) : null;
  return `${m.name}${m.playerId && current && current !== m.name ? ` (hoy: ${current})` : ''}`;
}

/** «Vincular con la cuenta»: lo que pasa con el jugador y con el que la cuenta tenía. */
export function linkMessage(playerName: string, picked: Pick<Member, 'name' | 'playerId'>, nameOf: (id: string | null) => string | null): string {
  return `${playerName} pasa a ser el jugador de ${picked.name}: sus juegos cuentan en su perfil.${
    picked.playerId
      ? ` De su jugador de ahora (${nameOf(picked.playerId) ?? picked.name}), lo pendiente (envíos por aprobar, "voy") pasa a ${playerName}; si nunca jugó un evento se borra, y si jugó se queda en la lista sin cuenta.`
      : ''
  }`;
}

/** «Desvincular cuenta»: la cuenta juega con uno nuevo y el jugador se queda sin cuenta. */
export const unlinkMessage = (accountName: string | null | undefined, playerName: string): string =>
  `${accountName ?? 'La cuenta'} deja de estar vinculada a ${playerName} y pasa a jugar con un jugador nuevo, con su cuenta. ${playerName} y sus juegos se quedan en la lista sin cuenta.`;

/** ¿Eliminar a…? Lo que se borra con él. */
export const deletePlayerMessage = (bowling: boolean, stats: Pick<PlayerStats, 'games' | 'pending'>): string =>
  bowling
    ? `Se borran también sus ${stats.games + stats.pending} juegos en torneos y prácticas. No se puede deshacer.`
    : 'Se borran también sus resultados en esta liga. No se puede deshacer.';

/** Debajo del nombre en su hoja: «Promedio del handicap: 182 (esta temporada)» (sin promedio, nada). */
export const handicapSubtitle = (h: SeasonAverage | undefined): string | undefined =>
  h && h.source !== 'ninguno' ? `Promedio del handicap: ${h.average} (${averageSourceLabel(h.source).toLowerCase()})` : undefined;

/** Debajo del promedio fijo al editar: hasta cuándo cuenta y con cuál va hoy su handicap. */
export const averageHint = (h: SeasonAverage | undefined): string =>
  `Cuenta mientras no tenga ${MIN_RANK_GAMES} juegos verificados en la temporada (ni en la anterior); después manda el de sus juegos.${
    h && h.source !== 'ninguno' ? ` Hoy su handicap usa ${h.average} (${averageSourceLabel(h.source).toLowerCase()}).` : ''
  }`;

type SavedGuardian = Pick<GuardianInfo, 'guardianName' | 'guardianPhone' | 'consentAt'>;

/** El tutor guardado (solo lo leen los admins) como se escribe en el formulario. */
export const guardianDraftOf = (saved: SavedGuardian | undefined): GuardianDraft =>
  saved ? { guardianName: saved.guardianName ?? '', guardianPhone: saved.guardianPhone ?? '', consent: !!saved.consentAt } : emptyGuardian;

/** Al guardar la hoja: ¿cambió si es menor o, siéndolo, su tutor, el teléfono o el permiso? (va a set_player_minor). */
export function minorChanged(o: { minorsOk: boolean; isMinor: boolean; wasMinor: boolean; guardian: GuardianDraft; saved: SavedGuardian | undefined }): boolean {
  return (
    o.minorsOk &&
    (o.isMinor !== o.wasMinor ||
      (o.isMinor &&
        (o.guardian.guardianName.trim() !== (o.saved?.guardianName ?? '') ||
          o.guardian.guardianPhone.replace(/[\s().-]/g, '') !== (o.saved?.guardianPhone ?? '') ||
          o.guardian.consent !== !!o.saved?.consentAt)))
  );
}

/**
 * El deporte lleva a su gente en su propia pestaña de Organizar (natación: Nadadores; raqueta: Parejas y niveles, o
 * Jugadores y niveles) y lo de las cuentas va en Miembros: el `playersMerged` de useOwnTabs
 * (src/components/organizer/Hub.tsx) sin cargar las pantallas del deporte (la app del teléfono no las tiene).
 */
export function peopleInOwnTab(sport: string | null | undefined): boolean {
  const kind = statKind(sport);
  return kind === 'racket' || kind === 'swimming';
}
