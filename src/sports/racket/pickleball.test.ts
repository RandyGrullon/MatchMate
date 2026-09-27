import { describe, expect, it } from 'vitest';
import { replay, type Side } from '../types';
import { createRacketEngine, resolveRules, type PickleballEvent, type PickleballRules, type PickleballState } from '.';

const S: PickleballEvent = { type: 'rally', won: 'serving' };
const R: PickleballEvent = { type: 'rally', won: 'receiving' };
/** 'SSR' = gana el que saca, gana el que saca, gana el que recibe. */
const rallies = (seq: string) => [...seq].map((c) => (c === 'S' ? S : R));
/** '1122' = peloteo ganado por el lado 1, 1, 2, 2. */
const pts = (seq: string) => [...seq].map((c): PickleballEvent => ({ type: 'point', side: Number(c) as Side }));

function steps(log: PickleballEvent[], rules: Partial<PickleballRules> = {}, start?: PickleballState) {
  const e = createRacketEngine('pickleball', rules);
  const out: PickleballState[] = [];
  log.reduce((s, ev) => {
    const next = e.apply(s, ev);
    out.push(next);
    return next;
  }, start ?? e.init({}));
  return out;
}

const run = (log: PickleballEvent[], rules: Partial<PickleballRules> = {}) => replay(createRacketEngine('pickleball', rules), {}, log);

describe('conteo tradicional en dobles', () => {
  it('el juego empieza en 0-0-2 y saca el de la derecha', () => {
    const s = createRacketEngine('pickleball').init({});
    expect(s.call).toBe('0-0-2');
    expect([s.server, s.serverPlayer, s.serverNumber, s.serveFrom]).toEqual([1, 0, 2, 'right']);
    const t = createRacketEngine('pickleball').init({ firstServer: 2, firstPlayer: [0, 1] });
    expect([t.call, t.server, t.serverPlayer, t.serveFrom]).toEqual(['0-0-2', 2, 1, 'right']);
  });

  it('20 cantos seguidos con side-outs y segundo sacador', () => {
    const seq = steps(rallies('SSRSSRSRRSSRRRSSRSRS'));
    expect(seq.map((x) => [x.call, x.server, x.serverPlayer, x.serveFrom])).toEqual([
      ['1-0-2', 1, 0, 'left'],
      ['2-0-2', 1, 0, 'right'],
      ['0-2-1', 2, 0, 'right'],
      ['1-2-1', 2, 0, 'left'],
      ['2-2-1', 2, 0, 'right'],
      ['2-2-2', 2, 1, 'left'],
      ['3-2-2', 2, 1, 'right'],
      ['2-3-1', 1, 0, 'right'],
      ['2-3-2', 1, 1, 'left'],
      ['3-3-2', 1, 1, 'right'],
      ['4-3-2', 1, 1, 'left'],
      ['3-4-1', 2, 1, 'right'],
      ['3-4-2', 2, 0, 'left'],
      ['4-3-1', 1, 0, 'right'],
      ['5-3-1', 1, 0, 'left'],
      ['6-3-1', 1, 0, 'right'],
      ['6-3-2', 1, 1, 'left'],
      ['7-3-2', 1, 1, 'right'],
      ['3-7-1', 2, 1, 'right'],
      ['4-7-1', 2, 1, 'left'],
    ]);
    expect(seq.at(-1)!.score).toEqual([7, 4]);
    // El que empezó a la derecha está a la derecha cuando su lado va par.
    for (const x of seq) for (const k of [0, 1]) expect(x.right[k]).toBe(x.score[k] % 2 === 0 ? 0 : 1);
  });

  // 20 secuencias desde 0-0-2 (A saca primero; A0 y B0 empiezan a la derecha): [peloteos, canto, lado, jugador, desde].
  const CALLS: [string, string, Side, number, 'right' | 'left'][] = [
    ['S', '1-0-2', 1, 0, 'left'],
    ['R', '0-0-1', 2, 0, 'right'],
    ['RR', '0-0-2', 2, 1, 'left'],
    ['RRR', '0-0-1', 1, 0, 'right'],
    ['SS', '2-0-2', 1, 0, 'right'],
    ['SSS', '3-0-2', 1, 0, 'left'],
    ['SR', '0-1-1', 2, 0, 'right'],
    ['SRS', '1-1-1', 2, 0, 'left'],
    ['SRR', '0-1-2', 2, 1, 'left'],
    ['SRRS', '1-1-2', 2, 1, 'right'],
    ['SRRR', '1-0-1', 1, 1, 'right'],
    ['SRRRR', '1-0-2', 1, 0, 'left'],
    ['SRRRS', '2-0-1', 1, 1, 'left'],
    ['SRRRSR', '2-0-2', 1, 0, 'right'],
    ['SRRRSRS', '3-0-2', 1, 0, 'left'],
    ['SRRRSRR', '0-2-1', 2, 0, 'right'],
    ['RS', '1-0-1', 2, 0, 'left'],
    ['RSR', '1-0-2', 2, 1, 'right'],
    ['RSRS', '2-0-2', 2, 1, 'left'],
    ['RSRR', '0-1-1', 1, 0, 'right'],
  ];

  it.each(CALLS)('secuencia %s canta %s', (seq, call, server, player, from) => {
    const s = run(rallies(seq));
    expect([s.call, s.server, s.serverPlayer, s.serveFrom]).toEqual([call, server, player, from]);
  });

  it('solo puntúa el que saca', () => {
    const seq = steps(rallies('RRRRRR'));
    expect(seq.every((x) => x.score[0] === 0 && x.score[1] === 0)).toBe(true);
    expect(seq.map((x) => x.call)).toEqual(['0-0-1', '0-0-2', '0-0-1', '0-0-2', '0-0-1', '0-0-2']);
    expect(seq.map((x) => x.server)).toEqual([2, 2, 1, 1, 2, 2]);
  });

  it('«point» por lado es lo mismo que decir quién ganó el peloteo', () => {
    const a = run(pts('1121222111'));
    const b = run(rallies('SSRRSSSRSS'));
    expect({ ...a, n: 0 }).toEqual({ ...b, n: 0 });
  });

  it('a 11 ganando por 2', () => {
    const e = createRacketEngine('pickleball');
    const s1010 = e.apply(e.init({}), { type: 'correct', games: [], score: [10, 10], server: 1, serverNumber: 1 });
    expect(s1010.call).toBe('10-10-1');
    const s1110 = e.apply(s1010, S);
    expect(e.isOver(s1110)).toBe(false);
    expect(e.result(e.apply(s1110, S))).toEqual({ winner: 1, summary: '12-10' });
    const blank = run(pts('1'.repeat(11)));
    expect(createRacketEngine('pickleball').result(blank)).toEqual({ winner: 1, summary: '11-0' });
  });
});

