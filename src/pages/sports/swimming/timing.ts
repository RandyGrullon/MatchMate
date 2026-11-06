/**
 * Cronometraje de una serie en el teléfono (pantalla de cancha). Todo sale de una lista de toques guardada en
 * el teléfono (localStorage `mm:swim:t:<prueba>:<serie>`): el estado se recalcula desde ella, así «Deshacer»
 * es quitar el último toque y nada se pierde si se cierra la app. Al servidor va solo el resumen de la serie
 * («Publicar serie»), nunca cada toque.
 *
 * El cronómetro del teléfono NO es oficial (cada teléfono arranca el suyo con la señal de salida): la forma
 * principal es escribir el tiempo de los cronómetros físicos con el teclado mm:ss.hh.
 */
import type { SwimEntry, SwimEventItem } from '../../../lib/data/swimming';
import { formatSwimTime, officialTime, timeFromDigits, type SwimStatus } from '../../../sports/swimming';
import { hasResult, pendingHeats, raceName } from './logic';

export type TimingEvent =
  /** Salida: arranca el cronómetro del teléfono (hora en ms, Date.now()). */
  | { t: 'start'; at: number }
  /** STOP de un carril (hora en ms). */
  | { t: 'stop'; lane: number; at: number }
  /** Tiempo escrito a mano (centésimas; null = borrar). Con varios cronómetros: `watches`, y vale el oficial. */
  | { t: 'time'; lane: number; cs: number | null; watches?: (number | null)[] }
  /** Estado del carril (ok, DQ, DNS, DNF). DNS y DNF borran el tiempo. */
  | { t: 'status'; lane: number; status: SwimStatus }
  /** Vuelve a poner el cronómetro en cero (los tiempos escritos a mano se quedan). */
  | { t: 'reset' };

export interface LaneTiming {
  /** undefined = sin tocar (vale lo que ya tenía el servidor). */
  time?: number | null;
  source?: 'watch' | 'manual';
  status?: SwimStatus;
}

export interface TimingState {
  startedAt: number | null;
  lanes: Record<number, LaneTiming>;
}

export const emptyTiming = (): TimingState => ({ startedAt: null, lanes: {} });

/** Centésimas entre dos horas en ms (mínimo 1). */
export const elapsedCs = (from: number, to: number) => Math.max(1, Math.round((to - from) / 10));

export function applyTiming(s: TimingState, ev: TimingEvent): TimingState {
  const lane = (n: number) => s.lanes[n] ?? {};
  const put = (n: number, l: LaneTiming): TimingState => ({ ...s, lanes: { ...s.lanes, [n]: l } });
  switch (ev.t) {
    case 'start':
      if (s.startedAt != null) throw new Error('El cronómetro ya está corriendo.');
      return { ...s, startedAt: ev.at };
    case 'stop': {
      if (s.startedAt == null) throw new Error('Primero toca SALIDA.');
      const l = lane(ev.lane);
      const status = l.status === 'dns' || l.status === 'dnf' ? 'ok' : l.status;
      return put(ev.lane, { ...l, time: elapsedCs(s.startedAt, ev.at), source: 'watch', ...(status ? { status } : {}) });
    }
    case 'time': {
      const l = lane(ev.lane);
      const cs = ev.watches ? officialTime(ev.watches) : ev.cs;
      const status = cs != null && (l.status === 'dns' || l.status === 'dnf') ? 'ok' : l.status;
      return put(ev.lane, { ...l, time: cs, source: 'manual', ...(status ? { status } : {}) });
    }
    case 'status': {
      const l = lane(ev.lane);
      return put(ev.lane, ev.status === 'dns' || ev.status === 'dnf' ? { ...l, status: ev.status, time: null } : { ...l, status: ev.status });
    }
    case 'reset': {
      const lanes: Record<number, LaneTiming> = {};
      for (const [k, l] of Object.entries(s.lanes)) {
        if (l.source === 'watch') {
          const { time: _t, source: _s, ...rest } = l;
          if (Object.keys(rest).length) lanes[Number(k)] = rest;
        } else lanes[Number(k)] = l;
      }
      return { startedAt: null, lanes };
    }
  }
}

/** El estado desde la lista de toques (los toques que ya no valen se saltan). */
export function replayTiming(log: readonly TimingEvent[]): TimingState {
  return log.reduce((s, ev) => {
    try {
      return applyTiming(s, ev);
    } catch {
      return s;
    }
  }, emptyTiming());
}

export interface LaneValue {
  time: number | null;
  status: SwimStatus;
}

