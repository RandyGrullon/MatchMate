/**
 * El modo de la app (src/lib/mode.ts): Lite por defecto, la elección se ve al momento (teléfono) y se manda a la cuenta
 * cuando se puede. Si la base todavía no tiene set_ui_mode o no hay señal, se queda el del teléfono sin avisar nada.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendError } from './backend/types';

const data = vi.hoisted(() => ({
  rpc: vi.fn<(fn: string, args?: Record<string, unknown>) => Promise<unknown>>(),
  cache: new Map<string, unknown>(),
}));

vi.mock('./data/client', () => ({
  rpc: data.rpc,
  queryClient: {
    getQueryData: (k: string) => data.cache.get(k),
    setQueryData: (k: string, v: unknown) => data.cache.set(k, v),
  },
}));

const {
  DEFAULT_MODE,
  canSuggestPro,
  chooseMode,
  localModeOf,
  modeKey,
  readLocalMode,
  reconcileMode,
  resetModeForTests,
  resolveMode,
  saveUiMode,
  setLocalMode,
  toUiMode,
  writeLocalMode,
} = await import('./mode');

function memory() {
  const m = new Map<string, string>();
  return {
    map: m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

let store: ReturnType<typeof memory>;
beforeEach(() => {
  resetModeForTests();
  data.rpc.mockReset();
  data.cache.clear();
  store = memory();
  vi.stubGlobal('localStorage', store);
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('qué modo se usa', () => {
  it('solo lite o pro (en minúsculas); lo demás no cuenta', () => {
    expect(toUiMode('lite')).toBe('lite');
    expect(toUiMode('pro')).toBe('pro');
    for (const raw of ['Pro', 'PRO', '', null, undefined, 1, {}, 'basico']) expect(toUiMode(raw)).toBeNull();
  });

  it('Lite por defecto: sin nada elegido, o cuando la cuenta volvió a automático (null)', () => {
    expect(DEFAULT_MODE).toBe('lite');
    expect(resolveMode(null, undefined)).toBe('lite');
    expect(resolveMode(null, null)).toBe('lite');
    expect(resolveMode({ mode: 'pro', at: 1, synced: true }, null)).toBe('lite');
  });

  it('lo elegido aquí que la cuenta todavía no tiene manda (sin señal o base sin la columna)', () => {
    expect(resolveMode({ mode: 'pro', at: 1, synced: false }, 'lite')).toBe('pro');
    expect(resolveMode({ mode: 'lite', at: 1, synced: false }, 'pro')).toBe('lite');
    expect(resolveMode({ mode: 'pro', at: 1, synced: false }, null)).toBe('pro');
  });

  it('si no, el de la cuenta (lo eligió en otro teléfono); sin saber el de la cuenta, el del teléfono', () => {
    expect(resolveMode({ mode: 'lite', at: 1, synced: true }, 'pro')).toBe('pro');
    expect(resolveMode(null, 'pro')).toBe('pro');
    expect(resolveMode({ mode: 'pro', at: 1, synced: true }, undefined)).toBe('pro');
  });

  it('se sugiere Pro a quien es dueño o admin de alguna liga (o superadmin), no a jugadores ni anotadores', () => {
    expect(canSuggestPro([{ role: 'member' }, { role: 'owner' }])).toBe(true);
    expect(canSuggestPro([{ role: 'admin' }])).toBe(true);
    expect(canSuggestPro([{ role: 'member' }, { role: 'member' }])).toBe(false);
    expect(canSuggestPro([])).toBe(false);
    expect(canSuggestPro(undefined)).toBe(false);
    expect(canSuggestPro([], true)).toBe(true);
  });
});

describe('en el teléfono', () => {
  it('por cuenta; lo dañado o raro no cuenta', () => {
    const s = memory();
    expect(readLocalMode('u1', s)).toBeNull();
    writeLocalMode('u1', { mode: 'pro', at: 5, synced: false }, s);
    expect(s.map.get(modeKey('u1'))).toBe('{"mode":"pro","at":5,"synced":false}');
    expect(readLocalMode('u1', s)).toEqual({ mode: 'pro', at: 5, synced: false });
    expect(readLocalMode('u2', s)).toBeNull();
    s.setItem(modeKey('u1'), '{roto');
    expect(readLocalMode('u1', s)).toBeNull();
    s.setItem(modeKey('u1'), '{"mode":"Pro"}');
    expect(readLocalMode('u1', s)).toBeNull();
    s.setItem(modeKey('u1'), '{"mode":"lite"}');
    expect(readLocalMode('u1', s)).toEqual({ mode: 'lite', at: 0, synced: false });
  });

  it('sin almacenamiento (privado o bloqueado) no falla: vale mientras la app esté abierta', () => {
    const broken = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
    };
    expect(readLocalMode('u1', broken)).toBeNull();
    expect(() => writeLocalMode('u1', { mode: 'pro', at: 1, synced: false }, broken)).not.toThrow();
    expect(readLocalMode('u1', null)).toBeNull();
    setLocalMode('u1', { mode: 'pro', at: 1, synced: false }, broken);
    expect(localModeOf('u1', broken)).toEqual({ mode: 'pro', at: 1, synced: false });
  });
});

describe('elegir el modo', () => {
  it('se ve al momento, queda en el teléfono y se manda a la cuenta (el perfil guardado se pone al día)', async () => {
    data.cache.set('profile:u1', { id: 'u1', name: 'Ana', uiMode: null });
    let answer!: (v: unknown) => void;
    data.rpc.mockReturnValueOnce(new Promise((r) => (answer = r)));
    const done = chooseMode('u1', 'pro', 100);
    // Antes de que conteste la base ya está en Pro (pendiente de mandar).
    expect(localModeOf('u1')).toEqual({ mode: 'pro', at: 100, synced: false });
    expect(JSON.parse(store.getItem(modeKey('u1'))!)).toEqual({ mode: 'pro', at: 100, synced: false });
    expect(data.rpc).toHaveBeenCalledWith('set_ui_mode', { p_mode: 'pro' });
    answer('pro');
    expect(await done).toBe('saved');
    expect(localModeOf('u1')).toEqual({ mode: 'pro', at: 100, synced: true });
    expect(data.cache.get('profile:u1')).toEqual({ id: 'u1', name: 'Ana', uiMode: 'pro' });
  });

  it('base sin la RPC (PGRST202), sin la columna (42703) o sin señal: se queda en el teléfono, sin lanzar ni avisar', async () => {
    const errors = [
      new BackendError('Could not find the function public.set_ui_mode(p_mode) in the schema cache', 'not_found', 'PGRST202'),
      new BackendError('function public.set_ui_mode(text) does not exist', 'not_found', '42883'),
      new BackendError('column "ui_mode" of relation "profiles" does not exist', 'validation', '42703'),
      new BackendError('Failed to fetch', 'network'),
      new TypeError('Failed to fetch'),
    ];
    const error = vi.spyOn(console, 'error');
    for (const [i, e] of errors.entries()) {
      data.rpc.mockRejectedValueOnce(e);
      expect(await chooseMode('u1', i % 2 ? 'lite' : 'pro', 200 + i)).toBe('local');
      expect(localModeOf('u1')).toEqual({ mode: i % 2 ? 'lite' : 'pro', at: 200 + i, synced: false });
    }
    expect(error).not.toHaveBeenCalled();
    // Sin perfil guardado no se inventa uno.
    expect(data.cache.size).toBe(0);
  });

  it('si se cambia otra vez mientras la base contesta, no se marca lo viejo como guardado', async () => {
    let answer!: (v: unknown) => void;
    data.rpc.mockReturnValueOnce(new Promise((r) => (answer = r))).mockResolvedValueOnce('lite');
    const first = chooseMode('u1', 'pro', 1);
    await chooseMode('u1', 'lite', 2);
    answer('pro');
    await first;
    expect(localModeOf('u1')).toEqual({ mode: 'lite', at: 2, synced: true });
  });

  it('saveUiMode con null vuelve a automático', async () => {
    data.rpc.mockResolvedValueOnce(null);
    expect(await saveUiMode('u1', null)).toBe('saved');
    expect(data.rpc).toHaveBeenCalledWith('set_ui_mode', { p_mode: null });
  });
});

describe('teléfono y cuenta de acuerdo (al leer el perfil)', () => {
  it('con la base sin la columna (undefined) no llama a nada', async () => {
    setLocalMode('u1', { mode: 'pro', at: 1, synced: false });
    reconcileMode('u1', undefined);
    await flush();
    expect(data.rpc).not.toHaveBeenCalled();
    expect(localModeOf('u1')?.synced).toBe(false);
  });

  it('lo elegido aquí que la cuenta no tiene se vuelve a mandar, una sola vez por sesión', async () => {
    setLocalMode('u1', { mode: 'pro', at: 7, synced: false });
    data.rpc.mockRejectedValueOnce(new BackendError('Failed to fetch', 'network'));
    reconcileMode('u1', 'lite');
    reconcileMode('u1', 'lite');
    await flush();
    expect(data.rpc).toHaveBeenCalledTimes(1);
    expect(localModeOf('u1')).toEqual({ mode: 'pro', at: 7, synced: false });

    // Otra sesión (la app se abrió de nuevo): se intenta otra vez y queda guardado.
    resetModeForTests();
    data.rpc.mockResolvedValueOnce('pro');
    reconcileMode('u1', 'lite');
    await flush();
    expect(data.rpc).toHaveBeenCalledTimes(2);
    expect(localModeOf('u1')).toEqual({ mode: 'pro', at: 7, synced: true });
  });

  it('si la cuenta ya lo tiene, solo se marca; si eligió otro en otro teléfono, este se pone al día', async () => {
    setLocalMode('u1', { mode: 'pro', at: 3, synced: false });
    reconcileMode('u1', 'pro');
    expect(localModeOf('u1')).toEqual({ mode: 'pro', at: 3, synced: true });
    reconcileMode('u1', 'lite');
    expect(localModeOf('u1')).toEqual({ mode: 'lite', at: 3, synced: true });
    // Sin nada en el teléfono, se copia el de la cuenta.
    reconcileMode('u2', 'pro');
    expect(localModeOf('u2')).toEqual({ mode: 'pro', at: 0, synced: true });
    await flush();
    expect(data.rpc).not.toHaveBeenCalled();
  });
});
