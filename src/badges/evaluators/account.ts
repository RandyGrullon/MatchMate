/**
 * Insignias de cuenta que se acumulan (docs/insignias.md §2.1 y §2.12): el debut de raqueta y equipos (`debut`, la
 * parte de esos deportes), kilometraje, arranque, multideporte, tres mundos y aniversario (`account_activity`), y
 * la comunidad (`community`: liga en marcha, mesa técnica, buena vibra y raíces BowlingX). Solo cuenta la actividad
 * en ligas reales (sin contar a la propia cuenta entre las 4) y, en las nocturnas, la de hace 48 h o más.
 */
import { badgeDef, paramOf } from '../catalog';
import { activeDays, familiesOf, firstWindowDays, weighDays } from '../rules/activity';
import { isEstablished } from '../rules/gates';
import { addDays, BADGE_TZ, localDate, monthOf, periodKey, settledThrough } from '../rules/periods';
import { sidePlayers } from '../../pages/sports/racket/logic/results';
import { appearances } from '../rules/team';
import { SPORT_FAMILY, type SportId } from '../../sports/types';
import type { ActivityDay } from '../snapshot';
import type { BadgeDecision, BadgeDef } from '../types';
import {
  accountTargets,
  awardOf,
  groupBy,
  isTeamSport,
  kitOf,
  levelAwards,
  matchDay,
  progressOf,
  RACKET_SPORTS,
  realOn,
  revokeStale,
  statusFor,
  TEAM_SPORTS,
  type AccountTarget,
  type Evaluator,
  type Kit,
  type Step,
} from './kit';
import { accountJobTargets, targetActivity } from './month';
import { jobPlayers } from './racket';

const def = (key: string): BadgeDef => badgeDef(key)!;

// ---------------------------------------------------------------------------------------------------------
// Debut (raqueta y equipos; boliche, golf y natación van en su familia)

/** El partido de ese día del jugador (evidencia del debut). */
function matchOn(kit: Kit, a: ActivityDay): string | null {
  const m = kit.matches.find((x) => {
    if (x.leagueId !== a.league_id || matchDay(kit, x) !== a.date) return false;
    const sport = kit.sportOf(x.leagueId);
    if (isTeamSport(sport)) return appearances(x, sport).has(a.player_id) || x.sides.some((s) => s.teamId && kit.rosterOf(s.teamId).includes(a.player_id));
    return x.sides.some((s) => sidePlayers(s, kit.rosterOf).includes(a.player_id));
  });
  return m ? `match:${m.id}` : null;
}

/** Primera actividad válida del deporte en una liga real (la plantilla vale para el debut en equipos). */
export function debutFor(kit: Kit, t: AccountTarget, sport: SportId): BadgeDecision[] {
  const d = def('debut');
  const mine = new Set(t.players);
  const acts = kit
    .activity()
    .filter((a) => a.sport === sport && mine.has(a.player_id) && realOn(kit, a.league_id, a.date, t))
    .sort((a, b) => a.date.localeCompare(b.date));
  const first = acts[0];
  const out: BadgeDecision[] = [];
  if (first) {
    const ref = matchOn(kit, first);
    out.push(awardOf(d, t.holder, sport, 0, periodKey.always, statusFor(kit, first.date), ref ? [ref] : [], { values: { fecha: first.date } }));
  }
  out.push(...revokeStale(kit, out, { holders: [t.holder], keys: ['debut'], sport, period: (k) => k === periodKey.always }));
  return out;
}

/** Evaluador de debut para unos deportes (el trabajo trae los jugadores del partido, del vínculo o de la liga). */
export const debutOf =
  (sports: readonly SportId[]): Evaluator =>
  (job, snap, now) => {
    const kit = kitOf(job, snap, now);
    const players = jobPlayers(kit);
    const out: BadgeDecision[] = [];
    for (const sport of sports) {
      const mine = players.filter((p) => kit.sportOf(kit.players.get(p)?.league_id ?? '') === sport);
      for (const t of accountTargets(kit, mine, [sport])) out.push(...debutFor(kit, t, sport));
    }
    return out;
  };

export const racketDebut = debutOf(RACKET_SPORTS);
export const teamDebut = debutOf(TEAM_SPORTS);

// ---------------------------------------------------------------------------------------------------------
// Actividad de la cuenta: kilometraje, arranque, multideporte, tres mundos y aniversario

