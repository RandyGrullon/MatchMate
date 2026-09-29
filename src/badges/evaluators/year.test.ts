import { describe, expect, it } from 'vitest';
import { evaluate } from '../engine';
import type { ActivityDay, BadgeSnapshot, SnapSeason } from '../snapshot';
import { act, snapLeague } from '../testkit';
import { gives, job, NOW, of, player, snap, world } from './fixtures';
import { yearsOf } from './year';
import { kitOf } from './kit';
import { bowlingNight, day, merge, swimMeet, type Parts } from './sportFixtures';

describe('year_account: tu año y todo el año', () => {
  const me = [player('pa', 'L', 'u1'), player('pt', 'T', 'u1')];
  const leagues = [snapLeague('L', { sport: 'bowling' }), snapLeague('T', { sport: 'tennis' })];
  const runYear = (activity: ActivityDay[], over: Partial<BadgeSnapshot> = {}) => {
    const j = job('anio', { league_id: null, user_id: 'u1', ref: '2026' });
    return evaluate(j, snap(j, world('bowling', { leagues, players: me, activity, ...over })), NOW);
  };
  // Boliche 2 días al mes de enero a octubre (10 meses activos) y tenis 1 día en 3 meses.
  const bowling = Array.from({ length: 10 }, (_, m) => [act('pa', day(m + 1, 6), { user_id: 'u1' }), act('pa', day(m + 1, 20), { user_id: 'u1' })]).flat();
  const tennis = [3, 4, 5].map((m) => act('pt', day(m, 9), { sport: 'tennis', league_id: 'T', user_id: 'u1' }));

  it('23 días ponderados con 10 meses activos: bronce de «Tu año»; 10 meses de boliche: «Todo el año»', () => {
    const ds = runYear([...bowling, ...tennis]);
    expect(gives(ds)).toEqual(['full_year:0:2026@u1', 'year_recap:1:2026@u1']);
    expect(of(ds, 'year_recap')[0].context.values).toMatchObject({ n: 23, anio: 2026, deportes_n: 2, meses: 10 });
    expect(of(ds, 'full_year')[0]).toMatchObject({ sport: 'bowling', context: { values: { n: 10 } } });
  });

  it('con menos de 6 meses activos no hay «Tu año» aunque sume días', () => {
    const packed = Array.from({ length: 25 }, (_, i) => act('pa', day(1 + (i % 5), 1 + Math.floor(i / 5) * 5), { user_id: 'u1' }));
    expect(of(runYear(packed), 'year_recap')).toEqual([]);
  });

  it('la actividad de ligas que no son reales no cuenta', () => {
    expect(runYear([...bowling, ...tennis], { league_months: [] })).toEqual([]);
  });
});

describe('year_league: figura y mayor progreso del año', () => {
  const B = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8'];
  const players = B.map((p) => player(p, 'L', `u-${p}`));
  // 12 torneos (uno por mes), 3 juegos cada uno: 36 juegos. b1 promedia 200; b8 sube de 150 a 170 a mitad de año.
  const data = merge(
    ...Array.from({ length: 12 }, (_, m) =>
      bowlingNight(`Y${m}`, day(m + 1, 10, 2025), Object.fromEntries(B.map((p, i) => [p, p === 'b8' ? Array(6).fill(m < 5 ? 150 : 170) : [200 - i * 5, 200 - i * 5, 200 - i * 5]]))),
    ),
  );
  const runLeague = (over: Partial<BadgeSnapshot> = {}, parts: Parts = data) => {
    const j = job('anio', { ref: '2025' });
    return evaluate(j, snap(j, world('bowling', { players, ...parts, ...over })), NOW);
  };

  it('figura: el mejor promedio con 36+ juegos oficiales y 40 %+ de las fechas; progreso: últimos 30 menos primeros 30 (+8)', () => {
    const ds = runLeague();
    expect(gives(ds)).toEqual(['figure_of_year:0:2025@b1', 'progress_of_year:0:2025@b8']);
    expect(of(ds, 'figure_of_year')[0].context.values).toMatchObject({ valor: 'promedio 200 en 36 juegos', anio: 2025 });
    expect(of(ds, 'progress_of_year')[0].context.values).toMatchObject({ valor: '+20 pinos' });
  });

  it('no hay figura del año si la liga tuvo una temporada igual al año calendario', () => {
    const season: SnapSeason = { id: 'S', league_id: 'L', name: '2025', starts_on: '2025-01-01', ends_on: '2025-12-31', status: 'closed', closed_at: null, closed_by: null, standings: null };
    expect(gives(runLeague({ seasons: [season] }))).toEqual(['progress_of_year:0:2025@b8']);
  });

  it('natación: el que más marcas personales bajó en el año (4+)', () => {
    const W = ['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8'];
    const times = [7000, 6900, 6800, 6700, 6600];
    const meets = merge(
      ...times.map((t, i) =>
        swimMeet(`M${i}`, day(i + 2, 12, 2025), [
          { p: 'w1', distance: 100, stroke: 'libre', time: t },
          ...W.slice(1).map((p) => ({ p, distance: 100, stroke: 'libre' as const, time: 8000 })),
        ]),
      ),
    );
    const j = job('anio', { ref: '2025' });
    const ds = evaluate(j, snap(j, world('swimming', { players: W.map((p) => player(p, 'L', `u-${p}`)), ...meets })), NOW);
    expect(gives(ds)).toEqual(['progress_of_year:0:2025@w1']);
  });

  it('en el historial, todos los años ya vencidos (7 de enero) con datos', () => {
    const j = job('historial', { ref: '' });
    const kit = kitOf(j, snap(j, world('bowling', { players, ...data })), Date.parse(NOW));
    expect(yearsOf(kit, 'L')).toEqual([2025]);
  });
});
