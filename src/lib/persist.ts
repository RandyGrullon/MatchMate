import type { Backend } from './backend/types';

/**
 * Que el teléfono no borre lo guardado. Sin esto, cuando le falta espacio el navegador puede borrar la copia de
 * las consultas, la cola sin conexión (resultados que todavía no se enviaron) y las fotos por subir.
 *
 * - Se pide una sola vez, después de entrar a la cuenta (antes no: Chrome decide por el uso de la página y
 *   Firefox pregunta, y a quien todavía no entró no hay que preguntarle nada).
 * - Si el navegador ya lo tiene, no se vuelve a pedir. Si dijo que no, se recuerda (localStorage `mm:almacen`) y
 *   no se insiste en cada apertura.
 * - Alternativa si dijo que no: se vuelve a pedir cuando cambia lo que el navegador mira para decidir (instalar
 *   la app, abrirla instalada, permitir los avisos) o a las 2 semanas. Sin localStorage, se pide una vez por sesión.
 *   Sin la API (navegadores viejos) no se hace nada: la app funciona igual.
 */

export type PersistState = 'granted' | 'denied' | 'unsupported';

/** Lo que se recuerda de la última vez que se pidió. */
export interface PersistRecord {
  state: 'granted' | 'denied';
  /** Cuándo (ms). */
  at: number;
  /** Se pidió con la app instalada (abierta desde el ícono). */
  standalone: boolean;
}

/** Lo que usa este módulo del navegador (las pruebas pasan uno de mentira). */
export interface PersistEnv {
  storage: { persist?: () => Promise<boolean>; persisted?: () => Promise<boolean> } | null;
  kv: Pick<Storage, 'getItem' | 'setItem'> | null;
  now: () => number;
  /** La app está abierta instalada (desde el ícono). */
  standalone: () => boolean;
}

export const PERSIST_KEY = 'mm:almacen';

/** Si el navegador dijo que no, se vuelve a pedir a las 2 semanas (Chrome decide por el uso, que va subiendo). */
export const PERSIST_RETRY_MS = 14 * 86_400_000;

export function browserPersistEnv(): PersistEnv {
  const nav = typeof navigator === 'undefined' ? null : navigator;
  let kv: PersistEnv['kv'] = null;
  try {
    kv = typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // almacenamiento bloqueado: se recuerda solo en esta sesión
  }
  return {
    storage: nav?.storage ?? null,
    kv,
    now: () => Date.now(),
    standalone: () => {
      try {
        return (
          (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) ||
          (nav as (Navigator & { standalone?: boolean }) | null)?.standalone === true
        );
      } catch {
        return false;
      }
    },
  };
}

/** Lo recordado en esta sesión (si localStorage no sirve). */
let memory: PersistRecord | null = null;
let inflight: Promise<PersistState> | null = null;

export function readPersistRecord(env: PersistEnv = browserPersistEnv()): PersistRecord | null {
  try {
    const raw = env.kv?.getItem(PERSIST_KEY);
    if (raw) {
      const r = JSON.parse(raw) as Partial<PersistRecord>;
      if ((r.state === 'granted' || r.state === 'denied') && typeof r.at === 'number') return { state: r.state, at: r.at, standalone: r.standalone === true };
    }
  } catch {
    // dañado o bloqueado: vale lo de la sesión
  }
  return memory;
}

function save(env: PersistEnv, r: PersistRecord) {
  memory = r;
  try {
    env.kv?.setItem(PERSIST_KEY, JSON.stringify(r));
  } catch {
    // sin almacenamiento: queda en memoria
  }
}

/** ¿Toca volver a pedirlo? Nunca si ya se tiene; si dijo que no, al abrirla instalada por primera vez o a las 2 semanas. */
export function shouldAsk(r: PersistRecord | null, now: number, standalone: boolean): boolean {
  if (!r) return true;
  if (r.state === 'granted') return false;
  return (standalone && !r.standalone) || now - r.at >= PERSIST_RETRY_MS;
}

/**
 * Pide que el navegador no borre lo guardado. Devuelve cómo quedó. Si ya se está pidiendo, espera esa misma
 * respuesta (nunca dos pedidos a la vez). `force`: pedirlo aunque haya dicho que no hace poco (cuando cambió algo
 * que el navegador mira: se instaló la app, se permitieron los avisos).
 */
