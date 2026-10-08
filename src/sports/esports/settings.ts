/**
 * Ajustes de un torneo de esports (`esports_tournaments.settings`, docs/esports.md §3.6). Las claves, tipos y rangos
 * son los mismos que revisa `private.esp_settings_ok`; las revisiones cruzadas (grupos contra el cupo, mínimos del
 * formato) solo se hacen aquí, en el teléfono, con mensajes en español.
 */
import {
  GAMES,
  canVerifyId,
  canVerifyRank,
  isIndividualMode,
  maxEntries as maxEntriesFor,
  minEntries,
  modeLabel,
  modeOk,
  subsMaxFor,
  type BestOf,
  type GameId,
  type Mode,
} from './catalog';
import type { SeedingMethod } from './seeding';

export type Format = 'single_elim' | 'double_elim' | 'groups_playoffs' | 'round_robin' | 'br';
export type EntryType = 'teams' | 'open';

export interface TournamentSettings {
  /** Suplentes permitidos (0…subsMax). */
  subs: number;
  autoApprove: boolean;
  /** «Pedir ID confirmado»: solo cuenta en los juegos que lo pueden comprobar (`canVerifyId`). Apagado por defecto. */
  requireConfirmedId: boolean;
  /** «Pedir rango verificado»: solo cuenta en LoL (`canVerifyRank`). Apagado por defecto. */
  requireVerifiedRank: boolean;
  seeding: SeedingMethod;
  /** Del catálogo; en BR { 1, 1, 1 } (no se usa). */
  bestOf: { groups: BestOf; playoffs: BestOf; final: BestOf };
  thirdPlace: boolean;
  bracketReset: boolean;
  /** 1–8. */
  groups: number;
  /** Clasificados por grupo, 1–4. */
  perGroup: number;
  playoffs: 'single' | 'double';
  doubleRoundRobin: boolean;
  /** Empates en grupos o liga (solo EA SPORTS FC al mejor de 1). */
  draws: boolean;
  /** '' salvo NBA 2K: la plataforma del torneo, obligatoria. */
  platform: string;
  /** Juegos de pelea. */
  roundsToWin?: 2 | 3;
  /** Smash (1–5). */
  stocks?: number;
  br?: { placementPoints: number[]; killPoints: number; rounds: number; gamesPerRound: number };
}

export const FORMAT_LABEL: Record<Format, string> = {
  single_elim: 'Eliminación simple',
  double_elim: 'Doble eliminación',
  groups_playoffs: 'Grupos + playoffs',
  round_robin: 'Todos contra todos',
  br: 'Battle royale',
};

export const ENTRY_LABEL: Record<EntryType, string> = {
  teams: 'Solo equipos',
  open: 'Libre',
};

const MATCH_FORMATS: readonly Format[] = ['single_elim', 'double_elim', 'groups_playoffs', 'round_robin'];

/** BR: ['br']; el resto: los 4 formatos de partidos. */
export function formatsFor(game: GameId): Format[] {
  return GAMES[game].kind === 'br' ? ['br'] : MATCH_FORMATS.slice();
}

/** Modo individual (y los duelos): solo «Libre»; el resto: «Solo equipos» y «Libre». */
export function entryTypesFor(game: GameId, mode: Mode): EntryType[] {
  return isIndividualMode(mode) || GAMES[game].kind === 'duel' ? ['open'] : ['teams', 'open'];
}

/** Suplentes por defecto según el modo (§2.1), sin pasar del máximo del juego. */
const DEFAULT_SUBS: Readonly<Record<Mode, number>> = { '1v1': 0, solo: 0, '2v2': 1, duo: 1, '3v3': 1, trio: 1, squad: 1, quad: 1, '5v5': 2 };

/** Los ajustes por defecto del juego, el modo y el formato (el teléfono los manda todos). */
export function defaultSettings(game: GameId, mode: Mode, format: Format): TournamentSettings {
  const meta = GAMES[game];
  const isBr = meta.kind === 'br' || format === 'br';
  const bo = meta.defaultBestOf;
  const s: TournamentSettings = {
    subs: Math.min(DEFAULT_SUBS[mode] ?? 0, subsMaxFor(game, mode)),
    autoApprove: false,
    requireConfirmedId: false,
    requireVerifiedRank: false,
    seeding: 'random',
    bestOf: isBr || !bo ? { groups: 1, playoffs: 1, final: 1 } : { groups: bo.groups, playoffs: bo.playoffs, final: bo.final },
    thirdPlace: false,
    bracketReset: true,
    groups: 2,
    perGroup: 2,
    playoffs: 'single',
    doubleRoundRobin: false,
    draws: game === 'ea_fc',
    platform: '',
  };
  if (meta.roundsToWin) s.roundsToWin = meta.roundsToWin.default;
  if (meta.stocks) s.stocks = meta.stocks.default;
  if (isBr && meta.br) s.br = { placementPoints: meta.br.placementPoints.slice(), killPoints: meta.br.killPoints, rounds: 1, gamesPerRound: 4 };
  return s;
}

