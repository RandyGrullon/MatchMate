/**
 * Solo pruebas: armadores de datos realistas por deporte para las pruebas de periodo (mes, año, temporada) y de
 * cuenta: noches de boliche con fotos, partidos de raqueta confirmados por el rival, partidos de equipo anotados por
 * el admin con su acta, rondas de golf con marcadores y encuentros de natación finalizados.
 */
import { DEMO_PARS } from '../../sports/golf/demo';
import type { SwimStroke } from '../../sports/swimming/events';
import type { BadgeSnapshot, SnapEvent, SnapMatch } from '../snapshot';
import { matchSides, photoId, snapCard, snapEntry, snapEvent, snapMatch, snapMeet, snapRound, snapSwimEntry, snapSwimEvent } from '../testkit';

export type Parts = Partial<BadgeSnapshot>;

/** Junta pedazos de foto (concatena las listas). */
export function merge(...parts: Parts[]): Parts {
  const out: Record<string, unknown[]> = {};
  for (const p of parts) {
    for (const [k, v] of Object.entries(p)) {
      if (!Array.isArray(v)) continue;
      out[k] = [...(out[k] ?? []), ...v];
    }
  }
  return out as Parts;
}

export const day = (month: number, d: number, year = 2026) => `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

// ---------------------------------------------------------------------------------------------------------
// Boliche

let photos = 0;

/** Un evento de boliche con los juegos de cada jugador (todos con foto: B2). */
export function bowlingNight(id: string, date: string, scores: Record<string, number[]>, over: Partial<SnapEvent> = {}, league = 'L'): Parts {
  const events = [snapEvent(id, { date, league_id: league, games: Math.max(...Object.values(scores).map((s) => s.length)), ...over })];
  const entries = Object.entries(scores).map(([p, s]) =>
    snapEntry(`${id}-${p}`, id, p, s, s.map(() => photoId(++photos)), { league_id: league, average: Math.round(s.reduce((a, b) => a + b, 0) / s.length) }),
  );
  return { events, entries };
}

// ---------------------------------------------------------------------------------------------------------
// Partidos

/** Sets ganados por lado de un marcador «6-4 3-6 10-7». */
export function setsOf(text: string): [number, number] {
  const out: [number, number] = [0, 0];
  for (const t of text.split(' ')) {
    const m = /^(\d+)-(\d+)/.exec(t);
    if (m) out[Number(m[1]) > Number(m[2]) ? 0 : 1]++;
  }
  return out;
}

/** Un partido de raqueta a sets que el lado 1 propuso y el lado 2 confirmó (R2 para los dos). */
export function racketMatch(id: string, date: string, s1: string[], s2: string[], text: string, userOf: (p: string) => string | null, over: Partial<SnapMatch> = {}, teams: [string | null, string | null] = [null, null]): Parts {
  const { sides, players } = matchSides(id, [teams[0], s1], [teams[1], s2]);
  const sets = setsOf(text);
  const match = snapMatch(id, {
    scheduled_at: `${date}T23:00:00.000Z`,
    score: { text, sides: sets },
    winner_side: sets[0] > sets[1] ? 1 : 2,
    proposed_by: userOf(s1[0]) ?? 'u-admin',
    proposed_side: 1,
    confirmed_by: userOf(s2[0]),
    confirmed_at: `${date}T23:30:00.000Z`,
    ...over,
  });
  return { matches: [match], match_sides: sides, match_players: players };
}

/** Un partido de equipos que anotó el admin (T2 para los dos lados), con el acta en `score.lines`. */
export function teamMatch(id: string, date: string, home: string, away: string, sides: [number, number], lines: string, over: Partial<SnapMatch> = {}): Parts {
  const s = matchSides(id, [home, []], [away, []]);
  const match = snapMatch(id, {
    format: '',
    scheduled_at: `${date}T23:00:00.000Z`,
    score: { text: `${sides[0]}-${sides[1]}`, sides, lines },
    winner_side: sides[0] > sides[1] ? 1 : sides[1] > sides[0] ? 2 : null,
    proposed_by: 'u-admin',
    proposed_side: null,
    ...over,
  });
  return { matches: [match], match_sides: s.sides, match_players: s.players };
}

/** Línea de fútbol: `id:lado:jugó:goles:asist:autogoles:amarillas:roja:portero:recibidos`. */
export const fl = (p: string, side: 1 | 2, goals = 0, o: { assists?: number; yellows?: number; red?: 'd' | 's'; keeper?: boolean; conceded?: number } = {}) =>
  `${p}:${side}:1:${goals}:${o.assists ?? 0}:0:${o.yellows ?? 0}:${o.red ?? 0}:${o.keeper ? 1 : 0}:${o.conceded ?? 0}`;

/** Línea de baloncesto coherente: `id:lado:pts:1s:2s:3s:faltas`. */
export const bl = (p: string, side: 1 | 2, ones: number, twos: number, threes: number, fouls = 0) => `${p}:${side}:${ones + 2 * twos + 3 * threes}:${ones}:${twos}:${threes}:${fouls}`;

// ---------------------------------------------------------------------------------------------------------
// Golf (campo de ejemplo, salida azul 71,2 / 128; todos en el grupo 1, así cada uno marca al otro)

/** Golpes de una tarjeta con `over` golpes sobre el par (uno de más en los primeros hoyos). */
export const strokesOver = (over: number): number[] => DEMO_PARS.map((p, i) => p + (i < over ? 1 : 0) + (over > 18 && i < over - 18 ? 1 : 0));

/** Una ronda cerrada con la tarjeta firmada de cada jugador (`over` = golpes sobre el par). */
export function golfRound(id: string, date: string, cards: Record<string, number>, league = 'L'): Parts {
  return {
    events: [snapEvent(id, { type: 'ronda', date, league_id: league })],
    golf_rounds: [snapRound(id, { league_id: league, closed_at: `${date}T22:00:00.000Z` })],
    golf_cards: Object.entries(cards).map(([p, over]) => snapCard(`${id}-${p}`, id, p, strokesOver(over), { league_id: league })),
  };
}

// ---------------------------------------------------------------------------------------------------------
// Natación

export interface Swim {
  p: string;
  distance: number;
  stroke: SwimStroke;
  time: number;
  status?: 'ok' | 'dq' | 'dns' | 'dnf';
  age?: string;
  club?: string | null;
}

/** Un encuentro finalizado con sus pruebas (una por distancia y estilo) y los resultados. */
export function swimMeet(id: string, date: string, swims: readonly Swim[], type = 'encuentro', league = 'L'): Parts {
  const keys = [...new Set(swims.map((s) => `${s.distance}-${s.stroke}`))];
  const swim_events = keys.map((k, i) => {
    const [distance, stroke] = k.split('-');
    return snapSwimEvent(`${id}-ev${i}`, id, { league_id: league, num: i + 1, distance: Number(distance), stroke: stroke as SwimStroke });
  });
  const swim_entries = swims.map((s, i) =>
    snapSwimEntry(`${id}-r${i}`, id, swim_events[keys.indexOf(`${s.distance}-${s.stroke}`)].id, s.p, s.status === 'dns' ? null : s.time, {
      league_id: league,
      status: s.status ?? 'ok',
      age_group: s.age ?? '11-12',
      club_id: s.club ?? null,
    }),
  );
  return { events: [snapEvent(id, { type, date, league_id: league })], swim_meets: [snapMeet(id, { league_id: league, finalized_at: `${date}T22:00:00.000Z` })], swim_events, swim_entries };
}
