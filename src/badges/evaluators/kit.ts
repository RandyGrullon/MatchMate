/**
 * Lo que comparten los evaluadores (docs/insignias.md §3.1): índices de la foto, la cuenta de cada jugador, el
 * staff de cada liga, la liga real con memo, la actividad válida de todos los deportes, a quién va cada insignia
 * (la cuenta o el jugador sin cuenta, §1.6), el estado con que se da (§3.4) y cómo se arman las decisiones: dar,
 * progreso y retirar las provisionales que ya no cumplen. Todo puro: la foto entra, las decisiones salen.
 */
import { appMatches, bowlingActivity, bowlingGames, dateOfMatch, golfActivity, isJudge, racketActivity, swimActivity, swimContext, teamActivity } from '../rules';
import type { BowlingGame } from '../rules/bowling';
import { daysBetween, localDate, monthOf, BADGE_TZ, todayIn } from '../rules/periods';
import { dedupeActivity, leagueMonths } from '../rules/activity';
import { isRealLeagueMonth } from '../rules/gates';
import { nextLevel, thresholdOf, type VariantArg } from '../catalog';
import type { Match } from '../../lib/data/matchCore';
import type { RacketSport } from '../../sports/racket';
import { SPORT_FAMILY, type SportId } from '../../sports/types';
import type {
  ActivityDay,
  BadgeSnapshot,
  LeagueMonthActivity,
  SnapEvent,
  SnapLeague,
  SnapMember,
  SnapPlayer,
  SnapProfile,
  SnapTeam,
} from '../snapshot';
import type {
  AwardDecision,
  BadgeAwardRow,
  BadgeContext,
  BadgeDecision,
  BadgeDef,
  BadgeHolder,
  BadgeJob,
  BadgeSport,
  Level,
  ProgressDecision,
  RevokeDecision,
  Variant,
} from '../types';

/** Un evaluador: mismo contrato que `evaluate` (engine.ts), sin E/S. */
export type Evaluator = (job: BadgeJob, snap: BadgeSnapshot, now: number) => BadgeDecision[];

export type TeamSportId = 'basketball' | 'football' | 'futsal';
export const RACKET_SPORTS: readonly RacketSport[] = ['padel', 'tennis', 'pickleball'];
export const TEAM_SPORTS: readonly TeamSportId[] = ['basketball', 'football', 'futsal'];
export const isRacketSport = (s: SportId | null | undefined): s is RacketSport => !!s && SPORT_FAMILY[s] === 'racket';
export const isTeamSport = (s: SportId | null | undefined): s is TeamSportId => s === 'basketball' || s === 'football' || s === 'futsal';

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

// ---------------------------------------------------------------------------------------------------------
// La foto con índices

export interface Kit {
  job: BadgeJob;
  snap: BadgeSnapshot;
  now: number;
  /** Hoy en Santo Domingo ('YYYY-MM-DD'). */
  today: string;
  leagues: ReadonlyMap<string, SnapLeague>;
  players: ReadonlyMap<string, SnapPlayer>;
  profiles: ReadonlyMap<string, SnapProfile>;
  events: ReadonlyMap<string, SnapEvent>;
  teams: ReadonlyMap<string, SnapTeam>;
  /** Todos los partidos de la foto como `Match` de la app. */
  matches: readonly Match[];
  userOf: (playerId: string) => string | null;
  sportOf: (leagueId: string) => SportId | null;
  tzOf: (leagueId: string) => string;
  /** Owner y admins de la liga (los miembros con ese rol, más `leagues.owner_id`). */
  staff: (leagueId: string) => ReadonlySet<string>;
  members: (leagueId: string) => readonly SnapMember[];
  /** Plantilla de una pareja o equipo de temporada. */
  rosterOf: (teamId: string) => readonly string[];
  /** ¿Liga real ese mes? `exclude` = la cuenta que se evalúa en las de cuenta (no cuenta entre las 4). */
  isReal: (leagueId: string, month: string, exclude?: string | null) => boolean;
  /** Actividad válida de todo lo que trae la foto (más la que manda SQL ya resuelta), sin repetir. */
  activity: () => readonly ActivityDay[];
  /** Quién tuvo actividad en cada (liga, mes): lo que manda SQL más lo que sale de la foto (base de la liga real). */
  leagueMonths: () => readonly LeagueMonthActivity[];
  /** Juegos B1 de boliche de la foto (con juez y parte). */
  bowling: () => readonly BowlingGame[];
  /** Filas ya otorgadas de un dueño (y key, y deporte si se pide). */
  existing: (holder: BadgeHolder, key?: string, sport?: BadgeSport) => BadgeAwardRow[];
  /** Solo cuenta el historial verificado de ese jugador (reclamo que se aprobó a sí mismo, §1.6). */
  verifiedOnly: (playerId: string) => boolean;
}

