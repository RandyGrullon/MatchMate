/**
 * Juegos sueltos sin base de datos: los números (con las cuentas de las ligas), por mes, las boleras que ya puso, lo
 * que no deja guardar, los cuadros que se mandan, lo de la cola encima de lo del servidor y los errores en palabras.
 */
import { describe, expect, it } from 'vitest';
import { BackendError } from '../backend/types';
import { byDate, soloStatGames } from '../bowlingStats';
import type { OutboxItem } from '../db/outbox';
import {
  cleanSoloFrames,
  overlaySolo,
  soloByMonth,
  soloDraftProblem,
  soloErrorText,
  soloHigh,
  soloMinDate,
  soloOldestFirst,
  soloSeries,
  soloSummary,
  soloVenues,
  sortSolo,
  type SoloSession,
} from './solo';

const session = (id: string, playedOn: string, scores: number[], extra: Partial<SoloSession> = {}): SoloSession => ({
  id,
  userId: 'u1',
  playedOn,
  venue: '',
  note: '',
  scores,
  frames: null,
  shared: true,
  createdAt: '2026-09-01T12:00:00.000Z',
  updatedAt: '2026-09-01T12:00:00.000Z',
  likes: 0,
  likedByMe: false,
  ...extra,
});

const op = (args: Record<string, unknown>, extra: Partial<OutboxItem> = {}): OutboxItem => ({
  opId: `op-${String(args.p_id)}`,
  userId: 'u1',
  fn: 'save_solo_session',
  args: { p_op_id: `op-${String(args.p_id)}`, ...args },
  group: 'solo',
  collapseKey: `solo:${String(args.p_id)}`,
  createdAt: Date.parse('2026-09-28T15:00:00.000Z'),
  seq: 1,
  attempts: 0,
  status: 'pending',
  ...extra,
});

describe('números de los juegos sueltos', () => {
  it('juegos, pinos, promedio hacia abajo, el más alto y la mejor serie de 3 seguidos', () => {
    const s = soloSummary([session('a', '2026-09-20', [150, 160, 170, 200]), session('b', '2026-09-10', [211]), session('c', '2026-09-01', [190, 180])]);
    expect(s).toEqual({ sessions: 3, games: 7, pins: 1261, average: 180, high: 211, bestSeries: 530 });
  });

  it('sin juegos: nada', () => {
    expect(soloSummary([])).toEqual({ sessions: 0, games: 0, pins: 0, average: null, high: 0, bestSeries: 0 });
  });

  it('la serie de 3 es dentro de un mismo día (no junta días)', () => {
    expect(soloSummary([session('a', '2026-09-20', [200, 200]), session('b', '2026-09-19', [200])]).bestSeries).toBe(0);
  });

  it('serie y más alto de un día', () => {
    expect(soloSeries(session('a', '2026-09-20', [150, 160]))).toBe(310);
    expect(soloHigh(session('a', '2026-09-20', [150, 160]))).toBe(160);
    expect(soloHigh({ scores: [] })).toBe(0);
  });
});

describe('lista', () => {
  it('del más nuevo al más viejo (fecha y después id, como la base)', () => {
    const list = sortSolo([session('a', '2026-09-01', [1]), session('c', '2026-09-20', [1]), session('b', '2026-09-20', [1])]);
    expect(list.map((s) => s.id)).toEqual(['c', 'b', 'a']);
  });

  it('del más viejo al más nuevo (la tendencia): el mismo día, en el orden en que se anotaron', () => {
    // Como llega de la base: del más nuevo al más viejo. La de la noche (id mayor) se anotó después de la de la mañana.
    const list = [session('0192-noche', '2026-09-30', [220, 230]), session('0191-manana', '2026-09-30', [150, 160]), session('0100', '2026-09-29', [180])];
    expect(soloOldestFirst(list).map((s) => s.id)).toEqual(['0100', '0191-manana', '0192-noche']);
    // Los juegos de la gráfica: la mañana antes que la noche, y el último punto es el último juego que tiró.
    const games = byDate(soloOldestFirst(list).flatMap((s) => soloStatGames(s)));
    expect(games.map((g) => g.score)).toEqual([180, 150, 160, 220, 230]);
    // No cambia la lista que recibe.
    expect(list[0].id).toBe('0192-noche');
  });

  it('por mes, con su nombre', () => {
    const months = soloByMonth([session('a', '2026-09-20', [1]), session('b', '2026-09-02', [1]), session('c', '2026-08-30', [1])]);
    expect(months.map((m) => [m.month, m.sessions.map((s) => s.id)])).toEqual([
      ['2026-09', ['a', 'b']],
      ['2026-08', ['c']],
    ]);
    expect(months[0].label).toMatch(/septiembre/i);
    expect(months[0].label).toContain('2026');
  });

  it('las boleras que ya puso: la más reciente primero, sin repetir ni vacías', () => {
    const list = [
      session('a', '2026-09-20', [1], { venue: 'Bolera Norte ' }),
      session('b', '2026-09-10', [1], { venue: '' }),
      session('c', '2026-09-05', [1], { venue: 'bolera norte' }),
      session('d', '2026-09-01', [1], { venue: 'Club Sur' }),
    ];
    expect(soloVenues(list)).toEqual(['Bolera Norte', 'Club Sur']);
    expect(soloVenues(list, 1)).toEqual(['Bolera Norte']);
  });
});

