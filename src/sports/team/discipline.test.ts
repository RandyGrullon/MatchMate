import { describe, expect, it } from 'vitest';
import { disciplineReport, suspendedFor, type CardLine, type DisciplineMatch } from './discipline';
import { football, footballCards, footballConfig, type FootballEvent } from './football';

const y = (player: string, team = 'A', yellows = 1): CardLine => ({ player, team, yellows, red: null });
const red = (player: string, team = 'A', yellows = 0): CardLine => ({ player, team, yellows, red: 'direct' });
const dbl = (player: string, team = 'A'): CardLine => ({ player, team, yellows: 2, red: 'second_yellow' });
const m = (id: string, order: number | string, teams: string[], status: DisciplineMatch['status'] = 'played', cards: CardLine[] = [], extra: Partial<DisciplineMatch> = {}): DisciplineMatch => ({
  id,
  order,
  teams,
  status,
  cards,
  ...extra,
});

describe('suspensiones', () => {
  it('roja = 1 partido, en el siguiente partido del equipo', () => {
    const season = [m('m1', 1, ['A', 'B'], 'played', [red('p1')]), m('m2', 2, ['A', 'C'], 'scheduled'), m('m3', 2, ['B', 'D'], 'scheduled')];
    expect(suspendedFor(season, 'm2')).toEqual([{ player: 'p1', team: 'A', reason: 'roja', fromMatchId: 'm1', remaining: 1 }]);
    expect(suspendedFor(season, 'm3')).toEqual([]);
    // Ya cumplió en m2.
    const later = [...season.slice(0, 1), m('m2', 2, ['A', 'C']), m('m4', 3, ['A', 'D'], 'scheduled')];
    expect(suspendedFor(later, 'm4')).toEqual([]);
    expect(disciplineReport(later).sanctions).toEqual([{ player: 'p1', team: 'A', reason: 'roja', matchId: 'm1', matches: 1, served: ['m2'], remaining: 0 }]);
  });

  it('se cumple en el próximo partido JUGADO: no cuentan aplazados ni cancelados', () => {
    const season = [
      m('m1', 1, ['A', 'B'], 'played', [red('p1')]),
      m('m2', 2, ['A', 'C'], 'postponed'),
      m('m3', 3, ['B', 'C']), // descanso de A
      m('m4', 4, ['A', 'D'], 'cancelled'),
      m('m5', 5, ['A', 'B'], 'scheduled'),
    ];
    expect(suspendedFor(season, 'm5')).toEqual([{ player: 'p1', team: 'A', reason: 'roja', fromMatchId: 'm1', remaining: 1 }]);
    // Si el aplazado se juega después (nueva fecha), cumple ahí.
    const replayed = [season[0], season[2], season[3], m('m5', 5, ['A', 'B']), m('m2', 6, ['A', 'C'], 'scheduled')];
    expect(suspendedFor(replayed, 'm2')).toEqual([]);
    expect(disciplineReport(replayed).sanctions[0].served).toEqual(['m5']);
  });

  it('el W.O. no cuenta como cumplido, salvo que se configure', () => {
    const season = [m('m1', 1, ['A', 'B'], 'played', [red('p1')]), m('m2', 2, ['A', 'C'], 'walkover'), m('m3', 3, ['A', 'D'], 'scheduled')];
    expect(suspendedFor(season, 'm3')).toHaveLength(1);
    expect(suspendedFor(season, 'm3', { walkoverServes: true })).toEqual([]);
  });

  it('los programados antes del partido consultado se dan por jugados', () => {
    const season = [m('m1', 1, ['A', 'B'], 'played', [red('p1', 'A'), red('q1', 'B')]), m('m2', 2, ['A', 'C'], 'scheduled'), m('m3', 3, ['A', 'B'], 'scheduled')];
    expect(suspendedFor(season, 'm2').map((s) => s.player)).toEqual(['p1']);
    // En m3: p1 ya cumplió en m2 (si se juega); q1 (B) no ha jugado desde entonces.
    expect(suspendedFor(season, 'm3').map((s) => s.player)).toEqual(['q1']);
  });

  it('3 amarillas = 1 partido, y el conteo sigue', () => {
    const season = [
      m('m1', 1, ['A', 'B'], 'played', [y('p2')]),
      m('m2', 2, ['A', 'C'], 'played', [y('p2')]),
      m('m3', 3, ['A', 'D'], 'played', [y('p2')]),
      m('m4', 4, ['A', 'B'], 'scheduled'),
    ];
    expect(suspendedFor(season, 'm4')).toEqual([{ player: 'p2', team: 'A', reason: 'amarillas', fromMatchId: 'm3', remaining: 1 }]);
    expect(suspendedFor(season, 'm4', { yellowsForSuspension: 5 })).toEqual([]);
    expect(suspendedFor(season, 'm4', { yellowsForSuspension: 0 })).toEqual([]);
    const more = [...season.slice(0, 3), m('m4', 4, ['A', 'B']), ...[5, 6, 7].map((n) => m(`m${n}`, n, ['A', 'C'], 'played', [y('p2')])), m('m8', 8, ['A', 'D'], 'scheduled')];
    expect(suspendedFor(more, 'm8')).toMatchObject([{ reason: 'amarillas', fromMatchId: 'm7' }]);
    expect(disciplineReport(more).yellows).toEqual([{ player: 'p2', team: 'A', total: 6, pending: 0 }]);
  });

  it('las amarillas de una doble amarilla no suman (configurable)', () => {
    const season = [m('m1', 1, ['A', 'B'], 'played', [y('p3')]), m('m2', 2, ['A', 'C'], 'played', [dbl('p3')]), m('m3', 3, ['A', 'D'], 'scheduled')];
    expect(suspendedFor(season, 'm3')).toEqual([{ player: 'p3', team: 'A', reason: 'doble_amarilla', fromMatchId: 'm2', remaining: 1 }]);
    expect(disciplineReport(season).yellows).toEqual([{ player: 'p3', team: 'A', total: 3, pending: 1 }]);
    // Si suman: 1 + 2 = 3 → también la de amarillas (2 partidos en total).
    const counted = suspendedFor(season, 'm3', { secondYellowCounts: true });
    expect(counted).toEqual([{ player: 'p3', team: 'A', reason: 'doble_amarilla', fromMatchId: 'm2', remaining: 2 }]);
  });

  it('amarilla y roja directa: la amarilla sí suma', () => {
    const season = [m('m1', 1, ['A', 'B'], 'played', [y('p4', 'A', 1)]), m('m2', 2, ['A', 'C'], 'played', [y('p4')]), m('m3', 3, ['A', 'D'], 'played', [red('p4', 'A', 1)]), m('m4', 4, ['A', 'B'], 'scheduled'), m('m5', 5, ['A', 'C'], 'scheduled'), m('m6', 6, ['A', 'D'], 'scheduled')];
    // Roja (1) + 3.ª amarilla (1): se cumplen uno tras otro.
    expect(suspendedFor(season, 'm4')).toEqual([{ player: 'p4', team: 'A', reason: 'roja', fromMatchId: 'm3', remaining: 2 }]);
    expect(suspendedFor(season, 'm5')).toEqual([{ player: 'p4', team: 'A', reason: 'amarillas', fromMatchId: 'm3', remaining: 1 }]);
    expect(suspendedFor(season, 'm6')).toEqual([]);
  });

  it('partidos por roja configurables y ajustes del comité', () => {
    const season = [m('m1', 1, ['A', 'B'], 'played', [red('p1')]), m('m2', 2, ['A', 'C'], 'scheduled')];
    expect(suspendedFor(season, 'm2', { redMatches: 2 })[0].remaining).toBe(2);
    const adj = [{ player: 'p1', team: 'A', matchId: 'm1', matches: 2, note: 'agresión' }];
    expect(suspendedFor(season, 'm2', {}, adj)[0]).toMatchObject({ reason: 'roja', remaining: 3 });
    expect(disciplineReport(season, {}, adj).sanctions[1]).toMatchObject({ reason: 'comite', matches: 2, note: 'agresión' });
  });

  it('avisa si un suspendido jugó', () => {
    const season = [m('m1', 1, ['A', 'B'], 'played', [red('p1')]), m('m2', 2, ['A', 'C'], 'played', [], { present: [{ team: 'A', players: ['p1', 'p9'] }] })];
    expect(disciplineReport(season).violations).toEqual([{ matchId: 'm2', team: 'A', player: 'p1' }]);
  });

  it('ordena por fecha y no existe el partido', () => {
    const season = [m('m2', '2026-10-10', ['A', 'C'], 'scheduled'), m('m1', '2026-10-03', ['A', 'B'], 'played', [red('p1')])];
    expect(suspendedFor(season, 'm2')).toHaveLength(1);
    expect(() => suspendedFor(season, 'x')).toThrow('No existe');
  });

  it('con las tarjetas del motor', () => {
    const cfg = footballConfig('football');
    const log: FootballEvent[] = [
      { type: 'card', side: 1, player: '4', card: 'yellow' },
      { type: 'card', side: 1, player: '4', card: 'yellow' },
      { type: 'card', side: 2, player: '10', card: 'yellow' },
      { type: 'period_end' },
      { type: 'period_end' },
    ];
    const state = log.reduce((s, e) => football.apply(s, e), football.init(cfg));
    const cards = footballCards(state, ['A', 'B']);
    const season = [m('m1', 1, ['A', 'B'], 'played', cards), m('m2', 2, ['A', 'B'], 'scheduled')];
    expect(suspendedFor(season, 'm2')).toEqual([{ player: '4', team: 'A', reason: 'doble_amarilla', fromMatchId: 'm1', remaining: 1 }]);
  });
});
