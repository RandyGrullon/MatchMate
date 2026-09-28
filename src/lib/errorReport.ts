/**
 * Los errores que pasan en los teléfonos le llegan al dueño de la app (consola del superadmin › Errores).
 *
 * - Qué se reporta: errores de código (`error` de window), promesas sin catch (`unhandledrejection`), pantallas
 *   que no se pudieron dibujar (ErrorBoundary: `render`) y partes de la app que no bajaron (`chunk`: casi siempre
 *   una versión nueva publicada o la señal que se cayó a mitad).
 * - Cómo: la RPC `log_client_error` (supabase/migrations/20260927001500_cuenta.sql) guarda en
 *   `public.client_errors`, que solo lee el superadmin. Pide sesión: sin cuenta, los reportes esperan en memoria
 *   (hasta 10) y salen al entrar. Sin señal esperan a que vuelva.
 * - Topes aquí, además de los de la base (20 por hora por cuenta, 1000 nuevos al día entre todos): los textos se
 *   recortan a lo mismo que guarda la base, el mismo error no se repite en 1 minuto y salen como mucho 10 por visita.
 * - Nada personal: la ruta va sin `?…` ni `#…` y con los códigos de invitación tapados; correos y tokens que
 *   aparezcan en el mensaje o la pila se tapan.
 * - Lo que no sirve no se manda: sin señal, sesión vencida, cuenta bloqueada, demasiado seguido, extensiones del
 *   navegador, «ResizeObserver loop» y «Script error.» sin datos.
 * - Nunca lanza ni se reporta a sí mismo: si mandar falla, el reporte se descarta (o espera, si fue la señal).
 */
import { getBackend } from './backend';
import { isBlockedError, isFetchFailure } from './backend/errors';

export type ClientErrorKind = 'error' | 'promise' | 'render' | 'chunk';

export interface ClientErrorContext {
  /** Pantalla o parte de la app donde pasó (p. ej. 'liga/ranking'). */
  component?: string | null;
  /** La pila de componentes de React (ErrorBoundary). */
  componentStack?: string | null;
  /** Dónde estaba (por defecto, la ruta actual). */
  route?: string | null;
  /** Si el error no trae pila: archivo, línea y columna del evento `error`. */
  where?: string | null;
}

/** Lo que recibe log_client_error. */
export interface ClientErrorReport {
  kind: ClientErrorKind;
  message: string;
  stack: string | null;
  route: string | null;
  component: string | null;
  ua: string | null;
  appVersion: string | null;
}

/** Los mismos largos que guarda la base (client_errors). */
export const ERROR_LIMITS = { message: 500, stack: 4000, route: 200, component: 100, ua: 300, appVersion: 40 } as const;
/** Reportes por visita (hasta recargar la app). */
export const MAX_REPORTS_PER_LOAD = 10;
/** El mismo error (tipo, mensaje y pantalla) no se vuelve a mandar antes de esto. */
export const REPEAT_MS = 60_000;
/** Reportes que esperan sesión o señal. */
export const MAX_WAITING = 10;

// ---------- Del error al reporte (funciones puras) ----------

const CHUNK_ERROR =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|ChunkLoadError|Loading (CSS )?chunk [\w-]+ failed/i;

/** Una parte de la app que no bajó (versión nueva publicada o la señal se cayó a mitad). */
export function isChunkLoadError(e: unknown): boolean {
  const { name, message } = errorParts(e);
  return name === 'ChunkLoadError' || CHUNK_ERROR.test(message);
}

