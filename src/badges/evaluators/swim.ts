/**
 * Evaluadores de natación (docs/insignias.md §2.1 y §2.8): el debut, las de carrera de la cuenta (`swim_career`) y lo
 * de un encuentro finalizado que va al nadador en su liga (`swim_meet`: medallas y récords). Tiempos W1 (rules/swim.ts),
 * marcas personales con `personalBests` y puestos con `placeResults`, como la app. Nunca se usa `seed_cs`.
 *
 * Trabajos: `resultado` con 'meet:<event>' (al finalizar), `vinculo`, `evento` con 'meet:<event>' e `historial`. Lo que
 * necesita de la foto:
 * - `swim_entries` con el historial completo de natación de esas cuentas (y del jugador sin cuenta), con sus
 *   `swim_events`, `swim_meets` y `events` (fecha, tipo y nombre del encuentro);
 * - en un `evento`, todo el encuentro y los resultados anteriores de la liga en las mismas pruebas (estilo, distancia,
 *   piscina y sexo) para los récords, y `swim_clubs` para el nombre del club;
 * - `players`, `leagues`, `members`, `profiles` y `league_months`; `awards` y `progress` de los dueños del trabajo.
 */
import { bestKey, GENDER_LABEL, STROKE_LABEL, type SwimStroke } from '../../sports/swimming/events';
import { placeResults, type SwimResult } from '../../sports/swimming/results';
import type { SwimSwim } from '../../sports/swimming/bests';
import { badgeDef, badgesOfEvaluator, levelDef, paramOf, placeLevel, thresholdOf } from '../catalog';
import type { EvaluatorSet } from '../engine';
import { MAX_SHARED } from '../rules/gates';
import { daysBetween, periodKey } from '../rules/periods';
import { entryIsW1, isOfficialMeet, personalBestSteps, swimContext } from '../rules/swim';
import type { SnapEvent, SnapSwimEntry, SnapSwimEvent, SnapSwimMeet } from '../snapshot';
import type { BadgeDecision, BadgeDef, Level } from '../types';
import { awardOf, eventCtx, groupBy, kitOf, leagueCtx, playerHolderOf, realOn, type AccountTarget, type Evaluator, type Kit } from './kit';
import { always, careerAwards, jobEvents, milestones, progressFor, staleRevokes, targetAccounts, type Proof } from './series';

const def = (key: string): BadgeDef => badgeDef(key)!;
const DEBUT = def('debut');
const RACES = def('swim_races');
const PERSONAL_BEST = def('swim_personal_best');
const BIG_DROP = def('swim_big_drop');
const FOUR_STROKES = def('swim_four_strokes');
const DISTANCE = def('swim_distance');
const MEDAL = def('swim_medal');
const RECORD = def('swim_record');

const CAREER_KEYS = badgesOfEvaluator('swim_career').map((d) => d.key);
const MEET_KEYS = badgesOfEvaluator('swim_meet').map((d) => d.key);
/** Los cuatro estilos de `swim_four_strokes` (el combinado no es uno). */
const FOUR: readonly SwimStroke[] = ['libre', 'espalda', 'pecho', 'mariposa'];

// ---------------------------------------------------------------------------------------------------------
// Resultados de la foto

/** Un resultado con su prueba, su encuentro y lo que se sabe de él. */
export interface SwimInfo {
  entry: SnapSwimEntry;
  ev: SnapSwimEvent;
  meet: SnapSwimMeet;
  /** El evento del encuentro (`events`: fecha, tipo y nombre). */
  event: SnapEvent;
  date: string;
  w1: boolean;
}

const infosMemo = new WeakMap<Kit, SwimInfo[]>();

/** Todos los resultados de la foto, en orden: fecha, encuentro y número de prueba. */
export function swimInfos(kit: Kit): SwimInfo[] {
  const hit = infosMemo.get(kit);
  if (hit) return hit;
  const sctx = swimContext(kit.snap.swim_events ?? [], kit.snap.swim_meets ?? [], kit.userOf);
  const out: SwimInfo[] = [];
  for (const entry of kit.snap.swim_entries ?? []) {
    const ev = sctx.events.get(entry.swim_event_id);
    const meet = sctx.meets.get(entry.event_id);
    const event = kit.events.get(entry.event_id);
    if (!ev || !meet || !event) continue;
    out.push({ entry, ev, meet, event, date: event.date, w1: entryIsW1(entry, sctx) });
  }
  out.sort((a, b) => a.date.localeCompare(b.date) || a.entry.event_id.localeCompare(b.entry.event_id) || a.ev.num - b.ev.num || a.entry.id.localeCompare(b.entry.id));
  infosMemo.set(kit, out);
  return out;
}

