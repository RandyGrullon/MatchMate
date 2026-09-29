/**
 * Validación de natación para las insignias (docs/insignias.md §1.7.5 y §1.7.6): resultado contado (W1), grupo
 * con campo (W2), actividad y marcas personales con los helpers de src/sports/swimming. Nunca se usa `seed_cs` (lo
 * escribe el nadador).
 */
import type { MeetType } from '../../lib/data/swimming';
import { personalBests, type SwimSwim } from '../../sports/swimming/bests';
import type { ActivityDay, SnapSwimEntry, SnapSwimEvent, SnapSwimMeet } from '../snapshot';

/** Encuentros que dan medallas y puntos: `encuentro` y `torneo`. El `control` solo cuenta para marcas y progreso. */
export const isOfficialMeet = (type: string | null | undefined): type is Exclude<MeetType, 'control'> => type === 'encuentro' || type === 'torneo';

/** W1: `ok` con tiempo, encuentro finalizado y el tiempo no lo anotó la cuenta del nadador. */
export function isW1(entry: SnapSwimEntry, meet: Pick<SnapSwimMeet, 'event_id' | 'finalized_at'> | undefined, swimmerUser: string | null): boolean {
  return (
    entry.status === 'ok' &&
    entry.time_cs != null &&
    entry.time_cs > 0 &&
    !!meet?.finalized_at &&
    meet.event_id === entry.event_id &&
    !(swimmerUser && entry.recorded_by === swimmerUser)
  );
}

/** Grupo de un resultado, como `placeResults`: sexo de la prueba y grupo de edad. */
export const swimGroupKey = (entry: Pick<SnapSwimEntry, 'swim_event_id' | 'age_group'>, event: Pick<SnapSwimEvent, 'gender'>): string =>
  `${entry.swim_event_id}|${event.gender}|${entry.age_group ?? ''}`;

export interface SwimContext {
  events: ReadonlyMap<string, SnapSwimEvent>;
  meets: ReadonlyMap<string, SnapSwimMeet>;
  userOf: (playerId: string) => string | null;
}

export const swimContext = (events: readonly SnapSwimEvent[], meets: readonly SnapSwimMeet[], userOf: (playerId: string) => string | null): SwimContext => ({
  events: new Map(events.map((e) => [e.id, e])),
  meets: new Map(meets.map((m) => [m.event_id, m])),
  userOf,
});

export const entryIsW1 = (e: SnapSwimEntry, ctx: SwimContext): boolean => isW1(e, ctx.meets.get(e.event_id), ctx.userOf(e.player_id));

/** Nadadores W1 por grupo de cada prueba (para W2 y para el tamaño del podio de natación). */
export function w1GroupSizes(entries: readonly SnapSwimEntry[], ctx: SwimContext): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of entries) {
    const ev = ctx.events.get(e.swim_event_id);
    if (!ev || !entryIsW1(e, ctx)) continue;
    const k = swimGroupKey(e, ev);
    out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}

/** W2: W1 y su grupo tiene al menos `min` nadadores W1. */
export function isW2(e: SnapSwimEntry, ctx: SwimContext, sizes: ReadonlyMap<string, number>, min: number): boolean {
  const ev = ctx.events.get(e.swim_event_id);
  return !!ev && entryIsW1(e, ctx) && (sizes.get(swimGroupKey(e, ev)) ?? 0) >= min;
}

/**
 * Actividad válida de natación: un resultado `ok`, `dq` o `dnf` (no `dns`) en un encuentro finalizado da el día del
 * encuentro. Oficial en `encuentro` y `torneo`.
 */
export function swimActivity(
  entries: readonly SnapSwimEntry[],
  ctx: SwimContext & { dateOf: (eventId: string) => string | null; typeOf: (eventId: string) => string | null },
): ActivityDay[] {
  const out = new Map<string, ActivityDay>();
  for (const e of entries) {
    if (e.status === 'dns' || !ctx.meets.get(e.event_id)?.finalized_at) continue;
    const date = ctx.dateOf(e.event_id);
    if (!date) continue;
    const k = `${e.player_id}|${e.event_id}`;
    if (!out.has(k)) out.set(k, { sport: 'swimming', league_id: e.league_id, player_id: e.player_id, user_id: ctx.userOf(e.player_id), date, official: isOfficialMeet(ctx.typeOf(e.event_id)) });
  }
  return [...out.values()];
}

/** Tiempos W1 para las marcas personales (`personalBests`), con la fecha del encuentro. */
export function swimsOf(entries: readonly SnapSwimEntry[], ctx: SwimContext & { dateOf: (eventId: string) => string | null }): (SwimSwim & { entryId: string })[] {
  const out: (SwimSwim & { entryId: string })[] = [];
  for (const e of entries) {
    const ev = ctx.events.get(e.swim_event_id);
    const date = ctx.dateOf(e.event_id);
    if (!ev || !date || !entryIsW1(e, ctx)) continue;
    out.push({ distance: ev.distance, stroke: ev.stroke, pool: ev.pool, time: e.time_cs, status: e.status, date, eventId: e.event_id, entryId: e.id });
  }
  return out;
}

/** Una vez que bajó su marca (la primera vez en una prueba es «primera marca», no MP). */
export interface PersonalBestStep {
  /** `bestKey`: estilo + distancia + piscina (25 y 50 m van aparte). */
  key: string;
  date: string;
  time: number;
  /** % que mejoró frente a la marca anterior. */
  pct: number;
  /** Fecha de la marca anterior (para `swim_big_drop`, que pide 21+ días). */
  previousDate: string;
  eventId?: string;
}

/** Los pasos de la progresión de cada prueba, sin el primer tiempo, en orden de fecha. */
export function personalBestSteps(swims: readonly SwimSwim[]): PersonalBestStep[] {
  const out: PersonalBestStep[] = [];
  for (const pb of personalBests(swims)) {
    pb.progression.forEach((step, i) => {
      if (i === 0 || step.pct === null) return;
      out.push({ key: pb.key, date: step.date, time: step.time, pct: step.pct, previousDate: pb.progression[i - 1].date, eventId: step.eventId });
    });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