export function accountActivityFor(kit: Kit, t: AccountTarget): BadgeDecision[] {
  const out: BadgeDecision[] = [];
  const through = settledThrough(kit.now);
  const acts = targetActivity(kit, t, through);
  const by = t.user ? 'user' : 'player';
  const days = activeDays(acts, by);
  const weighted = weighDays(days);

  // Kilometraje: días ponderados (golf y natación × 2, máximo 4 por semana ISO).
  const mileage = def('mileage');
  let total = 0;
  const steps: Step[] = [];
  for (const d of weighted) {
    if (!d.weight) continue;
    total += d.weight;
    steps.push({ n: total, ref: `day:${d.date}`, date: d.date });
  }
  out.push(...levelAwards(kit, mileage, t.holder, 'all', 'all', steps), progressOf(mileage, t.holder, 'all', 'all', total));

  // Arranque con todo: 4+ días activos en los 30 desde el primer día activo; se revisa hasta el día 31.
  const start = def('strong_start');
  const win = firstWindowDays(days, paramOf(start, 'windowDays') ?? 30);
  if (win) {
    const inWindow = days.filter((d) => d.date <= win.last);
    const hit = levelAwards(kit, start, t.holder, 'all', 'all', inWindow.map((d, i) => ({ n: i + 1, ref: `day:${d.date}`, date: d.date })), { actual: true });
    out.push(...hit);
    if (!hit.length && kit.today <= addDays(win.last, 1)) out.push(progressOf(start, t.holder, 'all', 'all', win.days));
    else out.push({ ...progressOf(start, t.holder, 'all', 'all', win.days), next_level: null });
  }

  // Multideporte y tres mundos: deportes con 3+ días activos (el día en que cada uno llegó a 3).
  const minDays = paramOf(def('multisport'), 'minDaysPerSport') ?? 3;
  const reached: { sport: SportId; date: string }[] = [];
  for (const [sport, list] of groupBy(acts, (a) => a.sport)) {
    const dates = [...new Set(list.map((a) => a.date))].sort();
    if (dates.length >= minDays) reached.push({ sport: sport as SportId, date: dates[minDays - 1] });
  }
  reached.sort((a, b) => a.date.localeCompare(b.date));
  const multi = def('multisport');
  const sportSteps = reached.map((r, i) => ({ n: i + 1, ref: `sport:${r.sport}`, date: r.date, values: { deportes: reached.slice(0, i + 1).map((x) => x.sport).join(',') } }));
  out.push(...levelAwards(kit, multi, t.holder, 'all', 'all', sportSteps), progressOf(multi, t.holder, 'all', 'all', reached.length));
  const families = familiesOf(reached.map((r) => r.sport));
  if (families.has('series') && families.has('racket') && families.has('team')) {
    const when = (fam: string) => reached.find((r) => SPORT_FAMILY[r.sport] === fam)!.date;
    const date = [when('series'), when('racket'), when('team')].sort().pop()!;
    out.push(awardOf(def('three_worlds'), t.holder, 'all', 0, periodKey.always, statusFor(kit, date), [], { values: { fecha: date } }));
  }

  // Aniversario: cada año desde el alta (o el primer juego importado de BowlingX), con 12+ días ponderados en el
  // año anterior. Los años 3 y 4 no dan nivel.
  if (t.user) out.push(...anniversary(kit, t, weighted));
  return out;
}

function anniversary(kit: Kit, t: AccountTarget, weighted: readonly { date: string; weight: number }[]): BadgeDecision[] {
  const d = def('anniversary');
  const profile = kit.profiles.get(t.user!);
  if (!profile) return [];
  const created = localDate(profile.created_at, BADGE_TZ) ?? profile.created_at.slice(0, 10);
  const start = profile.bowlingx && profile.first_import_on && profile.first_import_on < created ? profile.first_import_on : created;
  const min = paramOf(d, 'minWeightedDays') ?? 12;
  const out: BadgeDecision[] = [];
  for (const l of d.levels) {
    const years = Number(l.threshold);
    const on = `${Number(start.slice(0, 4)) + years}${start.slice(4)}`;
    if (on > kit.today) continue;
    const from = addDays(on, -365);
    const n = weighted.filter((x) => x.date >= from && x.date < on).reduce((a, x) => a + x.weight, 0);
    if (n >= min) out.push(awardOf(d, t.holder, 'all', l.level, periodKey.always, 'firme', [], { values: { n: years, dias: n, fecha: on } }));
  }
  return out;
}

export const accountActivity: Evaluator = (job, snap, now) => {
  const kit = kitOf(job, snap, now);
  return accountJobTargets(kit).flatMap((t) => accountActivityFor(kit, t));
};

// ---------------------------------------------------------------------------------------------------------
// Comunidad

/**
 * Liga en marcha (§2.12): para el dueño de la liga al evaluar, jugadores distintos con 3+ días activos en ella en
 * meses de liga real, y 6+ de ellos cuentas establecidas distintas. Un nivel por liga (`l:<liga>`); se queda aunque
 * la transfiera. Una liga con menores sale sin nombre.
 */
