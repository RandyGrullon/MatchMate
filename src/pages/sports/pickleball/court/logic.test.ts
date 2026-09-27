import { describe, expect, it } from 'vitest';
import { replay } from '../../../../sports/types';
import { resolveRules, type PickleballEvent } from '../../../../sports/racket';
import { gamePoints, gameScore, pickleballAdapter, pickleView } from './logic';

const doubles = resolveRules('pickleball', {});
const people = [
  ['Ana', 'Luis'],
  ['Rosa', 'Pedro'],
];
const labels = ['Ana / Luis', 'Rosa / Pedro'] as const;
const S: PickleballEvent = { type: 'rally', won: 'serving' };
const R: PickleballEvent = { type: 'rally', won: 'receiving' };

describe('lo que se ve en la cancha de pickleball (dobles tradicional)', () => {
  const engine = pickleballAdapter(doubles).engine;
  const at = (log: PickleballEvent[]) => pickleView(replay(engine, { firstServer: 1, firstPlayer: [0, 0] }, log), people, labels);

  it('empieza en 0-0-2: un solo sacador, el de la derecha', () => {
    const v = at([]);
    expect(v.call).toBe('0-0-2');
    expect(v.parts).toEqual([0, 0, 2]);
    expect(v.serverName).toBe('Ana');
    expect(v.from).toBe('derecha');
    expect(v.firstServe).toBe(true);
    expect(v.spots[0]).toMatchObject({ right: 'Ana', left: 'Luis', serving: true, server: 'Ana' });
    expect(v.spots[1]).toMatchObject({ right: 'Rosa', left: 'Pedro', serving: false, server: null });
  });

  it('el que saca puntúa: cambia de lugar con su compañero y sigue sacando', () => {
    const v = at([S]);
    expect(v.call).toBe('1-0-2');
    expect(v.serverName).toBe('Ana');
    expect(v.from).toBe('izquierda');
    expect(v.spots[0]).toMatchObject({ right: 'Luis', left: 'Ana' });
    expect(v.firstServe).toBe(false);
  });

  it('pierde el primer turno: side-out; saca el de la derecha del otro lado como sacador 1, luego el 2', () => {
    let v = at([S, R]);
    expect(v.call).toBe('0-1-1');
    expect(v.serverName).toBe('Rosa');
    expect(v.serving).toBe(2);
    v = at([S, R, R]);
    expect(v.call).toBe('0-1-2');
    expect(v.serverName).toBe('Pedro');
    expect(v.from).toBe('izquierda');
    v = at([S, R, R, R]);
    expect(v.call).toBe('1-0-1');
    expect(v.serving).toBe(1);
    // A la derecha está Luis (Ana se cambió al puntuar): él es el sacador 1.
    expect(v.serverName).toBe('Luis');
  });

  it('fin del juego: se ve el marcador del juego y queda el ganador', () => {
    const log = Array.from({ length: 11 }, () => S);
    const s = replay(engine, { firstServer: 1 }, log);
    const v = pickleView(s, people, labels);
    expect(v.over).toBe(true);
    expect(v.winner).toBe(1);
    expect(v.done).toEqual(['11-0']);
    expect(v.call).toBe('');
    expect(gamePoints(s)).toEqual([11, 0]);
    expect(gameScore(s)).toMatchObject({ text: '11-0', sides: [11, 0] });
  });

  it('en el juego decisivo se cambia de lado a los 6', () => {
    const bo3 = resolveRules('pickleball', { bestOf: 3 });
    const e = pickleballAdapter(bo3).engine;
    const game = Array.from({ length: 11 }, () => S);
    // Gana un juego cada uno (el 2.º lo empieza a sacar el lado 2) y en el 3.º el que saca llega a 6.
    const g2: PickleballEvent[] = Array.from({ length: 11 }, () => S);
    const s = replay(e, { firstServer: 1 }, [...game, ...g2]);
    expect(s.games).toEqual([
      [11, 0],
      [0, 11],
    ]);
    const first = s.server;
    const six = Array.from({ length: 6 }, () => S);
    const after = replay(e, { firstServer: 1 }, [...game, ...g2, ...six]);
    const v = pickleView(after, people, labels);
    expect(v.deciding).toBe(true);
    expect(v.switchNow).toBe(true);
    expect(after.server).toBe(first);
    expect(v.gameNo).toBe(3);
  });
});

describe('individual y rally', () => {
  it('individual: canto de dos números y lado por la paridad', () => {
    const r = resolveRules('pickleball', { doubles: false });
    const e = pickleballAdapter(r).engine;
    const v = pickleView(replay(e, { firstServer: 2 }, [S]), [['Ana'], ['Rosa']], ['Ana', 'Rosa']);
    expect(v.call).toBe('1-0');
    expect(v.serverNumber).toBeNull();
    expect(v.serverName).toBe('Rosa');
    expect(v.from).toBe('izquierda');
    expect(v.spots[1]).toMatchObject({ right: 'Rosa', left: null, serving: true });
  });

  it('rally: sin segundo sacador; el que recibe suma y recupera el saque', () => {
    const r = resolveRules('pickleball', { scoring: 'rally', gameTo: 21 });
    const e = pickleballAdapter(r).engine;
    const v = pickleView(replay(e, { firstServer: 1 }, [R]), people, labels);
    expect(v.call).toBe('1-0');
    expect(v.serving).toBe(2);
    expect(v.firstServe).toBe(false);
  });
});

describe('adaptador del modo cancha', () => {
  it('partido a juegos: sides = juegos ganados; juego del round robin: sides = puntos', () => {
    const bo3 = resolveRules('pickleball', { bestOf: 3 });
    const sets = pickleballAdapter(bo3, 'sets');
    const s = replay(sets.engine, { firstServer: 1 }, Array.from({ length: 11 }, () => S));
    expect(sets.score(s)).toMatchObject({ text: '11-0', sides: [1, 0], totals: { sets: [1, 0], points: [11, 0] } });
    const game = pickleballAdapter(doubles, 'game');
    const g = replay(game.engine, { firstServer: 1 }, [S, S, R]);
    expect(game.score(g)).toMatchObject({ text: '2-0', sides: [2, 0] });
  });

  it('publica cada 4 puntos, al cerrar un juego o al terminar (nunca por punto)', () => {
    const a = pickleballAdapter(doubles, 'game');
    const states = [0, 1, 2, 3, 4].map((n) => replay(a.engine, { firstServer: 1 }, Array.from({ length: n }, () => S)));
    expect([1, 2, 3, 4].map((i) => a.milestone!(states[i - 1], states[i], S))).toEqual([false, false, false, true]);
    // Un side-out no suma puntos: no publica.
    expect(a.milestone!(states[1], replay(a.engine, { firstServer: 1 }, [S, R]), R)).toBe(false);
    const end = replay(a.engine, { firstServer: 1 }, Array.from({ length: 11 }, () => S));
    const before = replay(a.engine, { firstServer: 1 }, Array.from({ length: 10 }, () => S));
    expect(a.milestone!(before, end, S)).toBe(true);
  });
});
