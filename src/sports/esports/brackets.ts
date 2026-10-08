/**
 * Fases y cuadros de un torneo de esports (docs/esports.md §3.4): eliminación simple, doble eliminación (ganadores,
 * perdedores, gran final y reinicio opcional), grupos y todos contra todos. Un plan es una lista de partidos con
 * llaves ('W1-1', 'L2-3', 'GF', 'G1-R2-3'…), de dónde sale cada lado y a dónde va el ganador y el perdedor. La capa
 * de datos le pone un id a cada llave y la base sigue los enlaces (D7): no necesita saber de doble eliminación.
 */
import { groupLetter, snakeGroups, crossGroups } from '../formats/groups';
import { createBracket, nextPowerOfTwo, roundName, seedOrder } from '../formats/knockout';
import { roundRobin } from '../formats/roundRobin';
import type { Side } from '../types';
import type { BestOf } from './catalog';

export type StageKind = 'bracket' | 'groups' | 'playoffs' | 'league';
/** Parte del cuadro: ganadores, perdedores, gran final, reinicio, 3.er lugar, grupo o liga. */
export type BracketPart = 'W' | 'L' | 'GF' | 'GF2' | 'P3' | 'G';
export interface Link {
  key: string;
  side: Side;
}
export type SlotSource =
  | { kind: 'entry'; entryId: string }
  | { kind: 'winner'; key: string }
  | { kind: 'loser'; key: string }
  /** Solo para mostrar antes de saberlo. */
  | { kind: 'group'; group: number; place: number }
  /** GF2: los mismos dos de GF. */
  | { kind: 'reset'; side: Side }
  /** Solo dentro del motor (nunca sale en un plan). */
  | { kind: 'bye' };
export interface PlannedMatch {
  /** 'W1-1', 'L2-3', 'GF', 'GF2', 'P3', 'G1-R2-3' (grupo 1, jornada 2, partido 3), 'RR-R4-2'. */
  key: string;
  part: BracketPart;
  /** Ronda de su parte (o jornada). */
  round: number;
  /** Posición en la ronda, desde 0. */
  index: number;
  /** 0 = A (G); null en cuadros. */
  group: number | null;
  /** Texto que se ve (matches.stage, ≤ 40). */
  stage: string;
  bestOf: BestOf;
  sides: [SlotSource, SlotSource];
  /** «Ganador W1-2», «Perdedor W2-1», «1.º Grupo A», «Por definir»; con inscrito, '' (la UI pone el nombre). */
  labels: [string, string];
  winnerTo: Link | null;
  loserTo: Link | null;
}
export interface StagePlan {
  kind: StageKind;
  matches: PlannedMatch[];
}

export interface KeyResult {
  winner: string | null;
  loser: string | null;
}
export interface ResolvedMatch extends PlannedMatch {
  known: [string | null, string | null];
}

/** El texto de un lado sin inscrito: «Ganador W1-2», «Perdedor W2-1», «1.º Grupo A», «Por definir». */
export function slotLabel(src: SlotSource): string {
  switch (src.kind) {
    case 'entry':
      return '';
    case 'winner':
      return `Ganador ${src.key}`;
    case 'loser':
      return `Perdedor ${src.key}`;
    case 'group':
      return `${src.place}.º Grupo ${groupLetter(src.group)}`;
    default:
      return 'Por definir';
  }
}

function assertSeeds(seeds: readonly string[], min: number, message: string) {
  if (seeds.length < min) throw new Error(message);
  if (new Set(seeds).size !== seeds.length) throw new Error('Hay inscritos repetidos.');
}

/**
 * Título de una columna del cuadro: ganadores (y la eliminación simple) con el nombre de la ronda («Cuartos de final»,
 * «Final»); perdedores «Ronda {n}» y la última «Final de perdedores»; «Gran final», «Gran final · reinicio»,
 * «3.er lugar»; grupos y liga «Jornada {n}». `rounds` = rondas de esa parte.
 */
export function partTitle(part: BracketPart, round: number, rounds: number): string {
  switch (part) {
    case 'W':
      return roundName(round, rounds);
    case 'L':
      return round >= rounds ? 'Final de perdedores' : `Ronda ${round}`;
    case 'GF':
      return 'Gran final';
    case 'GF2':
      return 'Gran final · reinicio';
    case 'P3':
      return '3.er lugar';
    default:
      return `Jornada ${round}`;
  }
}

// ---------------------------------------------------------------------------------------------------------
// Eliminación simple

