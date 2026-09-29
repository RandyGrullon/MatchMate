/**
 * Versión nueva de la app (service worker de vite-plugin-pwa con registerType 'prompt'):
 * - Se pregunta si hay una al volver a la app, al volver la señal y cada 30 minutos: la app puede quedar abierta
 *   días en el teléfono y el navegador solo pregunta al navegar.
 * - Nunca se recarga sola si la cola sin conexión tiene algo por enviar: se muestra el aviso y la persona decide.
 * - Si algo de la cola espera la versión nueva (el servidor ya no tiene esa función o columna), el aviso lo dice.
 *
 * Lo que decide va en funciones puras (con pruebas); PwaPrompts y OutboxIndicator las usan.
 */

/** Cada cuánto se pregunta mientras la app sigue abierta. */
export const UPDATE_CHECK_EVERY_MS = 30 * 60_000;
/** Volver a la app y volver la señal suelen llegar juntos: una sola pregunta por minuto. */
export const UPDATE_CHECK_GAP_MS = 60_000;

export const NEEDS_UPDATE_MESSAGE = 'Hay una versión nueva. Actualiza para enviar lo que tienes pendiente.';

export type UpdatePrompt = 'none' | 'new_version' | 'needs_update';

/**
 * Qué aviso mostrar: primero el de la cola que espera la versión nueva (aunque el service worker todavía no la
 * haya encontrado: el botón la busca), después el de «hay una versión nueva».
 */
export function updatePrompt(s: { needsUpdate: boolean; newVersion: boolean }): UpdatePrompt {
  if (s.needsUpdate) return 'needs_update';
  return s.newVersion ? 'new_version' : 'none';
}

/**
 * La versión nueva ya tomó el control de la página (la activó esta pestaña u otra). Se recarga ya solo si la persona
 * lo pidió aquí o si la cola está vacía; con algo por enviar, se muestra el aviso y decide ella.
 */
export function reloadOnTakeover(s: { requested: boolean; pending: number }): boolean {
  return s.requested || s.pending === 0;
}

// ---------- Preguntar por la versión nueva ----------

type Target = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

/** Lo que se usa del registro del service worker (ServiceWorkerRegistration). */
export interface UpdatableRegistration extends Partial<Target> {
  update(): Promise<unknown>;
  readonly installing: unknown;
  readonly waiting?: unknown;
}

export interface WatchOptions {
  everyMs?: number;
  gapMs?: number;
  now?: () => number;
  online?: () => boolean;
  /** La app está a la vista (en segundo plano no se gastan datos: al volver se pregunta). */
  visible?: () => boolean;
  /** Dónde escuchar `online` (window) y `visibilitychange` (document); null = no escuchar. */
  win?: Target | null;
  doc?: Target | null;
  /**
   * Quedó esperando (instalada) una versión nueva que no se había avisado. workbox-window, lo que usa useRegisterSW,
   * solo avisa la primera que encuentran estas preguntas: una que aparece más de un minuto después de registrar el
   * service worker la toma por «de otra pestaña» y deja de escuchar (Workbox._onUpdateFound). Con esto, la segunda
   * versión del día también muestra el aviso aunque se haya cerrado el de la primera.
   */
  onWaiting?: () => void;
}

