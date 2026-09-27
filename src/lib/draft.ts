import { useMemo, useSyncExternalStore } from 'react';
import { publishLiveScores } from './data';
import type { GameFrames } from './types';

/**
 * Juegos que el jugador va anotando en su teléfono antes de enviarlos a revisión.
 * Se guardan en el teléfono (funciona sin señal en la bolera), uno por evento, y se borran al enviarlos.
 */
export interface GameDraft {
  /** Evento donde jugó, o '__fecha__' si sube juegos de un día sin evento. */
  eventId: string;
  date?: string;
  /** Pinos por juego como texto ('' = sin jugar). */
  values: string[];
  /** Cuadros de los juegos anotados tiro por tiro (clave = índice del juego). */
  frames?: Record<string, GameFrames>;
  /** Cuándo se guardó (para volver al último al abrir "Subir mis juegos"). */
  savedAt?: number;
}

const prefix = (lid: string, playerId: string) => `bowlinx:borrador:${lid}:${playerId}`;
const key = (lid: string, playerId: string, eventId: string) => `${prefix(lid, playerId)}:${eventId}`;
/** Antes había un solo borrador por liga (sin el evento en la clave): se sigue leyendo. */
const legacyKey = prefix;
/** Aviso interno para que las pantallas abiertas vean el borrador nuevo al momento. */
const CHANGED = 'bowlingx:borrador';

function readRaw(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

function parse(raw: string | null): GameDraft | null {
  try {
    const d = JSON.parse(raw ?? 'null') as GameDraft | null;
    return d && typeof d.eventId === 'string' && Array.isArray(d.values) ? d : null;
  } catch {
    return null;
  }
}

/** Juegos anotados que tiene el borrador (los que no están vacíos). */
export const draftCount = (d: GameDraft | null) => d?.values.filter((v) => v.trim() !== '').length ?? 0;

function pick(raw: string | null, legacyRaw: string | null, eventId: string): GameDraft | null {
  const d = parse(raw);
  if (d) return d;
  const old = parse(legacyRaw);
  return old && old.eventId === eventId ? old : null;
}

/** Borrador del jugador en ese evento. */
export function loadDraft(lid: string, playerId: string, eventId: string): GameDraft | null {
  return pick(readRaw(key(lid, playerId, eventId)), readRaw(legacyKey(lid, playerId)), eventId);
}

/** El borrador con juegos guardado más recientemente en la liga (para abrir "Subir mis juegos" donde se quedó). */
export function latestDraft(lid: string, playerId: string): GameDraft | null {
  const p = `${prefix(lid, playerId)}:`;
  let best = parse(readRaw(legacyKey(lid, playerId)));
  if (!draftCount(best)) best = null;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(p)) continue;
      const d = parse(readRaw(k));
      if (d && draftCount(d) > 0 && (!best || (d.savedAt ?? 0) >= (best.savedAt ?? 0))) best = d;
    }
  } catch {
    // almacenamiento no disponible
  }
  return best;
}

// ---- En vivo: lo anotado en un evento se publica para que toda la liga lo vea ----
// Solo se publica lo que se edita en este teléfono. Nunca se borra lo que publicó otro dispositivo:
// un teléfono sin borrador (o una computadora) no quita la fila en vivo del jugador.
interface Pending {
  timer: number;
  send: () => void;
}
const pendingLive = new Map<string, Pending>();

/**
 * Lo último que este dispositivo publicó en cada evento (valores sin los vacíos del final). Se guarda en el
 * teléfono para que, aunque la app se cierre o se recargue, al enviar o borrar se quite la fila en vivo.
 */
const markerKey = (k: string) => `bowlinx:vivo:${k}`;
const memoryMarkers = new Map<string, string[]>();
/** Marca de "falló la última publicación": no coincide con nada, así la próxima vuelve a publicar. */
const FAILED = ['\u0000'];
function getMarker(k: string): string[] | null {
  const raw = readRaw(markerKey(k));
  if (raw != null) {
    try {
      const v = JSON.parse(raw);
      if (Array.isArray(v)) return v as string[];
    } catch {
      // marca dañada: se trata como si no hubiera
    }
  }
  return memoryMarkers.get(k) ?? null;
}
function setMarker(k: string, v: string[] | null) {
  if (v) memoryMarkers.set(k, v);
  else memoryMarkers.delete(k);
  try {
    if (v) localStorage.setItem(markerKey(k), JSON.stringify(v));
    else localStorage.removeItem(markerKey(k));
  } catch {
    // sin almacenamiento: queda la marca en memoria
  }
}
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const trimmed = (values: string[]) => {
  const v = values.map((x) => x.trim());
  while (v.length && v[v.length - 1] === '') v.pop();
  return v;
};

