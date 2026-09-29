import { describe, expect, it } from 'vitest';
import { evaluate } from '../engine';
import type { ActivityDay, SnapCheer, SnapServiceAct } from '../snapshot';
import { act, snapLeague, snapMember, snapProfile } from '../testkit';
import { addDays } from '../rules/periods';
import { FILLER, gives, job, NOW, of, player, row, snap, world } from './fixtures';

const LEAGUES = [snapLeague('L', { sport: 'bowling' }), snapLeague('T', { sport: 'tennis' }), snapLeague('F', { sport: 'football' }), snapLeague('G', { sport: 'golf' })];
const ME = [player('pa', 'L', 'u1'), player('pt', 'T', 'u1'), player('pf', 'F', 'u1'), player('pg', 'G', 'u1')];
const where: Record<string, { sport: ActivityDay['sport']; league_id: string }> = {
  pa: { sport: 'bowling', league_id: 'L' },
  pt: { sport: 'tennis', league_id: 'T' },
  pf: { sport: 'football', league_id: 'F' },
  pg: { sport: 'golf', league_id: 'G' },
};
/** Días activos del jugador `p` de la cuenta u1 (la actividad ya resuelta que manda SQL a los trabajos de cuenta). */
const days = (p: string, dates: string[]): ActivityDay[] => dates.map((d) => act(p, d, { ...where[p], user_id: 'u1' }));
/** `n` fechas, dos por semana (martes y jueves) desde `from`. */
const twiceAWeek = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, Math.floor(i / 2) * 7 + (i % 2) * 2));

function runAccount(activity: ActivityDay[], over: Parameters<typeof world>[1] = {}) {
  const j = job('cuenta', { league_id: null, user_id: 'u1' });
  return evaluate(j, snap(j, world('bowling', { leagues: LEAGUES, players: ME, activity, ...over })), NOW);
}

describe('account_activity', () => {
  it('Kilometraje: 50 días ponderados (el golf vale 2; máximo 4 por semana); solo lo de hace 48 h o más', () => {
    const acts = [...days('pa', twiceAWeek('2026-01-06', 40)), ...days('pg', ['2026-09-05', '2026-09-12', '2026-09-19', '2026-09-26', '2026-10-03'])];
    const ds = runAccount(acts);
    expect(of(ds, 'mileage').map((d) => `${d.user_id}:${d.level}:${d.sport}`)).toEqual(['u1:1:all']);
    expect(of(ds, 'mileage')[0]).toMatchObject({ status: 'firme', context: { values: { n: 50 } } });
    expect(of(ds, 'mileage', 'progress')[0]).toMatchObject({ value: 50, target: 150, next_level: 2 });
    // Ayer todavía no cuenta.
    const fresh = runAccount([...days('pa', twiceAWeek('2026-01-06', 49)), ...days('pa', ['2026-11-19'])]);
    expect(of(fresh, 'mileage')).toEqual([]);
  });

  it('Arranque con todo: 4 días en los 30 desde el primer día activo (no desde el registro)', () => {
    expect(of(runAccount(days('pa', ['2026-03-01', '2026-03-08', '2026-03-15', '2026-03-29'])), 'strong_start').map((d) => d.level)).toEqual([0]);
    expect(of(runAccount(days('pa', ['2026-03-01', '2026-03-08', '2026-03-15', '2026-03-31'])), 'strong_start')).toEqual([]);
  });

  it('Multideporte y tres mundos: deportes con 3+ días (un día suelto no cuenta)', () => {
    const three = (p: string, from: string) => days(p, [from, addDays(from, 7), addDays(from, 14)]);
    const two = runAccount([...three('pa', '2026-02-02'), ...three('pt', '2026-03-02'), ...days('pf', ['2026-04-04', '2026-04-11'])]);
    expect(gives(two).filter((g) => g.startsWith('multisport') || g.startsWith('three_worlds'))).toEqual(['multisport:1:-@u1']);
    expect(of(two, 'multisport')[0].context.values).toMatchObject({ n: 2, deportes: 'bowling,tennis' });
    const all = runAccount([...three('pa', '2026-02-02'), ...three('pt', '2026-03-02'), ...three('pf', '2026-04-04')]);
    expect(gives(all).filter((g) => g.startsWith('multisport') || g.startsWith('three_worlds'))).toEqual(['multisport:1:-@u1', 'multisport:2:-@u1', 'three_worlds:0:-@u1']);
    expect(of(all, 'three_worlds')[0].context.values).toEqual({ fecha: '2026-04-18' });
  });

  it('Aniversario: al año del alta con 12+ días ponderados en el año anterior', () => {
    const profiles = [...FILLER, 'u-owner', 'u-admin'].map((u) => snapProfile(u, { created_at: '2025-06-01T12:00:00.000Z' }));
    const acts = days('pa', twiceAWeek('2026-01-06', 12));
    const ok = runAccount(acts, { profiles: [...profiles, snapProfile('u1', { created_at: '2025-11-01T12:00:00.000Z' })] });
    expect(of(ok, 'anniversary').map((d) => d.level)).toEqual([1]);
    expect(of(ok, 'anniversary')[0].context.values).toMatchObject({ n: 1, fecha: '2026-11-01' });
    const quiet = runAccount(days('pa', twiceAWeek('2026-01-06', 11)), { profiles: [...profiles, snapProfile('u1', { created_at: '2025-11-01T12:00:00.000Z' })] });
    expect(of(quiet, 'anniversary')).toEqual([]);
    // De BowlingX: cuenta desde el primer juego importado; los años 3 y 4 no dan nivel.
    const bx = runAccount(acts, { profiles: [...profiles, snapProfile('u1', { created_at: '2026-09-01T12:00:00.000Z', bowlingx: true, first_import_on: '2022-11-10' })] });
    expect(of(bx, 'anniversary')).toEqual([]);
  });
});

