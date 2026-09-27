import { describe, expect, it } from 'vitest';
import { replay } from '../types';
import {
  basketball,
  basketballConfig,
  basketballLines,
  basketballMatchResult,
  basketballPeriodLabel,
  basketballTimeoutsLeft,
  inPenalty,
  remainingMs,
  type BasketballConfig,
  type BasketballEvent,
  type BasketballState,
} from './basketball';

const FIBA = basketballConfig('fiba');
const play = (log: BasketballEvent[], config: BasketballConfig = FIBA) => replay(basketball, config, log);
const add = (state: BasketballState, ...evs: BasketballEvent[]) => evs.reduce((s, e) => basketball.apply(s, e), state);
const times = <T>(n: number, ev: T): T[] => Array.from({ length: n }, () => ev);
const MIN = 60_000;

/** Termina el periodo actual. */
const END: BasketballEvent = { type: 'period_end' };

describe('marcador y periodos', () => {
  it('suma por periodo y arma el resumen', () => {
    const s = play([
      { type: 'score', side: 1, points: 3, player: '7' },
      { type: 'score', side: 2, points: 2 },
      END,
      { type: 'score', side: 1, points: 1, player: '7' },
      END,
      END,
      { type: 'score', side: 2, points: 2 },
      END,
    ]);
    expect(s.score).toEqual([4, 4]);
    // Empate al final del 4.º: prórroga.
    expect(s.status).toBe('playing');
    expect(s.period).toBe(5);
    expect(basketballPeriodLabel(FIBA, s.period)).toBe('Prórroga');
    const s2 = add(s, { type: 'score', side: 1, points: 2 }, END);
    expect(basketball.isOver(s2)).toBe(true);
    expect(basketball.result(s2)).toEqual({ winner: 1, summary: '6-4 (3-2, 1-0, 0-0, 0-2, pr. 2-0)' });
    expect(s2.players[0]['7']).toMatchObject({ points: 4, threes: 1, ones: 1 });
  });

  it('prórrogas seguidas hasta que alguien gane', () => {
    const s = play([END, END, END, END, END, { type: 'score', side: 2, points: 3 }, END]);
    expect(s.periodScores).toHaveLength(6);
    expect(basketballPeriodLabel(FIBA, 6)).toBe('Prórroga 2');
    expect(basketball.result(s).winner).toBe(2);
  });

  it('valida los puntos y el partido terminado', () => {
    expect(() => play([{ type: 'score', side: 1, points: 4 as 3 }])).toThrow('1, 2 o 3');
    const s = play([{ type: 'score', side: 1, points: 2 }, END, END, END, END]);
    expect(() => add(s, { type: 'score', side: 1, points: 2 })).toThrow('terminó');
  });

  it('nombres de periodo', () => {
    expect(basketballPeriodLabel(FIBA, 1)).toBe('1.er cuarto');
    expect(basketballPeriodLabel(FIBA, 2)).toBe('2.º cuarto');
    expect(basketballPeriodLabel(FIBA, 3)).toBe('3.er cuarto');
    expect(basketballPeriodLabel(basketballConfig('halves'), 2)).toBe('2.ª mitad');
  });
});

