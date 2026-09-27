import { describe, expect, it } from 'vitest';
import type { Match, MatchSide } from '../../../lib/data/matches';
import { advanceTournament, placeLabel, planTournament, tournamentBracket, tournamentDrafts, tournamentErrors, tournamentSeeds, tournamentSetupOf, type TournamentInput } from './tournament';

const base = (p: Partial<TournamentInput> = {}): TournamentInput => ({
  teams: ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8'],
  groups: 2,
  perGroup: 2,
  thirdPlace: true,
  date: '2026-10-10',
  start: '08:00',
  slotMinutes: 45,
  courts: ['Cancha 1', 'Cancha 2'],
  tz: 'America/Santo_Domingo',
  ...p,
});

describe('armar el torneo relámpago', () => {
  it('8 equipos en 2 grupos (zigzag), todos contra todos por turnos y semifinales, 3.er lugar y final', () => {
    const plan = planTournament(base());
    expect(plan.groups).toEqual([
      { name: 'Grupo A', teams: ['T1', 'T4', 'T5', 'T8'] },
      { name: 'Grupo B', teams: ['T2', 'T3', 'T6', 'T7'] },
    ]);
    const groupGames = plan.games.filter((g) => !g.bracketKey);
    expect(groupGames).toHaveLength(12);
    expect(new Set(groupGames.map((g) => g.stage))).toEqual(new Set(['Grupo A', 'Grupo B']));
    // Nadie juega dos partidos en el mismo turno.
    const byTime = new Map<string, string[]>();
    for (const g of plan.games) {
      const who = [g.home, g.away].filter((x): x is string => !!x);
      const list = byTime.get(g.time) ?? [];
      for (const t of who) expect(list, `${t} a las ${g.time}`).not.toContain(t);
      byTime.set(g.time, [...list, ...who]);
    }
    // 3 rondas × 4 partidos en 2 canchas = 6 turnos (08:00 … 11:45); luego semifinales y al final 3.er lugar y final.
    expect(groupGames[0]).toMatchObject({ time: '08:00', court: 'Cancha 1', round: 1 });
    expect(groupGames.at(-1)).toMatchObject({ time: '11:45', round: 3 });
    const ko = plan.games.filter((g) => g.bracketKey);
    expect(ko.map((g) => [g.stage, g.bracketKey, g.time, g.homeLabel, g.awayLabel])).toEqual([
      ['Semifinal', 'R1-1', '12:30', '1.º Grupo A', '2.º Grupo B'],
      ['Semifinal', 'R1-2', '12:30', '1.º Grupo B', '2.º Grupo A'],
      ['Final', 'R2-1', '13:15', 'Ganador Semifinal 1', 'Ganador Semifinal 2'],
      ['Tercer lugar', 'P3', '13:15', 'Perdedor Semifinal 1', 'Perdedor Semifinal 2'],
    ]);
    expect(ko.map((g) => g.round)).toEqual([4, 4, 5, 5]);
  });

  it('borradores: grupos con sus equipos; eliminatoria por definir con su clave y las reglas de penales', () => {
    const plan = planTournament(base({ thirdPlace: false }));
    const drafts = tournamentDrafts(plan, { format: 'futsal', knockoutRules: { match: { variant: 'futsal', shootout: true } } });
    expect(drafts).toHaveLength(12 + 3);
    expect(drafts[0]).toMatchObject({ stage: 'Grupo A', format: 'futsal', sides: [{ side: 1, teamId: 'T1' }, { side: 2 }] });
    expect(drafts[0].rules).toBeUndefined();
    expect(drafts.at(-1)).toMatchObject({ stage: 'Final', bracketKey: 'R2-1', rules: { match: { shootout: true } }, sides: [{ teamId: null, label: 'Ganador Semifinal 1' }, { teamId: null }] });
  });

  it('2 grupos con 1 clasificado: final directa; 3 grupos: cuadro con pase directo', () => {
    const final = planTournament(base({ teams: ['A', 'B', 'C', 'D'], perGroup: 1, thirdPlace: false, courts: [] }));
    expect(final.games.filter((g) => g.bracketKey).map((g) => [g.stage, g.homeLabel, g.awayLabel])).toEqual([['Final', '1.º Grupo A', '1.º Grupo B']]);
    expect(final.games[0].court).toBeNull();
    const three = planTournament(base({ teams: ['A', 'B', 'C', 'D', 'E', 'F'], groups: 3, perGroup: 1 }));
    // 3 clasificados: el 1.º sembrado pasa directo a la final.
    expect(three.games.filter((g) => g.bracketKey).map((g) => [g.stage, g.homeLabel, g.awayLabel])).toEqual([
      ['Semifinal', '1.º Grupo B', '1.º Grupo C'],
      ['Final', '1.º Grupo A', 'Ganador Semifinal'],
    ]);
  });

  it('errores: pocos equipos, demasiados clasificados; el torneo se lee de las reglas', () => {
    expect(tournamentErrors({ teams: ['A', 'B', 'C'], groups: 2, perGroup: 1 })).toEqual(['Con 2 grupos hacen falta al menos 4 equipos.']);
    expect(tournamentErrors({ teams: ['A', 'B', 'C', 'D'], groups: 2, perGroup: 3 })).toEqual(['Clasifican como mucho 2 por grupo.']);
    expect(tournamentErrors({ teams: ['A', 'B'], groups: 1, perGroup: 1 })).toEqual(['Hacen falta al menos 2 clasificados para la final.']);
    expect(() => planTournament(base({ teams: ['A'] }))).toThrow();
    expect(tournamentSetupOf({ tournament: { groups: 2, perGroup: 2, thirdPlace: true } })).toEqual({ groups: 2, perGroup: 2, thirdPlace: true });
    expect(tournamentSetupOf({ tournament: { groups: 1, perGroup: 1 } })).toBeNull();
    expect(tournamentSetupOf({})).toBeNull();
    expect(placeLabel('B2')).toBe('2.º Grupo B');
    expect(tournamentSeeds({ groups: 2, perGroup: 2 })).toEqual(['A1', 'B1', 'A2', 'B2']);
    expect(tournamentBracket({ groups: 2, perGroup: 2, thirdPlace: true }).matches.map((m) => m.key)).toEqual(['R1-1', 'R1-2', 'R2-1', 'P3']);
  });
});

