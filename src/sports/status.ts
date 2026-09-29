/**
 * Qué deportes están abiertos, en beta o cerrados (tabla `sport_status`, la lee cualquiera, también sin cuenta):
 * - open: cualquiera crea ligas y torneos de ese deporte;
 * - beta: solo el superadmin (lo impone la base en create_league; aquí solo se esconde en la pantalla);
 * - closed: nadie crea nuevas (las que existen siguen).
 *
 * Se guarda una copia en el teléfono para abrir sin señal. Mientras no hay nada, vale lo mismo que dejan las
 * migraciones: todos abiertos (20260929001000_sueltos_logos.sql abrió los que estaban en beta). El superadmin
 * todavía puede poner uno en beta o cerrarlo desde su consola. Una prueba compara las dos cosas.
 */
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { getBackend } from '../lib/backend';
import type { Backend } from '../lib/backend/types';
import { SPORT_IDS, groupSports, isSportId, type SportGroup } from './registry';
import type { SportId } from './types';

export type SportStatus = 'open' | 'beta' | 'closed';
export type SportStatusMap = Record<SportId, SportStatus>;

export const SPORT_STATUS_LABEL: Record<SportStatus, string> = { open: 'Abierto', beta: 'Beta', closed: 'Cerrado' };

/** Lo que dejan las migraciones (sembrado en 20260926000200_schema.sql, abierto en 20260929001000_sueltos_logos.sql). */
export const DEFAULT_SPORT_STATUS: Readonly<SportStatusMap> = Object.fromEntries(SPORT_IDS.map((id) => [id, 'open'])) as SportStatusMap;

const isStatus = (v: unknown): v is SportStatus => v === 'open' || v === 'beta' || v === 'closed';

/**
 * Filas de `sport_status` → estado por deporte. Los deportes que esta versión no conoce se ignoran; los que
 * no vienen (o vienen con un estado raro) se quedan como en `base`.
 */
export function parseSportStatus(rows: readonly unknown[], base: Readonly<SportStatusMap> = DEFAULT_SPORT_STATUS): SportStatusMap {
  const out = { ...base };
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    const { id, status } = row as { id?: unknown; status?: unknown };
    if (isSportId(id) && isStatus(status)) out[id] = status;
  }
  return out;
}

/** ¿Puede crear una liga de un deporte en ese estado? Abierto: todos; beta: el superadmin; cerrado: nadie. */
export function canCreateSport(status: SportStatus | undefined, isSuper: boolean): boolean {
  return status === 'open' || (status === 'beta' && isSuper);
}

/** Deportes que puede crear, en el orden del registro. */
export function creatableSports(map: Readonly<SportStatusMap>, isSuper: boolean): SportId[] {
  return SPORT_IDS.filter((id) => canCreateSport(map[id], isSuper));
}

/** Opciones del selector de deporte: solo lo que puede crear, con el fútbol de campo y sala en un grupo. */
export function sportChoices(map: Readonly<SportStatusMap>, isSuper: boolean): SportGroup[] {
  return groupSports(creatableSports(map, isSuper));
}

/** Deporte que sale marcado en el selector: el boliche si se puede; si no, el primero que se pueda. */
export function preselectedSport(creatable: readonly SportId[]): SportId | null {
  return creatable.includes('bowling') ? 'bowling' : (creatable[0] ?? null);
}

/** Deportes abiertos al público (para los textos de la portada). */
export function openSports(map: Readonly<SportStatusMap>): SportId[] {
  return SPORT_IDS.filter((id) => map[id] === 'open');
}

/** Lee `sport_status` del backend. */
export async function fetchSportStatus(backend: Backend): Promise<SportStatusMap> {
  const rows = await backend.select<{ id: string; status: string }>({ table: 'sport_status', columns: 'id,status', order: [{ col: 'sort_order' }] });
  return parseSportStatus(rows);
}

// ---------- Copia compartida (una sola consulta para toda la app) ----------

export interface SportStatusState {
  status: SportStatusMap;
  /** Todavía no hay nada de la base ni guardado (se muestra lo de por defecto). */
  loading: boolean;
  error: Error | null;
  /** Lo que se ve es la copia del teléfono y la base todavía no lo confirmó. */
  fromCache: boolean;
  /** Cuándo llegó de la base (ms); 0 = nunca. */
  at: number;
}