describe('individual y rally', () => {
  it('individual tradicional: canto sin número y se saca por la paridad', () => {
    const seq = steps(rallies('SRSR'), { doubles: false });
    expect(seq.map((x) => [x.call, x.server, x.serveFrom])).toEqual([
      ['1-0', 1, 'left'],
      ['0-1', 2, 'right'],
      ['1-1', 2, 'left'],
      ['1-1', 1, 'left'],
    ]);
    expect(seq.every((x) => x.serverNumber === null && x.serverPlayer === 0)).toBe(true);
  });

  it('rally en dobles: punto en cada peloteo, sin segundo sacador, saque por la paridad', () => {
    const seq = steps(pts('12211'), { scoring: 'rally' });
    expect(seq.map((x) => [x.call, x.server, x.serverPlayer, x.serveFrom])).toEqual([
      ['1-0', 1, 0, 'left'],
      ['1-1', 2, 1, 'left'],
      ['2-1', 2, 1, 'right'],
      ['2-2', 1, 1, 'right'],
      ['3-2', 1, 1, 'left'],
    ]);
    expect(seq.every((x) => x.serverNumber === null)).toBe(true);
    expect(steps([R], { scoring: 'rally' })[0].score).toEqual([0, 1]);
  });

  it('rally en individual', () => {
    const seq = steps(pts('122'), { scoring: 'rally', doubles: false });
    expect(seq.map((x) => [x.call, x.server, x.serveFrom])).toEqual([
      ['1-0', 1, 'left'],
      ['1-1', 2, 'left'],
      ['2-1', 2, 'right'],
    ]);
  });

  it('rally: el que recibe gana en su punto de juego, salvo con «solo sacando»', () => {
    const fix: Extract<PickleballEvent, { type: 'correct' }> = { type: 'correct', games: [], score: [10, 5], server: 2 };
    const free = createRacketEngine('pickleball', { scoring: 'rally' });
    expect(free.result(free.apply(free.apply(free.init({}), fix), { type: 'point', side: 1 }))).toEqual({ winner: 1, summary: '11-5' });
    const strict = createRacketEngine('pickleball', { scoring: 'rally', gamePointOnServeOnly: true });
    const s = strict.apply(strict.apply(strict.init({}), fix), { type: 'point', side: 1 });
    expect(s.score).toEqual([10, 5]);
    expect(s.server).toBe(1);
    expect(s.call).toBe('10-5');
    expect(strict.result(strict.apply(s, { type: 'point', side: 1 }))).toEqual({ winner: 1, summary: '11-5' });
    // Fuera del punto de juego el que recibe suma normal.
    const mid = strict.apply(strict.apply(strict.init({}), { ...fix, score: [5, 5] }), { type: 'point', side: 1 });
    expect(mid.score).toEqual([6, 5]);
  });
});

