/**
 * Evaluadores de boliche (docs/insignias.md §2.1 y §2.2): el debut, las de carrera de la cuenta (`bowling_career`,
 * `climbing`), las marcas de un juego que van al jugador en su liga (`bowling_game`) y lo de un torneo cerrado
 * (`bowling_event` y la parte de boliche de `event_podium`). Los juegos son los B1 del kit (con juez y parte) y las
 * tablas del torneo salen de los helpers de la app (`entryLine`, `individualValue`, `teamLines`, `category`) con
 * solo esos juegos.
 *
 * Trabajos: `resultado`/`revisar` con 'entry:<id>' (y `payload.refs`/`payload.players` si se borró), `vinculo`,
 * `evento` con 'event:<id>' (a `events.date` + 3 días) e `historial`. Lo que necesita de la foto:
 * - `players` de los jugadores del trabajo, de todos los jugadores de boliche de sus cuentas y de los demás que
 *   jugaron esos eventos; `leagues` de todos ellos;
 * - `entries` con el historial completo de boliche de esas cuentas (y del jugador sin cuenta) y todas las del evento
 *   del trabajo; en un `evento`, de cada competidor sus últimos 30 juegos antes de la fecha (línea base);
 * - `events` de esas participaciones, `teams` del torneo, `submissions` aprobadas de esos jugadores (juez y parte);
 * - `members` owner, admin y anotadores de esas ligas; `profiles` y `league_months` para la liga real;
 * - `awards` (incluidas las revocadas) y `progress` de la cuenta y de cada jugador del trabajo.
 */
import { frameStats } from '../../lib/bowling';
import { toEntry, toEvent } from '../../lib/data/rows';
import { category, DEFAULT_CUTS, entryLine, individualValue, teamLines, teamValue, type Line, type TeamLine } from '../../lib/stats';
import type { BowlingEvent } from '../../lib/types';
import { badgeDef, badgesOfEvaluator, paramOf, thresholdOf } from '../catalog';
import type { EvaluatorSet } from '../engine';
import { BOWLING_BASE_MIN, BOWLING_BASE_WINDOW } from '../rules/baselines';
import { gameRef, longestStrikeRun, splitConversions, type BowlingGame } from '../rules/bowling';
import { CAPS, capPerDay, podiumAwards, podiumLevels, topWithTies } from '../rules/gates';
import { addDays, periodKey } from '../rules/periods';
import type { SnapEntry, SnapEvent } from '../snapshot';
import type { BadgeDecision, BadgeDef, BadgeHolder, Level } from '../types';
import { awardOf, eventCtx, groupBy, kitOf, leagueCtx, playerHolderOf, realOn, statusFor, type AccountTarget, type Evaluator, type Kit } from './kit';
import {
  always,
  careerAwards,
  jobEvents,
  milestones,
  progressFor,
  refIds,
  reviewersFor,
  reviewOf,
  staleRevokes,
  targetAccounts,
  targetPlayers,
  type Proof,
} from './series';

const def = (key: string): BadgeDef => badgeDef(key)!;
const DEBUT = def('debut');
const CLIMBING = def('climbing');
const PODIUM = def('event_podium');
const GAMES = def('bowling_games');
const BREAKTHROUGH = def('bowling_breakthrough');
const CLUB = def('bowling_club');
const SERIES = def('bowling_series');
const OVER_AVERAGE = def('bowling_over_average');
const STRIKES = def('bowling_strike_streak');
const PERFECT = def('bowling_perfect_game');
const CLEAN = def('bowling_clean_game');
const SPLIT = def('bowling_split');
const SEVEN_TEN = def('bowling_seven_ten');
const CATEGORY_WIN = def('bowling_category_win');
const TEAM_WIN = def('bowling_team_win');

const CAREER_KEYS = badgesOfEvaluator('bowling_career').map((d) => d.key);
const GAME_KEYS = badgesOfEvaluator('bowling_game').map((d) => d.key);
const EVENT_KEYS = badgesOfEvaluator('bowling_event').map((d) => d.key);

