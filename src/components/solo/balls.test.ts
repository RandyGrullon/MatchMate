/**
 * La bola de cada juego en la hoja del juego suelto, en los casos que no salen de la caché (renderToString con las
 * lecturas de mentira): agregar la primera bola ahí mismo no deja los juegos sin su botón mientras se leen sus bolas;
 * sin poder leerlas (sin señal) no sale y dice por qué; sin cuenta o sin leer la lista, no sale; y los botones no se
 * confunden con las casillas de los juegos.
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ball } from '../../lib/balls';
import { ballKeys } from '../../lib/data/balls';
import { queryClient } from '../../lib/data/client';
import type { SoloSession } from '../../lib/data/solo';
import type { BallChoice } from '../balls/BallPicker';
import { FeedbackProvider } from '../feedback';
import { SoloGameSheet } from './SoloGameSheet';

/** La cuenta que entró, lo que dice useBallChoice (null = el de verdad) y si leer las bolas de sus juegos falló. */
const fake = vi.hoisted(() => ({ uid: 'u-suelto' as string | null, choice: null as BallChoice | null, gamesError: null as Error | null }));
vi.mock('../../lib/data/client', async (orig) => ({
  ...(await orig<typeof import('../../lib/data/client')>()),
  getUserId: () => fake.uid,
}));
vi.mock('../../lib/data/balls', async (orig) => {
  const real = await orig<typeof import('../../lib/data/balls')>();
  return {
    ...real,
    queuedGameBalls: () => null,
    useMyBallGames: (ref?: string | null, enabled?: boolean) =>
      fake.gamesError ? { data: [], loading: false, error: fake.gamesError } : real.useMyBallGames(ref, enabled),
  };
});
vi.mock('../balls/BallPicker', async (orig) => {
  const real = await orig<typeof import('../balls/BallPicker')>();
  return { ...real, useBallChoice: () => fake.choice ?? real.useBallChoice() };
});

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');
const chips = (html: string) => [...html.matchAll(/aria-label="(Bola del juego \d+: [^"]*)"/g)].map((m) => m[1]);

const nueva: Ball = {
  id: 'n1',
  name: 'Nueva',
  brand: '',
  weight: 15,
  color: '#16a34a',
  cover: null,
  drilledOn: null,
  resurfacedOn: null,
  retired: false,
  createdAt: null,
  updatedAt: null,
  design: null,
};

const session: SoloSession = {
  id: 's7',
  userId: 'u-suelto',
  playedOn: '2026-09-20',
  venue: '',
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

beforeEach(() => {
  fake.uid = 'u-suelto';
  fake.choice = null;
  fake.gamesError = null;
});

describe('la bola de cada juego suelto', () => {
  it('agregó su primera bola aquí (antes no tenía): los juegos siguen con su botón mientras se leen sus bolas', () => {
    // Ya tiene la nueva, pero las bolas de este juego no se han leído (la lectura empieza al tener una).
    const choice: BallChoice = { balls: [nueva], canPick: true, auto: null, loaded: true, noBallsAtStart: true };
    fake.choice = choice;
    expect(chips(render(session))).toEqual([1, 2, 3].map((n) => `Bola del juego ${n}: sin bola`));
    // Si ya tenía bolas al abrir, hay que esperar a leerlas: mientras, no sale (guardar no las cambia).
    fake.choice = { ...choice, noBallsAtStart: false };
    expect(render(session)).not.toContain('Bola del juego');
  });

  it('sin señal (no se pudieron leer las bolas de sus juegos): no sale y dice por qué', () => {
    queryClient.setQueryData(ballKeys.list('u-suelto'), { balls: [nueva], lastUsed: null });
    fake.gamesError = new Error('sin señal');
    const out = render(session);
    expect(out).not.toContain('Bola del juego');
    expect(out).not.toContain('Bola de todos los juegos');
    expect(text(out)).toContain('Sin señal no se ven las bolas de estos juegos (se quedan como estaban). Ábrelo con señal para cambiarlas.');
    // Uno nuevo no tiene nada que leer: sale igual.
    expect(chips(render(null))).toHaveLength(3);
  });

  it('mientras se leen (con señal) no dice nada de la señal', () => {
    queryClient.setQueryData(ballKeys.list('u-suelto'), { balls: [nueva], lastUsed: null });
    const t = text(render({ ...session, id: 's8' }));
    expect(t).not.toContain('Sin señal');
    expect(t).not.toContain('Bola del juego');
  });

  it('sin cuenta, o sin haber leído la lista de bolas, no sale', () => {
    fake.uid = null;
    expect(render(null)).not.toContain('Bola del juego');
    // Con cuenta, pero su lista no está en el teléfono ni se ha leído.
    fake.uid = 'u-sin-leer';
    const out = render(null);
    expect(out).not.toContain('Bola del juego');
    expect(out).not.toContain('Bola de todos los juegos');
  });

  it('los botones de la bola no se confunden con las casillas de los juegos ni con «+ Juego»', () => {
    queryClient.setQueryData(ballKeys.list('u-suelto'), { balls: [nueva], lastUsed: 'n1' });
    const out = render(null);
    expect(chips(out)).toEqual([1, 2, 3].map((n) => `Bola del juego ${n}: Nueva (15 lb)`));
    expect(out.match(/aria-label="Juego \d+"/g)).toHaveLength(3);
    expect(out.match(/por cuadros/g)).toHaveLength(3);
    expect(out.match(/<\/svg>\s*Juego<\/button>/g)).toHaveLength(1);
    // Cerrados: la hoja para elegir no está.
    expect(out).not.toContain('¿Con cuál bola lo tiraste?');
    // Del ancho de su casilla y para el dedo (44 px).
    const chip = out.match(/<button[^>]*aria-label="Bola del juego 1:[^"]*"[^>]*>/)?.[0] ?? '';
    expect(chip).toContain('h-11');
    expect(chip).toContain('w-full');
  });
});
