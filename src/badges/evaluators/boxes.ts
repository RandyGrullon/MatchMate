/**
 * Liga por cajas y escalera (docs/insignias.md §2.9): la cima de tu caja y subir de caja al cerrar un mes de cajas
 * (`box_month`, con la foto del mes que guarda el trabajo `cajas` antes de la poda), y el número 1 de la escalera
 * (`ladder_month`, con la foto de los peldaños del día 1). El servidor recalcula las cajas con
 * src/sports/formats/box.ts y las tablas de raqueta; no usa lo que calculó el teléfono.
 */
import { badgeDef, paramOf } from '../catalog';
import { MAX_SHARED, weightyMonth } from '../rules/gates';
import { monthOf, periodKey } from '../rules/periods';
import { isR1, r2Reason } from '../rules/racket';
import { isFinal, type Match } from '../../lib/data/matchCore';
import { pairStandings, playerSide } from '../../pages/sports/racket/logic/results';
import { closeBoxMonth, type BoxMove } from '../../sports/formats/box';
import { isGameSport, type RacketSport } from '../../sports/racket/rules';
import type { StandingRow } from '../../sports/types';
import type { SnapLadderRung } from '../snapshot';
import type { BadgeDecision, BadgeDef } from '../types';
import { awardOf, dayIn, eventCtx, isRacketSport, kitOf, leagueCtx, playerHolderOf, realOn, refId, type Evaluator, type Kit } from './kit';
import { matchCtx } from './racket';

const def = (key: string): BadgeDef => badgeDef(key)!;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x) : []);
const int = (v: unknown, dflt: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : dflt);

/** Jugadores de un participante de caja o escalera: el jugador, o la pareja de temporada. */
const peopleOf = (kit: Kit, id: string): string[] => (kit.teams.has(id) || kit.rosterOf(id).length ? [...kit.rosterOf(id)] : [id]);

// ---------------------------------------------------------------------------------------------------------
// Mes de cajas

/** La foto de un mes de cajas que guarda el trabajo (`payload`), como la escribe `save_box_month`. */
export interface BoxPhoto {
  eventId: string;
  n: number;
  start: string | null;
  end: string | null;
  boxes: string[][];
  moves: BoxMove[];
  rules: { up: number; down: number; minToPromote: number; minToStay: number; min: number; max: number };
  points: 'standard' | '2-0';
}

/**
 * Lee la foto del trabajo `cajas`: `ref = 'box:<evento>:<mes>'` y `payload = {month: config.months[n-1] (con
 * `boxes` y `moves`), rules: config.rules, points: config.points}`.
 */
export function boxPhoto(ref: string, payload: Record<string, unknown>): BoxPhoto | null {
  const id = refId(ref, 'box');
  const [eventId, nText] = id ? id.split(':') : [];
  const month = isObj(payload.month) ? payload.month : null;
  if (!eventId || !month) return null;
  const r = isObj(payload.rules) ? payload.rules : {};
  const moves = (Array.isArray(month.moves) ? month.moves : []).filter(isObj).flatMap((m): BoxMove[] => {
    const move = m.move === 'sube' || m.move === 'baja' || m.move === 'queda' || m.move === 'nuevo' ? m.move : null;
    return typeof m.id === 'string' && move ? [{ id: m.id, from: typeof m.from === 'number' ? m.from : null, to: int(m.to, 0), move }] : [];
  });
  return {
    eventId,
    n: int(month.n, Number(nText) || 0),
    start: typeof month.start === 'string' ? month.start : null,
    end: typeof month.end === 'string' ? month.end : null,
    boxes: (Array.isArray(month.boxes) ? month.boxes : []).map(strList).filter((b) => b.length > 0),
    moves,
    rules: { up: int(r.up, 2), down: int(r.down, 2), minToPromote: int(r.minToPromote, 2), minToStay: int(r.minToStay, 2), min: int(r.min, 4), max: int(r.max, 6) },
    points: payload.points === '2-0' ? '2-0' : 'standard',
  };
}

/** Tabla de cada caja del mes con los desempates del deporte (como `boxTables` de la app). */
export function boxTablesOf(kit: Kit, sport: RacketSport, photo: BoxPhoto, matches: readonly Match[]): StandingRow[][] {
  const list = matches.filter((m) => m.eventId === photo.eventId && m.round === photo.n && m.status !== 'void');
  return photo.boxes.map((box, b) => pairStandings(sport, box, list, { scheme: photo.points, now: kit.now, lotSeed: `${photo.eventId}:${photo.n}:${b}` }));
}

/** Partidos R1 del mes de cada participante (un jugador de la pareja basta). */
function r1Count(kit: Kit, photo: BoxPhoto, id: string): number {
  const people = peopleOf(kit, id);
  return kit.matches.filter((m) => m.eventId === photo.eventId && m.round === photo.n && people.some((p) => isR1(m, p, matchCtx(kit, m)))).length;
}