/**
 * Eliminación simple con `createBracket` (siembra estándar y byes para los mejores). Las llaves pasan de `R{r}-{i}` a
 * `W{r}-{i}` (`P3` igual). Los partidos con bye no se crean: el que pasa queda como inscrito en su lugar de la ronda
 * 2. La final lleva `finalBestOf`; el resto (y el 3.er lugar), `bestOf`.
 */
export function singleEliminationPlan(seeds: readonly string[], o: { thirdPlace: boolean; bestOf: BestOf; finalBestOf: BestOf; kind?: 'bracket' | 'playoffs' }): StagePlan {
  assertSeeds(seeds, 2, 'El cuadro necesita al menos 2 inscritos.');
  const bracket = createBracket(seeds, { thirdPlace: o.thirdPlace });
  const rename = (key: string) => (key === 'P3' ? 'P3' : `W${key.slice(1)}`);
  const byKey = new Map(bracket.matches.map((m) => [m.key, m]));
  const sourceOf = (key: string, side: Side): SlotSource => {
    const m = byKey.get(key)!;
    if (m.round === 1 && !m.thirdPlace) {
      const id = side === 1 ? m.side1 : m.side2;
      return { kind: 'entry', entryId: id! };
    }
    if (m.thirdPlace) {
      const from = bracket.matches.find((x) => x.loserNext?.key === key && x.loserNext.side === side)!;
      return { kind: 'loser', key: rename(from.key) };
    }
    const from = bracket.matches.find((x) => x.next?.key === key && x.next.side === side)!;
    if (from.bye) return { kind: 'entry', entryId: from.winner! };
    return { kind: 'winner', key: rename(from.key) };
  };
  const matches: PlannedMatch[] = [];
  for (const m of bracket.matches) {
    if (m.bye) continue;
    const sides: [SlotSource, SlotSource] = [sourceOf(m.key, 1), sourceOf(m.key, 2)];
    const isFinal = !m.thirdPlace && m.round === bracket.rounds;
    matches.push({
      key: rename(m.key),
      part: m.thirdPlace ? 'P3' : 'W',
      round: m.round,
      index: m.thirdPlace ? 0 : m.index,
      group: null,
      stage: m.thirdPlace ? '3.er lugar' : roundName(m.round, bracket.rounds),
      bestOf: isFinal ? o.finalBestOf : o.bestOf,
      sides,
      labels: [slotLabel(sides[0]), slotLabel(sides[1])],
      winnerTo: null,
      loserTo: null,
    });
  }
  linkUp(matches);
  return { kind: o.kind ?? 'bracket', matches };
}

/** winnerTo / loserTo desde las fuentes de cada lado. */
function linkUp(matches: PlannedMatch[]) {
  const byKey = new Map(matches.map((m) => [m.key, m]));
  for (const m of matches) {
    m.winnerTo = null;
    m.loserTo = null;
  }
  for (const m of matches) {
    m.sides.forEach((src, i) => {
      const side = (i + 1) as Side;
      if (src.kind === 'winner') {
        const from = byKey.get(src.key);
        if (from) from.winnerTo = { key: m.key, side };
      } else if (src.kind === 'loser') {
        const from = byKey.get(src.key);
        if (from) from.loserTo = { key: m.key, side };
      }
    });
  }
}

// ---------------------------------------------------------------------------------------------------------
// Doble eliminación

interface Draft {
  key: string;
  part: BracketPart;
  round: number;
  index: number;
  sides: [SlotSource, SlotSource];
}

/**
 * Doble eliminación (mínimo 4). Con `S` = siguiente potencia de 2 y `k = log2(S)`:
 * - ganadores: rondas 1…k (`W{r}-{i}`), la 1 con la siembra estándar;
 * - perdedores: rondas 1…2(k−1) (`L{j}-{i}`): la 1 cruza a los perdedores de W1 de a dos; las pares reciben a los
 *   perdedores de `W{m+1}` (en orden invertido si `m+1` es par, para no repetir enseguida un cruce); las impares
 *   juntan a los ganadores de la anterior de a dos;
 * - `GF`: el ganador de ganadores (lado 1) contra el de perdedores (lado 2); `GF2` (con `bracketReset`) los mismos dos,
 *   y sus enlaces los pone la base.
 * Byes: los partidos de W1 con bye no se crean; un partido con un lado bye desaparece y su otro lado ocupa su lugar
 * (colapso de partidos de paso). Las llaves no se renumeran.
 */
