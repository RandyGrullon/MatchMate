/**
 * La bola de cada juego en «Mis juegos» de una práctica, un torneo o una sesión (renderToString con las bolas de la
 * cuenta en la caché y el borrador del teléfono): cada casilla dibuja la bola de su juego (la del teléfono como se envía;
 * la de la tabla y la de lo enviado, del servidor con lo de la cola encima) y el juego que se anota lleva arriba su fila
 * de bolas en las tres formas de anotar, también sin bolas («Agregar»). Sin saber la lista, no sale nada.
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ball, BallGame, GameBall } from '../../lib/balls';
import { ballKeys, type MyBalls } from '../../lib/data/balls';
import { queryClient } from '../../lib/data/client';
import type { GameDraft } from '../../lib/draft';
import { LeagueContext, type LeagueCtx } from '../../lib/league';
import type { BowlingEvent, Entry, League, Submission } from '../../lib/types';
import { FeedbackProvider } from '../feedback';
import { setPreferredMode } from '../frames/FrameEditor';
import { MyGamesPanel } from './MyGamesPanel';

/**
 * La cuenta que entró (sin abrir su cola de verdad: aquí no hay servidor), lo que está en la cola sin salir y el
 * borrador del teléfono (useDraft lee el almacenamiento del navegador, que aquí no hay).
 */
const world = vi.hoisted(() => ({
  uid: null as string | null,
  queued: [] as { fn: string; seq: number; args: Record<string, unknown> }[],
  draft: null as GameDraft | null,
}));
vi.mock('../../lib/data/client', async (orig) => ({
  ...(await orig<typeof import('../../lib/data/client')>()),
  getUserId: () => world.uid,
  currentOutbox: () => (world.queued.length ? { listPending: () => world.queued, listFailed: () => [] } : null),
}));
vi.mock('../../lib/draft', async (orig) => ({
  ...(await orig<typeof import('../../lib/draft')>()),
  useDraft: () => world.draft,
}));

const TODAY = '2026-10-01';

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
const phaze = ball('a', 'Phaze II', '#1d4ed8');
const spare = ball('b', 'Spare', '#f8fafc', { weight: 14 });
const vieja = ball('c', 'Vieja', '#7c2d12', { retired: true });

const league: League = {
  id: 'L1',
  name: 'Liga Los Pinos',
  visibility: 'private',
  ownerUid: 'u1',
  venue: '',
  schedule: '',
  seasonStart: '',
  seasonEnd: '',
  contactName: '',
  contactPhone: '',
  requirePhoto: true,
};
const ctx: LeagueCtx = { lid: 'L1', league, member: null, isAdmin: false, isOwner: false, isScorer: false, canScore: false, myPlayerId: 'p1', base: '/l/L1' };

const practice: BowlingEvent = { id: 'E1', type: 'practica', name: 'Práctica', date: TODAY, games: 3, hcpBase: 0, hcpPercent: 0, teams: {}, playerCount: 1 };

const sub = (id: string, scores: (number | null)[]): Submission => ({
  id,
  playerId: 'p1',
  eventId: 'E1',
  scores,
  scanned: null,
  photoId: null,
  status: 'pendiente',
  note: null,
});

interface Setup {
  event?: BowlingEvent;
  entry?: Entry | null;
  subs?: Submission[];
  /** Abrir el próximo juego por anotar (desde "En juego ahora"). */
  autoStart?: boolean;
}

const render = ({ event = practice, entry = null, subs = [], autoStart = false }: Setup = {}) =>
  renderToString(
    h(
      MemoryRouter,
      null,
      h(
        FeedbackProvider,
        null,
        h(
          LeagueContext.Provider,
          { value: ctx },
          h(MyGamesPanel, {
            event,
            playerId: 'p1',
            entry,
            subs,
            live: { live: true, startLabel: null, startsSoon: false },
            today: TODAY,
            autoStart,
            onAutoStarted: () => undefined,
            onOpenEntry: () => undefined,
            onSend: () => undefined,
          }),
        ),
      ),
    ),
  );

/** Cada prueba con su cuenta: la caché de una no se mezcla con la de otra. */
let n = 0;
const signIn = (mine: MyBalls | null) => {
  world.uid = `u-mis-juegos-${++n}`;
  if (mine) queryClient.setQueryData(ballKeys.list(world.uid), mine);
  return world.uid;
};
const draft = (values: string[], balls?: Record<string, string | null>): GameDraft => ({ eventId: 'E1', values, balls });
const tag = (kind: 'event' | 'sub', ref: string, game: number, b: string): BallGame => ({
  ball: b,
  kind,
  ref,
  game,
  date: TODAY,
  score: 200,
  frames: null,
  counted: kind === 'event',
});
const queue = (kind: 'event' | 'sub', ref: string, balls: Record<string, GameBall>) =>
  world.queued.push({ fn: 'set_game_balls', seq: world.queued.length + 1, args: { p_kind: kind, p_ref: ref, p_balls: balls } });