/** Tiempos W1 que suman para una insignia de cuenta: de sus nadadores y en ligas reales ese mes. */
export function accountSwims(kit: Kit, t: Pick<AccountTarget, 'players' | 'user'>): SwimInfo[] {
  const mine = new Set(t.players);
  return swimInfos(kit).filter((i) => mine.has(i.entry.player_id) && i.w1 && realOn(kit, i.entry.league_id, i.date, t));
}

/** «100 m libre en piscina de 25 m» (con el sexo de la prueba para los récords). */
export function raceLabel(ev: Pick<SnapSwimEvent, 'distance' | 'stroke' | 'pool' | 'gender'>, withGender = false): string {
  const g = withGender ? ` ${GENDER_LABEL[ev.gender].toLowerCase()}` : '';
  return `${ev.distance} m ${STROKE_LABEL[ev.stroke].toLowerCase()}${g} en piscina de ${ev.pool} m`;
}

const swimRef = (i: SwimInfo) => `swim:${i.entry.id}`;

const swimProof = (kit: Kit, i: SwimInfo, values: Proof['values'], more: SwimInfo[] = []): Proof => ({
  date: [i, ...more].reduce((d, x) => (x.date > d ? x.date : d), i.date),
  refs: [i, ...more].map(swimRef),
  values,
  context: { ...leagueCtx(kit, i.entry.league_id), ...eventCtx(kit, i.entry.event_id) },
});

// ---------------------------------------------------------------------------------------------------------
// Debut

/** Primera prueba: un resultado que no es `dns` en un encuentro finalizado (§1.7.2), en liga real. */
export const swimDebut: Evaluator = (job, snap, now) => {
  const kit = kitOf(job, snap, now);
  const out: BadgeDecision[] = [];
  for (const t of targetAccounts(kit, 'swimming')) {
    const mine = new Set(t.players);
    const first = swimInfos(kit).find(
      (i) =>
        mine.has(i.entry.player_id) &&
        i.entry.status !== 'dns' &&
        !!i.meet.finalized_at &&
        realOn(kit, i.entry.league_id, i.date, t) &&
        (!kit.verifiedOnly(i.entry.player_id) || i.w1),
    );
    const produced = first ? careerAwards(kit, DEBUT, t.holder, 'swimming', [{ level: 0 as Level, item: first }], (i) => swimProof(kit, i, {})) : [];
    out.push(...produced, ...staleRevokes(kit, produced, { holders: [t.holder], keys: [DEBUT.key], sport: 'swimming', period: always }));
  }
  return out;
};

// ---------------------------------------------------------------------------------------------------------
// Carrera (cuenta)

/** Todas las de carrera de natación de un dueño con sus tiempos W1 (ya en orden y en ligas reales). */
export function swimCareerFor(kit: Kit, t: AccountTarget, swims: readonly SwimInfo[]): BadgeDecision[] {
  const out: BadgeDecision[] = [];
  const holder = t.holder;
  const byId = new Map(swims.map((i) => [i.entry.id, i]));

  // Pruebas nadadas: resultados W1.
  const races = swims.map((i, k) => ({ i, n: k + 1 }));
  const raceHits = milestones(RACES, races, (r) => r.n, { variant: 'swimming' });
  out.push(...careerAwards(kit, RACES, holder, 'swimming', raceHits, (r, level) => swimProof(kit, r.i, { n: thresholdOf(RACES, level, 'swimming')! })));
  out.push(progressFor(kit, RACES, holder, 'swimming', swims.length, { gained: raceHits }));

  // Marcas personales: cada vez que bajó su marca de una prueba (la primera vez no cuenta). `eventId` lleva la id del
  // resultado para volver a él.
  const list: SwimSwim[] = swims.map((i) => ({ distance: i.ev.distance, stroke: i.ev.stroke, pool: i.ev.pool, time: i.entry.time_cs, status: i.entry.status, date: i.date, eventId: i.entry.id }));
  const steps = personalBestSteps(list).flatMap((s) => {
    const i = s.eventId ? byId.get(s.eventId) : undefined;
    return i ? [{ ...s, i }] : [];
  });
  const counted = steps.map((s, k) => ({ s, n: k + 1 }));
  const pbHits = milestones(PERSONAL_BEST, counted, (c) => c.n, { variant: 'swimming' });
  out.push(
    ...careerAwards(kit, PERSONAL_BEST, holder, 'swimming', pbHits, (c, level) =>
      swimProof(kit, c.s.i, { n: thresholdOf(PERSONAL_BEST, level, 'swimming')!, prueba: raceLabel(c.s.i.ev) }),
    ),
  );
  out.push(progressFor(kit, PERSONAL_BEST, holder, 'swimming', steps.length, { gained: pbHits }));

  // Bajón de tiempo: el % de un paso, contra una marca de hace 21+ días.
  const minDays = paramOf(BIG_DROP, 'minDaysSincePrevious', 'swimming') ?? 21;
  const drops = steps.filter((s) => daysBetween(s.previousDate, s.date) >= minDays);
  const dropHits = milestones(BIG_DROP, drops, (s) => s.pct, { variant: 'swimming' });
  out.push(...careerAwards(kit, BIG_DROP, holder, 'swimming', dropHits, (s) => swimProof(kit, s.i, { n: s.pct, prueba: raceLabel(s.i.ev) })));
  out.push(progressFor(kit, BIG_DROP, holder, 'swimming', Math.max(0, ...drops.map((s) => s.pct)), { gained: dropHits }));

  // Los cuatro estilos: un resultado W1 en libre, espalda, pecho y mariposa.
  const firsts = FOUR.map((s) => swims.find((i) => i.ev.stroke === s));
  if (firsts.every((i) => !!i)) {
    const [a, ...rest] = firsts as SwimInfo[];
    out.push(...careerAwards(kit, FOUR_STROKES, holder, 'swimming', [{ level: 0 as Level, item: a }], () => swimProof(kit, a, {}, rest)));
  }

  // Fondista: un resultado W1 en libre a esa distancia o más.
  const free = swims.filter((i) => i.ev.stroke === 'libre');
  const distHits = milestones(DISTANCE, free, (i) => i.ev.distance, { variant: 'swimming' });
  out.push(
    ...careerAwards(kit, DISTANCE, holder, 'swimming', distHits, (i, level) => swimProof(kit, i, { n: thresholdOf(DISTANCE, level, 'swimming')!, prueba: raceLabel(i.ev) })),
  );
  out.push(progressFor(kit, DISTANCE, holder, 'swimming', Math.max(0, ...free.map((i) => i.ev.distance)), { gained: distHits }));
  return out;
}