describe('faltas de equipo y bonus', () => {
  const personal = (side: 1 | 2 = 1): BasketballEvent => ({ type: 'foul', side, kind: 'personal' });

  it('desde la 5.ª falta del cuarto hay tiros libres', () => {
    let s = play(times(3, personal()));
    expect(inPenalty(s, 1)).toBe(false);
    s = add(s, personal());
    expect(s.lastFoul).toMatchObject({ teamFouls: 4, freeThrows: 0 });
    expect(inPenalty(s, 1)).toBe(true);
    s = add(s, personal());
    expect(s.lastFoul).toMatchObject({ teamFouls: 5, freeThrows: 2, possession: false });
    expect(inPenalty(s, 2)).toBe(false);
  });

  it('la ofensiva cuenta como falta de equipo pero no da tiros libres', () => {
    const s = play([...times(4, personal()), { type: 'foul', side: 1, kind: 'offensive', player: '5' }]);
    expect(s.teamFouls[0]).toBe(5);
    expect(s.lastFoul).toMatchObject({ kind: 'offensive', freeThrows: 0 });
    expect(s.players[0]['5'].fouls).toBe(1);
  });

  it('se reinician en cada cuarto', () => {
    const s = play([...times(4, personal()), END]);
    expect(s.teamFouls).toEqual([0, 0]);
    expect(inPenalty(s, 1)).toBe(false);
  });

  it('la prórroga cuenta como el 4.º cuarto', () => {
    const s = play([END, END, END, ...times(4, personal(2)), END]);
    expect(s.period).toBe(5);
    expect(s.teamFouls).toEqual([0, 4]);
    const s2 = add(s, personal(2));
    expect(s2.lastFoul).toMatchObject({ teamFouls: 5, freeThrows: 2 });
  });

  it('las técnicas del entrenador no son falta de equipo; la del jugador sí', () => {
    const s = play([
      { type: 'foul', side: 1, kind: 'coach_technical' },
      { type: 'foul', side: 1, kind: 'bench_technical' },
    ]);
    expect(s.teamFouls[0]).toBe(0);
    expect(s.lastFoul).toMatchObject({ freeThrows: 1 });
    const s2 = add(s, { type: 'foul', side: 1, kind: 'technical', player: '4' });
    expect(s2.teamFouls[0]).toBe(1);
  });

  it('mitades: bonus configurable y reinicio por mitad', () => {
    const halves = basketballConfig('halves');
    let s = play(times(6, personal()), halves);
    expect(s.lastFoul?.freeThrows).toBe(0);
    s = add(s, personal());
    expect(s.lastFoul?.freeThrows).toBe(2);
    s = add(s, END);
    expect(s.teamFouls).toEqual([0, 0]);
    expect(basketballPeriodLabel(halves, 1)).toBe('1.ª mitad');
  });
});

describe('salida de jugadores', () => {
  const foul = (kind: 'personal' | 'technical' | 'unsportsmanlike' | 'disqualifying', player = '10'): BasketballEvent => ({ type: 'foul', side: 1, kind, player });

  it('aviso con 4 y fuera con 5', () => {
    let s = play(times(4, foul('personal')));
    expect(s.players[0]['10']).toMatchObject({ fouls: 4, warning: true, out: null });
    expect(s.lastFoul?.warning).toBe(true);
    s = add(s, foul('personal'));
    expect(s.players[0]['10']).toMatchObject({ fouls: 5, warning: false, out: 'fouls' });
    expect(() => add(s, { type: 'score', side: 1, points: 2, player: '10' })).toThrow('salió');
    expect(() => add(s, foul('personal'))).toThrow('salió');
  });

  it('las técnicas y antideportivas también suman a las 5', () => {
    const s = play([foul('personal'), foul('personal'), foul('personal'), foul('technical'), foul('personal')]);
    expect(s.players[0]['10'].out).toBe('fouls');
  });

  it('2 técnicas, 2 antideportivas, 1 de cada o 1 descalificante', () => {
    expect(play([foul('technical'), foul('technical')]).players[0]['10'].out).toBe('technicals');
    expect(play([foul('unsportsmanlike'), foul('unsportsmanlike')]).players[0]['10'].out).toBe('unsportsmanlike');
    expect(play([foul('technical'), foul('unsportsmanlike')]).players[0]['10'].out).toBe('technical_unsportsmanlike');
    expect(play([foul('disqualifying')]).players[0]['10'].out).toBe('disqualifying');
    expect(play([foul('technical')]).players[0]['10'].out).toBeNull();
  });

  it('antideportiva y descalificante: 2 tiros y posesión', () => {
    expect(play([foul('unsportsmanlike')]).lastFoul).toMatchObject({ freeThrows: 2, possession: true });
    expect(play([foul('disqualifying')]).lastFoul).toMatchObject({ freeThrows: 2, possession: true, out: 'disqualifying' });
  });

  it('el entrenador sale con 2 técnicas suyas o 3 contando las del banco', () => {
    const c: BasketballEvent = { type: 'foul', side: 2, kind: 'coach_technical' };
    const b: BasketballEvent = { type: 'foul', side: 2, kind: 'bench_technical' };
    expect(play([c, c]).coaches[1].out).toBe(true);
    expect(play([c, b]).coaches[1].out).toBe(false);
    expect(play([c, b, b]).coaches[1].out).toBe(true);
    expect(play([b, b]).coaches[1].out).toBe(false);
    expect(play([b, b, b]).coaches[1].out).toBe(true);
    expect(() => play([c, c, c])).toThrow('entrenador');
  });
});