export function doubleEliminationPlan(seeds: readonly string[], o: { bracketReset: boolean; bestOf: BestOf; finalBestOf: BestOf; kind?: 'bracket' | 'playoffs' }): StagePlan {
  assertSeeds(seeds, 4, 'Para doble eliminación hacen falta al menos 4.');
  const S = nextPowerOfTwo(seeds.length);
  const k = Math.log2(S);
  const order = seedOrder(S);
  const drafts: Draft[] = [];
  const W = (r: number, i: number) => `W${r}-${i}`;
  const L = (j: number, i: number) => `L${j}-${i}`;
  const entry = (seed: number): SlotSource => (seeds[seed - 1] !== undefined ? { kind: 'entry', entryId: seeds[seed - 1] } : { kind: 'bye' });

  for (let r = 1; r <= k; r++) {
    const count = S / 2 ** r;
    for (let i = 0; i < count; i++) {
      const sides: [SlotSource, SlotSource] =
        r === 1
          ? [entry(order[2 * i]), entry(order[2 * i + 1])]
          : [
              { kind: 'winner', key: W(r - 1, 2 * i + 1) },
              { kind: 'winner', key: W(r - 1, 2 * i + 2) },
            ];
      drafts.push({ key: W(r, i + 1), part: 'W', round: r, index: i, sides });
    }
  }
  for (let i = 0; i < S / 4; i++) {
    drafts.push({
      key: L(1, i + 1),
      part: 'L',
      round: 1,
      index: i,
      sides: [
        { kind: 'loser', key: W(1, 2 * i + 1) },
        { kind: 'loser', key: W(1, 2 * i + 2) },
      ],
    });
  }
  for (let m = 1; m <= k - 1; m++) {
    const j = 2 * m;
    const count = S / 2 ** (m + 1);
    const reverse = (m + 1) % 2 === 0;
    for (let i = 0; i < count; i++) {
      drafts.push({
        key: L(j, i + 1),
        part: 'L',
        round: j,
        index: i,
        sides: [
          { kind: 'winner', key: L(j - 1, i + 1) },
          { kind: 'loser', key: W(m + 1, reverse ? count - i : i + 1) },
        ],
      });
    }
    if (m <= k - 2) {
      const next = S / 2 ** (m + 2);
      for (let i = 0; i < next; i++) {
        drafts.push({
          key: L(j + 1, i + 1),
          part: 'L',
          round: j + 1,
          index: i,
          sides: [
            { kind: 'winner', key: L(j, 2 * i + 1) },
            { kind: 'winner', key: L(j, 2 * i + 2) },
          ],
        });
      }
    }
  }
  const lRounds = 2 * (k - 1);
  drafts.push({
    key: 'GF',
    part: 'GF',
    round: 1,
    index: 0,
    sides: [
      { kind: 'winner', key: W(k, 1) },
      { kind: 'winner', key: L(lRounds, 1) },
    ],
  });
  if (o.bracketReset) {
    drafts.push({
      key: 'GF2',
      part: 'GF2',
      round: 1,
      index: 0,
      sides: [
        { kind: 'reset', side: 1 },
        { kind: 'reset', side: 2 },
      ],
    });
  }

  // Colapso: un partido con un lado bye desaparece; donde se usaba su ganador va su otro lado, y su perdedor es bye.
  const gone = new Map<string, { winner: SlotSource; loser: SlotSource }>();
  const resolve = (src: SlotSource): SlotSource => {
    let s = src;
    for (let guard = 0; guard < 1000; guard++) {
      if ((s.kind === 'winner' || s.kind === 'loser') && gone.has(s.key)) s = gone.get(s.key)![s.kind];
      else break;
    }
    return s;
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (const d of drafts) {
      if (gone.has(d.key)) continue;
      d.sides = [resolve(d.sides[0]), resolve(d.sides[1])];
      const byeAt = d.sides.findIndex((s) => s.kind === 'bye');
      if (byeAt < 0) continue;
      gone.set(d.key, { winner: d.sides[1 - byeAt], loser: { kind: 'bye' } });
      changed = true;
    }
  }

  const wStage = (r: number) => (r === k ? 'Final de ganadores' : `Ganadores · ${roundName(r, k)}`);
  const lStage = (j: number) => (j === lRounds ? 'Final de perdedores' : `Perdedores · Ronda ${j}`);
  const matches: PlannedMatch[] = drafts
    .filter((d) => !gone.has(d.key))
    .map((d) => ({
      key: d.key,
      part: d.part,
      round: d.round,
      index: d.index,
      group: null,
      stage: d.part === 'W' ? wStage(d.round) : d.part === 'L' ? lStage(d.round) : d.part === 'GF' ? 'Gran final' : 'Gran final · reinicio',
      bestOf: d.part === 'GF' || d.part === 'GF2' ? o.finalBestOf : o.bestOf,
      sides: d.sides,
      labels: [slotLabel(d.sides[0]), slotLabel(d.sides[1])],
      winnerTo: null,
      loserTo: null,
    }));
  const gf = matches.find((m) => m.part === 'GF')!;
  const gf2 = matches.find((m) => m.part === 'GF2');
  if (gf2) gf2.labels = [gf.labels[0], gf.labels[1]];
  linkUp(matches);
  return { kind: o.kind ?? 'bracket', matches };
}

