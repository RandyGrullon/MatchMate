import { describe, expect, it } from 'vitest';
import { replay, type Side } from '../types';
import { createRacketEngine, RULE_PRESETS, type TennisEvent, type TennisRules, type TennisState } from '.';

const P = (side: Side): TennisEvent => ({ type: 'point', side });
const pts = (seq: string) => [...seq].map((c) => P(Number(c) as Side));
const games = (seq: string) => [...seq].flatMap((c) => pts(c.repeat(4)));
const preset = (id: string) => RULE_PRESETS.padel.find((p) => p.id === id)!.rules as TennisRules;

function run(log: TennisEvent[], rules: Partial<TennisRules> = {}) {
  return replay(createRacketEngine('padel', rules), {}, log);
}

function steps(log: TennisEvent[], rules: Partial<TennisRules> = {}) {
  const e = createRacketEngine('padel', rules);
  const out: TennisState[] = [];
  log.reduce((s, ev) => {
    const next = e.apply(s, ev);
    out.push(next);
    return next;
  }, e.init({}));
  return out;
}

describe('pádel', () => {
  it('por defecto: dobles, punto de oro, al mejor de 3 con súper tie-break a 10', () => {
    const s = createRacketEngine('padel').init({});
    expect(s.rules).toMatchObject({ sport: 'padel', doubles: true, deuce: 'golden', bestOf: 3, finalSet: 'tiebreak', finalTiebreakTo: 10 });
    expect(s.sport).toBe('padel');
  });

  it('punto de oro en 40-40: la pareja que recibe elige lado', () => {
    const s = run(pts('121212'));
    expect(s.pointsText).toBe('40-40');
    expect(s.label).toBe('Punto de oro');
    expect(s.decidingPoint).toBe(true);
    expect(s.serveFrom).toBeNull();
    expect(run(pts('1212122')).games).toEqual([0, 1]);
    expect(run(pts('1212121')).games).toEqual([1, 0]);
  });

  it('con ventaja (opción de la liga)', () => {
    const seq = steps(pts('12121212'), { deuce: 'ad' });
    expect(seq.slice(5).map((x) => [x.pointsText, x.label])).toEqual([
      ['40-40', 'Iguales'],
      ['AD-40', 'Ventaja'],
      ['40-40', 'Iguales'],
    ]);
  });

  it('Star Point: dos ventajas y luego punto decisivo', () => {
    const rules = preset('star');
    const seq = steps(pts('1212121212' + '2'), rules);
    expect(seq.slice(5).map((x) => [x.pointsText, x.label, x.deuces, x.decidingPoint])).toEqual([
      ['40-40', 'Iguales', 1, false],
      ['AD-40', 'Ventaja', 1, false],
      ['40-40', 'Iguales', 2, false],
      ['AD-40', 'Ventaja', 2, false],
      ['40-40', 'Star point', 3, true],
      ['0-0', null, 0, false],
    ]);
    expect(seq[9].serveFrom).toBeNull();
    expect(seq.at(-1)!.games).toEqual([0, 1]);
    // Con la primera ventaja se puede ganar el juego como siempre.
    expect(run(pts('12121211'), rules).games).toEqual([1, 0]);
    expect(run(pts('1212121211'), rules).games).toEqual([1, 0]);
  });

  it('Star Point con 1 sola ventaja', () => {
    const rules = { ...preset('star'), starAdvantages: 1 };
    expect(run(pts('121212'), rules).label).toBe('Iguales');
    expect(run(pts('12121212'), rules).label).toBe('Star point');
  });

  it('6-4 3-6 10-7 con súper tie-break', () => {
    const e = createRacketEngine('padel');
    const log = [...games('1212121211'), ...games('121212222'), ...pts('1111111' + '2222222' + '111')];
    const s = replay(e, {}, log);
    expect(e.result(s)).toEqual({ winner: 1, summary: '6-4 3-6 10-7' });
    expect(s.sets.map((x) => x.games)).toEqual([
      [6, 4],
      [3, 6],
      [1, 0],
    ]);
  });

  it('tercer set completo si la liga lo pide', () => {
    const rules = preset('tres-sets');
    const s = run(games('111111' + '222222'), rules);
    expect(s.tiebreak).toBe(false);
    const done = run(games('111111' + '222222' + '1212121211'), rules);
    expect(createRacketEngine('padel', rules).result(done)).toEqual({ winner: 1, summary: '6-0 0-6 6-4' });
  });

  it('rotación de saque de las dos parejas y cambio de lado en juegos impares', () => {
    const e = createRacketEngine('padel');
    const log = games('2121');
    let s = e.init({ firstServer: 2, firstPlayer: [1, 0] });
    const starts = [[s.server, s.serverPlayer, s.leftSide]];
    for (const ev of log) {
      s = e.apply(s, ev);
      if (s.points[0] + s.points[1] === 0) starts.push([s.server, s.serverPlayer, s.leftSide]);
    }
    expect(starts).toEqual([
      [2, 0, 1],
      [1, 1, 2],
      [2, 1, 2],
      [1, 0, 1],
      [2, 0, 1],
    ]);
  });

  it('no se juega en individual ni con reglas de tenis', () => {
    expect(() => createRacketEngine('padel', { doubles: false })).toThrow('El pádel siempre es en dobles.');
    expect(() => createRacketEngine('padel', { deuce: 'noad' })).toThrow('punto de oro, ventaja o Star Point');
    expect(() => createRacketEngine('tennis', { deuce: 'golden' })).toThrow('con ventaja o sin ventaja');
  });

  it('en el súper tie-break se cambia de lado cada 6 puntos y el saque sigue la rotación', () => {
    const e = createRacketEngine('padel');
    const start = replay(e, {}, games('111111' + '222222'));
    // 12 juegos jugados desde el sorteo: el súper tie-break lo empieza el lado 1.
    expect([start.server, start.serverPlayer]).toEqual([1, 0]);
    const seq = pts('121212').reduce<TennisState[]>((acc, ev) => [...acc, e.apply(acc.at(-1)!, ev)], [start]);
    expect(seq.map((x) => x.server)).toEqual([1, 2, 2, 1, 1, 2, 2]);
    expect(seq.at(-1)!.changeEnds).toBe(true);
  });
});
