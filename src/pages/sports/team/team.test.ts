import { describe, expect, it } from 'vitest';
import type { Match, MatchSide } from '../../../lib/data/matches';
import type { SeasonTeam } from '../../../lib/data/seasonTeams';
import { canOpenTable, currentRound, myTeams, rosterSide, rsvpTargets, scorerCandidates, shortName, speakerSide, teamColor, textOn, upcomingFor } from './logic';
import { addDays, localTime, matchClashes, parseCourts, parseTimes, planClashes, planDrafts, planSchedule, roundDates, zonedIso } from './schedule';

const SD = 'America/Santo_Domingo';

describe('calendario', () => {
  it('fechas de las jornadas, saltando feriados', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(roundDates('2026-10-03', 3, 7)).toEqual(['2026-10-03', '2026-10-10', '2026-10-17']);
    expect(roundDates('2026-10-03', 2, 7, ['2026-10-10'])).toEqual(['2026-10-03', '2026-10-11']);
  });

  it('horas y canchas escritas a mano', () => {
    expect(parseTimes('7 pm, 19:00; 8.30 pm\n12 am, 25:00, hola')).toEqual({ times: ['00:00', '19:00', '20:30'], bad: ['25:00', 'hola'] });
    expect(parseCourts('Cancha 1, cancha techada ,Cancha 1')).toEqual(['Cancha 1', 'cancha techada']);
  });

  it('hora de la liga → ISO (Santo Domingo es UTC−4; Nueva York cambia de horario)', () => {
    expect(zonedIso('2026-10-03', '19:00', SD)).toBe('2026-10-03T23:00:00.000Z');
    expect(zonedIso('2026-07-01', '19:00', 'America/New_York')).toBe('2026-07-01T23:00:00.000Z');
    expect(zonedIso('2026-12-01', '19:00', 'America/New_York')).toBe('2026-12-02T00:00:00.000Z');
    expect(zonedIso('2026-10-03', '19:00', 'Zona/Rara')).toBe('2026-10-03T23:00:00.000Z');
    expect(localTime('2026-10-03T23:00:00.000Z', SD)).toBe('19:00');
  });

  it('4 equipos de ida y vuelta: 6 jornadas, 2 partidos por jornada, cada pareja 2 veces con local cambiado', () => {
    const plan = planSchedule({
      teams: ['A', 'B', 'C', 'D'],
      double: true,
      startDate: '2026-10-03',
      everyDays: 7,
      times: ['19:00', '20:30'],
      courts: ['Cancha 1'],
      firstRound: 1,
      tz: SD,
    });
    expect(plan.dates).toHaveLength(6);
    expect(plan.matches).toHaveLength(12);
    expect(plan.unassigned).toEqual([]);
    expect(plan.byes).toEqual([]);
    const pairs = new Map<string, string[]>();
    for (const m of plan.matches) {
      const k = [m.home, m.away].sort().join('-');
      pairs.set(k, [...(pairs.get(k) ?? []), `${m.home}>${m.away}`]);
    }
    expect([...pairs.values()].every((v) => v.length === 2 && v[0] !== v[1])).toBe(true);
    const first = plan.matches.filter((m) => m.round === 1);
    expect(first.map((m) => [m.date, m.time, m.court])).toEqual([
      ['2026-10-03', '19:00', 'Cancha 1'],
      ['2026-10-03', '20:30', 'Cancha 1'],
    ]);
    expect(first[0].scheduledAt).toBe('2026-10-03T23:00:00.000Z');
    // Sin choques entre ellos.
    expect(planClashes(plan, [], 90, SD)).toEqual([]);
    const drafts = planDrafts(plan, { format: 'fiba' });
    expect(drafts[0]).toMatchObject({ round: 1, court: 'Cancha 1', format: 'fiba', sides: [{ side: 1 }, { side: 2 }] });
  });

  it('impar: descansa uno por jornada; lo que no cabe queda sin hora; empieza en la jornada que se pida', () => {
    const plan = planSchedule({ teams: ['A', 'B', 'C', 'D', 'E'], double: false, startDate: '2026-10-03', everyDays: 7, times: ['19:00'], courts: [], firstRound: 4, tz: SD });
    expect(plan.byes.map((b) => b.round)).toEqual([4, 5, 6, 7, 8]);
    expect(new Set(plan.byes.map((b) => b.team)).size).toBe(5);
    expect(plan.matches.filter((m) => m.round === 4)).toHaveLength(2);
    // Una hora y una cancha: el segundo partido de cada jornada no cabe.
    expect(plan.unassigned).toHaveLength(5);
    expect(plan.unassigned.every((m) => m.time === null && m.scheduledAt === null && m.court === null)).toBe(true);
  });

  it('choques con lo que ya estaba: misma cancha o el mismo equipo a la misma hora', () => {
    const side = (n: 1 | 2, teamId: string): MatchSide => ({ side: n, teamId, label: teamId, seed: null, players: [] });
    const existing: Pick<Match, 'id' | 'status' | 'scheduledAt' | 'court' | 'sides'>[] = [
      { id: 'viejo', status: 'scheduled', scheduledAt: '2026-10-03T23:30:00.000Z', court: 'Cancha 1', sides: [side(1, 'X'), side(2, 'Y')] },
      { id: 'anulado', status: 'void', scheduledAt: '2026-10-03T23:00:00.000Z', court: 'Cancha 2', sides: [side(1, 'A'), side(2, 'Z')] },
    ];
    const plan = planSchedule({ teams: ['A', 'B'], double: false, startDate: '2026-10-03', everyDays: 7, times: ['19:00'], courts: ['Cancha 1'], firstRound: 1, tz: SD });
    const clashes = planClashes(plan, existing, 60, SD);
    expect(clashes.map((c) => [c.kind, c.who])).toEqual([['court', 'Cancha 1']]);
    expect(matchClashes({ date: '2026-10-03', time: '19:45', court: 'Cancha 9', teams: ['X', 'Q'] }, existing, 60, SD).map((c) => [c.kind, c.who])).toEqual([
      ['participant', 'X'],
    ]);
    // Reprogramar el mismo partido no choca consigo mismo.
    expect(matchClashes({ id: 'viejo', date: '2026-10-03', time: '19:30', court: 'Cancha 1', teams: ['X', 'Y'] }, existing, 60, SD)).toEqual([]);
  });
});

