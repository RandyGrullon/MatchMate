import { describe, expect, it } from 'vitest';
import { replay } from '../../../../sports/types';
import { resolveRules, type TableTennisEvent } from '../../../../sports/racket';
import { scoreFrom, servesText, tableTennisAdapter, ttView, winnerText } from './logic';

const A: TableTennisEvent = { type: 'point', side: 1 };
const B: TableTennisEvent = { type: 'point', side: 2 };
const times = (ev: TableTennisEvent, n: number) => Array.from({ length: n }, () => ev);
/** Puntos alternados: A, B, A, B… (n de cada uno). */
const even = (n: number) => Array.from({ length: 2 * n }, (_, i) => (i % 2 === 0 ? A : B));

const single = resolveRules('table_tennis', {});
const labels = ['Ana', 'Rosa'] as const;

describe('lo que se ve en la mesa (individual)', () => {
  const engine = tableTennisAdapter(single).engine;
  const at = (log: TableTennisEvent[], firstServer: 1 | 2 = 1) => ttView(replay(engine, { firstServer }, log), [['Ana'], ['Rosa']], labels);

  it('saca Ana: 2 saques, luego el 2.º; después saca Rosa', () => {
    let v = at([]);
    expect(v).toMatchObject({ serving: 1, serverName: 'Ana', receiverName: null, servesLeft: 2, deuce: false, gamePoint: null, gameNo: 1, deciding: false });
    expect(servesText(v)).toBe('2 saques');
    v = at([A]);
    expect(v.servesLeft).toBe(1);
    expect(servesText(v)).toBe('2.º saque');
    v = at([A, B]);
    expect(v.serverName).toBe('Rosa');
    expect(servesText(v)).toBe('2 saques');
    expect(v.canOrder).toBe(false);
  });

  it('10-10: un saque cada uno, sin punto de juego; 11-10 es punto de juego', () => {
    let v = at(even(10));
    expect(v.now).toEqual([10, 10]);
    expect(v.deuce).toBe(true);
    expect(servesText(v)).toBe('1 saque');
    expect(v.gamePoint).toBeNull();
    // En 10-10 saca quien empezó el juego.
    expect(v.serving).toBe(1);
    v = at([...even(10), B]);
    expect(v.gamePoint).toBe(2);
    expect(v.matchPoint).toBeNull();
    expect(v.serving).toBe(2);
    v = at(times(A, 10));
    expect(v.gamePoint).toBe(1);
  });

  it('fin de juego: cambio de lado, juegos ganados y el siguiente lo empieza el otro', () => {
    const v = at(times(A, 11));
    expect(v.switchNow).toBe(true);
    expect(v.done).toEqual(['11-0']);
    expect(v.gamesWon).toEqual([1, 0]);
    expect(v.gameNo).toBe(2);
    expect(v.serving).toBe(2);
    expect(at([...times(A, 11), A]).switchNow).toBe(false);
  });

  it('la cabecera va con el lado de la izquierda primero, como las mitades', () => {
    // Empieza Ana a la izquierda; al terminar el juego 1 cambian de lado y Rosa queda a la izquierda.
    let v = at(times(A, 5));
    expect(v.gamesLeft).toEqual([0, 0]);
    v = at([...times(A, 11), ...times(B, 3)]);
    expect([v.gamesWon, v.done]).toEqual([[1, 0], ['11-0']]);
    expect([v.gamesLeft, v.doneLeft]).toEqual([[0, 1], ['0-11']]);
    // Juego 3: otra vez Ana a la izquierda.
    v = at([...times(A, 11), ...times(B, 11), A]);
    expect([v.gamesLeft, v.doneLeft]).toEqual([
      [1, 1],
      ['11-0', '0-11'],
    ]);
  });

  it('al terminar: «Gana» en individual, «Ganan» en dobles y el marcador del lado del ganador', () => {
    expect(winnerText(2, labels, '7-11 7-11 7-11', false)).toEqual({ who: 'Gana Rosa', score: '11-7 11-7 11-7' });
    expect(winnerText(1, labels, '11-7 9-11 11-5 11-8', false)).toEqual({ who: 'Gana Ana', score: '11-7 9-11 11-5 11-8' });
    expect(winnerText(2, ['Ana / Luis', 'Rosa / Pedro'], '9-11 3-5 ret.', true)).toEqual({ who: 'Ganan Rosa / Pedro', score: '11-9 5-3 ret.' });
    expect(scoreFrom('W.O.', 2)).toBe('W.O.');
  });

  it('punto de partido: le falta un juego y tiene punto de juego', () => {
    const bo3 = tableTennisAdapter(resolveRules('table_tennis', { bestOf: 3 })).engine;
    const v = ttView(replay(bo3, { firstServer: 1 }, [...times(A, 11), ...times(A, 10)]), [['Ana'], ['Rosa']], labels);
    expect(v.gamePoint).toBe(1);
    expect(v.matchPoint).toBe(1);
    expect(v.deciding).toBe(false);
    const won = ttView(replay(bo3, { firstServer: 1 }, times(A, 22)), [['Ana'], ['Rosa']], labels);
    expect(won).toMatchObject({ over: true, winner: 1, gamePoint: null, matchPoint: null, deuce: false });
  });

  it('decisivo: se cambia de lado una sola vez, cuando alguien llega a 5', () => {
    const bo3 = tableTennisAdapter(resolveRules('table_tennis', { bestOf: 3 })).engine;
    const two = [...times(A, 11), ...times(B, 11)];
    const view = (log: TableTennisEvent[]) => ttView(replay(bo3, { firstServer: 1 }, log), [['Ana'], ['Rosa']], labels);
    expect(view([...two, ...times(A, 4)]).switchNow).toBe(false);
    const five = view([...two, ...times(A, 5)]);
    expect(five).toMatchObject({ deciding: true, gameNo: 3, switchNow: true, receiveSwap: false, nextReceiver: null });
    expect(view([...two, ...times(A, 5), B]).switchNow).toBe(false);
    expect(view([...two, ...times(A, 5), ...times(B, 5)]).switchNow).toBe(false);
  });
});