export const boxMonth: Evaluator = (job, snap, now) => {
  const kit = kitOf(job, snap, now);
  const photo = boxPhoto(job.ref, job.payload ?? {});
  const event = photo ? kit.events.get(photo.eventId) : undefined;
  const league = event ? kit.leagues.get(event.league_id) : undefined;
  const sport = league?.sport;
  if (!photo || !event || !league || !isRacketSport(sport)) return [];
  const date = photo.end ?? photo.start ?? event.date;
  const month = monthOf(date);
  if (!realOn(kit, league.id, date)) return [];
  const top = def('box_top_month');
  const promoted = def('box_promoted');
  const tables = boxTablesOf(kit, sport, photo, kit.matches);
  const out: BadgeDecision[] = [];
  const ctx = { ...leagueCtx(kit, league.id), ...eventCtx(kit, event.id) };
  const give = (d: BadgeDef, id: string, values: Record<string, number | string>) => {
    for (const p of peopleOf(kit, id)) out.push(awardOf(d, playerHolderOf(p, league.id), sport, 0, periodKey.box(event.id, photo.n), 'firme', [`event:${event.id}`], { ...ctx, values }));
  };

  // Cima de la caja: caja con 3+ que jugaron 2+ partidos R1; primero por victorias y diferencia de juegos (en tenis y
  // pádel `diff` son juegos; en pickleball y ping pong `diff` son puntos y los juegos van en `extra.gamesDiff`).
  const minPlayers = paramOf(top, 'minPlayers', sport) ?? 3;
  const minMatches = paramOf(top, 'minMatches', sport) ?? 2;
  tables.forEach((rows, b) => {
    const active = photo.boxes[b].filter((id) => r1Count(kit, photo, id) >= minMatches);
    if (active.length < minPlayers) return;
    const games = (r: StandingRow) => (isGameSport(sport) ? Number(r.extra?.gamesDiff ?? 0) : r.diff);
    const sorted = [...rows].sort((a, c) => c.won - a.won || games(c) - games(a));
    const first = sorted[0];
    if (!first) return;
    const tied = sorted.filter((r) => r.won === first.won && games(r) === games(first));
    if (tied.length > MAX_SHARED) return;
    for (const r of tied) if (r.played >= photo.rules.minToPromote) give(top, r.id, { caja: b + 1, n: r.won });
  });

  // Subiste de caja: la foto dice que sube y el servidor, recalculando, también (solo en ligas con peso para el mes).
  const weighty = weightyMonth({ league, months: kit.leagueMonths(), profiles: kit.profiles, members: kit.snap.members ?? [] }, month);
  if (weighty) {
    const recalc = closeBoxMonth(photo.boxes, tables, photo.rules);
    const up = new Map(recalc.moves.filter((m) => m.move === 'sube').map((m) => [m.id, m.to]));
    for (const m of photo.moves) {
      if (m.move === 'sube' && up.has(m.id)) give(promoted, m.id, { caja: up.get(m.id)! + 1 });
    }
  }
  return out;
};

// ---------------------------------------------------------------------------------------------------------
// Escalera

/**
 * Número 1 de la escalera (§2.9 `ladder_top`): en la foto del día 1 (`payload.rungs`, o `snapshot.ladder_rungs`)
 * está en el puesto 1 de una escalera de 8+ peldaños y durante el mes ganó como retador o defendió el puesto en un
 * reto jugado, con partido R2. Así no cuenta que el admin lo ponga primero con `set_ladder`.
 */
export const ladderMonth: Evaluator = (job, snap, now) => {
  const kit = kitOf(job, snap, now);
  const d = def('ladder_top');
  const id = refId(job.ref, 'ladder');
  const [eventId, month] = id ? [id.slice(0, id.lastIndexOf(':')), id.slice(id.lastIndexOf(':') + 1)] : [];
  const event = eventId ? kit.events.get(eventId) : undefined;
  const league = event ? kit.leagues.get(event.league_id) : undefined;
  const sport = league?.sport;
  if (!event || !league || !isRacketSport(sport) || !/^\d{4}-\d{2}$/.test(month ?? '')) return [];
  const photo = (Array.isArray(job.payload?.rungs) ? (job.payload.rungs as SnapLadderRung[]) : (snap.ladder_rungs ?? [])).filter((r) => r.event_id === event.id);
  if (photo.length < (paramOf(d, 'minRungs', sport) ?? 8)) return [];
  const first = photo.find((r) => r.position === 1);
  if (!first || !realOn(kit, league.id, `${month}-01`)) return [];
  const e = first.entrant_id;
  const people = peopleOf(kit, first.team_id ?? first.player_id ?? e);
  const byId = new Map(kit.matches.map((m) => [m.id, m]));
  const won = (snap.ladder_challenges ?? []).filter((c) => {
    if (c.event_id !== event.id || c.status !== 'played' || c.winner !== e || (c.challenger !== e && c.challenged !== e) || !c.match_id) return false;
    if (dayIn(kit, c.resolved_at, league.id)?.slice(0, 7) !== month) return false;
    const m = byId.get(c.match_id);
    return !!m && isFinal(m, kit.now) && people.some((p) => playerSide(m, p, kit.rosterOf) && r2Reason(m, p, matchCtx(kit, m)));
  });
  if (!won.length) return [];
  return people.map((p) =>
    awardOf(d, playerHolderOf(p, league.id), sport, 0, periodKey.month(month!), 'firme', won.map((c) => `match:${c.match_id}`), {
      ...leagueCtx(kit, league.id),
      ...eventCtx(kit, event.id),
      values: { peldanos: photo.length, retos: won.length },
    }),
  );
};