// ---------------------------------------------------------------------------------------------------------
// Juegos de un dueño

/**
 * Juegos B1 que suman para una insignia de cuenta: de sus jugadores, en ligas reales ese mes (sin contar a la propia
 * cuenta entre las 4) y, de un jugador que se reclamó a sí mismo, solo los verificados (B2).
 */
export function accountGames(kit: Kit, t: Pick<AccountTarget, 'players' | 'user'>): BowlingGame[] {
  const mine = new Set(t.players);
  return kit.bowling().filter((g) => mine.has(g.player_id) && realOn(kit, g.league_id, g.date, t) && (!kit.verifiedOnly(g.player_id) || g.verified));
}

/** Todos los juegos B1 de unos jugadores (la línea base no mira la liga real). En orden de juego. */
const ownGames = (kit: Kit, players: Iterable<string>): BowlingGame[] => {
  const mine = new Set(players);
  return kit.bowling().filter((g) => mine.has(g.player_id));
};

/** Los jugadores de boliche de la cuenta de un jugador (o él solo, sin cuenta). */
function accountPlayersOf(kit: Kit, playerId: string): string[] {
  const u = kit.userOf(playerId);
  if (!u) return [playerId];
  return [...kit.players.values()].filter((p) => p.user_id === u && kit.sportOf(p.league_id) === 'bowling').map((p) => p.id);
}

/**
 * Línea base de boliche (§1.7.6) de cada fecha: piso de la media de los últimos 30 juegos antes de ese día, con 12 o
 * más. Lo mismo que `bowlingBaseline` (baselines.ts), pero sin volver a ordenar para cada juego.
 */
export function baselineAt(games: readonly BowlingGame[], opts: { window?: number; min?: number } = {}): (date: string) => { base: number; games: number } | null {
  const window = opts.window ?? BOWLING_BASE_WINDOW;
  const min = opts.min ?? BOWLING_BASE_MIN;
  const memo = new Map<string, { base: number; games: number } | null>();
  return (date) => {
    let r = memo.get(date);
    if (r !== undefined) return r;
    // Los juegos vienen en orden de juego (primero la fecha): los anteriores a `date` son un prefijo.
    let lo = 0;
    let hi = games.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (games[mid].date < date) lo = mid + 1;
      else hi = mid;
    }
    const prior = games.slice(Math.max(0, lo - window), lo);
    r = prior.length < min ? null : { base: Math.floor(prior.reduce((n, g) => n + g.score, 0) / prior.length), games: prior.length };
    memo.set(date, r);
    return r;
  };
}

/** Evidencia de un juego: su fecha, su ref y la liga y el evento. */
const gameProof = (kit: Kit, g: BowlingGame, values: Proof['values'], more: BowlingGame[] = []): Proof => ({
  date: [g, ...more].reduce((d, x) => (x.date > d ? x.date : d), g.date),
  refs: [g, ...more].map(gameRef),
  values,
  context: { ...leagueCtx(kit, g.league_id), ...eventCtx(kit, g.event_id) },
});

const best = (xs: readonly number[]): number => (xs.length ? Math.max(...xs) : 0);

// ---------------------------------------------------------------------------------------------------------
// Debut

export const bowlingDebut: Evaluator = (job, snap, now) => {
  const kit = kitOf(job, snap, now);
  const out: BadgeDecision[] = [];
  for (const t of targetAccounts(kit, 'bowling')) {
    const first = accountGames(kit, t)[0];
    const produced = first ? careerAwards(kit, DEBUT, t.holder, 'bowling', [{ level: 0 as Level, item: first }], (g) => gameProof(kit, g, {})) : [];
    out.push(...produced, ...staleRevokes(kit, produced, { holders: [t.holder], keys: [DEBUT.key], sport: 'bowling', period: always }));
  }
  return out;
};

// ---------------------------------------------------------------------------------------------------------
// Carrera (cuenta)

/** Tres juegos B1 seguidos de una misma participación (la lógica de `highSeries`, stats.ts). */
interface Series {
  games: [BowlingGame, BowlingGame, BowlingGame];
  sum: number;
  verified: boolean;
}