export interface SportStatusStore {
  getState(): SportStatusState;
  subscribe(listener: () => void): () => void;
  /** Vuelve a leer de la base (una sola consulta a la vez). */
  refresh(): Promise<void>;
  /** Lee de la base si lo que hay tiene más de `staleMs`. */
  ensureFresh(): void;
}

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

export interface SportStatusStoreOptions {
  backend?: () => Backend;
  /** Dónde guardar la copia (por defecto localStorage si existe; null = no guardar). */
  storage?: KeyValueStorage | null;
  now?: () => number;
  /** Cuánto vale lo leído antes de volver a pedirlo (por defecto 5 min). */
  staleMs?: number;
}

export const SPORT_STATUS_KEY = 'mm:sport-status';
const STALE_MS = 5 * 60_000;

function defaultStorage(): KeyValueStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function createSportStatusStore(opts: SportStatusStoreOptions = {}): SportStatusStore {
  const backend = opts.backend ?? getBackend;
  const storage = opts.storage === undefined ? defaultStorage() : opts.storage;
  const now = opts.now ?? Date.now;
  const staleMs = opts.staleMs ?? STALE_MS;
  const listeners = new Set<() => void>();
  let inflight: Promise<void> | null = null;
  let state: SportStatusState = { status: { ...DEFAULT_SPORT_STATUS }, loading: true, error: null, fromCache: false, at: 0 };

  // Copia guardada: sirve para abrir sin señal, pero se vuelve a pedir enseguida (at = 0).
  try {
    const saved = storage?.getItem(SPORT_STATUS_KEY);
    const parsed: unknown = saved ? JSON.parse(saved) : null;
    if (parsed && typeof parsed === 'object') {
      const rows = Object.entries(parsed as Record<string, unknown>).map(([id, status]) => ({ id, status }));
      state = { ...state, status: parseSportStatus(rows), loading: false, fromCache: true };
    }
  } catch {
    // copia dañada o sin almacenamiento: se usa lo de por defecto
  }

  const set = (patch: Partial<SportStatusState>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  };

  function refresh(): Promise<void> {
    inflight ??= (async () => {
      try {
        const status = await fetchSportStatus(backend());
        set({ status, loading: false, error: null, fromCache: false, at: now() });
        try {
          storage?.setItem(SPORT_STATUS_KEY, JSON.stringify(status));
        } catch {
          // sin almacenamiento: solo en memoria
        }
      } catch (e) {
        // Sin señal: se queda lo que había (guardado o por defecto) y se vuelve a probar la próxima vez.
        set({ loading: false, error: e instanceof Error ? e : new Error(String(e)) });
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refresh,
    ensureFresh() {
      if (!inflight && (state.at === 0 || now() - state.at > staleMs)) void refresh();
    },
  };
}

let shared: SportStatusStore | null = null;
const sharedStore = () => (shared ??= createSportStatusStore());

/** Vuelve a leer sport_status (p. ej. después de que el superadmin abre o cierra un deporte). */
export const refreshSportStatus = (): Promise<void> => sharedStore().refresh();

/** Solo pruebas: usar otra copia compartida (null = la de siempre, creada de nuevo). */
export function setSportStatusStoreForTests(store: SportStatusStore | null): void {
  shared = store;
}

export interface SportStatusResult extends SportStatusState {
  /** ¿Esta cuenta puede crear ligas de ese deporte? */
  canCreate(sport: SportId): boolean;
  /** Los que puede crear, en orden. */
  creatable: SportId[];
  /** Grupos para el selector (fútbol de campo y sala juntos). */
  choices: SportGroup[];
}

/**
 * Estado de cada deporte y qué puede crear esta cuenta (`isSuper` = superadmin: también los de beta).
 * Lee la base al montar si lo que hay tiene más de 5 minutos.
 */
export function useSportStatus(isSuper = false): SportStatusResult {
  const store = sharedStore();
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  useEffect(() => store.ensureFresh(), [store]);
  return useMemo(() => {
    const creatable = creatableSports(state.status, isSuper);
    return {
      ...state,
      canCreate: (sport: SportId) => canCreateSport(state.status[sport], isSuper),
      creatable,
      choices: groupSports(creatable),
    };
  }, [state, isSuper]);
}
