/**
 * Golf: lo que el teléfono anota en el campo antes de que llegue al servidor (sirve los 18 hoyos sin señal).
 *
 * Se guarda en localStorage por cuenta y evento (`mm:golf:<cuenta>:<evento>`): otra cuenta en el mismo
 * teléfono no ve ni manda lo que anotó la anterior. Por hoyo: solo los hoyos que se cambiaron en este teléfono.
 * La pantalla muestra lo del servidor con esto encima. Cada 3 hoyos (o al tocar «Enviar») se publica lo que
 * falta por la cola sin conexión: UNA operación por tarjeta (queueGolfScores), solo de las tarjetas que esta
 * cuenta puede escribir, así una tarjeta rechazada no frena las demás. Cuando el servidor lo confirma el hoyo
 * queda «enviado» y, cuando la lectura del servidor ya lo trae, se borra de aquí. Si el servidor rechaza una
 * tarjeta para siempre (firmada, de otro grupo, ronda cerrada), esos hoyos se quitan de aquí (la operación
 * queda en «no se pudo enviar», para reintentar o copiar) y no se vuelven a armar en cada envío.
 */
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { getUserId } from '../../../lib/data/client';
import { golfScoresQueued, queueGolfScores, type GolfCardDoc, type GolfCardPatch, type GolfHoleWire } from '../../../lib/data/golf';

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
  /** Cuenta dueña de lo anotado (null = sin sesión). */
  uid: string | null;
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

const storageKey = (uid: string | null, eventId: string) => `mm:golf:${uid ?? '-'}:${eventId}`;
const CHANGED = 'mm:golf';

/** La cuenta que está usando la app (la dueña de lo que se anota). */
const currentUid = () => getUserId();

export const emptyLog = (eventId: string, uid: string | null = currentUid()): CourtLog => ({ eventId, uid, holes: {}, hole: null, scope: null, putts: false });

function parse(eventId: string, uid: string | null, raw: string | null): CourtLog {
  if (!raw) return emptyLog(eventId, uid);
  try {
    const v = JSON.parse(raw) as Partial<CourtLog>;
    if (!v || typeof v !== 'object' || typeof v.holes !== 'object' || !v.holes) return emptyLog(eventId, uid);
    return {
      eventId,
      uid,
      holes: v.holes,
      hole: typeof v.hole === 'number' ? v.hole : null,
      scope: typeof v.scope === 'string' ? v.scope : null,
      putts: !!v.putts,
    };
  } catch {
    return emptyLog(eventId, uid);
  }
}

const memory = new Map<string, string>();