/** Pregunta por la versión nueva al volver a la app, al volver la señal y cada 30 minutos. Devuelve cómo parar. */
export function watchForUpdates(reg: UpdatableRegistration, opts: WatchOptions = {}): () => void {
  const win = opts.win !== undefined ? opts.win : typeof window !== 'undefined' ? window : null;
  const doc = opts.doc !== undefined ? opts.doc : typeof document !== 'undefined' ? document : null;
  const now = opts.now ?? Date.now;
  const online = opts.online ?? (() => typeof navigator === 'undefined' || navigator.onLine !== false);
  const visible = opts.visible ?? (() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  const gapMs = opts.gapMs ?? UPDATE_CHECK_GAP_MS;
  let last = -Infinity;
  let busy = false;
  // La que ya esperaba al empezar la avisa workbox al registrar (wasWaitingBeforeRegister).
  let seen: unknown = reg.waiting ?? null;

  const report = () => {
    const waiting = reg.waiting ?? null;
    if (!waiting || waiting === seen) return;
    seen = waiting;
    opts.onWaiting?.();
  };
  // Una versión nueva (de esta pestaña o de otra): se avisa cuando termina de instalarse.
  const onUpdateFound = () => {
    const sw = reg.installing as (Target & { readonly state?: string }) | null;
    if (!sw || typeof sw.addEventListener !== 'function') return;
    const onState = () => {
      if (sw.state !== 'installed' && sw.state !== 'redundant') return;
      sw.removeEventListener('statechange', onState);
      report();
    };
    sw.addEventListener('statechange', onState);
  };

  const check = () => {
    // Ya está bajando una (installing), sin señal o se preguntó hace nada: no hace falta.
    if (busy || reg.installing || !online() || now() - last < gapMs) return;
    last = now();
    busy = true;
    Promise.resolve()
      .then(() => reg.update())
      .catch(() => undefined) // el servidor no respondió: se pregunta la próxima vez
      .finally(() => {
        busy = false;
        report(); // la instaló otra pestaña, o ya estaba lista al responder
      });
  };
  const whenVisible = () => {
    if (visible()) check();
  };

  win?.addEventListener('online', check);
  doc?.addEventListener('visibilitychange', whenVisible);
  reg.addEventListener?.('updatefound', onUpdateFound);
  const timer = setInterval(whenVisible, opts.everyMs ?? UPDATE_CHECK_EVERY_MS);
  return () => {
    clearInterval(timer);
    win?.removeEventListener('online', check);
    doc?.removeEventListener('visibilitychange', whenVisible);
    reg.removeEventListener?.('updatefound', onUpdateFound);
  };
}

let stopWatching: (() => void) | null = null;

/**
 * Empieza a preguntar (una sola vez por página: se llama al registrar el service worker). `onWaiting`: hay una
 * versión nueva esperando que no se había avisado (para volver a mostrar «Hay una versión nueva»).
 */
export function startUpdateChecks(reg: UpdatableRegistration, onWaiting?: () => void): void {
  stopWatching?.();
  stopWatching = watchForUpdates(reg, { onWaiting });
}

// ---------- Actualizar ----------

let requested = false;

/** La persona tocó «Actualizar» en esta pestaña (la recarga que sigue es la que pidió). */
export const updateRequested = (): boolean => requested;

/** Espera (hasta 8 s) a que termine de instalarse la versión nueva que encontró `update()`. */
function whenInstalled(reg: ServiceWorkerRegistration): Promise<ServiceWorker | null> {
  const sw = reg.installing;
  if (!sw) return Promise.resolve(reg.waiting);
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      resolve(reg.waiting);
    };
    const timer = setTimeout(done, 8000);
    sw.addEventListener('statechange', () => {
      if (sw.state === 'installed' || sw.state === 'redundant') done();
    });
  });
}

/**
 * Busca la versión nueva de la app (service worker) y recarga con ella. Sin service worker (o si no hay
 * nada nuevo todavía), solo recarga: lo nuevo llega igual la próxima vez que abra, y la cola vuelve a intentar
 * lo que esperaba la versión nueva.
 */
export async function updateApp(): Promise<void> {
  requested = true;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.update().catch(() => undefined);
      const waiting = reg.waiting ?? (await whenInstalled(reg));
      if (waiting) {
        navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
        // El service worker de vite-plugin-pwa (registerType 'prompt') espera este mensaje para activarse.
        waiting.postMessage({ type: 'SKIP_WAITING' });
        setTimeout(() => location.reload(), 4000);
        return;
      }
    }
  } catch {
    // sin service worker: recargar basta
  }
  location.reload();
}
