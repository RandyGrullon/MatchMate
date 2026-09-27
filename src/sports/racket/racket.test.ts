import { describe, expect, it } from 'vitest';
import { replay, type Side } from '../types';
import {
  applyRacket,
  completeMatch,
  createRacketEngine,
  defaultRules,
  initRacket,
  matchTotals,
  needed,
  normalizeSets,
  raceFinal,
  raceOpen,
  racketResult,
  resolveRules,
  RULE_PRESETS,
  setWinner,
  stateFromScore,
  toLive,
  toMatchResult,
  validateRules,
  type MatchSetup,
  type RacketEvent,
  type RacketRules,
  type RacketSport,
  type RacketState,
  type TennisRules,
} from '.';

const P = (side: Side) => ({ type: 'point', side }) as const;
const pts = (seq: string) => [...seq].map((c) => P(Number(c) as Side));
const games = (seq: string) => [...seq].flatMap((c) => pts(c.repeat(4)));

describe('fábrica y reglas', () => {
  it('cada deporte con sus reglas por defecto', () => {
    expect(createRacketEngine('tennis').init({}).rules).toEqual(defaultRules('tennis'));
    expect(createRacketEngine('padel').init({}).rules.deuce).toBe('golden');
    const pk = createRacketEngine('pickleball').init({});
    expect(pk.rules).toMatchObject({ scoring: 'sideout', gameTo: 11, winBy: 2, bestOf: 1, switchAt: 6, doubles: true });
    expect(initRacket(defaultRules('pickleball')).sport).toBe('pickleball');
  });

  it('las reglas por defecto son una copia', () => {
    const r = defaultRules('tennis');
    r.gamesPerSet = 9;
    expect(defaultRules('tennis').gamesPerSet).toBe(6);
    expect(RULE_PRESETS.tennis[0].rules.gamesPerSet).toBe(6);
  });

  it('todas las plantillas son válidas y no hay ids repetidos', () => {
    for (const sport of ['tennis', 'padel', 'pickleball'] as RacketSport[]) {
      const ids = RULE_PRESETS[sport].map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const p of RULE_PRESETS[sport]) {
        expect(p.rules.sport).toBe(sport);
        expect(validateRules(p.rules)).toEqual([]);
      }
    }
  });

  it('valida las reglas con mensajes en español', () => {
    expect(validateRules({} as RacketRules)).toEqual(['Deporte de raqueta no válido.']);
    const bad = { ...defaultRules('tennis'), tiebreakAt: 2, bestOf: 2, starAdvantages: 0 } as unknown as TennisRules;
    expect(validateRules(bad)).toEqual(['El partido es a 1, 3 o 5.', 'Las ventajas del Star Point van de 1 a 5.', 'El tie-break del set se juega en 6-6 o en 5-5.']);
    expect(validateRules({ ...defaultRules('padel'), bestOf: 1 })).toEqual(['A un solo set no hay súper tie-break.']);
    expect(() => createRacketEngine('tennis', { gamesPerSet: 12 })).toThrow('Los juegos por set van de 2 a 9.');
    expect(() => createRacketEngine('squash' as RacketSport)).toThrow('Deporte de raqueta no válido.');
  });

  it('al cambiar los juegos por set, el tie-break va en ese empate', () => {
    expect(resolveRules('tennis', { gamesPerSet: 4 }).tiebreakAt).toBe(4);
    expect(resolveRules('tennis', { gamesPerSet: 4, tiebreakAt: 3 }).tiebreakAt).toBe(3);
    expect(resolveRules('padel', { deuce: 'star', sport: 'tennis' } as Partial<TennisRules>).sport).toBe('padel');
  });

  it('cuentas de set y de carrera', () => {
    const t = defaultRules('tennis');
    expect([setWinner(t, [6, 4]), setWinner(t, [5, 7]), setWinner(t, [7, 6]), setWinner(t, [6, 5]), setWinner(t, [8, 6]), setWinner(t, [6, 7])]).toEqual([
      1,
      2,
      1,
      null,
      null,
      2,
    ]);
    const adv = { ...t, tiebreakAt: null };
    expect([setWinner(adv, [8, 6]), setWinner(adv, [9, 6]), setWinner(adv, [7, 6])]).toEqual([1, null, null]);
    expect([raceFinal(11, 2, [11, 9]), raceFinal(11, 2, [12, 10]), raceFinal(11, 2, [13, 10]), raceFinal(5, 1, [4, 5])]).toEqual([1, 1, null, 2]);
    expect([raceOpen(5, 1, [5, 5]), raceOpen(11, 2, [15, 15]), raceOpen(11, 2, [11, 9])]).toEqual([false, true, false]);
    expect(normalizeSets(defaultRules('padel'), [[6, 4], [3, 6], { games: [1, 0] }])[2]).toEqual({ games: [1, 0], matchTiebreak: true });
  });

  it('applyRacket usa las reglas guardadas y rechaza jugadas de otro deporte', () => {
    const t = createRacketEngine('padel').init({});
    expect(applyRacket(t, P(1)).sport).toBe('padel');
    expect(() => applyRacket(t, { type: 'rally', won: 'serving' })).toThrow('Jugada no válida para tenis o pádel.');
    const p = createRacketEngine('pickleball').init({});
    expect(() => applyRacket(p, { type: 'order', side: 1, player: 0 })).toThrow('Jugada no válida para pickleball.');
  });
});