function seriesOf(games: readonly BowlingGame[]): Series[] {
  const out: Series[] = [];
  for (const list of groupBy(games, (g) => g.entry_id).values()) {
    const run = [...list].sort((a, b) => a.index - b.index);
    for (let i = 0; i + 3 <= run.length; i++) {
      const three = run.slice(i, i + 3) as Series['games'];
      out.push({ games: three, sum: three.reduce((n, g) => n + g.score, 0), verified: three.every((g) => g.verified) });
    }
  }
  // En el orden del tercer juego (cuando se completó la serie).
  const order = new Map(games.map((g, i) => [gameRef(g), i]));
  return out.sort((a, b) => order.get(gameRef(a.games[2]))! - order.get(gameRef(b.games[2]))!);
}

/** Todas las de carrera de boliche de un dueño con sus juegos (ya en orden y en ligas reales). */
export function bowlingCareerFor(kit: Kit, holder: BadgeHolder, games: readonly BowlingGame[], baseGames: readonly BowlingGame[]): BadgeDecision[] {
  const out: BadgeDecision[] = [];
  const strictOk = (verified: boolean) => (l: { strict?: boolean }) => !l.strict || verified;

  // Líneas jugadas: B1, máximo 10 por día.
  const capped = capPerDay(games, (g) => g.date, paramOf(GAMES, 'maxPerDay', 'bowling') ?? CAPS.bowlingGamesPerDay);
  const counted = capped.map((g, i) => ({ g, n: i + 1 }));
  const gamesHits = milestones(GAMES, counted, (c) => c.n, { variant: 'bowling' });
  out.push(...careerAwards(kit, GAMES, holder, 'bowling', gamesHits, (c, level) => gameProof(kit, c.g, { n: thresholdOf(GAMES, level, 'bowling')! })));
  out.push(progressFor(kit, GAMES, holder, 'bowling', capped.length, { gained: gamesHits }));

  // Rompe barreras: el primer juego que pasa cada barrera (privada por defecto; los niveles de un salto se dan juntos).
  const breakHits = milestones(BREAKTHROUGH, games, (g) => g.score, { variant: 'bowling' });
  out.push(...careerAwards(kit, BREAKTHROUGH, holder, 'bowling', breakHits, (g, level) => gameProof(kit, g, { n: thresholdOf(BREAKTHROUGH, level, 'bowling')! })));
  out.push(progressFor(kit, BREAKTHROUGH, holder, 'bowling', best(games.map((g) => g.score)), { gained: breakHits }));

  // Club de los 200: 200 y 225 con B1; 250 y 275 con B2.
  const clubHits = milestones(CLUB, games, (g) => g.score, { variant: 'bowling', ok: (g, l) => strictOk(g.verified)(l) });
  out.push(...careerAwards(kit, CLUB, holder, 'bowling', clubHits, (g, level) => gameProof(kit, g, { n: thresholdOf(CLUB, level, 'bowling')! })));
  out.push(progressFor(kit, CLUB, holder, 'bowling', (l) => best(games.filter((g) => strictOk(g.verified)(l)).map((g) => g.score)), { gained: clubHits }));

  // Serie de tres: oro con los tres juegos B2.
  const series = seriesOf(games);
  const seriesHits = milestones(SERIES, series, (s) => s.sum, { variant: 'bowling', ok: (s, l) => strictOk(s.verified)(l) });
  out.push(...careerAwards(kit, SERIES, holder, 'bowling', seriesHits, (s) => gameProof(kit, s.games[2], { n: s.sum }, [s.games[0], s.games[1]])));
  out.push(progressFor(kit, SERIES, holder, 'bowling', (l) => best(series.filter((s) => strictOk(s.verified)(l)).map((s) => s.sum)), { gained: seriesHits }));

  // Por encima de ti: contra la línea base de los juegos anteriores a la fecha del evento (12+). Oro con B2.
  // Solo se guarda la ganancia, nunca el punto de partida (§1.2).
  const base = baselineAt(baseGames, { window: paramOf(OVER_AVERAGE, 'baseWindow', 'bowling'), min: paramOf(OVER_AVERAGE, 'minBaseGames', 'bowling') });
  const overs = games.flatMap((g) => {
    const b = base(g.date);
    return b ? [{ g, diff: g.score - b.base }] : [];
  });
  const overHits = milestones(OVER_AVERAGE, overs, (o) => o.diff, { variant: 'bowling', ok: (o, l) => strictOk(o.g.verified)(l) });
  out.push(...careerAwards(kit, OVER_AVERAGE, holder, 'bowling', overHits, (o) => gameProof(kit, o.g, { n: o.diff })));
  out.push(progressFor(kit, OVER_AVERAGE, holder, 'bowling', (l) => Math.max(0, best(overs.filter((o) => strictOk(o.g.verified)(l)).map((o) => o.diff))), { gained: overHits }));

  // Racha de strikes: solo juegos anotados bola por bola (B3), con las bolas extra del cuadro 10. Oro con B2.
  const runs = games.flatMap((g) => (g.frames ? [{ g, run: longestStrikeRun(g.frames.rolls) }] : []));
  const runHits = milestones(STRIKES, runs, (r) => r.run, { variant: 'bowling', ok: (r, l) => strictOk(r.g.verified)(l) });
  out.push(...careerAwards(kit, STRIKES, holder, 'bowling', runHits, (r) => gameProof(kit, r.g, { n: r.run })));
  out.push(progressFor(kit, STRIKES, holder, 'bowling', (l) => best(runs.filter((r) => strictOk(r.g.verified)(l)).map((r) => r.run)), { gained: runHits }));
  return out;
}

