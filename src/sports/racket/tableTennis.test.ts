import { describe, expect, it } from 'vitest';
import { replay, type Side } from '../types';
import {
  applyRacket,
  completeMatch,
  createRacketEngine,
  defaultRules,
  initRacket,
  isGameSport,
  isGameSportRules,
  matchTotals,
  needed,
  nextRotation,
  normalizeGames,
  racketResult,
  resolveRules,
  RULE_PRESETS,
  rotationOf,
  serveTurn,
  servesLeftAt,
  stateFromScore,
  swapReceivers,
  toLive,
  toMatchResult,
  validateRules,
  type MatchSetup,
  type Player,
  type RacketState,
  type ServeSlot,
  type TableTennisEvent,
  type TableTennisRules,
  type TableTennisState,
} from '.';

const P = (side: Side): TableTennisEvent => ({ type: 'point', side });
/** '1122' = puntos del lado 1, 1, 2, 2. */
const pts = (seq: string) => [...seq].map((c) => P(Number(c) as Side));
/** Un juego 11-0 para `side`. */
const love = (side: 1 | 2) => pts(String(side).repeat(11));
const engine = (rules: Partial<TableTennisRules> = {}) => createRacketEngine('table_tennis', rules);
const run = (log: TableTennisEvent[], rules: Partial<TableTennisRules> = {}, setup: MatchSetup = {}) => replay(engine(rules), setup, log);

/** Estados antes de cada jugada y el final: [inicio, tras la 1.ª, …]. */
function states(log: TableTennisEvent[], rules: Partial<TableTennisRules> = {}, setup: MatchSetup = {}, start?: TableTennisState): TableTennisState[] {
  const e = engine(rules);
  const out = [start ?? e.init(setup)];
  for (const ev of log) out.push(e.apply(out[out.length - 1], ev));
  return out;
}

/** Turno de dobles como texto: 'A0' = lado 1, jugador 0. */
const slot = (x: ServeSlot) => `${x.side === 1 ? 'A' : 'B'}${x.player}`;
const rot = (s: Pick<TableTennisState, 'rotation'>) => s.rotation.map(slot);
/** Quién saca y quién recibe el próximo punto: 'A0>B1'. */
const turn = (s: TableTennisState) => `${s.server === 1 ? 'A' : 'B'}${s.serverPlayer}>${s.server === 1 ? 'B' : 'A'}${s.receiverPlayer}`;

const DOUBLES: Partial<TableTennisRules> = { doubles: true };
/** Sorteo de los ejemplos: saca A0 y la pareja B elige que reciba B1. */
const SETUP: MatchSetup = { firstServer: 1, firstPlayer: [0, 1] };

