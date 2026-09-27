import { crossGroups, groupLetter, snakeGroups } from '../../../sports/formats/groups';
import { createBracket, roundName, type Bracket, type BracketMatch } from '../../../sports/formats/knockout';
import { roundRobin } from '../../../sports/formats/roundRobin';
import { hasResult, isFinal, type Match, type MatchDraft, type SideDraft } from '../../../lib/data/matches';
import { addDays, zonedIso } from './schedule';

/**
 * Torneo relámpago entre equipos (compartido por los deportes de equipo): grupos de todos contra todos en un día
 * y después la eliminatoria (final, o semifinales y final, con 3.er lugar opcional).
 *
 * - Los grupos salen en zigzag por el orden de los equipos (src/sports/formats/groups: `snakeGroups`).
 * - Cada ronda de los grupos empieza en un turno nuevo (horas × canchas), así nadie juega dos partidos a la vez.
 * - La eliminatoria se crea de una vez con los lados «por definir» («1.º Grupo A», «Ganador Semifinal 1») y la
 *   siembra cruzada de `crossGroups` (1A contra 2B…). Los partidos del cuadro llevan `bracket_key` (R1-1, P3).
 * - `advanceTournament` dice qué lados ya se saben (grupos terminados, ganadores de la eliminatoria) para ponerlos
 *   con `setMatchSides`. Solo cambia partidos que siguen sin resultado.
 * Puro: sin React ni backend.
 */

export interface TournamentSetup {
  /** Grupos (1 a 8). */
  groups: number;
  /** Clasificados por grupo. */
  perGroup: number;
  /** Partido por el 3.er lugar (con 4 o más clasificados). */
  thirdPlace: boolean;
}

export interface TournamentInput extends TournamentSetup {
  /** Equipos en orden de siembra (el primero es cabeza del grupo A). */
  teams: readonly string[];
  /** 'YYYY-MM-DD'. */
  date: string;
  /** Hora del primer partido ('HH:MM', zona de la liga). */
  start: string;
  /** Minutos entre un turno y el siguiente (lo que dura un partido con el descanso). */
  slotMinutes: number;
  courts: readonly string[];
  tz: string;
  /** Número de la primera ronda (si ya hay partidos, la que sigue). */
  firstRound?: number;
}

export interface PlannedGame {
  stage: string;
  round: number;
  date: string;
  time: string;
  court: string | null;
  scheduledAt: string;
  /** Equipos (null = por definir en la eliminatoria). */
  home: string | null;
  away: string | null;
  homeLabel: string;
  awayLabel: string;
  bracketKey: string | null;
}

export interface TournamentPlan {
  groups: { name: string; teams: string[] }[];
  games: PlannedGame[];
  /** Siembra de la eliminatoria en marcadores de puesto ('A1' = 1.º del grupo A). */
  seeds: string[];
  bracket: Bracket;
}

export const groupName = (index: number) => `Grupo ${groupLetter(index)}`;

/** 'A1' → «1.º Grupo A». */
export function placeLabel(placeholder: string): string {
  const m = /^([A-Z]+)(\d+)$/.exec(placeholder);
  return m ? `${m[2]}.º Grupo ${m[1]}` : placeholder;
}

/** Marcadores de puesto de cada grupo ('A1', 'A2'…), en el orden de siembra de la eliminatoria. */
export function tournamentSeeds(setup: Pick<TournamentSetup, 'groups' | 'perGroup'>): string[] {
  const ranked = Array.from({ length: setup.groups }, (_, g) => Array.from({ length: setup.perGroup }, (_, p) => `${groupLetter(g)}${p + 1}`));
  return crossGroups(ranked, setup.perGroup).map((q) => q.id);
}

export function tournamentBracket(setup: TournamentSetup): Bracket {
  const seeds = tournamentSeeds(setup);
  return createBracket(seeds, { thirdPlace: setup.thirdPlace && seeds.length >= 4 });
}

/** Errores del armado (vacío = bien). */
export function tournamentErrors(input: Pick<TournamentInput, 'teams' | 'groups' | 'perGroup'>): string[] {
  const e: string[] = [];
  const n = input.teams.length;
  if (!Number.isInteger(input.groups) || input.groups < 1 || input.groups > 8) e.push('Los grupos van de 1 a 8.');
  else if (n < 2 * input.groups) e.push(`Con ${input.groups} grupos hacen falta al menos ${2 * input.groups} equipos.`);
  const smallest = input.groups >= 1 ? Math.floor(n / input.groups) : 0;
  if (!Number.isInteger(input.perGroup) || input.perGroup < 1) e.push('Tiene que clasificar al menos 1 por grupo.');
  else if (input.perGroup > smallest && smallest > 0) e.push(`Clasifican como mucho ${smallest} por grupo.`);
  else if (input.groups * input.perGroup < 2) e.push('Hacen falta al menos 2 clasificados para la final.');
  return e;
}

