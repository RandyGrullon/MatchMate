import type { BowlingEvent, Entry, Player } from './types';

export const MAX_SCORE = 300;

/** Mínimo de juegos verificados en la temporada para entrar al ranking de promedio. */
export const MIN_RANK_GAMES = 6;

export function isValidScore(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= MAX_SCORE;
}

/** Ajusta un arreglo por juego al número de juegos del evento. */
export function slots<T>(arr: readonly T[] | undefined, games: number, fill: T): T[] {
  return Array.from({ length: games }, (_, i) => (arr && i < arr.length ? arr[i] : fill));
}

/** Primer juego desde el que caben `count` juegos seguidos sin pisar juegos ya verificados. */
export function firstFreeSlot(entry: Pick<Entry, 'scores' | 'photos'> | null | undefined, games: number, count: number): number {
  if (!entry) return 0;
  const photos = slots(entry.photos, games, null);
  for (let start = 0; start + count <= games; start++) {
    if (photos.slice(start, start + count).every((p) => p == null)) return start;
  }
  const firstOpen = photos.findIndex((p) => p == null);
  return firstOpen === -1 ? 0 : firstOpen;
}

export function calcHandicap(average: number, base: number, percent: number): number {
  if (!average || percent <= 0) return 0;
  return Math.max(0, Math.floor(((base - average) * percent) / 100));
}

export function entryHandicap(entry: Entry, event: BowlingEvent): number {
  if (event.type !== 'torneo') return 0;
  if (entry.handicapOverride != null) return entry.handicapOverride;
  return calcHandicap(entry.average, event.hcpBase, event.hcpPercent);
}

export interface Line {
  entry: Entry;
  hcp: number;
  /** Pinos por juego que cuentan (según includeDrafts); null = no cuenta. */
  scores: (number | null)[];
  verified: boolean[];
  pending: number;
  games: number;
  scratch: number;
  hcpTotal: number;
  total: number;
  avg: number;
  high: number;
}

/** Números de un jugador en un evento. Solo cuentan juegos verificados con foto, salvo includeDrafts. */
export function entryLine(entry: Entry, event: BowlingEvent, includeDrafts = false): Line {
  const raw = slots(entry.scores, event.games, null);
  const photos = slots(entry.photos, event.games, null);
  const verified = raw.map((s, i) => s != null && photos[i] != null);
  const scores = raw.map((s, i) => (verified[i] || includeDrafts ? s : null));
  const counted = scores.filter((s): s is number => s != null);
  const hcp = entryHandicap(entry, event);
  const scratch = counted.reduce((a, b) => a + b, 0);
  const hcpTotal = hcp * counted.length;
  return {
    entry,
    hcp,
    scores,
    verified,
    pending: raw.filter((s, i) => s != null && !verified[i]).length,
    games: counted.length,
    scratch,
    hcpTotal,
    total: scratch + hcpTotal,
    avg: counted.length ? Math.floor(scratch / counted.length) : 0,
    high: counted.length ? Math.max(...counted) : 0,
  };
}

/** Ranking de competición: empates comparten puesto (1, 2, 2, 4). */
export function rank<T>(rows: T[], value: (r: T) => number): { row: T; pos: number }[] {
  const sorted = [...rows].sort((a, b) => value(b) - value(a));
  let pos = 0;
  return sorted.map((row, i) => {
    if (i === 0 || value(row) !== value(sorted[i - 1])) pos = i + 1;
    return { row, pos };
  });
}

/** Valor con el que se ordena la clasificación individual (regla del evento). */
export function individualValue(event: BowlingEvent) {
  const isTorneo = event.type === 'torneo';
  const useHcp = isTorneo && event.hcpPercent > 0 && (event.individualRankBy ?? 'hcp') === 'hcp';
  return (l: Line) => (isTorneo ? (useHcp ? l.total : l.scratch) : l.avg);
}

/** Posición de una participación en su evento (solo juegos verificados). */
export function eventPosition(event: BowlingEvent, entries: Entry[], entryId: string): { pos: number; of: number } | null {
  const lines = entries
    .filter((e) => e.eventId === event.id)
    .map((e) => entryLine(e, event))
    .filter((l) => l.games > 0);
  const ranked = rank(lines, individualValue(event));
  const me = ranked.find((r) => r.row.entry.id === entryId);
  return me ? { pos: me.pos, of: ranked.length } : null;
}

export interface TeamLine {
  teamId: string;
  name: string;
  members: Line[];
  perGame: number[];
  scratch: number;
  hcpTotal: number;
  total: number;
  teamAverage: number;
  teamHcp: number;
}

export function teamLines(event: BowlingEvent, lines: Line[]): TeamLine[] {
  return Object.entries(event.teams ?? {})
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([teamId, team]) => {
      const members = lines.filter((l) => l.entry.teamId === teamId);
      const perGame = Array.from({ length: event.games }, (_, g) =>
        members.reduce((sum, m) => (m.scores[g] != null ? sum + m.scores[g]! + m.hcp : sum), 0),
      );
      const scratch = members.reduce((a, m) => a + m.scratch, 0);
      const hcpTotal = members.reduce((a, m) => a + m.hcpTotal, 0);
      return {
        teamId,
        name: team.name,
        members,
        perGame,
        scratch,
        hcpTotal,
        total: scratch + hcpTotal,
        teamAverage: members.reduce((a, m) => a + (m.entry.average || 0), 0),
        teamHcp: members.reduce((a, m) => a + m.hcp, 0),
      };
    });
}

