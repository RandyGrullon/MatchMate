/**
 * La bola de cada juego en «Subir mis juegos» (renderToString con las bolas de la cuenta en la caché): cada juego propio
 * tiene su botón de bola (también sin bolas: con un + para agregar una) y arriba «para todos los juegos»; arranca con la
 * última que usó o con lo del borrador del teléfono; los juegos de otro jugador y una lista que no se sabe no tienen
 * bola. Y cómo quedan las bolas al elegir la de un juego (pickGameBall).
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ball } from '../lib/balls';
import { ballKeys, type MyBalls } from '../lib/data/balls';
import { queryClient } from '../lib/data/client';
import type { GameDraft } from '../lib/draft';
import { toIsoDate } from '../lib/format';
import { LeagueContext, type LeagueCtx } from '../lib/league';
import type { BowlingEvent, League, Player } from '../lib/types';
import { FeedbackProvider } from './feedback';
import { SubmitGamesModal, pickGameBall } from './SubmitGamesModal';

/** La cuenta que entró (sin abrir su cola: aquí no hay servidor). */
const session = vi.hoisted(() => ({ uid: null as string | null }));
vi.mock('../lib/data/client', async (orig) => ({
  ...(await orig<typeof import('../lib/data/client')>()),
  getUserId: () => session.uid,
}));
// Sin foto no hay lectura (y useScanJob no se puede dibujar sin navegador).
vi.mock('../lib/scanJobs', async (orig) => ({
  ...(await orig<typeof import('../lib/scanJobs')>()),
  useScanJob: () => null,
}));

/** El almacenamiento del teléfono (los borradores), en memoria. */
const store = new Map<string, string>();
const memoryStorage = {
  get length() {
    return store.size;
  },
  key: (i: number) => [...store.keys()][i] ?? null,
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};

const UID = 'u-subir';
const today = toIsoDate(new Date());

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
const old = ball('v', 'Vieja', '#111827', { retired: true });

const league: League = {
  id: 'l1',
  name: 'Liga del Club',
  kind: 'liga',
  visibility: 'private',
  ownerUid: 'u-admin',
  venue: '',
  schedule: '',
  seasonStart: '',
  seasonEnd: '',
  contactName: '',
  contactPhone: '',
  requirePhoto: false,
  sport: 'boliche',
};
const ctx: LeagueCtx = {
  lid: 'l1',
  league,
  member: { id: 'l1_u', leagueId: 'l1', uid: UID, name: 'Ana', role: 'member', playerId: 'p1' },
  isAdmin: false,
  isOwner: false,
  isScorer: false,
  canScore: false,
  myPlayerId: 'p1',
  base: '/l/l1',
};
const me: Player = { id: 'p1', name: 'Ana', averageOverride: null, uid: UID };
const practice: BowlingEvent = { id: 'e1', type: 'practica', name: '', date: today, games: 3, hcpBase: 0, hcpPercent: 0, teams: {}, playerCount: 0 };

/** «Subir mis juegos» abierto (en la práctica de hoy, o por fecha sin `events`). */
const render = ({ player = me, c = ctx, events = [practice] }: { player?: Player; c?: LeagueCtx; events?: BowlingEvent[] } = {}) =>
  renderToString(
    h(
      FeedbackProvider,
      null,
      h(
        LeagueContext.Provider,
        { value: c },
        h(SubmitGamesModal, { open: true, onClose: () => undefined, player, events, myEntries: [], preferEventId: events[0]?.id }),
      ),
    ),
  );

const seed = (mine: MyBalls) => queryClient.setQueryData(ballKeys.list(UID), mine);
const draft = (d: GameDraft, playerId = 'p1') => store.set(`mm:borrador:l1:${playerId}:${d.eventId}`, JSON.stringify(d));
/** Los nombres de los botones de bola, en orden. */
const chips = (html: string) => [...html.matchAll(/aria-label="(Bola de[^"]*)"/g)].map((m) => m[1]);

beforeAll(() => {
  vi.stubGlobal('localStorage', memoryStorage);
});
afterAll(() => {
  vi.unstubAllGlobals();
});
beforeEach(() => {
  store.clear();
  session.uid = UID;
});

