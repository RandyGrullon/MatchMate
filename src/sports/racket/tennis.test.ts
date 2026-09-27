import { describe, expect, it } from 'vitest';
import { replay, type Side } from '../types';
import { createRacketEngine, RULE_PRESETS, type MatchSetup, type TennisEvent, type TennisRules, type TennisState } from '.';

const P = (side: Side): TennisEvent => ({ type: 'point', side });
/** Puntos seguidos: '1122' = punto al 1, al 1, al 2, al 2. */
const pts = (seq: string) => [...seq].map((c) => P(Number(c) as Side));
/** Juegos en blanco seguidos: '12' = juego del 1 y juego del 2. */
const games = (seq: string) => [...seq].flatMap((c) => pts(c.repeat(4)));
const preset = (id: string) => RULE_PRESETS.tennis.find((p) => p.id === id)!.rules as TennisRules;

function run(log: TennisEvent[], rules: Partial<TennisRules> = {}, setup: MatchSetup = {}) {
  return replay(createRacketEngine('tennis', rules), setup, log);
}

/** Aplica jugadas una por una y devuelve cada estado. */
function steps(start: TennisState, log: TennisEvent[], rules: Partial<TennisRules> = {}) {
  const e = createRacketEngine('tennis', rules);
  const out: TennisState[] = [];
  log.reduce((s, ev) => {
    const next = e.apply(s, ev);
    out.push(next);
    return next;
  }, start);
  return out;
}

describe('puntos del juego', () => {
  it('0-15-30-40 y juego; el saque pasa al otro', () => {
    const e = createRacketEngine('tennis');
    let s = e.init({});
    expect(s.display).toEqual(['0', '0']);
    expect(s.server).toBe(1);
    expect(s.serveFrom).toBe('right');
    const texts = steps(s, pts('111')).map((x) => [x.pointsText, x.serveFrom]);
    expect(texts).toEqual([
      ['15-0', 'left'],
      ['30-0', 'right'],
      ['40-0', 'left'],
    ]);
    s = run(pts('1111'));
    expect(s.games).toEqual([1, 0]);
    expect(s.points).toEqual([0, 0]);
    expect(s.server).toBe(2);
    expect(s.won).toEqual([4, 0]);
  });

  it('iguales y ventaja (hay que ganar por 2)', () => {
    const e = createRacketEngine('tennis');
    const seq = steps(e.init({}), pts('1212121222'));
    const view = seq.map((x) => [x.pointsText, x.label, x.deuces]);
    expect(view.slice(5)).toEqual([
      ['40-40', 'Iguales', 1],
      ['AD-40', 'Ventaja', 1],
      ['40-40', 'Iguales', 2],
      ['40-AD', 'Ventaja', 2],
      ['0-0', null, 0],
    ]);
    expect(seq[5].decidingPoint).toBe(false);
    expect(seq[5].serveFrom).toBe('right');
    expect(seq[6].serveFrom).toBe('left');
    expect(seq.at(-1)!.games).toEqual([0, 1]);
  });

  it('sin ventaja: en 40-40 un punto decisivo y elige el que recibe', () => {
    const s = run(pts('121212'), { deuce: 'noad' });
    expect(s.label).toBe('Punto decisivo');
    expect(s.decidingPoint).toBe(true);
    expect(s.serveFrom).toBeNull();
    expect(run(pts('1212122'), { deuce: 'noad' }).games).toEqual([0, 1]);
  });
});