describe('reglas del ping pong', () => {
  it('por defecto: individual, al mejor de 5 juegos a 11 ganando por 2, cambio a los 5 del decisivo', () => {
    expect(defaultRules('table_tennis')).toEqual({ sport: 'table_tennis', doubles: false, gameTo: 11, winBy: 2, bestOf: 5, switchAt: 5 });
    const s = engine().init({});
    expect(s.rules).toEqual(defaultRules('table_tennis'));
    expect(initRacket(defaultRules('table_tennis')).sport).toBe('table_tennis');
    expect([s.server, s.serverPlayer, s.receiverPlayer, s.servesLeft, s.serveFrom, s.call, s.label]).toEqual([1, 0, 0, 2, null, '0-0', null]);
    expect([s.rotation, s.gameRotation, s.leftSide, s.changeEnds, s.receiveSwap]).toEqual([[], [], 1, false, false]);
  });

  it('las reglas por defecto son una copia nueva cada vez', () => {
    const r = defaultRules('table_tennis');
    r.bestOf = 7;
    expect(defaultRules('table_tennis').bestOf).toBe(5);
    expect(RULE_PRESETS.table_tennis[0].rules.bestOf).toBe(5);
  });

  it('plantillas: al mejor de 5, 3 y 7, en individual y en dobles', () => {
    expect(RULE_PRESETS.table_tennis.map((p) => [p.id, p.rules.doubles, p.rules.bestOf])).toEqual([
      ['bo5', false, 5],
      ['bo3', false, 3],
      ['bo7', false, 7],
      ['dobles', true, 5],
      ['dobles-bo3', true, 3],
      ['dobles-bo7', true, 7],
    ]);
    for (const p of RULE_PRESETS.table_tennis) expect(validateRules(p.rules)).toEqual([]);
  });

  it('valida: al mejor de 3, 5 o 7; juego a 11 ganando por 2; cambio de lado a los 5 o sin aviso', () => {
    const base = defaultRules('table_tennis');
    expect(validateRules({ ...base, bestOf: 7 })).toEqual([]);
    expect(validateRules({ ...base, switchAt: null })).toEqual([]);
    const bad = (patch: Record<string, unknown>) => validateRules({ ...base, ...patch } as unknown as TableTennisRules);
    expect(bad({ bestOf: 1 })).toEqual(['El partido es al mejor de 3, 5 o 7 juegos.']);
    expect(bad({ bestOf: 9 })).toEqual(['El partido es al mejor de 3, 5 o 7 juegos.']);
    expect(bad({ gameTo: 21 })).toEqual(['El juego es a 11 puntos.']);
    expect(bad({ winBy: 1 })).toEqual(['El juego se gana por 2.']);
    expect(bad({ switchAt: 6 })).toEqual(['El cambio de lado del juego decisivo es a los 5 puntos.']);
    expect(bad({ doubles: 'si' })).toEqual(['Falta decir si es individual o dobles.']);
    expect(() => engine({ bestOf: 1 as 3 })).toThrow('El partido es al mejor de 3, 5 o 7 juegos.');
    expect(() => createRacketEngine('table_tennis', { gameTo: 21 as 11 })).toThrow('El juego es a 11 puntos.');
  });

  it('resolveRules no recalcula el cambio de lado (como sí hace pickleball)', () => {
    expect(resolveRules('table_tennis', { bestOf: 7 })).toEqual({ ...defaultRules('table_tennis'), bestOf: 7 });
    expect(resolveRules('table_tennis', { switchAt: null }).switchAt).toBeNull();
    expect(resolveRules('table_tennis', { sport: 'tennis' } as unknown as Partial<TableTennisRules>).sport).toBe('table_tennis');
  });

  it('deportes a juegos: pickleball y ping pong', () => {
    expect(['pickleball', 'table_tennis', 'tennis', 'padel', 'bowling', null, undefined].map(isGameSport)).toEqual([true, true, false, false, false, false, false]);
    expect([defaultRules('table_tennis'), defaultRules('pickleball'), defaultRules('tennis')].map(isGameSportRules)).toEqual([true, true, false]);
  });

  it('juegos terminados al mejor de 7: hacen falta 4', () => {
    const r = { ...defaultRules('table_tennis'), bestOf: 7 as const };
    expect(needed(7)).toBe(4);
    const g: [number, number][] = [
      [11, 9],
      [9, 11],
      [11, 13],
      [12, 10],
      [5, 11],
      [11, 7],
      [14, 12],
    ];
    expect(normalizeGames(r, g)).toEqual(g);
    expect(() => normalizeGames(r, [...g, [11, 0]])).toThrow('El partido es a 7 juegos como máximo.');
    expect(() => normalizeGames({ ...r, bestOf: 5 }, [[11, 0], [11, 0], [11, 0], [11, 0]])).toThrow('Hay juegos después de terminado el partido.');
    expect(() => normalizeGames(r, [[11, 10]])).toThrow('Juego 1 no válido: 11-10.');
    expect(() => normalizeGames(r, [[13, 10]])).toThrow('Juego 1 no válido: 13-10.');
  });
});