/** Lo que vale en el carril: lo tocado en este teléfono, y si no, lo que ya tenía el servidor. */
export function laneValue(base: LaneValue | undefined, l: LaneTiming | undefined): LaneValue {
  return {
    time: l && l.time !== undefined ? l.time : (base?.time ?? null),
    status: l?.status ?? base?.status ?? 'ok',
  };
}

/** El carril ya tiene algo que publicar (un tiempo o un estado distinto de ok). */
export const laneDone = (v: LaneValue) => v.time != null || v.status !== 'ok';

/** Puesto dentro de la serie por tiempo (solo los ok con tiempo; empates comparten). */
export function heatOrder(values: Record<number, LaneValue>): Record<number, number> {
  const ok = Object.entries(values)
    .filter(([, v]) => v.status === 'ok' && v.time != null)
    .map(([lane, v]) => ({ lane: Number(lane), time: v.time! }))
    .sort((a, b) => a.time - b.time);
  const out: Record<number, number> = {};
  ok.forEach((x, k) => (out[x.lane] = k > 0 && ok[k - 1].time === x.time ? out[ok[k - 1].lane] : k + 1));
  return out;
}

// ---------- Guardado en el teléfono ----------

const PREFIX = 'mm:swim:t:';
/** Lo guardado de más de 3 días se borra. */
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

export const timingKey = (swimEventId: string, heat: number) => `${PREFIX}${swimEventId}:${heat}`;

interface Saved {
  v: 1;
  log: TimingEvent[];
  at: number;
  /** Cuándo se publicó la serie desde este teléfono. */
  publishedAt?: number;
}

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function loadTiming(key: string): { log: TimingEvent[]; publishedAt: number | null } {
  try {
    const raw = storage()?.getItem(key);
    if (!raw) return { log: [], publishedAt: null };
    const s = JSON.parse(raw) as Saved;
    return { log: Array.isArray(s.log) ? s.log : [], publishedAt: s.publishedAt ?? null };
  } catch {
    return { log: [], publishedAt: null };
  }
}

export function saveTiming(key: string, log: TimingEvent[], publishedAt: number | null, now = Date.now()) {
  try {
    const s = storage();
    if (!s) return;
    if (!log.length && !publishedAt) s.removeItem(key);
    else s.setItem(key, JSON.stringify({ v: 1, log, at: now, ...(publishedAt ? { publishedAt } : {}) } satisfies Saved));
  } catch {
    // Almacenamiento lleno o no disponible: el cronometraje sigue en memoria.
  }
}

/** Borra lo guardado de series viejas. */
export function sweepTimings(now = Date.now()) {
  try {
    const s = storage();
    if (!s) return;
    const old: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (!k?.startsWith(PREFIX)) continue;
      try {
        const v = JSON.parse(s.getItem(k) ?? '{}') as Partial<Saved>;
        if (!v.at || now - v.at > MAX_AGE_MS) old.push(k);
      } catch {
        old.push(k);
      }
    }
    old.forEach((k) => s.removeItem(k));
  } catch {
    // nada
  }
}

// ---------- La serie que se cronometra (TimingPanel; también la app del teléfono) ----------

/** Las series de una prueba (las que tienen nadadores con serie), en orden. */
export const heatsOf = (ev: Pick<SwimEventItem, 'id'>, entries: readonly SwimEntry[]) =>
  [...new Set(entries.filter((e) => e.swimEventId === ev.id && e.heat != null).map((e) => e.heat!))].sort((a, b) => a - b);

export interface HeatRef {
  ev: string;
  heat: number;
}

/** Al abrir: la primera serie que falta por cronometrar (si no falta ninguna, la primera). `seeded`: las pruebas con series. */
export function firstPendingHeat(seeded: readonly SwimEventItem[], entries: readonly SwimEntry[]): HeatRef | null {
  for (const ev of seeded) {
    const p = pendingHeats(ev, entries);
    if (p.length) return { ev: ev.id, heat: p[0] };
  }
  return seeded[0] ? { ev: seeded[0].id, heat: heatsOf(seeded[0], entries)[0] } : null;
}

/** La serie elegida (o la de `auto` si ya no está): su prueba, las series de la prueba y el número de la serie. */
export function resolveHeat(seeded: readonly SwimEventItem[], entries: readonly SwimEntry[], sel: HeatRef | null, auto: HeatRef): { ev: SwimEventItem; heats: number[]; heat: number } {
  const cur = sel && seeded.some((e) => e.id === sel.ev) ? sel : auto;
  const ev = seeded.find((e) => e.id === cur.ev)!;
  const heats = heatsOf(ev, entries);
  return { ev, heats, heat: heats.includes(cur.heat) ? cur.heat : heats[0] };
}