describe('sets', () => {
  it('a 6 ganando por 2: 6-4 y 7-5; 6-5 sigue', () => {
    expect(run(games('1212121211')).sets).toEqual([{ games: [6, 4] }]);
    const s65 = run(games('12121212121'));
    expect(s65.sets).toEqual([]);
    expect(s65.games).toEqual([6, 5]);
    expect(run(games('121212121211')).sets).toEqual([{ games: [7, 5] }]);
  });

  it('tie-break a 7 en 6-6: 7-6(5)', () => {
    const at66 = run(games('121212121212'));
    expect(at66.tiebreak).toBe(true);
    expect(at66.label).toBe('Tie-break');
    const s = run([...games('121212121212'), ...pts('121212121211')]);
    expect(s.sets).toEqual([{ games: [7, 6], tiebreak: [7, 5] }]);
    expect(s.tiebreak).toBe(false);
    expect(createRacketEngine('tennis').result(s).summary).toBe('7-6(5)');
  });

  it('el tie-break se gana por 2: 7-6 sigue, 8-6 termina', () => {
    const s76 = run([...games('121212121212'), ...pts('1212121212121')]);
    expect(s76.tiebreak).toBe(true);
    expect(s76.display).toEqual(['7', '6']);
    const s86 = run([...games('121212121212'), ...pts('12121212121211')]);
    expect(s86.sets[0]).toEqual({ games: [7, 6], tiebreak: [8, 6] });
    expect(createRacketEngine('tennis').result(s86).summary).toBe('7-6(6)');
  });

  it('saque en el tie-break: 1 punto y luego cada 2; derecha en pares', () => {
    const start = run(games('121212121212'));
    const seq = [start, ...steps(start, pts('1212121'))];
    expect(seq.map((x) => x.server)).toEqual([1, 2, 2, 1, 1, 2, 2, 1]);
    expect(seq.map((x) => x.serveFrom)).toEqual(['right', 'left', 'right', 'left', 'right', 'left', 'right', 'left']);
  });

  it('cambio de lado cada 6 puntos del tie-break', () => {
    const start = run(games('121212121212'));
    const seq = steps(start, pts('121212121212'));
    expect(seq.map((x, k) => (x.changeEnds ? k + 1 : 0)).filter(Boolean)).toEqual([6, 12]);
    expect(seq[5].leftSide).not.toBe(seq[4].leftSide);
  });

  it('después del tie-break saca primero el que recibió primero', () => {
    const s = run([...games('121212121212'), ...pts('1111111')]);
    expect(s.sets[0].tiebreak).toEqual([7, 0]);
    expect(s.server).toBe(2);
  });

  it('se retoma bien si el tie-break lo empezó el 2', () => {
    const s = run([...games('121212121212'), ...pts('1')], {}, { firstServer: 2 });
    expect(s.gameServer).toBe(2);
    expect(s.server).toBe(1);
  });

  it('set con ventaja (sin tie-break): 8-6', () => {
    const s = run(games('12121212121211'), { tiebreakAt: null });
    expect(s.sets).toEqual([{ games: [8, 6] }]);
    expect(run(games('121212121212'), { tiebreakAt: null }).tiebreak).toBe(false);
  });
});

describe('cambios de lado', () => {
  it('tras los juegos impares; set par cambia en el primer juego del siguiente', () => {
    const e = createRacketEngine('tennis');
    const seq = steps(e.init({}), games('1212121211' + '1'));
    const after = (g: number) => seq[g * 4 - 1];
    expect([1, 2, 3, 4, 5, 9, 10, 11].map((g) => after(g).changeEnds)).toEqual([true, false, true, false, true, true, false, true]);
    expect(after(1).leftSide).toBe(2);
  });

  it('set impar (6-3) cambia al cerrar el set', () => {
    const e = createRacketEngine('tennis');
    const seq = steps(e.init({}), games('121212111'));
    expect(seq.at(-1)!.sets).toEqual([{ games: [6, 3] }]);
    expect(seq.at(-1)!.changeEnds).toBe(true);
  });

  it('el lado inicial viene del sorteo', () => {
    const s = run(games('1'), {}, { leftSide: 2 });
    expect(s.leftSide).toBe(1);
  });
});