function clock(date: string, start: string, minutes: number): { date: string; time: string } {
  const [h, m] = start.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const days = Math.floor(total / 1440);
  const rest = total - days * 1440;
  return { date: days ? addDays(date, days) : date, time: `${String(Math.floor(rest / 60)).padStart(2, '0')}:${String(rest % 60).padStart(2, '0')}` };
}

/** Arma el torneo: grupos, sus partidos por turnos y la eliminatoria por definir. Lanza Error si no se puede. */
export function planTournament(input: TournamentInput): TournamentPlan {
  const errors = tournamentErrors(input);
  if (errors.length) throw new Error(errors[0]);
  const courts = input.courts.length ? [...input.courts] : [''];
  const C = courts.length;
  const first = input.firstRound ?? 1;
  const slot = Math.max(5, Math.floor(input.slotMinutes));
  const groups = snakeGroups(input.teams, input.groups).map((teams, g) => ({ name: groupName(g), teams }));
  const games: PlannedGame[] = [];
  let slotBase = 0;
  const at = (k: number) => {
    const s = clock(input.date, input.start, (slotBase + Math.floor(k / C)) * slot);
    return { ...s, court: courts[k % C] || null, scheduledAt: zonedIso(s.date, s.time, input.tz) };
  };

  // Fase de grupos: la ronda r de todos los grupos, en turnos nuevos.
  const rounds = groups.map((g) => roundRobin(g.teams));
  const maxRounds = Math.max(0, ...rounds.map((r) => r.length));
  for (let r = 0; r < maxRounds; r++) {
    const batch = groups.flatMap((g, gi) => (rounds[gi][r]?.matches ?? []).map((f) => ({ g, f })));
    batch.forEach(({ g, f }, k) => {
      games.push({ stage: g.name, round: first + r, ...at(k), home: f.home, away: f.away, homeLabel: '', awayLabel: '', bracketKey: null });
    });
    slotBase += Math.ceil(batch.length / C);
  }

  // Eliminatoria: un turno por ronda (el 3.er lugar con la final).
  const seeds = tournamentSeeds(input);
  const bracket = createBracket(seeds, { thirdPlace: input.thirdPlace && seeds.length >= 4 });
  const played = (m: BracketMatch) => !m.bye;
  const name = (m: BracketMatch) => (m.thirdPlace ? 'Tercer lugar' : roundName(m.round, bracket.rounds));
  const numbered = new Map<string, string>();
  for (let r = 1; r <= bracket.rounds; r++) {
    const list = bracket.matches.filter((m) => m.round === r && !m.thirdPlace && played(m));
    list.forEach((m, i) => numbered.set(m.key, list.length > 1 ? `${name(m)} ${i + 1}` : name(m)));
  }
  // Nombre de lo que llega a cada lado: el puesto del grupo, o el ganador (perdedor) de un partido anterior.
  const feed = new Map<string, [string, string]>();
  for (const m of bracket.matches) if (m.round === 1) feed.set(m.key, [m.side1 ? placeLabel(m.side1) : '', m.side2 ? placeLabel(m.side2) : '']);
  for (const m of bracket.matches) {
    const mine = feed.get(m.key) ?? ['', ''];
    const winnerText = m.bye ? mine[0] || mine[1] : `Ganador ${numbered.get(m.key)}`;
    for (const [target, text] of [
      [m.next, winnerText],
      [m.loserNext, `Perdedor ${numbered.get(m.key)}`],
    ] as const) {
      if (!target) continue;
      const cur = feed.get(target.key) ?? ['', ''];
      cur[target.side - 1] = text;
      feed.set(target.key, cur);
    }
  }
  for (let r = 1; r <= bracket.rounds; r++) {
    const list = bracket.matches.filter((m) => m.round === r && played(m));
    list.forEach((m, k) => {
      const [a, b] = feed.get(m.key) ?? ['Por definir', 'Por definir'];
      games.push({ stage: name(m), round: first + maxRounds + r - 1, ...at(k), home: null, away: null, homeLabel: a || 'Por definir', awayLabel: b || 'Por definir', bracketKey: m.key });
    });
    slotBase += Math.ceil(list.length / C);
  }
  return { groups, games, seeds, bracket };
}