export const swimCareer: Evaluator = (job, snap, now) => {
  const kit = kitOf(job, snap, now);
  const out: BadgeDecision[] = [];
  for (const t of targetAccounts(kit, 'swimming')) {
    const produced = swimCareerFor(kit, t, accountSwims(kit, t));
    out.push(...produced, ...staleRevokes(kit, produced, { holders: [t.holder], keys: CAREER_KEYS, sport: 'swimming', period: always }));
  }
  return out;
};

// ---------------------------------------------------------------------------------------------------------
// Encuentro finalizado (liga): medallas y récords

/** Metales de un grupo según sus nadadores W1 (§1.7.8): oro con 3+, plata con 4+, bronce con 5+. */
function medalLevels(swimmers: number): Level[] {
  const out: Level[] = [];
  if (swimmers >= (paramOf(MEDAL, 'goldMin', 'swimming') ?? 3)) out.push(3);
  if (swimmers >= (paramOf(MEDAL, 'silverMin', 'swimming') ?? 4)) out.push(2);
  if (swimmers >= (paramOf(MEDAL, 'bronzeMin', 'swimming') ?? 5)) out.push(1);
  return out;
}

/**
 * Medallas de un encuentro `encuentro` o `torneo` (no `control`): lugar por `placeResults` entre los W1 de cada
 * prueba, por sexo de la prueba y grupo de edad. Los empatados comparten (hasta 3).
 */
export function medalsFor(kit: Kit, meet: SnapSwimMeet, event: SnapEvent): BadgeDecision[] {
  if (!isOfficialMeet(event.type)) return [];
  const out: BadgeDecision[] = [];
  const mine = swimInfos(kit).filter((i) => i.entry.event_id === meet.event_id && i.w1);
  for (const list of groupBy(mine, (i) => i.ev.id).values()) {
    const results: (SwimResult & { i: SwimInfo })[] = list.map((i) => ({ entryId: i.entry.id, gender: i.ev.gender, ageGroup: i.entry.age_group, time: i.entry.time_cs, status: i.entry.status, i }));
    const placed = placeResults(results, meet.points);
    const sizes = new Map<string, number>();
    const ties = new Map<string, number>();
    for (const r of placed) {
      const g = `${r.gender ?? ''}|${r.ageGroup ?? ''}`;
      sizes.set(g, (sizes.get(g) ?? 0) + 1);
      if (r.place != null) ties.set(`${g}|${r.place}`, (ties.get(`${g}|${r.place}`) ?? 0) + 1);
    }
    for (const r of placed) {
      const g = `${r.gender ?? ''}|${r.ageGroup ?? ''}`;
      const level = r.place == null ? null : placeLevel(r.place);
      if (level == null || !medalLevels(sizes.get(g)!).includes(level) || (ties.get(`${g}|${r.place}`) ?? 0) > MAX_SHARED) continue;
      out.push(
        awardOf(MEDAL, playerHolderOf(r.i.entry.player_id, meet.league_id), 'swimming', level, periodKey.race(r.i.entry.id), 'firme', [swimRef(r.i)], {
          ...leagueCtx(kit, meet.league_id),
          ...eventCtx(kit, meet.event_id),
          values: { n: r.place, of: sizes.get(g)!, prueba: raceLabel(r.i.ev), time: r.i.entry.time_cs },
        }),
      );
    }
  }
  return out;
}