export interface PlayerStats {
  games: number;
  pins: number;
  /** Promedio calculado con juegos verificados (null si no tiene). */
  autoAverage: number | null;
  high: number;
  /** Mejor suma de 3 juegos seguidos dentro de un mismo evento. */
  highSeries: number;
  pending: number;
}

export function playerStats(entries: Entry[]): PlayerStats {
  let games = 0;
  let pins = 0;
  let high = 0;
  let highSeries = 0;
  let pending = 0;
  for (const e of entries) {
    const run: number[] = [];
    (e.scores ?? []).forEach((s, i) => {
      if (s == null) return;
      if (!e.photos?.[i]) {
        pending++;
        return;
      }
      games++;
      pins += s;
      high = Math.max(high, s);
      run.push(s);
    });
    for (let i = 0; i + 3 <= run.length; i++) {
      highSeries = Math.max(highSeries, run[i] + run[i + 1] + run[i + 2]);
    }
  }
  return { games, pins, autoAverage: games ? Math.floor(pins / games) : null, high, highSeries, pending };
}

/** Promedio que se usa: el fijado a mano o, si no hay, el calculado. */
export function effectiveAverage(player: Pick<Player, 'averageOverride'> | undefined, stats: PlayerStats): number {
  return player?.averageOverride ?? stats.autoAverage ?? 0;
}

// ---- Emparejar nombres leídos en la foto con jugadores ----

export function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** Parecido entre 0 y 1 entre el nombre de la pantalla (suele ser apodo o solo el nombre) y el del jugador. */
export function nameSimilarity(screen: string, player: string): number {
  const a = normalizeName(screen);
  const b = normalizeName(player);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const words = b.split(' ');
  if (words.includes(a) || a.split(' ').every((w) => words.includes(w))) return 0.95;
  if (b.startsWith(a) || a.startsWith(b)) return 0.9;
  const best = Math.max(
    ...[b, ...words].map((w) => 1 - levenshtein(a, w) / Math.max(a.length, w.length)),
  );
  return best;
}

export function bestMatch<T extends { name: string }>(screen: string, candidates: T[]): T | null {
  let best: T | null = null;
  let bestScore = 0;
  for (const c of candidates) {
    const s = nameSimilarity(screen, c.name);
    if (s > bestScore) {
      best = c;
      bestScore = s;
    }
  }
  return bestScore >= 0.7 ? best : null;
}

export type Category = 'A' | 'B' | 'C' | 'D';

/** Cortes del torneo 2025: A 200+, B 175–199, C 160–174, D menos de 160. */
export const DEFAULT_CUTS: [number, number, number] = [200, 175, 160];

export function category(average: number, cuts: [number, number, number] = DEFAULT_CUTS): Category {
  if (average >= cuts[0]) return 'A';
  if (average >= cuts[1]) return 'B';
  if (average >= cuts[2]) return 'C';
  return 'D';
}

/**
 * Reparte jugadores en equipos parejos: ordena por promedio, reparte en serpiente (1→N y luego N→1)
 * y después intercambia jugadores entre equipos mientras eso acerque las sumas de promedios.
 * Con `group` (categoría) primero evita repetir categoría en un equipo, y luego empareja las sumas.
 */
export function balancedTeams<T>(items: T[], teams: number, value: (t: T) => number, group?: (t: T) => string): T[][] {
  const out = Array.from({ length: Math.max(1, teams) }, () => [] as T[]);
  [...items]
    .sort((a, b) => value(b) - value(a))
    .forEach((item, i) => {
      const round = Math.floor(i / out.length);
      const pos = i % out.length;
      out[round % 2 === 0 ? pos : out.length - 1 - pos].push(item);
    });

  const sum = (t: T[]) => t.reduce((a, x) => a + value(x), 0);
  // Pares de la misma categoría dentro de un equipo: pesan más que cualquier diferencia de pinos.
  const repeats = (t: T[]) => {
    if (!group) return 0;
    const counts = new Map<string, number>();
    t.forEach((x) => counts.set(group(x), (counts.get(group(x)) ?? 0) + 1));
    return [...counts.values()].reduce((a, n) => a + (n * (n - 1)) / 2, 0);
  };
  const spread = () => out.reduce((a, t) => a + sum(t) ** 2 + repeats(t) * 1e9, 0);
  // Mejora local: prueba cada intercambio entre dos equipos y aplica el que más empareja, hasta que no haya mejora.
  for (let guard = 0; guard < 200; guard++) {
    let best = spread();
    let move: [number, number, number, number] | null = null;
    for (let a = 0; a < out.length; a++)
      for (let b = a + 1; b < out.length; b++)
        for (let i = 0; i < out[a].length; i++)
          for (let j = 0; j < out[b].length; j++) {
            [out[a][i], out[b][j]] = [out[b][j], out[a][i]];
            const s = spread();
            [out[a][i], out[b][j]] = [out[b][j], out[a][i]];
            if (s < best) {
              best = s;
              move = [a, i, b, j];
            }
          }
    if (!move) break;
    const [a, i, b, j] = move;
    [out[a][i], out[b][j]] = [out[b][j], out[a][i]];
  }
  return out.map((t) => t.sort((x, y) => value(y) - value(x)));
}
