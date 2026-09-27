/**
 * Liga por cajas mensual (tenis, pickleball y pádel): configuración guardada en events.config, cajas del primer
 * mes por nivel, partidos del mes (todos contra todos dentro de cada caja, fechas que acuerdan ellos), tabla de
 * cada caja con los desempates del deporte y el cierre del mes (suben y bajan con closeBoxMonth). Puro: usa
 * src/sports/formats (box, roundRobin) y las tablas de raqueta (pairStandings).
 *
 * La base (save_box_month, 20260927000700_raqueta.sql) guarda `months` y `round`; el resto lo escribe el admin
 * con update_event (que reemplaza la configuración entera: por eso boxConfigJson lleva todo).
 */
import type { Match, MatchDraft } from '../../../../lib/data/matches';
import { boxSizes, closeBoxMonth, makeBoxes, roundRobin, type BoxMove } from '../../../../sports/formats';
import type { RacketSport } from '../../../../sports/racket';
import type { StandingRow } from '../../../../sports/types';
import type { ScheduleEntrant } from '../../racket/logic/league';
import { isFinal } from '../../../../lib/data/matches';
import { pairStandings, type PointsScheme } from '../../racket/logic/results';

export interface BoxRules {
  /** Tamaño de las cajas (4 a 6). */
  min: number;
  max: number;
  /** Cuántos suben y bajan de cada caja (2 y 2). */
  up: number;
  down: number;
  /** Partidos mínimos para subir y para salvarse (2 y 2): quien juega menos, baja. */
  minToPromote: number;
  minToStay: number;
}

export interface BoxMonth {
  /** Mes 1, 2, 3… (es el `round` de sus partidos). */
  n: number;
  /** «Octubre 2026». */
  label: string;
  /** 'YYYY-MM-DD' o null. */
  start: string | null;
  end: string | null;
  /** Cajas de arriba abajo: ids de jugadores (individual) o parejas de temporada (dobles). */
  boxes: string[][];
  closed: boolean;
  /** Quién subió y quién bajó al cerrar el mes. */
  moves: BoxMove[];
}

export interface BoxConfig {
  v: 1;
  format: 'cajas';
  /** Cajas de parejas de temporada (true) o de jugadores. */
  doubles: boolean;
  rules: BoxRules;
  /** Puntos de la tabla de cada caja. */
  points: PointsScheme;
  /** Quiénes juegan (los nuevos entran abajo al cerrar el mes; los que se van salen). */
  entrants: string[];
  months: BoxMonth[];
  /** Último mes abierto (lo escribe la base). */
  round: number;
}

