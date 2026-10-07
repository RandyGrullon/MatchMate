/**
 * La bola de cada juego en «Escribir a mano» de la Planilla (GamesTab con `quick`: la planilla de siempre, una casilla
 * por juego), sin navegador (renderToString con las bolas de la
 * cuenta en la caché): solo en la fila de la cuenta (el dueño, un admin o el anotador que también juega), un botón por
 * juego debajo de la casilla, también sin bolas («Agregar»); en la de los demás, nunca. Cada juego sale con la que tenía
 * (la del servidor con la cola encima), uno con puntaje y sin bola sin bola, y uno sin jugar con la del juego anterior o
 * la última que usó. Si no se saben las que ya tenía, no sale (guardar podría pisarlas).
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ball, BallGame } from '../../lib/balls';
import { ballKeys, type MyBalls } from '../../lib/data/balls';
import { queryClient } from '../../lib/data/client';
import { LeagueContext, type LeagueCtx } from '../../lib/league';
import type { BowlingEvent, Entry, League, Player } from '../../lib/types';
import { FeedbackProvider } from '../feedback';
import { GamesTab } from './GamesTab';

/** La cuenta que entró y lo que está en la cola sin salir (sin abrir la cola de verdad: aquí no hay servidor). */
const session = vi.hoisted(() => ({ uid: null as string | null, queued: [] as Record<string, unknown>[] }));
vi.mock('../../lib/data/client', async (orig) => ({
  ...(await orig<typeof import('../../lib/data/client')>()),
  getUserId: () => session.uid,
  currentOutbox: () => ({
    listPending: () => session.queued.map((args, seq) => ({ fn: 'set_game_balls', args, seq, status: 'pending' })),
    listFailed: () => [],
  }),
}));
// Usan useSyncExternalStore sin la versión del servidor (renderToString no puede) y aquí no se abren.
vi.mock('../ScanModal', () => ({ ScanModal: () => null }));
vi.mock('../PhotoModal', () => ({ PhotoModal: () => null }));
vi.mock('./AddPlayersModal', () => ({ AddPlayersModal: () => null }));

const count = (html: string, re: RegExp) => html.match(new RegExp(re.source, 'g'))?.length ?? 0;
const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

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
const ctx: LeagueCtx = { lid: 'L1', league, member: null, isAdmin: true, isOwner: true, isScorer: false, canScore: true, myPlayerId: 'p1', base: '/l/L1' };

const event: BowlingEvent = { id: 'E1', type: 'torneo', name: 'Copa', date: '2026-10-12', games: 3, hcpBase: 230, hcpPercent: 80, teams: {}, playerCount: 2 };
const entry = (id: string, playerId: string, scores: (number | null)[], photos: (string | null)[] = [null, null, null]): Entry => ({
  id,
  eventId: 'E1',
  playerId,
  teamId: null,
  average: 180,
  handicapOverride: null,
  scores,
  photos,
});
const players: Player[] = [
  { id: 'p1', name: 'Luis', averageOverride: null },
  { id: 'p2', name: 'Pedro', averageOverride: null },
];
/** Luis (la cuenta) jugó el 1; Pedro, el 1 y el 2. */
const entries = [entry('e1', 'p1', [200, null, null]), entry('e2', 'p2', [180, 170, null])];

const tagged = (game: number, b: string): BallGame => ({ ball: b, kind: 'event', ref: 'E1', game, date: '2026-10-12', score: 200, frames: null, counted: false });

let n = 0;
/** Una cuenta nueva en cada prueba (la caché es de todo el archivo): sus bolas y, si se dice, las de sus juegos aquí. */
function signIn(mine: MyBalls | null, games?: BallGame[]) {
  session.uid = `u-tabla-${++n}`;
  if (mine) queryClient.setQueryData(ballKeys.list(session.uid), mine);
  if (games) queryClient.setQueryData(ballKeys.games(session.uid, 'E1'), games);
}

