import { useSyncExternalStore } from 'react';
import type { ScanContext } from './scan';
import { ScanError, type ScanRow } from './scan-result';

/**
 * Lectura de fotos del marcador en segundo plano. La lectura sigue aunque se cierre la ventana
 * (mientras la app esté abierta): sin señal espera a que vuelva la conexión y reintenta sola.
 * Quien la pidió puede seguir con lo suyo (enviar sus juegos) y usar el resultado cuando llegue.
 */
export type WaitReason = 'sin-senal' | 'reintento' | 'cupo';

export type ScanJobState =
  | { status: 'leyendo' }
  /** Todavía no se puede leer: sin señal, reintentando tras un fallo o esperando cupo gratis. */
  | { status: 'esperando'; motivo: WaitReason }
  | { status: 'listo'; rows: ScanRow[] }
  | { status: 'error'; message: string };

interface Job {
  state: ScanJobState;
  done: Promise<ScanRow[]>;
  cancelled: boolean;
  /** Corta la espera (de señal o de reintento) al cancelar: la foto no se queda guardada en memoria. */
  wake?: () => void;
}

/** Lo que usa la lectura (se cambia en las pruebas). */
export const scanDeps = {
  scan: async (dataUrl: string, ctx?: ScanContext | null): Promise<ScanRow[]> => (await import('./scan')).scanScoreboard(dataUrl, ctx),
  isOnline: () => typeof navigator === 'undefined' || navigator.onLine !== false,
  untilOnline: () => new Promise<void>((resolve) => window.addEventListener('online', () => resolve(), { once: true })),
  sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
};

/**
 * Reintentos con señal cuando la red falla (esperas crecientes) y cuando se acaba el cupo gratis. Si el servidor
 * dice cuándo volver (retryAfterMs: 8 s entre fotos, el minuto siguiente, lo que diga Google), se espera eso.
 */
const NETWORK_RETRY_MS = [5_000, 15_000, 30_000];
const QUOTA_RETRY_MS = [65_000, 65_000];
const MIN_WAIT_MS = 1_000;
const MAX_WAIT_MS = 5 * 60_000;
/** Lecturas que se recuerdan (las terminadas más viejas se olvidan). */
const MAX_JOBS = 20;

const jobs = new Map<string, Job>();
const listeners = new Set<() => void>();
let seq = 0;

const emit = () => listeners.forEach((l) => l());

function setState(id: string, state: ScanJobState) {
  const job = jobs.get(id);
  if (!job || job.cancelled) return;
  job.state = state;
  emit();
}

/** Qué decir mientras la lectura espera. */
export function waitingText(motivo: WaitReason): string {
  if (motivo === 'sin-senal') return 'Sin señal: la foto se lee sola cuando vuelva la conexión.';
  if (motivo === 'cupo') return 'La IA está ocupada o sin cupo gratis por ahora: se vuelve a intentar sola en un momento.';
  return 'No se pudo leer la foto todavía: se vuelve a intentar sola en unos segundos.';
}

const cancelled = () => new ScanError('Se canceló la lectura de la foto.', 'foto');

/** Espera `wait`, o hasta que se cancele la lectura. */
function pause(job: Job, wait: Promise<void>) {
  return Promise.race([wait, new Promise<void>((resolve) => (job.wake = resolve))]);
}

