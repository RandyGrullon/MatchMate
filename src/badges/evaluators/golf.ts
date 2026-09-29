/**
 * Evaluadores de golf (docs/insignias.md §2.1 y §2.7): el debut, las de carrera de la cuenta (`golf_career`,
 * `climbing`), las marcas de una tarjeta que van al jugador en su liga (`golf_card`) y la parte de golf de
 * `event_podium` (una ronda cerrada o un torneo de varias rondas). Todo sobre la copia del campo que guarda la ronda,
 * con tarjetas G1 y G2 (rules/golf.ts), el diferencial MatchMate y el índice topado (rules/baselines.ts), y los
 * helpers de la app (`scoreRound`, `golfLeaderboard`).
 *
 * Trabajos: `resultado`/`revisar` con 'card:<id>' o 'round:<event>' (y `payload.refs` si se borró una tarjeta),
 * `vinculo`, `evento` con 'event:<event>' o 'gt:<torneo>' (24 h después del cierre) e `historial`. Lo que necesita de
 * la foto:
 * - `golf_cards` con el historial completo de golf de esas cuentas (y del jugador sin cuenta) y las demás tarjetas de
 *   sus mismos eventos (el marcador del grupo y quién no puede avalar), con sus jugadores en `players`;
 * - en un `evento`, todas las tarjetas de la ronda o del torneo y, de cada competidor, sus tarjetas G2 de 18 hoyos
 *   anteriores (las últimas 20, con las de su grupo) para el índice topado;
 * - `golf_rounds` y `events` (la fecha) de todas esas tarjetas; `leagues`, `members`, `profiles` y `league_months`;
 * - `awards` (incluidas las revocadas) y `progress` de la cuenta y de cada jugador del trabajo.
 */
import type { PlayedHole } from '../../sports/golf/course';
import { golfLeaderboard, type GolfPlayerRounds } from '../../sports/golf/leaderboard';
import { scoreRound } from '../../sports/golf/scoring';
import { badgeDef, badgesOfEvaluator, paramOf, placeLevel, thresholdOf } from '../catalog';
import type { EvaluatorSet } from '../engine';
import { cappedIndex, cappedPlayingHcp, golfDifferential } from '../rules/baselines';
import { CAPS, capPerDay, MAX_SHARED, podiumLevels } from '../rules/gates';
import { cardHoles, grossOf, isG1, isG2, markersOf } from '../rules/golf';
import { periodKey } from '../rules/periods';
import type { SnapGolfCard, SnapGolfRound } from '../snapshot';
import type { BadgeDecision, BadgeDef, Level } from '../types';
import { awardOf, eventCtx, groupBy, kitOf, leagueCtx, playerHolderOf, realOn, round1, statusFor, type AccountTarget, type Evaluator, type Kit } from './kit';
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
const ROUNDS = def('golf_rounds');
const BIRDIES = def('golf_birdies');
const BARRIER = def('golf_break_barrier');
const STABLEFORD = def('golf_stableford');
const COLLECTION = def('golf_birdie_collection');
const EAGLE = def('golf_eagle');
const HOLE_IN_ONE = def('golf_hole_in_one');
const PAR_ROUND = def('golf_par_round');
const NO_DISASTER = def('golf_no_disaster');
const COURSE_BEST = def('golf_course_best');

const CAREER_KEYS = badgesOfEvaluator('golf_career').map((d) => d.key);
const CARD_KEYS = badgesOfEvaluator('golf_card').map((d) => d.key);

// ---------------------------------------------------------------------------------------------------------
// Tarjetas de la foto

/** Una tarjeta con su ronda, sus hoyos y lo que se sabe de ella. */
export interface CardInfo {
  card: SnapGolfCard;
  round: SnapGolfRound;
  /** Fecha de la ronda ('YYYY-MM-DD', `events.date`). */
  date: string;
  holes: PlayedHole[];
  nine: boolean;
  g1: boolean;
  g2: boolean;
  /** Bruto sin hoyos levantados (null si levantó alguno). */
  gross: number | null;
  /** Diferencial MatchMate (no oficial). */
  diff: number | null;
}