const render = (p: { entries?: Entry[]; ctx?: Partial<LeagueCtx>; event?: BowlingEvent } = {}) =>
  renderToString(
    h(
      MemoryRouter,
      null,
      h(
        FeedbackProvider,
        null,
        h(LeagueContext.Provider, { value: { ...ctx, ...p.ctx } }, h(GamesTab, { event: p.event ?? event, entries: p.entries ?? entries, players, quick: true })),
      ),
    ),
  );

/** Los nombres de los botones de bola, en orden. */
const chips = (html: string) => [...html.matchAll(/aria-label="(Bola del juego [^"]*)"/g)].map((m) => m[1]);

beforeEach(() => {
  session.queued = [];
});

describe('la bola de cada juego en la hoja del evento', () => {
  it('solo en su fila: un botón por juego debajo de cada casilla (44 px, del ancho de la columna); en la de Pedro, ninguno', () => {
    signIn({ balls: [phaze, spare], lastUsed: 'b' }, [tagged(0, 'a')]);
    const out = render();
    expect(chips(out)).toHaveLength(3);
    // Todos entre las casillas de Luis y las de Pedro.
    const luis = out.indexOf('aria-label="Luis juego 1"');
    const pedro = out.indexOf('aria-label="Pedro juego 1"');
    expect(luis).toBeGreaterThan(-1);
    expect(pedro).toBeGreaterThan(luis);
    expect(chips(out.slice(luis, pedro))).toHaveLength(3);
    expect(chips(out.slice(pedro))).toHaveLength(0);
    expect(out).toMatch(/<button[^>]*aria-label="Bola del juego 1[^"]*"[^>]*class="[^"]*h-11[^"]*w-full/);
    // La bola dibujada (BallArt), nada de la lista del teléfono.
    expect(out).toContain('fill="#1d4ed8"');
    expect(out).not.toContain('<option');
    expect(text(out)).toContain('Debajo de tus juegos, la bola con que tiraste: tócala para cambiarla');
  });

  it('la que tenía cada juego; uno sin jugar sigue con la del juego anterior', () => {
    signIn({ balls: [phaze, spare], lastUsed: 'b' }, [tagged(0, 'a')]);
    expect(chips(render())).toEqual(['Bola del juego 1: Phaze II (15 lb)', 'Bola del juego 2: Phaze II (15 lb)', 'Bola del juego 3: Phaze II (15 lb)']);
  });

  it('uno con puntaje y sin bola sale sin bola; los que no ha jugado, con la última que usó', () => {
    signIn({ balls: [phaze, spare], lastUsed: 'b' }, []);
    expect(chips(render())).toEqual(['Bola del juego 1: sin bola', 'Bola del juego 2: Spare (14 lb)', 'Bola del juego 3: Spare (14 lb)']);
  });

  it('un juego verificado con foto también tiene su bola (la foto no la cambia)', () => {
    signIn({ balls: [phaze, spare], lastUsed: 'b' }, [tagged(0, 'a')]);
    const out = render({ entries: [entry('e1', 'p1', [200, null, null], ['foto', null, null]), entries[1]] });
    expect(out).toContain('aria-label="Luis juego 1: 200, verificado"');
    expect(chips(out)[0]).toBe('Bola del juego 1: Phaze II (15 lb)');
  });

  it('sin bolas: igual sale en cada juego, con «Agregar» (sin esperar a leer sus juegos: no tenía ninguno con bola)', () => {
    // Sus juegos con bola no están en la caché (se estarían leyendo).
    signIn({ balls: [], lastUsed: null });
    const out = render();
    expect(chips(out)).toEqual([1, 2, 3].map((g) => `Bola del juego ${g}: sin bola. Toca para agregar una`));
    expect(count(out, /lucide-plus/)).toBeGreaterThanOrEqual(3);
  });

  it('todas retiradas: también sale (para agregar otra), pero espera a saber las que tenían sus juegos', () => {
    const vieja = ball('v', 'Vieja', '#111827', { retired: true });
    signIn({ balls: [vieja], lastUsed: 'v' });
    expect(chips(render())).toHaveLength(0);
    signIn({ balls: [vieja], lastUsed: 'v' }, [tagged(0, 'v')]);
    // La retirada que ya tenía el juego se sigue viendo, pero no se pone sola en uno nuevo (ni siguiendo al anterior).
    const none = (g: number) => `Bola del juego ${g}: sin bola. Toca para agregar una`;
    expect(chips(render())).toEqual(['Bola del juego 1: Vieja (15 lb)', none(2), none(3)]);
    signIn({ balls: [vieja], lastUsed: 'v' }, []);
    expect(chips(render())).toEqual([none(1), none(2), none(3)]);
  });

  it('guardadas sin señal: las de la cola encima de las del servidor, juego por juego (todas, no solo la última)', () => {
    signIn({ balls: [phaze, spare], lastUsed: 'a' }, [tagged(0, 'a')]);
    session.queued = [
      { p_kind: 'event', p_ref: 'E1', p_balls: { 0: null } },
      { p_kind: 'event', p_ref: 'E1', p_balls: { 1: 'b' } },
      // De otro evento y de un juego suelto: no son de aquí.
      { p_kind: 'event', p_ref: 'E9', p_balls: { 2: 'a' } },
      { p_kind: 'solo', p_ref: 'E1', p_balls: { 2: 'a' } },
    ];
    const out = render({ entries: [entry('e1', 'p1', [200, 190, null]), entries[1]] });
    expect(chips(out)).toEqual(['Bola del juego 1: sin bola', 'Bola del juego 2: Spare (14 lb)', 'Bola del juego 3: Spare (14 lb)']);
  });

  it('sin señal y sin leer sus juegos: con todo en la cola se sabe; si no, no sale', () => {
    signIn({ balls: [phaze, spare], lastUsed: 'a' });
    session.queued = [{ p_kind: 'event', p_ref: 'E1', p_balls: { 0: 'b' } }];
    expect(chips(render())).toHaveLength(0);
    session.queued.push({ p_kind: 'event', p_ref: 'E1', p_balls: { 1: null, 2: 'a' } });
    expect(chips(render({ entries: [entry('e1', 'p1', [200, 190, null]), entries[1]] }))).toEqual(['Bola del juego 1: Spare (14 lb)', 'Bola del juego 2: sin bola', 'Bola del juego 3: Phaze II (15 lb)']);
  });

  it('si no se saben las que ya tenía, no sale (ni la línea de abajo): guardar podría pisarlas', () => {
    // Tiene bolas y sus juegos no se han leído.
    signIn({ balls: [phaze, spare], lastUsed: 'b' });
    const reading = render();
    expect(chips(reading)).toHaveLength(0);
    expect(text(reading)).not.toContain('Debajo de tus juegos');
    // Sus bolas no se han leído.
    signIn(null);
    expect(chips(render())).toHaveLength(0);
    // Sin sesión.
    session.uid = null;
    expect(chips(render())).toHaveLength(0);
  });

  it('quien no juega aquí no tiene bola en ninguna fila (anota los juegos de los demás)', () => {
    signIn({ balls: [phaze, spare], lastUsed: 'b' }, [tagged(0, 'a')]);
    // Sin jugador en la liga (superadmin, anotador sin jugador).
    expect(chips(render({ ctx: { myPlayerId: null } }))).toHaveLength(0);
    // Juega en la liga pero no está en este evento.
    const out = render({ ctx: { myPlayerId: 'p3' } });
    expect(chips(out)).toHaveLength(0);
    expect(text(out)).not.toContain('Debajo de tus juegos');
  });

  it('en una práctica también, y con «Otro juego» cada juego nuevo trae la suya', () => {
    signIn({ balls: [phaze, spare], lastUsed: 'b' }, [tagged(0, 'a')]);
    const practice: BowlingEvent = { ...event, type: 'practica', games: 4, hcpPercent: 0 };
    const out = render({ event: practice, entries: [entry('e1', 'p1', [200]), entry('e2', 'p2', [180])] });
    expect(chips(out)).toHaveLength(4);
    expect(chips(out)[3]).toBe('Bola del juego 4: Phaze II (15 lb)');
  });
});
