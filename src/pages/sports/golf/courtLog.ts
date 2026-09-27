/**
 * Golf: lo que el teléfono anota en el campo antes de que llegue al servidor (sirve los 18 hoyos sin señal).
 *
 * Se guarda en localStorage (`mm:golf:<evento>`) por hoyo: solo los hoyos que se cambiaron en este teléfono.
 * La pantalla muestra lo del servidor con esto encima. Cada 3 hoyos (o al tocar «Enviar») se publica lo que
 * falta por la cola sin conexión (queueGolfScores); cuando el servidor lo confirma el hoyo queda «enviado» y,
 * cuando la lectura del servidor ya lo trae, se borra de aquí.
 */
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { GolfCardDoc, GolfCardPatch } from '../../../lib/data/golf';

/** Un hoyo anotado: golpes, putts y si recogió. */
export interface CourtHole {
  s: number | null;
  p: number | null;
  u: boolean;
  /** Cuándo confirmó el servidor este mismo valor (hora del teléfono, solo para comparar con él mismo). */
  sentAt?: number;
}

export interface CourtLog {
  eventId: string;
  /** tarjeta → índice del hoyo en la tarjeta → lo anotado. */
  holes: Record<string, Record<string, CourtHole>>;
  /** Hoyo que se está anotando (índice en la tarjeta). */
  hole: number | null;
  /** Qué lleva este teléfono: 'g:<grupo>' o 'c:<tarjeta>' (una sola tarjeta, sin grupo). */
  scope: string | null;
  /** Anotar putts. */
  putts: boolean;
}

/** Lo enviado que el servidor ya confirmó pero la lectura todavía no trae: se muestra hasta 60 s. */
const SENT_GRACE_MS = 60_000;

const storageKey = (eventId: string) => `mm:golf:${eventId}`;
const CHANGED = 'mm:golf';

export const emptyLog = (eventId: string): CourtLog => ({ eventId, holes: {}, hole: null, scope: null, putts: false });

function parse(eventId: string, raw: string | null): CourtLog {
  if (!raw) return emptyLog(eventId);
  try {
    const v = JSON.parse(raw) as Partial<CourtLog>;
    if (!v || typeof v !== 'object' || typeof v.holes !== 'object' || !v.holes) return emptyLog(eventId);
    return {
      eventId,
      holes: v.holes,
      hole: typeof v.hole === 'number' ? v.hole : null,
      scope: typeof v.scope === 'string' ? v.scope : null,
      putts: !!v.putts,
    };
  } catch {
    return emptyLog(eventId);
  }
}

const memory = new Map<string, string>();

function readRaw(eventId: string): string | null {
  try {
    return localStorage.getItem(storageKey(eventId)) ?? memory.get(eventId) ?? null;
  } catch {
    return memory.get(eventId) ?? null;
  }
}

export function readLog(eventId: string): CourtLog {
  return parse(eventId, readRaw(eventId));
}

export function writeLog(log: CourtLog) {
  const raw = JSON.stringify(log);
  memory.set(log.eventId, raw);
  try {
    localStorage.setItem(storageKey(log.eventId), raw);
  } catch {
    // sin almacenamiento (modo privado): queda en memoria mientras la app esté abierta
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGED));
}

const sameHole = (a: Pick<CourtHole, 's' | 'p' | 'u'>, b: Pick<CourtHole, 's' | 'p' | 'u'>) => a.s === b.s && a.p === b.p && !!a.u === !!b.u;

/** Anota un hoyo en el teléfono (queda por enviar). */
export function setHole(log: CourtLog, cardId: string, i: number, value: Pick<CourtHole, 's' | 'p' | 'u'>): CourtLog {
  const card = { ...(log.holes[cardId] ?? {}) };
  card[String(i)] = { s: value.s, p: value.u ? null : value.p, u: value.u };
  return { ...log, holes: { ...log.holes, [cardId]: card } };
}

/** El hoyo tal como está en el servidor. */
const serverHole = (c: GolfCardDoc, i: number): CourtHole => ({ s: c.strokes[i] ?? null, p: c.putts[i] ?? null, u: !!c.pickedUp[i] });

/** La tarjeta del servidor con lo anotado en este teléfono encima. */
export function mergeCard(c: GolfCardDoc, log: CourtLog): GolfCardDoc {
  const mine = log.holes[c.id];
  if (!mine || !Object.keys(mine).length) return c;
  const strokes = [...c.strokes];
  const putts = [...c.putts];
  const pickedUp = [...c.pickedUp];
  for (const [k, h] of Object.entries(mine)) {
    const i = Number(k);
    if (!(i >= 0 && i < strokes.length)) continue;
    strokes[i] = h.s;
    putts[i] = h.p;
    pickedUp[i] = h.u;
  }
  return { ...c, strokes, putts, pickedUp };
}

/** Lo que falta mandar al servidor, por tarjeta. */
export function unsentPatches(log: CourtLog): GolfCardPatch[] {
  const out: GolfCardPatch[] = [];
  for (const [cardId, holes] of Object.entries(log.holes)) {
    const list = Object.entries(holes)
      .filter(([, h]) => h.sentAt == null)
      .map(([k, h]) => ({ i: Number(k), s: h.s, p: h.p, u: !!h.u }))
      .sort((a, b) => a.i - b.i);
    if (list.length) out.push({ cardId, holes: list });
  }
  return out;
}

