import { describe, expect, it } from 'vitest';
import type { SwimStroke } from '../../sports/swimming/events';
import { evaluate } from '../engine';
import type { SnapSwimEntry } from '../snapshot';
import { snapEvent, snapMeet, snapSwimEntry, snapSwimEvent } from '../testkit';
import type { AwardDecision } from '../types';
import { raceLabel } from './swim';
import { apply, gives, job, NOW, of, player, revokes, row, snap, world } from './fixtures';

// ---------------------------------------------------------------------------------------------------------
// Datos: la liga 'L' de natación; w1…w6 con cuenta (u1…u6), club 'K' para w1, w2 y w3.

const PLAYERS = [1, 2, 3, 4, 5, 6].map((n) => player(`w${n}`, 'L', `u${n}`));
const CLUBS = [{ id: 'K', league_id: 'L', name: 'Club Tiburones', coach_id: null }];

interface Race {
  distance?: number;
  stroke?: SwimStroke;
  gender?: 'F' | 'M' | 'X';
}

/**
 * Un encuentro finalizado: `races` son las pruebas (id → prueba) y `results` los tiempos
 * `[nadador, prueba, centésimas, extra]` (ids de resultado `<encuentro>-<n>`).
 */
function meet(id: string, date: string, races: Record<string, Race>, results: [string, string, number | null, Partial<SnapSwimEntry>?][], type = 'encuentro') {
  return {
    events: [snapEvent(id, { type, date, name: `Encuentro ${id}`, games: 1 })],
    swim_meets: [snapMeet(id)],
    swim_events: Object.entries(races).map(([ev, r], i) =>
      snapSwimEvent(ev, id, { num: i + 1, distance: r.distance ?? 100, stroke: r.stroke ?? 'libre', gender: r.gender ?? 'F' }),
    ),
    swim_entries: results.map(([p, ev, t, over], i) => snapSwimEntry(`${id}-${i + 1}`, id, ev, p, t, { club_id: ['w1', 'w2', 'w3'].includes(p) ? 'K' : null, ...over })),
  };
}

/** Junta encuentros en una sola foto. */
function meets(...ms: ReturnType<typeof meet>[]) {
  return {
    events: ms.flatMap((m) => m.events),
    swim_meets: ms.flatMap((m) => m.swim_meets),
    swim_events: ms.flatMap((m) => m.swim_events),
    swim_entries: ms.flatMap((m) => m.swim_entries),
  };
}

const run = (ref: string, parts: ReturnType<typeof meets>, extra: Parameters<typeof world>[1] = {}, kind: 'resultado' | 'evento' | 'historial' = 'resultado') => {
  const j = job(kind, { ref });
  return evaluate(j, snap(j, world('swimming', { players: PLAYERS, swim_clubs: CLUBS, ...parts, ...extra })), NOW);
};