async function run(id: string, dataUrl: string, background: boolean, ctx: ScanContext | null): Promise<ScanRow[]> {
  const job = jobs.get(id)!;
  let networkFails = 0;
  let quotaFails = 0;
  for (;;) {
    if (job.cancelled) throw cancelled();
    if (!scanDeps.isOnline()) {
      if (!background) throw new ScanError('Sin conexión para escanear la foto.', 'red');
      setState(id, { status: 'esperando', motivo: 'sin-senal' });
      await pause(job, scanDeps.untilOnline());
    }
    if (job.cancelled) throw cancelled();
    setState(id, { status: 'leyendo' });
    try {
      const rows = await scanDeps.scan(dataUrl, ctx);
      if (job.cancelled) throw cancelled();
      setState(id, { status: 'listo', rows });
      return rows;
    } catch (e) {
      if (job.cancelled) throw cancelled();
      const err = e instanceof ScanError ? e : new ScanError('No se pudo escanear la foto.', 'red');
      if (background && err.kind === 'red') {
        // Se cayó la señal: espera a que vuelva (no cuenta como intento).
        if (!scanDeps.isOnline()) continue;
        if (networkFails < NETWORK_RETRY_MS.length) {
          setState(id, { status: 'esperando', motivo: 'reintento' });
          await pause(job, scanDeps.sleep(NETWORK_RETRY_MS[networkFails++]));
          continue;
        }
      }
      if (background && err.kind === 'cupo' && quotaFails < QUOTA_RETRY_MS.length) {
        setState(id, { status: 'esperando', motivo: 'cupo' });
        const wait = err.retryAfterMs != null ? Math.min(MAX_WAIT_MS, Math.max(MIN_WAIT_MS, err.retryAfterMs)) : QUOTA_RETRY_MS[quotaFails];
        quotaFails++;
        await pause(job, scanDeps.sleep(wait));
        continue;
      }
      setState(id, { status: 'error', message: err.message });
      throw err;
    }
  }
}

export interface StartScanOptions {
  /** false = quien está mirando la pantalla (el admin): un solo intento y, si falla, avisa enseguida. */
  background?: boolean;
  /** Liga y evento de la foto: el servidor revisa permisos y cupos con ellos (sin liga no se puede leer). */
  leagueId?: string;
  /** null o sin él = envío por fecha (todavía sin evento). */
  eventId?: string | null;
}

/**
 * Empieza a leer la foto (data URL, o la URL de la foto ya guardada) y devuelve el id de la lectura.
 */
export function startScan(dataUrl: string, { background = true, leagueId, eventId = null }: StartScanOptions = {}): string {
  const id = `lectura-${++seq}`;
  const job: Job = { state: { status: 'leyendo' }, done: Promise.resolve([]), cancelled: false };
  jobs.set(id, job);
  job.done = run(id, dataUrl, background, leagueId ? { leagueId, eventId } : null).catch((e: unknown) => {
    const err = e instanceof ScanError ? e : new ScanError('No se pudo escanear la foto.', 'red');
    setState(id, { status: 'error', message: err.message });
    throw err;
  });
  // El error queda en el estado; quien espera el resultado lo recibe igual.
  job.done.catch(() => undefined);
  for (const [old, j] of jobs) {
    if (jobs.size <= MAX_JOBS) break;
    if (j.cancelled || j.state.status === 'listo' || j.state.status === 'error') jobs.delete(old);
  }
  emit();
  return id;
}

/**
 * Ya no hace falta (se eligió otra foto o se cerró sin enviar): si todavía no se mandó a leer, no se
 * manda (no gasta el cupo gratis que comparten todos en la bolera).
 */
export function cancelScan(id: string | null | undefined) {
  const job = id ? jobs.get(id) : undefined;
  if (!job || job.cancelled || job.state.status === 'listo' || job.state.status === 'error') return;
  job.cancelled = true;
  job.state = { status: 'error', message: 'Se canceló la lectura de la foto.' };
  job.wake?.();
  emit();
}

/** El resultado de la lectura (espera si todavía se está leyendo). Falla con ScanError. */
export function scanDone(id: string): Promise<ScanRow[]> {
  return jobs.get(id)?.done ?? Promise.reject(new ScanError('La lectura de la foto ya no existe.', 'foto'));
}

export function scanState(id: string | null): ScanJobState | null {
  return id ? (jobs.get(id)?.state ?? null) : null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Cómo va la lectura (se actualiza sola). */
export function useScanJob(id: string | null): ScanJobState | null {
  return useSyncExternalStore(subscribe, () => scanState(id));
}
