/**
 * La bola al anotar un juego suelto (renderToString con las bolas de la cuenta en la caché): sin bolas no sale nada;
 * uno nuevo arranca con la última que usó para todos los juegos; uno que ya existe, con las que tenía cada juego
 * («Varias bolas» y el puntito de color en cada juego); uno guardado sin señal, con las que están en la cola; y si no se
 * saben, no sale.
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ball, BallGame, GameBall } from '../../lib/balls';
import { ballKeys, type MyBalls } from '../../lib/data/balls';
import { queryClient, resetDataClientForTests, setDataUser } from '../../lib/data/client';
import type { SoloSession } from '../../lib/data/solo';
import { FeedbackProvider } from '../feedback';
import { SoloGameSheet } from '../solo/SoloGameSheet';

const UID = 'u-bolas';

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

beforeAll(async () => {
  await setDataUser(UID);
});
afterAll(async () => {
  await resetDataClientForTests();
});
beforeEach(() => {
  queue.balls = {};
});

describe('la bola en la hoja del juego suelto', () => {
  const phaze = ball('a', 'Phaze II', '#1d4ed8');
  const spare = ball('b', 'Spare', '#f8fafc', { weight: 14 });

  it('sin bolas (o todas retiradas) no sale nada', () => {
    seed({ balls: [], lastUsed: null });
    expect(text(render(null))).not.toContain('Sin bola');
    seed({ balls: [ball('v', 'Vieja', '#111827', { retired: true })], lastUsed: 'v' });
    expect(text(render(null))).not.toContain('Sin bola');
  });

  it('uno nuevo: la última que usó para todos los juegos', () => {
    seed({ balls: [phaze, spare], lastUsed: 'b' });
    const out = render(null);
    const t = text(out);
    expect(t).toContain('Sin bola');
    expect(t).toContain('Para todos los juegos.');
    expect(out).toMatch(/<option value="b" selected="">Spare \(14 lb\)<\/option>/);
    expect(out).not.toContain('Varias bolas');
  });

  it('uno que existe: las que tenía cada juego (y los que no tenían, sin bola)', () => {
    seed({ balls: [phaze, spare], lastUsed: 'b' }, [
      { ball: 'a', kind: 'solo', ref: 's1', game: 0, date: '2026-09-20', score: 210, frames: null, counted: true },
      { ball: 'b', kind: 'solo', ref: 's1', game: 2, date: '2026-09-20', score: 190, frames: null, counted: true },
    ]);
    const out = render(session);
    expect(out).toMatch(/<option value="__varias__" disabled="" selected="">Varias bolas<\/option>/);
    // El puntito de color en los juegos con bola (el 2 no tiene).
    expect(out.match(/background-color:#1d4ed8/g)?.length).toBeGreaterThanOrEqual(1);
    expect(out.match(/background-color:#f8fafc/g)?.length).toBeGreaterThanOrEqual(1);
    // Todos con la misma: esa, sin puntitos.
    seed({ balls: [phaze, spare], lastUsed: 'b' }, [0, 1, 2].map((game) => ({ ball: 'a', kind: 'solo', ref: 's1', game, date: '2026-09-20', score: 200, frames: null, counted: true })));
    const same = render(session);
    expect(same).toMatch(/<option value="a" selected="">Phaze II \(15 lb\)<\/option>/);
    expect(same).not.toContain('Varias bolas');
  });

  it('uno guardado sin señal: sus bolas salen de lo que está en la cola, sin leer el servidor', () => {
    seed({ balls: [phaze, spare], lastUsed: 'b' });
    queue.balls = { s2: { 0: 'a', 1: 'b', 2: 'a' } };
    // s2 no está en la caché (no se ha podido leer del servidor).
    const out = render({ ...session, id: 's2', pending: true, local: true });
    expect(out).toMatch(/<option value="__varias__" disabled="" selected="">Varias bolas<\/option>/);
    expect(out.match(/background-color:#f8fafc/g)?.length).toBeGreaterThanOrEqual(1);
  });

  it('sin señal y sin nada en la cola: no se saben sus bolas, así que la bola no sale (guardar no las cambia)', () => {
    seed({ balls: [phaze, spare], lastUsed: 'b' });
    const t = text(render({ ...session, id: 's3' }));
    expect(t).not.toContain('Sin bola');
    expect(t).not.toContain('Para todos los juegos.');
    // Lo de la cola con un número apunta a una bola del servidor: tampoco se sabe.
    queue.balls = { s3: { 0: 0, 1: 2, 2: null } };
    expect(text(render({ ...session, id: 's3' }))).not.toContain('Sin bola');
  });
});