const cache = new WeakMap<BadgeSnapshot, Map<string, Kit>>();

/** El kit de una foto (se arma una vez por foto, trabajo y hora). */
export function kitOf(job: BadgeJob, snap: BadgeSnapshot, now: number): Kit {
  let byKey = cache.get(snap);
  if (!byKey) {
    byKey = new Map();
    cache.set(snap, byKey);
  }
  const k = `${job.id}|${now}`;
  let kit = byKey.get(k);
  if (!kit) {
    kit = buildKit(job, snap, now);
    byKey.set(k, kit);
  }
  return kit;
}

function buildKit(job: BadgeJob, snap: BadgeSnapshot, now: number): Kit {
  const leagues = new Map((snap.leagues ?? []).map((l) => [l.id, l]));
  const players = new Map((snap.players ?? []).map((p) => [p.id, p]));
  const profiles = new Map((snap.profiles ?? []).map((p) => [p.id, p]));
  const events = new Map((snap.events ?? []).map((e) => [e.id, e]));
  const teams = new Map((snap.teams ?? []).map((t) => [t.id, t]));
  const userOf = (p: string) => players.get(p)?.user_id ?? null;
  const sportOf = (l: string) => leagues.get(l)?.sport ?? null;
  const tzOf = (l: string) => leagues.get(l)?.tz || BADGE_TZ;

  const membersBy = new Map<string, SnapMember[]>();
  for (const m of snap.members ?? []) {
    const list = membersBy.get(m.league_id) ?? [];
    list.push(m);
    membersBy.set(m.league_id, list);
  }
  const staffMemo = new Map<string, Set<string>>();
  const staff = (l: string) => {
    let s = staffMemo.get(l);
    if (!s) {
      s = new Set((membersBy.get(l) ?? []).filter((m) => m.role === 'owner' || m.role === 'admin').map((m) => m.user_id));
      const owner = leagues.get(l)?.owner_id;
      if (owner) s.add(owner);
      staffMemo.set(l, s);
    }
    return s;
  };

  const rosterBy = new Map<string, string[]>();
  for (const tp of snap.team_players ?? []) {
    const list = rosterBy.get(tp.team_id) ?? [];
    if (!list.includes(tp.player_id)) list.push(tp.player_id);
    rosterBy.set(tp.team_id, list);
  }
  const rosterOf = (t: string) => rosterBy.get(t) ?? [];

  const matches = appMatches(snap.matches ?? [], snap.match_sides ?? [], snap.match_players ?? []);

  let bowlingMemo: BowlingGame[] | null = null;
  const bowling = () => {
    if (!bowlingMemo) {
      bowlingMemo = bowlingGames({
        entries: snap.entries ?? [],
        events: snap.events ?? [],
        userOf,
        submissions: snap.submissions ?? [],
        judge: (entry) => {
          const u = userOf(entry.player_id);
          return !!u && isJudge((membersBy.get(entry.league_id) ?? []).find((m) => m.user_id === u));
        },
      });
    }
    return bowlingMemo;
  };

  let actMemo: ActivityDay[] | null = null;
  const activity = () => {
    if (actMemo) return actMemo;
    const acts: ActivityDay[] = [...(snap.activity ?? [])];
    const byLeague = new Map<string, Match[]>();
    for (const m of matches) {
      const list = byLeague.get(m.leagueId) ?? [];
      list.push(m);
      byLeague.set(m.leagueId, list);
    }
    for (const [leagueId, list] of byLeague) {
      const sport = sportOf(leagueId);
      if (isRacketSport(sport)) {
        acts.push(...racketActivity(list, { now, userOf, rosterOf, sport, tz: tzOf(leagueId), eventType: (e) => events.get(e)?.type ?? null }));
      } else if (isTeamSport(sport)) {
        acts.push(...teamActivity(list, { now, userOf, teamPlayers: snap.team_players ?? [], sport, tz: tzOf(leagueId) }));
      }
    }
    acts.push(...bowlingActivity(bowling(), userOf));
    const dateOf = (e: string) => events.get(e)?.date ?? null;
    acts.push(...golfActivity(snap.golf_cards ?? [], snap.golf_rounds ?? [], { userOf, dateOf }));
    const sctx = swimContext(snap.swim_events ?? [], snap.swim_meets ?? [], userOf);
    acts.push(...swimActivity(snap.swim_entries ?? [], { ...sctx, dateOf, typeOf: (e) => events.get(e)?.type ?? null }));
    actMemo = dedupeActivity(acts).map((a) => ({ ...a, user_id: a.user_id ?? userOf(a.player_id) }));
    return actMemo;
  };

  let monthsMemo: LeagueMonthActivity[] | null = null;
  const months = () => {
    if (monthsMemo) return monthsMemo;
    const map = new Map<string, { league_id: string; month: string; users: Set<string>; players: Set<string> }>();
    for (const r of [...(snap.league_months ?? []), ...leagueMonths(activity())]) {
      const k = `${r.league_id}|${r.month}`;
      const row = map.get(k) ?? { league_id: r.league_id, month: r.month, users: new Set<string>(), players: new Set<string>() };
      r.users.forEach((u) => row.users.add(u));
      r.players.forEach((p) => row.players.add(p));
      map.set(k, row);
    }
    monthsMemo = [...map.values()].map((r) => ({ league_id: r.league_id, month: r.month, users: [...r.users], players: [...r.players] }));
    return monthsMemo;
  };
  const realMemo = new Map<string, boolean>();
  const isReal = (leagueId: string, month: string, exclude?: string | null) => {
    const k = `${leagueId}|${month}|${exclude ?? ''}`;
    let v = realMemo.get(k);
    if (v === undefined) {
      const league = leagues.get(leagueId);
      v = !!league && isRealLeagueMonth({ league, months: months(), profiles, members: snap.members ?? [], exclude }, month);
      realMemo.set(k, v);
    }
    return v;
  };

  const existing = (holder: BadgeHolder, key?: string, sport?: BadgeSport) => {
    const h = holderKey(holder);
    return (snap.awards ?? []).filter((a) => (a.player_id ?? a.user_id) === h && (!key || a.badge_key === key) && (!sport || a.sport === sport));
  };

  const payloadVerified = job.kind === 'vinculo' && job.payload?.verified_only === true ? new Set(payloadPlayers(job)) : new Set<string>();
  const verifiedOnly = (p: string) => players.get(p)?.verified_only === true || payloadVerified.has(p);

  return {
    job,
    snap,
    now,
    today: todayIn(now),
    leagues,
    players,
    profiles,
    events,
    teams,
    matches,
    userOf,
    sportOf,
    tzOf,
    staff,
    members: (l) => membersBy.get(l) ?? [],
    rosterOf,
    isReal,
    activity,
    leagueMonths: months,
    bowling,
    existing,
    verifiedOnly,
  };
}