describe('tiempos muertos', () => {
  const to = (side: 1 | 2 = 1, extra: Partial<Extract<BasketballEvent, { type: 'timeout' }>> = {}): BasketballEvent => ({ type: 'timeout', side, ...extra });

  it('2 en la primera mitad, 3 en la segunda, 1 por prórroga; no se acumulan', () => {
    let s = play([to(), END, to()]);
    expect(basketballTimeoutsLeft(s, 1)).toBe(0);
    expect(basketballTimeoutsLeft(s, 2)).toBe(2);
    expect(() => add(s, to())).toThrow('No le quedan');
    s = add(s, END);
    expect(basketballTimeoutsLeft(s, 1)).toBe(3);
    s = add(s, to(), to(), END, to());
    expect(() => add(s, to())).toThrow('No le quedan');
    s = add(s, END);
    expect(s.period).toBe(5);
    expect(basketballTimeoutsLeft(s, 1)).toBe(1);
    expect(basketballTimeoutsLeft(s, 2)).toBe(1);
    s = add(s, to(2));
    expect(() => add(s, to(2))).toThrow('No le quedan');
  });

  it('máximo 2 en los últimos 2 minutos del 4.º cuarto (con reloj)', () => {
    const t0 = 1_000_000;
    let s = play([END, END, END, { type: 'clock', action: 'start', at: t0 }]);
    // Faltan 1:30.
    const late = t0 + 8.5 * MIN;
    expect(basketballTimeoutsLeft(s, 1, t0)).toBe(3);
    expect(basketballTimeoutsLeft(s, 1, late)).toBe(2);
    s = add(s, { type: 'clock', action: 'stop', at: late }, to(1, { at: late }), to(1, { at: late }));
    expect(basketballTimeoutsLeft(s, 1, late)).toBe(0);
    expect(() => add(s, to(1, { at: late }))).toThrow('últimos 2 minutos');
    // El lado 2 pidió 2 antes de los 2 minutos: le queda 1 al final.
    let s2 = play([END, END, END, { type: 'clock', action: 'start', at: t0 }, to(2, { at: t0 + MIN }), to(2, { at: t0 + 2 * MIN })]);
    expect(basketballTimeoutsLeft(s2, 2, late)).toBe(1);
    s2 = add(s2, to(2, { at: late }));
    expect(() => add(s2, to(2, { at: late }))).toThrow('No le quedan');
  });

  it('sin reloj, el anotador marca los últimos 2 minutos', () => {
    const noClock = basketballConfig('fiba', { clock: false });
    const s = play([END, END, END, to(1, { lastTwoMinutes: true }), to(1, { lastTwoMinutes: true })], noClock);
    expect(() => add(s, to(1, { lastTwoMinutes: true }))).toThrow('últimos 2 minutos');
    // Sin la marca cuenta como antes de los 2 minutos.
    expect(add(s, to(1)).timeoutsUsed.h2).toEqual([3, 0]);
  });

  it('la regla de los 2 minutos no aplica en la prórroga ni en el 2.º cuarto', () => {
    const s = play([END, to(1, { lastTwoMinutes: true }), to(1, { lastTwoMinutes: true })]);
    expect(s.lateTimeouts).toEqual([0, 0]);
  });
});