describe('saque en individual', () => {
  it('ayudas: turno cada 2 puntos y cada punto desde 10-10', () => {
    expect([0, 1, 2, 3, 18, 19, 20, 21, 22, 25].map((n) => serveTurn(n))).toEqual([0, 0, 1, 1, 9, 9, 10, 11, 12, 15]);
    expect([0, 1, 2, 3, 18, 19, 20, 21, 30].map((n) => servesLeftAt(n))).toEqual([2, 1, 2, 1, 2, 1, 1, 1, 1]);
  });

  it('saca A los puntos 1-2, B los 3-4… B los 19-20; en 10-10 saca quien empezó y luego uno cada uno', () => {
    const seq = states(pts('12'.repeat(10)));
    const expected: Side[] = [];
    for (let k = 0; k < 20; k++) expected.push(Math.floor(k / 2) % 2 === 0 ? 1 : 2);
    expect(seq.slice(0, 20).map((s) => s.server)).toEqual(expected);
    expect(expected.slice(0, 6)).toEqual([1, 1, 2, 2, 1, 1]);
    expect(seq.slice(0, 20).map((s) => s.servesLeft)).toEqual(Array.from({ length: 20 }, (_, k) => (k % 2 === 0 ? 2 : 1)));
    const deuce = seq[20];
    expect([deuce.score, deuce.server, deuce.servesLeft, deuce.label, deuce.call]).toEqual([[10, 10], 1, 1, 'Un saque cada uno', '10-10']);
    const after = states(pts('1212'), {}, {}, deuce);
    expect(after.map((s) => [s.score.join('-'), s.server, s.servesLeft, s.label])).toEqual([
      ['10-10', 1, 1, 'Un saque cada uno'],
      ['11-10', 2, 1, 'Un saque cada uno'],
      ['11-11', 1, 1, 'Un saque cada uno'],
      ['12-11', 2, 1, 'Un saque cada uno'],
      ['12-12', 1, 1, 'Un saque cada uno'],
    ]);
  });

  it('el canto va con los puntos de quien saca primero', () => {
    const seq = states(pts('1112221'));
    expect(seq.map((s) => [s.server, s.call])).toEqual([
      [1, '0-0'],
      [1, '1-0'],
      [2, '0-2'],
      [2, '0-3'],
      [1, '3-1'],
      [1, '3-2'],
      [2, '3-3'],
      [2, '3-4'],
    ]);
  });

  it('con ventaja: 11-10 sigue, 12-10 termina; 11-9 termina', () => {
    const at1010 = run(pts('12'.repeat(10)));
    const e = engine();
    const s1 = e.apply(at1010, P(1));
    expect([s1.games, s1.score]).toEqual([[], [11, 10]]);
    const s2 = e.apply(s1, P(1));
    expect([s2.games, s2.score]).toEqual([[[12, 10]], [0, 0]]);
    const quick = run([...pts('12'.repeat(9)), ...pts('11')]);
    expect(quick.games).toEqual([[11, 9]]);
    // Un juego largo: 16-14.
    const long = run([...pts('12'.repeat(14)), ...pts('11')]);
    expect(long.games).toEqual([[16, 14]]);
  });

  it('el juego siguiente lo empieza a sacar el otro lado', () => {
    const seq = states([...love(1), ...love(2), ...love(1)]);
    expect([seq[11].games.length, seq[11].server, seq[11].gameFirstServer]).toEqual([1, 2, 2]);
    expect([seq[22].games.length, seq[22].server, seq[22].gameFirstServer]).toEqual([2, 1, 1]);
    // Con el sorteo al revés.
    const b = run(love(2), {}, { firstServer: 2 });
    expect([b.server, b.gameFirstServer]).toEqual([1, 1]);
  });

  it('al mejor de 3, 5 o 7: termina a los 2, 3 o 4 juegos ganados', () => {
    for (const [bestOf, need] of [
      [3, 2],
      [5, 3],
      [7, 4],
    ] as const) {
      const log = Array.from({ length: need }, () => love(1)).flat();
      const almost = run(log.slice(0, -1), { bestOf });
      expect(almost.winner).toBeNull();
      const done = engine({ bestOf }).apply(almost, P(1));
      expect([done.winner, done.finish, done.games.length, done.call]).toEqual([1, 'played', need, '']);
      expect(() => engine({ bestOf }).apply(done, P(2))).toThrow('El partido ya terminó.');
    }
    // 4-3 al mejor de 7.
    const seven = run([...love(1), ...love(2), ...love(1), ...love(2), ...love(1), ...love(2), ...love(2)], { bestOf: 7 });
    expect([seven.winner, racketResult(seven).summary]).toEqual([2, '11-0 0-11 11-0 0-11 11-0 0-11 0-11']);
  });

  it('cambio de lado al terminar cada juego y una sola vez a los 5 del decisivo', () => {
    const log = [...love(1), ...love(2), ...pts('11112'), ...pts('1'), ...pts('22222'), ...pts('2')];
    const seq = states(log, { bestOf: 3 });
    const changes = seq.map((s, i) => (s.changeEnds ? i : -1)).filter((i) => i >= 0);
    // Fin del juego 1 (jugada 11), fin del 2 (22) y el 5-1 del decisivo (28): no al 4-0 ni al 5-5.
    expect(changes).toEqual([11, 22, 28]);
    expect(seq[28].score).toEqual([5, 1]);
    expect([seq[27].score, seq[27].switched, seq[28].switched]).toEqual([[4, 1], false, true]);
    expect(seq.map((s) => s.leftSide).filter((_, i) => [0, 11, 22, 28, seq.length - 1].includes(i))).toEqual([1, 2, 1, 2, 2]);
    // En un juego que no es el decisivo, llegar a 5 no cambia de lado.
    const g1 = states(pts('11111'), { bestOf: 3 });
    expect(g1.some((s) => s.changeEnds)).toBe(false);
    // Sin aviso (switchAt null): solo al terminar cada juego.
    const quiet = states(log, { bestOf: 3, switchAt: null });
    expect(quiet.map((s, i) => (s.changeEnds ? i : -1)).filter((i) => i >= 0)).toEqual([11, 22]);
  });

  it('al terminar el partido no hay cambio de lado', () => {
    const s = run([...love(1), ...love(1)], { bestOf: 3 });
    expect([s.winner, s.changeEnds, s.leftSide]).toEqual([1, false, 2]);
  });
});

