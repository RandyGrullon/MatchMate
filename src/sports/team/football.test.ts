import { describe, expect, it } from 'vitest';
import { replay } from '../types';
import {
  activePowerPlays,
  football,
  footballCards,
  footballConfig,
  footballLines,
  footballMatchResult,
  footballPeriodLabel,
  footballTimeoutsLeft,
  foulStatus,
  minuteLabel,
  playersOnCourt,
  shootoutWinner,
  type FootballConfig,
  type FootballEvent,
  type FootballState,
} from './football';

const FIELD = footballConfig('football');
const FUTSAL = footballConfig('futsal');
const play = (log: FootballEvent[], config: FootballConfig = FIELD) => replay(football, config, log);
const add = (state: FootballState, ...evs: FootballEvent[]) => evs.reduce((s, e) => football.apply(s, e), state);
const times = <T>(n: number, ev: T): T[] => Array.from({ length: n }, () => ev);
const MIN = 60_000;
const END: FootballEvent = { type: 'period_end' };

describe('goles y minutos', () => {
  it('minuto con añadido', () => {
    expect(minuteLabel(FIELD, 1, 0)).toBe('1');
    expect(minuteLabel(FIELD, 1, 44 * MIN + 10_000)).toBe('45');
    expect(minuteLabel(FIELD, 1, 45 * MIN)).toBe('45+1');
    expect(minuteLabel(FIELD, 1, 46 * MIN + 30_000)).toBe('45+2');
    expect(minuteLabel(FIELD, 2, 0)).toBe('46');
    expect(minuteLabel(FIELD, 2, 45 * MIN + 1)).toBe('90+1');
    expect(minuteLabel(FIELD, 3, 0)).toBe('91');
    expect(minuteLabel(FIELD, 4, 15 * MIN + 5)).toBe('120+1');
    expect(minuteLabel(FUTSAL, 2, 19 * MIN)).toBe('40');
  });

  it('el minuto sale del reloj con la hora de la jugada', () => {
    const t0 = 1_000_000;
    const s = play([
      { type: 'goal', side: 1, player: '9' }, // sin reloj arrancado: sin minuto
      { type: 'clock', action: 'start', at: t0 },
      { type: 'goal', side: 2, player: '10', assist: '8', at: t0 + 22 * MIN + 5_000 },
      { type: 'added_time', minutes: 3 },
      { type: 'card', side: 1, player: '4', card: 'yellow', at: t0 + 46 * MIN },
      { type: 'goal', side: 1, player: '7', minute: '12' }, // minuto escrito a mano
    ]);
    expect(s.timeline.map((t) => t.minute)).toEqual([null, '23', '45+2', '12']);
    expect(s.addedTime).toEqual([3]);
    expect(s.players[1]['10']).toMatchObject({ goals: 1 });
    expect(s.players[1]['8']).toMatchObject({ assists: 1 });
    expect(s.score).toEqual([2, 1]);
  });

  it('autogol: suma al equipo, no al jugador', () => {
    const s = play([{ type: 'goal', side: 1, player: '5', ownGoal: true }]);
    expect(s.score).toEqual([1, 0]);
    // El 5 es del lado 2: no tiene goles, tiene un autogol.
    expect(s.players[1]['5']).toMatchObject({ goals: 0, ownGoals: 1 });
    expect(s.players[0]['5']).toBeUndefined();
    expect(s.timeline[0]).toMatchObject({ kind: 'own_goal', side: 1, player: '5' });
    expect(() => play([{ type: 'goal', side: 1, player: '5', assist: '6', ownGoal: true }])).toThrow('asistencia');
    expect(() => play([{ type: 'goal', side: 1, player: '5', assist: '5' }])).toThrow('mismo');
  });

  it('resumen, empate y fin', () => {
    const s = play([{ type: 'goal', side: 1 }, END, { type: 'goal', side: 2 }, { type: 'goal', side: 1 }, END]);
    expect(football.result(s)).toEqual({ winner: 1, summary: '2-1' });
    expect(s.periodScores).toEqual([
      [1, 0],
      [1, 1],
    ]);
    expect(footballPeriodLabel(s)).toBe('Final');
    const draw = play([END, END]);
    expect(football.result(draw)).toEqual({ winner: null, summary: '0-0' });
    expect(() => add(draw, { type: 'goal', side: 1 })).toThrow('terminó');
  });
});