/** Hoyos por enviar (para «3 hoyos sin enviar»). */
export const unsentCount = (log: CourtLog) => unsentPatches(log).reduce((a, p) => a + p.holes.length, 0);

/** El servidor confirmó lo enviado: esos hoyos (si no se cambiaron después) quedan enviados. */
export function markSent(log: CourtLog, sent: readonly GolfCardPatch[], now: number): CourtLog {
  let changed = false;
  const holes = { ...log.holes };
  for (const p of sent) {
    const card = holes[p.cardId];
    if (!card) continue;
    const next = { ...card };
    for (const h of p.holes) {
      const cur = next[String(h.i)];
      if (cur && cur.sentAt == null && sameHole(cur, h)) {
        next[String(h.i)] = { ...cur, sentAt: now };
        changed = true;
      }
    }
    holes[p.cardId] = next;
  }
  return changed ? { ...log, holes } : log;
}

/**
 * Pone el teléfono al día con lo que trae el servidor: borra los hoyos ENVIADOS que el servidor ya tiene igual,
 * los enviados hace más de 60 s que otro teléfono cambió después (gana el servidor) y los de tarjetas que ya no
 * están. Lo que no se ha enviado se queda siempre (la lectura puede ser la copia vieja guardada en el teléfono).
 * `cards` vacío = no se sabe (sin datos): no se toca nada.
 */
export function reconcile(log: CourtLog, cards: readonly GolfCardDoc[], now: number): CourtLog {
  if (!cards.length) return log;
  const byId = new Map(cards.map((c) => [c.id, c] as const));
  let changed = false;
  const holes: CourtLog['holes'] = {};
  for (const [cardId, list] of Object.entries(log.holes)) {
    const c = byId.get(cardId);
    if (!c) {
      changed = true;
      continue;
    }
    const keep: Record<string, CourtHole> = {};
    for (const [k, h] of Object.entries(list)) {
      const i = Number(k);
      const drop =
        !(i >= 0 && i < c.strokes.length) || (h.sentAt != null && (sameHole(serverHole(c, i), h) || now - h.sentAt > SENT_GRACE_MS));
      if (drop) changed = true;
      else keep[k] = h;
    }
    if (Object.keys(keep).length) holes[cardId] = keep;
    else changed = true;
  }
  return changed ? { ...log, holes } : log;
}

// ---------- Hoyos del grupo ----------

/** El hoyo i tiene golpes o «recogió». */
export const holeDone = (c: Pick<GolfCardDoc, 'strokes' | 'pickedUp'>, i: number) => c.strokes[i] != null || !!c.pickedUp[i];

/** Orden en que juega el grupo saliendo del índice `start` (salida simultánea o por el 10). */
export const groupOrder = (holes: number, start: number) => Array.from({ length: holes }, (_, k) => (start + k) % holes);

/** Próximo hoyo (en orden de juego) donde a alguien del grupo le falta anotar. null = todos terminaron. */
export function nextGroupHole(cards: readonly Pick<GolfCardDoc, 'strokes' | 'pickedUp'>[], order: readonly number[], from: number | null = null): number | null {
  const pending = (i: number) => cards.some((c) => !holeDone(c, i));
  if (from != null) {
    const pos = order.indexOf(from);
    const after = [...order.slice(pos + 1), ...order.slice(0, Math.max(pos, 0))];
    const i = after.find(pending);
    if (i != null) return i;
  }
  return order.find(pending) ?? null;
}

/** Hoyos que el grupo ya terminó (todos anotaron). */
export const groupHolesDone = (cards: readonly Pick<GolfCardDoc, 'strokes' | 'pickedUp'>[], holes: number) =>
  cards.length ? Array.from({ length: holes }, (_, i) => i).filter((i) => cards.every((c) => holeDone(c, i))).length : 0;

/** Publicar cada 3 hoyos terminados del grupo, y al terminar la ronda. */
export const shouldPublish = (doneBefore: number, doneAfter: number, holes: number) =>
  doneAfter > doneBefore && (doneAfter % 3 === 0 || doneAfter === holes);

// ---------- En pantalla ----------

function subscribe(cb: () => void) {
  window.addEventListener(CHANGED, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(CHANGED, cb);
    window.removeEventListener('storage', cb);
  };
}

/** Lo anotado en este teléfono para el evento, y cómo cambiarlo (se guarda en el acto). */
export function useCourtLog(eventId: string): [CourtLog, (fn: (l: CourtLog) => CourtLog) => void] {
  const snapshot = () => readRaw(eventId) ?? '';
  const raw = useSyncExternalStore(subscribe, snapshot, snapshot);
  const log = useMemo(() => parse(eventId, raw || null), [eventId, raw]);
  const update = useCallback(
    (fn: (l: CourtLog) => CourtLog) => {
      const cur = readLog(eventId);
      const next = fn(cur);
      if (next !== cur) writeLog(next);
    },
    [eventId],
  );
  return [log, update];
}