export function leagueBuilder(kit: Kit, userId: string): BadgeDecision[] {
  const d = def('league_builder');
  const minDays = paramOf(d, 'minDaysPerPlayer') ?? 3;
  const minAccounts = paramOf(d, 'minAccounts') ?? 6;
  const through = settledThrough(kit.now);
  const out: BadgeDecision[] = [];
  for (const league of kit.leagues.values()) {
    if (league.owner_id !== userId) continue;
    const acts = kit.activity().filter((a) => a.league_id === league.id && a.date <= through && realOn(kit, league.id, a.date, { user: userId }));
    const steps: Step[] = [];
    const counted = new Set<string>();
    const accounts = new Set<string>();
    const days = new Map<string, Set<string>>();
    for (const a of [...acts].sort((x, y) => x.date.localeCompare(y.date))) {
      const set = days.get(a.player_id) ?? new Set<string>();
      set.add(a.date);
      days.set(a.player_id, set);
      if (set.size < minDays || counted.has(a.player_id)) continue;
      counted.add(a.player_id);
      const u = a.user_id ?? kit.userOf(a.player_id);
      if (u && isEstablished(kit.profiles.get(u), a.date)) accounts.add(u);
      if (accounts.size >= minAccounts) steps.push({ n: counted.size, ref: `league:${league.id}`, date: a.date });
    }
    const name = league.has_minors ? 'Liga juvenil privada' : league.name;
    // Un nivel se da una sola vez por liga: si ya lo tiene otro dueño (la liga cambió de manos), no se repite.
    const given = new Set(
      (kit.snap.awards ?? []).filter((a) => a.badge_key === d.key && a.period_key === periodKey.league(league.id) && a.user_id !== userId && a.status !== 'revocada').map((a) => a.level),
    );
    for (const aw of levelAwards(kit, d, { player_id: null, user_id: userId, league_id: null }, 'all', 'all', steps, { context: { league: { id: league.id, name } } })) {
      if (!given.has(aw.level)) out.push({ ...aw, period_key: periodKey.league(league.id), status: 'firme' });
    }
  }
  return out;
}

/**
 * Mesa técnica (§2.12): días de servicio = (liga real, fecha) en que la cuenta dejó final un partido, aprobó el
 * envío de otro, anotó natación o cerró una ronda de golf (SQL ya filtró los días en que tenía jugadores propios).
 */
export function tableCrew(kit: Kit, userId: string): BadgeDecision[] {
  const d = def('table_crew');
  const through = settledThrough(kit.now);
  const acts = (kit.snap.service ?? []).filter((s) => (s.user_id ?? userId) === userId && s.date <= through && realOn(kit, s.league_id, s.date, { user: userId }));
  const days = [...new Set(acts.map((s) => `${s.league_id}|${s.date}`))].map((k) => k.split('|')[1]).sort();
  const steps = days.map((date, i) => ({ n: i + 1, ref: `day:${date}`, date }));
  const holder = { player_id: null, user_id: userId, league_id: null };
  return [...levelAwards(kit, d, holder, 'all', 'all', steps), progressOf(d, holder, 'all', 'all', days.length)];
}

/**
 * Buena vibra (§2.12): personas distintas (una cuenta cuenta una vez) que la cuenta felicitó, que no son jugadores
 * suyos, tienen un día activo y juegan en una liga donde la cuenta es miembro; los niveles piden 2, 3 o 6 meses
 * distintos. Nunca en ligas con menores. Quitar la reacción después no la retira.
 */
export function goodVibes(kit: Kit, userId: string): BadgeDecision[] {
  const d = def('good_vibes');
  const memberOf = new Set((kit.snap.members ?? []).filter((m) => m.user_id === userId).map((m) => m.league_id));
  const own = new Set([...kit.players.values()].filter((p) => p.user_id === userId).map((p) => p.id));
  const people = new Set<string>();
  const months = new Set<string>();
  const steps: Step[] = [];
  for (const c of [...(kit.snap.cheers ?? [])].sort((a, b) => a.at.localeCompare(b.at))) {
    if (own.has(c.player_id) || c.user_id === userId || c.active === false || !memberOf.has(c.league_id) || kit.leagues.get(c.league_id)?.has_minors) continue;
    const date = localDate(c.at, BADGE_TZ) ?? c.at.slice(0, 10);
    const person = c.user_id ?? c.player_id;
    const fresh = !people.has(person);
    people.add(person);
    months.add(monthOf(date));
    if (fresh) steps.push({ n: people.size, ref: `player:${c.player_id}`, date, values: { meses: months.size } });
  }
  const holder = { player_id: null, user_id: userId, league_id: null };
  return [
    ...levelAwards(kit, d, holder, 'all', 'all', steps, { req: (_l, s, req) => Number(s.values?.meses ?? 0) >= (req.months ?? 0) }),
    progressOf(d, holder, 'all', 'all', people.size),
  ];
}

/** Raíces BowlingX: cuenta que viene de BowlingX (`firebase_uid`) y jugó al menos un día en MatchMate. */
export function bowlingxRoots(kit: Kit, t: AccountTarget): BadgeDecision[] {
  const profile = t.user ? kit.profiles.get(t.user) : undefined;
  if (!profile?.bowlingx) return [];
  const first = targetActivity(kit, t, settledThrough(kit.now)).sort((a, b) => a.date.localeCompare(b.date))[0];
  return first ? [awardOf(def('bowlingx_roots'), t.holder, 'bowling', 0, periodKey.always, 'firme', [], { values: { fecha: first.date } })] : [];
}

export const community: Evaluator = (job, snap, now) => {
  const kit = kitOf(job, snap, now);
  const out: BadgeDecision[] = [];
  for (const t of accountJobTargets(kit)) {
    if (!t.user) continue;
    out.push(...leagueBuilder(kit, t.user), ...tableCrew(kit, t.user), ...goodVibes(kit, t.user), ...bowlingxRoots(kit, t));
  }
  return out;
};