/** Borradores para `createMatches` (un lote). `knockoutRules` = reglas de la eliminatoria (penales si empatan). */
export function tournamentDrafts(plan: TournamentPlan, opts: { format?: string; knockoutRules?: Record<string, unknown> } = {}): MatchDraft[] {
  return plan.games.map((g) => {
    const d: MatchDraft = {
      round: g.round,
      stage: g.stage.slice(0, 40),
      court: g.court ?? '',
      scheduledAt: g.scheduledAt,
      format: opts.format,
      sides: [
        g.home ? { side: 1, teamId: g.home } : { side: 1, teamId: null, label: g.homeLabel.slice(0, 80) },
        g.away ? { side: 2, teamId: g.away } : { side: 2, teamId: null, label: g.awayLabel.slice(0, 80) },
      ],
    };
    if (g.bracketKey) {
      d.bracketKey = g.bracketKey;
      if (opts.knockoutRules) d.rules = opts.knockoutRules;
    }
    return d;
  });
}

export interface AdvanceInput extends TournamentSetup {
  /** Tabla final de cada grupo (ids en orden) o null si ese grupo todavía no termina. Índice = grupo (0 = A). */
  rankings: readonly (readonly string[] | null)[];
  /** Los partidos del cuadro (con `bracketKey`). */
  knockout: readonly Pick<Match, 'id' | 'bracketKey' | 'status' | 'winner' | 'proposedAt' | 'sides'>[];
  now?: number;
}

export interface SideChange {
  matchId: string;
  bracketKey: string;
  sides: [SideDraft, SideDraft];
}

/**
 * Lados de la eliminatoria que ya se saben y todavía no están puestos: los clasificados de los grupos terminados y
 * los ganadores (o perdedores, para el 3.er lugar) de los partidos del cuadro que ya cuentan. Solo partidos sin
 * resultado; lo que no se sabe se queda como está.
 */
export function advanceTournament(input: AdvanceInput): SideChange[] {
  const now = input.now ?? Date.now();
  const bracket = tournamentBracket(input);
  const byKey = new Map(input.knockout.filter((m) => m.bracketKey).map((m) => [m.bracketKey!, m] as const));
  const resolve = (ph: string | null): string | null => {
    if (!ph) return null;
    const m = /^([A-Z]+)(\d+)$/.exec(ph);
    if (!m) return null;
    const g = [...m[1]].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
    return input.rankings[g]?.[Number(m[2]) - 1] ?? null;
  };
  const want = new Map<string, [string | null, string | null]>();
  for (const bm of bracket.matches) if (bm.round === 1) want.set(bm.key, [resolve(bm.side1), resolve(bm.side2)]);
  for (const bm of bracket.matches) {
    const s = want.get(bm.key) ?? [null, null];
    let winner: string | null = null;
    let loser: string | null = null;
    if (bm.bye) winner = s[0] ?? s[1];
    else {
      const db = byKey.get(bm.key);
      if (db && isFinal(db, now) && (db.winner === 1 || db.winner === 2)) {
        winner = db.sides[db.winner - 1].teamId;
        loser = db.sides[db.winner === 1 ? 1 : 0].teamId;
      }
    }
    for (const [target, who] of [
      [bm.next, winner],
      [bm.loserNext, loser],
    ] as const) {
      if (!target || !who) continue;
      const cur = want.get(target.key) ?? [null, null];
      cur[target.side - 1] = who;
      want.set(target.key, cur);
    }
  }
  const out: SideChange[] = [];
  for (const bm of bracket.matches) {
    if (bm.bye) continue;
    const db = byKey.get(bm.key);
    const w = want.get(bm.key);
    if (!db || !w || hasResult(db) || (db.status !== 'scheduled' && db.status !== 'postponed')) continue;
    if (w.every((t, i) => !t || t === db.sides[i].teamId)) continue;
    out.push({
      matchId: db.id,
      bracketKey: bm.key,
      sides: [0, 1].map((i) => {
        const side = (i + 1) as 1 | 2;
        const team = w[i];
        return team ? { side, teamId: team } : { side, teamId: db.sides[i].teamId, label: db.sides[i].label };
      }) as [SideDraft, SideDraft],
    });
  }
  return out;
}

/** El torneo guardado en las reglas de la liga (`rules.tournament`), o null. */
export function tournamentSetupOf(rules: unknown): TournamentSetup | null {
  const t = typeof rules === 'object' && rules !== null ? (rules as Record<string, unknown>).tournament : null;
  if (typeof t !== 'object' || t === null) return null;
  const r = t as Record<string, unknown>;
  const groups = typeof r.groups === 'number' && Number.isInteger(r.groups) && r.groups >= 1 && r.groups <= 8 ? r.groups : null;
  const perGroup = typeof r.perGroup === 'number' && Number.isInteger(r.perGroup) && r.perGroup >= 1 && r.perGroup <= 8 ? r.perGroup : null;
  if (!groups || !perGroup || groups * perGroup < 2) return null;
  return { groups, perGroup, thirdPlace: r.thirdPlace === true };
}