export const bowlingCareer: Evaluator = (job, snap, now) => {
  const kit = kitOf(job, snap, now);
  const out: BadgeDecision[] = [];
  for (const t of targetAccounts(kit, 'bowling')) {
    const produced = bowlingCareerFor(kit, t.holder, accountGames(kit, t), ownGames(kit, t.players));
    out.push(...produced, ...staleRevokes(kit, produced, { holders: [t.holder], keys: CAREER_KEYS, sport: 'bowling', period: always }));
  }
  return out;
};

/**
 * Subiendo (boliche): media de los últimos 18 juegos menos la de los primeros 18, con 36 o más. Se mide después de
 * cada juego y un nivel alcanzado se queda aunque la media baje después.
 */
export const bowlingClimbing: Evaluator = (job, snap, now) => {
  const kit = kitOf(job, snap, now);
  const window = paramOf(CLIMBING, 'window', 'bowling') ?? 18;
  const min = Math.max(paramOf(CLIMBING, 'minCount', 'bowling') ?? 36, window * 2);
  const out: BadgeDecision[] = [];
  for (const t of targetAccounts(kit, 'bowling')) {
    const games = accountGames(kit, t);
    const steps: { g: BowlingGame; gain: number }[] = [];
    if (games.length >= min) {
      const first = games.slice(0, window).reduce((n, g) => n + g.score, 0) / window;
      let last = games.slice(min - window, min).reduce((n, g) => n + g.score, 0);
      for (let k = min; k <= games.length; k++) {
        if (k > min) last += games[k - 1].score - games[k - 1 - window].score;
        steps.push({ g: games[k - 1], gain: last / window - first });
      }
    }
    const hits = milestones(CLIMBING, steps, (s) => s.gain, { variant: 'bowling' });
    const produced: BadgeDecision[] = careerAwards(kit, CLIMBING, t.holder, 'bowling', hits, (s) => gameProof(kit, s.g, { n: Math.floor(s.gain) }));
    produced.push(progressFor(kit, CLIMBING, t.holder, 'bowling', Math.max(0, Math.floor(best(steps.map((s) => s.gain)))), { gained: hits }));
    out.push(...produced, ...staleRevokes(kit, produced, { holders: [t.holder], keys: [CLIMBING.key], sport: 'bowling', period: always }));
  }
  return out;
};

// ---------------------------------------------------------------------------------------------------------
// Marcas de un juego (liga)

