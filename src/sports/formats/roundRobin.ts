/**
 * Todos contra todos por el método del círculo (sirve para jugadores, parejas o equipos: son ids).
 *
 * - N(N−1)/2 partidos en N−1 jornadas (N par) o N jornadas con un descanso por jornada (N impar).
 * - Local y visita: cada quien queda con la misma cantidad (±1) y se ordenan las jornadas para alternar
 *   lo más posible (pocos «dos de local seguidos»).
 * - Ida y vuelta: la vuelta repite la ida con local y visita cambiados.
 * - `assignSlots` pone fecha, hora y cancha; `findClashes` avisa de choques (misma cancha a la misma hora,
 *   o alguien en dos partidos a la vez).
 */

export interface Fixture {
  home: string;
  away: string;
}

export interface RoundRobinRound {
  /** Jornada 1, 2, … */
  round: number;
  matches: Fixture[];
  /** Quién descansa (N impar), o null. */
  bye: string | null;
}

/** Jornadas del todos contra todos. `double` = ida y vuelta. */
export function roundRobin(entrants: readonly string[], opts: { double?: boolean } = {}): RoundRobinRound[] {
  const n = entrants.length;
  if (new Set(entrants).size !== n) throw new Error('Hay participantes repetidos.');
  if (n < 2) return [];
  const M = n % 2 === 0 ? n : n + 1;
  const k = M - 1; // vértices que rotan: 0..k−1; el fijo es k (o el descanso si N es impar)
  const half = (k - 1) / 2;
  const homeOf = (a: number, b: number) => ((b - a + k) % k >= 1 && (b - a + k) % k <= half ? a : b);

  // Jornada con centro r: fijo contra r, y (r+i) contra (r−i). La orientación cíclica deja a cada uno con
  // la mitad de local; el fijo alterna. El paso entre centros se elige para cortar las rachas.
  const build = (step: number) => {
    const out: [number, number][][] = [];
    for (let j = 0; j < k; j++) {
      const r = (j * step) % k;
      const games: [number, number][] = [];
      games.push(j % 2 === 0 ? [r, k] : [k, r]);
      for (let i = 1; i <= half; i++) {
        const a = (r + i) % k;
        const b = (r - i + k) % k;
        games.push(homeOf(a, b) === a ? [a, b] : [b, a]);
      }
      out.push(games);
    }
    return out;
  };

  let best = build(1);
  let bestBreaks = countBreaks(best, M, n % 2 === 1 ? k : -1);
  for (let step = 2; step < k; step++) {
    if (gcd(step, k) !== 1) continue;
    const cand = build(step);
    const b = countBreaks(cand, M, n % 2 === 1 ? k : -1);
    if (b < bestBreaks) {
      best = cand;
      bestBreaks = b;
    }
  }

  const first: RoundRobinRound[] = best.map((games, j) => {
    let bye: string | null = null;
    const matches: Fixture[] = [];
    for (const [h, a] of games) {
      if (n % 2 === 1 && (h === k || a === k)) bye = entrants[h === k ? a : h];
      else matches.push({ home: entrants[h], away: entrants[a] });
    }
    return { round: j + 1, matches, bye };
  });
  if (!opts.double) return first;
  // Vuelta: las mismas jornadas con local y visita cambiados, empezando por la que menos rachas deja en el cruce.
  let bestAll: RoundRobinRound[] = [];
  let bestCount = Infinity;
  // Nunca empezar la vuelta con la última jornada de la ida (sería la revancha seguida).
  for (let s = 0; s < Math.max(1, first.length - 1); s++) {
    const rotated = [...first.slice(s), ...first.slice(0, s)];
    const second = rotated.map((r, j) => ({
      round: first.length + j + 1,
      bye: r.bye,
      matches: r.matches.map((f) => ({ home: f.away, away: f.home })),
    }));
    const all = [...first, ...second];
    const count = Object.values(homeAwayBreaks(all)).reduce((x, y) => x + y, 0);
    if (count < bestCount) {
      bestAll = all;
      bestCount = count;
    }
  }
  return bestAll;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Veces que alguien juega dos seguidas de local o dos seguidas de visita (sin contar descansos). */
function countBreaks(rounds: [number, number][][], M: number, byeVertex: number): number {
  const last = new Array<number>(M).fill(0); // 1 local, −1 visita, 0 sin jugar aún
  let breaks = 0;
  for (const games of rounds) {
    for (const [h, a] of games) {
      if (h === byeVertex || a === byeVertex) continue;
      if (last[h] === 1) breaks++;
      if (last[a] === -1) breaks++;
      last[h] = 1;
      last[a] = -1;
    }
  }
  return breaks;
}

/** Racha: para mostrar o probar cuántas veces alguien repitió local o visita seguidas. */
export function homeAwayBreaks(rounds: readonly RoundRobinRound[]): Record<string, number> {
  const last = new Map<string, 'h' | 'a'>();
  const out: Record<string, number> = {};
  for (const r of rounds) {
    for (const f of r.matches) {
      for (const [id, v] of [
        [f.home, 'h'],
        [f.away, 'a'],
      ] as const) {
        out[id] ??= 0;
        if (last.get(id) === v) out[id]++;
        last.set(id, v);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// Canchas y horas

export interface ScheduledFixture extends Fixture {
  round: number;
  /** 'YYYY-MM-DD' de la jornada, si se dio. */
  date: string | null;
  /** 'HH:MM', o null si no cupo. */
  time: string | null;
  court: string | null;
}

/**
 * Reparte cada jornada en las casillas (hora × cancha): primero todas las canchas a la primera hora, luego la
 * segunda hora… Cada jornada rota el orden de sus partidos para que no le toque siempre la última hora al
 * mismo. `dates[i]` es la fecha de la jornada i+1. Lo que no cabe queda sin hora (y sale en `unassigned`).
 */
export function assignSlots(
  rounds: readonly RoundRobinRound[],
  opts: { courts: readonly string[]; times: readonly string[]; dates?: readonly string[] },
): { fixtures: ScheduledFixture[]; unassigned: ScheduledFixture[] } {
  const cells = opts.times.flatMap((time) => opts.courts.map((court) => ({ time, court })));
  const fixtures: ScheduledFixture[] = [];
  const unassigned: ScheduledFixture[] = [];
  rounds.forEach((r, i) => {
    const date = opts.dates?.[i] ?? null;
    const shift = r.matches.length ? i % r.matches.length : 0;
    const ordered = [...r.matches.slice(shift), ...r.matches.slice(0, shift)];
    ordered.forEach((f, j) => {
      const cell = cells[j];
      const sf: ScheduledFixture = { ...f, round: r.round, date, time: cell?.time ?? null, court: cell?.court ?? null };
      fixtures.push(sf);
      if (!cell) unassigned.push(sf);
    });
  });
  return { fixtures, unassigned };
}

export interface ClashInput {
  id: string;
  /** 'YYYY-MM-DD'. */
  date: string;
  /** 'HH:MM'. */
  time: string;
  /** Duración en minutos (por defecto la de `findClashes`). */
  minutes?: number;
  court?: string | null;
  /** Quiénes juegan: jugadores, parejas o equipos (y si quieres, también los jugadores de cada pareja). */
  participants: readonly string[];
}

export interface Clash {
  kind: 'court' | 'participant';
  a: string;
  b: string;
  /** La cancha o el participante que choca. */
  who: string;
  message: string;
}

const toMinutes = (date: string, time: string): number => {
  const [h, m] = time.split(':').map(Number);
  return Math.round(Date.parse(`${date}T00:00:00Z`) / 60000) + h * 60 + m;
};

/** Choques: misma cancha a la misma hora, o un participante en dos partidos que se pisan. */
export function findClashes(matches: readonly ClashInput[], defaultMinutes = 60): Clash[] {
  const spans = matches.map((m) => {
    const start = toMinutes(m.date, m.time);
    return { m, start, end: start + (m.minutes ?? defaultMinutes) };
  });
  const out: Clash[] = [];
  for (let i = 0; i < spans.length; i++) {
    for (let j = i + 1; j < spans.length; j++) {
      const x = spans[i];
      const y = spans[j];
      if (!(x.start < y.end && y.start < x.end)) continue;
      if (x.m.court && x.m.court === y.m.court) {
        out.push({ kind: 'court', a: x.m.id, b: y.m.id, who: x.m.court, message: `Dos partidos en ${x.m.court} a la misma hora.` });
      }
      const ys = new Set(y.m.participants);
      for (const p of new Set(x.m.participants)) {
        if (ys.has(p)) out.push({ kind: 'participant', a: x.m.id, b: y.m.id, who: p, message: 'Alguien tiene dos partidos a la misma hora.' });
      }
    }
  }
  return out;
}