describe('partido', () => {
  it('mejor de 3: 6-4 6-3 termina y no admite más puntos', () => {
    const e = createRacketEngine('tennis');
    const s = replay(e, {}, games('1212121211' + '121212111'));
    expect(e.isOver(s)).toBe(true);
    expect(e.result(s)).toEqual({ winner: 1, summary: '6-4 6-3' });
    expect(s.finish).toBe('played');
    expect(() => e.apply(s, P(2))).toThrow('El partido ya terminó.');
  });

  it('súper tie-break a 10 (ganando por 2) en el set decisivo', () => {
    const rules = preset('mtb');
    const e = createRacketEngine('tennis', rules);
    const at11 = replay(e, {}, games('111111' + '222222'));
    expect(at11.tiebreak).toBe(true);
    expect(at11.matchTiebreak).toBe(true);
    expect(at11.label).toBe('Súper tie-break');
    const s109 = replay(e, {}, [...games('111111' + '222222'), ...pts('1212121212121212121')]);
    expect(s109.display).toEqual(['10', '9']);
    expect(e.isOver(s109)).toBe(false);
    const s119 = e.apply(s109, P(1));
    expect(e.result(s119)).toEqual({ winner: 1, summary: '6-0 0-6 11-9' });
    expect(s119.sets[2]).toEqual({ games: [1, 0], tiebreak: [11, 9], matchTiebreak: true });
    const s108 = replay(e, {}, [...games('111111' + '222222'), ...pts('2222222211111111' + '22')]);
    expect(e.result(s108)).toEqual({ winner: 2, summary: '6-0 0-6 8-10' });
  });

  it('mejor de 5', () => {
    const e = createRacketEngine('tennis', { bestOf: 5 });
    const s = replay(e, {}, games('111111111111'));
    expect(e.isOver(s)).toBe(false);
    const done = replay(e, {}, games('111111111111111111'));
    expect(e.result(done)).toEqual({ winner: 1, summary: '6-0 6-0 6-0' });
  });

  it('sets cortos a 4 con tie-break en 4-4', () => {
    const rules = preset('cortos');
    expect(run(games('121211'), rules).sets).toEqual([{ games: [4, 2] }]);
    expect(run(games('1212121'), rules).games).toEqual([4, 3]);
    expect(run(games('12121211'), rules).sets).toEqual([{ games: [5, 3] }]);
    expect(run(games('12121212'), rules).tiebreak).toBe(true);
  });

  it('Fast4: sin ventaja, tie-break en 3-3 a 5 con muerte súbita en 4-4', () => {
    const rules = preset('fast4');
    expect(run(pts('121212'), rules).label).toBe('Punto decisivo');
    const at33 = run(games('121212'), rules);
    expect(at33.tiebreak).toBe(true);
    const s = run([...games('121212'), ...pts('121212122')], rules);
    expect(s.sets).toEqual([{ games: [3, 4], tiebreak: [4, 5] }]);
    expect(createRacketEngine('tennis', rules).result(s).summary).toBe('3-4(4)');
  });
});

