/**
 * Equipos fijos del boliche (docs/boliche-equipos-practicas-bolas.md §1), sin base: generar al azar (con semilla,
 * siempre lo mismo) y parejos por promedio, los tamaños, lo que se manda al usar los generados, cómo queda la lista
 * después de guardar y lo que piden las escrituras (RPC, la caché al instante y qué se vuelve a leer).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({ rpc: [] as [string, Record<string, unknown>][], invalidated: [] as string[], result: null as unknown }));
vi.mock('./client', async (orig) => ({
  ...(await orig<typeof import('./client')>()),
  rpc: async (fn: string, args: Record<string, unknown>) => {
    calls.rpc.push([fn, args]);
    return calls.result;
  },
  invalidate: (...t: string[]) => {
    calls.invalidated.push(...t);
  },
}));

const { queryClient } = await import('./client');
const {
  applyLeagueTeams,
  balancedLeagueTeams,
  bowlingTeamKeys,
  defaultTeamSize,
  deleteBowlingTeam,
  draftsFromGroups,
  randomTeams,
  rosterWith,
  rosterWithout,
  saveBowlingTeam,
  seededTeams,
  setBowlingTeams,
  teamColorAt,
  teamCount,
  teamOf,
  toBowlingTeamWires,
  withNames,
  withSavedTeam,
} = await import('./bowlingTeams');

const people = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `Jugador ${i + 1}`, average: 150 + i * 5 }));
const sizes = (groups: unknown[][]) => groups.map((g) => g.length);
const ids = (groups: { id: string }[][]) => groups.map((g) => g.map((p) => p.id));

beforeEach(() => {
  calls.rpc = [];
  calls.invalidated = [];
  calls.result = null;
});

describe('generar al azar', () => {
  it('equipos del mismo tamaño o con uno menos, cada jugador una sola vez', () => {
    const ps = people(10);
    const g = seededTeams(ps, 4, 7);
    expect(sizes(g)).toEqual([4, 3, 3]);
    expect(g.flat().map((p) => p.id).sort()).toEqual(ps.map((p) => p.id).sort());
    expect(sizes(seededTeams(people(7), 2, 1))).toEqual([2, 2, 2, 1]);
    expect(sizes(seededTeams(people(12), 3, 1))).toEqual([3, 3, 3, 3]);
    expect(sizes(seededTeams(people(5), 6, 1))).toEqual([5]);
    expect(randomTeams([], 4)).toEqual([]);
  });

  it('con la misma semilla, los mismos equipos; con otra, otro reparto', () => {
    const ps = people(12);
    expect(ids(seededTeams(ps, 4, 'liga-1'))).toEqual(ids(seededTeams(ps, 4, 'liga-1')));
    expect(ids(seededTeams(ps, 4, 1))).not.toEqual(ids(seededTeams(ps, 4, 2)));
    // El azar que se le pasa es el que manda.
    const always0 = () => 0;
    expect(ids(randomTeams(ps.slice(0, 4), 2, always0))).toEqual(ids(randomTeams(ps.slice(0, 4), 2, always0)));
  });
});

describe('generar parejos por promedio', () => {
  it('los tamaños parejos y las sumas cerca (en serpiente y con intercambios)', () => {
    const ps = people(12);
    const g = balancedLeagueTeams(ps, 4);
    expect(sizes(g)).toEqual([4, 4, 4]);
    const sums = g.map((t) => t.reduce((a, p) => a + p.average, 0));
    // Por orden serían 80 pinos de diferencia; parejos (y cuidando las categorías), unos pocos.
    expect(Math.max(...sums) - Math.min(...sums)).toBeLessThanOrEqual(10);
    // Cada equipo, del mejor promedio al menor.
    for (const t of g) expect(t.map((p) => p.average)).toEqual([...t.map((p) => p.average)].sort((a, b) => b - a));
    expect(sizes(balancedLeagueTeams(people(10), 4)).sort()).toEqual([3, 3, 4]);
    expect(balancedLeagueTeams([], 3)).toEqual([]);
  });

  it('siempre igual con los mismos jugadores (no hay azar)', () => {
    const ps = people(9);
    expect(ids(balancedLeagueTeams(ps, 3))).toEqual(ids(balancedLeagueTeams([...ps].reverse(), 3)));
  });
});

describe('tamaños, nombres y colores', () => {
  it('cuántos equipos salen y el tamaño que se propone', () => {
    expect([teamCount(0, 4), teamCount(1, 4), teamCount(10, 4), teamCount(12, 3)]).toEqual([0, 1, 3, 4]);
    // Sin equipos: 4 si salen grupos de 4 justos o no salen de 3; si no, 3.
    expect([defaultTeamSize(12), defaultTeamSize(9), defaultTeamSize(6), defaultTeamSize(10)]).toEqual([4, 3, 3, 4]);
    // Con equipos: el tamaño de ahora (entre 2 y 6).
    expect(defaultTeamSize(20, [{ players: [1, 2, 3] }, { players: [1, 2, 3] }])).toBe(3);
    expect(defaultTeamSize(20, [{ players: Array(9) }])).toBe(6);
  });

  it('al usar los generados: los equipos de ahora se reutilizan en orden (id, nombre y color); los nuevos, «Equipo N»', () => {
    const groups = [[{ id: 'a' }, { id: 'b' }], [{ id: 'c' }], [{ id: 'd' }]];
    const drafts = draftsFromGroups(groups, [
      { id: 'T1', name: 'Los Strikers', color: '#dc2626' },
      { id: 'T2', name: 'Spare Me', color: null },
    ]);
    expect(drafts).toEqual([
      { id: 'T1', name: 'Los Strikers', color: '#dc2626', players: ['a', 'b'] },
      { id: 'T2', name: 'Spare Me', color: teamColorAt(1), players: ['c'] },
      { id: null, name: 'Equipo 3', color: teamColorAt(2), players: ['d'] },
    ]);
    expect(teamColorAt(10)).toBe(teamColorAt(0));
  });
});

describe('la lista de equipos', () => {
  const rows = [
    { id: 'T2', name: 'Spare Me', sort_order: 2, color: null },
    { id: 'T1', name: 'Los Strikers', sort_order: 1, color: '#2563eb' },
  ];
  const tp = [
    { team_id: 'T1', player_id: 'p2' },
    { team_id: 'T1', player_id: 'p1' },
    { team_id: 'T2', player_id: 'p3' },
    { team_id: 'T2', player_id: 'gone' },
  ];

  it('por orden, con sus jugadores por nombre (quien salió de la liga no sale)', () => {
    const wires = toBowlingTeamWires(rows, tp);
    expect(wires.map((t) => [t.id, t.order, t.playerIds])).toEqual([
      ['T1', 1, ['p2', 'p1']],
      ['T2', 2, ['p3', 'gone']],
    ]);
    const players = [
      { id: 'p1', name: 'Zoila' },
      { id: 'p2', name: 'Ana' },
      { id: 'p3', name: 'Luis' },
    ];
    const teams = withNames(wires, players);
    expect(teams[0].players.map((p) => p.name)).toEqual(['Ana', 'Zoila']);
    expect(teams[1].players.map((p) => p.playerId)).toEqual(['p3']);
    // Mientras la lista de jugadores carga, todos salen (con «Jugador»).
    expect(withNames(wires, [], false)[1].players.map((p) => p.name)).toEqual(['Jugador', 'Jugador']);
    expect(teamOf(teams, 'p3')?.id).toBe('T2');
    expect(teamOf(teams, 'nadie')).toBeNull();
    expect(rosterWith(teams[0], 'p3')).toEqual(['p2', 'p1', 'p3']);
    expect(rosterWith(teams[0], 'p1')).toEqual(['p2', 'p1']);
    expect(rosterWithout(teams[0], 'p2')).toEqual(['p1']);
  });

  it('después de guardar un equipo: sus jugadores salen de los otros (mover); uno nuevo va al final', () => {
    const wires = toBowlingTeamWires(rows, tp);
    const moved = withSavedTeam(wires, { ...wires[1], playerIds: ['p3', 'gone', 'p1'] });
    expect(moved.map((t) => [t.id, t.playerIds])).toEqual([
      ['T1', ['p2']],
      ['T2', ['p3', 'gone', 'p1']],
    ]);
    const added = withSavedTeam(wires, { id: 'T3', name: 'Equipo 3', color: null, order: 3, playerIds: ['p2'] });
    expect(added.map((t) => [t.id, t.playerIds])).toEqual([
      ['T1', ['p1']],
      ['T2', ['p3', 'gone']],
      ['T3', ['p2']],
    ]);
  });
});

describe('escrituras', () => {
  const lid = 'L1';
  const key = bowlingTeamKeys.league(lid);
  const seed = () =>
    queryClient.setQueryData(key, [
      { id: 'T1', name: 'Equipo 1', color: null, order: 1, playerIds: ['p1', 'p2'] },
      { id: 'T2', name: 'Equipo 2', color: null, order: 2, playerIds: ['p3'] },
    ]);
  const cached = () => queryClient.getQueryData<{ id: string; name: string; playerIds: string[] }[]>(key)!.map((t) => [t.id, t.name, t.playerIds]);

  it('reemplazar todos: set_bowling_teams con nombre (1 a 60), color si hay y sus jugadores; la caché al instante', async () => {
    seed();
    calls.result = ['T1', 'N1'];
    const out = await setBowlingTeams(lid, [
      { id: 'T1', name: '  Los Strikers  ', color: '#dc2626', players: ['p1'] },
      { name: '', players: ['p2', 'p3'] },
    ]);
    expect(out).toEqual(['T1', 'N1']);
    expect(calls.rpc).toEqual([
      [
        'set_bowling_teams',
        {
          p_league: lid,
          p_teams: [
            { id: 'T1', name: 'Los Strikers', color: '#dc2626', players: ['p1'] },
            { name: 'Equipo 2', players: ['p2', 'p3'] },
          ],
        },
      ],
    ]);
    expect(cached()).toEqual([
      ['T1', 'Los Strikers', ['p1']],
      ['N1', 'Equipo 2', ['p2', 'p3']],
    ]);
    expect(calls.invalidated).toEqual(['bteams:L1']);
  });

  it('guardar un equipo: save_bowling_team con la plantilla completa (mover a otro equipo), o sin tocarla (null)', async () => {
    seed();
    calls.result = 'T2';
    await saveBowlingTeam(lid, { id: 'T2', name: 'Equipo 2', color: '#16a34a', players: ['p3', 'p2'] });
    expect(calls.rpc[0]).toEqual(['save_bowling_team', { p_league: lid, p_id: 'T2', p_name: 'Equipo 2', p_color: '#16a34a', p_players: ['p3', 'p2'] }]);
    expect(cached()).toEqual([
      ['T1', 'Equipo 1', ['p1']],
      ['T2', 'Equipo 2', ['p3', 'p2']],
    ]);
    calls.result = 'T1';
    await saveBowlingTeam(lid, { id: 'T1', name: 'Pinos', color: null, players: null });
    expect(calls.rpc[1][1]).toMatchObject({ p_id: 'T1', p_name: 'Pinos', p_players: null });
    expect(cached()[0]).toEqual(['T1', 'Pinos', ['p1']]);
    calls.result = 'N9';
    expect(await saveBowlingTeam(lid, { id: null, name: 'Nuevo', color: null, players: [] })).toBe('N9');
    expect(cached().map((t) => t[0])).toEqual(['T1', 'T2', 'N9']);
  });

  it('borrar y aplicar a un torneo: lo que se vuelve a leer', async () => {
    seed();
    await deleteBowlingTeam(lid, 'T1');
    expect(calls.rpc[0]).toEqual(['delete_bowling_team', { p_team: 'T1' }]);
    expect(cached().map((t) => t[0])).toEqual(['T2']);
    expect(calls.invalidated).toEqual(['bteams:L1']);

    calls.invalidated = [];
    calls.result = 7;
    expect(await applyLeagueTeams(lid, 'E1')).toBe(7);
    expect(calls.rpc[1]).toEqual(['apply_league_teams', { p_event: 'E1' }]);
    expect(calls.invalidated).toEqual(expect.arrayContaining(['event:E1', 'events:L1', 'entries:e:E1', 'entries:L1']));
  });
});