describe('pasar a la fase final', () => {
  const side = (s: 1 | 2, teamId: string | null, label: string): MatchSide => ({ side: s, teamId, label, seed: null, players: [] });
  const ko = (id: string, key: string, a: string | null, b: string | null, extra: Partial<Match> = {}) =>
    ({
      id,
      bracketKey: key,
      status: 'scheduled',
      winner: null,
      proposedAt: null,
      sides: [side(1, a, a ?? 'Por definir'), side(2, b, b ?? 'Por definir')],
      ...extra,
    }) as Pick<Match, 'id' | 'bracketKey' | 'status' | 'winner' | 'proposedAt' | 'sides'>;
  const setup = { groups: 2, perGroup: 2, thirdPlace: true };

  it('con un grupo terminado solo pone los suyos; con los dos, las semifinales completas', () => {
    const knockout = [ko('s1', 'R1-1', null, null), ko('s2', 'R1-2', null, null), ko('f', 'R2-1', null, null), ko('p3', 'P3', null, null)];
    const partial = advanceTournament({ ...setup, rankings: [['A', 'B', 'C', 'D'], null], knockout });
    expect(partial.map((c) => [c.bracketKey, c.sides.map((s) => s.teamId)])).toEqual([
      ['R1-1', ['A', null]],
      ['R1-2', [null, 'B']],
    ]);
    // Lo que no se sabe se queda con su nombre.
    expect(partial[0].sides[1]).toEqual({ side: 2, teamId: null, label: 'Por definir' });
    const full = advanceTournament({ ...setup, rankings: [['A', 'B', 'C', 'D'], ['E', 'F', 'G', 'H']], knockout });
    expect(full.map((c) => [c.bracketKey, c.sides.map((s) => s.teamId)])).toEqual([
      ['R1-1', ['A', 'F']],
      ['R1-2', ['E', 'B']],
    ]);
  });

  it('los ganadores (y perdedores) de las semifinales van a la final y al 3.er lugar; lo ya puesto no se repite', () => {
    const knockout = [
      ko('s1', 'R1-1', 'A', 'F', { status: 'confirmed', winner: 2 }),
      ko('s2', 'R1-2', 'E', 'B', { status: 'finished', winner: 1, proposedAt: new Date(Date.now() - 1000).toISOString() }),
      ko('f', 'R2-1', null, null),
      ko('p3', 'P3', null, null),
    ];
    const rankings = [['A', 'B'], ['E', 'F']];
    // La 2.ª semifinal está por confirmar: todavía no cuenta.
    expect(advanceTournament({ ...setup, rankings, knockout }).map((c) => [c.bracketKey, c.sides.map((s) => s.teamId)])).toEqual([
      ['R2-1', ['F', null]],
      ['P3', ['A', null]],
    ]);
    const later = Date.now() + 49 * 3600_000;
    expect(advanceTournament({ ...setup, rankings, knockout, now: later }).map((c) => [c.bracketKey, c.sides.map((s) => s.teamId)])).toEqual([
      ['R2-1', ['F', 'E']],
      ['P3', ['A', 'B']],
    ]);
    const done = [...knockout.slice(0, 2), ko('f', 'R2-1', 'F', 'E'), ko('p3', 'P3', 'A', 'B', { status: 'confirmed', winner: 1 })];
    expect(advanceTournament({ ...setup, rankings, knockout: done, now: later })).toEqual([]);
  });
});