describe('dobles', () => {
  it('rotación de los cuatro: A1, B1, A2, B2', () => {
    const e = createRacketEngine('tennis', { doubles: true });
    const seq = [e.init({ firstPlayer: [0, 1] }), ...steps(e.init({ firstPlayer: [0, 1] }), games('12121'), { doubles: true })];
    const starts = seq.filter((x) => x.points[0] + x.points[1] === 0).map((x) => [x.server, x.serverPlayer]);
    expect(starts).toEqual([
      [1, 0],
      [2, 1],
      [1, 1],
      [2, 0],
      [1, 0],
      [2, 1],
    ]);
  });

  it('rotación en el tie-break y en el set siguiente', () => {
    const rules = { doubles: true };
    const start = run(games('121212121212'), rules);
    const seq = [start, ...steps(start, pts('12121212'), rules)];
    expect(seq.map((x) => [x.server, x.serverPlayer])).toEqual([
      [1, 0],
      [2, 0],
      [2, 0],
      [1, 1],
      [1, 1],
      [2, 1],
      [2, 1],
      [1, 0],
      [1, 0],
    ]);
    const after = run([...games('121212121212'), ...pts('1111111')], rules);
    expect(after.sets[0].tiebreak).toEqual([7, 0]);
    expect([after.server, after.serverPlayer]).toEqual([2, 0]);
    const next = run([...games('121212121212'), ...pts('1111111'), ...games('2')], rules);
    expect([next.server, next.serverPlayer]).toEqual([1, 1]);
  });

  it('cada pareja elige quién saca al empezar el set', () => {
    const e = createRacketEngine('tennis', { doubles: true });
    let s = e.apply(e.init({}), { type: 'order', side: 2, player: 1 });
    s = e.apply(s, { type: 'order', side: 1, player: 1 });
    expect(s.serverPlayer).toBe(1);
    s = replay(e, {}, [{ type: 'order', side: 2, player: 1 }, ...games('1')]);
    expect([s.server, s.serverPlayer]).toEqual([2, 1]);
    // La pareja que saca el juego 2 todavía puede decidir; la que ya sacó no.
    expect(e.apply(s, { type: 'order', side: 2, player: 0 }).serverPlayer).toBe(0);
    expect(() => e.apply(s, { type: 'order', side: 1, player: 1 })).toThrow('al empezar el set');
    expect(() => e.apply(e.apply(e.init({}), P(1)), { type: 'order', side: 1, player: 1 })).toThrow();
    expect(() => createRacketEngine('tennis').apply(createRacketEngine('tennis').init({}), { type: 'order', side: 1, player: 1 })).toThrow(
      'En individual no hay orden de saque.',
    );
  });
});

describe('retiro, W.O. y corrección', () => {
  it('retiro: gana el otro y queda el marcador del momento', () => {
    const e = createRacketEngine('tennis');
    const s = e.apply(replay(e, {}, [...games('1212121211' + '121'), ...pts('11')]), { type: 'retire', side: 2 });
    expect(e.result(s)).toEqual({ winner: 1, summary: '6-4 2-1 ret.' });
    expect(s.finish).toBe('retired');
    expect(s.quitter).toBe(2);
    expect(e.result(e.apply(e.init({}), { type: 'retire', side: 1 }))).toEqual({ winner: 2, summary: 'ret.' });
  });

  it('W.O. solo antes del primer punto', () => {
    const e = createRacketEngine('tennis');
    const s = e.apply(e.init({}), { type: 'walkover', side: 2 });
    expect(e.result(s)).toEqual({ winner: 1, summary: 'W.O.' });
    expect(s.finish).toBe('walkover');
    expect(() => e.apply(e.apply(e.init({}), P(1)), { type: 'walkover', side: 2 })).toThrow('Retiro');
  });

  it('corregir marcador: calcula saque y lados igual que si se hubiera jugado', () => {
    const e = createRacketEngine('tennis', { doubles: true });
    const setup: MatchSetup = { firstServer: 2, leftSide: 2 };
    const cases: [TennisEvent[], Extract<TennisEvent, { type: 'correct' }>][] = [
      [games('1212121211' + '121'), { type: 'correct', sets: [[6, 4]], games: [2, 1] }],
      [
        [...games('121212121212'), ...pts('121212121211'), ...games('12')],
        { type: 'correct', sets: [{ games: [7, 6], tiebreak: [7, 5] }], games: [1, 1] },
      ],
      [games('121212121212'), { type: 'correct', sets: [], games: [6, 6] }],
    ];
    for (const [log, fix] of cases) {
      const played = replay(e, setup, log);
      const fixed = e.apply(e.init(setup), fix);
      expect([fixed.sets, fixed.games, fixed.tiebreak, fixed.server, fixed.leftSide]).toEqual([
        played.sets,
        played.games,
        played.tiebreak,
        played.server,
        played.leftSide,
      ]);
    }
  });

  it('corregir marcador: se puede dejar terminado o pasar al súper tie-break', () => {
    const e = createRacketEngine('padel');
    const done = e.apply(e.init({}), { type: 'correct', sets: [[6, 4], [3, 6], [10, 7]], games: [0, 0] });
    expect(e.result(done)).toEqual({ winner: 1, summary: '6-4 3-6 10-7' });
    const mtb = e.apply(e.init({}), { type: 'correct', sets: [[6, 4], [3, 6]], games: [0, 0], server: 2 });
    expect(mtb.matchTiebreak).toBe(true);
    expect(mtb.server).toBe(2);
    expect(e.apply(mtb, P(1)).display).toEqual(['1', '0']);
  });

  it('corregir marcador: rechaza sets imposibles', () => {
    const e = createRacketEngine('tennis');
    const s = e.init({});
    const fix = (sets: Extract<TennisEvent, { type: 'correct' }>['sets'], g: [number, number] = [0, 0]) => () =>
      e.apply(s, { type: 'correct', sets, games: g });
    expect(fix([[6, 5]])).toThrow('Set 1 no válido: 6-5.');
    expect(fix([[8, 6]])).toThrow('no válido');
    expect(fix([[7, 6]])).not.toThrow();
    expect(fix([{ games: [7, 6], tiebreak: [7, 6] }])).toThrow('Tie-break del set 1 no válido');
    expect(fix([], [7, 0])).toThrow('Juegos no válidos');
    expect(fix([[6, 0], [6, 0], [6, 0]])).toThrow('después de terminado');
    expect(fix([[6, 0], [6, 0]], [1, 0])).toThrow('0-0');
    const retired = e.apply(s, { type: 'retire', side: 1 });
    expect(() => e.apply(retired, { type: 'correct', sets: [], games: [0, 0] })).toThrow('deshaz');
  });
});