/** La id de una participación en un ref 'entry:<id>' o 'entry:<id>:<g>'. */
const entryIdOf = (id: string) => id.split(':')[0];

/** Las marcas de un juego que van al jugador en su liga (período `g:<entry>:<i>`). */
export function gameDecisions(kit: Kit, entry: SnapEntry, games: readonly BowlingGame[]): BadgeDecision[] {
  const out: BadgeDecision[] = [];
  const holder = playerHolderOf(entry.player_id, entry.league_id);
  // Quien avala no puede ser el jugador ni otro que jugó ese evento (§1.7.5).
  const rivals = (kit.snap.entries ?? []).filter((e) => e.event_id === entry.event_id).map((e) => kit.userOf(e.player_id));
  const reviewers = () => reviewersFor(kit, entry.league_id, [kit.userOf(entry.player_id), ...rivals]);
  for (const g of games) {
    if (!realOn(kit, g.league_id, g.date)) continue;
    const period = periodKey.game(entry.id, g.index);
    const context = { ...leagueCtx(kit, g.league_id), ...eventCtx(kit, g.event_id) };
    const status = statusFor(kit, g.date);
    const refs = [gameRef(g)];
    const values = { n: g.score, juego: g.index + 1 };
    // Juego perfecto: 300 con foto; si tiene cuadros, que sean los 12 strikes.
    const raw = entry.frames?.[String(g.index)];
    if (g.score === 300 && g.verified && (!raw || (g.frames && longestStrikeRun(g.frames.rolls) >= 12))) {
      out.push(reviewOf(PERFECT, holder, 'bowling', 0, period, refs, { ...context, values }, reviewers()));
    }
    if (!g.frames) continue;
    if (frameStats(g.frames.rolls).opens === 0) out.push(awardOf(CLEAN, holder, 'bowling', 0, period, status, refs, { ...context, values }));
    if (!g.masks) continue;
    const { splits, sevenTen } = splitConversions(g.frames);
    if (splits.length) out.push(awardOf(SPLIT, holder, 'bowling', 0, period, status, refs, { ...context, values: { ...values, splits: splits.length } }));
    if (sevenTen.length && g.verified) out.push(reviewOf(SEVEN_TEN, holder, 'bowling', 0, period, refs, { ...context, values }, reviewers()));
  }
  return out;
}

export const bowlingGame: Evaluator = (job, snap, now) => {
  const kit = kitOf(job, snap, now);
  const historial = job.kind === 'historial';
  const targets = new Set(targetPlayers(kit, 'bowling').map((p) => p.id));
  const refEntries = new Set(refIds(job, 'entry').map(entryIdOf));
  const events = jobEvents(kit);
  const byEntry = groupBy(kit.bowling(), (g) => g.entry_id);
  const out: BadgeDecision[] = [];
  const scopes: Parameters<typeof staleRevokes>[2][] = [];
  const seen = new Set<string>();
  for (const e of snap.entries ?? []) {
    if (!targets.has(e.player_id) || !(historial || refEntries.has(e.id) || events.has(e.event_id))) continue;
    seen.add(e.id);
    out.push(...gameDecisions(kit, e, byEntry.get(e.id) ?? []));
    scopes.push({ holders: [playerHolderOf(e.player_id, e.league_id)], keys: GAME_KEYS, sport: 'bowling', period: (p) => p.startsWith(`g:${e.id}:`) });
  }
  // Una participación que ya no está (se borró): lo suyo que seguía provisional se retira.
  for (const id of refEntries) if (!seen.has(id)) scopes.push({ keys: GAME_KEYS, sport: 'bowling', period: (p) => p.startsWith(`g:${id}:`) });
  if (historial) for (const p of targets) scopes.push({ holders: [playerHolderOf(p, kit.players.get(p)!.league_id)], keys: GAME_KEYS, sport: 'bowling', period: (k) => k.startsWith('g:') });
  for (const s of scopes) out.push(...staleRevokes(kit, out, s));
  return out;
};