// ---------------------------------------------------------------------------------------------------------
// El trabajo

/** El id después de un prefijo de `job.ref` ('match:<id>' → '<id>'); null si el ref es de otra cosa. */
export function refId(ref: string, prefix: string): string | null {
  return ref.startsWith(`${prefix}:`) ? ref.slice(prefix.length + 1) : null;
}

/** Jugadores que manda el trabajo en `payload.players` (un borrado, un vínculo). */
export function payloadPlayers(job: BadgeJob): string[] {
  const p = job.payload?.players;
  return Array.isArray(p) ? p.filter((x): x is string => typeof x === 'string' && !!x) : [];
}

/** Mes 'YYYY-MM' o año 'YYYY' del trabajo, si su ref lo es. */
export const jobMonth = (job: BadgeJob): string | null => (/^\d{4}-\d{2}$/.test(job.ref) ? job.ref : null);
export const jobYear = (job: BadgeJob): number | null => (/^\d{4}$/.test(job.ref) ? Number(job.ref) : null);

/** Días desde una fecha hasta hoy (para las evidencias del historial). */
export const ageDays = (kit: Kit, date: string): number => daysBetween(date, kit.today);

/**
 * Estado con que se da una insignia (§3.4): las de resultado nacen provisionales; las de periodo, de cuenta que se
 * acumulan y de eventos cerrados, firmes. En la primera corrida (historial), firme si la evidencia tiene 7+ días.
 */
