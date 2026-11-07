/**
 * «Dar insignia» sin pantalla (docs/insignias.md §5.6): los pasos, quiénes ya la tienen en ese periodo y división, el
 * cupo que se ve en el teléfono (la base decide igual), cómo se eligen los jugadores (nadie se la da a sí mismo, hasta
 * 30), las sugerencias, los periodos que se ofrecen, «Avisarle» y los textos de cada paso. Lo usan GiveBadge.tsx de la
 * web y el de la app del teléfono. Funciones puras, con pruebas en give.test.ts.
 */
import { LIMIT_OF, MAX_AWARD_PLAYERS, type LeagueBadge, type MadeAward } from '../../../lib/data/leagueBadges';
import { normalizeSearch } from '../../../badges/visual/icons';
import { BADGE_TEXT_MAX, badgeTextError, cleanBadgeText, textLength } from '../text';
import { LIMIT_INFO, namesText, slotKey, type PeriodChoice } from './design';
import type { Suggestion } from './suggest';

export type GiveStep = 'cual' | 'quien' | 'detalles' | 'vista' | 'listo';

/** Los tres pasos numerados (elegir cuál y el aviso de listo van sin número). */
export const GIVE_STEPS = ['quien', 'detalles', 'vista'] as const;
export const STEP_LABEL: Readonly<Record<(typeof GIVE_STEPS)[number], string>> = { quien: '¿A quién?', detalles: 'Periodo y nota', vista: 'Así la verá' };

/** El número del paso (0, 1, 2) o -1 si no lleva. */
export const stepIndex = (step: GiveStep): number => (GIVE_STEPS as readonly string[]).indexOf(step);

/** «Dar “Campeón”», o «Dar insignia» si todavía no se eligió cuál. */
export const giveTitle = (badge: Pick<LeagueBadge, 'name'> | null): string => (badge ? `Dar “${badge.name}”` : 'Dar insignia');

/** El periodo y la división como se mandan: el periodo en mayúsculas, los dos sin espacios de más. */
export const cleanPeriod = (period: string) => cleanBadgeText(period).toUpperCase();
export const cleanDivision = (division: string) => cleanBadgeText(division);

/**
 * Quiénes ya la tienen vigente con este periodo y división (no se les puede volver a dar). Un premio del torneo no
 * cuenta: no choca con un regalo (docs/premios-torneo.md §1 D4), como en la base.
 */
export function slotHolders(awards: readonly MadeAward[], badge: Pick<LeagueBadge, 'id'> | null, period: string, division: string): Set<string> {
  if (!badge) return new Set();
  const p = slotKey(period);
  const d = slotKey(division);
  return new Set(awards.filter((a) => a.badgeId === badge.id && !a.revokedAt && !a.prizeSlotId && slotKey(a.period) === p && slotKey(a.division) === d).map((a) => a.playerId));
}

/**
 * ¿Se pasa del cupo? (lo que se ve en el teléfono; la base decide igual). Con una por equipo, el equipo cuenta 1: si
 * ese equipo ya la tiene en el periodo, no gasta otro lugar.
 */
export function overQuota(o: {
  badge: Pick<LeagueBadge, 'id' | 'byTeam'> | null;
  awards: readonly MadeAward[];
  left: number;
  picked: readonly string[];
  teamId: string | null;
  period: string;
  division: string;
}): boolean {
  const { badge } = o;
  if (!badge) return false;
  if (!badge.byTeam) return o.picked.length > o.left;
  const teamHas = o.awards.some((a) => a.badgeId === badge.id && !a.revokedAt && !a.prizeSlotId && a.teamId === o.teamId && a.period === o.period && a.division === o.division);
  return o.left < 1 && !teamHas;
}

/** Se puede elegir: no es el jugador de quien da y no la tiene ya en ese periodo. */
export const canPick = (id: string, myPlayerId: string | null, holders: ReadonlySet<string>) => id !== myPlayerId && !holders.has(id);

/** Elegir de una vez (la plantilla de un equipo): sin los que no se pueden y hasta 30. */
export const pickAll = (ids: readonly string[], free: (id: string) => boolean): string[] => ids.filter(free).slice(0, MAX_AWARD_PLAYERS);

/** Marcar o desmarcar uno (hasta 30). */
export const togglePick = (picked: readonly string[], id: string): string[] =>
  picked.includes(id) ? picked.filter((x) => x !== id) : picked.length >= MAX_AWARD_PLAYERS ? [...picked] : [...picked, id];

/** Una sugerencia de un jugador: se suma (o se quita si ya estaba). */
export const toggleSuggestion = (picked: readonly string[], s: Pick<Suggestion, 'playerIds'>, free: (id: string) => boolean): string[] =>
  s.playerIds.every((id) => picked.includes(id))
    ? picked.filter((id) => !s.playerIds.includes(id))
    : [...picked, ...s.playerIds.filter((id) => free(id) && !picked.includes(id))].slice(0, MAX_AWARD_PLAYERS);

/** ¿Está elegida la sugerencia? (el equipo, o todos sus jugadores). */
export const suggestionChosen = (s: Pick<Suggestion, 'teamId' | 'playerIds'>, picked: readonly string[], teamId: string | null): boolean =>
  s.teamId && teamId ? s.teamId === teamId : s.playerIds.length > 0 && s.playerIds.every((id) => picked.includes(id));