function publishLive(lid: string, playerId: string, eventId: string, values: string[]) {
  if (eventId === '__fecha__') return;
  const k = `${lid}/${playerId}/${eventId}`;
  const next = trimmed(values);
  const before = getMarker(k);
  if (before && same(before, next)) return;
  const old = pendingLive.get(k);
  if (old) window.clearTimeout(old.timer);
  // Vacío: solo se quita si este dispositivo había publicado algo (lo de otro dispositivo no se toca).
  if (!next.length && !before?.length) {
    pendingLive.delete(k);
    return;
  }
  setMarker(k, next);
  const send = () => {
    pendingLive.delete(k);
    publishLiveScores(lid, eventId, playerId, next)
      .then(() => {
        // Ya no queda nada publicado: se limpia la marca.
        if (!next.length && same(getMarker(k) ?? FAILED, next)) setMarker(k, null);
      })
      .catch(() => {
        // Sin permiso o sin señal: el borrador sigue en el teléfono; la próxima vez se vuelve a publicar.
        if (same(getMarker(k) ?? FAILED, next)) setMarker(k, FAILED);
      });
  };
  pendingLive.set(k, { timer: window.setTimeout(send, 700), send });
}

// Al guardar el teléfono o cambiar de app se manda ya lo pendiente (en segundo plano los timers se pausan).
function flushLive() {
  for (const p of [...pendingLive.values()]) {
    window.clearTimeout(p.timer);
    p.send();
  }
}
if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flushLive());
  window.addEventListener('pagehide', flushLive);
}

/**
 * Guarda el borrador de ese evento; sin juegos anotados (o null), lo borra.
 * `live: false` cuando no es un cambio del jugador (p. ej. solo se cargó el borrador): no se publica en vivo.
 */
export function saveDraft(
  lid: string,
  playerId: string,
  eventId: string,
  d: Pick<GameDraft, 'values' | 'frames' | 'date'> | null,
  { live = true }: { live?: boolean } = {},
) {
  try {
    if (d && d.values.some((v) => v.trim() !== '')) {
      localStorage.setItem(key(lid, playerId, eventId), JSON.stringify({ ...d, eventId, savedAt: Date.now() }));
    } else {
      localStorage.removeItem(key(lid, playerId, eventId));
    }
    // El borrador viejo de este evento ya quedó en su lugar nuevo.
    if (parse(readRaw(legacyKey(lid, playerId)))?.eventId === eventId) localStorage.removeItem(legacyKey(lid, playerId));
  } catch {
    // almacenamiento no disponible (modo privado): el borrador solo vive en pantalla
  }
  window.dispatchEvent(new Event(CHANGED));
  if (live) publishLive(lid, playerId, eventId, d?.values ?? []);
}

/**
 * Quita del borrador los juegos que se enviaron (los que siguen igual): si mientras se enviaba
 * se anotó otro juego, ese se queda en el teléfono.
 */
export function clearSent(lid: string, playerId: string, eventId: string, sent: string[]) {
  const cur = loadDraft(lid, playerId, eventId);
  if (!cur) {
    // Sin almacenamiento en el teléfono: igual se quita de "en vivo" lo que se envió.
    publishLive(lid, playerId, eventId, []);
    return;
  }
  const wasSent = (i: number) => (cur.values[i] ?? '').trim() !== '' && cur.values[i] === sent[i];
  saveDraft(lid, playerId, eventId, {
    ...cur,
    values: cur.values.map((v, i) => (wasSent(i) ? '' : v)),
    frames: Object.fromEntries(Object.entries(cur.frames ?? {}).filter(([i]) => !wasSent(+i))),
  });
}

/** Vuelve a poner en el teléfono lo que no se pudo enviar (sin pisar lo anotado después). */
export function restoreDraft(lid: string, playerId: string, eventId: string, sent: Pick<GameDraft, 'values' | 'frames' | 'date'>) {
  const cur = loadDraft(lid, playerId, eventId);
  const length = Math.max(sent.values.length, cur?.values.length ?? 0);
  const values = Array.from({ length }, (_, i) => (cur?.values[i]?.trim() ? cur.values[i] : (sent.values[i] ?? '')));
  saveDraft(lid, playerId, eventId, { date: sent.date, values, frames: { ...(sent.frames ?? {}), ...(cur?.frames ?? {}) } });
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** El borrador del jugador en ese evento, en vivo (se actualiza al guardar un juego desde cualquier pantalla). */
export function useDraft(lid: string, playerId: string | null | undefined, eventId: string): GameDraft | null {
  const snapshot = useSyncExternalStore(subscribe, () =>
    playerId ? JSON.stringify([readRaw(key(lid, playerId, eventId)), readRaw(legacyKey(lid, playerId))]) : '',
  );
  return useMemo(() => {
    if (!snapshot) return null;
    const [raw, legacyRaw] = JSON.parse(snapshot) as [string | null, string | null];
    return pick(raw, legacyRaw, eventId);
  }, [snapshot, eventId]);
}