export function statusFor(kit: Kit, evidenceDate?: string | null): 'provisional' | 'firme' {
  const k = kit.job.kind;
  if (k === 'resultado' || k === 'revisar' || k === 'vinculo') return 'provisional';
  if (k === 'historial') return evidenceDate && ageDays(kit, evidenceDate) >= 7 ? 'firme' : 'provisional';
  return 'firme';
}

// ---------------------------------------------------------------------------------------------------------
// A quién va (§1.6)

export const holderKey = (h: BadgeHolder): string => (h.player_id ?? h.user_id)!;
export const userHolderOf = (u: string): BadgeHolder => ({ player_id: null, user_id: u, league_id: null });
export const playerHolderOf = (p: string, league: string): BadgeHolder => ({ player_id: p, user_id: null, league_id: league });

/** Dueño de una insignia de cuenta y los jugadores cuyos datos suman. */
export interface AccountTarget {
  holder: BadgeHolder;
  /** La cuenta (null = jugador sin cuenta: solo lo de su liga). */
  user: string | null;
  /** Jugadores que suman (de la cuenta, en los deportes pedidos; o el jugador solo). */
  players: string[];
}

/**
 * A quién va una insignia de cuenta de un jugador: su cuenta (sumando todos sus jugadores de esos deportes, en
 * todas sus ligas), o el jugador en su liga si no tiene cuenta. null si el jugador no está en la foto.
 */
export function accountTarget(kit: Kit, playerId: string, sports?: readonly SportId[]): AccountTarget | null {
  const p = kit.players.get(playerId);
  if (!p) return null;
  if (!p.user_id) return { holder: playerHolderOf(p.id, p.league_id), user: null, players: [p.id] };
  return { holder: userHolderOf(p.user_id), user: p.user_id, players: accountPlayers(kit, p.user_id, sports) };
}

/** Los jugadores de una cuenta (en ligas de esos deportes, si se piden). */
export function accountPlayers(kit: Kit, userId: string, sports?: readonly SportId[]): string[] {
  const out: string[] = [];
  for (const p of kit.players.values()) {
    if (p.user_id !== userId) continue;
    const s = kit.sportOf(p.league_id);
    if (!sports || (s && sports.includes(s))) out.push(p.id);
  }
  return out;
}

/** Los dueños de cuenta distintos de unos jugadores. */
export function accountTargets(kit: Kit, playerIds: Iterable<string>, sports?: readonly SportId[]): AccountTarget[] {
  const seen = new Map<string, AccountTarget>();
  for (const p of playerIds) {
    const t = accountTarget(kit, p, sports);
    if (t && !seen.has(holderKey(t.holder))) seen.set(holderKey(t.holder), t);
  }
  return [...seen.values()];
}