const infosMemo = new WeakMap<Kit, CardInfo[]>();

/** Todas las tarjetas de la foto con su ronda, en orden de fecha (y de firma). */
export function cardInfos(kit: Kit): CardInfo[] {
  const hit = infosMemo.get(kit);
  if (hit) return hit;
  const rounds = new Map((kit.snap.golf_rounds ?? []).map((r) => [r.event_id, r]));
  const cards = kit.snap.golf_cards ?? [];
  const byEvent = groupBy(cards, (c) => c.event_id);
  const out: CardInfo[] = [];
  for (const card of cards) {
    const round = rounds.get(card.event_id);
    const date = kit.events.get(card.event_id)?.date;
    const holes = round ? cardHoles(card, round) : null;
    if (!round || !date || !holes) continue;
    const g1 = isG1(card, round);
    out.push({
      card,
      round,
      date,
      holes,
      nine: holes.length === 9,
      g1,
      g2: g1 && isG2(card, round, byEvent.get(card.event_id) ?? [], kit.userOf),
      gross: g1 ? grossOf(card, holes) : null,
      diff: g1 ? (golfDifferential(card, round)?.value ?? null) : null,
    });
  }
  out.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : (a.card.signed_at ?? '').localeCompare(b.card.signed_at ?? '') || a.card.id.localeCompare(b.card.id)));
  infosMemo.set(kit, out);
  return out;
}

/**
 * Tarjetas G1 que suman para una insignia de cuenta: de sus jugadores, en ligas reales ese mes y, de un jugador que
 * se reclamó a sí mismo, solo las G2.
 */
export function accountCards(kit: Kit, t: Pick<AccountTarget, 'players' | 'user'>): CardInfo[] {
  const mine = new Set(t.players);
  return cardInfos(kit).filter((i) => mine.has(i.card.player_id) && i.g1 && realOn(kit, i.card.league_id, i.date, t) && (!kit.verifiedOnly(i.card.player_id) || i.g2));
}

/** Los jugadores de golf de la cuenta de un jugador (o él solo, sin cuenta). */
function accountPlayersOf(kit: Kit, playerId: string): string[] {
  const u = kit.userOf(playerId);
  if (!u) return [playerId];
  return [...kit.players.values()].filter((p) => p.user_id === u && kit.sportOf(p.league_id) === 'golf').map((p) => p.id);
}

/** Diferenciales de rondas G2 de 18 hoyos de unos jugadores antes de una fecha, en orden (para el índice topado). */
export function differentialsBefore(kit: Kit, players: Iterable<string>, date: string): number[] {
  const mine = new Set(players);
  return cardInfos(kit)
    .filter((i) => mine.has(i.card.player_id) && i.g2 && !i.nine && i.diff != null && i.date < date)
    .map((i) => i.diff!);
}

/** Hándicap de juego recalculado con el índice topado (§1.7.6); si no se puede, el de la tarjeta. */
export function cappedHcp(kit: Kit, i: CardInfo): number {
  const index = cappedIndex(i.card.hcp_index, differentialsBefore(kit, accountPlayersOf(kit, i.card.player_id), i.date));
  return cappedPlayingHcp(i.card, i.round, index) ?? i.card.playing_hcp;
}

const scoreInput = (i: CardInfo, playingHcp: number) => ({
  holes: i.holes,
  playingHcp,
  card: { strokes: i.card.strokes, putts: i.card.putts, pickedUp: i.card.picked_up },
});

/** Hoyos jugados (sin levantar) con sus golpes. */
const played = (i: CardInfo) => i.holes.flatMap((h, k) => (!i.card.picked_up?.[k] && typeof i.card.strokes[k] === 'number' ? [{ hole: h, strokes: i.card.strokes[k]! }] : []));