/** Nombre, mensaje y pila de cualquier cosa lanzada (Error, texto, objeto…). */
export function errorParts(e: unknown): { name: string; message: string; stack: string | null } {
  if (e instanceof Error || (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string')) {
    const err = e as { name?: unknown; message: string; stack?: unknown; code?: unknown };
    const name = typeof err.name === 'string' ? err.name : 'Error';
    const code = typeof err.code === 'string' && err.code && !err.message.includes(err.code) ? ` [${err.code}]` : '';
    return { name, message: `${err.message}${code}`, stack: typeof err.stack === 'string' && err.stack ? err.stack : null };
  }
  if (typeof e === 'string') return { name: '', message: e, stack: null };
  if (e === undefined || e === null) return { name: '', message: String(e), stack: null };
  try {
    return { name: '', message: JSON.stringify(e) ?? String(e), stack: null };
  } catch {
    return { name: '', message: String(e), stack: null };
  }
}

/** Tapa correos y tokens (JWT, `Bearer …`, claves `sb_…`) que puedan venir en un mensaje o una pila. */
export function scrub(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '<correo>')
    .replace(/\beyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]{5,}/g, '<token>')
    .replace(/\bBearer\s+[\w.-]+/gi, 'Bearer <token>')
    .replace(/\bsb_(publishable|secret)_[\w-]+/g, 'sb_$1_<clave>');
}