export function requestPersistentStorage(opts: { force?: boolean; env?: PersistEnv } = {}): Promise<PersistState> {
  if (inflight) return inflight;
  const env = opts.env ?? browserPersistEnv();
  const run = async (): Promise<PersistState> => {
    const sm = env.storage;
    if (!sm || typeof sm.persist !== 'function') return 'unsupported';
    const now = env.now();
    const standalone = env.standalone();
    // Ya lo tiene (p. ej. la app instalada en Android): no se pide nada.
    let already = false;
    try {
      already = typeof sm.persisted === 'function' && (await sm.persisted()) === true;
    } catch {
      already = false;
    }
    if (already) {
      save(env, { state: 'granted', at: now, standalone });
      return 'granted';
    }
    const last = readPersistRecord(env);
    // Si lo había concedido y ya no lo tiene (se borraron los datos del sitio), se vuelve a pedir de una; si dijo
    // que no, solo cuando toca.
    const lost = last?.state === 'granted';
    if (!lost && !opts.force && !shouldAsk(last, now, standalone)) return 'denied';
    let ok = false;
    try {
      ok = (await sm.persist()) === true;
    } catch {
      ok = false;
    }
    save(env, { state: ok ? 'granted' : 'denied', at: now, standalone });
    return ok ? 'granted' : 'denied';
  };
  const p = run().finally(() => {
    if (inflight === p) inflight = null;
  });
  inflight = p;
  return p;
}

/**
 * Avisa quién entró (el id de la cuenta; null al salir), una vez por cambio: con la sesión guardada al abrir la app
 * y con cada entrada o salida. Lo usan este módulo y la precarga (src/lib/prefetch.ts) desde main.tsx.
 */
export function watchSessionUser(b: Pick<Backend, 'auth'>, cb: (uid: string | null) => void): () => void {
  let alive = true;
  let changed = false;
  let last: string | null | undefined;
  const emit = (uid: string | null) => {
    if (!alive || uid === last) return;
    last = uid;
    cb(uid);
  };
  const off = b.auth.onChange((_event, s) => {
    changed = true;
    emit(s?.userId ?? null);
  });
  b.auth.getSession().then(
    (s) => !changed && emit(s?.userId ?? null),
    () => !changed && emit(null),
  );
  return () => {
    alive = false;
    off();
  };
}

/** Lo que cambia la decisión del navegador: instalar la app y permitir los avisos. Devuelve cómo dejar de escuchar. */
function browserTriggers(retry: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener('appinstalled', retry);
  let perm: PermissionStatus | null = null;
  let stopped = false;
  const onPerm = () => perm?.state === 'granted' && retry();
  try {
    navigator.permissions
      ?.query({ name: 'notifications' as PermissionName })
      .then((p) => {
        if (stopped) return;
        perm = p;
        p.addEventListener('change', onPerm);
      })
      .catch(() => undefined);
  } catch {
    // sin la API de permisos: queda lo de instalar la app y lo de las 2 semanas
  }
  return () => {
    stopped = true;
    window.removeEventListener('appinstalled', retry);
    perm?.removeEventListener('change', onPerm);
  };
}

/**
 * Arranca desde main.tsx: al entrar a la cuenta pide que no se borre lo guardado (una vez) y, si el navegador dijo
 * que no, lo vuelve a pedir cuando se instala la app o se permiten los avisos (solo con una cuenta adentro).
 */
export function startPersistence(
  b: Pick<Backend, 'auth'>,
  opts: { env?: PersistEnv; triggers?: (retry: () => void) => () => void } = {},
): () => void {
  let signedIn = false;
  const ask = (force: boolean) => {
    void requestPersistentStorage({ force, env: opts.env }).catch(() => undefined);
  };
  const offUser = watchSessionUser(b, (uid) => {
    signedIn = !!uid;
    if (uid) ask(false);
  });
  const offTriggers = (opts.triggers ?? browserTriggers)(() => {
    if (signedIn && readPersistRecord(opts.env)?.state !== 'granted') ask(true);
  });
  return () => {
    offUser();
    offTriggers();
  };
}

/** Solo pruebas: olvida lo recordado en memoria. */
export function resetPersistForTests() {
  memory = null;
  inflight = null;
}