/** Lo que dice cada casilla (juego, puntaje y su bola), en orden. */
const tiles = (html: string) => [...html.matchAll(/aria-label="(Juego \d+:[^"]*)"/g)].map((m) => m[1]);
/** Las bolas dibujadas en las casillas (18 px). */
const tileArt = (html: string) => html.match(/<svg[^>]*width="18" height="18"/g)?.length ?? 0;
/** La casilla de la bola elegida arriba del editor. */
const checked = (html: string) => html.match(/role="radio" aria-checked="true" aria-label="([^"]*)"/)?.[1];

beforeEach(() => {
  world.queued = [];
  world.draft = null;
});

describe('Mis juegos: la bola de cada juego en su casilla', () => {
  it('los del teléfono: la que eligió y, en el que no eligió, la del juego anterior (la misma que se envía)', () => {
    signIn({ balls: [phaze, spare, vieja], lastUsed: 'a' });
    world.draft = draft(['200', '180', ''], { '0': 'b' });
    const out = render();
    expect(tiles(out)).toEqual(['Juego 1: 200, bola Spare (14 lb)', 'Juego 2: 180, bola Spare (14 lb)', 'Juego 3: anotar']);
    // Dibujada con su diseño (solo se ve: la casilla sigue siendo un solo botón, sin otro adentro).
    expect(tileArt(out)).toBe(2);
    expect(out).toContain('fill="#f8fafc"');
    expect(out).not.toMatch(/<button[^>]*>(?:(?!<\/button>).)*<button/s);
    expect(out).not.toContain('<select');
  });

  it('sin elegir en ninguno: la última que usó; uno «sin bola» no dibuja nada', () => {
    signIn({ balls: [phaze, spare], lastUsed: 'a' });
    world.draft = draft(['190', '170'], { '1': null });
    expect(tiles(render())).toEqual(['Juego 1: 190, bola Phaze II (15 lb)', 'Juego 2: 170', 'Juego 3: anotar']);
  });

  it('en la tabla y enviados: la que tienen en el servidor (también una retirada: es la de ese juego)', () => {
    const uid = signIn({ balls: [phaze, spare, vieja], lastUsed: 'a' });
    queryClient.setQueryData(ballKeys.games(uid, 'E1'), [tag('event', 'E1', 0, 'c')]);
    queryClient.setQueryData(ballKeys.games(uid, 'S1'), [tag('sub', 'S1', 1, 'a')]);
    const entry: Entry = { id: 'e1', eventId: 'E1', playerId: 'p1', teamId: null, average: 180, handicapOverride: null, scores: [210, null, null], photos: ['f', null, null] };
    const out = render({ entry, subs: [sub('S1', [null, 190, null])] });
    expect(tiles(out)).toEqual(['Juego 1: 210, bola Vieja (15 lb)', 'Juego 2: 190, bola Phaze II (15 lb)', 'Juego 3: anotar']);
    expect(out).toContain('fill="#7c2d12"');
  });

  it('lo que está en la cola sin llegar va encima de lo del servidor (y la última de cada juego gana)', () => {
    const uid = signIn({ balls: [phaze, spare], lastUsed: 'a' });
    queryClient.setQueryData(ballKeys.games(uid, 'S1'), [tag('sub', 'S1', 0, 'a'), tag('sub', 'S1', 1, 'a')]);
    queue('sub', 'S1', { '0': 'b', '1': 'b' });
    queue('sub', 'S1', { '1': null });
    const out = render({ subs: [sub('S1', [200, 190, null])] });
    expect(tiles(out)).toEqual(['Juego 1: 200, bola Spare (14 lb)', 'Juego 2: 190', 'Juego 3: anotar']);
    // Sin señal y sin leer lo del servidor, lo de la cola igual se ve.
    signIn({ balls: [phaze, spare], lastUsed: 'a' });
    expect(tiles(render({ subs: [sub('S1', [200, 190, null])] }))).toEqual(['Juego 1: 200, bola Spare (14 lb)', 'Juego 2: 190', 'Juego 3: anotar']);
  });

  it('lo del servidor sin leer: esa casilla no dibuja ninguna (no se adivina)', () => {
    signIn({ balls: [phaze, spare], lastUsed: 'a' });
    world.draft = draft(['', '180']);
    const entry: Entry = { id: 'e1', eventId: 'E1', playerId: 'p1', teamId: null, average: 180, handicapOverride: null, scores: [210, null, null], photos: ['f', null, null] };
    expect(tiles(render({ entry }))).toEqual(['Juego 1: 210', 'Juego 2: 180, bola Phaze II (15 lb)', 'Juego 3: anotar']);
  });

  it('sin la lista de bolas (sin señal y sin copia) o sin bolas: ninguna casilla dibuja bola', () => {
    world.draft = draft(['200', '180'], { '0': 'a' });
    for (const mine of [null, { balls: [], lastUsed: null }]) {
      signIn(mine);
      const out = render();
      expect(tiles(out)).toEqual(['Juego 1: 200', 'Juego 2: 180', 'Juego 3: anotar']);
      expect(tileArt(out)).toBe(0);
    }
  });
});