// ---------------------------------------------------------------------------------------------------------
// Todos contra todos y grupos

/** Todos contra todos (liga): kind 'league', parte 'G', grupo 0, llaves 'RR-R{jornada}-{partido}'. */
export function roundRobinPlan(entries: readonly string[], o: { double: boolean; bestOf: BestOf }): StagePlan {
  assertSeeds(entries, 2, 'Hacen falta al menos 2 inscritos.');
  const matches: PlannedMatch[] = roundRobin(entries, { double: o.double }).flatMap((r) =>
    r.matches.map(
      (f, i): PlannedMatch => ({
        key: `RR-R${r.round}-${i + 1}`,
        part: 'G',
        round: r.round,
        index: i,
        group: 0,
        stage: `Jornada ${r.round}`,
        bestOf: o.bestOf,
        sides: [
          { kind: 'entry', entryId: f.home },
          { kind: 'entry', entryId: f.away },
        ],
        labels: ['', ''],
        winnerTo: null,
        loserTo: null,
      }),
    ),
  );
  return { kind: 'league', matches };
}

/** Grupos: `snakeGroups` con los sembrados y todos contra todos en cada grupo (llaves 'G{g+1}-R{r}-{i}'). */
export function groupsPlan(seeded: readonly string[], o: { groups: number; double: boolean; bestOf: BestOf }): StagePlan {
  assertSeeds(seeded, 2, 'Hacen falta al menos 2 inscritos.');
  const groups = snakeGroups(seeded, o.groups);
  if (groups.some((g) => g.length < 2)) throw new Error('Cada grupo necesita al menos 2 inscritos.');
  const matches: PlannedMatch[] = groups.flatMap((members, g) =>
    roundRobin(members, { double: o.double }).flatMap((r) =>
      r.matches.map(
        (f, i): PlannedMatch => ({
          key: `G${g + 1}-R${r.round}-${i + 1}`,
          part: 'G',
          round: r.round,
          index: i,
          group: g,
          stage: `Grupo ${groupLetter(g)} · Jornada ${r.round}`,
          bestOf: o.bestOf,
          sides: [
            { kind: 'entry', entryId: f.home },
            { kind: 'entry', entryId: f.away },
          ],
          labels: ['', ''],
          winnerTo: null,
          loserTo: null,
        }),
      ),
    ),
  );
  return { kind: 'groups', matches };
}

/** Los inscritos de cada grupo (en el orden en que aparecen por jornada). Una liga da un solo grupo. */
export function groupOf(plan: StagePlan): string[][] {
  const out: string[][] = [];
  const seen: Set<string>[] = [];
  const list = plan.matches
    .filter((m) => m.part === 'G')
    .slice()
    .sort((a, b) => (a.group ?? 0) - (b.group ?? 0) || a.round - b.round || a.index - b.index);
  for (const m of list) {
    const g = m.group ?? 0;
    while (out.length <= g) {
      out.push([]);
      seen.push(new Set());
    }
    for (const s of m.sides) {
      if (s.kind === 'entry' && !seen[g].has(s.entryId)) {
        seen[g].add(s.entryId);
        out[g].push(s.entryId);
      }
    }
  }
  return out;
}

/** Siembra de los playoffs desde las tablas de cada grupo (ids ya ordenados): 1A–2B, 1B–2A… (`crossGroups`). */
export function playoffSeeds(groupTables: readonly (readonly string[])[], perGroup: number): string[] {
  return crossGroups(groupTables, perGroup).map((q) => q.id);
}

// ---------------------------------------------------------------------------------------------------------
// Lo sabido hasta ahora