describe('reloj con marcas de tiempo', () => {
  it('se calcula con la hora, no con intervalos', () => {
    const t0 = 5_000;
    let s = play([{ type: 'clock', action: 'start', at: t0 }]);
    expect(remainingMs(s, t0 + MIN)).toBe(9 * MIN);
    s = add(s, { type: 'clock', action: 'stop', at: t0 + MIN });
    // Parado: no importa cuánto pase.
    expect(remainingMs(s, t0 + 60 * MIN)).toBe(9 * MIN);
    s = add(s, { type: 'clock', action: 'start', at: t0 + 2 * MIN }, { type: 'clock', action: 'stop', at: t0 + 2 * MIN + 10_000 });
    expect(remainingMs(s)).toBe(9 * MIN - 10_000);
    expect(() => add(s, { type: 'clock', action: 'stop', at: t0 })).toThrow('parado');
    s = add(s, { type: 'clock', action: 'set', remainingMs: 30_000 });
    expect(remainingMs(s)).toBe(30_000);
    // No baja de 0:00.
    s = add(s, { type: 'clock', action: 'start', at: 0 }, { type: 'clock', action: 'stop', at: 5 * MIN });
    expect(remainingMs(s)).toBe(0);
    expect(() => add(s, { type: 'clock', action: 'start', at: 6 * MIN })).toThrow('no le queda');
    // Cada periodo arranca con su tiempo completo.
    expect(remainingMs(add(s, END))).toBe(10 * MIN);
  });
});

describe('posesión alterna', () => {
  it('el salto la pone, cada posesión alterna y cada periodo la voltean', () => {
    let s = play([{ type: 'jump_ball', side: 1 }]);
    expect(s.arrow).toBe(2);
    s = add(s, { type: 'alternating' });
    expect(s.lastAlternating).toBe(2);
    expect(s.arrow).toBe(1);
    s = add(s, END);
    // El 2.º cuarto lo saca el lado 1 y la flecha pasa al 2.
    expect(s.lastAlternating).toBe(1);
    expect(s.arrow).toBe(2);
    expect(() => add(s, { type: 'jump_ball', side: 2 })).toThrow('ya se anotó');
    expect(() => play([{ type: 'alternating' }])).toThrow('salto inicial');
  });
});

describe('3x3', () => {
  const C3 = basketballConfig('3x3');

  it('a 21 termina antes; canastas de 1 y 2', () => {
    expect(() => play([{ type: 'score', side: 1, points: 3 }], C3)).toThrow('1 o 2');
    const s = play([...times(10, { type: 'score', side: 1, points: 2 } as BasketballEvent), { type: 'score', side: 2, points: 2 }, { type: 'score', side: 1, points: 1, player: 'a' }], C3);
    expect(s.score).toEqual([21, 2]);
    expect(basketball.result(s)).toEqual({ winner: 1, summary: '21-2' });
  });

  it('7.ª falta: 2 tiros; 10.ª: 2 tiros y posesión; no se reinician ni sacan por faltas', () => {
    const f: BasketballEvent = { type: 'foul', side: 2, kind: 'personal', player: 'x' };
    let s = play(times(6, f), C3);
    expect(s.lastFoul?.freeThrows).toBe(0);
    expect(s.players[1].x.out).toBeNull();
    s = add(s, f);
    expect(s.lastFoul).toMatchObject({ teamFouls: 7, freeThrows: 2, possession: false });
    s = add(s, f, f, f);
    expect(s.lastFoul).toMatchObject({ teamFouls: 10, freeThrows: 2, possession: true });
    expect(s.players[1].x).toMatchObject({ fouls: 10, out: null, warning: false });
    const u: BasketballEvent = { type: 'foul', side: 1, kind: 'unsportsmanlike', player: 'y' };
    expect(play([u, u], C3).players[0].y.out).toBe('unsportsmanlike');
  });

  it('1 tiempo muerto por equipo en todo el juego', () => {
    const s = play([{ type: 'timeout', side: 1 }], C3);
    expect(basketballTimeoutsLeft(s, 1)).toBe(0);
    expect(() => add(s, { type: 'timeout', side: 1 })).toThrow('No le quedan');
  });

  it('se acaba el tiempo: gana el que va arriba; empate: prórroga a 2 puntos', () => {
    expect(basketball.result(play([{ type: 'score', side: 2, points: 2 }, END], C3)).winner).toBe(2);
    let s = play([{ type: 'score', side: 1, points: 1 }, { type: 'score', side: 2, points: 1 }, END], C3);
    expect(s.period).toBe(2);
    expect(remainingMs(s)).toBeNull();
    expect(() => add(s, END)).toThrow('primero que anote 2');
    s = add(s, { type: 'score', side: 2, points: 1 });
    expect(basketball.isOver(s)).toBe(false);
    s = add(s, { type: 'score', side: 1, points: 2 });
    expect(basketball.result(s)).toEqual({ winner: 1, summary: '3-2 (pr.)' });
  });
});