describe('Mis juegos: la bola arriba del juego que se anota', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('el próximo juego se abre con la bola del anterior: todas dibujadas, «Sin bola», «Agregar» y sin las retiradas', () => {
    signIn({ balls: [phaze, spare, vieja], lastUsed: 'a' });
    world.draft = draft(['200'], { '0': 'b' });
    const out = render({ autoStart: true });
    expect(out).toContain('<dialog');
    expect(out).toContain('aria-label="Bola del juego 2"');
    expect(checked(out)).toBe('Spare (14 lb)');
    expect(out).toContain('aria-label="Phaze II (15 lb)"');
    expect(out).toContain('aria-label="Sin bola"');
    expect(out).toContain('aria-label="Agregar bola"');
    expect(out).not.toContain('Vieja');
    // Dibujadas a 40 px (sin bola, «Sin bola»): las dos de la cuenta.
    expect(out.match(/<svg[^>]*width="40" height="40"/g)?.length).toBe(2);
    expect(out).not.toContain('<select');
    expect(out).not.toContain('<option');
  });

  it('un juego nuevo arranca con la última que usó', () => {
    signIn({ balls: [phaze, spare], lastUsed: 'a' });
    const out = render({ autoStart: true });
    expect(out).toContain('aria-label="Bola del juego 1"');
    expect(checked(out)).toBe('Phaze II (15 lb)');
  });

  it('una cuenta sin bolas también la tiene: «Sin bola» elegida y «Agregar» para crearla ahí mismo', () => {
    signIn({ balls: [], lastUsed: null });
    const out = render({ autoStart: true });
    expect(out).toContain('aria-label="Bola del juego 1"');
    expect(checked(out)).toBe('Sin bola');
    expect(out).toContain('aria-label="Agregar bola"');
  });

  it('una cuenta con todas retiradas: «Sin bola» y «Agregar» (la retirada no sale)', () => {
    signIn({ balls: [vieja], lastUsed: 'c' });
    const out = render({ autoStart: true });
    expect(checked(out)).toBe('Sin bola');
    expect(out).toContain('aria-label="Agregar bola"');
    expect(out).not.toContain('Vieja');
  });

  it('en las tres formas de anotar (pines, teclado y total)', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    signIn({ balls: [phaze, spare], lastUsed: 'b' });
    const marks = { pines: 'aria-label="Pines"', teclado: null, total: 'aria-label="Puntaje del juego"' } as const;
    for (const mode of ['pines', 'teclado', 'total'] as const) {
      setPreferredMode(mode);
      const out = render({ autoStart: true });
      expect(out, mode).toContain('aria-label="Bola del juego 1"');
      expect(checked(out), mode).toBe('Spare (14 lb)');
      for (const [m, mark] of Object.entries(marks)) if (mark) expect(out.includes(mark), `${mode} ${m}`).toBe(m === mode);
    }
  });

  it('sin la lista de bolas (sin señal y sin copia) o sin sesión: se anota igual, sin la bola', () => {
    for (const uid of ['leyendo', null]) {
      signIn(null);
      if (!uid) world.uid = null;
      const out = render({ autoStart: true });
      expect(out).toContain('<dialog');
      // «Juego 1» con el evento debajo (la línea vieja de abajo ya no está: «Guardado en tu teléfono» va arriba).
      expect(out).toMatch(/Juego 1<\/h2><p[^>]*>Práctica<\/p>/);
      expect(out).not.toContain('Al terminar, envíalo a revisión');
      expect(out).not.toContain('Bola de este juego');
      expect(out).not.toContain('Agregar bola');
    }
  });

  it('el día antes del evento no se abre nada', () => {
    signIn({ balls: [phaze], lastUsed: 'a' });
    const out = render({ event: { ...practice, date: '2026-10-02' }, autoStart: true });
    expect(out).not.toContain('Bola de este juego');
    expect(out).toContain('El día del evento podrás anotar aquí tus juegos');
  });
});
