import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BackendError } from '../backend/types';
import { defaultBallDesign, normalizeBallDesign, type BallDesign } from '../ballDesign';
import type { Ball } from '../balls';
import { toIsoDate } from '../format';
import { BALL_DESIGN_INVALID, ballDesignErrorText, ballKeys, fetchMyBalls, saveBall, setBallDesign, type MyBalls } from './balls';
import { queryClient } from './client';
import { flaky, openWorld, type FlakyBackend, type TestWorld } from './testkit';

/**
 * El diseño de una bola contra la base de verdad (PGlite con las migraciones): Ana diseña su bola (se ve enseguida en
 * la lista y queda en la base con su color), la vuelve lisa y, sin señal, la lista vuelve a como estaba. Luis no puede
 * diseñar la de Ana.
 */

let w: TestWorld;
let net: FlakyBackend;
let ana: string;
let phaze: string;

const today = toIsoDate(new Date());

const galaxy: BallDesign = {
  ...defaultBallDesign('#0b1026'),
  pattern: 'galaxia',
  third: '#f0abfc',
  stickers: [
    { shape: 'estrella', color: '#facc15', x: 0, y: 0.45, size: 0.3, rotation: 15 },
    { shape: 'iniciales', text: 'AMP', color: '#ffffff', x: -0.5, y: 0.15, size: 0.25, rotation: 0 },
  ],
};

/** La bola en la lista de la caché (lo que ve la pantalla). */
const cached = (id: string): Ball | undefined => queryClient.getQueryData<MyBalls>(ballKeys.list(ana))?.balls.find((b) => b.id === id);
/** Pone en la caché lo que dice la base (como si la pantalla la hubiera leído). */
const loadList = async () => queryClient.setQueryData(ballKeys.list(ana), await fetchMyBalls());

beforeAll(async () => {
  w = await openWorld();
  await w.signUp('luis@x.com', 'luis');
  ana = await w.signUp('ana@x.com', 'ana');
  net = flaky(w.b);
  w.use(net);
  phaze = await saveBall({ name: 'Phaze II', brand: '', weight: 15, color: '#1d4ed8', cover: null, drilledOn: null, resurfacedOn: null, retired: false }, today);
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

describe('el diseño de una bola (capa de datos)', () => {
  it('se ve enseguida en la lista (con su color) y queda en la base', async () => {
    await loadList();
    expect(cached(phaze)).toMatchObject({ design: null, color: '#1d4ed8' });
    const saving = setBallDesign(phaze, galaxy);
    // Antes de que conteste la base.
    expect(cached(phaze)).toMatchObject({ design: galaxy, color: '#0b1026' });
    expect(await saving).toEqual(galaxy);
    expect(net.calls.filter((c) => c.fn !== 'my_balls')).toEqual([{ fn: 'set_ball_design', args: { p_ball: phaze, p_design: galaxy } }]);
    const saved = (await fetchMyBalls()).balls.find((b) => b.id === phaze);
    expect(saved).toMatchObject({ design: galaxy, color: '#0b1026' });
  });

  it('sale arreglado del teléfono: números redondeados y en su rango', async () => {
    const messy = { ...galaxy, scale: 0.1 + 0.2 + 0.45, angle: 725, stickers: [{ ...galaxy.stickers[0], size: 0.1 + 0.2, rotation: -30 }] };
    const out = await setBallDesign(phaze, messy);
    expect(out).toEqual(normalizeBallDesign(messy));
    expect(out).toMatchObject({ scale: 0.75, angle: 5, stickers: [{ size: 0.3, rotation: 330 }] });
    expect((await fetchMyBalls()).balls.find((b) => b.id === phaze)?.design).toEqual(out);
  });

  it('null lo quita: lisa, con el color que tenía (el de la base del diseño)', async () => {
    await loadList();
    expect(await setBallDesign(phaze, null)).toBeNull();
    expect(cached(phaze)).toMatchObject({ design: null, color: '#0b1026' });
    expect((await fetchMyBalls()).balls.find((b) => b.id === phaze)).toMatchObject({ design: null, color: '#0b1026' });
  });

  it('sin señal: la lista vuelve a como estaba y dice que no hay conexión', async () => {
    await setBallDesign(phaze, galaxy);
    await loadList();
    net.offline = true;
    const err = await setBallDesign(phaze, { ...galaxy, base: '#dc2626', pattern: 'camuflaje' }).catch((e: unknown) => e);
    expect(ballDesignErrorText(err)).toBe('Sin conexión. Prueba otra vez cuando tengas señal.');
    expect(cached(phaze)).toMatchObject({ design: galaxy, color: '#0b1026' });
    net.offline = false;
    expect((await fetchMyBalls()).balls.find((b) => b.id === phaze)?.design).toEqual(galaxy);
  });

  it('Luis no puede diseñar la bola de Ana', async () => {
    await w.as('luis@x.com');
    const err = await setBallDesign(phaze, defaultBallDesign('#16a34a')).catch((e: unknown) => e);
    expect(err).toMatchObject({ kind: 'permission' });
    expect(ballDesignErrorText(err)).toBe('Esa bola no es tuya.');
    await w.as('ana@x.com');
    expect((await fetchMyBalls()).balls.find((b) => b.id === phaze)?.design).toEqual(galaxy);
  });

  it('los errores del diseño, en palabras simples', () => {
    expect(ballDesignErrorText(new BackendError('invalido', 'validation', 'P0001'))).toBe(BALL_DESIGN_INVALID);
    expect(ballDesignErrorText(new BackendError(BALL_DESIGN_INVALID, 'validation', 'invalido'))).toBe(BALL_DESIGN_INVALID);
    expect(ballDesignErrorText(new BackendError('rate_limited', 'rate_limited', 'P0001'))).toBe('Cambiaste tus bolas muchas veces hoy. Prueba mañana.');
    expect(ballDesignErrorText(new BackendError('no_existe', 'not_found', 'P0002'))).toBe('Esa bola ya no existe.');
    expect(ballDesignErrorText(new Error('otra cosa'))).toBe('No se pudo guardar. Prueba otra vez.');
  });
});