describe('dobles', () => {
  it('rotación del juego 1 durante 8 puntos: A0→B1→A1→B0, desde la derecha', () => {
    const seq = states(pts('12121212'), DOUBLES, SETUP);
    expect(rot(seq[0])).toEqual(['A0', 'B1', 'A1', 'B0']);
    expect(seq.map(turn)).toEqual(['A0>B1', 'A0>B1', 'B1>A1', 'B1>A1', 'A1>B0', 'A1>B0', 'B0>A0', 'B0>A0', 'A0>B1']);
    expect(seq.map((s) => s.servesLeft)).toEqual([2, 1, 2, 1, 2, 1, 2, 1, 2]);
    expect(seq.every((s) => s.serveFrom === 'right')).toBe(true);
    // Desde 10-10 sigue la misma cadena, uno cada uno: turno 10 = A1.
    const deuce = run(pts('12'.repeat(10)), DOUBLES, SETUP);
    expect(states(pts('121'), DOUBLES, SETUP, deuce).map(turn)).toEqual(['A1>B0', 'B0>A0', 'A0>B1', 'B1>A1']);
  });

  it('el sorteo por defecto: saca A0 y recibe B0', () => {
    const s = engine(DOUBLES).init({});
    expect(rot(s)).toEqual(['A0', 'B0', 'A1', 'B1']);
    const b = engine(DOUBLES).init({ firstServer: 2, firstPlayer: [1, 0] });
    expect([rot(b), turn(b)]).toEqual([['B0', 'A1', 'B1', 'A0'], 'B0>A1']);
  });

  it('ayudas de la rotación', () => {
    const r = rotationOf({ side: 1, player: 0 }, { side: 2, player: 1 });
    expect(r.map(slot)).toEqual(['A0', 'B1', 'A1', 'B0']);
    expect(nextRotation(r, 1).map(slot)).toEqual(['B1', 'A0', 'B0', 'A1']);
    expect(nextRotation(r, 0).map(slot)).toEqual(['B0', 'A1', 'B1', 'A0']);
    expect(swapReceivers(r, 3).map(slot)).toEqual(['A1', 'B1', 'A0', 'B0']);
    expect(swapReceivers(r, 4).map(slot)).toEqual(['A0', 'B0', 'A1', 'B1']);
    // Cruzar dos veces en el mismo turno deja todo como estaba; la original no cambia.
    expect(swapReceivers(swapReceivers(r, 3), 3)).toEqual(r);
    expect(r.map(slot)).toEqual(['A0', 'B1', 'A1', 'B0']);
  });

  it('en el juego 2 saca quien recibió primero y recibe quien le sacó a él', () => {
    const s = run(love(1), DOUBLES, SETUP);
    expect(rot(s)).toEqual(['B1', 'A0', 'B0', 'A1']);
    expect([turn(s), s.gameFirstServer, s.changeEnds]).toEqual(['B1>A0', 2, true]);
    expect(s.gameRotation).toEqual(s.rotation);
    // Juego 3: vuelve a sacar A0 contra B1.
    expect(rot(run([...love(1), ...love(2)], DOUBLES, SETUP))).toEqual(['A0', 'B1', 'A1', 'B0']);
  });

  it('orden antes del primer punto: en el juego 1 cada pareja elige; desde el 2, solo la que saca', () => {
    const e = engine(DOUBLES);
    let s = e.init(SETUP);
    s = e.apply(s, { type: 'order', side: 1, player: 1 });
    expect(rot(s)).toEqual(['A1', 'B1', 'A0', 'B0']);
    s = e.apply(s, { type: 'order', side: 2, player: 0 });
    expect([rot(s), turn(s)]).toEqual([['A1', 'B0', 'A0', 'B1'], 'A1>B0']);
    expect(s.gameRotation).toEqual(s.rotation);
    const played = e.apply(s, P(1));
    expect(() => e.apply(played, { type: 'order', side: 1, player: 0 })).toThrow('El orden se elige antes del primer saque del juego.');

    const g2 = run(love(1), DOUBLES, SETUP);
    const pick = e.apply(g2, { type: 'order', side: 2, player: 0 });
    expect([rot(pick), turn(pick)]).toEqual([['B0', 'A1', 'B1', 'A0'], 'B0>A1']);
    // Elegir al que ya saca no cambia nada.
    expect(rot(e.apply(g2, { type: 'order', side: 2, player: 1 }))).toEqual(['B1', 'A0', 'B0', 'A1']);
    expect(() => e.apply(g2, { type: 'order', side: 1, player: 1 })).toThrow('En este juego recibe primero quien le sacó en el juego anterior.');
    // El juego 3 sale del orden que se jugó en el 2.
    const g3 = replay(e, SETUP, [...love(1), { type: 'order', side: 2, player: 0 }, ...love(2)]);
    expect(rot(g3)).toEqual(['A1', 'B0', 'A0', 'B1']);

    expect(() => engine().apply(engine().init({}), { type: 'order', side: 1, player: 1 })).toThrow('En individual no hay orden de pareja.');
    expect(() => e.apply(e.init(SETUP), { type: 'order', side: 1, player: 2 as Player })).toThrow('Jugador no válido.');
    expect(() => e.apply(e.init(SETUP), { type: 'order', side: 3 as Side, player: 0 })).toThrow('Lado no válido.');
  });

  const toDeciding = [...love(1), ...love(2)];

  it('decisivo, cruce en turno impar: 5-2 tras 7 puntos, B0 en su 2.º saque; la pareja A cambia su orden', () => {
    const e = engine({ ...DOUBLES, bestOf: 3 });
    const start = replay(e, SETUP, toDeciding);
    expect(rot(start)).toEqual(['A0', 'B1', 'A1', 'B0']);
    const seq = states(pts('1122111'), { ...DOUBLES, bestOf: 3 }, SETUP, start);
    const before = seq[6];
    expect([before.score, turn(before), before.receiveSwap]).toEqual([[4, 2], 'B0>A0', false]);
    const at = seq[7];
    expect([at.score, at.switched, at.changeEnds, at.receiveSwap]).toEqual([[5, 2], true, true, true]);
    expect([rot(at), turn(at), at.servesLeft]).toEqual([['A1', 'B1', 'A0', 'B0'], 'B0>A1', 1]);
    // El orden del juego no cambia (de ahí saldría el juego siguiente) y la cadena sigue: A1→B1→A0→B0→A1.
    expect(at.gameRotation.map(slot)).toEqual(['A0', 'B1', 'A1', 'B0']);
    const next = states(pts('12121'), { ...DOUBLES, bestOf: 3 }, SETUP, at);
    expect(next.map(turn)).toEqual(['B0>A1', 'A1>B1', 'A1>B1', 'B1>A0', 'B1>A0', 'A0>B0']);
    // Una sola vez: los avisos no vuelven.
    expect(next.slice(1).some((s) => s.changeEnds || s.receiveSwap)).toBe(false);
  });

  it('decisivo, cruce en turno par: 5-3 tras 8 puntos; la pareja B cambia su orden', () => {
    const e = engine({ ...DOUBLES, bestOf: 3 });
    const at = replay(e, SETUP, [...toDeciding, ...pts('11222111')]);
    expect([at.score, at.receiveSwap]).toEqual([[5, 3], true]);
    expect([rot(at), turn(at), at.servesLeft]).toEqual([['A0', 'B0', 'A1', 'B1'], 'A0>B0', 2]);
  });

  it('decisivo al mejor de 5 y de 7 también (el último juego posible)', () => {
    const e5 = engine(DOUBLES);
    const d5 = replay(e5, SETUP, [...love(1), ...love(2), ...love(1), ...love(2), ...pts('11111')]);
    expect([d5.games.length, d5.receiveSwap, d5.switched]).toEqual([4, true, true]);
    const e7 = engine({ ...DOUBLES, bestOf: 7 });
    const six = [...love(1), ...love(2), ...love(1), ...love(2), ...love(1), ...love(2)];
    const notYet = replay(e7, SETUP, [...six.slice(0, 44), ...pts('11111')]);
    expect([notYet.games.length, notYet.switched]).toEqual([4, false]);
    const d7 = replay(e7, SETUP, [...six, ...pts('22222')]);
    expect([d7.games.length, d7.switched, d7.receiveSwap]).toEqual([6, true, true]);
  });

  it('individual en el decisivo: cambio de lado sin cruce', () => {
    const s = run([...toDeciding, ...pts('11111')], { bestOf: 3 });
    expect([s.switched, s.changeEnds, s.receiveSwap, s.rotation]).toEqual([true, true, false, []]);
  });
});

