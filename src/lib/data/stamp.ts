import type { Stamp } from '../types';

/**
 * Horas del servidor. La base manda `created_at` & compañía como texto ISO; las pantallas de BowlingX usan
 * `createdAt.toMillis()` (el Timestamp de Firestore). La caché de consultas se guarda en IndexedDB, que no
 * puede guardar funciones: por eso en la caché las horas van como texto (`Wire<T>`) y se convierten a `Stamp`
 * justo al salir de cada hook (`stamped`), siempre al mismo objeto para los mismos datos.
 */

/** Lo que se guarda en la caché: igual que el tipo de la app, pero con las horas en texto ISO. */
export type Wire<T> = T extends Stamp
  ? string
  : T extends (infer U)[]
    ? Wire<U>[]
    : T extends object
      ? { [K in keyof T]: Wire<T[K]> }
      : T;

class ServerTime implements Stamp {
  readonly ms: number;
  constructor(readonly iso: string) {
    this.ms = Date.parse(iso);
  }
  toMillis() {
    return this.ms;
  }
  toDate() {
    return new Date(this.ms);
  }
  toISOString() {
    return this.iso;
  }
}

/** Hora del servidor (texto ISO) como `Stamp`; null si no hay. */
export function toStamp(iso: string | null | undefined): Stamp | null {
  return typeof iso === 'string' && iso ? new ServerTime(iso) : null;
}

/** Hora ISO de ahora (para lo que se muestra antes de que el servidor lo confirme). */
export const nowIso = () => new Date().toISOString();

const STAMP_KEYS = new Set(['createdAt', 'reviewedAt', 'updatedAt']);
const memo = new WeakMap<object, unknown>();

const isPlain = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

function convert(value: unknown, depth: number): unknown {
  if (depth > 4 || !value || typeof value !== 'object') return value;
  const known = memo.get(value);
  if (known !== undefined) return known;
  let out: unknown = value;
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((v) => {
      const c = convert(v, depth + 1);
      if (c !== v) changed = true;
      return c;
    });
    out = changed ? next : value;
  } else if (isPlain(value)) {
    let next: Record<string, unknown> | null = null;
    for (const [k, v] of Object.entries(value)) {
      const c = STAMP_KEYS.has(k) && typeof v === 'string' ? toStamp(v) : convert(v, depth + 1);
      if (c !== v) (next ??= { ...value })[k] = c;
    }
    out = next ?? value;
  }
  memo.set(value, out);
  return out;
}

/** Datos de la caché → datos de la app (horas como `Stamp`). Mismos datos, mismo objeto (no dispara efectos). */
export function stamped<T>(value: Wire<T>): T {
  return convert(value, 0) as T;
}