// ---------------------------------------------------------------------------------------------------------
// Torneo cerrado (liga): podio, mejor de su categoría y título por equipos

/** Una línea del torneo con solo los juegos B1 del jugador. */
interface EventTable {
  event: BowlingEvent;
  lines: Line[];
  value: (l: Line) => number;
}

const tables = new WeakMap<Kit, Map<string, EventTable>>();

/**
 * La tabla de un torneo con los juegos B1 (los que no cuentan quedan fuera). Si la liga pide foto, solo entran los
 * jugadores con todos sus juegos B2.
 */
export function eventTable(kit: Kit, ev: SnapEvent): EventTable {
  let byEvent = tables.get(kit);
  if (!byEvent) {
    byEvent = new Map();
    tables.set(kit, byEvent);
  }
  const hit = byEvent.get(ev.id);
  if (hit) return hit;
  const event = toEvent(ev, kit.snap.teams ?? []) as unknown as BowlingEvent;
  const requirePhoto = !!kit.leagues.get(ev.league_id)?.require_photo;
  const b1 = groupBy(
    kit.bowling().filter((g) => g.event_id === ev.id),
    (g) => g.entry_id,
  );
  const lines: Line[] = [];
  for (const row of kit.snap.entries ?? []) {
    if (row.event_id !== ev.id) continue;
    const games = b1.get(row.id) ?? [];
    if (!games.length || (requirePhoto && !games.every((g) => g.verified))) continue;
    const idx = new Set(games.map((g) => g.index));
    const entry = toEntry(row);
    const masked = { ...entry, scores: entry.scores.map((s, i) => (idx.has(i) ? s : null)), photos: entry.photos.map((p, i) => (idx.has(i) ? p : null)) };
    const line = entryLine(masked, event);
    if (line.games > 0) lines.push(line);
  }
  const table = { event, lines, value: individualValue(event) };
  byEvent.set(ev.id, table);
  return table;
}

/**
 * Torneos de boliche del trabajo: el del ref, o en el historial de una liga todos los suyos que ya pasaron su gracia
 * (3 días). El historial de una cuenta (sin liga) no da títulos de eventos: los da el de la liga, con la liga entera.
 */
function scopedEvents(kit: Kit): SnapEvent[] {
  const graceDays = Math.ceil((paramOf(PODIUM, 'graceHours', 'bowling') ?? 72) / 24);
  const refs = jobEvents(kit);
  const historial = kit.job.kind === 'historial';
  return [...kit.events.values()].filter(
    (e) =>
      e.type === 'torneo' &&
      kit.sportOf(e.league_id) === 'bowling' &&
      (historial ? !!kit.job.league_id && e.league_id === kit.job.league_id && addDays(e.date, graceDays) <= kit.today : refs.has(e.id)),
  );
}

const eventContext = (kit: Kit, ev: SnapEvent) => ({ ...leagueCtx(kit, ev.league_id), ...eventCtx(kit, ev.id) });

/** Podio de un torneo de boliche (§2.1): liga `kind='liga'`, 6+ jugadores con juegos B1; tamaño por §1.7.8. */
export function bowlingPodiumFor(kit: Kit, ev: SnapEvent): BadgeDecision[] {
  const league = kit.leagues.get(ev.league_id);
  if (!league || league.kind !== 'liga' || !realOn(kit, ev.league_id, ev.date)) return [];
  const { lines, value } = eventTable(kit, ev);
  if (lines.length < (paramOf(PODIUM, 'minPlayers', 'bowling') ?? 6)) return [];
  return podiumAwards(lines, (a, b) => value(b) - value(a), podiumLevels(lines.length)).map(({ row, place, level }) =>
    awardOf(PODIUM, playerHolderOf(row.entry.playerId, ev.league_id), 'bowling', level, periodKey.event(ev.id), 'firme', [`entry:${row.entry.id}`], {
      ...eventContext(kit, ev),
      values: { n: place, of: lines.length, value: value(row) },
    }),
  );
}

