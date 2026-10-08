/**
 * Lo puro de «Crear torneo» de esports (docs/esports.md §12.7): los pasos, el formulario con sus valores por defecto
 * (del catálogo del juego), qué cambia al elegir otro modo o formato, los errores de cada paso (validateSettings del
 * motor y los del cupo y las fechas) y lo que se manda a `createEsportsTournament`. Sin React.
 */
import type { TournamentInput } from '../../../lib/data/esports';
import { addDays, zonedIso } from '../../sports/racket/logic/time';
import { bestOfLine } from '../../sports/esports/logic';
import { PROVIDER_NAME } from '../logic';
import {
  ENTRY_LABEL,
  FORMAT_LABEL,
  GAMES,
  canVerifyId,
  canVerifyRank,
  defaultSettings,
  entryTypesFor,
  formatsFor,
  isIndividualMode,
  maxEntries,
  minEntries,
  validateSettings,
  verifyKind,
  type BestOf,
  type EntryType,
  type Format,
  type GameId,
  type Mode,
  type TournamentSettings,
} from '../../../sports/esports';

export type StepKey = 'juego' | 'inscripcion' | 'formato' | 'nombre' | 'invitar';

export const STEPS: readonly { key: StepKey; label: string }[] = [
  { key: 'juego', label: 'Juego' },
  { key: 'inscripcion', label: 'Inscripción' },
  { key: 'formato', label: 'Formato' },
  { key: 'nombre', label: 'Nombre' },
  { key: 'invitar', label: 'Invitar' },
];

/** El paso que crea el torneo (el botón dice «Crear torneo»). */
export const CREATE_STEP: StepKey = 'nombre';

/** Check-in: apagado o 15/30/60 min antes del inicio. */
export const CHECKIN_OPTIONS: readonly { value: number; label: string }[] = [
  { value: 0, label: 'Sin check-in' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '60 min' },
];

/** Una línea por formato en su tarjeta. */
export const FORMAT_BLURB: Record<Format, string> = {
  single_elim: 'Quien pierde una serie queda fuera.',
  double_elim: 'Nadie queda fuera con una sola derrota.',
  groups_playoffs: 'Todos contra todos en grupos y los mejores pasan al cuadro.',
  round_robin: 'Todos juegan contra todos y gana la tabla.',
  br: 'Jornadas de partidas con la tabla de puntos acumulada.',
};

/** Una línea por entrada. */
export const ENTRY_BLURB: Record<EntryType, string> = {
  teams: 'Se inscriben equipos ya armados: lo hace su capitán.',
  open: 'Se inscribe cada quien: con su equipo o como agente libre.',
};

export interface TournamentForm {
  game: GameId;
  mode: Mode;
  entryType: EntryType;
  format: Format;
  maxEntries: number;
  /** La inscripción cierra al empezar (si no, `closeDate` y `closeTime`). */
  closeAtStart: boolean;
  closeDate: string;
  closeTime: string;
  /** Minutos de check-in antes del inicio (0 = sin check-in). */
  checkin: number;
  settings: TournamentSettings;
  name: string;
  date: string;
  time: string;
  visibility: 'public' | 'private';
  venue: string;
  prize: string;
  announcement: string;
}

/** El cupo por defecto: el lobby en battle royale; 8 en los demás (sin pasar del máximo). */
export function defaultMax(game: GameId, mode: Mode, format: Format): number {
  const top = maxEntries(game, mode, format);
  return format === 'br' ? top : Math.min(8, top);
}

/** El formulario al abrir: el modo y el formato por defecto del juego, inscripción hasta el inicio, mañana a las 7 pm. */
export function emptyForm(game: GameId, today: string): TournamentForm {
  const meta = GAMES[game];
  const mode = meta.defaultMode;
  const format = formatsFor(game)[0];
  const entryType = entryTypesFor(game, mode)[0];
  const date = addDays(today, 1);
  return {
    game,
    mode,
    entryType,
    format,
    maxEntries: defaultMax(game, mode, format),
    closeAtStart: true,
    closeDate: date,
    closeTime: '18:00',
    checkin: 0,
    settings: defaultSettings(game, mode, format),
    name: '',
    date,
    time: '19:00',
    visibility: 'public',
    venue: '',
    prize: '',
    announcement: '',
  };
}

