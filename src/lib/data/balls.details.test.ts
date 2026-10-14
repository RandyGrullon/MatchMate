/**
 * El modelo del catálogo y la perforación de una bola (set_ball_details) sin base: lo que sale del teléfono (limpio y
 * revisado), cómo se ve enseguida en la lista y cómo vuelve si la base dice que no, y lo que trae my_balls. Contra la
 * base de verdad (PGlite) va en balls.flow.test.ts cuando la migración esté.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendError } from '../backend/types';
import type { Ball } from '../balls';

const net = vi.hoisted(() => ({
  uid: 'u-detalles' as string | null,
  calls: [] as { fn: string; args?: Record<string, unknown> }[],
  reply: (_fn: string): unknown => null,
}));

vi.mock('./client', async (orig) => ({
  ...(await orig<typeof import('./client')>()),
  getUserId: () => net.uid,
  rpc: async (fn: string, args?: Record<string, unknown>) => {
    net.calls.push({ fn, args });
    return net.reply(fn);
  },
}));

const { ballDetailsErrorText, ballErrorText, ballKeys, fetchMyBalls, setBallDetails } = await import('./balls');
const { queryClient } = await import('./client');

const ball = (id: string, extra: Partial<Ball> = {}): Ball => ({
  id,
  name: 'Phaze II',
  brand: 'Storm',
  weight: 15,
  color: '#1d4ed8',
  cover: 'solida',
  drilledOn: null,
  resurfacedOn: null,
  retired: false,
  createdAt: null,
  updatedAt: null,
  ...extra,
});

const cached = (id: string) => queryClient.getQueryData<{ balls: Ball[] }>(ballKeys.list('u-detalles'))?.balls.find((b) => b.id === id);

beforeEach(() => {
  net.uid = 'u-detalles';
  net.calls = [];
  net.reply = () => null;
  queryClient.setQueryData(ballKeys.list('u-detalles'), { balls: [ball('a', { catalog: 'storm:phaze-ii', layout: { drillingAngle: 60 } })], lastUsed: null });
});

describe('set_ball_details', () => {
  it('sale limpio (notas recortadas, sin claves vacías) y se ve enseguida en la lista', async () => {
    let during: Ball | undefined;
    net.reply = () => {
      during = cached('a');
      return null;
    };
    await setBallDetails('a', ' Hammer:Black-Widow-2-0 ', { valAngle: 30, drillingAngle: 45, pinToPap: 4.5, notes: '  Dual  ' });
    expect(net.calls).toEqual([
      {
        fn: 'set_ball_details',
        args: { p_ball: 'a', p_catalog: 'hammer:black-widow-2-0', p_layout: { drillingAngle: 45, pinToPap: 4.5, valAngle: 30, notes: 'Dual' } },
      },
    ]);
    // Antes de que conteste la base ya estaba en la lista.
    expect(during).toMatchObject({ catalog: 'hammer:black-widow-2-0', layout: { drillingAngle: 45, pinToPap: 4.5, valAngle: 30, notes: 'Dual' } });
  });

  it('null quita (también una perforación sin nada)', async () => {
    await setBallDetails('a', null, { notes: '   ' });
    expect(net.calls[0].args).toEqual({ p_ball: 'a', p_catalog: null, p_layout: null });
    expect(cached('a')).toMatchObject({ catalog: null, layout: null });
  });

  it('si la base dice que no, la lista vuelve a como estaba', async () => {
    net.reply = () => {
      throw new BackendError('Failed to fetch', 'network', 'network');
    };
    await expect(setBallDetails('a', null, { drillingAngle: 45 })).rejects.toThrow();
    expect(cached('a')).toMatchObject({ catalog: 'storm:phaze-ii', layout: { drillingAngle: 60 } });
  });

  it('lo que no vale no sale del teléfono (con el texto de la hoja)', async () => {
    await expect(setBallDetails('a', null, { drillingAngle: 95 })).rejects.toMatchObject({ kind: 'validation', message: 'El ángulo de perforación va de 0 a 90°.' });
    await expect(setBallDetails('a', null, { pinToPap: 4.3 })).rejects.toMatchObject({ message: 'Del pin al PAP va de 0 a 7″.' });
    await expect(setBallDetails('a', `storm:${'x'.repeat(80)}`, null)).rejects.toMatchObject({ kind: 'validation', message: 'Ese modelo no está en el catálogo.' });
    await expect(setBallDetails('a', 'sin dos puntos', null)).rejects.toMatchObject({ kind: 'validation' });
    expect(net.calls).toEqual([]);
    expect(cached('a')).toMatchObject({ catalog: 'storm:phaze-ii', layout: { drillingAngle: 60 } });
  });

  it('sin sesión no se puede', async () => {
    net.uid = null;
    await expect(setBallDetails('a', null, null)).rejects.toMatchObject({ kind: 'auth' });
    expect(net.calls).toEqual([]);
  });

  it('los errores, en palabras simples (lo que no vale en la base es la perforación)', () => {
    expect(ballErrorText(new BackendError('El ángulo VAL va de 0 a 90°.', 'validation', 'invalido'))).toBe('El ángulo VAL va de 0 a 90°.');
    expect(ballDetailsErrorText(new Error('invalido'))).toMatch(/^Revisa la perforación/);
    expect(ballDetailsErrorText(new BackendError('Failed to fetch', 'network', 'network'))).toBe('Sin conexión. Prueba otra vez cuando tengas señal.');
  });
});

describe('my_balls', () => {
  it('trae el modelo y la perforación de cada bola (limpia; `{}` o sin la clave, null)', async () => {
    net.reply = () => ({
      balls: [
        ball('a', { catalog: 'storm:phaze-ii', layout: { drillingAngle: 45, pinToPap: 4.5, valAngle: 30 } }),
        ball('b', { layout: {} as Ball['layout'] }),
        ball('c'),
      ],
      lastUsed: 'a',
    });
    const mine = await fetchMyBalls();
    expect(mine.balls.map((b) => [b.id, b.catalog, b.layout])).toEqual([
      ['a', 'storm:phaze-ii', { drillingAngle: 45, pinToPap: 4.5, valAngle: 30 }],
      ['b', null, null],
      ['c', null, null],
    ]);
    expect(mine.lastUsed).toBe('a');
  });
});