/** w1 nada 100 libre en `n` encuentros (del 1 de septiembre en adelante, uno por semana) con esos tiempos. */
function career(times: number[], stroke: SwimStroke = 'libre') {
  return meets(
    ...times.map((t, i) => {
      const d = new Date(Date.UTC(2026, 8, 1 + i * 7)).toISOString().slice(0, 10);
      return meet(`m${i + 1}`, d, { [`m${i + 1}-100`]: { stroke } }, [['w1', `m${i + 1}-100`, t]]);
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------

describe('swim_career: hitos y marcas de la cuenta', () => {
  it('Pruebas nadadas: 10 resultados W1; los que anotó el propio nadador no cuentan', () => {
    const parts = career([7000, 7010, 7020, 7030, 7040, 7050, 7060, 7070, 7080, 7090]);
    let ds = run('meet:m10', parts);
    expect(of(ds, 'swim_races', 'award')).toEqual([expect.objectContaining({ user_id: 'u1', level: 1, period_key: '-', status: 'provisional', refs: ['swim:m10-1'] })]);
    parts.swim_entries[3].recorded_by = 'u1';
    ds = run('meet:m10', parts);
    expect(of(ds, 'swim_races', 'award')).toEqual([]);
    expect(of(ds, 'swim_races', 'progress')[0]).toMatchObject({ value: 9, target: 10 });
  });

  it('Marca personal: bajar la marca anterior de la misma prueba (la primera vez no cuenta)', () => {
    let ds = run('meet:m1', career([7000]));
    expect(of(ds, 'swim_personal_best', 'award')).toEqual([]);
    ds = run('meet:m3', career([7000, 7100, 6900]));
    const [pb] = of(ds, 'swim_personal_best', 'award') as AwardDecision[];
    expect(pb).toMatchObject({ level: 1, refs: ['swim:m3-1'] });
    expect(pb.context.values).toEqual({ n: 1, prueba: '100 m libre en piscina de 25 m' });
    expect(of(ds, 'swim_personal_best', 'progress')[0]).toMatchObject({ value: 1, target: 5, next_level: 2 });
  });

  it('Bajón de tiempo: el % contra una marca de hace 21+ días', () => {
    // 7000 → 6850 (2,14 %) a las 3 semanas; 6850 → 6560 (4,23 %) a la semana siguiente: no cuenta.
    let ds = run('meet:m5', career([7000, 7200, 7300, 6850, 6560]));
    expect(of(ds, 'swim_big_drop', 'award').map((d) => [d.level, (d as AwardDecision).context.values?.n, d.refs[0]])).toEqual([[1, 2.14, 'swim:m4-1']]);
    // Si pasan 3 semanas, el 4,23 % da la plata.
    ds = run('meet:m8', career([7000, 7200, 7300, 6850, 7000, 7000, 7000, 6560]));
    expect(of(ds, 'swim_big_drop', 'award').map((d) => d.level)).toEqual([1, 2]);
  });

  it('Los cuatro estilos y Fondista', () => {
    const parts = meets(
      meet('m1', '2026-10-01', { a: { stroke: 'libre', distance: 400 }, b: { stroke: 'espalda' }, c: { stroke: 'pecho' } }, [
        ['w1', 'a', 30000],
        ['w1', 'b', 8000],
        ['w1', 'c', 9000],
      ]),
    );
    let ds = run('meet:m1', parts);
    expect(of(ds, 'swim_four_strokes', 'award')).toEqual([]);
    expect(of(ds, 'swim_distance', 'award').map((d) => [d.level, (d as AwardDecision).context.values?.n])).toEqual([[1, 400]]);
    expect(of(ds, 'swim_distance', 'progress')[0]).toMatchObject({ value: 400, target: 800 });
    const more = meets(meet('m2', '2026-10-08', { d: { stroke: 'mariposa', distance: 50 } }, [['w1', 'd', 4000]]));
    ds = run('meet:m2', meets({ ...parts }, more));
    const [four] = of(ds, 'swim_four_strokes', 'award');
    expect(four.refs.sort()).toEqual(['swim:m1-1', 'swim:m1-2', 'swim:m1-3', 'swim:m2-1']);
  });

  it('solo en ligas reales', () => {
    expect(gives(run('meet:m10', career(Array(10).fill(7000)), { real: [] }))).toEqual([]);
  });

  it('si un resultado deja de contar, el nivel provisional se retira y el firme se queda', () => {
    const parts = career([7000, 7010, 7020, 7030, 7040, 7050, 7060, 7070, 7080, 7090]);
    parts.swim_entries[9].status = 'dq';
    const awards = [
      row({ badge_key: 'swim_races', sport: 'swimming', level: 1, period_key: '-', user_id: 'u1', refs: ['swim:m10-1'] }),
      row({ badge_key: 'swim_distance', sport: 'swimming', level: 1, period_key: '-', user_id: 'u1', status: 'firme' }),
    ];
    const j = job('revisar', { ref: 'meet:m10' });
    const ds = evaluate(j, snap(j, world('swimming', { players: PLAYERS, ...parts, awards })), NOW);
    expect(revokes(ds)).toEqual(['swim_races:1:-@u1']);
  });
});

describe('debut (natación)', () => {
  it('el primer resultado que no es dns en un encuentro finalizado, aunque sea dq', () => {
    const parts = meets(
      meet('m1', '2026-10-01', { a: {} }, [['w1', 'a', null, { status: 'dns' }]]),
      meet('m2', '2026-10-08', { b: {} }, [['w1', 'b', null, { status: 'dq' }]]),
    );
    expect(of(run('meet:m2', parts), 'debut', 'award')).toEqual([expect.objectContaining({ user_id: 'u1', sport: 'swimming', refs: ['swim:m2-1'] })]);
  });
});

describe('swim_meet: medallas y récords (liga)', () => {
  const five = (type = 'encuentro', times = [6000, 6100, 6200, 6300, 6400]) =>
    meet(
      'M',
      '2026-11-10',
      { f100: {} },
      times.map((t, i): [string, string, number] => [`w${i + 1}`, 'f100', t]),
      type,
    );

  it('5 nadadores W1 en el grupo: oro, plata y bronce, firmes', () => {
    const ds = run('meet:M', meets(five()), {}, 'evento');
    const medals = of(ds, 'swim_medal', 'award') as AwardDecision[];
    expect(medals.map((d) => [d.player_id, d.level, d.period_key, d.status])).toEqual([
      ['w1', 3, 'r:M-1', 'firme'],
      ['w2', 2, 'r:M-2', 'firme'],
      ['w3', 1, 'r:M-3', 'firme'],
    ]);
    expect(medals[0].context.values).toMatchObject({ n: 1, of: 5, prueba: raceLabel({ distance: 100, stroke: 'libre', pool: 25, gender: 'F' }) });
  });

  it('3 nadadores: solo oro; en un control no hay medallas; los empatados comparten', () => {
    let ds = run('meet:M', meets(five('encuentro', [6000, 6100, 6200])), {}, 'evento');
    expect(of(ds, 'swim_medal').map((d) => [d.player_id, d.level])).toEqual([['w1', 3]]);
    ds = run('meet:M', meets(five('control')), {}, 'evento');
    expect(of(ds, 'swim_medal')).toEqual([]);
    ds = run('meet:M', meets(five('encuentro', [6000, 6000, 6200, 6300, 6400])), {}, 'evento');
    expect(of(ds, 'swim_medal').map((d) => [d.player_id, d.level])).toEqual([
      ['w1', 3],
      ['w2', 3],
      ['w3', 1],
    ]);
  });

  it('cada grupo de edad por su lado', () => {
    const m = five();
    m.swim_entries.forEach((e, i) => (e.age_group = i < 3 ? '11-12' : '13-14'));
    const ds = run('meet:M', meets(m), {}, 'evento');
    // 11-12 tiene 3 (solo oro) y 13-14 tiene 2 (nada).
    expect(of(ds, 'swim_medal').map((d) => [d.player_id, d.level])).toEqual([['w1', 3]]);
  });

  it('Récord de la liga (oro) con 5+ tiempos anteriores de 3+ nadadores, y del club (plata)', () => {
    const before = meet(
      'P',
      '2026-10-01',
      { f100: {} },
      [
        ['w1', 'f100', 6500],
        ['w2', 'f100', 6600],
        ['w3', 'f100', 6900],
        ['w4', 'f100', 6400],
        ['w5', 'f100', 6700],
        ['w6', 'f100', 6800],
      ],
    );
    const now = meet('M', '2026-11-10', { f100: {} }, [
      ['w1', 'f100', 6300],
      ['w2', 'f100', 6450],
      ['w4', 'f100', 6600],
    ]);
    const ds = run('meet:M', meets(before, now), {}, 'evento');
    const recs = of(ds, 'swim_record', 'award') as AwardDecision[];
    expect(recs.map((d) => [d.player_id, d.level])).toEqual([
      ['w1', 3],
      ['w1', 2],
    ]);
    expect(recs[1].context.values).toMatchObject({ club: 'Club Tiburones', n: 6300 });
    // Con 4 tiempos anteriores no hay récord de la liga; el del club (3 tiempos de 3 nadadores) sí.
    const thin = { ...before, swim_entries: before.swim_entries.slice(0, 4) };
    expect(of(run('meet:M', meets(thin, now), {}, 'evento'), 'swim_record').map((d) => d.level)).toEqual([2]);
  });

  it('no hay medallas si la liga no es real ese mes', () => {
    // Los nadadores del encuentro también cuentan para la liga real: con solo 3 cuentas no llega.
    const players = PLAYERS.map((p, i) => (i < 3 ? p : { ...p, user_id: null }));
    expect(gives(run('meet:M', meets(five()), { real: [], players }, 'evento'))).toEqual([]);
    expect(gives(run('meet:M', meets(five()), { real: [] }, 'evento'))).toHaveLength(3);
  });
});

describe('idempotencia (natación)', () => {
  it('evaluar, aplicar y volver a evaluar no cambia nada', () => {
    const parts = career([7000, 7100, 6900, 6800, 6700, 6600, 6500, 6400, 6300, 6200]);
    const j = job('historial');
    const first = snap(j, world('swimming', { players: PLAYERS, swim_clubs: CLUBS, ...parts }));
    const ds = evaluate(j, first, NOW);
    expect(gives(ds).length).toBeGreaterThan(3);
    expect(of(ds, 'swim_races', 'award')[0]).toMatchObject({ status: 'firme' });
    expect(evaluate(j, apply(first, ds), NOW)).toEqual([]);
  });
});