const birdiesOf = (i: CardInfo): number => played(i).filter((x) => x.strokes === x.hole.par - 1).length;

const cardRef = (i: CardInfo) => `card:${i.card.id}`;

const cardProof = (kit: Kit, i: CardInfo, values: Proof['values'], more: CardInfo[] = []): Proof => ({
  date: [i, ...more].reduce((d, x) => (x.date > d ? x.date : d), i.date),
  refs: [i, ...more].map(cardRef),
  values,
  context: { ...leagueCtx(kit, i.card.league_id), ...eventCtx(kit, i.card.event_id) },
});

const lowest = (xs: readonly number[]): number | null => (xs.length ? Math.min(...xs) : null);
const highest = (xs: readonly number[]): number | null => (xs.length ? Math.max(...xs) : null);

// ---------------------------------------------------------------------------------------------------------
// Debut

export const golfDebut: Evaluator = (job, snap, now) => {
  const kit = kitOf(job, snap, now);
  const out: BadgeDecision[] = [];
  for (const t of targetAccounts(kit, 'golf')) {
    const first = accountCards(kit, t)[0];
    const produced = first ? careerAwards(kit, DEBUT, t.holder, 'golf', [{ level: 0 as Level, item: first }], (i) => cardProof(kit, i, {})) : [];
    out.push(...produced, ...staleRevokes(kit, produced, { holders: [t.holder], keys: [DEBUT.key], sport: 'golf', period: always }));
  }
  return out;
};

// ---------------------------------------------------------------------------------------------------------
// Carrera (cuenta)