/**
 * Mejor de su categoría (§2.2): categoría por el promedio de entrada (`category_cuts`), salvo que esté más de 15
 * pinos por debajo de su línea base (anti-sandbagging); 4+ jugadores con juegos B1 en la categoría.
 */
export function categoryWinFor(kit: Kit, ev: SnapEvent): BadgeDecision[] {
  if (!realOn(kit, ev.league_id, ev.date)) return [];
  const { event, lines, value } = eventTable(kit, ev);
  const sandbag = paramOf(CATEGORY_WIN, 'sandbagPins', 'bowling') ?? 15;
  const min = paramOf(CATEGORY_WIN, 'minInCategory', 'bowling') ?? 4;
  const cuts = event.categoryCuts ?? DEFAULT_CUTS;
  const byCat = groupBy(lines, (l) => {
    const b = baselineAt(ownGames(kit, accountPlayersOf(kit, l.entry.playerId)))(ev.date);
    const avg = b && l.entry.average < b.base - sandbag ? b.base : l.entry.average;
    return category(avg, cuts);
  });
  const out: BadgeDecision[] = [];
  for (const [cat, group] of byCat) {
    if (group.length < min) continue;
    for (const row of topWithTies(group, (a, b) => value(b) - value(a)).winners) {
      out.push(
        awardOf(CATEGORY_WIN, playerHolderOf(row.entry.playerId, ev.league_id), 'bowling', 0, periodKey.event(ev.id), 'firme', [`entry:${row.entry.id}`], {
          ...eventContext(kit, ev),
          values: { categoria: cat, n: value(row), of: group.length },
        }),
      );
    }
  }
  return out;
}

/** Título por equipos (§2.2): 3+ equipos con 2+ jugadores con juegos B1; va a los miembros que jugaron. */
export function teamWinFor(kit: Kit, ev: SnapEvent): BadgeDecision[] {
  if (!realOn(kit, ev.league_id, ev.date)) return [];
  const { event, lines } = eventTable(kit, ev);
  const teams = teamLines(event, lines).filter((t) => t.members.length >= (paramOf(TEAM_WIN, 'minMembers', 'bowling') ?? 2));
  if (teams.length < (paramOf(TEAM_WIN, 'minTeams', 'bowling') ?? 3)) return [];
  const v: (t: TeamLine) => number = teamValue(event);
  const out: BadgeDecision[] = [];
  for (const team of topWithTies(teams, (a, b) => v(b) - v(a)).winners) {
    for (const m of team.members) {
      out.push(
        awardOf(TEAM_WIN, playerHolderOf(m.entry.playerId, ev.league_id), 'bowling', 0, periodKey.event(ev.id), 'firme', [`entry:${m.entry.id}`], {
          ...eventContext(kit, ev),
          team: { id: team.teamId, name: team.name },
          values: { n: v(team), of: teams.length },
        }),
      );
    }
  }
  return out;
}

export const bowlingPodium: Evaluator = (job, snap, now) => {
  const kit = kitOf(job, snap, now);
  const out: BadgeDecision[] = [];
  for (const ev of scopedEvents(kit)) {
    const produced = bowlingPodiumFor(kit, ev);
    out.push(...produced, ...staleRevokes(kit, produced, { keys: [PODIUM.key], sport: 'bowling', period: (p) => p === periodKey.event(ev.id) }));
  }
  return out;
};

export const bowlingEvent: Evaluator = (job, snap, now) => {
  const kit = kitOf(job, snap, now);
  const out: BadgeDecision[] = [];
  for (const ev of scopedEvents(kit)) {
    const produced = [...categoryWinFor(kit, ev), ...teamWinFor(kit, ev)];
    out.push(...produced, ...staleRevokes(kit, produced, { keys: EVENT_KEYS, sport: 'bowling', period: (p) => p === periodKey.event(ev.id) }));
  }
  return out;
};

export const BOWLING_EVALUATORS: EvaluatorSet = {
  debut: bowlingDebut,
  climbing: bowlingClimbing,
  event_podium: bowlingPodium,
  bowling_career: bowlingCareer,
  bowling_game: bowlingGame,
  bowling_event: bowlingEvent,
};