/** Un ajuste de «Pedir…» (el texto y su pista). */
export interface Requirement {
  label: string;
  hint: string;
}

/**
 * «Pedir ID confirmado»: solo en los juegos que comprueban el ID solos (con la cuenta conectada de Epic o Steam, o con
 * la búsqueda de Riot). null = el juego no lo puede comprobar y no se ofrece.
 */
export function idRequirement(game: GameId): Requirement | null {
  if (!canVerifyId(game)) return null;
  const link = GAMES[game].link;
  if (verifyKind(game) === 'login' && link) return { label: 'Pedir ID confirmado', hint: `Con su cuenta de ${PROVIDER_NAME[link]} conectada.` };
  return { label: 'Pedir ID confirmado', hint: 'Comprobado con su Riot ID.' };
}

/** «Pedir rango verificado»: solo si el rango del juego sale verificado (LoL, por Riot). null = no se ofrece. */
export function rankRequirement(game: GameId): Requirement | null {
  if (!canVerifyRank(game)) return null;
  return { label: 'Pedir rango verificado', hint: `El rango de ${GAMES[game].mono} que da Riot.` };
}

/** Los «Pedir…» que el juego no puede comprobar quedan apagados. */
export function withRequirements(game: GameId, s: TournamentSettings): TournamentSettings {
  const id = s.requireConfirmedId && canVerifyId(game);
  const rank = s.requireVerifiedRank && canVerifyRank(game);
  return id === s.requireConfirmedId && rank === s.requireVerifiedRank ? s : { ...s, requireConfirmedId: id, requireVerifiedRank: rank };
}

/** Lo de los ajustes que se queda al cambiar de modo o formato (lo que eligió y sigue valiendo). */
function keepSettings(game: GameId, prev: TournamentSettings, next: TournamentSettings): TournamentSettings {
  return withRequirements(game, {
    ...next,
    autoApprove: prev.autoApprove,
    requireConfirmedId: prev.requireConfirmedId,
    requireVerifiedRank: prev.requireVerifiedRank,
    seeding: prev.seeding,
    subs: Math.min(prev.subs, next.subs),
  });
}

/** Otro modo: la entrada que sigue valiendo, los suplentes y el cupo dentro de lo nuevo. */
export function withMode(f: TournamentForm, mode: Mode): TournamentForm {
  const entries = entryTypesFor(f.game, mode);
  const settings = keepSettings(f.game, f.settings, defaultSettings(f.game, mode, f.format));
  return { ...f, mode, entryType: entries.includes(f.entryType) ? f.entryType : entries[0], settings: clampSubs(settings, f.game, mode), maxEntries: clampMax(f.maxEntries, f.game, mode, f.format) };
}

/** Otro formato: sus ajustes por defecto (con lo que el organizador ya eligió de la inscripción) y el cupo dentro de su rango. */
export function withFormat<F extends Pick<TournamentForm, 'game' | 'mode' | 'format' | 'settings' | 'maxEntries'>>(f: F, format: Format): F {
  const settings = keepSettings(f.game, f.settings, defaultSettings(f.game, f.mode, format));
  settings.subs = f.settings.subs;
  return { ...f, format, settings: clampSubs(settings, f.game, f.mode), maxEntries: clampMax(f.maxEntries, f.game, f.mode, format) };
}

/** Los suplentes que permite el juego en ese modo. */
export const subsMaxOf = (game: GameId, mode: Mode) => (isIndividualMode(mode) ? 0 : Math.min(2, GAMES[game].subsMax[mode] ?? 0));

function clampSubs(s: TournamentSettings, game: GameId, mode: Mode): TournamentSettings {
  return { ...s, subs: Math.max(0, Math.min(s.subs, subsMaxOf(game, mode))) };
}

