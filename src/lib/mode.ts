import { asBackendError } from './db/errors';
import { queryClient, rpc } from './data/client';
import { keys } from './data/keys';

/**
 * El modo de la app (rediseño «Calma y foco», «como Binance»): Lite trae solo lo esencial (lo de hoy, anotar, tu
 * promedio y tus fechas) y Pro, todo (aprobar juegos, la planilla, la tabla completa, estadísticas y Excel). Es la misma
 * app con más o menos detalle: el modo no da ni quita permisos, solo muestra u oculta secciones (<ProOnly>, <LiteOnly>).
 *
 * Dónde vive:
 * - En el teléfono, por cuenta (`mm:modo:<cuenta>`), al momento: el cambio se ve de una vez, con o sin señal.
 * - En la cuenta (profiles.ui_mode, 20261007000100_modo_app.sql), para que salga igual en todos sus teléfonos: se lee
 *   con el perfil (fetchProfile en auth.tsx, `profile.uiMode`) y se guarda con set_ui_mode. Si la base todavía no lo
 *   tiene (la app salió antes que la migración: PGRST202, 42883, 42703) o no hay señal, se queda el del teléfono, sin
 *   avisar ningún error, y se vuelve a intentar la próxima vez que se abra la app. No pasa por la cola de sin conexión:
 *   no es algo que se pueda perder.
 *
 * Aquí va lo que no depende de la pantalla; los hooks (useMode, useIsPro) están en src/lib/useMode.ts.
 */

export type UiMode = 'lite' | 'pro';

/** Sin elegir: Lite (a quien organiza una liga se le sugiere Pro, sin cambiárselo). */
export const DEFAULT_MODE: UiMode = 'lite';

/** Lo que viene de la base o del teléfono → 'lite' | 'pro'; cualquier otra cosa, null. */
export function toUiMode(raw: unknown): UiMode | null {
  return raw === 'lite' || raw === 'pro' ? raw : null;
}

/** El modo guardado en el teléfono. `synced` = la cuenta ya lo tiene (si no, falta mandarlo). */
export interface LocalMode {
  mode: UiMode;
  /** Cuándo se eligió (ms). */
  at: number;
  synced: boolean;
}

/**
 * Qué modo se usa:
 * 1. El que se eligió en este teléfono y la cuenta todavía no tiene (sin señal, o la base sin la columna): manda.
 * 2. El de la cuenta ('lite' | 'pro').
 * 3. Si no se sabe el de la cuenta (`undefined`: el perfil no lo trae, base vieja o copia vieja), el del teléfono.
 * 4. Si no, Lite. También cuando la cuenta volvió a «automático» (null) desde otro teléfono.
 */
export function resolveMode(local: LocalMode | null, server: UiMode | null | undefined): UiMode {
  if (local && !local.synced) return local.mode;
  if (server === 'lite' || server === 'pro') return server;
  if (server === undefined && local) return local.mode;
  return DEFAULT_MODE;
}

/** ¿Se le sugiere Pro? A quien es dueño o admin de alguna liga (y al superadmin, que las administra todas). */
export function canSuggestPro(members: readonly { role: string }[] | null | undefined, isSuper = false): boolean {
  return isSuper || !!members?.some((m) => m.role === 'owner' || m.role === 'admin');
}

// ---------- En el teléfono ----------

type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const modeKey = (uid: string) => `mm:modo:${uid}`;

function storage(): KV | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** El modo de esa cuenta en este teléfono; null si no hay, está dañado o no hay almacenamiento. */
export function readLocalMode(uid: string, store: KV | null = storage()): LocalMode | null {
  if (!store) return null;
  try {
    const raw = store.getItem(modeKey(uid));
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<LocalMode> | null;
    const mode = toUiMode(v?.mode);
    if (!mode) return null;
    return { mode, at: typeof v?.at === 'number' && Number.isFinite(v.at) ? v.at : 0, synced: v?.synced === true };
  } catch {
    return null;
  }
}

/** Lo guarda (sin almacenamiento, vale mientras la app esté abierta: ver `localModes`). */
export function writeLocalMode(uid: string, value: LocalMode, store: KV | null = storage()): void {
  try {
    store?.setItem(modeKey(uid), JSON.stringify(value));
  } catch {
    // privado, lleno o bloqueado: queda en memoria
  }
}

// ---------- Lo que comparten todas las pantallas (en memoria) ----------