/** «Única: queda 1 lugar en TEMP 2026.», o con una por equipo «Selecta: hasta 3 equipos por periodo.». */
export function quotaLine(badge: Pick<LeagueBadge, 'limitKind' | 'byTeam'>, left: number, period: string): string {
  const label = LIMIT_INFO[badge.limitKind].label;
  const limit = LIMIT_OF[badge.limitKind];
  if (badge.byTeam) return `${label}: ${limit === 1 ? '1 equipo' : `hasta ${limit} equipos`} por periodo.`;
  const where = period ? ` en ${period}` : '';
  if (left > 0) return `${label}: ${left === 1 ? 'queda 1 lugar' : `quedan ${left} lugares`}${where}.`;
  return `${label}: ya no quedan lugares${where}. Puedes darla con otro periodo o división en el paso siguiente.`;
}

/** Los jugadores de la lista: los del equipo (si se eligió uno) que coinciden con la búsqueda, por nombre. */
export function playerList<P extends { id: string; name: string }>(players: readonly P[], q: string, roster: readonly { playerId: string }[] | null): P[] {
  const pool = roster ? players.filter((p) => roster.some((r) => r.playerId === p.id)) : players;
  const query = normalizeSearch(q);
  return [...pool].filter((p) => !query || normalizeSearch(p.name).includes(query)).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

/** «2 elegidos: Ana y Luis», o «Elige a quién se la das.»; con jugador propio, «Nadie se da insignias a sí mismo.». */
export function pickedLine(names: readonly string[], hasOwnPlayer: boolean): string {
  const first = names.length ? `${names.length === 1 ? '1 elegido' : `${names.length} elegidos`}: ${namesText(names)}` : 'Elige a quién se la das.';
  return `${first}${hasOwnPlayer ? ' Nadie se da insignias a sí mismo.' : ''}`;
}

/** La lista vacía: «Nadie coincide.» si hay jugadores, o que no hay. */
export const emptyPlayersText = (anyPlayers: boolean) => (anyPlayers ? 'Nadie coincide.' : 'Todavía no hay jugadores en la liga.');

export const TEAM_ROSTER_HINT = 'Su plantilla sale marcada: desmarca a los que no jugaron.';
export const NO_TEAMS_TEXT = 'Todavía no hay equipos ni parejas de temporada.';
export const SUGGEST_FOOT = 'La app sugiere; la liga decide.';
export const NO_ACTIVE_TEXT = 'No hay insignias activas. Crea una con «Nueva insignia».';

/** La línea de un diseño en «¿Cuál vas a dar?»: «Única · TEMP 2026 · por equipo». */
export const pickDesignSub = (d: Pick<LeagueBadge, 'limitKind' | 'periodText' | 'byTeam'>): string =>
  `${LIMIT_INFO[d.limitKind].label}${d.periodText ? ` · ${d.periodText}` : ''}${d.byTeam ? ' · por equipo' : ''}`;

// ---------- Paso 2: periodo, división, nota ----------

export interface DetailErrors {
  period: string | null;
  division: string | null;
  note: string | null;
}

export const detailErrors = (period: string, division: string, note: string): DetailErrors => ({
  period: badgeTextError(period),
  division: badgeTextError(division),
  note: badgeTextError(note),
});

/** Se puede seguir: ningún texto con problemas y todos dentro de su largo. */
export function detailsOk(period: string, division: string, note: string): boolean {
  const e = detailErrors(period, division, note);
  return (
    !e.period &&
    !e.division &&
    !e.note &&
    textLength(cleanPeriod(period)) <= BADGE_TEXT_MAX.period &&
    textLength(cleanDivision(division)) <= BADGE_TEXT_MAX.division &&
    textLength(cleanBadgeText(note)) <= BADGE_TEXT_MAX.note
  );
}

/** Los chips de «Periodo»: el del diseño primero; después los de hoy que no son el mismo (sin «Torneo»). */
export function periodOptions(badge: Pick<LeagueBadge, 'periodText'>, choices: readonly PeriodChoice[]): { key: string; label: string; text: string }[] {
  const own = badge.periodText.trim();
  return [
    ...(own ? [{ key: 'diseno', label: 'El del diseño', text: own }] : []),
    ...choices.filter((c) => c.mode !== 'torneo' && (c.mode === 'none' || c.text !== own)).map((c) => ({ key: c.mode, label: c.label, text: c.text })),
  ];
}

export const NOTE_HINT = 'La ven el jugador y los admins. Nunca sale en la imagen para compartir.';

/** «Avisarle» o «Avisarles». */
export const notifyLabel = (withAccount: number) => (withAccount > 1 ? 'Avisarles' : 'Avisarle');

/** La ayuda de «Avisarle»: con menores no se avisa; sin cuenta, la ven en la liga. */
export function notifyHint(minors: boolean, withAccount: number): string {
  if (minors) return 'En ligas con menores no se mandan avisos.';
  if (withAccount === 0) return 'Ninguno tiene cuenta: la ven en la página de la liga.';
  if (withAccount === 1) return 'Le llega un aviso al teléfono (tiene cuenta).';
  return `Les llega un aviso al teléfono (${withAccount} tienen cuenta).`;
}

/** El interruptor está prendido y se puede tocar. */
export const notifyState = (notify: boolean, minors: boolean, withAccount: number) => ({ on: notify && !minors && withAccount > 0, disabled: minors || withAccount === 0 });

// ---------- Paso 3 y listo ----------

/** «Cat. A · Equipo Uno» debajo de la insignia en «Así la verá». */
export const previewDetail = (division: string, teamName: string | null) => [division, teamName].filter(Boolean).join(' · ');

/** «Le avisamos a 1 jugador con cuenta. » (va antes de lo de deshacer). */
export const notifiedText = (n: number) => (n ? (n === 1 ? 'Le avisamos a 1 jugador con cuenta. ' : `Les avisamos a ${n} jugadores con cuenta. `) : '');

export const UNDO_NOTE = '¿Te equivocaste? Puedes deshacerla durante 24 horas.';
export const UNDONE_TOAST = 'Deshecho: se la quitamos';