/** Todas las de carrera de golf de un dueño con sus tarjetas G1 (ya en orden y en ligas reales). */
export function golfCareerFor(kit: Kit, t: AccountTarget, cards: readonly CardInfo[]): BadgeDecision[] {
  const out: BadgeDecision[] = [];
  const holder = t.holder;
  const capped = capPerDay(cards, (i) => i.date, paramOf(ROUNDS, 'maxPerDay', 'golf') ?? CAPS.golfCardsPerDay);

  // Rondas jugadas: 18 hoyos = 1, 9 hoyos = 0,5; una tarjeta por día.
  let total = 0;
  const rounds = capped.map((i) => ({ i, n: (total += i.nine ? 0.5 : 1) }));
  const roundHits = milestones(ROUNDS, rounds, (r) => r.n, { variant: 'golf' });
  out.push(...careerAwards(kit, ROUNDS, holder, 'golf', roundHits, (r, level) => cardProof(kit, r.i, { n: thresholdOf(ROUNDS, level, 'golf')! })));
  out.push(progressFor(kit, ROUNDS, holder, 'golf', total, { gained: roundHits }));

  // Birdies (golpes = par − 1) en tarjetas G1; el primero (bronce) en una G2.
  let count = 0;
  const birdies = capped.map((i) => {
    const here = birdiesOf(i);
    return { i, here, n: (count += here) };
  });
  const birdieHits = milestones(BIRDIES, birdies, (b) => b.n, { variant: 'golf', ok: (b, l) => !l.strict || (b.i.g2 && b.here > 0) });
  out.push(...careerAwards(kit, BIRDIES, holder, 'golf', birdieHits, (b, level) => cardProof(kit, b.i, { n: thresholdOf(BIRDIES, level, 'golf')! })));
  const g2Birdie = birdies.some((b) => b.i.g2 && b.here > 0) ? 1 : 0;
  out.push(progressFor(kit, BIRDIES, holder, 'golf', (l) => (l.strict ? g2Birdie : count), { gained: birdieHits }));

  // Rompiste la barrera: ronda G2 sin levantar la bola, bruto por debajo del umbral (de 18 o de 9 hoyos).
  const whole = cards.filter((i) => i.g2 && i.gross != null);
  const variantOf = (i: CardInfo) => (i.nine ? 'golf9' : 'golf');
  const barrierHits = milestones(BARRIER, whole, (i) => i.gross, { variant: variantOf });
  out.push(
    ...careerAwards(kit, BARRIER, holder, 'golf', barrierHits, (i, level) =>
      cardProof(kit, i, { n: thresholdOf(BARRIER, level, variantOf(i))!, hoyos: i.holes.length, gross: i.gross }),
    ),
  );
  const best18 = lowest(whole.filter((i) => !i.nine).map((i) => i.gross!));
  const best9 = lowest(whole.filter((i) => i.nine).map((i) => i.gross!));
  if (best18 != null || best9 != null) {
    out.push(progressFor(kit, BARRIER, holder, 'golf', (best18 ?? best9)!, { variant: best18 != null ? 'golf' : 'golf9', gained: barrierHits }));
  }

  // Stableford neto con el hándicap de juego del índice topado, en tarjetas G2.
  const points = cards
    .filter((i) => i.g2)
    .map((i) => ({ i, points: scoreRound(scoreInput(i, cappedHcp(kit, i)), { format: 'stableford', basis: 'net' }).points }));
  const stableHits = milestones(STABLEFORD, points, (p) => p.points, { variant: (p) => variantOf(p.i) });
  out.push(...careerAwards(kit, STABLEFORD, holder, 'golf', stableHits, (p) => cardProof(kit, p.i, { n: p.points, hoyos: p.i.holes.length })));
  const pts18 = highest(points.filter((p) => !p.i.nine).map((p) => p.points));
  const pts9 = highest(points.filter((p) => p.i.nine).map((p) => p.points));
  if (pts18 != null || pts9 != null) {
    out.push(progressFor(kit, STABLEFORD, holder, 'golf', (pts18 ?? pts9)!, { variant: pts18 != null ? 'golf' : 'golf9', gained: stableHits }));
  }

  // Colección de birdies: birdie o mejor en un par 3, un par 4 y un par 5 (tarjetas G1).
  const firstOn = (par: number) => cards.find((i) => played(i).some((x) => x.hole.par === par && x.strokes <= par - 1));
  const three = [3, 4, 5].map(firstOn);
  if (three.every((i) => !!i)) {
    const [a, b, c] = three as CardInfo[];
    out.push(...careerAwards(kit, COLLECTION, holder, 'golf', [{ level: 0 as Level, item: a }], () => cardProof(kit, a, {}, [b, c])));
  }
  return out;
}

export const golfCareer: Evaluator = (job, snap, now) => {
  const kit = kitOf(job, snap, now);
  const out: BadgeDecision[] = [];
  for (const t of targetAccounts(kit, 'golf')) {
    const produced = golfCareerFor(kit, t, accountCards(kit, t));
    out.push(...produced, ...staleRevokes(kit, produced, { holders: [t.holder], keys: CAREER_KEYS, sport: 'golf', period: always }));
  }
  return out;
};

/**
 * Subiendo (golf): diferencial medio de las primeras 5 tarjetas G2 de 18 hoyos menos el de las últimas 5, con 10 o
 * más. Se mide después de cada tarjeta y un nivel alcanzado se queda.
 */
