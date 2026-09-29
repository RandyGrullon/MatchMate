import { normalizeUsername, USERNAME_RULES, usernameProblem, usernameProblemText, type UsernameStatus } from '../../lib/data/people';
import type { ProfileGame, ProfileStats } from '../../lib/data/profileGames';
import { isSportId, sportMeta } from '../../sports/registry';
import type { SportId } from '../../sports/types';

/**
 * Textos y cuentas del perfil social (sin React: se prueban solos). Lo usan las tarjetas de juegos, los contadores
 * del perfil y el resumen por deporte.
 */

/** «1», «999», «1.2 mil», «15 mil», «1.3 M» (los contadores del perfil no se desbordan en el celular). */
export function compactCount(n: number): string {
  const v = Math.max(0, Math.floor(Number.isFinite(n) ? n : 0));
  if (v < 1000) return String(v);
  const fmt = (x: number) => (x >= 100 ? String(Math.round(x)) : x.toFixed(1).replace(/\.0$/, ''));
  if (v < 1_000_000) return `${fmt(v / 1000)} mil`;
  return `${fmt(v / 1_000_000)} M`;
}

/** «1 seguidor», «3 seguidores». */
export const plural = (n: number, one: string, many: string) => `${compactCount(n)} ${n === 1 ? one : many}`;

/** «@ana_perez»; null sin @usuario (una copia vieja del teléfono, hasta que se vuelve a leer). */
export function atUsername(username: string | null | undefined): string | null {
  const u = username?.trim().replace(/^@/, '');
  return u ? `@${u}` : null;
}

/** Lo que dijo la base de un @usuario (`checkUsername`); 'unknown' = no se pudo preguntar (sin señal, muchas veces). */
export interface UsernameCheck {
  value: string;
  status: UsernameStatus | 'unknown';
}

/** El texto debajo del campo «Tu usuario», su color y si «Guardar» se puede tocar. */
export interface UsernameHint {
  text: string;
  tone: 'muted' | 'ok' | 'danger';
  canSave: boolean;
  /** Esperando la respuesta de la base (o a que deje de escribir). */
  checking: boolean;
}

/**
 * Cómo va el @usuario que se escribe en /cuenta: el formato se mira aquí mismo; si está libre lo dice `check` (la
 * respuesta de la base para ese mismo valor). «Guardar» solo con uno libre o el de ahora. Si la base no pudo
 * contestar, se deja guardar: set_username vuelve a revisar todo.
 */
export function usernameHint(input: string, current: string, check: UsernameCheck | null): UsernameHint {
  const v = normalizeUsername(input);
  const muted = (text: string, canSave = false, checking = false): UsernameHint => ({ text, tone: 'muted', canSave, checking });
  const bad = (text: string): UsernameHint => ({ text, tone: 'danger', canSave: false, checking: false });
  if (!v) return muted(USERNAME_RULES);
  if (v === normalizeUsername(current)) return muted('Es tu usuario de ahora.', true);
  const problem = usernameProblem(v);
  if (problem) return bad(usernameProblemText(problem));
  if (!check || check.value !== v) return muted('Revisando…', false, true);
  switch (check.status) {
    case 'ok':
      return { text: 'Disponible', tone: 'ok', canSave: true, checking: false };
    case 'mine':
      return muted('Es tu usuario de ahora.', true);
    case 'taken':
      return bad('Ya está en uso');
    case 'reserved':
      return bad('No disponible');
    case 'invalid':
      return bad(USERNAME_RULES);
    default:
      return muted(USERNAME_RULES, true);
  }
}

/** Resumen del boliche con las series de cada participación (pinos verificados). */
export interface BowlingSummary {
  sessions: number;
  games: number;
  /** Promedio entero (0 sin juegos). */
  avg: number;
  high: number;
  bestSeries: number;
}