describe('community', () => {
  it('Liga en marcha: 10 jugadores con 3+ días en la liga del dueño, 6+ de ellos cuentas establecidas', () => {
    const own = snapLeague('OWN', { sport: 'bowling', owner_id: 'u1', name: 'Los Pinos' });
    const people = Array.from({ length: 10 }, (_, i) => player(`o${i}`, 'OWN', i < 7 ? `u-o${i}` : null));
    const acts = people.flatMap((p) => ['2026-05-05', '2026-05-12', '2026-05-19'].map((d) => act(p.id, d, { league_id: 'OWN', user_id: p.user_id })));
    const ds = runAccount(acts, { leagues: [...LEAGUES, own], players: [...ME, ...people] });
    expect(of(ds, 'league_builder').map((d) => `${d.user_id}:${d.level}:${d.period_key}`)).toEqual(['u1:1:l:OWN']);
    expect(of(ds, 'league_builder')[0].context).toMatchObject({ league: { id: 'OWN', name: 'Los Pinos' }, values: { n: 10 } });
    // La liga cambió de manos: el nivel que ya se dio al dueño anterior no se repite.
    const before = runAccount(acts, {
      leagues: [...LEAGUES, own],
      players: [...ME, ...people],
      awards: [row({ badge_key: 'league_builder', sport: 'all', level: 1, period_key: 'l:OWN', user_id: 'u-old', status: 'firme' })],
    });
    expect(of(before, 'league_builder')).toEqual([]);
    const minors = runAccount(acts, { leagues: [...LEAGUES, { ...own, has_minors: true }], players: [...ME, ...people] });
    expect(of(minors, 'league_builder')[0]?.context.league).toEqual({ id: 'OWN', name: 'Liga juvenil privada' });
  });

  it('Mesa técnica: 5 días de servicio (liga real y fecha distintas)', () => {
    const service: SnapServiceAct[] = ['2026-04-01', '2026-04-08', '2026-04-15', '2026-04-22', '2026-04-29', '2026-04-29'].map((date, i) => ({ league_id: 'L', date, kind: 'match', ref: `match:s${i}` }));
    const ds = runAccount([], { service });
    expect(of(ds, 'table_crew').map((d) => d.level)).toEqual([1]);
    expect(of(runAccount([], { service: service.slice(0, 4) }), 'table_crew')).toEqual([]);
  });

  it('Buena vibra: 10 personas distintas de sus ligas, en 2+ meses; no cuentan los propios ni las ligas ajenas o con menores', () => {
    const others = Array.from({ length: 12 }, (_, i) => player(`c${i}`, 'L', i < 11 ? `u-c${i}` : null));
    const cheer = (p: string, at: string, league = 'L', user: string | null = `u-${p}`): SnapCheer => ({ league_id: league, player_id: p, user_id: user, at });
    const base = others.slice(0, 9).map((p, i) => cheer(p.id, `2026-0${i < 5 ? 5 : 6}-10T15:00:00.000Z`));
    const members = [snapMember('L', 'u1', 'member'), snapMember('T', 'u1', 'member')];
    const extra = [
      cheer('pa', '2026-06-11T15:00:00.000Z', 'L', 'u1'),
      cheer('x9', '2026-06-12T15:00:00.000Z', 'NOPE', 'u-x9'),
      cheer('c0', '2026-06-13T15:00:00.000Z'),
    ];
    // Los felicitados jugaron en la liga real (su primer día basta; SQL manda los primeros días de cada uno).
    const acts = [...others.map((p) => act(p.id, '2026-05-03', { league_id: 'L', user_id: p.user_id })), act('x9', '2026-05-03', { league_id: 'NOPE', user_id: 'u-x9' })];
    const nine = runAccount(acts, { cheers: [...base, ...extra], members });
    expect(of(nine, 'good_vibes')).toEqual([]);
    const ten = runAccount(acts, { cheers: [...base, ...extra, cheer('c11', '2026-06-20T15:00:00.000Z', 'L', null)], members });
    expect(of(ten, 'good_vibes').map((d) => d.level)).toEqual([1]);
    expect(of(ten, 'good_vibes')[0].context.values).toMatchObject({ n: 10, meses: 2 });
    // Todo en un mismo mes no llega (el bronce pide 2 meses).
    const oneMonth = runAccount(acts, { cheers: [...base, cheer('c11', '2026-06-20T15:00:00.000Z', 'L', null)].map((c) => ({ ...c, at: '2026-06-01T15:00:00.000Z' })), members });
    expect(of(oneMonth, 'good_vibes')).toEqual([]);
    // Sin un día activo no cuenta (que falte `active` no quiere decir que jugó).
    const idle = runAccount(acts.filter((a) => a.player_id !== 'c11'), { cheers: [...base, ...extra, cheer('c11', '2026-06-20T15:00:00.000Z', 'L', null)], members });
    expect(of(idle, 'good_vibes')).toEqual([]);
  });

  it('Buena vibra no se farmea con jugadores inventados en una liga de uno (no es real): juegan y se felicitan, y nada', () => {
    const fake = snapLeague('FAKE', { sport: 'bowling', owner_id: 'u1' });
    const ghosts = Array.from({ length: 80 }, (_, i) => `g${i}`);
    const acts = ghosts.map((g) => act(g, '2026-03-03', { league_id: 'FAKE', user_id: null }));
    const cheers: SnapCheer[] = ghosts.map((g, i) => ({ league_id: 'FAKE', player_id: g, user_id: null, at: `2026-0${3 + (i % 6)}-10T15:00:00.000Z` }));
    const members = [snapMember('L', 'u1', 'member'), snapMember('FAKE', 'u1', 'owner')];
    const farm = runAccount(acts, { leagues: [...LEAGUES, fake], real: ['L', 'T', 'F', 'G'], cheers, members });
    expect(of(farm, 'good_vibes')).toEqual([]);
    // La misma liga, ya real (4 cuentas establecidas que no son la suya): sí.
    const real = runAccount(acts, { leagues: [...LEAGUES, fake], cheers, members });
    expect(of(real, 'good_vibes').map((d) => d.level)).toEqual([1, 2, 3]);
  });

  it('Raíces BowlingX: cuenta que venía de BowlingX y jugó al menos un día en MatchMate', () => {
    const profiles = [...FILLER, 'u-owner', 'u-admin'].map((u) => snapProfile(u, { created_at: '2025-06-01T12:00:00.000Z' }));
    const bx = [...profiles, snapProfile('u1', { bowlingx: true, first_import_on: '2023-01-10' })];
    expect(gives(runAccount(days('pa', ['2026-02-03']), { profiles: bx })).filter((g) => g.startsWith('bowlingx'))).toEqual(['bowlingx_roots:0:-@u1']);
    expect(of(runAccount([], { profiles: bx }), 'bowlingx_roots')).toEqual([]);
    expect(of(runAccount(days('pa', ['2026-02-03'])), 'bowlingx_roots')).toEqual([]);
  });
});

describe('jugador sin cuenta', () => {
  it('un trabajo de cuenta de una liga evalúa a sus jugadores sin cuenta, con lo de su liga', () => {
    const loose = player('z1', 'L', null);
    const acts = twiceAWeek('2026-01-06', 50).map((d) => act('z1', d, { league_id: 'L' }));
    const j = job('cuenta', { league_id: 'L', user_id: null });
    const ds = evaluate(j, snap(j, world('bowling', { leagues: LEAGUES, players: [...ME, loose], activity: acts })), NOW);
    expect(of(ds, 'mileage').map((d) => `${d.player_id}:${d.league_id}:${d.level}`)).toEqual(['z1:L:1']);
    // Las que piden cuenta (aniversario, comunidad) no se le dan.
    expect(of(ds, 'anniversary')).toEqual([]);
  });
});