describe('juegos, lados y partido', () => {
  it('cambio de lado al terminar cada juego y a los 6 del juego decisivo (una sola vez)', () => {
    const log = pts('1'.repeat(11) + '2'.repeat(11) + '1'.repeat(11));
    const seq = steps(log, { bestOf: 3 });
    const flips = seq.map((x, k) => (x.changeEnds ? k + 1 : 0)).filter(Boolean);
    expect(flips).toEqual([11, 22, 28]);
    expect(seq[27].switched).toBe(true);
    expect(seq[5].changeEnds).toBe(false);
    const end = seq.at(-1)!;
    expect(createRacketEngine('pickleball').result(end)).toEqual({ winner: 1, summary: '11-0 0-11 11-0' });
    expect(end.call).toBe('');
  });

  it('el cambio de lado va a la mitad: 6, 8 u 11', () => {
    expect(resolveRules('pickleball').switchAt).toBe(6);
    expect(resolveRules('pickleball', { gameTo: 15 }).switchAt).toBe(8);
    expect(resolveRules('pickleball', { gameTo: 21 }).switchAt).toBe(11);
    expect(resolveRules('pickleball', { gameTo: 21, switchAt: null }).switchAt).toBeNull();
    const seq = steps(pts('1'.repeat(9)), { gameTo: 15 });
    expect(seq.map((x, k) => (x.changeEnds ? k + 1 : 0)).filter(Boolean)).toEqual([8]);
  });

  it('el juego siguiente lo empieza a sacar quien recibió primero', () => {
    const s = run(pts('1'.repeat(11)), { bestOf: 3 });
    expect(s.games).toEqual([[11, 0]]);
    expect([s.call, s.server, s.serverPlayer, s.serverNumber]).toEqual(['0-0-2', 2, 0, 2]);
    expect(s.leftSide).toBe(2);
  });

  it('cada pareja elige quién empieza a la derecha antes del primer saque', () => {
    const e = createRacketEngine('pickleball');
    const s = e.apply(e.init({}), { type: 'positions', side: 1, right: 1 });
    expect([s.serverPlayer, s.serveFrom, s.right]).toEqual([1, 'right', [1, 0]]);
    const after = e.apply(s, R);
    expect(after.serverPlayer).toBe(0);
    expect(() => e.apply(after, { type: 'positions', side: 2, right: 1 })).toThrow('antes del primer saque');
    const single = createRacketEngine('pickleball', { doubles: false });
    expect(() => single.apply(single.init({}), { type: 'positions', side: 1, right: 1 })).toThrow('En individual');
  });

  it('retiro y W.O.', () => {
    const e = createRacketEngine('pickleball', { bestOf: 3 });
    const s = e.apply(replay(e, {}, pts('1'.repeat(11) + '22222' + '1111')), { type: 'retire', side: 1 });
    expect(e.result(s)).toEqual({ winner: 2, summary: '11-0 3-5 ret.' });
    const wo = e.apply(e.init({}), { type: 'walkover', side: 1 });
    expect(e.result(wo)).toEqual({ winner: 2, summary: 'W.O.' });
    expect(() => e.apply(e.apply(e.init({}), R), { type: 'walkover', side: 1 })).toThrow('Retiro');
    expect(() => e.apply(wo, S)).toThrow('El partido ya terminó.');
  });
});

