/**
 * Ritmo de envíos (comentarios, sugerencias) compartido por toda la app: las reglas cuentan por cuenta y
 * por liga, así que aquí también (no por pantalla). Mientras un envío sigue pendiente (sin señal) no se
 * deja mandar otro: al volver la conexión saldrían seguidos y las reglas rechazarían el segundo.
 */
interface State {
  /** Cuándo el servidor aceptó el último envío. */
  last: number;
  pending: Promise<unknown> | null;
}

const states = new Map<string, State>();

export type PaceCheck = { ok: true } | { ok: false; reason: 'pendiente' | 'ritmo'; wait: number };

export function paceCheck(key: string, seconds: number, now = Date.now()): PaceCheck {
  const s = states.get(key);
  if (!s) return { ok: true };
  if (s.pending) return { ok: false, reason: 'pendiente', wait: seconds };
  const left = Math.ceil((s.last + seconds * 1000 - now) / 1000);
  return left > 0 ? { ok: false, reason: 'ritmo', wait: left } : { ok: true };
}

/** Marca un envío en curso; al aceptarlo el servidor empieza a contar la espera. Si falla, se puede reintentar ya. */
export function paceStart(key: string, sending: Promise<unknown>) {
  const s = states.get(key) ?? { last: 0, pending: null };
  s.pending = sending;
  states.set(key, s);
  sending.then(
    () => {
      if (s.pending === sending) s.pending = null;
      s.last = Date.now();
    },
    () => {
      if (s.pending === sending) s.pending = null;
    },
  );
}

/** Solo para pruebas. */
export function resetPace() {
  states.clear();
}