const localModes = new Map<string, LocalMode | null>();
const listeners = new Set<() => void>();

export function subscribeMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** El modo de esa cuenta en este teléfono (de memoria; la primera vez se lee del almacenamiento). */
export function localModeOf(uid: string | null | undefined, store: KV | null = storage()): LocalMode | null {
  if (!uid) return null;
  if (!localModes.has(uid)) localModes.set(uid, readLocalMode(uid, store));
  return localModes.get(uid) ?? null;
}

/** Cambia el modo del teléfono de una vez: lo guarda y redibuja todas las pantallas. */
export function setLocalMode(uid: string, value: LocalMode, store: KV | null = storage()): void {
  localModes.set(uid, value);
  writeLocalMode(uid, value, store);
  for (const l of listeners) l();
}

// ---------- En la cuenta ----------

/** 'saved' = la cuenta lo tiene; 'local' = se quedó solo en el teléfono (base sin la RPC, sin señal…). */
export type SaveResult = 'saved' | 'local';

/**
 * Manda el modo a la cuenta (set_ui_mode; null = volver a automático). Nunca lanza ni avisa: si la base todavía no
 * tiene la RPC o la columna (PGRST202 / 42883 / 42703), no hay señal o falla por otra cosa, devuelve 'local' y el modo
 * sigue el del teléfono. Si se guardó, pone al día el perfil guardado (`profile.uiMode`) sin volver a leerlo.
 */
export async function saveUiMode(uid: string, mode: UiMode | null): Promise<SaveResult> {
  try {
    const saved = toUiMode(await rpc<unknown>('set_ui_mode', { p_mode: mode }));
    const key = keys.profile(uid);
    const cached = queryClient.getQueryData<{ uiMode?: UiMode | null } | null>(key);
    if (cached) queryClient.setQueryData(key, { ...cached, uiMode: saved });
    return 'saved';
  } catch (e) {
    const err = asBackendError(e);
    console.info('[modo] queda en el teléfono', err?.code ?? err?.kind ?? e);
    return 'local';
  }
}

/** Intentos de mandar el modo a la cuenta en esta sesión (uno por cambio: `cuenta:cuándo`). */
const attempted = new Set<string>();

/**
 * Elige el modo: se ve de una vez (teléfono) y se manda a la cuenta. Si se guardó y nadie lo cambió mientras tanto,
 * queda marcado como sincronizado.
 */
export async function chooseMode(uid: string, mode: UiMode, now = Date.now()): Promise<SaveResult> {
  const pending: LocalMode = { mode, at: now, synced: false };
  setLocalMode(uid, pending);
  attempted.add(`${uid}:${now}`);
  const result = await saveUiMode(uid, mode);
  if (result === 'saved' && localModes.get(uid)?.at === now) setLocalMode(uid, { ...pending, synced: true });
  return result;
}

/**
 * Pone de acuerdo el teléfono y la cuenta cuando el perfil ya se leyó (`server` no es undefined):
 * - lo elegido aquí que la cuenta no tiene se vuelve a mandar (una vez por sesión) y solo queda marcado cuando la
 *   cuenta contesta que lo guardó. Aunque el perfil diga lo mismo no se marca: puede ser la copia guardada en el
 *   teléfono (vieja) y, si se marcara, el perfil nuevo de la base pisaría lo elegido aquí;
 * - si la cuenta tiene otro (elegido en otro teléfono), el teléfono se pone al día.
 * Con la base sin la columna (`undefined`) no hace nada: no tiene sentido llamar a una RPC que no existe.
 */
export function reconcileMode(uid: string, server: UiMode | null | undefined): void {
  if (server === undefined) return;
  const local = localModeOf(uid);
  if (local && !local.synced) {
    const attempt = `${uid}:${local.at}`;
    if (attempted.has(attempt)) return;
    attempted.add(attempt);
    void saveUiMode(uid, local.mode).then((r) => {
      if (r === 'saved' && localModes.get(uid)?.at === local.at) setLocalMode(uid, { ...local, synced: true });
    });
    return;
  }
  if (server && (!local || local.mode !== server)) setLocalMode(uid, { mode: server, at: local?.at ?? 0, synced: true });
}

/** Solo para las pruebas: olvida lo de memoria. */
export function resetModeForTests(): void {
  localModes.clear();
  attempted.clear();
}