describe('forfeit y default', () => {
  it('forfeit: 20-0 para el que se presentó', () => {
    const s = play([{ type: 'forfeit', side: 1 }]);
    expect(basketball.result(s)).toEqual({ winner: 2, summary: '0-20 (forfeit)' });
    expect(basketballMatchResult(s, { id: 'm', side1: 'A', side2: 'B' })).toMatchObject({ walkover: 1, winner: 2, totals: { points: [0, 20] } });
  });

  it('default: se queda el marcador si el ganador iba arriba; si no, 2-0', () => {
    const ahead = play([{ type: 'score', side: 2, points: 3 }, { type: 'default', side: 1 }]);
    expect(ahead.score).toEqual([0, 3]);
    const behind = play([{ type: 'score', side: 1, points: 3 }, { type: 'default', side: 1 }]);
    expect(behind.score).toEqual([0, 2]);
    expect(basketball.result(behind)).toEqual({ winner: 2, summary: '0-2 (se quedó sin jugadores)' });
    expect(basketballMatchResult(behind, { id: 'm', side1: 'A', side2: 'B' }).defaulted).toBe(1);
  });
});

describe('presentes, deshacer y estado JSON', () => {
  const log: BasketballEvent[] = [
    { type: 'present', side: 1, players: ['4', '5', '6'] },
    { type: 'score', side: 1, points: 2, player: '9' },
    { type: 'score', side: 2, points: 3, player: '11' },
    { type: 'foul', side: 1, kind: 'personal', player: '4' },
    { type: 'timeout', side: 2 },
  ];

  it('los presentes incluyen a quien anota; se pueden confirmar al final', () => {
    let s = play(log);
    expect(s.present[0]).toEqual(['4', '5', '6', '9']);
    s = add(s, { type: 'present', side: 1, players: ['4', '5'] });
    // Reemplaza la lista pero no saca a quien ya tiene números.
    expect(s.present[0]).toEqual(['4', '5', '9']);
    s = add(s, END, END, END, END);
    expect(s.status).toBe('final');
    s = add(s, { type: 'present', side: 2, players: ['11', '12'] });
    expect(s.present[1]).toEqual(['11', '12']);
    const lines = basketballLines(s, ['A', 'B']);
    expect(lines).toContainEqual({ player: '12', team: 'B', points: 0, ones: 0, twos: 0, threes: 0, fouls: 0 });
    expect(lines).toContainEqual({ player: '9', team: 'A', points: 2, ones: 0, twos: 1, threes: 0, fouls: 0 });
  });

  it('deshacer = replay sin la última jugada', () => {
    for (let n = 0; n <= log.length; n++) {
      expect(play(log.slice(0, n))).toEqual(log.slice(0, n).reduce((s, e) => basketball.apply(s, e), basketball.init(FIBA)));
    }
    const undone = play(log.slice(0, -1));
    expect(undone.timeoutsUsed).toEqual({});
    expect(undone.score).toEqual([2, 3]);
  });

  it('apply no cambia el estado que recibe', () => {
    const s = play(log);
    const copy = structuredClone(s);
    add(s, { type: 'score', side: 1, points: 3, player: '4' }, { type: 'foul', side: 2, kind: 'technical', player: '11' });
    expect(s).toEqual(copy);
  });

  it('el estado sobrevive a JSON y se puede seguir', () => {
    const s = play([...log, { type: 'jump_ball', side: 2 }, { type: 'clock', action: 'start', at: 10 }]);
    const back = JSON.parse(JSON.stringify(s)) as BasketballState;
    expect(back).toEqual(s);
    expect(add(back, { type: 'score', side: 1, points: 1 })).toEqual(add(s, { type: 'score', side: 1, points: 1 }));
  });

  it('una jugada inválida no rompe el estado', () => {
    const s = play(log);
    expect(() => add(s, { type: 'nope' } as unknown as BasketballEvent)).toThrow('desconocida');
    expect(s.score).toEqual([2, 3]);
  });
});