/** Quién juega cada partido, sabido hasta ahora con los resultados por llave. */
export function resolvePlan(plan: StagePlan, results: Readonly<Record<string, KeyResult>>): ResolvedMatch[] {
  const byKey = new Map(plan.matches.map((m) => [m.key, m]));
  const memo = new Map<string, [string | null, string | null]>();
  const known = (m: PlannedMatch, depth = 0): [string | null, string | null] => {
    const cached = memo.get(m.key);
    if (cached) return cached;
    const sideOf = (src: SlotSource): string | null => {
      switch (src.kind) {
        case 'entry':
          return src.entryId;
        case 'winner':
          return byKey.has(src.key) ? (results[src.key]?.winner ?? null) : null;
        case 'loser':
          return byKey.has(src.key) ? (results[src.key]?.loser ?? null) : null;
        case 'reset': {
          const gf = plan.matches.find((x) => x.part === 'GF');
          if (!gf || depth > 2) return null;
          const gk = known(gf, depth + 1);
          return lowerBracketWonGf(plan, results, gk) ? gk[src.side - 1] : null;
        }
        default:
          return null;
      }
    };
    const out: [string | null, string | null] = [sideOf(m.sides[0]), sideOf(m.sides[1])];
    memo.set(m.key, out);
    return out;
  };
  return plan.matches.map((m) => ({ ...m, known: known(m) }));
}

/** ¿Ganó la gran final el que venía de perdedores (y hay que jugar el reinicio)? */
function lowerBracketWonGf(plan: StagePlan, results: Readonly<Record<string, KeyResult>>, gfKnown: [string | null, string | null]): boolean {
  const gf = plan.matches.find((x) => x.part === 'GF');
  const w = gf ? results[gf.key]?.winner : null;
  if (!w) return false;
  if (gfKnown[0]) return w !== gfKnown[0];
  return gfKnown[1] !== null && w === gfKnown[1];
}

/** El perdedor de un partido: el del resultado o, si no vino, el otro lado sabido. */
function loserOf(m: ResolvedMatch | undefined, results: Readonly<Record<string, KeyResult>>): string | null {
  if (!m) return null;
  const r = results[m.key];
  if (!r?.winner) return null;
  if (r.loser) return r.loser;
  if (m.known[0] === r.winner) return m.known[1];
  if (m.known[1] === r.winner) return m.known[0];
  return null;
}

/** Campeón del cuadro (null si falta; grupos y liga: null, se ve en la tabla). */
export function champion(plan: StagePlan, results: Readonly<Record<string, KeyResult>>): string | null {
  return podium(plan, results)[0];
}

/**
 * [1.º, 2.º, 3.º, 4.º] cuando se saben. Doble: 1.º y 2.º de `GF2` si se jugó (si no, de `GF`); 3.º el perdedor del
 * último partido de perdedores; 4.º el perdedor del partido de perdedores anterior si su ronda tiene uno solo. Simple:
 * la final y el 3.er lugar.
 */
export function podium(plan: StagePlan, results: Readonly<Record<string, KeyResult>>): (string | null)[] {
  const out: (string | null)[] = [null, null, null, null];
  const resolved = resolvePlan(plan, results);
  const gf = resolved.find((m) => m.part === 'GF');
  if (gf) {
    const gf2 = resolved.find((m) => m.part === 'GF2');
    const r1 = results[gf.key];
    if (r1?.winner) {
      if (gf2 && lowerBracketWonGf(plan, results, gf.known)) {
        const r2 = results[gf2.key];
        if (r2?.winner) {
          out[0] = r2.winner;
          out[1] = loserOf(gf2, results);
        }
      } else {
        out[0] = r1.winner;
        out[1] = loserOf(gf, results);
      }
    }
    const losers = resolved.filter((m) => m.part === 'L');
    if (losers.length) {
      const last = Math.max(...losers.map((m) => m.round));
      const finalL = losers.filter((m) => m.round === last);
      if (finalL.length === 1) out[2] = loserOf(finalL[0], results);
      const prev = losers.filter((m) => m.round === last - 1);
      if (prev.length === 1) out[3] = loserOf(prev[0], results);
    }
    return out;
  }
  const winners = resolved.filter((m) => m.part === 'W');
  if (!winners.length) return out;
  const top = Math.max(...winners.map((m) => m.round));
  const final = winners.find((m) => m.round === top);
  if (final && results[final.key]?.winner) {
    out[0] = results[final.key].winner;
    out[1] = loserOf(final, results);
  }
  const p3 = resolved.find((m) => m.part === 'P3');
  if (p3 && results[p3.key]?.winner) {
    out[2] = results[p3.key].winner;
    out[3] = loserOf(p3, results);
  }
  return out;
}