describe('retiro, W.O., deshacer y guardar', () => {
  it('retiro: «11-7 3-5 ret.»; para la tabla se completa a favor del ganador', () => {
    const log = [...pts('1'.repeat(4) + '2'.repeat(7) + '1'.repeat(7)), ...pts('11122222'), { type: 'retire', side: 2 } as TableTennisEvent];
    const s = run(log);
    expect([s.winner, s.finish, s.quitter]).toEqual([1, 'retired', 2]);
    expect(racketResult(s).summary).toBe('11-7 3-5 ret.');
    const full = completeMatch(s);
    expect(full.sport === 'table_tennis' && full.games).toEqual([
      [11, 7],
      [11, 5],
      [11, 0],
    ]);
    expect(matchTotals(s)).toEqual({ sets: [3, 0], games: [3, 0], points: [33, 12] });
    expect(s.finish).toBe('retired');
  });

  it('W.O.: «W.O.» y para la tabla 11-0 en cada juego que hace falta', () => {
    const e = engine();
    const s = e.apply(e.init({}), { type: 'walkover', side: 2 });
    expect([s.winner, s.finish, racketResult(s).summary]).toEqual([1, 'walkover', 'W.O.']);
    const full = completeMatch(s);
    expect(full.sport === 'table_tennis' && full.games).toEqual([
      [11, 0],
      [11, 0],
      [11, 0],
    ]);
    expect(matchTotals(s)).toEqual({ sets: [3, 0], games: [3, 0], points: [33, 0] });
    expect(toMatchResult(s, { id: 'm', side1: 'a', side2: 'b' })).toMatchObject({ winner: 1, walkover: 2, totals: { sets: [3, 0] } });
    const seven = engine({ bestOf: 7 });
    expect(matchTotals(seven.apply(seven.init({}), { type: 'walkover', side: 1 }))).toEqual({ sets: [0, 4], games: [0, 4], points: [0, 44] });
    expect(() => e.apply(e.apply(e.init({}), P(1)), { type: 'walkover', side: 2 })).toThrow('Ya se jugaron puntos: usa «Retiro».');
    expect(() => e.apply(s, { type: 'retire', side: 1 })).toThrow('El partido ya terminó.');
  });

  it('resumen en curso', () => {
    expect(racketResult(engine().init({})).summary).toBe('0-0');
    expect(racketResult(run([...love(1), ...pts('112')])).summary).toBe('11-0 2-1');
    expect(racketResult(run(love(1))).summary).toBe('11-0');
  });

  it('deshacer = rehacer sin la última jugada; el estado aguanta ida y vuelta por JSON', () => {
    const e = engine({ ...DOUBLES, bestOf: 3 });
    const log: TableTennisEvent[] = [{ type: 'order', side: 2, player: 1 }, ...pts('1212211211221112121211'), ...pts('2'.repeat(11)), ...pts('11122112')];
    const all = replay(e, SETUP, log);
    const undo = replay(e, SETUP, log.slice(0, -1));
    expect(e.apply(undo, log[log.length - 1])).toEqual(all);
    const copy = JSON.parse(JSON.stringify(all)) as TableTennisState;
    expect(copy).toEqual(all);
    expect(applyRacket(copy, P(1))).toEqual(e.apply(all, P(1)));
    // Aplicar no cambia el estado de antes.
    const frozen = JSON.stringify(all);
    e.apply(all, P(2));
    expect(JSON.stringify(all)).toBe(frozen);
    expect(all.n).toBe(log.length);
  });

  it('jugadas de otro deporte o mal formadas', () => {
    const s = engine().init({});
    expect(() => applyRacket(s, { type: 'rally', won: 'serving' })).toThrow('Jugada no válida para ping pong.');
    expect(() => engine().apply(s, null as unknown as TableTennisEvent)).toThrow('Jugada no válida.');
    expect(() => engine().apply(s, { type: 'point', side: 0 as Side })).toThrow('Lado no válido.');
  });
});