export const DEFAULT_BOX_RULES: BoxRules = { min: 4, max: 6, up: 2, down: 2, minToPromote: 2, minToStay: 2 };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const strList = (v: unknown, max = 200) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x).slice(0, max) : []);
const int = (v: unknown, min: number, max: number, dflt: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : dflt;
const day = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

function parseRules(raw: unknown): BoxRules {
  const r = isObj(raw) ? raw : {};
  const min = int(r.min, 3, 8, DEFAULT_BOX_RULES.min);
  const max = Math.max(min, int(r.max, 3, 10, DEFAULT_BOX_RULES.max));
  return {
    min,
    max,
    up: int(r.up, 0, 4, DEFAULT_BOX_RULES.up),
    down: int(r.down, 0, 4, DEFAULT_BOX_RULES.down),
    minToPromote: int(r.minToPromote, 0, 10, DEFAULT_BOX_RULES.minToPromote),
    minToStay: int(r.minToStay, 0, 10, DEFAULT_BOX_RULES.minToStay),
  };
}

function parseMove(raw: unknown): BoxMove | null {
  if (!isObj(raw) || typeof raw.id !== 'string') return null;
  const move = raw.move === 'sube' || raw.move === 'baja' || raw.move === 'queda' || raw.move === 'nuevo' ? raw.move : null;
  if (!move) return null;
  const out: BoxMove = { id: raw.id, from: typeof raw.from === 'number' ? raw.from : null, to: int(raw.to, 0, 99, 0), move };
  if (raw.reason === 'pocos-partidos') out.reason = 'pocos-partidos';
  return out;
}

/** events.config → BoxConfig con todo lo que falte puesto (datos viejos o a medias no rompen la pantalla). */
export function parseBoxConfig(raw: unknown): BoxConfig {
  const c = isObj(raw) ? raw : {};
  const months: BoxMonth[] = (Array.isArray(c.months) ? c.months : []).filter(isObj).map((m, i) => ({
    n: int(m.n, 1, 120, i + 1),
    label: typeof m.label === 'string' ? m.label.slice(0, 40) : '',
    start: day(m.start),
    end: day(m.end),
    boxes: (Array.isArray(m.boxes) ? m.boxes : []).map((b) => strList(b, 12)).filter((b) => b.length > 0),
    closed: m.closed === true,
    moves: (Array.isArray(m.moves) ? m.moves : []).map(parseMove).filter((x): x is BoxMove => !!x),
  }));
  return {
    v: 1,
    format: 'cajas',
    doubles: c.doubles === true,
    rules: parseRules(c.rules),
    points: c.points === '2-0' ? '2-0' : 'standard',
    entrants: [...new Set(strList(c.entrants))],
    months,
    round: int(c.round, 0, 120, months.length),
  };
}

/** Lo que se guarda con update_event (la configuración entera, meses incluidos). */
export const boxConfigJson = (c: BoxConfig): Record<string, unknown> => ({
  v: 1,
  format: 'cajas',
  doubles: c.doubles,
  rules: c.rules,
  points: c.points,
  entrants: c.entrants,
  months: c.months,
  round: c.round,
});

/** El mes abierto (el último sin cerrar) o null. */
export const openMonth = (c: BoxConfig): BoxMonth | null => {
  const last = c.months.at(-1);
  return last && !last.closed ? last : null;
};

// ---------------------------------------------------------------------------------------------------------
// Meses: nombre y fechas

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** '2026-10-01' → «Octubre 2026». */
export function monthLabel(date: string): string {
  const [y, m] = date.split('-').map(Number);
  if (!y || !m) return '';
  const name = MONTHS[m - 1];
  return `${name[0].toUpperCase()}${name.slice(1)} ${y}`;
}

/** Primer y último día del mes de esa fecha. */
export function monthRange(date: string): { start: string; end: string } {
  const [y, m] = date.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const two = (n: number) => String(n).padStart(2, '0');
  return { start: `${y}-${two(m)}-01`, end: `${y}-${two(m)}-${two(last)}` };
}

/** El mes que sigue al que termina en `end` (o el de `today` si no hay). */
export function nextMonthRange(end: string | null, today: string): { start: string; end: string; label: string } {
  let base = today;
  if (end) {
    const [y, m] = end.split('-').map(Number);
    const next = new Date(Date.UTC(y, m, 1));
    base = next.toISOString().slice(0, 10);
    if (base < today.slice(0, 8) + '01') base = today;
  }
  const r = monthRange(base);
  return { ...r, label: monthLabel(r.start) };
}

// ---------------------------------------------------------------------------------------------------------
// Cajas y partidos

/** Nivel de un participante: el del jugador, o la suma de los dos de la pareja (null si no se sabe de nadie). */
export function entrantLevel(e: ScheduleEntrant, levels: Readonly<Record<string, number>>): number | null {
  const known = e.players.map((p) => levels[p]).filter((x): x is number => x != null);
  if (!known.length) return null;
  return Math.round(known.reduce((a, b) => a + b, 0) * 1000) / 1000;
}

/**
 * Cajas del primer mes: por nivel, de mejor a peor (sin nivel, al final en el orden de la lista), con tamaños
 * parejos entre `min` y `max`.
 */
export function firstBoxes(entrants: readonly ScheduleEntrant[], levels: Readonly<Record<string, number>>, rules: BoxRules = DEFAULT_BOX_RULES): string[][] {
  const seeded = entrants
    .map((e, i) => ({ id: e.id, lv: entrantLevel(e, levels), i }))
    .sort((a, b) => (b.lv ?? -1) - (a.lv ?? -1) || a.i - b.i)
    .map((x) => x.id);
  return makeBoxes(seeded, { min: rules.min, max: rules.max });
}

/** Cuántas cajas y de qué tamaño quedan con esa cantidad. */
export const previewSizes = (n: number, rules: BoxRules = DEFAULT_BOX_RULES) => boxSizes(n, { min: rules.min, max: rules.max });

/** «Caja 1», «Caja 2»… (es el `stage` de los partidos). */
export const boxName = (i: number) => `Caja ${i + 1}`;

/**
 * Partidos del mes: todos contra todos dentro de cada caja (sin fecha: la acuerdan ellos antes de fin de mes).
 * `stage` = «Caja N»; la base les pone el evento, el mes (round) y el formato.
 */
export function monthDrafts(boxes: readonly (readonly string[])[], entrant: (id: string) => ScheduleEntrant, opts: { rules?: Record<string, unknown> } = {}): MatchDraft[] {
  const out: MatchDraft[] = [];
  boxes.forEach((box, b) => {
    for (const r of roundRobin(box)) {
      for (const f of r.matches) {
        const side = (id: string, s: 1 | 2) => {
          const e = entrant(id);
          return { side: s, teamId: e.team ? e.id : null, players: e.players.map((playerId) => ({ playerId })) };
        };
        out.push({ stage: boxName(b), format: 'sets', ...(opts.rules ? { rules: opts.rules } : {}), sides: [side(f.home, 1), side(f.away, 2)] });
      }
    }
  });
  return out;
}

/** Partidos de ese mes. */
export const monthMatches = (matches: readonly Match[], n: number) => matches.filter((m) => m.round === n && m.status !== 'void');

/** Tabla de cada caja del mes, con los desempates del deporte. */
export function boxTables(
  sport: RacketSport,
  month: BoxMonth,
  matches: readonly Match[],
  opts: { scheme?: PointsScheme; now?: number; lotSeed?: string } = {},
): StandingRow[][] {
  const list = monthMatches(matches, month.n);
  return month.boxes.map((box, b) => pairStandings(sport, box, list, { scheme: opts.scheme, now: opts.now, lotSeed: `${opts.lotSeed ?? ''}:${month.n}:${b}` }));
}

export interface BoxProgress {
  /** Partidos del mes que ya cuentan y los que faltan. */
  done: number;
  total: number;
  /** Participantes que no llegan al mínimo para salvarse (bajarían). */
  short: string[];
}

/** Cómo va el mes: partidos jugados y quién no llega al mínimo. */
export function monthProgress(month: BoxMonth, matches: readonly Match[], tables: readonly StandingRow[][], rules: BoxRules, now = Date.now()): BoxProgress {
  const list = monthMatches(matches, month.n);
  const done = list.filter((m) => isFinal(m, now)).length;
  const short = tables.flatMap((rows, b) => (b < month.boxes.length - 1 ? rows.filter((r) => r.played < rules.minToStay).map((r) => r.id) : []));
  return { done, total: list.length, short };
}

export interface CloseResult {
  boxes: string[][];
  moves: BoxMove[];
}

/**
 * Cierra el mes con las tablas: suben los mejores, bajan los últimos y quien no jugó el mínimo; los que se van
 * salen y los nuevos entran en la última caja (src/sports/formats/box.ts).
 */
export function closeMonth(cfg: BoxConfig, month: BoxMonth, tables: readonly StandingRow[][]): CloseResult {
  const inBoxes = new Set(month.boxes.flat());
  const withdrawn = [...inBoxes].filter((id) => !cfg.entrants.includes(id));
  const newcomers = cfg.entrants.filter((id) => !inBoxes.has(id));
  const r = cfg.rules;
  return closeBoxMonth(month.boxes, tables, {
    min: r.min,
    max: r.max,
    up: r.up,
    down: r.down,
    minToPromote: r.minToPromote,
    minToStay: r.minToStay,
    withdrawn,
    newcomers,
  });
}

/** «Sube a la Caja 1», «Baja a la Caja 3 (pocos partidos)», «Se queda», «Entra en la Caja 4». */
export function moveText(m: BoxMove): string {
  if (m.move === 'nuevo') return `Entra en la ${boxName(m.to)}`;
  if (m.move === 'queda') return 'Se queda';
  const where = boxName(m.to);
  if (m.move === 'sube') return `Sube a la ${where}`;
  return `Baja a la ${where}${m.reason === 'pocos-partidos' ? ' (pocos partidos)' : ''}`;
}