export const golfClimbing: Evaluator = (job, snap, now) => {
  const kit = kitOf(job, snap, now);
  const window = paramOf(CLIMBING, 'window', 'golf') ?? 5;
  const min = Math.max(paramOf(CLIMBING, 'minCount', 'golf') ?? 10, window * 2);
  const out: BadgeDecision[] = [];
  for (const t of targetAccounts(kit, 'golf')) {
    const cards = accountCards(kit, t).filter((i) => i.g2 && !i.nine && i.diff != null);
    const steps: { i: CardInfo; gain: number }[] = [];
    if (cards.length >= min) {
      const first = cards.slice(0, window).reduce((n, i) => n + i.diff!, 0) / window;
      for (let k = min; k <= cards.length; k++) {
        const last = cards.slice(k - window, k).reduce((n, i) => n + i.diff!, 0) / window;
        steps.push({ i: cards[k - 1], gain: round1(first - last) });
      }
    }
    const hits = milestones(CLIMBING, steps, (s) => s.gain, { variant: 'golf' });
    const produced: BadgeDecision[] = careerAwards(kit, CLIMBING, t.holder, 'golf', hits, (s) => cardProof(kit, s.i, { n: s.gain }));
    produced.push(progressFor(kit, CLIMBING, t.holder, 'golf', Math.max(0, ...steps.map((s) => s.gain)), { gained: hits }));
    out.push(...produced, ...staleRevokes(kit, produced, { holders: [t.holder], keys: [CLIMBING.key], sport: 'golf', period: always }));
  }
  return out;
};

// ---------------------------------------------------------------------------------------------------------
// Marcas de una tarjeta (liga)

/** Las marcas de una tarjeta que van al jugador en su liga (periodo `c:<card>`). */
export function cardDecisions(kit: Kit, i: CardInfo): BadgeDecision[] {
  if (!i.g1 || !realOn(kit, i.card.league_id, i.date)) return [];
  const out: BadgeDecision[] = [];
  const holder = playerHolderOf(i.card.player_id, i.card.league_id);
  const period = periodKey.card(i.card.id);
  const status = statusFor(kit, i.date);
  const refs = [cardRef(i)];
  const context = { ...leagueCtx(kit, i.card.league_id), ...eventCtx(kit, i.card.event_id) };
  const campo = i.round.course.name;
  const holes = played(i);
  const full = !i.nine && i.gross != null;
  const cards = (kit.snap.golf_cards ?? []).filter((c) => c.event_id === i.card.event_id);
  // Quien avala no puede ser el jugador ni nadie que jugó esa ronda (su grupo incluido).
  const reviewers = () => reviewersFor(kit, i.card.league_id, cards.map((c) => kit.userOf(c.player_id)));
  const markers = () => markersOf(i.card, cards, i.round, kit.userOf);

  if (i.g2) {
    // Águila: 2 bajo par con 2+ golpes. El albatros (3 bajo par) pide aval; si hay un águila normal, va esa.
    const eagles = holes.filter((x) => x.strokes >= 2 && x.strokes <= x.hole.par - 2);
    const plain = eagles.filter((x) => x.strokes === x.hole.par - 2);
    if (plain.length) out.push(awardOf(EAGLE, holder, 'golf', 0, period, status, refs, { ...context, values: { hoyo: plain[0].hole.number, n: plain.length, campo } }));
    else if (eagles.length) {
      out.push(reviewOf(EAGLE, holder, 'golf', 0, period, refs, { ...context, alt: 'albatross', values: { hoyo: eagles[0].hole.number, campo }, markers: markers() }, reviewers()));
    }
    const aces = holes.filter((x) => x.strokes === 1);
    if (aces.length) out.push(reviewOf(HOLE_IN_ONE, holder, 'golf', 0, period, refs, { ...context, values: { hoyo: aces[0].hole.number, campo }, markers: markers() }, reviewers()));
    const par = i.holes.reduce((n, h) => n + h.par, 0);
    if (full && i.gross! <= par) out.push(reviewOf(PAR_ROUND, holder, 'golf', 0, period, refs, { ...context, values: { n: i.gross, par, campo }, markers: markers() }, reviewers()));
    if (full && holes.every((x) => x.strokes <= x.hole.par + 2)) out.push(awardOf(NO_DISASTER, holder, 'golf', 0, period, status, refs, { ...context, values: { n: i.gross, campo } }));
  }

  // Récord personal en el campo: mismo campo, salida y vuelta, con 2+ rondas G1 anteriores ahí.
  if (i.gross != null && i.round.course_id) {
    const all = cardInfos(kit);
    const at = all.indexOf(i);
    const prior = all
      .slice(0, at)
      .filter((x) => x.g1 && x.card.player_id === i.card.player_id && x.round.course_id === i.round.course_id && x.card.tee_id === i.card.tee_id && x.round.nine === i.round.nine && x.date < i.date);
    const before = lowest(prior.filter((x) => x.gross != null).map((x) => x.gross!));
    if (prior.length >= (paramOf(COURSE_BEST, 'minPriorRounds', 'golf') ?? 2) && before != null && i.gross < before) {
      out.push(awardOf(COURSE_BEST, holder, 'golf', 0, period, status, refs, { ...context, values: { n: i.gross, gain: before - i.gross, campo } }));
    }
  }
  return out;
}