describe('tarjetas', () => {
  it('la segunda amarilla es roja y el expulsado no vuelve', () => {
    const y: FootballEvent = { type: 'card', side: 2, player: '6', card: 'yellow' };
    let s = play([y]);
    expect(s.players[1]['6']).toMatchObject({ yellows: 1, red: null });
    s = add(s, y);
    expect(s.players[1]['6']).toMatchObject({ yellows: 2, red: 'second_yellow' });
    expect(s.timeline.map((t) => t.kind)).toEqual(['yellow', 'second_yellow']);
    expect(() => add(s, y)).toThrow('expulsado');
    expect(() => add(s, { type: 'goal', side: 2, player: '6' })).toThrow('expulsado');
    expect(() => add(s, { type: 'sub', side: 2, out: '6', in: '12' })).toThrow('expulsado');
    expect(playersOnCourt(s, 2)).toBe(10);
  });

  it('roja directa y tarjeta desde el banco (no cuenta como jugar)', () => {
    const s = play([{ type: 'card', side: 1, player: '14', card: 'red' }]);
    expect(s.players[0]['14']).toMatchObject({ red: 'direct', played: false });
    expect(s.present[0]).toEqual([]);
    expect(footballCards(s, ['A', 'B'])).toEqual([{ player: '14', team: 'A', yellows: 0, red: 'direct' }]);
  });
});