export function bowlingSummary(series: readonly (readonly number[])[] | null | undefined): BowlingSummary {
  let games = 0;
  let pins = 0;
  let high = 0;
  let bestSeries = 0;
  let sessions = 0;
  for (const s of series ?? []) {
    const scores = (s ?? []).filter((x) => typeof x === 'number' && Number.isFinite(x));
    if (!scores.length) continue;
    sessions += 1;
    games += scores.length;
    const sum = scores.reduce((a, b) => a + b, 0);
    pins += sum;
    high = Math.max(high, ...scores);
    bestSeries = Math.max(bestSeries, sum);
  }
  return { sessions, games, avg: games ? Math.floor(pins / games) : 0, high, bestSeries };
}

/** Porcentaje de partidos ganados (entero; 0 sin partidos). */
export const winRate = (played: number, won: number) => (played > 0 ? Math.round((won / played) * 100) : 0);

/** ¿Tiene algo para mostrar en «Estadísticas»? */
export function hasStats(s: ProfileStats | null | undefined, opts: { skipBowling?: boolean } = {}): boolean {
  if (!s) return false;
  return (
    (!opts.skipBowling && !!s.bowling && s.bowling.sessions > 0) ||
    s.matches.some((m) => m.played > 0) ||
    (!!s.golf && s.golf.rounds > 0) ||
    (!!s.swim && s.swim.results > 0)
  );
}

/**
 * Deporte con que abre la lista de juegos del perfil: el deporte en que estás si esa cuenta lo juega; si no, todos
 * (así un perfil de golf no sale vacío cuando estás en pádel).
 */
export function initialProfileSport(active: string | null | undefined, sports: readonly string[] | null | undefined): SportId | null {
  return active && isSportId(active) && (sports ?? []).includes(active) ? active : null;
}

/** Deportes conocidos de un perfil, sin repetir, en el orden en que llegan. */
export function knownSports(sports: readonly string[] | null | undefined): SportId[] {
  return [...new Set((sports ?? []).filter(isSportId))];
}

/** Nombre corto del deporte para la tarjeta («Pádel», «Fútbol sala»); un deporte que esta versión no conoce: «Otro deporte». */
export const sportShort = (sport: string | null | undefined) => sportMeta(sport)?.short ?? 'Otro deporte';

/** «Ganó», «Perdió», «Empató» o null (sin resultado) con el tono de la insignia. */
export function matchResult(g: Extract<ProfileGame, { kind: 'match' }>): { label: string; tone: 'ok' | 'danger' | 'neutral' } | null {
  const d = g.detail;
  if (!d.result) return d.walkover ? { label: 'W.O.', tone: 'neutral' } : null;
  const wo = d.walkover ? ' por W.O.' : '';
  if (d.result === 'win') return { label: `Ganó${wo}`, tone: 'ok' };
  if (d.result === 'loss') return { label: `Perdió${wo}`, tone: 'danger' };
  return { label: 'Empató', tone: 'neutral' };
}

/** Fecha corta del juego: «hoy», «ayer», «12 sept.» o «12 sept. 2025» (otro año). `today` en YYYY-MM-DD. */
export function gameDateLabel(date: string | null | undefined, today: string): string {
  if (!date || !/^\d{4}-\d{2}-\d{2}/.test(date)) return '';
  const d = date.slice(0, 10);
  if (d === today) return 'hoy';
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, day));
  const [ty, tm, td] = today.split('-').map(Number) as [number, number, number];
  const diff = Math.round((Date.UTC(ty, tm - 1, td) - t.getTime()) / 86_400_000);
  if (diff === 1) return 'ayer';
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', timeZone: 'UTC', ...(y !== ty ? { year: 'numeric' } : {}) };
  return t.toLocaleDateString('es-DO', opts);
}

/** Texto para lectores de pantalla del botón de me gusta. */
export function likeLabel(liked: boolean, likes: number): string {
  const count = likes === 1 ? '1 me gusta' : `${compactCount(likes)} me gusta`;
  return liked ? `Quitar me gusta (${count})` : `Me gusta (${count})`;
}
