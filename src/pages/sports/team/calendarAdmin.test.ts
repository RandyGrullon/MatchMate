import { describe, expect, it } from 'vitest';
import type { Match } from '../../../lib/data/matches';
import {
  changeText,
  clashSummary,
  defaultGroups,
  groupOptions,
  maxGroupsFor,
  nextRound,
  nextWeekday,
  officialChoices,
  officialMatches,
  officialRowWhen,
  officialRowWho,
  scheduleByRound,
  schedulePlanOf,
  singleMatchValid,
  teamsStepLine,
  toggleTeam,
  tournamentMetaLine,
  tournamentChanges,
  tournamentPlanOf,
} from './calendarAdmin';

const SD = 'America/Santo_Domingo';
const match = (id: string, p: Partial<Match>): Match =>
  ({
    id,
    round: null,
    stage: '',
    bracketKey: null,
    status: 'scheduled',
    scheduledAt: null,
    court: '',
    score: null,
    sides: [
      { side: 1, teamId: 't1', label: 'Equipo Uno', seed: null, players: [] },
      { side: 2, teamId: 't2', label: 'Equipo Dos', seed: null, players: [] },
    ],
    ...p,
  }) as unknown as Match;

describe('Organizar › Equipos › Partidos', () => {
  it('el próximo sábado y la jornada que sigue', () => {
    // 2026-11-07 es sábado: el próximo es el de la otra semana.
    expect(nextWeekday(6, new Date(2026, 10, 7, 10).getTime())).toBe('2026-11-14');
    expect(nextWeekday(6, new Date(2026, 10, 4, 10).getTime())).toBe('2026-11-07');
    expect(nextRound([])).toBe(1);
    expect(nextRound([match('a', { round: 3 }), match('b', { round: null })])).toBe(4);
  });

  it('arma el calendario con lo escrito y lo agrupa por jornada', () => {
    const { plan, times } = schedulePlanOf({
      teams: ['t1', 't2', 't3', 't4'],
      double: false,
      start: '2026-11-14',
      every: '7',
      timesText: '7:00 pm, 8:30 pm, mañana',
      courtsText: 'Cancha 1',
      skipText: '',
      firstRound: '1',
      tz: SD,
    });
    expect(times).toEqual({ times: ['19:00', '20:30'], bad: ['mañana'] });
    expect(plan?.matches).toHaveLength(6);
    const rounds = scheduleByRound(plan);
    expect(rounds.map(([r, list]) => [r, list.length])).toEqual([
      [1, 2],
      [2, 2],
      [3, 2],
    ]);
    expect(schedulePlanOf({ teams: ['t1'], double: false, start: '2026-11-14', every: '7', timesText: '', courtsText: '', skipText: '', firstRound: '1', tz: SD }).plan).toBeNull();
  });

  it('los choques, marcar equipos y el partido suelto', () => {
    expect(clashSummary([{ kind: 'court', a: 'nuevo:0', b: 'x', who: 'Cancha 1', message: '' }, { kind: 'participant', a: 'nuevo:1', b: 'y', who: 't1', message: '' }], () => 'Tigres')).toBe(
      '2 choques: Cancha 1 ocupada · Tigres con dos partidos.',
    );
    expect(toggleTeam(null, ['t1', 't2'], 't1')).toEqual(['t2']);
    expect(toggleTeam(['t2'], ['t1', 't2'], 't1')).toEqual(['t2', 't1']);
    expect(singleMatchValid({ home: 't1', away: 't1', date: '2026-11-14', time: '19:00' })).toBe(false);
    expect(singleMatchValid({ home: 't1', away: 't2', date: '2026-11-14', time: '19:00' })).toBe(true);
  });

  it('el torneo relámpago: grupos por defecto y el armado', () => {
    expect(defaultGroups(5)).toBe(1);
    expect(defaultGroups(6)).toBe(2);
    expect(maxGroupsFor(3)).toBe(1);
    expect(groupOptions(4).map((o) => o.label)).toEqual(['1 grupo (todos contra todos)', '2 grupos']);
    const plan = tournamentPlanOf({ teams: ['t1', 't2', 't3', 't4'], groups: 1, perGroup: 2, thirdPlace: false, date: '2026-11-14', start: '08:00', slot: '', slotMinutes: 40, courtsText: 'Cancha 1', tz: SD, firstRound: 1 });
    expect(plan?.groups).toHaveLength(1);
    expect(plan?.games.some((g) => g.bracketKey)).toBe(true);
    expect(tournamentPlanOf({ teams: ['t1'], groups: 1, perGroup: 2, thirdPlace: false, date: '2026-11-14', start: '08:00', slot: '50', slotMinutes: 40, courtsText: '', tz: SD, firstRound: 1 })).toBeNull();
  });

  it('las líneas del torneo relámpago', () => {
    expect(tournamentMetaLine(null)).toBe('Torneo relámpago');
    expect(tournamentMetaLine('2026-11-14')).toMatch(/^Torneo relámpago · sábado/);
    expect([0, 1, 4].map(teamsStepLine)).toEqual(['Cada uno con su color y su plantilla', 'Hay 1: hacen falta al menos 2', '4 equipos listos']);
  });

  it('pasar a la fase final: nada sin armado y el texto de un cambio', () => {
    expect(tournamentChanges({ rules: { data: {} }, matches: { data: [] } }, () => null)).toEqual([]);
    const final = match('f', { stage: 'Final', bracketKey: 'R1-1' });
    expect(
      changeText({ matchId: 'f', bracketKey: 'R1-1', sides: [{ side: 1, teamId: 't1' }, { side: 2, teamId: null, label: 'Por definir' }] } as never, [final], () => 'Tigres de Ejemplo'),
    ).toBe('Final: Tigres de Ejemplo vs. Por definir');
  });

  it('el anotador de mesa: los partidos por jugar y las opciones', () => {
    const list = officialMatches([match('a', { status: 'confirmed', round: 1 }), match('b', { status: 'postponed', round: 2 }), match('c', { round: 1 })]);
    expect(list.map((m) => m.id)).toEqual(['c', 'b']);
    expect(officialRowWhen(list[1], SD, '2026-11-07')).toBe('Jornada 2 · Aplazado');
    expect(officialRowWho(null)).toBe('Sin anotador designado');
    expect(officialRowWho({ name: '' })).toBe('Anota: designado');
    const choices = officialChoices({ matchId: 'c', userId: 'u9', name: 'Persona de Prueba' }, [{ uid: 'u1', name: 'Juan Pérez', why: 'Admin' }]);
    expect(choices.map((c) => c.uid)).toEqual(['', 'u9', 'u1']);
    expect(choices[0].name).toBe('Sin designar');
  });
});
