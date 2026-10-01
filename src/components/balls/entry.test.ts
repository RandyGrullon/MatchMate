/**
 * La bola al anotar un juego suelto (renderToString con las bolas de la cuenta en la caché): cada juego tiene su botón
 * con la bola dibujada (también sin bolas: con un + para agregar una) y arriba el de «todos los juegos»; uno nuevo
 * arranca con la última que usó; uno que ya existe, con las que tenía cada juego («Varias bolas» en el de todos); uno
 * guardado sin señal, con las que están en la cola; y si no se saben, no sale.
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ball, BallGame, GameBall } from '../../lib/balls';
import { ballKeys, type MyBalls } from '../../lib/data/balls';
import { queryClient } from '../../lib/data/client';
import type { SoloSession } from '../../lib/data/solo';
import { FeedbackProvider } from '../feedback';
import { SoloGameSheet } from '../solo/SoloGameSheet';

/** La cuenta que entró (sin abrir su cola: aquí no hay servidor). */
const { UID } = vi.hoisted(() => ({ UID: 'u-bolas' }));
vi.mock('../../lib/data/client', async (orig) => ({
  ...(await orig<typeof import('../../lib/data/client')>()),
  getUserId: () => UID,
}));
/** Lo que está en la cola sin salir, por juego suelto (lo lee la hoja con queuedGameBalls). */
const queue = vi.hoisted(() => ({ balls: {} as Record<string, Record<string, GameBall>> }));
vi.mock('../../lib/data/balls', async (orig) => ({
  ...(await orig<typeof import('../../lib/data/balls')>()),
  queuedGameBalls: (_kind: string, ref: string) => queue.balls[ref] ?? null,
}));
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

const ball = (id: string, name: string, color: string, extra: Partial<Ball> = {}): Ball => ({
  id,
  name,
  brand: '',
  weight: 15,
  color,
  cover: null,
  drilledOn: null,
  resurfacedOn: null,
  retired: false,
  createdAt: null,
  updatedAt: null,
  ...extra,
});

const session: SoloSession = {
  id: 's1',
  userId: UID,
  playedOn: '2026-09-20',
  venue: 'Bolera Norte',
  note: '',
  scores: [210, 180, 190],
  frames: null,
  shared: true,
  createdAt: null,
  updatedAt: null,
  likes: 0,
  likedByMe: false,
};

const render = (s: SoloSession | null) =>
  renderToString(h(MemoryRouter, null, h(FeedbackProvider, null, h(SoloGameSheet, { session: s, venues: [], today: '2026-09-28', onClose: () => undefined }))));

const seed = (mine: MyBalls, tags: BallGame[] = []) => {
  queryClient.setQueryData(ballKeys.list(UID), mine);
  queryClient.setQueryData(ballKeys.games(UID, 's1'), tags);
};
const tag = (b: string, game: number): BallGame => ({ ball: b, kind: 'solo', ref: 's1', game, date: '2026-09-20', score: 200, frames: null, counted: true });

/** Lo que dicen los botones de la bola de cada juego, en orden. */
const chips = (html: string) => [...html.matchAll(/aria-label="(Bola del juego \d+: [^"]*)"/g)].map((m) => m[1]);

beforeEach(() => {
  queue.balls = {};
});