/** La cuenta que se excluye de las 4 de la liga real (la del dueño, si es una cuenta). */
export const excludeOf = (t: Pick<AccountTarget, 'user'>): string | null => t.user;

/** ¿La fecha cae en un mes de liga real para ese dueño? */
export const realOn = (kit: Kit, leagueId: string, date: string, t?: Pick<AccountTarget, 'user'>): boolean =>
  kit.isReal(leagueId, monthOf(date), t ? excludeOf(t) : null);

/** Fecha local de un partido en la zona de su liga. */
export const matchDay = (kit: Kit, m: Match): string | null => dateOfMatch(m, kit.tzOf(m.leagueId));

/** Liga del evento o del partido para `context` (el nombre se copia porque puede cambiar). */
export function leagueCtx(kit: Kit, leagueId: string | null | undefined): Pick<BadgeContext, 'league'> {
  const l = leagueId ? kit.leagues.get(leagueId) : undefined;
  return l ? { league: { id: l.id, name: l.name } } : {};
}

export function eventCtx(kit: Kit, eventId: string | null | undefined): Pick<BadgeContext, 'event'> {
  const e = eventId ? kit.events.get(eventId) : undefined;
  return e ? { event: { id: e.id, name: e.name } } : {};
}

export function teamCtx(kit: Kit, teamId: string | null | undefined): Pick<BadgeContext, 'team'> {
  const t = teamId ? kit.teams.get(teamId) : undefined;
  return t ? { team: { id: t.id, name: t.name } } : teamId ? { team: { id: teamId, name: '' } } : {};
}

// ---------------------------------------------------------------------------------------------------------
// Decisiones

export function awardOf(
  def: BadgeDef,
  holder: BadgeHolder,
  sport: BadgeSport,
  level: Level,
  periodKey: string,
  status: 'provisional' | 'firme',
  refs: readonly string[],
  context: Omit<BadgeContext, 'v'> = {},
): AwardDecision {
  const out: AwardDecision = {
    kind: 'award',
    ...holder,
    badge_key: def.key,
    sport,
    level,
    period_key: periodKey,
    status,
    refs: [...new Set(refs)].slice(0, 20),
    context: { v: 1, ...context },
  };
  if (def.privateByDefault) out.hidden = true;
  return out;
}

/** Un paso de un contador: el valor después de este partido, juego o día, con su evidencia. */
export interface Step {
  n: number;
  ref: string;
  date: string;
  /** Valores extra para la evidencia. */
  values?: Record<string, number | string | boolean | null>;
}

export interface LevelOptions {
  /** `{n}` del texto: el umbral del nivel (contadores) o el valor real de ese paso (marcas de un partido). */
  actual?: boolean;
  /** Requisito extra del nivel (`LevelDef.req`) que se revisa en el paso. */
  req?: (level: Level, step: Step, req: Readonly<Record<string, number>>) => boolean;
  context?: Omit<BadgeContext, 'v' | 'values'>;
  /** Variante por paso (3x3 en baloncesto); si no, `variant`. */
  variantOf?: (step: Step) => VariantArg;
}

/**
 * Niveles de una insignia de carrera (`gte`) a partir de sus pasos en orden: cada nivel sale del primer paso que
 * llega a su umbral (y cumple su requisito). Periodo '-' (una fila por nivel).
 */
export function levelAwards(kit: Kit, def: BadgeDef, holder: BadgeHolder, sport: BadgeSport, variant: VariantArg, steps: readonly Step[], opts: LevelOptions = {}): AwardDecision[] {
  const out: AwardDecision[] = [];
  for (const l of def.levels) {
    const step = steps.find((s) => {
      const t = thresholdOf(def, l.level, opts.variantOf?.(s) ?? variant);
      if (t === undefined || s.n < t) return false;
      return !l.req || !opts.req || opts.req(l.level, s, l.req);
    });
    if (!step) continue;
    const t = thresholdOf(def, l.level, opts.variantOf?.(step) ?? variant)!;
    out.push(
      awardOf(def, holder, sport, l.level, '-', statusFor(kit, step.date), [step.ref], {
        ...opts.context,
        values: { n: opts.actual ? step.n : t, ...step.values },
      }),
    );
  }
  return out;
}

