/**
 * El ID de cada juego (docs/esports.md §2.4 y §3.1): la forma que se acepta, cómo se muestra y su forma normalizada,
 * que es la identidad junto con el juego y la plataforma. Es la misma tabla que `private.esp_normalize_id`.
 *
 * - Primero se quitan los espacios de los extremos; «juntar espacios» = cada grupo de espacios pasa a uno.
 * - `lower` es solo de ASCII (A–Z → a–z): «ÑANDÚ» y «ñandú» son IDs distintos, igual que en la base (`translate`).
 * - La región no entra en la identidad; la plataforma solo en NBA 2K.
 */
import { GAMES, type GameId } from './catalog';

export interface NormalizedId {
  display: string;
  normalized: string;
}

/** 'confirmado' = comprobado (conectando la cuenta o con la búsqueda); si no, 'pendiente' (declarado). */
export type IdStatus = 'pendiente' | 'confirmado';
/**
 * De dónde sale el ID: 'declarado' (lo escribió la persona; no es exclusivo), 'busqueda' (la API de Riot lo encontró;
 * tampoco es exclusivo) o 'login' (entró con su cuenta de Epic, Steam o Riot: es suyo y de nadie más).
 */
export type Ownership = 'declarado' | 'busqueda' | 'login';

export const OWNERSHIP_LABEL: Record<Ownership, string> = {
  declarado: 'Declarado',
  busqueda: 'Comprobado',
  login: 'Cuenta conectada',
};

/** SteamID64 de la cuenta 0: el código de amigo es SteamID64 − esto. */
const STEAM_BASE = 76561197960265728n;
const STEAM_MAX_ACCOUNT = 4294967295n;

/** Solo ASCII: A–Z → a–z (igual que `translate` en SQL). */
export const asciiLower = (s: string): string => s.replace(/[A-Z]/g, (c) => c.toLowerCase());
/** Solo ASCII: a–z → A–Z. */
const asciiUpper = (s: string): string => s.replace(/[a-z]/g, (c) => c.toUpperCase());
const trimSpaces = (s: string): string => s.replace(/^\s+|\s+$/g, '');
const joinSpaces = (s: string): string => s.replace(/\s+/g, ' ');
const noSpaces = (s: string): string => s.replace(/\s+/g, '');
/** Largo en caracteres (como `char_length`), no en unidades UTF-16. */
const len = (s: string): number => [...s].length;

type Result = NormalizedId | null;

function riot(s: string): Result {
  const at = s.lastIndexOf('#');
  if (at < 0) return null;
  const name = joinSpaces(s.slice(0, at));
  const tag = s.slice(at + 1);
  if (len(name) < 3 || len(name) > 16 || !/^[A-Za-z0-9]{3,5}$/.test(tag)) return null;
  return { display: `${name}#${tag}`, normalized: `${asciiLower(name)}#${asciiLower(tag)}` };
}

function steam(s: string): Result {
  const digits = noSpaces(s);
  if (!/^\d+$/.test(digits)) return null;
  let account: bigint;
  if (digits.length === 17 && digits.startsWith('7656119')) account = BigInt(digits) - STEAM_BASE;
  else if (digits.length >= 1 && digits.length <= 10) account = BigInt(digits);
  else return null;
  if (account < 1n || account > STEAM_MAX_ACCOUNT) return null;
  return { display: digits, normalized: account.toString() };
}

function mlbb(s: string): Result {
  const m = /^(\d{5,12})\s*\(?\s*(\d{1,5})\s*\)?$/.exec(s);
  if (!m) return null;
  return { display: `${m[1]} (${m[2]})`, normalized: `${m[1]}:${m[2]}` };
}

/** Epic y el usuario de la consola: juntar espacios, de 3 a 16 (Epic, sin #). */
function freeName(s: string, noHash: boolean): Result {
  const name = joinSpaces(s);
  if (len(name) < 3 || len(name) > 16 || (noHash && name.includes('#'))) return null;
  return { display: name, normalized: asciiLower(name) };
}