export const golfCard: Evaluator = (job, snap, now) => {
  const kit = kitOf(job, snap, now);
  const historial = job.kind === 'historial';
  const targets = new Set(targetPlayers(kit, 'golf').map((p) => p.id));
  const refCards = new Set(refIds(job, 'card'));
  const events = jobEvents(kit);
  const out: BadgeDecision[] = [];
  const scopes: Parameters<typeof staleRevokes>[2][] = [];
  const seen = new Set<string>();
  for (const i of cardInfos(kit)) {
    const c = i.card;
    if (!targets.has(c.player_id) || !(historial || refCards.has(c.id) || events.has(c.event_id))) continue;
    seen.add(c.id);
    out.push(...cardDecisions(kit, i));
    scopes.push({ holders: [playerHolderOf(c.player_id, c.league_id)], keys: CARD_KEYS, sport: 'golf', period: (p) => p === periodKey.card(c.id) });
  }
  // Una tarjeta que ya no está (o ya no tiene ronda): lo suyo que seguía provisional se retira.
  for (const id of refCards) if (!seen.has(id)) scopes.push({ keys: CARD_KEYS, sport: 'golf', period: (p) => p === periodKey.card(id) });
  if (historial) for (const p of targets) scopes.push({ holders: [playerHolderOf(p, kit.players.get(p)!.league_id)], keys: CARD_KEYS, sport: 'golf', period: (k) => k.startsWith('c:') });
  for (const s of scopes) out.push(...staleRevokes(kit, out, s));
  return out;
};

// ---------------------------------------------------------------------------------------------------------
// Podio de una ronda o de un torneo (liga)

/**
 * Podio de golf (§2.1): ronda cerrada (periodo `e:<event>`) o torneo con todas sus rondas cerradas (`gt:<id>`), en
 * una liga `kind='liga'`. `golfLeaderboard` con el formato de la competición y desempate por countback, sobre
 * tarjetas G1 de 4+ cuentas distintas (en un torneo, de quienes jugaron todas las rondas). Lo neto usa el índice
 * topado. Tamaño del podio por §1.7.8; un puesto que comparten más de 3 no da nada.
 */
