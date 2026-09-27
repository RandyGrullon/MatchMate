/**
 * Publicador del modo cancha: manda el estado del anotador al servidor (publish_match, por la cola) sin gastar
 * el cupo gratis. Nunca por punto:
 * - en los hitos (fin de juego o set, gol, fin de periodo, fin del partido) enseguida, pero con al menos
 *   `minGapMs` (3 s) entre una publicación y otra;
 * - si hubo cambios sin hito, como mucho una vez cada `idleMs` (60 s);
 * - `flush()` publica ya lo pendiente (al terminar, suspender o cuando la app pasa a segundo plano).
 * La primera jugada publica enseguida (el partido aparece «En vivo»). Cada publicación renueva el turno del
 * anotador en el servidor: no hacen falta escrituras aparte.
 */

export interface PublisherOptions<P> {
  /** Lo que hay que publicar ahora (null = nada). `seq` sube con cada cambio (jugada o deshacer). */
  current(): { seq: number; payload: P } | null;
  /** Manda la publicación. Si devuelve una promesa, su resultado llega a `onSent` (o el error a `onError`). */
  send(payload: P, seq: number): Promise<unknown> | void;
  onSent?(seq: number, result: unknown): void;
  onError?(seq: number, error: unknown): void;
  /** Espacio mínimo entre publicaciones por hitos (ms). Por defecto 3000. */
  minGapMs?: number;
  /** Sin hitos, cada cuánto como mucho (ms). Por defecto 60000. */
  idleMs?: number;
  /** `seq` que el servidor ya tiene (no se vuelve a mandar). Por defecto 0. */
  sentSeq?: number;
}

export interface Publisher {
  /** Hubo un cambio (`milestone` = hito del deporte). */
  changed(milestone?: boolean): void;
  /** Publica ya si hay algo sin mandar. Devuelve si mandó. */
  flush(): boolean;
  /** Deja de publicar (otro anotador tomó el control, el partido se cerró). */
  pause(): void;
  resume(): void;
  dispose(): void;
  /** Última `seq` mandada. */
  readonly sentSeq: number;
  /** Cuándo (ms) está programada la próxima publicación, o null. */
  readonly dueAt: number | null;
  readonly paused: boolean;
}

export const MIN_GAP_MS = 3_000;
export const IDLE_MS = 60_000;

export function createPublisher<P>(o: PublisherOptions<P>): Publisher {
  const minGap = o.minGapMs ?? MIN_GAP_MS;
  const idle = o.idleMs ?? IDLE_MS;
  let sentSeq = o.sentSeq ?? 0;
  let lastSentAt = Number.NEGATIVE_INFINITY;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let due: number | null = null;
  let paused = false;
  let disposed = false;

  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    due = null;
  };

  const pending = () => {
    const c = o.current();
    return c && c.seq > sentSeq ? c : null;
  };

  function fire(): boolean {
    clear();
    if (paused || disposed) return false;
    const c = pending();
    if (!c) return false;
    sentSeq = c.seq;
    lastSentAt = Date.now();
    try {
      const p = o.send(c.payload, c.seq);
      if (p && typeof p.then === 'function') {
        p.then(
          (r) => o.onSent?.(c.seq, r),
          (e) => o.onError?.(c.seq, e),
        );
      }
    } catch (e) {
      o.onError?.(c.seq, e);
    }
    return true;
  }

  function schedule(at: number) {
    if (due !== null && due <= at) return;
    clear();
    due = at;
    timer = setTimeout(fire, Math.max(0, at - Date.now()));
  }

  return {
    changed(milestone = false) {
      if (paused || disposed || !pending()) return;
      const now = Date.now();
      const at = Math.max(now, lastSentAt + (milestone ? minGap : idle));
      if (at <= now) fire();
      else schedule(at);
    },
    flush: () => fire(),
    pause() {
      paused = true;
      clear();
    },
    resume() {
      if (disposed) return;
      paused = false;
    },
    dispose() {
      disposed = true;
      clear();
    },
    get sentSeq() {
      return sentSeq;
    },
    get dueAt() {
      return due;
    },
    get paused() {
      return paused;
    },
  };
}
