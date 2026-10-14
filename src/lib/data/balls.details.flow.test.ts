import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BALL_CATALOG } from '../ballCatalog';
import type { Ball } from '../balls';
import { toIsoDate } from '../format';
import { ballDetailsErrorText, ballKeys, fetchMyBalls, saveBall, setBallDetails, type MyBalls } from './balls';
import { queryClient } from './client';
import { flaky, openWorld, type FlakyBackend, type TestWorld } from './testkit';

/**
 * El modelo del catálogo y la perforación contra la base de verdad (PGlite con las migraciones,
 * 20261013000100_boliche_equipos_practicas_bolas.sql): Ana le pone a su bola el modelo y el layout (se ve enseguida en
 * la lista y my_balls los trae), los quita, y sin señal la lista vuelve a como estaba. Luis no puede tocar la de Ana.
 */

let w: TestWorld;
let net: FlakyBackend;
let ana: string;
let phaze: string;

const today = toIsoDate(new Date());
const model = BALL_CATALOG[0];
const layout = { drillingAngle: 45, pinToPap: 4.5, valAngle: 30, pinBuffer: 2, notes: 'Dual Angle, mano derecha' };

const cached = (id: string): Ball | undefined => queryClient.getQueryData<MyBalls>(ballKeys.list(ana))?.balls.find((b) => b.id === id);
const loadList = async () => queryClient.setQueryData(ballKeys.list(ana), await fetchMyBalls());
const fromServer = async (id: string) => (await fetchMyBalls()).balls.find((b) => b.id === id);

beforeAll(async () => {
  w = await openWorld();
  await w.signUp('luis@x.com', 'luis');
  ana = await w.signUp('ana@x.com', 'ana');
  net = flaky(w.b);
  w.use(net);
  phaze = await saveBall({ name: model.name, brand: model.brand, weight: 15, color: '#1d4ed8', cover: model.cover, drilledOn: null, resurfacedOn: null, retired: false }, today);
}, 120_000);

beforeEach(() => {
  net.offline = false;
  net.rpcDown = false;
  net.dropReplies = 0;
  net.calls = [];
});

afterAll(async () => {
  await w?.close();
});

describe('el modelo y la perforación de una bola (capa de datos)', () => {
  it('una bola sin nada: my_balls trae catalog y layout en null', async () => {
    expect(await fromServer(phaze)).toMatchObject({ catalog: null, layout: null });
  });

  it('se ven enseguida en la lista y quedan en la base', async () => {
    await loadList();
    const saving = setBallDetails(phaze, model.id, { ...layout, notes: `  ${layout.notes}  ` });
    expect(cached(phaze)).toMatchObject({ catalog: model.id, layout });
    await saving;
    expect(net.calls.filter((c) => c.fn !== 'my_balls')).toEqual([{ fn: 'set_ball_details', args: { p_ball: phaze, p_catalog: model.id, p_layout: layout } }]);
    expect(await fromServer(phaze)).toMatchObject({ catalog: model.id, layout, name: model.name });
  });

  it('solo una parte del layout (lo demás se queda sin poner)', async () => {
    await setBallDetails(phaze, model.id, { drillingAngle: 60, pinToPap: 3.375 });
    expect((await fromServer(phaze))?.layout).toEqual({ drillingAngle: 60, pinToPap: 3.375 });
  });

  it('null quita las dos cosas', async () => {
    await setBallDetails(phaze, null, null);
    expect(await fromServer(phaze)).toMatchObject({ catalog: null, layout: null });
  });

  it('sin señal: la lista vuelve a como estaba y dice que no hay conexión', async () => {
    await setBallDetails(phaze, model.id, layout);
    await loadList();
    net.offline = true;
    const err = await setBallDetails(phaze, null, { drillingAngle: 10 }).catch((e: unknown) => e);
    expect(ballDetailsErrorText(err)).toBe('Sin conexión. Prueba otra vez cuando tengas señal.');
    expect(cached(phaze)).toMatchObject({ catalog: model.id, layout });
    net.offline = false;
    expect(await fromServer(phaze)).toMatchObject({ catalog: model.id, layout });
  });

  it('Luis no puede ponerle nada a la bola de Ana', async () => {
    await w.as('luis@x.com');
    const err = await setBallDetails(phaze, null, null).catch((e: unknown) => e);
    expect(ballDetailsErrorText(err)).toBe('Esa bola no es tuya.');
    await w.as('ana@x.com');
    expect(await fromServer(phaze)).toMatchObject({ catalog: model.id, layout });
  });
});