describe('totales para la tabla', () => {
  it('partido jugado', () => {
    const e = createRacketEngine('tennis');
    const s = replay(e, {}, games('1212121211' + '121212111'));
    expect(matchTotals(s)).toEqual({ sets: [2, 0], games: [12, 7], points: [48, 28] });
  });

  it('retiro: se completa el set a favor del ganador', () => {
    const e = createRacketEngine('padel');
    const s = e.apply(replay(e, {}, [...games('1212121211' + '12122'), ...pts('11')]), { type: 'retire', side: 2 });
    expect(racketResult(s).summary).toBe('6-4 2-3 ret.');
    const full = completeMatch(s);
    expect(full.sport === 'padel' && full.sets.map((x) => x.games)).toEqual([
      [6, 4],
      [6, 3],
    ]);
    expect(matchTotals(s)).toMatchObject({ sets: [2, 0], games: [12, 7] });
    // El estado guardado no cambia: el retiro sigue ahí.
    expect(s.finish).toBe('retired');
  });

  it('retiro: si al ganador le faltan sets, se juegan (súper tie-break incluido)', () => {
    const e = createRacketEngine('tennis', { finalSet: 'tiebreak' });
    const s = e.apply(replay(e, {}, games('222222' + '1')), { type: 'retire', side: 2 });
    const t = matchTotals(s);
    expect(t.sets).toEqual([2, 1]);
    expect(t.games).toEqual([7, 6]);
    expect(racketResult(completeMatch(s)).summary).toBe('0-6 6-0 10-0');
  });

  it('W.O.: 6-0 6-0 en pádel y 11-0 en pickleball', () => {
    const padel = createRacketEngine('padel');
    const wo = padel.apply(padel.init({}), { type: 'walkover', side: 1 });
    expect(matchTotals(wo)).toEqual({ sets: [0, 2], games: [0, 12], points: [0, 48] });
    const pk = createRacketEngine('pickleball', { bestOf: 3 });
    const pwo = pk.apply(pk.init({}), { type: 'walkover', side: 2 });
    expect(matchTotals(pwo)).toEqual({ sets: [2, 0], games: [2, 0], points: [22, 0] });
  });

  it('pickleball: puntos de todos los juegos y retiro completado', () => {
    const pk = createRacketEngine('pickleball', { bestOf: 3 });
    const played = pk.apply(pk.init({}), { type: 'correct', games: [[11, 7], [9, 11], [11, 5]], score: [0, 0] });
    expect(matchTotals(played)).toEqual({ sets: [2, 1], games: [2, 1], points: [31, 23] });
    const ret = pk.apply(replay(pk, {}, pts('1'.repeat(11) + '22222' + '1111')), { type: 'retire', side: 1 });
    expect(matchTotals(ret)).toEqual({ sets: [1, 2], games: [1, 2], points: [14, 22] });
  });

  it('toMatchResult para las tablas', () => {
    const padel = createRacketEngine('padel');
    const wo = padel.apply(padel.init({}), { type: 'walkover', side: 1 });
    expect(toMatchResult(wo, { id: 'm1', side1: 'a', side2: 'b' })).toEqual({
      id: 'm1',
      side1: 'a',
      side2: 'b',
      winner: 2,
      walkover: 1,
      totals: { sets: [0, 2], games: [0, 12], points: [0, 48] },
    });
    const done = stateFromScore(defaultRules('padel'), '6-4 3-6 10-7');
    const r = toMatchResult(done, { id: 'm2', side1: 'a', side2: 'b' });
    expect(r.winner).toBe(1);
    expect(r.walkover).toBeUndefined();
    expect(r.totals.games).toEqual([10, 10]);
  });
});