export function golfPodiumFor(kit: Kit, rounds: readonly SnapGolfRound[], period: string): BadgeDecision[] {
  const league = kit.leagues.get(rounds[0]?.league_id ?? '');
  if (!league || league.kind !== 'liga' || !rounds.every((r) => r.status === 'cerrada')) return [];
  const dates = rounds.map((r) => kit.events.get(r.event_id)?.date).filter((d): d is string => !!d);
  if (dates.length !== rounds.length) return [];
  const last = rounds[rounds.length - 1];
  if (!realOn(kit, league.id, dates.reduce((a, b) => (a > b ? a : b)))) return [];
  const byRound = rounds.map((r) => new Map(cardInfos(kit).filter((i) => i.card.event_id === r.event_id && i.g1).map((i) => [i.card.player_id, i])));
  const players = [...byRound[0].keys()].filter((p) => byRound.every((m) => m.has(p)));
  const accounts = new Set(players.map(kit.userOf).filter((u): u is string => !!u));
  if (accounts.size < (paramOf(PODIUM, 'minAccounts', 'golf') ?? 4)) return [];
  const comp = rounds[0].competition;
  const net = comp.basis === 'net';
  const field: GolfPlayerRounds[] = players.map((p) => ({
    id: p,
    rounds: byRound.map((m) => {
      const i = m.get(p)!;
      return scoreInput(i, net ? cappedHcp(kit, i) : i.card.playing_hcp);
    }),
  }));
  const ranked = golfLeaderboard(field, comp, { rounds: rounds.length }).filter((r) => r.rank != null);
  const levels = podiumLevels(ranked.length);
  const out: BadgeDecision[] = [];
  for (const place of [1, 2, 3]) {
    const at = ranked.filter((r) => r.rank === place);
    const level = placeLevel(place);
    if (!at.length || at.length > MAX_SHARED || level == null || !levels.includes(level as 1 | 2 | 3)) continue;
    for (const row of at) {
      out.push(
        awardOf(PODIUM, playerHolderOf(row.id, league.id), 'golf', level, period, 'firme', byRound.map((m) => cardRef(m.get(row.id)!)), {
          ...leagueCtx(kit, league.id),
          ...eventCtx(kit, last.event_id),
          values: { n: place, of: ranked.length, value: row.value },
        }),
      );
    }
  }
  return out;
}

/**
 * Rondas o torneos del trabajo; en el historial de una liga, todos los suyos que ya pasaron su gracia (24 h desde el
 * cierre). El historial de una cuenta (sin liga) no da podios: su foto no trae la historia de los demás (su índice
 * topado) y el de la liga ya los da.
 */
function scopedCompetitions(kit: Kit): { rounds: SnapGolfRound[]; period: string }[] {
  const all = kit.snap.golf_rounds ?? [];
  const graceMs = (paramOf(PODIUM, 'graceHours', 'golf') ?? 24) * 3_600_000;
  const historial = kit.job.kind === 'historial';
  const refs = jobEvents(kit);
  const tournaments = new Set(refIds(kit.job, 'gt'));
  const singles: SnapGolfRound[] = [];
  for (const r of all) {
    const pick = historial ? !!kit.job.league_id && r.league_id === kit.job.league_id : refs.has(r.event_id);
    if (!pick) continue;
    if (r.tournament_id) tournaments.add(r.tournament_id);
    else singles.push(r);
  }
  const out = singles.map((r) => ({ rounds: [r], period: periodKey.event(r.event_id) }));
  for (const t of tournaments) {
    const rounds = all.filter((r) => r.tournament_id === t).sort((a, b) => (a.round_no ?? 0) - (b.round_no ?? 0));
    if (rounds.length) out.push({ rounds, period: periodKey.golfTournament(t) });
  }
  // Solo lo cerrado y, en el historial, con la gracia cumplida.
  return out.filter(({ rounds }) => {
    if (!rounds.every((r) => r.status === 'cerrada')) return false;
    if (!historial) return true;
    const closed = Math.max(...rounds.map((r) => Date.parse(r.closed_at ?? '') || Infinity));
    return closed + graceMs <= kit.now;
  });
}

export const golfPodium: Evaluator = (job, snap, now) => {
  const kit = kitOf(job, snap, now);
  const out: BadgeDecision[] = [];
  for (const { rounds, period } of scopedCompetitions(kit)) {
    const produced = golfPodiumFor(kit, rounds, period);
    out.push(...produced, ...staleRevokes(kit, produced, { keys: [PODIUM.key], sport: 'golf', period: (p) => p === period }));
  }
  return out;
};

export const GOLF_EVALUATORS: EvaluatorSet = {
  debut: golfDebut,
  climbing: golfClimbing,
  event_podium: golfPodium,
  golf_career: golfCareer,
  golf_card: golfCard,
};
