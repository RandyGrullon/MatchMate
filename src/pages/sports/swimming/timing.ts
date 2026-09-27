/**
 * Cronometraje de una serie en el teléfono (pantalla de cancha). Todo sale de una lista de toques guardada en
 * el teléfono (localStorage `mm:swim:t:<prueba>:<serie>`): el estado se recalcula desde ella, así «Deshacer»
 * es quitar el último toque y nada se pierde si se cierra la app. Al servidor va solo el resumen de la serie
 * («Publicar serie»), nunca cada toque.
 *
 * El cronómetro del teléfono NO es oficial (cada teléfono arranca el suyo con la señal de salida): la forma
 * principal es escribir el tiempo de los cronómetros físicos con el teclado mm:ss.hh.
 */
import { officialTime, type SwimStatus } from '../../../sports/swimming';

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