describe('lo que no deja guardar', () => {
  const ok = { playedOn: '2026-09-28', scores: [180], venue: '', note: '' };
  it('fecha: de hace 10 años hasta mañana', () => {
    expect(soloMinDate('2026-09-28')).toBe('2016-09-28');
    expect(soloDraftProblem(ok, '2026-09-28')).toBeNull();
    expect(soloDraftProblem({ ...ok, playedOn: '2026-09-29' }, '2026-09-28')).toBeNull();
    expect(soloDraftProblem({ ...ok, playedOn: '2026-09-30' }, '2026-09-28')).toBe('date');
    expect(soloDraftProblem({ ...ok, playedOn: '2016-09-28' }, '2026-09-28')).toBeNull();
    expect(soloDraftProblem({ ...ok, playedOn: '2016-09-27' }, '2026-09-28')).toBe('date');
    expect(soloDraftProblem({ ...ok, playedOn: '' }, '2026-09-28')).toBe('date');
  });

  it('juegos: de 1 a 10, cada uno de 0 a 300 y enteros', () => {
    expect(soloDraftProblem({ ...ok, scores: [] }, '2026-09-28')).toBe('games');
    expect(soloDraftProblem({ ...ok, scores: Array(11).fill(100) }, '2026-09-28')).toBe('games');
    expect(soloDraftProblem({ ...ok, scores: [0, 300] }, '2026-09-28')).toBeNull();
    expect(soloDraftProblem({ ...ok, scores: [301] }, '2026-09-28')).toBe('score');
    expect(soloDraftProblem({ ...ok, scores: [150.5] }, '2026-09-28')).toBe('score');
  });

  it('bolera hasta 80 y nota hasta 300 (sin contar los espacios de los lados)', () => {
    expect(soloDraftProblem({ ...ok, venue: `  ${'a'.repeat(80)}  ` }, '2026-09-28')).toBeNull();
    expect(soloDraftProblem({ ...ok, venue: 'a'.repeat(81) }, '2026-09-28')).toBe('venue');
    expect(soloDraftProblem({ ...ok, note: 'a'.repeat(301) }, '2026-09-28')).toBe('note');
  });

  it('cuadros: solo los de juegos que existen', () => {
    const f = { rolls: [10, 10] };
    expect(cleanSoloFrames({ '0': f, '2': f, x: f }, 2)).toEqual({ '0': f });
    expect(cleanSoloFrames({ '3': f }, 2)).toBeNull();
    expect(cleanSoloFrames(null, 2)).toBeNull();
  });
});

describe('lo de la cola encima de lo del servidor', () => {
  const server = [session('b', '2026-09-20', [150], { likes: 2, likedByMe: true }), session('a', '2026-09-01', [180])];

  it('uno nuevo sin señal sale de una (solo en el teléfono), en su lugar por fecha', () => {
    const out = overlaySolo(server, [op({ p_id: 'n', p_played_on: '2026-09-10', p_scores: [200, 210], p_venue: ' Bolera ', p_note: '', p_shared: false, p_frames: null })]);
    expect(out.map((s) => s.id)).toEqual(['b', 'n', 'a']);
    expect(out[1]).toMatchObject({ id: 'n', userId: 'u1', venue: 'Bolera', scores: [200, 210], shared: false, pending: true, local: true, likes: 0, createdAt: null });
  });

  it('un cambio pendiente reemplaza al del servidor y conserva sus me gusta', () => {
    const out = overlaySolo(server, [op({ p_id: 'b', p_played_on: '2026-09-21', p_scores: [160, 170], p_venue: '', p_note: 'Bien', p_shared: true })]);
    expect(out[0]).toMatchObject({ id: 'b', playedOn: '2026-09-21', scores: [160, 170], note: 'Bien', likes: 2, likedByMe: true, pending: true, local: false });
  });

  it('sin nada en la cola, la misma lista', () => {
    expect(overlaySolo(server, [])).toBe(server);
    expect(overlaySolo(server, [op({ p_id: 'x' }, { fn: 'save_game' })])).toBe(server);
  });
});

describe('errores en palabras simples', () => {
  it('cada código de la base', () => {
    expect(soloErrorText(new BackendError('rate_limited', 'rate_limited', 'rate_limited'))).toBe('Anotaste muchos juegos sueltos hoy. Prueba mañana.');
    expect(soloErrorText(new BackendError('no_permitido', 'permission', 'no_permitido'))).toBe('Ese juego no es tuyo.');
    expect(soloErrorText(new BackendError('no_existe', 'not_found', 'no_existe'))).toBe('Ese juego ya no existe.');
    expect(soloErrorText(new BackendError('Sin conexión', 'network'))).toMatch(/Sin conexión/);
    expect(soloErrorText(new BackendError('invalido', 'validation', 'invalido'))).toMatch(/de 0 a 300/);
    expect(soloErrorText(new Error('otra cosa'))).toBe('No se pudo guardar. Prueba otra vez.');
  });

  it('lo que revisa el teléfono sale tal cual', () => {
    expect(soloErrorText(new BackendError('Cada juego va de 0 a 300.', 'validation', 'invalido'))).toBe('Cada juego va de 0 a 300.');
  });
});
