import type { Side } from '../sports/types';
import type { CourtAdapter, CourtSnapshot } from './types';

/**
 * Lógica pura del modo cancha (sin React, sin backend): la lista de jugadas, deshacer, compactar y elegir entre
 * lo guardado en el teléfono y lo publicado en el servidor.
 */

/** Más de estas jugadas en la lista: se compacta (el estado de las viejas pasa a `base`). */
export const MAX_LOG = 400;
/** Al compactar se dejan estas jugadas para poder deshacer. */
export const KEEP_UNDO = 100;

export function startSnapshot<C, S = unknown, E = unknown>(config: C, now = Date.now(), origin?: string): CourtSnapshot<C, S, E> {
  const snap: CourtSnapshot<C, S, E> = { v: 1, seq: 0, config, base: null, log: [], at: now };
  if (origin) snap.origin = origin;
  return snap;
}

/** Este teléfono sigue la lista (lo que publique desde ahora es suyo). */
export function withOrigin<C, S, E>(snap: CourtSnapshot<C, S, E>, origin: string): CourtSnapshot<C, S, E> {
  return snap.origin === origin ? snap : { ...snap, origin };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Es una lista guardada o publicada que este teléfono sabe leer. */
export function isSnapshot(v: unknown): v is CourtSnapshot {
  return isObj(v) && v.v === 1 && Number.isInteger(v.seq) && (v.seq as number) >= 0 && Array.isArray(v.log) && 'config' in v;
}

/** Estado actual: `base` (o `init(config)`) con la lista aplicada. */
export function snapshotState<C, S, E>(adapter: CourtAdapter<C, S, E>, snap: CourtSnapshot<C, S, E>): S {
  const start = snap.base ?? adapter.engine.init(snap.config);
  return snap.log.reduce((s, ev) => adapter.engine.apply(s, ev), start);
}

export interface Applied<C, S, E> {
  snap: CourtSnapshot<C, S, E>;
  prev: S;
  state: S;
  /** Publicar ya (hito del deporte o fin del partido). */
  milestone: boolean;
}

/**
 * Aplica una jugada. Si el motor la rechaza, lanza su Error (mensaje en español) y no cambia nada.
 * `prev` = el estado antes (si ya se tiene, se pasa para no volver a reproducir la lista).
 */
export function applyEvent<C, S, E>(adapter: CourtAdapter<C, S, E>, snap: CourtSnapshot<C, S, E>, ev: E, now = Date.now(), prev?: S): Applied<C, S, E> {
  const before = prev ?? snapshotState(adapter, snap);
  const state = adapter.engine.apply(before, ev);
  const next = compact(adapter, { ...snap, seq: snap.seq + 1, log: [...snap.log, ev], at: now });
  const milestone = adapter.engine.isOver(state) || !!adapter.milestone?.(before, state, ev);
  return { snap: next, prev: before, state, milestone };
}

/** Quita la última jugada (no pasa de `base`). null si no hay nada que deshacer. */
export function undoEvent<C, S, E>(adapter: CourtAdapter<C, S, E>, snap: CourtSnapshot<C, S, E>, now = Date.now()): { snap: CourtSnapshot<C, S, E>; state: S } | null {
  if (!snap.log.length) return null;
  const next = { ...snap, seq: snap.seq + 1, log: snap.log.slice(0, -1), at: now };
  return { snap: next, state: snapshotState(adapter, next) };
}

export const canUndo = (snap: CourtSnapshot | null) => !!snap && snap.log.length > 0;

/** Con la lista muy larga, las jugadas viejas pasan a `base` (quedan `keep` para deshacer). */
export function compact<C, S, E>(adapter: CourtAdapter<C, S, E>, snap: CourtSnapshot<C, S, E>, max = MAX_LOG, keep = KEEP_UNDO): CourtSnapshot<C, S, E> {
  if (snap.log.length <= max) return snap;
  const cut = snap.log.length - keep;
  const base = snap.log.slice(0, cut).reduce((s, ev) => adapter.engine.apply(s, ev), snap.base ?? adapter.engine.init(snap.config));
  return { ...snap, base: structuredClone(base), log: snap.log.slice(cut) };
}

/** Marcador, ganador y resumen del estado. */
export function outcome<C, S, E>(adapter: CourtAdapter<C, S, E>, state: S): { over: boolean; winner: Side | null; summary: string } {
  const r = adapter.engine.result(state);
  return { over: adapter.engine.isOver(state), winner: adapter.winner ? adapter.winner(state) : r.winner, summary: r.summary };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Las dos listas llevan al mismo punto (misma configuración, base y jugadas). */
export function sameSnapshot(a: CourtSnapshot, b: CourtSnapshot): boolean {
  return same(a.config, b.config) && same(a.base, b.base) && same(a.log, b.log);
}

export interface LocalCourt<C = unknown, S = unknown, E = unknown> {
  snap: CourtSnapshot<C, S, E>;
  /** Última `seq` de esta lista que el servidor confirmó (0 = nunca). */
  published: number;
}

export interface Picked<C, S, E> {
  snap: CourtSnapshot<C, S, E> | null;
  source: 'local' | 'remote' | 'none';
  /** La lista del teléfono tenía jugadas sin enviar y se usó la del servidor (quedó guardada aparte). */
  conflict: boolean;
}

/**
 * Qué lista usar al abrir el partido con el turno de anotar:
 * - lo publicado por este mismo teléfono (misma `origin`): la más avanzada (una respuesta perdida o un deshacer
 *   no cuentan como de otro);
 * - si el servidor no tiene nada más nuevo que lo último que este teléfono le mandó, la del teléfono (puede
 *   llevar jugadas sin enviar: sin señal no se pierde ningún punto);
 * - si otro teléfono publicó después (se retomó en otro lado), la del servidor. Si además el teléfono tenía
 *   jugadas sin enviar, es un conflicto: gana el servidor (tiene el turno) y la del teléfono se guarda aparte.
 */
export function pickSnapshot<C, S, E>(local: LocalCourt<C, S, E> | null, remote: unknown): Picked<C, S, E> {
  const r = isSnapshot(remote) ? (remote as CourtSnapshot<C, S, E>) : null;
  if (!local) return { snap: r, source: r ? 'remote' : 'none', conflict: false };
  if (!r) return { snap: local.snap, source: 'local', conflict: false };
  const newer = (a: CourtSnapshot<C, S, E>, b: CourtSnapshot<C, S, E>) => (a.seq >= b.seq ? a : b);
  if (local.snap.origin && r.origin === local.snap.origin) {
    const snap = newer(local.snap, r);
    return { snap, source: snap === local.snap ? 'local' : 'remote', conflict: false };
  }
  if (r.seq <= local.published || sameSnapshot(local.snap, r)) {
    const snap = newer(local.snap, r);
    return { snap, source: snap === local.snap ? 'local' : 'remote', conflict: false };
  }
  const unsent = local.snap.seq > local.published;
  return { snap: r, source: 'remote', conflict: unsent };
}