const team = (id: string, roster: [string, 'player' | 'captain' | 'delegate'][], extra: Partial<SeasonTeam> = {}): SeasonTeam => ({
  id,
  leagueId: 'L',
  name: id,
  color: null,
  order: 1,
  roster: roster.map(([playerId, role]) => ({ playerId, role, jersey: null, position: null })),
  createdAt: null,
  updatedAt: null,
  ...extra,
});

const teams = [
  team('T1', [
    ['cap', 'captain'],
    ['p1', 'player'],
  ]),
  team('T2', [
    ['del', 'delegate'],
    ['p2', 'player'],
  ]),
  team('T3', [['p3', 'player']]),
];

const m = {
  status: 'scheduled' as const,
  scheduledAt: '2026-10-03T23:00:00.000Z',
  round: 1,
  sides: [
    { side: 1 as const, teamId: 'T1', label: 'T1', seed: null, players: [] },
    { side: 2 as const, teamId: 'T2', label: 'T2', seed: null, players: [] },
  ] as [MatchSide, MatchSide],
};

describe('quién es quién en el partido', () => {
  it('lado del delegado y lado de la plantilla', () => {
    expect(speakerSide(m, teams, 'cap')).toBe(1);
    expect(speakerSide(m, teams, 'del')).toBe(2);
    expect(speakerSide(m, teams, 'p1')).toBeNull();
    expect(rosterSide(m, teams, 'p1')).toBe(1);
    expect(rosterSide(m, teams, 'p3')).toBeNull();
    expect(myTeams(teams, 'cap').map((x) => [x.team.id, x.role])).toEqual([['T1', 'captain']]);
  });

  it('abrir la mesa: admin, anotador de la liga, designado o delegado; nunca con el partido cerrado', () => {
    const base = { match: m, isAdmin: false, isScorer: false, userId: 'u', official: null, speaker: null };
    expect(canOpenTable(base)).toBe(false);
    expect(canOpenTable({ ...base, official: { userId: 'u' } })).toBe(true);
    expect(canOpenTable({ ...base, speaker: 2 })).toBe(true);
    expect(canOpenTable({ ...base, isScorer: true })).toBe(true);
    expect(canOpenTable({ ...base, isAdmin: true, match: { status: 'confirmed' } })).toBe(false);
    expect(canOpenTable({ ...base, isAdmin: true, userId: null })).toBe(false);
  });

  it('candidatos a anotador de mesa: delegados con cuenta, anotadores de la liga y admins (sin repetir)', () => {
    const members = [
      { uid: 'uAdmin', name: 'Admin', role: 'owner' as const, scorer: false },
      { uid: 'uCap', name: 'Capi', role: 'member' as const, scorer: true },
      { uid: 'uDel', name: 'Dele', role: 'member' as const },
      { uid: 'uSc', name: 'Mesa', role: 'member' as const, scorer: true },
      { uid: 'uP', name: 'Jugador', role: 'member' as const },
    ];
    const players = [
      { id: 'cap', uid: 'uCap' },
      { id: 'del', uid: 'uDel' },
      { id: 'p1', uid: 'uP' },
    ];
    expect(scorerCandidates(m, teams, members, players)).toEqual([
      { uid: 'uCap', name: 'Capi', why: 'Capitán de T1' },
      { uid: 'uDel', name: 'Dele', why: 'Delegado de T2' },
      { uid: 'uSc', name: 'Mesa', why: 'Anotador de la liga' },
      { uid: 'uAdmin', name: 'Admin', why: 'Admin' },
    ]);
  });

  it('a quién le marco la convocatoria', () => {
    expect(rsvpTargets(m, teams, 'p1', false)).toEqual([{ side: 1, playerIds: ['p1'] }]);
    expect(rsvpTargets(m, teams, 'del', false)).toEqual([{ side: 2, playerIds: ['del', 'p2'] }]);
    expect(rsvpTargets(m, teams, 'p3', false)).toEqual([]);
    expect(rsvpTargets(m, teams, null, true)).toEqual([
      { side: 1, playerIds: ['cap', 'p1'] },
      { side: 2, playerIds: ['del', 'p2'] },
    ]);
  });

  it('próximos partidos de mi equipo y la jornada que toca', () => {
    const now = Date.parse('2026-10-01T00:00:00Z');
    const later = { ...m, scheduledAt: '2026-10-10T23:00:00.000Z', round: 2 };
    const done = { ...m, status: 'confirmed' as const, round: 0 };
    const other = { ...m, sides: [m.sides[1], { ...m.sides[0], teamId: 'T3' }] as [MatchSide, MatchSide] };
    expect(upcomingFor([later, done, m, other] as Pick<Match, 'status' | 'scheduledAt' | 'sides'>[], ['T1'], now)).toEqual([m, later]);
    expect(currentRound([done, m, later])).toBe(1);
    expect(currentRound([done])).toBe(0);
    expect(currentRound([])).toBeNull();
  });

  it('colores y nombres cortos', () => {
    expect(teamColor({ color: '#ff8800', order: 3 })).toBe('#ff8800');
    expect(teamColor({ color: null, order: 1 })).toBe('#2563eb');
    expect(textOn('#ffffff')).toBe('#000000');
    expect(textOn('#1e3a8a')).toBe('#ffffff');
    expect(shortName('Juan Pérez Soto')).toBe('Juan S.');
    expect(shortName('Ana')).toBe('Ana');
  });
});