/** La ruta sin `?…` ni `#…` y con el código de invitación tapado (/unirse/:codigo). */
export function cleanRoute(path: string | null | undefined): string | null {
  if (!path) return null;
  const bare = path.split(/[?#]/)[0] || '/';
  return bare.replace(/\/unirse\/[^/]+/i, '/unirse/:codigo').slice(0, ERROR_LIMITS.route);
}

/** Texto recortado; vacío → null. */
const cut = (text: string | null | undefined, max: number): string | null => {
  const t = (text ?? '').trim();
  return t ? t.slice(0, max) : null;
};

const EXTENSION = /(chrome|moz|safari|safari-web|ms-browser)-extension:\/\//i;

/** ¿No vale la pena reportarlo? (sin señal, sesión vencida, bloqueada, ruido del navegador…) */
export function shouldIgnore(e: unknown): boolean {
  const { name, message, stack } = errorParts(e);
  if (isBlockedError(e)) return true;
  const kind = e && typeof e === 'object' && 'kind' in e && typeof (e as { kind: unknown }).kind === 'string' ? (e as { kind: string }).kind : null;
  // BackendError de algo que no es un error de la app: la señal, la sesión o demasiado seguido.
  if (kind === 'network' || kind === 'auth' || kind === 'rate_limited') return true;
  if (name === 'AbortError' || name === 'TimeoutError') return true;
  if (!isChunkLoadError(e) && isFetchFailure(e)) return true;
  if (/ResizeObserver loop/i.test(message)) return true;
  // Error de un script de otro dominio: el navegador no dice nada más.
  if (/^Script error\.?$/i.test(message.trim()) && !stack) return true;
  if (stack && EXTENSION.test(stack)) return true;
  return false;
}

/** El tipo a guardar: si es una parte de la app que no bajó, 'chunk'. */
export function reportKind(kind: ClientErrorKind, e: unknown): ClientErrorKind {
  return isChunkLoadError(e) ? 'chunk' : kind;
}

export interface ReportEnv {
  route: string | null;
  ua: string | null;
  appVersion: string | null;
}

/** El reporte listo para mandar (null = no se manda). */
export function buildReport(kind: ClientErrorKind, e: unknown, ctx: ClientErrorContext = {}, env: ReportEnv = currentEnv()): ClientErrorReport | null {
  if (shouldIgnore(e)) return null;
  const { name, message, stack } = errorParts(e);
  const head = name && name !== 'Error' && !message.startsWith(name) ? `${name}: ${message}` : message;
  const where = ctx.where ? `    at ${ctx.where}` : null;
  const components = ctx.componentStack?.trim() ? `Componentes:\n${ctx.componentStack.replace(/^\s*\n/, '')}` : null;
  const fullStack = [stack ?? where, components].filter(Boolean).join('\n\n');
  return {
    kind: reportKind(kind, e),
    message: cut(scrub(head), ERROR_LIMITS.message) ?? '(sin mensaje)',
    stack: cut(scrub(fullStack), ERROR_LIMITS.stack),
    route: cleanRoute(ctx.route ?? env.route),
    component: cut(ctx.component, ERROR_LIMITS.component),
    ua: cut(env.ua, ERROR_LIMITS.ua),
    appVersion: cut(env.appVersion, ERROR_LIMITS.appVersion),
  };
}

/** Clave para no repetir el mismo error: tipo, mensaje (sin ids ni números) y pantalla. */
export function reportKey(r: Pick<ClientErrorReport, 'kind' | 'message' | 'component'>): string {
  const msg = r.message
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<id>')
    .replace(/[0-9]+/g, '0');
  return `${r.kind}|${msg}|${r.component ?? ''}`;
}

/**
 * Versión de la app: el commit que publicó Vercel (VITE_VERCEL_GIT_COMMIT_SHA) o el nombre del archivo principal
 * (`index-<hash>`, cambia con cada versión). En desarrollo, 'dev'.
 */
export function appVersion(): string | null {
  const sha = String(import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA ?? '').trim();
  if (sha) return sha.slice(0, 12);
  if (typeof document !== 'undefined') {
    const src = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.src ?? '';
    const file = /\/assets\/([\w.-]+?)\.js/.exec(src)?.[1];
    if (file) return file.slice(0, ERROR_LIMITS.appVersion);
  }
  return import.meta.env.DEV ? 'dev' : null;
}

function currentEnv(): ReportEnv {
  let route: string | null = null;
  let ua: string | null = null;
  try {
    route = typeof location !== 'undefined' ? location.pathname : null;
    if (typeof navigator !== 'undefined') {
      const installed = typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches;
      ua = `${navigator.userAgent}${installed ? ' [app instalada]' : ''}`;
    }
  } catch {
    // sin ventana (pruebas, service worker)
  }
  return { route, ua, appVersion: appVersion() };
}

// ---------- Mandar ----------

export interface ReporterDeps {
  /** log_client_error. */
  send(report: ClientErrorReport): Promise<unknown>;
  /** Hay una cuenta con sesión (la RPC la pide). */
  hasSession(): Promise<boolean>;
  now?(): number;
  env?(): ReportEnv;
}

export interface ErrorReporter {
  /** Anota el error y lo manda en cuanto se pueda. Nunca lanza. */
  report(kind: ClientErrorKind, e: unknown, ctx?: ClientErrorContext): void;
  /** Manda lo que espera (al entrar o al volver la señal). */
  flush(): Promise<void>;
  /** Cuántos esperan. */
  waiting(): number;
}

/** El error de mandar fue la señal (el reporte espera) y no la base (se descarta). */
function isNetworkError(e: unknown): boolean {
  const kind = e && typeof e === 'object' && 'kind' in e ? (e as { kind: unknown }).kind : null;
  return kind === 'network' || isFetchFailure(e);
}

export function createErrorReporter(
  deps: ReporterDeps,
  opts: { maxPerLoad?: number; repeatMs?: number; maxWaiting?: number } = {},
): ErrorReporter {
  const maxPerLoad = opts.maxPerLoad ?? MAX_REPORTS_PER_LOAD;
  const repeatMs = opts.repeatMs ?? REPEAT_MS;
  const maxWaiting = opts.maxWaiting ?? MAX_WAITING;
  const now = deps.now ?? Date.now;
  const lastSeen = new Map<string, number>();
  const queue: ClientErrorReport[] = [];
  let accepted = 0;
  let running: Promise<void> | null = null;
  let scheduled = false;

  async function drain(): Promise<void> {
    if (!queue.length) return;
    let session = false;
    try {
      session = await deps.hasSession();
    } catch {
      session = false;
    }
    // Sin cuenta: esperan (salen al entrar).
    if (!session) return;
    while (queue.length) {
      const next = queue[0];
      try {
        await deps.send(next);
        queue.shift();
      } catch (e) {
        // Sin señal: espera a que vuelva. Otro error (bloqueada, tope, dato raro): se descarta.
        if (isNetworkError(e)) return;
        queue.shift();
      }
    }
  }

  function flush(): Promise<void> {
    if (running) return running;
    running = drain()
      .catch(() => undefined)
      .finally(() => {
        running = null;
      });
    return running;
  }

  function report(kind: ClientErrorKind, e: unknown, ctx: ClientErrorContext = {}): void {
    try {
      if (accepted >= maxPerLoad) return;
      const r = buildReport(kind, e, ctx, deps.env ? deps.env() : currentEnv());
      if (!r) return;
      const key = reportKey(r);
      const t = now();
      const last = lastSeen.get(key);
      if (last !== undefined && t - last < repeatMs) return;
      if (queue.length >= maxWaiting) return;
      lastSeen.set(key, t);
      accepted++;
      queue.push(r);
      // Fuera del manejador del error (y una sola vez si llegan varios juntos).
      if (!scheduled) {
        scheduled = true;
        setTimeout(() => {
          scheduled = false;
          void flush();
        }, 0);
      }
    } catch {
      // Reportar nunca rompe nada.
    }
  }

  return { report, flush, waiting: () => queue.length };
}

// ---------- El de la app ----------

let appReporter: ErrorReporter | null = null;

function reporter(): ErrorReporter {
  appReporter ??= createErrorReporter({
    send: (r) =>
      getBackend().rpc('log_client_error', {
        p_kind: r.kind,
        p_message: r.message,
        p_stack: r.stack,
        p_route: r.route,
        p_component: r.component,
        p_ua: r.ua,
        p_app_version: r.appVersion,
      }),
    hasSession: async () => !!(await getBackend().auth.getSession()),
  });
  return appReporter;
}

/** Reporta un error a la consola del superadmin (ErrorBoundary y quien atrape algo que no debería pasar). */
export function reportClientError(kind: ClientErrorKind, e: unknown, ctx?: ClientErrorContext): void {
  reporter().report(kind, e, ctx);
}

let uninstall: (() => void) | null = null;

/**
 * Escucha los errores de toda la app (una sola vez; llamarla otra vez no hace nada). Devuelve cómo dejar de
 * escuchar (pruebas). `target`: window; `reporter` y `watchAuth` para las pruebas.
 */
export function installErrorReporting(opts: { target?: EventTarget; reporter?: ErrorReporter; watchAuth?: boolean } = {}): () => void {
  if (uninstall) return uninstall;
  const target = opts.target ?? (typeof window !== 'undefined' ? window : null);
  if (!target) return () => undefined;
  const rep = opts.reporter ?? reporter();

  const onError = (ev: Event) => {
    const e = ev as Event & { message?: unknown; error?: unknown; filename?: unknown; lineno?: unknown; colno?: unknown };
    // Un <img> o <script> que no cargó también dispara 'error' (sin mensaje): eso no es un error de código.
    if (typeof e.message !== 'string' && e.error === undefined) return;
    const where = typeof e.filename === 'string' && e.filename ? `${e.filename}:${Number(e.lineno) || 0}:${Number(e.colno) || 0}` : null;
    rep.report('error', e.error ?? e.message, { where });
  };
  const onRejection = (ev: Event) => rep.report('promise', (ev as Event & { reason?: unknown }).reason);
  // Vite avisa cuando no pudo bajar una parte de la app antes de abrir una pantalla.
  const onPreload = (ev: Event) => rep.report('chunk', (ev as Event & { payload?: unknown }).payload ?? new Error('Unable to preload CSS or JS'));
  const onOnline = () => void rep.flush();

  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  target.addEventListener('vite:preloadError', onPreload);
  target.addEventListener('online', onOnline);
  // Al entrar a la cuenta salen los que esperaban.
  let offAuth: (() => void) | null = null;
  if (opts.watchAuth !== false) {
    try {
      offAuth = getBackend().auth.onChange((event) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') void rep.flush();
      });
    } catch {
      offAuth = null;
    }
  }

  uninstall = () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
    target.removeEventListener('vite:preloadError', onPreload);
    target.removeEventListener('online', onOnline);
    offAuth?.();
    uninstall = null;
  };
  return uninstall;
}