describe('la bola de cada juego en «Subir mis juegos»', () => {
  it('sin bolas: cada juego tiene su botón con un + para agregar una, y también «para todos los juegos»', () => {
    seed({ balls: [], lastUsed: null });
    const out = render();
    expect(chips(out)).toEqual([
      'Bola de todos los juegos: sin bola. Toca para agregar una',
      'Bola del juego 1: sin bola. Toca para agregar una',
      'Bola del juego 2: sin bola. Toca para agregar una',
      'Bola del juego 3: sin bola. Toca para agregar una',
    ]);
    expect(out).toContain('lucide-plus');
    expect(out).toContain('aria-haspopup="dialog"');
    expect(out).toContain('Toca la bola de un juego para cambiar solo esa.');
    // Ya no es la lista del teléfono ni la pista de antes.
    expect(out).not.toContain('<option value="">Sin bola</option>');
    expect(out).not.toContain('al anotarlo por cuadros o pines');
  });

  it('todas retiradas: igual sale el botón (para agregar otra)', () => {
    seed({ balls: [old], lastUsed: 'v' });
    expect(chips(render())).toContain('Bola del juego 1: sin bola. Toca para agregar una');
  });

  it('con bolas: cada juego arranca con la última que usó, dibujada (44 px para el dedo)', () => {
    seed({ balls: [phaze, spare], lastUsed: 'b' });
    const out = render();
    expect(chips(out)).toEqual([
      'Bola de todos los juegos: Spare (14 lb)',
      'Bola del juego 1: Spare (14 lb)',
      'Bola del juego 2: Spare (14 lb)',
      'Bola del juego 3: Spare (14 lb)',
    ]);
    // La bola dibujada en cada botón (y en el de todos los juegos, con su nombre).
    expect(out.match(/fill="#f8fafc"/g)?.length).toBeGreaterThanOrEqual(4);
    expect(out).toMatch(/<span class="[^"]*truncate[^"]*">Spare<\/span>/);
    expect(out).toContain('h-11');
    expect(out).not.toContain('lucide-plus');
  });

  it('lo del borrador del teléfono: la de cada juego, «Sin bola» y, si no eligió, la del juego anterior', () => {
    seed({ balls: [phaze, spare, old], lastUsed: 'b' });
    draft({ eventId: 'e1', values: ['210', '190', '', ''], balls: { 0: 'v', 1: null, 2: 'a' } });
    expect(chips(render())).toEqual([
      // Los juegos con pinos tienen bolas distintas.
      'Bola de todos los juegos: varias bolas',
      // Una retirada que ya tenía el juego se sigue viendo.
      'Bola del juego 1: Vieja (15 lb)',
      'Bola del juego 2: sin bola',
      'Bola del juego 3: Phaze II (15 lb)',
      'Bola del juego 4: Phaze II (15 lb)',
    ]);
  });

  it('una bola que ya no existe (se borró) sale sin bola', () => {
    seed({ balls: [phaze], lastUsed: 'a' });
    draft({ eventId: 'e1', values: ['210', '', ''], balls: { 0: 'borrada' } });
    expect(chips(render())[1]).toBe('Bola del juego 1: sin bola');
  });

  it('por fecha: hasta el juego 10 (lo que anota el servidor)', () => {
    seed({ balls: [phaze], lastUsed: 'a' });
    draft({ eventId: '__fecha__', date: today, values: Array.from({ length: 11 }, () => '200'), savedAt: 1 });
    const names = chips(render({ events: [] }));
    expect(names).toContain('Bola del juego 10: Phaze II (15 lb)');
    expect(names.some((n) => n.startsWith('Bola del juego 11'))).toBe(false);
  });

  it('los juegos de otro jugador (p. ej. un admin que los sube por él) no tienen bola', () => {
    seed({ balls: [phaze, spare], lastUsed: 'b' });
    const out = render({ player: { id: 'p2', name: 'Beto', averageOverride: null }, c: { ...ctx, isAdmin: true } });
    expect(out).toContain('aria-label="Juego 1"');
    expect(chips(out)).toEqual([]);
    expect(out).not.toContain('Toca la bola de un juego');
    // Ni sin jugador propio en la liga.
    expect(chips(render({ c: { ...ctx, myPlayerId: null } }))).toEqual([]);
  });

  it('si no se sabe qué bolas tiene (sin señal y sin la lista en el teléfono) o no entró, no sale', () => {
    session.uid = 'u-sin-lista';
    const out = render();
    expect(out).toContain('aria-label="Juego 1"');
    expect(chips(out)).toEqual([]);
    session.uid = null;
    expect(chips(render())).toEqual([]);
  });
});

describe('elegir la bola de un juego (pickGameBall)', () => {
  it('los que siguen con pinos se quedan con la que mostraban; los vacíos la heredan', () => {
    // J2 tiene pinos y heredaba la de J1; J3 está vacío.
    const out = pickGameBall({ 0: 'a' }, 0, 'b', ['210', '190', ''], null);
    expect(out).toEqual({ 0: 'b', 1: 'a' });
  });

  it('la que se ponía sola también se queda en los que siguen con pinos', () => {
    expect(pickGameBall({}, 0, null, ['210', '190', '180'], 'a')).toEqual({ 0: null, 1: 'a', 2: 'a' });
  });

  it('los que siguen sin bola (o con la suya) no se tocan: los sin bola heredan la nueva', () => {
    expect(pickGameBall({ 2: null }, 0, 'b', ['210', '190', '180'], null)).toEqual({ 0: 'b', 2: null });
    expect(pickGameBall({ 1: 'c' }, 0, 'b', ['210', '190'], 'a')).toEqual({ 0: 'b', 1: 'c' });
  });

  it('los de antes no cambian', () => {
    expect(pickGameBall({ 0: 'a' }, 2, 'b', ['210', '190', '180'], 'c')).toEqual({ 0: 'a', 2: 'b' });
  });
});