describe('corrección del admin', () => {
  const correct = (s: TableTennisState, ev: Omit<Extract<TableTennisEvent, { type: 'correct' }>, 'type'>, rules: Partial<TableTennisRules> = {}) =>
    engine(rules).apply(s, { type: 'correct', ...ev });

  it('individual: quién saca sale de los juegos jugados y los puntos; el admin lo puede fijar', () => {
    const s = correct(engine().init({}), { games: [[11, 7]], score: [3, 2] });
    // Juego 2: empieza B; 5 jugados = turno 2, saca B su 2.º saque.
    expect([s.gameFirstServer, s.server, s.servesLeft, s.call, s.leftSide, s.switched]).toEqual([2, 2, 1, '2-3', 2, false]);
    const fixed = correct(engine().init({}), { games: [[11, 7]], score: [3, 2], server: 1 });
    expect([fixed.gameFirstServer, fixed.server]).toEqual([1, 1]);
    // Turno impar: saca el que no empezó.
    const odd = correct(engine().init({}), { games: [], score: [2, 1], server: 1 });
    expect([odd.gameFirstServer, odd.server]).toEqual([2, 1]);
    expect(correct(engine().init({}), { games: [], score: [0, 0], leftSide: 2 }).leftSide).toBe(2);
  });

  it('si sigue el mismo juego se conserva quién lo empezó', () => {
    const e = engine();
    const s = correct(e.init({}), { games: [[11, 7]], score: [3, 2], server: 1 });
    const again = correct(s, { games: [[11, 7]], score: [4, 2] });
    expect([again.gameFirstServer, again.server]).toEqual([1, 2]);
    // Otro juego: vuelve a la paridad.
    expect(correct(s, { games: [[11, 7], [3, 11]], score: [0, 0] }).gameFirstServer).toBe(1);
  });

  it('dobles: cadena por defecto desde el sorteo y los campos opcionales', () => {
    const init = engine(DOUBLES).init(SETUP);
    const g2 = correct(init, { games: [[11, 7]], score: [0, 0] }, DOUBLES);
    expect([rot(g2), turn(g2)]).toEqual([['B1', 'A0', 'B0', 'A1'], 'B1>A0']);
    // 4-4 = turno 4: el admin dice que saca B0 a A1.
    const fixed = correct(init, { games: [[11, 7]], score: [4, 4], serverPlayer: 0, receiverPlayer: 1 }, DOUBLES);
    expect([rot(fixed), turn(fixed), fixed.gameFirstServer]).toEqual([['B0', 'A1', 'B1', 'A0'], 'B0>A1', 2]);
    // Solo el lado: saca el que iba a recibir y recibe el que iba a sacar.
    const flipped = correct(init, { games: [[11, 7]], score: [4, 4], server: 1 }, DOUBLES);
    expect([rot(flipped), turn(flipped), flipped.gameFirstServer]).toEqual([['A0', 'B1', 'A1', 'B0'], 'A0>B1', 1]);
    // Turno 3 (7 jugados): el orden se arma alrededor de ese turno.
    const t3 = correct(init, { games: [], score: [4, 3], server: 2, serverPlayer: 1, receiverPlayer: 1 }, DOUBLES);
    expect([rot(t3), turn(t3), t3.gameFirstServer]).toEqual([['A1', 'B0', 'A0', 'B1'], 'B1>A1', 1]);
  });

  it('dobles en el decisivo: cruce supuesto cuando el que va arriba llegó a 5; si ya pasó en vivo, se conserva', () => {
    const rules = { ...DOUBLES, bestOf: 3 as const };
    const init = engine(rules).init(SETUP);
    const s = correct(init, { games: [[11, 5], [5, 11]], score: [6, 3] }, rules);
    expect([s.switched, s.leftSide, rot(s), turn(s)]).toEqual([true, 2, ['A0', 'B0', 'A1', 'B1'], 'A0>B0']);
    expect(s.gameRotation.map(slot)).toEqual(['A0', 'B1', 'A1', 'B0']);
    // En vivo el cruce fue en 5-2 (turno 3), no en 5-3: la corrección del mismo juego lo respeta.
    const live = replay(engine(rules), SETUP, [...love(1), ...love(2), ...pts('1122111'), ...pts('2')]);
    expect(rot(live)).toEqual(['A1', 'B1', 'A0', 'B0']);
    const kept = correct(live, { games: [[11, 0], [0, 11]], score: [5, 3] }, rules);
    expect([rot(kept), turn(kept)]).toEqual([rot(live), turn(live)]);
    // Bajar a 4-3: se deshace el cruce y el cambio de lado.
    const back = correct(live, { games: [[11, 0], [0, 11]], score: [4, 3] }, rules);
    expect([back.switched, rot(back), back.leftSide]).toEqual([false, ['A0', 'B1', 'A1', 'B0'], 1]);
  });

  it('partido terminado, errores y el retiro', () => {
    const e = engine();
    const done = correct(e.init({}), { games: [[11, 1], [11, 2], [11, 3]], score: [0, 0] });
    expect([done.winner, done.finish, racketResult(done).summary]).toEqual([1, 'played', '11-1 11-2 11-3']);
    // Corregir un partido terminado a uno en curso.
    const reopened = correct(done, { games: [[11, 1], [2, 11], [11, 3]], score: [5, 5] });
    // Juego 4: lo empieza B; 10 jugados = turno 5, saca A.
    expect([reopened.winner, reopened.finish, reopened.gameFirstServer, reopened.server]).toEqual([null, null, 2, 1]);
    expect(() => correct(e.init({}), { games: [[11, 1], [11, 2], [11, 3]], score: [1, 0] })).toThrow('El partido ya terminó con esos juegos: los puntos van 0-0.');
    expect(() => correct(e.init({}), { games: [[11, 10]], score: [0, 0] })).toThrow('Juego 1 no válido: 11-10.');
    expect(() => correct(e.init({}), { games: [], score: [11, 3] })).toThrow('Puntos no válidos para el juego en curso: 11-3.');
    expect(() => correct(e.init({}), { games: [], score: [3, -1] })).toThrow('Puntos del juego en curso no válidos.');
    expect(() => correct(e.init({}), { games: [], score: [0, 0], serverPlayer: 3 as Player })).toThrow('Jugador no válido.');
    const retired = e.apply(e.init({}), { type: 'retire', side: 1 });
    expect(() => correct(retired, { games: [], score: [0, 0] })).toThrow('Primero deshaz el retiro o el W.O.');
  });
});