describe('deshacer y guardar', () => {
  const log = [...games('121212121212'), ...pts('12121212121211'), ...games('2112'), ...pts('1212')];

  it('deshacer = volver a calcular sin la última jugada', () => {
    const e = createRacketEngine('tennis');
    let s = e.init({});
    const states = [s];
    for (const ev of log) states.push((s = e.apply(s, ev)));
    for (const k of [1, 48, 49, 60, log.length]) expect(replay(e, {}, log.slice(0, k - 1))).toEqual(states[k - 1]);
    // Deshacer el punto que cerró el tie-break vuelve al tie-break.
    const closeAt = 48 + 14;
    expect(replay(e, {}, log.slice(0, closeAt - 1)).tiebreak).toBe(true);
    expect(replay(e, {}, log.slice(0, closeAt)).tiebreak).toBe(false);
  });

  it('el estado es JSON: se guarda, se lee y se sigue igual', () => {
    const e = createRacketEngine('tennis', { doubles: true });
    const mid = replay(e, {}, log);
    const back = JSON.parse(JSON.stringify(mid)) as TennisState;
    expect(back).toEqual(mid);
    const more = [...pts('1111'), ...games('222222')];
    expect(more.reduce(e.apply, back)).toEqual(more.reduce(e.apply, mid));
  });

  it('no cambia el estado que recibe', () => {
    const e = createRacketEngine('tennis');
    const s = e.init({});
    const copy = structuredClone(s);
    e.apply(s, P(1));
    expect(s).toEqual(copy);
  });

  it('rechaza jugadas raras', () => {
    const e = createRacketEngine('tennis');
    const s = e.init({});
    expect(() => e.apply(s, { type: 'point', side: 3 as Side })).toThrow('Lado no válido.');
    expect(() => e.apply(s, { type: 'rally' } as unknown as TennisEvent)).toThrow('Jugada no válida para tenis o pádel.');
    expect(() => e.apply(s, null as unknown as TennisEvent)).toThrow('Jugada no válida.');
    expect(() => e.init({ firstServer: 3 as Side })).toThrow();
  });
});