/** El cupo dentro de `minEntries…maxEntries` del formato. */
export function clampMax(n: number, game: GameId, mode: Mode, format: Format): number {
  const lo = minEntries(format);
  const hi = maxEntries(game, mode, format);
  return Math.max(lo, Math.min(hi, Math.round(Number.isFinite(n) ? n : lo)));
}

/** Los «Mejor de» que permite el juego (vacío en BR). */
export const bestOfOptions = (game: GameId): readonly BestOf[] => GAMES[game].bestOf;

/** Puntos por puesto editados: enteros de 0 a 100, entre 1 y 100 puestos. */
export function cleanPoints(list: readonly number[]): number[] {
  return list.slice(0, 100).map((n) => Math.max(0, Math.min(100, Math.round(Number.isFinite(n) ? n : 0))));
}

/** Los ISO del inicio y del cierre en la zona (null si la fecha o la hora no se entienden). */
export function times(f: Pick<TournamentForm, 'date' | 'time' | 'closeAtStart' | 'closeDate' | 'closeTime'>, tz: string): { startsAt: string | null; closesAt: string | null } {
  const startsAt = zonedIso(f.date, f.time, tz);
  const closesAt = f.closeAtStart ? startsAt : zonedIso(f.closeDate, f.closeTime, tz);
  return { startsAt, closesAt };
}

/** Los errores del paso (en español); vacío = se puede seguir. */
export function stepErrors(step: StepKey, f: TournamentForm, o: { tz: string; now: number }): string[] {
  switch (step) {
    case 'juego':
      return [];
    case 'inscripcion': {
      const out: string[] = [];
      const lo = minEntries(f.format);
      const hi = maxEntries(f.game, f.mode, f.format);
      if (!Number.isInteger(f.maxEntries) || f.maxEntries < lo || f.maxEntries > hi) out.push(`El cupo va de ${lo} a ${hi}.`);
      if (!f.closeAtStart) {
        const { startsAt, closesAt } = times(f, o.tz);
        if (!closesAt) out.push('Pon el día y la hora en que cierra la inscripción.');
        else if (startsAt && Date.parse(closesAt) > Date.parse(startsAt)) out.push('La inscripción tiene que cerrar antes del inicio.');
      }
      return out;
    }
    case 'formato':
      return validateSettings(f.game, f.mode, f.format, f.entryType, f.maxEntries, f.settings);
    case 'nombre': {
      const out: string[] = [];
      const name = f.name.trim();
      if (name.length < 2) out.push('Ponle un nombre al torneo.');
      const { startsAt, closesAt } = times(f, o.tz);
      if (!startsAt) out.push('Pon el día y la hora del inicio.');
      else if (Date.parse(startsAt) <= o.now) out.push('El inicio tiene que ser más adelante.');
      if (startsAt && closesAt && !f.closeAtStart && Date.parse(closesAt) > Date.parse(startsAt)) out.push('La inscripción tiene que cerrar antes del inicio.');
      return out;
    }
    case 'invitar':
      return [];
  }
}

/** Lo que se manda a createEsportsTournament. */
export function tournamentInput(f: TournamentForm, tz: string): TournamentInput {
  const { startsAt, closesAt } = times(f, tz);
  return {
    game: f.game,
    name: f.name.trim(),
    mode: f.mode,
    entryType: f.entryType,
    format: f.format,
    startsAt: startsAt ?? new Date().toISOString(),
    maxEntries: f.maxEntries,
    settings: withRequirements(f.game, f.settings),
    visibility: f.visibility,
    registrationOpensAt: null,
    registrationClosesAt: closesAt,
    checkinMinutes: f.checkin > 0 ? f.checkin : null,
    venue: f.venue.trim(),
    announcement: f.announcement.trim(),
    prizeText: f.prize.trim(),
    tz,
  };
}

/** El resumen del paso de formato: «Doble eliminación · Al mejor de 3 y 5 en la final · Solo equipos». */
export function summary(f: Pick<TournamentForm, 'format' | 'entryType' | 'settings'>): string {
  return [FORMAT_LABEL[f.format], bestOfLine(f.format, f.settings.bestOf), ENTRY_LABEL[f.entryType]].filter(Boolean).join(' · ');
}