function ea(s: string): Result {
  if (!/^[A-Za-z0-9_.-]{4,16}$/.test(s)) return null;
  return { display: s, normalized: asciiLower(s) };
}

function buckler(s: string): Result {
  const digits = noSpaces(s);
  if (!/^\d{10}$/.test(digits)) return null;
  return { display: digits, normalized: digits };
}

function tekken(s: string): Result {
  const m = /^([A-Za-z0-9]{4})-?([A-Za-z0-9]{4})-?([A-Za-z0-9]{4})$/.exec(noSpaces(s));
  if (!m) return null;
  return { display: `${m[1]}-${m[2]}-${m[3]}`, normalized: asciiLower(m[1] + m[2] + m[3]) };
}

function nintendo(s: string): Result {
  const digits = s.replace(/[\s-]+/g, '').replace(/^sw/i, '');
  if (!/^\d{12}$/.test(digits)) return null;
  return { display: `SW-${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8)}`, normalized: digits };
}

function clash(s: string): Result {
  const tag = asciiUpper(noSpaces(s).replace(/^#/, ''));
  if (!/^[0289PYLQGRJCUV]{3,12}$/.test(tag)) return null;
  return { display: `#${tag}`, normalized: asciiLower(tag) };
}

function digits(s: string, min: number): Result {
  const d = noSpaces(s);
  if (!/^\d+$/.test(d) || d.length < min || d.length > 12) return null;
  return { display: d, normalized: d };
}

function activision(s: string): Result {
  const at = s.lastIndexOf('#');
  if (at < 0) return null;
  const name = joinSpaces(s.slice(0, at));
  const num = s.slice(at + 1);
  if (len(name) < 2 || len(name) > 16 || !/^\d{4,8}$/.test(num)) return null;
  return { display: `${name}#${num}`, normalized: `${asciiLower(name)}#${num}` };
}

/**
 * Normaliza lo que escribió la persona: `{ display, normalized }` o un error en español («Escribe tu {label}.»,
 * «Así no es un {label}: {placeholder}.», «Elige la plataforma.» en NBA 2K sin plataforma).
 */
export function normalizeGameId(game: GameId, raw: string, platform?: string): NormalizedId | { error: string } {
  const info = GAMES[game].idInfo;
  const s = trimSpaces(typeof raw === 'string' ? raw : '');
  if (!s) return { error: `Escribe tu ${info.label}.` };
  if (info.platforms.length && !info.platforms.some((p) => p.id === platform)) return { error: 'Elige la plataforma.' };
  let out: Result = null;
  switch (info.kind) {
    case 'riot':
      out = riot(s);
      break;
    case 'steam':
      out = steam(s);
      break;
    case 'mlbb':
      out = mlbb(s);
      break;
    case 'epic':
      out = freeName(s, true);
      break;
    case 'ea':
      out = ea(s);
      break;
    case 'console':
      out = freeName(s, false);
      break;
    case 'buckler':
      out = buckler(s);
      break;
    case 'tekken':
      out = tekken(s);
      break;
    case 'nintendo':
      out = nintendo(s);
      break;
    case 'cr':
      out = clash(s);
      break;
    case 'digits':
      out = digits(s, game === 'free_fire' ? 6 : 5);
      break;
    case 'activision':
      out = activision(s);
      break;
  }
  // Lo mismo que piden las columnas id_display e id_normalized (2–40).
  if (!out || len(out.display) < 2 || len(out.display) > 40 || len(out.normalized) < 2 || len(out.normalized) > 40) {
    return { error: `Así no es un ${info.label}: ${info.placeholder}.` };
  }
  return out;
}

/** Plataformas del ID del juego ([] = no aplica: platform ''). */
export function idPlatforms(game: GameId): readonly { id: string; label: string }[] {
  return GAMES[game].idInfo.platforms;
}

/** Regiones del juego ([] = no aplica: region ''). Solo sirven para buscar el rango. */
export function idRegions(game: GameId): readonly { id: string; label: string }[] {
  return GAMES[game].idInfo.regions;
}
