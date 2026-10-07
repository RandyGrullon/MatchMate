/**
 * Qué significa «Anotar» en Hoy (sin navegador; el almacenamiento del teléfono es un Map): las fichas de cada juego (tabla,
 * teléfono, enviado, a medias o sin anotar), el botón que toca («Seguir mi juego 3», «Anotar juego 1», «Enviar mis
 * juegos»…), los juegos a medias de cualquier evento y los eventos de ayer y de hoy para «¿Dónde jugaste?».
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorWork } from '../components/frames/FrameEditor';
import { gameKey, myGamesPlace, storageKey, writeGameDraft } from '../components/frames/draftMemory';
import type { LeagueFeed } from './data';
import type { BowlingEvent, League, Submission } from './types';
import {
  gameCells,
  nextGame,
  nextGameLabel,
  partialGame,
  recentEvents,
  resumeElsewhere,
  scorePath,
  seriesOf,
  sheetPath,
  startedGames,
  type GameCell,
} from './useNextGame';

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
beforeAll(() => vi.stubGlobal('localStorage', memoryStorage));
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => store.clear());

const TODAY = '2026-10-07';
const work = (rolls: number[], total = ''): EditorWork => ({ mode: 'teclado', rolls, masks: rolls.map(() => null), total, hole: null });
const at = (ms: number) => ({ toMillis: () => ms });
const sub = (scores: (number | null)[], status: Submission['status'] = 'pendiente', ms = 1): Pick<Submission, 'status' | 'scores' | 'createdAt'> => ({
  status,
  scores,
  createdAt: at(ms),
});
const event = (p: Partial<BowlingEvent> = {}): BowlingEvent => ({
  id: 'E1',
  type: 'practica',
  name: 'Práctica de hoy',
  date: TODAY,
  games: 3,
  hcpBase: 0,
  hcpPercent: 0,
  teams: {},
  playerCount: 6,
  ...p,
});

describe('lo que lleva un juego a medias', () => {
  it('por cuadros: lo que suma hasta ahora y los cuadros terminados', () => {
    // Strike (20) + spare (19) + 9 = 48 en 3 cuadros.
    expect(partialGame({ work: work([10, 7, 3, 9, 0]) })).toEqual({ score: 48, progress: 0.3 });
    // El cuadro a medio tirar no cuenta como hecho.
    expect(partialGame({ work: work([10, 7]) })).toEqual({ score: 0, progress: 0.1 });
  });

  it('solo el total escrito: el número, sin barra', () => {
    expect(partialGame({ work: work([], '180') })).toEqual({ score: 180, progress: null });
    expect(partialGame({ work: work([], 'x') })).toEqual({ score: null, progress: null });
    expect(partialGame(null)).toBeNull();
  });
});

describe('las fichas de mis juegos', () => {
  it('tabla, teléfono, enviado, a medias y sin anotar, como «Mis juegos»', () => {
    const cells = gameCells({
      games: 5,
      entry: { scores: [187, null, null, null, null], photos: ['f', null, null, null, null] },
      draft: { values: ['', '210', '', '', ''] },
      subs: [sub([null, null, 190])],
      partial: (i) => (i === 3 ? { score: 74, progress: 0.5 } : null),
    });
    expect(cells).toEqual<GameCell[]>([
      { kind: 'tabla', score: 187, counted: true },
      { kind: 'telefono', score: 210 },
      { kind: 'enviado', score: 190 },
      { kind: 'medias', score: 74, progress: 0.5 },
      { kind: 'vacio' },
    ]);
    // La serie no suma lo que va a medias.
    expect(seriesOf(cells)).toBe(587);
  });

  it('lo de la tabla manda sobre el teléfono y lo enviado; lo rechazado no cuenta', () => {
    const cells = gameCells({ games: 2, entry: { scores: [200, null], photos: [null, null] }, draft: { values: ['150', ''] }, subs: [sub([150, 180], 'rechazado')] });
    expect(cells).toEqual([{ kind: 'tabla', score: 200, counted: false }, { kind: 'vacio' }]);
  });

  it('un juego de más en el teléfono (práctica con «Otro juego») también sale', () => {
    expect(gameCells({ games: 3, entry: null, draft: { values: ['', '', '', '201'] }, subs: [] })).toHaveLength(4);
  });
});

describe('el botón de la tarjeta de hoy', () => {
  const base = { lid: 'L1', event: event(), playerId: 'p1', staff: false, hasSubs: false, today: TODAY };
  const done: GameCell = { kind: 'tabla', score: 187, counted: true };

  it('un juego a medias: «Seguir mi juego 3» (Pro: «Seguir juego 3»), que abre la hoja ahí', () => {
    const n = nextGame({ ...base, cells: [done, done, { kind: 'medias', score: 74, progress: 0.5 }] });
    expect(n).toEqual({ kind: 'medias', game: 3, progress: 0.5, to: '/l/L1/e/E1?anotar=1' });
    expect(nextGameLabel(n)).toBe('Seguir mi juego 3');
    expect(nextGameLabel(n, { pro: true })).toBe('Seguir juego 3');
  });

  it('el primero sin anotar: «Anotar juego 1»', () => {
    const n = nextGame({ ...base, cells: [{ kind: 'vacio' }, { kind: 'vacio' }, { kind: 'vacio' }] });
    expect(n).toEqual({ kind: 'anotar', game: 1, to: scorePath('L1', 'E1') });
    expect(nextGameLabel(n)).toBe('Anotar juego 1');
  });

  it('un juego a medias que no es el que sigue: primero el que sigue (la hoja abre ese)', () => {
    const n = nextGame({ ...base, cells: [done, { kind: 'vacio' }, { kind: 'medias', score: 30, progress: 0.2 }] });
    expect(n).toMatchObject({ kind: 'anotar', game: 2 });
  });

  it('todos anotados y en el teléfono: «Enviar mis juegos»; enviados: «Ver mis juegos»', () => {
    const phone: GameCell = { kind: 'telefono', score: 200 };
    expect(nextGame({ ...base, cells: [done, phone, phone] })).toEqual({ kind: 'enviar', count: 2, to: '/l/L1/e/E1' });
    expect(nextGameLabel({ kind: 'enviar', count: 1, to: '' })).toBe('Enviar mi juego');
    expect(nextGameLabel({ kind: 'enviar', count: 2, to: '' })).toBe('Enviar mis juegos');
    const sent = nextGame({ ...base, cells: [done, done, { kind: 'enviado', score: 190 }] });
    expect(sent).toEqual({ kind: 'ver', pending: true, to: '/l/L1/e/E1' });
    expect(nextGameLabel(sent)).toBe('Ver mis juegos');
    expect(nextGame({ ...base, cells: [done, done, done] })).toEqual({ kind: 'ver', pending: false, to: '/l/L1/e/E1' });
  });

  it('sin jugador: «Preparar mi jugador»; quien anota el evento sin jugar: la planilla', () => {
    const empty: GameCell[] = [{ kind: 'vacio' }];
    expect(nextGame({ ...base, playerId: null, cells: empty })).toEqual({ kind: 'preparar', to: '/l/L1/perfil' });
    const sheet = nextGame({ ...base, playerId: null, staff: true, cells: empty });
    expect(sheet).toEqual({ kind: 'planilla', to: sheetPath('L1', 'E1') });
    expect(nextGameLabel(sheet, { pro: true })).toBe('Planilla');
    expect(nextGameLabel(sheet)).toBe('Anotar juegos de todos');
  });

  it('en un torneo, quien lo organiza juega solo si ya empezó sus juegos', () => {
    const torneo = { ...base, event: event({ type: 'torneo' }), staff: true };
    expect(nextGame({ ...torneo, cells: [{ kind: 'vacio' }, { kind: 'vacio' }] }).kind).toBe('planilla');
    expect(nextGame({ ...torneo, cells: [{ kind: 'medias', score: 40, progress: 0.3 }, { kind: 'vacio' }] }).kind).toBe('medias');
    expect(nextGame({ ...torneo, hasSubs: true, cells: [{ kind: 'vacio' }, { kind: 'vacio' }] }).kind).toBe('anotar');
    // En una práctica, el admin también juega aunque no haya empezado.
    expect(nextGame({ ...base, staff: true, cells: [{ kind: 'vacio' }] }).kind).toBe('anotar');
  });

  it('un evento que todavía no llega no se anota', () => {
    expect(nextGame({ ...base, event: event({ date: '2026-10-13' }), cells: [{ kind: 'vacio' }] }).kind).toBe('ver');
  });
});

describe('juegos a medias en cualquier evento', () => {
  const place = (uid: string, lid: string, pid: string, eid: string) => myGamesPlace(uid, lid, pid, eid);

  it('encuentra los de la cuenta (del más nuevo al más viejo), con lo que llevan', () => {
    const now = Date.now();
    writeGameDraft(gameKey(place('u1', 'L1', 'p1', 'E1'), 2), work([10, 7, 3, 9, 0]), null, now - 60_000);
    writeGameDraft(gameKey(place('u1', 'L2', 'p9', 'E7'), 0), work([], '150'), null, now - 1000);
    // De otra cuenta, de la tabla del admin o de un juego suelto: no.
    writeGameDraft(gameKey(place('u2', 'L1', 'p1', 'E1'), 0), work([9, 0]), null, now);
    store.set(storageKey('tabla:u1:L1:E1:row:0'), JSON.stringify({ score: 100, at: now }));
    writeGameDraft(gameKey('solo:u1:nuevo', 0), work([9, 0]), null, now);

    const found = startedGames('u1', now);
    expect(found.map((s) => [s.lid, s.playerId, s.eventId, s.game])).toEqual([
      ['L2', 'p9', 'E7', 1],
      ['L1', 'p1', 'E1', 3],
    ]);
    expect(found[1].partial).toEqual({ score: 48, progress: 0.3 });
    expect(startedGames(null, now)).toEqual([]);
  });

  it('los vencidos (más de 14 días) se borran al leerlos', () => {
    const now = Date.now();
    const key = gameKey(place('u1', 'L1', 'p1', 'E1'), 0);
    writeGameDraft(key, work([9, 0]), null, now - 15 * 86_400_000);
    expect(startedGames('u1', now)).toEqual([]);
    expect(store.has(storageKey(key))).toBe(false);
  });

  it('sin almacenamiento no falla', () => {
    expect(startedGames('u1', Date.now(), null)).toEqual([]);
  });
});

describe('¿Dónde jugaste?', () => {
  const league = (id: string, sport = 'bowling'): League => ({
    id,
    name: `Liga ${id}`,
    visibility: 'private',
    ownerUid: 'u1',
    venue: '',
    schedule: '',
    seasonStart: '',
    seasonEnd: '',
    contactName: '',
    contactPhone: '',
    requirePhoto: false,
    sport,
  });
  const feed = (lid: string, events: BowlingEvent[], playerId: string | null = 'p1'): LeagueFeed => ({
    lid,
    uid: 'u1',
    playerId,
    isAdmin: false,
    isScorer: false,
    events,
    mySubs: [],
    pending: [],
    reactions: [],
    comments: [],
    suggestions: [],
  });

  it('los eventos de boliche de ayer y de hoy donde juegas, del más nuevo al más viejo', () => {
    const feeds = [
      feed('A', [event({ id: 'ayer', date: '2026-10-06' }), event({ id: 'hoy' }), event({ id: 'luego', date: '2026-10-13' })]),
      feed('B', [event({ id: 'padel', date: TODAY })]),
      feed('C', [event({ id: 'sin-jugador', date: TODAY })], null),
    ];
    const recent = recentEvents(feeds, [league('A'), league('B', 'padel'), league('C')], TODAY);
    expect(recent.map((r) => r.event.id)).toEqual(['hoy', 'ayer']);
    expect(recent[0]).toMatchObject({ lid: 'A', leagueName: 'Liga A', playerId: 'p1' });
  });

  it('seguir el juego a medias de un evento reciente (no el que ya sale en la tarjeta de hoy)', () => {
    const recent = recentEvents([feed('A', [event({ id: 'ayer', date: '2026-10-06' }), event({ id: 'hoy' })])], [league('A')], TODAY);
    const started = [
      { lid: 'A', playerId: 'p1', eventId: 'hoy', game: 3, at: 3, partial: { score: 74, progress: 0.5 } },
      { lid: 'A', playerId: 'p1', eventId: 'ayer', game: 2, at: 2, partial: { score: 50, progress: 0.4 } },
      { lid: 'A', playerId: 'p1', eventId: 'viejo', game: 1, at: 1, partial: { score: 9, progress: 0.1 } },
    ];
    expect(resumeElsewhere(started, recent)?.eventId).toBe('hoy');
    expect(resumeElsewhere(started, recent, 'hoy')).toMatchObject({ eventId: 'ayer', game: 2, recent: { event: { id: 'ayer' } } });
    expect(resumeElsewhere(started.slice(2), recent)).toBeNull();
  });
});