describe('cambios', () => {
  it('límite de 5 y uno más en la prórroga', () => {
    const cfg = footballConfig('football', { extraTime: true });
    const subs = (from: number, n: number): FootballEvent[] => Array.from({ length: n }, (_, k) => ({ type: 'sub', side: 1, out: `o${from + k}`, in: `i${from + k}` }));
    let s = play(subs(0, 5), cfg);
    expect(() => add(s, ...subs(5, 1))).toThrow('5 cambios');
    s = add(s, END, END);
    expect(s.period).toBe(3);
    s = add(s, ...subs(5, 1));
    expect(() => add(s, ...subs(6, 1))).toThrow('6 cambios');
  });

  it('sin reingreso en campo; con reingreso en sala', () => {
    const log: FootballEvent[] = [
      { type: 'sub', side: 1, out: 'a', in: 'b' },
      { type: 'sub', side: 1, out: 'b', in: 'a' },
    ];
    expect(() => play(log)).toThrow('no puede volver');
    const s = play([...log, ...log, ...log], FUTSAL);
    expect(s.subsUsed[0]).toBe(6);
    expect(s.present[0]).toEqual(['a', 'b']);
  });

  it('con alineación se valida quién está en la cancha', () => {
    const s = play([{ type: 'lineup', side: 1, players: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'], goalkeeper: '1' }]);
    expect(() => add(s, { type: 'sub', side: 1, out: '12', in: '13' })).toThrow('no está en la cancha');
    expect(() => add(s, { type: 'sub', side: 1, out: '2', in: '3' })).toThrow('ya está en la cancha');
    const s2 = add(s, { type: 'sub', side: 1, out: '1', in: '13' });
    expect(s2.onField[0]).toContain('13');
    expect(s2.onField[0]).not.toContain('1');
    // Si sale el portero, el que entra queda de portero.
    expect(s2.goalkeeper[0]).toBe('13');
    expect(() => play([{ type: 'lineup', side: 1, players: times(12, 'x').map((x, i) => x + i) }])).toThrow('Máximo 11');
  });
});

describe('porteros y vallas invictas', () => {
  it('los goles recibidos van al portero que estaba', () => {
    const s = play([
      { type: 'goalkeeper', side: 1, player: 'gk1' },
      { type: 'goalkeeper', side: 2, player: 'gk2' },
      { type: 'goal', side: 1, player: '9' },
      { type: 'goalkeeper', side: 2, player: 'gk3' },
      { type: 'goal', side: 1, player: '9' },
      { type: 'goal', side: 1, player: '5', ownGoal: true },
      END,
      END,
    ]);
    expect(s.score).toEqual([3, 0]);
    expect(s.players[1].gk2.conceded).toBe(1);
    expect(s.players[1].gk3.conceded).toBe(2);
    const lines = footballLines(s, ['A', 'B']);
    expect(lines.find((l) => l.player === 'gk1')).toMatchObject({ keeper: true, conceded: 0, cleanSheet: true });
    expect(lines.find((l) => l.player === 'gk3')).toMatchObject({ keeper: true, conceded: 2, cleanSheet: false });
    expect(lines.find((l) => l.player === '9')).toMatchObject({ goals: 2, team: 'A' });
    expect(lines.find((l) => l.player === '5')).toMatchObject({ goals: 0, ownGoals: 1, team: 'B' });
  });
});

describe('prórroga y penales', () => {
  const KO = footballConfig('football', { extraTime: true, shootout: true });

  it('empate: prórroga, luego penales aparte del marcador', () => {
    let s = play([{ type: 'goal', side: 1 }, { type: 'goal', side: 2 }, END, END], KO);
    expect(s.period).toBe(3);
    expect(footballPeriodLabel(s)).toBe('Prórroga 1');
    s = add(s, END, END);
    expect(s.status).toBe('shootout');
    expect(() => add(s, { type: 'goal', side: 1 })).toThrow('penales');
    const k = (side: 1 | 2, scored: boolean): FootballEvent => ({ type: 'shootout', side, scored });
    s = add(s, k(1, true), k(2, true), k(1, true), k(2, false), k(1, true), k(2, true), k(1, false), k(2, true));
    expect(football.isOver(s)).toBe(false);
    expect(() => add(s, k(2, true))).toThrow('otro equipo');
    s = add(s, k(1, true));
    // 4-3 y al lado 2 le queda uno: si lo falla, se acaba.
    s = add(s, k(2, false));
    expect(football.result(s)).toEqual({ winner: 1, summary: '1-1 (pen. 4-3)' });
    expect(s.score).toEqual([1, 1]);
    const r = footballMatchResult(s, { id: 'm', side1: 'A', side2: 'B' });
    expect(r.totals.goals).toEqual([1, 1]);
    expect(r.totals.shootout).toEqual([4, 3]);
    expect(r.winner).toBe(1);
  });

  it('se acaba antes si uno ya no alcanza', () => {
    const k = (side: 1 | 2, scored: boolean) => ({ side, player: null, scored }) as const;
    expect(shootoutWinner([k(1, true), k(2, false), k(1, true), k(2, false), k(1, true)], 5)).toBeNull();
    expect(shootoutWinner([k(1, true), k(2, false), k(1, true), k(2, false), k(1, true), k(2, false)], 5)).toBe(1);
    // Serie de 3 (sala).
    expect(shootoutWinner([k(1, true), k(2, false), k(1, true), k(2, false)], 3)).toBe(1);
  });

  it('muerte súbita después de 5 cada uno', () => {
    const s0 = play([END, END], footballConfig('football', { shootout: true }));
    expect(s0.status).toBe('shootout');
    const round = (a: boolean, b: boolean): FootballEvent[] => [
      { type: 'shootout', side: 2, scored: a },
      { type: 'shootout', side: 1, scored: b },
    ];
    let s = add(s0, ...round(true, true), ...round(true, true), ...round(false, false), ...round(true, true), ...round(true, true));
    expect(s.status).toBe('shootout');
    s = add(s, ...round(true, true));
    expect(s.status).toBe('shootout');
    s = add(s, { type: 'shootout', side: 2, scored: false });
    expect(s.status).toBe('shootout');
    s = add(s, { type: 'shootout', side: 1, scored: true });
    expect(football.result(s)).toEqual({ winner: 1, summary: '0-0 (pen. 6-5)' });
  });

  it('sala: tanda de 3 configurable', () => {
    const s0 = play([END, END], footballConfig('futsal', { shootout: true, shootoutKicks: 3 }));
    const s = add(
      s0,
      { type: 'shootout', side: 1, scored: true },
      { type: 'shootout', side: 2, scored: true },
      { type: 'shootout', side: 1, scored: true },
      { type: 'shootout', side: 2, scored: true },
      { type: 'shootout', side: 1, scored: false },
      { type: 'shootout', side: 2, scored: false },
    );
    expect(s.status).toBe('shootout');
    expect(add(s, { type: 'shootout', side: 1, scored: true }, { type: 'shootout', side: 2, scored: false }).winner).toBe(1);
  });

  it('prórroga que se gana sin penales', () => {
    const s = play([END, END, { type: 'goal', side: 2 }, END, END], KO);
    expect(football.result(s)).toEqual({ winner: 2, summary: '0-1 (prórroga)' });
  });
});

describe('sala: faltas acumuladas', () => {
  const f = (side: 1 | 2 = 1): FootballEvent => ({ type: 'foul', side });

  it('alerta en la 5.ª y tiro de 10 m desde la 6.ª', () => {
    let s = play(times(4, f()), FUTSAL);
    expect(s.lastFoul).toMatchObject({ count: 4, alert: false, tenMeter: false });
    expect(foulStatus(s, 1).alert).toBe(false);
    s = add(s, f());
    expect(s.lastFoul).toMatchObject({ count: 5, alert: true, tenMeter: false });
    expect(foulStatus(s, 1).alert).toBe(true);
    s = add(s, f());
    expect(s.lastFoul).toMatchObject({ count: 6, tenMeter: true });
    s = add(s, f());
    expect(s.lastFoul).toMatchObject({ count: 7, tenMeter: true });
  });

  it('se reinician en el descanso; la prórroga sigue con la 2.ª mitad', () => {
    const cfg = footballConfig('futsal', { extraTime: true });
    let s = play([...times(5, f()), END], cfg);
    expect(s.fouls).toEqual([0, 0]);
    s = add(s, ...times(4, f(2)), END);
    expect(s.period).toBe(3);
    expect(s.fouls).toEqual([0, 4]);
    s = add(s, f(2), END);
    expect(s.period).toBe(4);
    s = add(s, f(2));
    expect(s.lastFoul).toMatchObject({ count: 6, tenMeter: true });
  });

  it('en campo no hay alerta de acumuladas', () => {
    const s = play([...times(6, f()), { type: 'foul', side: 1, player: '3' }]);
    expect(s.lastFoul).toBeNull();
    expect(s.players[0]['3'].fouls).toBe(1);
  });
});

describe('sala: tiempos muertos', () => {
  it('1 por mitad y ninguno en la prórroga', () => {
    const cfg = footballConfig('futsal', { extraTime: true });
    let s = play([{ type: 'timeout', side: 1 }], cfg);
    expect(footballTimeoutsLeft(s, 1)).toBe(0);
    expect(footballTimeoutsLeft(s, 2)).toBe(1);
    expect(() => add(s, { type: 'timeout', side: 1 })).toThrow('esta mitad');
    s = add(s, END);
    expect(footballTimeoutsLeft(s, 1)).toBe(1);
    s = add(s, { type: 'timeout', side: 1 }, END);
    expect(footballTimeoutsLeft(s, 2)).toBe(0);
    expect(() => add(s, { type: 'timeout', side: 2 })).toThrow('prórroga');
    expect(() => play([{ type: 'timeout', side: 1 }])).toThrow('no hay tiempos muertos');
  });
});

describe('sala: 2 minutos tras una roja', () => {
  const t0 = 10_000_000;
  const red = (side: 1 | 2, player: string, at: number): FootballEvent => ({ type: 'card', side, player, card: 'red', at });
  const start: FootballEvent = { type: 'clock', action: 'start', at: t0 };

  it('dura 2 minutos de juego (con reloj parado no corre)', () => {
    let s = play([start, red(1, '4', t0 + MIN)], FUTSAL);
    expect(playersOnCourt(s, 1, t0 + MIN)).toBe(4);
    expect(activePowerPlays(s, t0 + 2 * MIN)).toEqual([{ side: 1, player: '4', remainingMs: MIN }]);
    s = add(s, { type: 'clock', action: 'stop', at: t0 + 2 * MIN });
    // Parado: sigue faltando 1 minuto aunque pase la hora.
    expect(activePowerPlays(s, t0 + 30 * MIN)[0].remainingMs).toBe(MIN);
    s = add(s, { type: 'clock', action: 'start', at: t0 + 5 * MIN });
    expect(playersOnCourt(s, 1, t0 + 6 * MIN - 1)).toBe(4);
    expect(playersOnCourt(s, 1, t0 + 6 * MIN)).toBe(5);
  });

  it('5 contra 4: si marca el que tiene más, el otro completa', () => {
    const s = play([start, red(1, '4', t0), { type: 'goal', side: 2, at: t0 + 30_000 }], FUTSAL);
    expect(playersOnCourt(s, 1, t0 + 30_000)).toBe(5);
    expect(s.powerPlays[0].endedBy).toBe('goal');
  });

  it('si marca el que tiene menos, o están 4 contra 4, no cambia nada', () => {
    const fewer = play([start, red(1, '4', t0), { type: 'goal', side: 1, at: t0 + 30_000 }], FUTSAL);
    expect(playersOnCourt(fewer, 1, t0 + 30_000)).toBe(4);
    const even = play([start, red(1, '4', t0), red(2, '8', t0 + 10_000), { type: 'goal', side: 2, at: t0 + 30_000 }], FUTSAL);
    expect(playersOnCourt(even, 1, t0 + 30_000)).toBe(4);
    expect(playersOnCourt(even, 2, t0 + 30_000)).toBe(4);
  });

  it('5 contra 3: un gol solo devuelve un jugador', () => {
    const s = play([start, red(1, '4', t0), red(1, '5', t0 + 10_000), { type: 'goal', side: 2, at: t0 + 30_000 }], FUTSAL);
    expect(playersOnCourt(s, 1, t0 + 30_000)).toBe(4);
    // Se libera el castigo más antiguo.
    expect(s.powerPlays.map((p) => p.endedBy)).toEqual(['goal', null]);
  });

  it('sigue en la 2.ª mitad y se puede cerrar a mano', () => {
    let s = play([start, red(2, '9', t0 + 19 * MIN), { type: 'period_end', at: t0 + 20 * MIN }], FUTSAL);
    expect(activePowerPlays(s)[0].remainingMs).toBe(MIN);
    s = add(s, { type: 'power_play_end', side: 2 });
    expect(activePowerPlays(s)).toEqual([]);
    expect(() => add(s, { type: 'power_play_end', side: 2 })).toThrow('2 minutos');
  });

  it('en campo la roja deja al equipo con uno menos todo el partido', () => {
    const s = play([red(1, '4', 0)]);
    expect(s.powerPlays).toEqual([]);
    expect(playersOnCourt(s, 1)).toBe(10);
  });
});

describe('W.O., resultado y deshacer', () => {
  it('W.O. 3-0', () => {
    const s = play([{ type: 'walkover', side: 2 }]);
    expect(football.result(s)).toEqual({ winner: 1, summary: '3-0 (W.O.)' });
    expect(footballMatchResult(s, { id: 'm', side1: 'A', side2: 'B' })).toMatchObject({ walkover: 2, totals: { goals: [3, 0] } });
    expect(footballLines(add(s, { type: 'present', side: 1, players: ['1'] }), ['A', 'B'])[0].cleanSheet).toBe(false);
  });

  it('tarjetas por tipo para el juego limpio', () => {
    const s = play([
      { type: 'card', side: 1, player: 'a', card: 'yellow' },
      { type: 'card', side: 1, player: 'b', card: 'yellow' },
      { type: 'card', side: 1, player: 'b', card: 'yellow' },
      { type: 'card', side: 2, player: 'c', card: 'red' },
      { type: 'card', side: 2, player: 'd', card: 'yellow' },
      { type: 'card', side: 2, player: 'd', card: 'red' },
    ]);
    const r = footballMatchResult(s, { id: 'm', side1: 'A', side2: 'B' });
    expect(r.totals).toMatchObject({
      yellow: [3, 1],
      red: [1, 2],
      cardsYellow: [1, 0],
      cardsSecondYellow: [1, 0],
      cardsRed: [0, 1],
      cardsYellowRed: [0, 1],
    });
  });

  it('deshacer = replay sin la última; el estado es JSON', () => {
    const log: FootballEvent[] = [
      { type: 'lineup', side: 1, players: ['1', '2', '3', '4', '5'], goalkeeper: '1' },
      { type: 'clock', action: 'start', at: 0 },
      { type: 'goal', side: 1, player: '3', at: 5 * MIN },
      { type: 'card', side: 2, player: '7', card: 'red', at: 6 * MIN },
      { type: 'foul', side: 2, at: 7 * MIN },
      { type: 'sub', side: 1, out: '2', in: '6', at: 8 * MIN },
    ];
    for (let n = 0; n <= log.length; n++) {
      expect(play(log.slice(0, n), FUTSAL)).toEqual(log.slice(0, n).reduce((s, e) => football.apply(s, e), football.init(FUTSAL)));
    }
    const s = play(log, FUTSAL);
    const undone = play(log.slice(0, -1), FUTSAL);
    expect(undone.onField[0]).toEqual(['1', '2', '3', '4', '5']);
    expect(undone.subsUsed).toEqual([0, 0]);
    const back = JSON.parse(JSON.stringify(s)) as FootballState;
    expect(back).toEqual(s);
    const copy = structuredClone(s);
    add(s, { type: 'goal', side: 2, at: 9 * MIN });
    expect(s).toEqual(copy);
  });
});