describe('solo el resultado, totales y en vivo', () => {
  const R = defaultRules('table_tennis');

  it('lee «11-7 9-11 11-5 11-8»', () => {
    const s = stateFromScore(R, '11-7 9-11 11-5 11-8');
    expect(racketResult(s)).toEqual({ winner: 1, summary: '11-7 9-11 11-5 11-8' });
    expect(matchTotals(s)).toEqual({ sets: [3, 1], games: [3, 1], points: [42, 31] });
    expect(stateFromScore(R, '11-9 8-11 12-10 6-11 11-7').winner).toBe(1);
    expect(stateFromScore({ ...R, bestOf: 7 }, '11-9 8-11 12-10 6-11 11-7 5-11 15-13').winner).toBe(1);
    expect(stateFromScore({ ...R, doubles: true, bestOf: 3 }, '7-11 11-9 9-11').winner).toBe(2);
  });

  it('errores del texto', () => {
    expect(() => stateFromScore(R, '11-9(3) 11-5 11-4')).toThrow('En ping pong no hay tie-break.');
    expect(() => stateFromScore(R, '11-7 11-9')).toThrow('Ese marcador no termina el partido.');
    expect(() => stateFromScore(R, '11-7 11-10 11-2')).toThrow('Juego 2 no válido: 11-10.');
    expect(() => stateFromScore(R, '11-7 11-9 11-2 11-3')).toThrow('Hay juegos después de terminado el partido.');
    expect(() => stateFromScore(R, 'once a siete')).toThrow('No entiendo «once».');
  });

  it('foto en vivo: juegos, puntos, canto, quién saca y recibe, y cuántos saques le quedan', () => {
    const e = engine({ ...DOUBLES, bestOf: 3 });
    const s = replay(e, SETUP, [...love(1), ...pts('2'.repeat(10) + '1'.repeat(10))]);
    const live = toLive(s);
    expect(live).toMatchObject({
      sport: 'table_tennis',
      done: ['11-0'],
      now: [10, 10],
      call: '10-10',
      label: 'Un saque cada uno',
      server: 2,
      serverPlayer: 0,
      receiverPlayer: 1,
      servesLeft: 1,
      serveFrom: 'right',
      over: false,
      winner: null,
      summary: '11-0 10-10',
    });
    expect(JSON.stringify(live).length).toBeLessThan(400);
    const single = toLive(run(pts('1')));
    expect(single).toMatchObject({ serveFrom: null, receiverPlayer: 0, servesLeft: 1, call: '1-0', label: null });
  });

  it('matchTotals también para un estado cualquiera de la familia', () => {
    const states: RacketState[] = [stateFromScore(R, '11-3 11-4 11-5'), stateFromScore(defaultRules('pickleball'), '11-7')];
    expect(states.map((s) => matchTotals(s).sets)).toEqual([
      [3, 0],
      [1, 0],
    ]);
  });
});