/**
 * Récords de un encuentro (una sola vez, al finalizarlo: los récords no se guardan). Liga (oro): el W1 más rápido del
 * encuentro en su prueba (estilo, distancia y piscina) y sexo, más rápido que todos los W1 anteriores de la liga, con
 * 5+ tiempos de 3+ nadadores. Club (plata): lo mismo dentro de su club, con 3+ tiempos de 2+ nadadores.
 */
export function recordsFor(kit: Kit, meet: SnapSwimMeet): BadgeDecision[] {
  const all = swimInfos(kit).filter((i) => i.w1 && i.entry.league_id === meet.league_id);
  const here = all.filter((i) => i.entry.event_id === meet.event_id);
  if (!here.length) return [];
  const date = here[0].date;
  const keyOf = (i: SwimInfo) => `${bestKey(i.ev)}|${i.ev.gender}`;
  const before = groupBy(
    all.filter((i) => i.entry.event_id !== meet.event_id && i.date < date),
    keyOf,
  );
  const clubs = new Map((kit.snap.swim_clubs ?? []).map((c) => [c.id, c]));
  const req = (level: Level) => levelDef(RECORD, level)?.req ?? {};
  const out: BadgeDecision[] = [];
  const beats = (i: SwimInfo, prior: readonly SwimInfo[], rivals: readonly SwimInfo[], level: Level) => {
    const r = req(level);
    const time = i.entry.time_cs!;
    return (
      prior.length >= (r.minTimes ?? 0) &&
      new Set(prior.map((x) => x.entry.player_id)).size >= (r.minSwimmers ?? 0) &&
      prior.every((x) => time < x.entry.time_cs!) &&
      rivals.every((x) => time <= x.entry.time_cs!)
    );
  };
  for (const [key, list] of groupBy(here, keyOf)) {
    const prior = before.get(key) ?? [];
    for (const i of list) {
      const holder = playerHolderOf(i.entry.player_id, meet.league_id);
      const give = (level: Level, club?: string) =>
        out.push(
          awardOf(RECORD, holder, 'swimming', level, periodKey.race(i.entry.id), 'firme', [swimRef(i)], {
            ...leagueCtx(kit, meet.league_id),
            ...eventCtx(kit, meet.event_id),
            values: { n: i.entry.time_cs, prueba: raceLabel(i.ev, true), ...(club ? { club } : {}) },
          }),
        );
      if (beats(i, prior, list, 3)) give(3);
      const club = i.entry.club_id;
      if (club) {
        const same = (x: SwimInfo) => x.entry.club_id === club;
        if (beats(i, prior.filter(same), list.filter(same), 2)) give(2, clubs.get(club)?.name);
      }
    }
  }
  return out;
}

/** Encuentros del trabajo: el del ref (`meet:` o `event:`), o en el historial todos los finalizados de la liga. */
function scopedMeets(kit: Kit): SnapSwimMeet[] {
  const refs = jobEvents(kit);
  const historial = kit.job.kind === 'historial';
  return (kit.snap.swim_meets ?? []).filter((m) => !!m.finalized_at && (historial ? !kit.job.league_id || m.league_id === kit.job.league_id : refs.has(m.event_id)));
}

export const swimMeet: Evaluator = (job, snap, now) => {
  const kit = kitOf(job, snap, now);
  const out: BadgeDecision[] = [];
  for (const meet of scopedMeets(kit)) {
    const event = kit.events.get(meet.event_id);
    const ids = new Set((snap.swim_entries ?? []).filter((e) => e.event_id === meet.event_id).map((e) => periodKey.race(e.id)));
    const produced = event && realOn(kit, meet.league_id, event.date) ? [...medalsFor(kit, meet, event), ...recordsFor(kit, meet)] : [];
    out.push(...produced, ...staleRevokes(kit, produced, { keys: MEET_KEYS, sport: 'swimming', period: (p) => ids.has(p) }));
  }
  return out;
};

export const SWIM_EVALUATORS: EvaluatorSet = {
  debut: swimDebut,
  swim_career: swimCareer,
  swim_meet: swimMeet,
};