describe('corrección, deshacer y guardar', () => {
  it('corregir marcador: queda igual que si se hubiera jugado', () => {
    const e = createRacketEngine('pickleball', { bestOf: 3 });
    const played = replay(e, {}, pts('1'.repeat(11) + '2222'));
    const fixed = e.apply(e.init({}), { type: 'correct', games: [[11, 0]], score: [0, 4], serverNumber: 2 });
    for (const k of ['games', 'score', 'server', 'serverPlayer', 'serverNumber', 'right', 'leftSide', 'call', 'serveFrom'] as const) {
      expect(fixed[k]).toEqual(played[k]);
    }
    const def = e.apply(e.init({}), { type: 'correct', games: [[11, 7]], score: [4, 2] });
    expect([def.server, def.serverNumber, def.call, def.leftSide]).toEqual([2, 1, '2-4-1', 2]);
  });

  it('corregir marcador: rechaza juegos imposibles', () => {
    const e = createRacketEngine('pickleball', { bestOf: 3 });
    const s = e.init({});
    expect(() => e.apply(s, { type: 'correct', games: [[11, 10]], score: [0, 0] })).toThrow('Juego 1 no válido: 11-10.');
    expect(() => e.apply(s, { type: 'correct', games: [[13, 10]], score: [0, 0] })).toThrow('no válido');
    expect(() => e.apply(s, { type: 'correct', games: [], score: [11, 3] })).toThrow('Puntos no válidos');
    expect(() => e.apply(s, { type: 'correct', games: [[11, 0], [11, 0]], score: [1, 0] })).toThrow('0-0');
    expect(e.isOver(e.apply(s, { type: 'correct', games: [[11, 0], [12, 14], [15, 13]], score: [0, 0] }))).toBe(true);
  });

  it('deshacer = volver a calcular sin la última jugada', () => {
    const e = createRacketEngine('pickleball', { bestOf: 3 });
    const log = [...rallies('SSRSSRSRRSSRRRSSRSRS'), ...pts('1'.repeat(15)), ...rallies('RSRSSR')];
    let s = e.init({});
    const states = [s];
    for (const ev of log) states.push((s = e.apply(s, ev)));
    for (let k = 1; k <= log.length; k++) expect(replay(e, {}, log.slice(0, k - 1))).toEqual(states[k - 1]);
  });

  it('el estado es JSON: se guarda, se lee y se sigue igual', () => {
    const e = createRacketEngine('pickleball', { bestOf: 3, scoring: 'rally' });
    const mid = replay(e, {}, pts('1221121211222'));
    const back = JSON.parse(JSON.stringify(mid)) as PickleballState;
    expect(back).toEqual(mid);
    const more = pts('2121212111111111111');
    expect(more.reduce(e.apply, back)).toEqual(more.reduce(e.apply, mid));
  });

  it('rechaza jugadas raras', () => {
    const e = createRacketEngine('pickleball');
    const s = e.init({});
    expect(() => e.apply(s, { type: 'rally', won: 'nadie' } as unknown as PickleballEvent)).toThrow('Falta decir quién ganó');
    expect(() => e.apply(s, { type: 'order', side: 1, player: 0 } as unknown as PickleballEvent)).toThrow('Jugada no válida para pickleball.');
    expect(() => createRacketEngine('pickleball', { gameTo: 3 })).toThrow('El juego va de 5 a 25 puntos.');
    expect(() => createRacketEngine('pickleball', { gameTo: 11, switchAt: 11 })).toThrow('cambio de lado');
  });
});