function readRaw(uid: string | null, eventId: string): string | null {
  const key = storageKey(uid, eventId);
  try {
    return localStorage.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

/** Lo anotado en este teléfono por esa cuenta (por defecto, la que está usando la app) para el evento. */
export function readLog(eventId: string, uid: string | null = currentUid()): CourtLog {
  return parse(eventId, uid, readRaw(uid, eventId));
}

export function writeLog(log: CourtLog) {
  const key = storageKey(log.uid, log.eventId);
  const raw = JSON.stringify(log);
  memory.set(key, raw);
  try {
    localStorage.setItem(key, raw);
  } catch {
    // sin almacenamiento (modo privado): queda en memoria mientras la app esté abierta
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGED));
}

/** Cambia lo anotado por esa cuenta (se lee y se guarda en el acto). */
function updateLog(eventId: string, uid: string | null, fn: (l: CourtLog) => CourtLog) {
  const cur = readLog(eventId, uid);
  const next = fn(cur);
  if (next !== cur) writeLog(next);
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

/** Todos los hoyos de la tarjeta tal como viajan (la firma lleva la tarjeta que se revisó). */
export const cardWire = (c: Pick<GolfCardDoc, 'strokes' | 'putts' | 'pickedUp'>): GolfHoleWire[] =>
  c.strokes.map((s, i) => ({ i, s: s ?? null, p: c.pickedUp[i] ? null : (c.putts[i] ?? null), u: !!c.pickedUp[i] }));

/** Lo que falta mandar al servidor, por tarjeta (con `canWrite`, solo de las tarjetas que se pueden escribir). */
export function unsentPatches(log: CourtLog, canWrite?: (cardId: string) => boolean): GolfCardPatch[] {
  const out: GolfCardPatch[] = [];
  for (const [cardId, holes] of Object.entries(log.holes)) {
    if (canWrite && !canWrite(cardId)) continue;
    const list = Object.entries(holes)
      .filter(([, h]) => h.sentAt == null)
      .map(([k, h]) => ({ i: Number(k), s: h.s, p: h.p, u: !!h.u }))
      .sort((a, b) => a.i - b.i);
    if (list.length) out.push({ cardId, holes: list });
  }
  return out;
}

/** Hoyos por enviar (para «3 hoyos sin enviar»). */
export const unsentCount = (log: CourtLog, canWrite?: (cardId: string) => boolean) => unsentPatches(log, canWrite).reduce((a, p) => a + p.holes.length, 0);

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
 * El servidor rechazó para siempre lo enviado de una tarjeta: esos hoyos (si no se cambiaron después) salen del
 * teléfono, así no se vuelven a mandar en cada envío. La operación queda en «no se pudo enviar».
 */
export function dropUnsent(log: CourtLog, patch: GolfCardPatch): CourtLog {
  const card = log.holes[patch.cardId];
  if (!card) return log;
  const next = { ...card };
  let changed = false;
  for (const h of patch.holes) {
    const cur = next[String(h.i)];
    if (cur && cur.sentAt == null && sameHole(cur, h)) {
      delete next[String(h.i)];
      changed = true;
    }
  }
  if (!changed) return log;
  const holes = { ...log.holes };
  if (Object.keys(next).length) holes[patch.cardId] = next;
  else delete holes[patch.cardId];
  return { ...log, holes };
}

/**
 * Pone el teléfono al día con lo que trae el servidor: borra los hoyos ENVIADOS que el servidor ya tiene igual,
 * los enviados hace más de 60 s que otro teléfono cambió después (gana el servidor) y los de tarjetas que ya no
 * están. Lo que no se ha enviado se queda siempre (la lectura puede ser la copia vieja guardada en el teléfono),
 * salvo en las tarjetas que `keep` descarta (p. ej. firmadas: ya no las cambia quien no es admin).
 * `cards` vacío = no se sabe (sin datos): no se toca nada.
 */
export function reconcile(log: CourtLog, cards: readonly GolfCardDoc[], now: number, keep?: (c: GolfCardDoc) => boolean): CourtLog {
  if (!cards.length) return log;
  const byId = new Map(cards.map((c) => [c.id, c] as const));
  let changed = false;
  const holes: CourtLog['holes'] = {};
  for (const [cardId, list] of Object.entries(log.holes)) {
    const c = byId.get(cardId);
    if (!c || (keep && !keep(c))) {
      changed = true;
      continue;
    }
    const keepHoles: Record<string, CourtHole> = {};
    for (const [k, h] of Object.entries(list)) {
      const i = Number(k);
      const drop =
        !(i >= 0 && i < c.strokes.length) || (h.sentAt != null && (sameHole(serverHole(c, i), h) || now - h.sentAt > SENT_GRACE_MS));
      if (drop) changed = true;
      else keepHoles[k] = h;
    }
    if (Object.keys(keepHoles).length) holes[cardId] = keepHoles;
    else changed = true;
  }
  return changed ? { ...log, holes } : log;
}

// ---------- Quién escribe qué tarjeta (lo mismo que golf_save_hole_scores) ----------

export interface CardWriter {
  isAdmin: boolean;
  /** Admin o anotador de la liga. */
  staff: boolean;
  /** La tarjeta de la cuenta en la ronda (null = no está inscrita). */
  myCard: Pick<GolfCardDoc, 'id' | 'groupNo'> | null;
}

/**
 * La cuenta puede escribir la tarjeta: el admin cualquiera; firmada, nadie más; el anotador cualquiera; un
 * inscrito la suya y las de su mismo grupo.
 */
export function canWriteCard(c: Pick<GolfCardDoc, 'id' | 'groupNo' | 'signed'>, who: CardWriter): boolean {
  if (who.isAdmin) return true;
  if (c.signed) return false;
  if (who.staff) return true;
  if (!who.myCard) return false;
  return c.id === who.myCard.id || (who.myCard.groupNo != null && c.groupNo === who.myCard.groupNo);
}

/**
 * Manda por la cola lo anotado en este teléfono que falta, una operación por tarjeta y solo de las tarjetas
 * (del servidor) que la cuenta puede escribir. Lo que ya está en la cola igual no se vuelve a encolar (así no
 * pasa detrás de una firma que ya salió). Cada tarjeta se marca enviada con su propia respuesta; si el servidor
 * la rechaza, sus hoyos salen del teléfono. Devuelve la espera (el primer rechazo la hace fallar) o null si no
 * había nada.
 */
export function sendPending(lid: string, eventId: string, cards: readonly GolfCardDoc[], who: CardWriter): Promise<number> | null {
  const uid = currentUid();
  const byId = new Map(cards.map((c) => [c.id, c] as const));
  const writable = (id: string) => {
    const c = byId.get(id);
    return !!c && canWriteCard(c, who);
  };
  const patches = unsentPatches(readLog(eventId, uid), writable).filter((p) => !golfScoresQueued(lid, eventId, p));
  if (!patches.length) return null;
  const waits = queueGolfScores(lid, eventId, patches).map(({ patch, done }) =>
    done.then(
      (n) => {
        updateLog(eventId, uid, (l) => markSent(l, [patch], Date.now()));
        return n;
      },
      (e: unknown) => {
        updateLog(eventId, uid, (l) => dropUnsent(l, patch));
        throw e;
      },
    ),
  );
  const all = Promise.all(waits).then((ns) => ns.reduce((a, b) => a + b, 0));
  all.catch(() => undefined);
  return all;
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

/** Lo anotado en este teléfono por la cuenta que está usando la app para el evento, y cómo cambiarlo (se guarda en el acto). */
export function useCourtLog(eventId: string): [CourtLog, (fn: (l: CourtLog) => CourtLog) => void] {
  const uid = currentUid();
  const snapshot = () => readRaw(uid, eventId) ?? '';
  const raw = useSyncExternalStore(subscribe, snapshot, snapshot);
  const log = useMemo(() => parse(eventId, uid, raw || null), [eventId, uid, raw]);
  const update = useCallback((fn: (l: CourtLog) => CourtLog) => updateLog(eventId, uid, fn), [eventId, uid]);
  return [log, update];
}