/** La serie que sigue (en la misma prueba o la primera de la siguiente). */
export function nextHeat(seeded: readonly SwimEventItem[], entries: readonly SwimEntry[], ev: SwimEventItem, heat: number): HeatRef | null {
  const heats = heatsOf(ev, entries);
  const k = heats.indexOf(heat);
  if (k >= 0 && k < heats.length - 1) return { ev: ev.id, heat: heats[k + 1] };
  const i = seeded.findIndex((e) => e.id === ev.id);
  const after = seeded[i + 1];
  return after ? { ev: after.id, heat: heatsOf(after, entries)[0] } : null;
}

/** La prueba en el selector: «3. 50 m Libre · Fem.», con «✓» si ya no le falta ninguna serie. */
export const timingEventLabel = (e: SwimEventItem, entries: readonly SwimEntry[]) =>
  `${e.num}. ${raceName(e)} · ${e.gender === 'F' ? 'Fem.' : e.gender === 'M' ? 'Masc.' : 'Mixto'}${pendingHeats(e, entries).length === 0 ? ' ✓' : ''}`;

/** La serie ya tiene algún resultado en el servidor. */
export const heatHasResults = (evId: string, heat: number, entries: readonly SwimEntry[]) => entries.some((e) => e.swimEventId === evId && e.heat === heat && hasResult(e));

/** Los carriles de la serie, en orden. */
export const heatLanes = (entries: readonly SwimEntry[], evId: string, heat: number) =>
  entries.filter((e) => e.swimEventId === evId && e.heat === heat).sort((a, b) => (a.lane ?? 0) - (b.lane ?? 0));

/** Lo que vale en cada carril de la serie: lo tocado en este teléfono encima de lo que tenía el servidor. */
export function laneValues(lanes: readonly SwimEntry[], state: TimingState): Record<number, LaneValue> {
  const values: Record<number, LaneValue> = {};
  for (const e of lanes) values[e.lane!] = laneValue(hasResult(e) ? { time: e.time, status: e.status } : undefined, state.lanes[e.lane!]);
  return values;
}

/** Los carriles sin tiempo ni estado. */
export const missingLanes = (lanes: readonly SwimEntry[], values: Record<number, LaneValue>) => lanes.filter((e) => !laneDone(values[e.lane!]));

/** Lo que manda «Publicar serie»: los carriles con algo (o que ya tenían resultado); DNS y DNF sin tiempo. */
export function heatResults(lanes: readonly SwimEntry[], values: Record<number, LaneValue>): { entryId: string; time: number | null; status: SwimStatus }[] {
  return lanes
    .filter((e) => laneDone(values[e.lane!]) || hasResult(e))
    .map((e) => ({ entryId: e.id, time: values[e.lane!].status === 'dns' || values[e.lane!].status === 'dnf' ? null : values[e.lane!].time, status: values[e.lane!].status }));
}

/** DQ, DNS o DNF con un toque: tocar el que ya tiene lo quita (vuelve a ok). */
export const toggledStatus = (v: LaneValue | undefined, s: SwimStatus): SwimStatus => (v?.status === s ? 'ok' : s);

/** Hay STOP del cronómetro en la serie (poner en cero pregunta antes). */
export const hasWatchStops = (state: TimingState) => Object.values(state.lanes).some((l) => l.source === 'watch');

/** El carril todavía espera su STOP: el cronómetro corre, no tiene STOP y no es DNS. */
export const stopPending = (state: TimingState, lane: number, v: LaneValue) => state.startedAt != null && state.lanes[lane]?.source !== 'watch' && v.status !== 'dns';

// ---------- El teclado mm:ss.hh ----------

/** Una cifra más: entra por la derecha (hasta 6, sin ceros a la izquierda). */
export const keypadPress = (digits: string, d: string) => (digits.length >= 6 ? digits : (digits + d).replace(/^0+/, ''));

/** Lo que muestra el teclado: lo escrito («—» si no vale), o el tiempo que ya tenía, o «00:00.00». */
export function keypadText(digits: string, initial: number | null): string {
  const cs = digits ? timeFromDigits(digits) : null;
  return digits ? (cs ? formatSwimTime(cs, { full: true }) : '—') : initial ? formatSwimTime(initial, { full: true }) : '00:00.00';
}