describe('en vivo y solo resultado', () => {
  it('foto chica para el público', () => {
    const e = createRacketEngine('tennis');
    const s = replay(e, {}, [...games('1212121211' + '121'), ...pts('11')]);
    expect(toLive(s)).toEqual({
      sport: 'tennis',
      done: ['6-4'],
      now: [2, 1],
      points: ['30', '0'],
      label: null,
      server: 2,
      serverPlayer: 0,
      serveFrom: 'right',
      leftSide: 2,
      changeEnds: false,
      over: false,
      winner: null,
      summary: '6-4 2-1',
      n: 54,
    });
    const pk = createRacketEngine('pickleball');
    const live = toLive(replay(pk, {}, [{ type: 'rally', won: 'serving' }]));
    expect(live).toMatchObject({ sport: 'pickleball', done: [], now: [1, 0], call: '1-0-2', serveFrom: 'left', label: null });
    expect(JSON.stringify(live).length).toBeLessThan(300);
  });

  it('lee el marcador escrito a mano', () => {
    const padel = stateFromScore(defaultRules('padel'), '6-4 3-6 10-7');
    expect(racketResult(padel)).toEqual({ winner: 1, summary: '6-4 3-6 10-7' });
    const tb = stateFromScore(defaultRules('tennis'), ' 6-7(10), 6-4  7–6(3) ');
    expect(tb.sport !== 'pickleball' && tb.sets.map((x) => x.tiebreak ?? null)).toEqual([[10, 12], null, [7, 3]]);
    expect(racketResult(tb)).toEqual({ winner: 1, summary: '6-7(10) 6-4 7-6(3)' });
    const f4 = stateFromScore(RULE_PRESETS.tennis.find((p) => p.id === 'fast4')!.rules, '4-3(4) 4-1');
    expect(f4.sport !== 'pickleball' && f4.sets[0].tiebreak).toEqual([5, 4]);
    const pk = stateFromScore({ ...defaultRules('pickleball'), bestOf: 3 }, '11-7 9-11 11-5');
    expect(racketResult(pk)).toEqual({ winner: 1, summary: '11-7 9-11 11-5' });
    expect(stateFromScore(defaultRules('padel'), '4-6 6-3 [8-10]').winner).toBe(2);
  });

  it('avisa cuando el marcador escrito no cuadra', () => {
    expect(() => stateFromScore(defaultRules('tennis'), 'hola')).toThrow('No entiendo «hola»');
    expect(() => stateFromScore(defaultRules('tennis'), '')).toThrow('Escribe el marcador.');
    expect(() => stateFromScore(defaultRules('tennis'), '6-4')).toThrow('Ese marcador no termina el partido.');
    expect(() => stateFromScore(defaultRules('tennis'), '6-5 6-4')).toThrow('Set 1 no válido: 6-5.');
    expect(() => stateFromScore(defaultRules('padel'), '6-4 3-6 6-3')).toThrow('Súper tie-break no válido: 6-3.');
    expect(() => stateFromScore(defaultRules('pickleball'), '11-7(3)')).toThrow('En pickleball no hay tie-break.');
  });
});

describe('partidos al azar en todas las plantillas', () => {
  function rng(seed: number) {
    let x = seed;
    return () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
  }

  const cases = (Object.keys(RULE_PRESETS) as RacketSport[]).flatMap((sport) => RULE_PRESETS[sport].map((p) => ({ sport, p })));

  it.each(cases)('$sport $p.id: deshacer, JSON, resumen y totales cuadran', ({ sport, p }) => {
    for (const seed of [1, 7, 42]) {
      const rand = rng(seed * 97 + p.id.length);
      const engine = createRacketEngine(sport, p.rules);
      const setup: MatchSetup = { firstServer: rand() < 0.5 ? 1 : 2, leftSide: rand() < 0.5 ? 1 : 2, firstPlayer: [rand() < 0.5 ? 0 : 1, rand() < 0.5 ? 0 : 1] };
      const bias = 0.35 + rand() * 0.3;
      const log: RacketEvent[] = [];
      let s: RacketState = engine.init(setup);
      let mid: RacketState | null = null;
      while (!engine.isOver(s) && log.length < 5000) {
        const ev = P(rand() < bias ? 1 : 2);
        s = engine.apply(s, ev);
        log.push(ev);
        if (!mid && log.length === 40) mid = s;
      }
      expect(engine.isOver(s)).toBe(true);
      const w = s.winner!;
      // Deshacer y volver a hacer la última jugada da lo mismo.
      const before = replay(engine, setup, log.slice(0, -1));
      expect(engine.apply(before, log.at(-1)!)).toEqual(s);
      expect(JSON.parse(JSON.stringify(s))).toEqual(s);
      // El resumen se puede volver a leer y da el mismo ganador y los mismos sets y juegos.
      const { summary } = engine.result(s);
      const back = stateFromScore(s.rules, summary);
      expect(back.winner).toBe(w);
      const t = matchTotals(s);
      expect(matchTotals(back).sets).toEqual(t.sets);
      expect(matchTotals(back).games).toEqual(t.games);
      expect(t.sets[w - 1]).toBe(needed(s.rules.bestOf));
      // Un retiro a mitad se completa con el ganador correcto.
      if (mid && mid.winner === null) {
        const ret = applyRacket(mid, { type: 'retire', side: w === 1 ? 2 : 1 });
        const full = completeMatch(ret);
        expect(full.winner).toBe(w);
        expect(matchTotals(ret).sets[w - 1]).toBe(needed(s.rules.bestOf));
        expect(JSON.parse(JSON.stringify(mid))).toEqual(mid);
      }
    }
  });
});