describe('la bola en la hoja del juego suelto', () => {
  const phaze = ball('a', 'Phaze II', '#1d4ed8');
  const spare = ball('b', 'Spare', '#f8fafc', { weight: 14 });

  it('sin bolas (o todas retiradas): cada juego tiene su botón con un + para agregar una, y el de todos también', () => {
    for (const mine of [
      { balls: [], lastUsed: null },
      { balls: [ball('v', 'Vieja', '#111827', { retired: true })], lastUsed: 'v' },
    ]) {
      seed(mine);
      const out = render(null);
      expect(chips(out)).toEqual([1, 2, 3].map((n) => `Bola del juego ${n}: sin bola. Toca para agregar una`));
      expect(out).toContain('aria-label="Bola de todos los juegos: sin bola. Toca para agregar una"');
      // Lo mismo que en «Subir mis juegos».
      expect(text(out)).toContain('Bola para todos los juegos');
      expect(text(out)).toContain('Toca la bola de un juego para cambiar solo esa.');
      // Ya no es la lista del teléfono.
      expect(out).not.toContain('<select');
      expect(out).not.toContain('<option');
    }
  });

  it('uno que existe en una cuenta sin bolas: sus juegos, sin bola (no espera a leer sus bolas)', () => {
    queryClient.setQueryData(ballKeys.list(UID), { balls: [], lastUsed: null });
    // Sus bolas no están en la caché (no se piden: sin bolas no tiene ninguna).
    const out = render({ ...session, id: 's9' });
    expect(chips(out)).toEqual([1, 2, 3].map((n) => `Bola del juego ${n}: sin bola. Toca para agregar una`));
  });

  it('uno nuevo: la última que usó en cada juego y en el de todos (dibujada)', () => {
    seed({ balls: [phaze, spare], lastUsed: 'b' });
    const out = render(null);
    const t = text(out);
    expect(chips(out)).toEqual([1, 2, 3].map((n) => `Bola del juego ${n}: Spare (14 lb)`));
    expect(out).toContain('aria-label="Bola de todos los juegos: Spare (14 lb)"');
    expect(t).toContain('Bola para todos los juegos');
    // Dibujada con su diseño (el color de la bola), no un puntito.
    expect(out).toContain('fill="#f8fafc"');
    expect(out).not.toContain('background-color:#f8fafc');
    expect(t).not.toContain('Varias bolas');
    expect(out).not.toContain('<select');
  });

  it('cada botón va debajo de la casilla de su juego y antes de «cuadros»', () => {
    seed({ balls: [phaze, spare], lastUsed: 'b' });
    const out = render(null);
    for (const n of [1, 2, 3]) {
      const input = out.indexOf(`aria-label="Juego ${n}"`);
      const chip = out.indexOf(`aria-label="Bola del juego ${n}:`);
      const frames = out.indexOf(`aria-label="Anotar el juego ${n} por cuadros"`);
      expect(input).toBeGreaterThan(-1);
      expect(chip).toBeGreaterThan(input);
      expect(frames).toBeGreaterThan(chip);
    }
  });

  it('uno que existe: las que tenía cada juego (y los que no tenían, sin bola)', () => {
    seed({ balls: [phaze, spare], lastUsed: 'b' }, [tag('a', 0), tag('b', 2)]);
    const out = render(session);
    expect(chips(out)).toEqual(['Bola del juego 1: Phaze II (15 lb)', 'Bola del juego 2: sin bola', 'Bola del juego 3: Spare (14 lb)']);
    expect(out).toContain('aria-label="Bola de todos los juegos: varias bolas"');
    expect(text(out)).toContain('Varias bolas');
    expect(out).toContain('fill="#1d4ed8"');
    expect(out).toContain('fill="#f8fafc"');
    // Todos con la misma: esa también en el de todos.
    seed({ balls: [phaze, spare], lastUsed: 'b' }, [0, 1, 2].map((game) => tag('a', game)));
    const same = render(session);
    expect(chips(same)).toEqual([1, 2, 3].map((n) => `Bola del juego ${n}: Phaze II (15 lb)`));
    expect(same).toContain('aria-label="Bola de todos los juegos: Phaze II (15 lb)"');
    expect(text(same)).not.toContain('Varias bolas');
  });

  it('uno que existe con menos de tres juegos: la casilla de más arranca con la bola de sus juegos', () => {
    seed({ balls: [phaze, spare], lastUsed: 'b' }, [tag('a', 0), tag('a', 1)]);
    const out = render({ ...session, scores: [210, 180] });
    expect(chips(out)).toEqual([1, 2, 3].map((n) => `Bola del juego ${n}: Phaze II (15 lb)`));
  });

  it('uno guardado sin señal: sus bolas salen de lo que está en la cola, sin leer el servidor', () => {
    seed({ balls: [phaze, spare], lastUsed: 'b' });
    queue.balls = { s2: { 0: 'a', 1: 'b', 2: 'a' } };
    // s2 no está en la caché (no se ha podido leer del servidor).
    const out = render({ ...session, id: 's2', pending: true, local: true });
    expect(chips(out)).toEqual(['Bola del juego 1: Phaze II (15 lb)', 'Bola del juego 2: Spare (14 lb)', 'Bola del juego 3: Phaze II (15 lb)']);
    expect(out).toContain('aria-label="Bola de todos los juegos: varias bolas"');
  });

  it('sin señal y sin nada en la cola: no se saben sus bolas, así que la bola no sale (guardar no las cambia)', () => {
    seed({ balls: [phaze, spare], lastUsed: 'b' });
    const out = render({ ...session, id: 's3' });
    expect(out).not.toContain('Bola del juego');
    expect(out).not.toContain('Bola de todos los juegos');
    expect(text(out)).not.toContain('Bola para todos los juegos');
    // Lo de la cola con un número apunta a una bola del servidor: tampoco se sabe.
    queue.balls = { s3: { 0: 0, 1: 2, 2: null } };
    expect(render({ ...session, id: 's3' })).not.toContain('Bola del juego');
  });
});
