import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SPORT_STATUS } from '../sports/status';
import {
  ACTIVE_SPORT_KEY,
  countBySport,
  getActiveSport,
  homeTarget,
  inSport,
  isHomePath,
  mySportsFirst,
  offeredSports,
  parseActiveSport,
  resetActiveSportForTests,
  setActiveSport,
  sportColor,
  sportFromPath,
  subscribeActiveSport,
  switchTarget,
} from './sportContext';

/** localStorage de mentira (las pruebas corren sin navegador). */
function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
  };
}

const g = globalThis as { localStorage?: unknown };

describe('deporte en que estás: guardado', () => {
  let store: ReturnType<typeof fakeStorage>;
  beforeEach(() => {
    store = fakeStorage();
    g.localStorage = store;
    resetActiveSportForTests();
  });
  afterEach(() => {
    delete g.localStorage;
    resetActiveSportForTests();
  });

  it('sin nada guardado: todos los deportes', () => {
    expect(getActiveSport()).toBeNull();
  });

  it('se guarda en mm:deporte, avisa y se borra con «Todos»', () => {
    let calls = 0;
    const off = subscribeActiveSport(() => calls++);
    setActiveSport('padel');
    expect(getActiveSport()).toBe('padel');
    expect(store.data.get(ACTIVE_SPORT_KEY)).toBe('padel');
    // La próxima apertura sale con la animación del pádel.
    expect(store.data.get('mm:sport')).toBe('padel');
    setActiveSport('padel');
    expect(calls).toBe(1);
    setActiveSport(null);
    expect(getActiveSport()).toBeNull();
    expect(store.data.has(ACTIVE_SPORT_KEY)).toBe(false);
    // En el Home general la próxima apertura sale con la animación genérica, no con la del último deporte.
    expect(store.data.has('mm:sport')).toBe(false);
    expect(calls).toBe(2);
    off();
  });

  it('lo guardado se lee al abrir; un deporte que esta versión no conoce es «Todos»', () => {
    store.data.set(ACTIVE_SPORT_KEY, 'golf');
    expect(getActiveSport()).toBe('golf');
    resetActiveSportForTests();
    store.data.set(ACTIVE_SPORT_KEY, 'curling');
    expect(getActiveSport()).toBeNull();
    setActiveSport('curling');
    expect(getActiveSport()).toBeNull();
  });

  it('sin almacenamiento (o si falla) sigue funcionando en memoria', () => {
    g.localStorage = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
      removeItem: () => {
        throw new Error('bloqueado');
      },
    };
    resetActiveSportForTests();
    expect(getActiveSport()).toBeNull();
    setActiveSport('tennis');
    expect(getActiveSport()).toBe('tennis');
  });
});

describe('deporte en que estás: rutas', () => {
  it('lee el deporte de /d/:sport', () => {
    expect(sportFromPath('/d/padel')).toBe('padel');
    expect(sportFromPath('/d/futsal/')).toBe('futsal');
    expect(sportFromPath('/d/curling')).toBeNull();
    expect(sportFromPath('/ligas')).toBeNull();
    expect(sportFromPath('/')).toBeNull();
    expect(parseActiveSport(42)).toBeNull();
  });

  it('Home: al Home del deporte; otra vez, al de todos (y se quita el deporte)', () => {
    expect(homeTarget('/ligas', 'padel')).toEqual({ to: '/d/padel', clear: false });
    expect(homeTarget('/l/abc', 'padel')).toEqual({ to: '/d/padel', clear: false });
    expect(homeTarget('/d/padel', 'padel')).toEqual({ to: '/', clear: true });
    expect(homeTarget('/d/padel/', 'padel')).toEqual({ to: '/', clear: true });
    // En el Home de otro deporte (link directo): primero al del deporte en que estás.
    expect(homeTarget('/d/golf', 'padel')).toEqual({ to: '/d/padel', clear: false });
    expect(homeTarget('/d/padel', null)).toEqual({ to: '/', clear: false });
    expect(homeTarget('/', null)).toEqual({ to: '/', clear: false });
  });

  it('al elegir en el selector: desde un Home o una liga va al Home elegido; en Eventos se queda', () => {
    expect(switchTarget('/', 'golf')).toBe('/d/golf');
    expect(switchTarget('/d/padel', 'golf')).toBe('/d/golf');
    expect(switchTarget('/l/abc/ranking', 'golf')).toBe('/d/golf');
    expect(switchTarget('/d/padel', null)).toBe('/');
    expect(switchTarget('/ligas', 'golf')).toBeNull();
    expect(switchTarget('/perfil', null)).toBeNull();
  });

  it('isHomePath', () => {
    expect(isHomePath('/')).toBe(true);
    expect(isHomePath('/d/padel')).toBe(true);
    expect(isHomePath('/d/padel/x')).toBe(false);
    expect(isHomePath('/ligas')).toBe(false);
  });
});

describe('qué deportes se ofrecen', () => {
  // Hoy todos están abiertos; aquí la consola puso casi todos en beta (boliche y pádel abiertos, golf cerrado).
  const beta = Object.fromEntries(Object.keys(DEFAULT_SPORT_STATUS).map((id) => [id, 'beta' as const])) as unknown as typeof DEFAULT_SPORT_STATUS;
  const status = { ...beta, bowling: 'open' as const, padel: 'open' as const, golf: 'closed' as const };

  it('hoy, sin nada en beta: todos a cualquier cuenta', () => {
    const normal = offeredSports({ status: DEFAULT_SPORT_STATUS, isSuper: false });
    expect(normal).toHaveLength(9);
    expect(normal).toEqual(offeredSports({ status: DEFAULT_SPORT_STATUS, isSuper: true }));
    expect(normal[0]).toBe('bowling');
  });

  it('los abiertos; los de beta solo al superadmin', () => {
    expect(offeredSports({ status, isSuper: false })).toEqual(['bowling', 'padel']);
    const all = offeredSports({ status, isSuper: true });
    expect(all).toContain('tennis');
    expect(all).not.toContain('golf');
    expect(all[0]).toBe('bowling');
  });

  it('también en los que ya tengo ligas, los que tienen públicas y el activo, aunque estén en beta o cerrados', () => {
    const list = offeredSports({ status, isSuper: false, mine: ['golf'], visible: ['swimming'], active: 'basketball' });
    expect(list).toEqual(['bowling', 'padel', 'basketball', 'golf', 'swimming']);
  });

  it('cuenta las ligas por deporte (sin deporte = boliche) y filtra', () => {
    const leagues = [
      { id: 'a', sport: 'padel' },
      { id: 'b', sport: null },
      { id: 'c', sport: 'padel' },
      { id: 'd' },
    ];
    expect(countBySport(leagues)).toEqual({ padel: 2, bowling: 2 });
    expect(leagues.filter(inSport('padel')).map((l) => l.id)).toEqual(['a', 'c']);
    expect(leagues.filter(inSport(null))).toHaveLength(4);
  });

  it('mis deportes primero (más ligas antes), después los demás en su orden', () => {
    expect(mySportsFirst(['bowling', 'padel', 'tennis', 'golf'], { golf: 1, padel: 3 })).toEqual(['padel', 'golf', 'bowling', 'tennis']);
  });

  it('color del deporte: el boliche y «Todos» usan el de la app', () => {
    expect(sportColor('padel')).toMatch(/^#/);
    expect(sportColor('bowling')).toBeNull();
    expect(sportColor(null)).toBeNull();
  });
});