/**
 * Los pedidos de ID y de rango según lo que el juego puede comprobar: «Pedir ID confirmado» queda apagado si el juego
 * no tiene cómo comprobar el ID (`canVerifyId`) y «Pedir rango verificado», si su rango no sale verificado
 * (`canVerifyRank`, solo LoL). La base también los ignora en esos juegos. Si no cambia nada, devuelve los mismos.
 */
export function normalizeVerifyFlags<T extends Pick<TournamentSettings, 'requireConfirmedId' | 'requireVerifiedRank'>>(game: GameId, s: T): T {
  const id = s.requireConfirmedId === true && canVerifyId(game);
  const rank = s.requireVerifiedRank === true && canVerifyRank(game);
  return id === s.requireConfirmedId && rank === s.requireVerifiedRank ? s : { ...s, requireConfirmedId: id, requireVerifiedRank: rank };
}

const SETTING_KEYS = new Set([
  'subs',
  'autoApprove',
  'requireConfirmedId',
  'requireVerifiedRank',
  'seeding',
  'bestOf',
  'thirdPlace',
  'bracketReset',
  'groups',
  'perGroup',
  'playoffs',
  'doubleRoundRobin',
  'draws',
  'platform',
  'roundsToWin',
  'stocks',
  'br',
]);
const BOOL_KEYS = ['autoApprove', 'requireConfirmedId', 'requireVerifiedRank', 'thirdPlace', 'bracketReset', 'doubleRoundRobin', 'draws'] as const;
const BOOL_TEXT: Record<(typeof BOOL_KEYS)[number], string> = {
  autoApprove: 'Aprobar solo',
  requireConfirmedId: 'Pedir ID confirmado',
  requireVerifiedRank: 'Pedir rango verificado',
  thirdPlace: '3.er lugar',
  bracketReset: 'Reinicio de la gran final',
  doubleRoundRobin: 'Ida y vuelta',
  draws: 'Empates',
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/**
 * Errores de los ajustes (vacío = bien). Primero la forma de cada clave (la misma tabla que `esp_settings_ok`: una
 * clave que no está es inválida; las que faltan se aceptan, salvo la plataforma de NBA 2K) y después, solo aquí, lo
 * que cruza con el formato y el cupo (`maxEntries`). Pedir ID confirmado o rango verificado en un juego que no los
 * puede comprobar no es un error: no cuenta (`normalizeVerifyFlags`).
 */
export function validateSettings(game: GameId, mode: Mode, format: Format, entry: EntryType, maxEntries: number, s: unknown): string[] {
  const meta = GAMES[game];
  const errors: string[] = [];
  if (!modeOk(game, mode)) errors.push(`${meta.name} no se juega en ${modeLabel(mode)}.`);
  if (!formatsFor(game).includes(format)) errors.push(meta.kind === 'br' ? `${meta.name} es battle royale: el formato es «Battle royale».` : `«Battle royale» no es un formato de ${meta.name}.`);
  if (!entryTypesFor(game, mode).includes(entry)) errors.push('En este modo cada quien se inscribe solo: la entrada es «Libre».');
  if (!isObj(s)) {
    errors.push('Faltan los ajustes del torneo.');
    return errors;
  }

  for (const k of Object.keys(s)) if (!SETTING_KEYS.has(k)) errors.push(`Ajuste desconocido: ${k}.`);

  const subsMax = subsMaxFor(game, mode);
  if (s.subs !== undefined && !isInt(s.subs, 0, Math.min(2, subsMax))) {
    errors.push(subsMax === 0 ? 'En este modo no hay suplentes.' : `Los suplentes van de 0 a ${Math.min(2, subsMax)}.`);
  }
  for (const k of BOOL_KEYS) if (s[k] !== undefined && typeof s[k] !== 'boolean') errors.push(`«${BOOL_TEXT[k]}» tiene que ser sí o no.`);
  if (s.seeding !== undefined && !['manual', 'random', 'rank'].includes(s.seeding as string)) errors.push('Elige cómo sembrar: a mano, al azar o por rango.');

  if (s.bestOf !== undefined) {
    const bo = s.bestOf;
    const allowed: readonly number[] = meta.kind === 'br' ? [1, 3, 5, 7] : meta.bestOf;
    const ok =
      isObj(bo) &&
      Object.keys(bo).length === 3 &&
      (['groups', 'playoffs', 'final'] as const).every((k) => typeof bo[k] === 'number' && allowed.includes(bo[k] as number));
    if (!ok) errors.push(`En ${meta.name} se juega al mejor de ${listText(meta.bestOf.length ? meta.bestOf : [1])}.`);
  }
  if (s.groups !== undefined && !isInt(s.groups, 1, 8)) errors.push('Los grupos van de 1 a 8.');
  if (s.perGroup !== undefined && !isInt(s.perGroup, 1, 4)) errors.push('Los clasificados por grupo van de 1 a 4.');
  if (s.playoffs !== undefined && s.playoffs !== 'single' && s.playoffs !== 'double') errors.push('Los playoffs son de eliminación simple o doble.');

  const platforms = meta.idInfo.platforms;
  if (platforms.length) {
    if (typeof s.platform !== 'string' || !platforms.some((p) => p.id === s.platform)) errors.push('Elige la plataforma.');
  } else if (s.platform !== undefined && s.platform !== '') errors.push(`${meta.name} no lleva plataforma.`);

  if (s.roundsToWin !== undefined) {
    const opts = meta.roundsToWin?.options;
    if (!opts) errors.push(`${meta.name} no lleva rondas para ganar.`);
    else if (!opts.includes(s.roundsToWin as 2 | 3)) errors.push(opts.length === 1 ? `En ${meta.name} se gana con ${opts[0]} rondas.` : `Las rondas para ganar son ${listText(opts)}.`);
  }
  if (s.stocks !== undefined) {
    if (!meta.stocks) errors.push(`${meta.name} no lleva vidas.`);
    else if (!isInt(s.stocks, meta.stocks.min, meta.stocks.max)) errors.push(`Las vidas van de ${meta.stocks.min} a ${meta.stocks.max}.`);
  }
  if (s.br !== undefined) {
    if (meta.kind !== 'br') errors.push(`${meta.name} no es battle royale.`);
    else errors.push(...brErrors(s.br));
  }

  // Cruces (solo en el teléfono).
  const cap = maxEntriesFor(game, mode, format);
  const min = minEntries(format);
  if (!Number.isInteger(maxEntries) || maxEntries < min || maxEntries > cap) {
    if (format === 'double_elim' && maxEntries < 4) errors.push('Para doble eliminación hacen falta al menos 4.');
    else errors.push(`El cupo va de ${min} a ${cap}.`);
  }
  if (format === 'groups_playoffs' && isInt(s.groups ?? 2, 1, 8) && isInt(s.perGroup ?? 2, 1, 4)) {
    const groups = (s.groups ?? 2) as number;
    const perGroup = (s.perGroup ?? 2) as number;
    const through = groups * perGroup;
    if (through < 2) errors.push('A los playoffs tienen que pasar al menos 2.');
    else if (through > maxEntries) errors.push(`Pasan ${through} a los playoffs y el cupo es de ${maxEntries}.`);
    else if (Math.floor(maxEntries / groups) < perGroup + 1) {
      errors.push(`Cada grupo necesita al menos ${perGroup + 1}: con ${groups} grupos, el cupo tiene que ser de ${groups * (perGroup + 1)} o más.`);
    }
    if (s.playoffs === 'double' && through >= 2 && through < 4) errors.push('Para doble eliminación hacen falta al menos 4.');
  }
  return errors;
}

function brErrors(v: unknown): string[] {
  if (!isObj(v)) return ['Faltan los puntos del battle royale.'];
  const out: string[] = [];
  for (const k of Object.keys(v)) if (!['placementPoints', 'killPoints', 'rounds', 'gamesPerRound'].includes(k)) out.push(`Ajuste desconocido: br.${k}.`);
  const pp = v.placementPoints;
  if (!Array.isArray(pp) || pp.length < 1 || pp.length > 100 || !pp.every((x) => isInt(x, 0, 100))) {
    out.push('Los puntos por puesto son de 1 a 100 números, cada uno de 0 a 100.');
  }
  if (!isInt(v.killPoints, 0, 10)) out.push('Los puntos por kill van de 0 a 10.');
  if (!isInt(v.rounds, 1, 10)) out.push('Las rondas van de 1 a 10.');
  if (!isInt(v.gamesPerRound, 1, 12)) out.push('Las partidas por ronda van de 1 a 12.');
  return out;
}

/** «1, 3 o 5». */
function listText(xs: readonly number[]): string {
  if (xs.length <= 1) return xs.join('');
  return `${xs.slice(0, -1).join(', ')} o ${xs[xs.length - 1]}`;
}