describe('dobles', () => {
  const doubles = resolveRules('table_tennis', { doubles: true, bestOf: 3 });
  const engine = tableTennisAdapter(doubles).engine;
  const people = [
    ['Ana', 'Luis'],
    ['Rosa', 'Pedro'],
  ];
  const pairs = ['Ana / Luis', 'Rosa / Pedro'] as const;
  // Saca Ana (lado 1, jugador 0) y recibe primero Pedro (lado 2, jugador 1): A0 → B1 → A1 → B0.
  const at = (log: TableTennisEvent[]) => ttView(replay(engine, { firstServer: 1, firstPlayer: [0, 1] }, log), people, pairs);

  it('quién saca y quién recibe, desde la derecha', () => {
    let v = at([]);
    expect(v).toMatchObject({ serving: 1, serverName: 'Ana', receiverName: 'Pedro', servesLeft: 2, canOrder: true });
    v = at([A, B]);
    expect(v).toMatchObject({ serving: 2, serverName: 'Pedro', receiverName: 'Luis', canOrder: false });
    v = at([A, B, A, B]);
    expect(v).toMatchObject({ serverName: 'Luis', receiverName: 'Rosa' });
    v = at([A, B, A, B, A, B]);
    expect(v).toMatchObject({ serverName: 'Rosa', receiverName: 'Ana' });
  });

  it('antes del primer punto de cada juego se puede elegir el orden', () => {
    expect(at(times(A, 11)).canOrder).toBe(true);
    expect(at([...times(A, 11), B]).canOrder).toBe(false);
  });

  it('decisivo: a los 5 cambia de lado y la pareja que recibe cambia su orden (ahora recibe Pedro)', () => {
    const two = [...times(A, 11), ...times(B, 11)];
    const before = at([...two, ...times(A, 4)]);
    expect(before.receiveSwap).toBe(false);
    const v = at([...two, ...times(A, 5)]);
    // 5 jugados: turno 2, saca Luis; sin el cruce recibiría Rosa.
    expect(v).toMatchObject({ switchNow: true, receiveSwap: true, serverName: 'Luis', receiverName: 'Pedro', nextReceiver: 'Pedro' });
    // El orden nuevo sigue: Pedro le saca ahora a Ana (A0 → B0 → A1 → B1 → A0).
    const after = at([...two, ...times(A, 6)]);
    expect(after).toMatchObject({ receiveSwap: false, nextReceiver: null, serverName: 'Pedro', receiverName: 'Ana' });
  });
});

describe('adaptador del modo cancha', () => {
  const a = tableTennisAdapter(single);
  const state = (log: TableTennisEvent[]) => replay(a.engine, { firstServer: 1 }, log);

  it('sides = juegos ganados; totales con los puntos', () => {
    const s = state([...times(A, 11), ...times(B, 3)]);
    expect(a.score(s)).toMatchObject({ text: '11-0 0-3', sides: [1, 0], totals: { sets: [1, 0], games: [1, 0], points: [11, 3] } });
    expect((a.score(s).live as { sport: string }).sport).toBe('table_tennis');
  });

  it('publica cada 4 puntos, al llegar a 10-10, al cerrar un juego y al terminar (nunca por punto)', () => {
    const steps = [0, 1, 2, 3, 4].map((n) => state(times(A, n)));
    expect([1, 2, 3, 4].map((i) => a.milestone!(steps[i - 1], steps[i], A))).toEqual([false, false, false, true]);
    // 10-10.
    expect(a.milestone!(state([...even(10)].slice(0, 19)), state(even(10)), B)).toBe(true);
    // En la ventaja no publica por cada punto.
    expect(a.milestone!(state(even(10)), state([...even(10), A]), A)).toBe(false);
    // Cierre del juego (12-10) y fin del partido.
    expect(a.milestone!(state([...even(10), A]), state([...even(10), A, A]), A)).toBe(true);
    expect(a.milestone!(state(times(A, 32)), state(times(A, 33)), A)).toBe(true);
    expect(state(times(A, 33)).winner).toBe(1);
  });
});