/** Progreso hacia el siguiente nivel (null en `next_level` borra la fila: ya tiene el más alto). */
export function progressOf(def: BadgeDef, holder: BadgeHolder, sport: BadgeSport, variant: VariantArg, value: number): ProgressDecision {
  const next = nextLevel(def, value, variant);
  return { kind: 'progress', ...holder, badge_key: def.key, sport, value, target: next?.target ?? value, next_level: next?.level ?? null };
}

/** Variantes de una fila de baloncesto 3x3. */
export const V3X3: readonly Variant[] = ['basketball3x3', 'basketball'];

/**
 * Retira (`evidencia`) las provisionales o en revisión de ese alcance que esta corrida ya no da: al revisar un
 * resultado, una insignia que dependía de él y ya no cumple se va sola. Las firmes no se tocan (§3.4).
 */
export function revokeStale(
  kit: Kit,
  produced: readonly BadgeDecision[],
  scope: { holders: readonly BadgeHolder[]; keys: readonly string[]; sport?: BadgeSport; period?: (periodKey: string) => boolean },
): RevokeDecision[] {
  const given = new Set(
    produced.filter((d): d is AwardDecision => d.kind === 'award').map((d) => `${holderKey(d)}|${d.badge_key}|${d.sport}|${d.level}|${d.period_key}`),
  );
  const holders = new Set(scope.holders.map(holderKey));
  const keys = new Set(scope.keys);
  const out: RevokeDecision[] = [];
  for (const a of kit.snap.awards ?? []) {
    const h = a.player_id ?? a.user_id;
    if (!h || !holders.has(h) || !keys.has(a.badge_key) || (scope.sport && a.sport !== scope.sport)) continue;
    if (a.status !== 'provisional' && a.status !== 'en_revision') continue;
    if (scope.period && !scope.period(a.period_key)) continue;
    if (given.has(`${h}|${a.badge_key}|${a.sport}|${a.level}|${a.period_key}`)) continue;
    out.push({ kind: 'revoke', player_id: a.player_id, user_id: a.user_id, league_id: a.league_id, badge_key: a.badge_key, sport: a.sport, level: a.level, period_key: a.period_key, reason: 'evidencia' });
  }
  return out;
}

/**
 * Dueños que ya tienen filas de un periodo (p. ej. las marcas de un partido): al revisarlo también se revisan los
 * que ya no salen en él (un jugador que se quitó de la alineación).
 */
export function periodHolders(kit: Kit, periodKey: string): BadgeHolder[] {
  return (kit.snap.awards ?? []).filter((a) => a.period_key === periodKey).map((a) => ({ player_id: a.player_id, user_id: a.user_id, league_id: a.league_id }));
}

// ---------------------------------------------------------------------------------------------------------
// Pequeñas ayudas

/** Reglas de la liga o del partido como objeto (`rules.match`, `rules.table`…). */
export function rulesPart(rules: unknown, part: string): Record<string, unknown> {
  return isObj(rules) && isObj(rules[part]) ? (rules[part] as Record<string, unknown>) : {};
}

export const round1 = (x: number): number => Math.round(x * 10) / 10;
export const mean = (xs: readonly number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Agrupa una lista por una clave, conservando el orden. */
export function groupBy<T>(list: readonly T[], key: (t: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const x of list) {
    const k = key(x);
    const arr = out.get(k);
    if (arr) arr.push(x);
    else out.set(k, [x]);
  }
  return out;
}

/** Fecha local ('YYYY-MM-DD') de una hora de la base en la zona de una liga. */
export const dayIn = (kit: Kit, iso: string | null | undefined, leagueId: string): string | null => localDate(iso, kit.tzOf(leagueId));
