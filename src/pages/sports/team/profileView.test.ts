import { describe, expect, it } from 'vitest';
import type { Match } from '../../../lib/data/matches';
import { basketballStatItems, basketballWhen, footballScore, footballStatItems, footballWhen, rivalName, rosterLine, type FootballGame } from './profileView';

const match = (p: Partial<Match>): Match =>
  ({
    id: 'm1',
    round: 3,
    stage: '',
    scheduledAt: null,
    score: null,
    sides: [
      { side: 1, teamId: 't1', label: 'Equipo Uno', players: [] },
      { side: 2, teamId: 't2', label: 'Equipo Dos', players: [] },
    ],
    ...p,
  }) as unknown as Match;

describe('la página del jugador de equipos', () => {
  it('la línea de su equipo', () => {
    expect(rosterLine({ role: 'captain', jersey: 8, position: 'Base' })).toBe('Capitán · #8 · Base');
    expect(rosterLine({ role: 'player', jersey: null, position: null })).toBe('');
  });

  it('el rival y cuándo', () => {
    const m = match({});
    expect(rivalName(m, 1, (id) => (id === 't2' ? 'Leones de Ejemplo' : null))).toBe('Leones de Ejemplo');
    expect(rivalName(m, 2, () => null)).toBe('Equipo Uno');
    expect(basketballWhen(m, 'America/Santo_Domingo', '2026-01-01')).toBe('Jornada 3');
  });

  it('el marcador desde su lado y la línea del fútbol', () => {
    const g = (side: 1 | 2, extra: Partial<FootballGame['l']> = {}): FootballGame => ({
      m: match({ score: { text: '2-1' } }),
      l: { playerId: 'p', side, played: true, goals: 1, assists: 0, ownGoals: 0, yellows: 0, red: null, keeper: false, conceded: 0, matchId: 'm1', team: 't1', cleanSheet: false, ...extra },
    });
    expect(footballScore(g(1))).toBe('2-1');
    expect(footballScore(g(2))).toBe('1-2');
    expect(footballWhen(g(1, { keeper: true, cleanSheet: true }), 'America/Santo_Domingo', '2026-01-01')).toBe('Jornada 3 · portero, valla invicta');
    expect(footballWhen(g(1, { played: false }), 'America/Santo_Domingo', '2026-01-01')).toBe('Jornada 3 · no jugó');
  });

  it('los números de Lite', () => {
    expect(basketballStatItems({ games: 2, points: 51, avg: 25.5, high: 30 }).map((x) => x.value)).toEqual([2, 51, (25.5).toLocaleString('es-DO', { minimumFractionDigits: 1 }), 30]);
    const keeper = footballStatItems({ games: 3, goals: 0, assists: 0, keeperGames: 3, cleanSheets: 2 }, { yellows: 1, reds: 0, secondYellows: 0 });
    expect(keeper.map((x) => x.label)).toEqual(['Partidos', 'Goles', 'Asistencias', 'Vallas invictas']);
    const field = footballStatItems(undefined, { yellows: 1, reds: 1, secondYellows: 0 });
    expect(field.at(-1)).toEqual({ label: 'Tarjetas', value: 2 });
  });
});
