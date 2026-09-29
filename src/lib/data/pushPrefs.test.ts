/**
 * Qué avisos llegan al teléfono (src/lib/data/pushPrefs.ts): de lo que guarda la base a las cuatro categorías, y de
 * punta a punta con la base de verdad (PGlite con las migraciones): el perfil las trae, set_push_prefs las cambia solo
 * para la cuenta que entró y el perfil guardado se pone al día. Si la base todavía no tiene la columna, el perfil se lee
 * igual (sin ellas).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fetchProfile, type AccountProfile } from '../auth';
import { BackendError, type Backend } from '../backend/types';
import { queryClient, select } from './client';
import { keys } from './keys';
import { ALL_PUSH_ON, PUSH_CATEGORIES, setPushPref, toPushPrefs } from './pushPrefs';
import { openWorld, type TestWorld } from './testkit';

describe('de la base a las cuatro categorías', () => {
  it('falta una o no es false: activa', () => {
    expect(toPushPrefs({})).toEqual(ALL_PUSH_ON);
    expect(toPushPrefs(null)).toEqual(ALL_PUSH_ON);
    expect(toPushPrefs([false])).toEqual(ALL_PUSH_ON);
    expect(toPushPrefs({ social: false, liga: 'false', resultados: null, otra: false })).toEqual({ resultados: true, social: false, recordatorios: true, liga: true });
    expect(toPushPrefs({ resultados: false, social: false, recordatorios: false, liga: false })).toEqual({ resultados: false, social: false, recordatorios: false, liga: false });
  });

  it('cada categoría con su nombre y lo que entra, en el orden de la pantalla', () => {
    expect(PUSH_CATEGORIES.map((c) => c.key)).toEqual(['resultados', 'social', 'recordatorios', 'liga']);
    expect(PUSH_CATEGORIES.every((c) => c.label && c.hint.endsWith('.'))).toBe(true);
  });
});

describe('con la base de verdad', () => {
  let w: TestWorld;
  let ana: string;
  let beto: string;

  beforeAll(async () => {
    w = await openWorld();
    beto = await w.signUp('beto@x.com', 'Beto');
    ana = await w.signUp('ana@x.com', 'Ana');
  }, 120_000);

  afterAll(async () => {
    await w.close();
  });

  it('las mismas categorías que la base', async () => {
    const { rows } = await w.b.db.query<{ c: string[] }>('select private.push_categories() as c');
    expect(rows[0].c).toEqual(PUSH_CATEGORIES.map((c) => c.key));
  });

  it('el perfil las trae (todas activas al principio) y set_push_prefs cambia solo las de la cuenta que entró', async () => {
    await w.as('ana@x.com');
    const profile = await fetchProfile(ana);
    expect(profile).toMatchObject({ id: ana, name: 'Ana', pushPrefs: ALL_PUSH_ON });
    queryClient.setQueryData<AccountProfile | null>(keys.profile(ana), profile);

    expect(await setPushPref(ana, 'social', false)).toEqual({ ...ALL_PUSH_ON, social: false });
    // El perfil guardado se pone al día de una vez (la pantalla no espera otra lectura).
    expect(queryClient.getQueryData<AccountProfile | null>(keys.profile(ana))?.pushPrefs).toEqual({ ...ALL_PUSH_ON, social: false });
    expect((await fetchProfile(ana))?.pushPrefs).toEqual({ ...ALL_PUSH_ON, social: false });
    expect(await setPushPref(ana, 'liga', false)).toEqual({ ...ALL_PUSH_ON, social: false, liga: false });
    expect(await setPushPref(ana, 'social', true)).toEqual({ ...ALL_PUSH_ON, liga: false });

    // Otra cuenta cambia las suyas; las de Ana no se tocan (y sin perfil guardado no se inventa uno).
    await w.as('beto@x.com');
    expect(await setPushPref(beto, 'resultados', false)).toEqual({ ...ALL_PUSH_ON, resultados: false });
    expect(queryClient.getQueryData(keys.profile(beto))).toBeUndefined();
    const { rows } = await w.b.db.query<{ id: string; push_prefs: unknown }>('select id, push_prefs from public.profiles order by name');
    expect(rows).toEqual([
      { id: ana, push_prefs: { social: true, liga: false } },
      { id: beto, push_prefs: { resultados: false } },
    ]);
  });

  it('una columna que la base no tiene es 42703; sin push_prefs el perfil se lee igual (sin ellas)', async () => {
    await w.as('ana@x.com');
    await expect(select({ table: 'profiles', columns: 'id,nada', filters: [{ col: 'id', op: 'eq', value: ana }] })).rejects.toMatchObject({ code: '42703' });

    const base = w.b as Backend;
    const reads: string[] = [];
    // La base de antes de 20260929000500: sin la columna push_prefs.
    const old = new Proxy(base, {
      get(target, prop) {
        if (prop === 'select')
          return async (q: { table: string; columns?: string }) => {
            reads.push(q.columns ?? '*');
            if (q.columns?.includes('push_prefs')) throw new BackendError('column profiles.push_prefs does not exist', 'unknown', '42703');
            return target.select(q);
          };
        const v = Reflect.get(target, prop);
        return typeof v === 'function' ? v.bind(target) : v;
      },
    });
    w.use(old);
    try {
      const profile = await fetchProfile(ana);
      expect(profile).toMatchObject({ id: ana, name: 'Ana', adultConfirmedAt: null });
      expect(profile && 'pushPrefs' in profile).toBe(false);
      expect(reads).toEqual(['id,email,name,is_superadmin,adult_confirmed_at,push_prefs', 'id,email,name,is_superadmin,adult_confirmed_at']);
    } finally {
      w.use(base);
    }
  });
});
