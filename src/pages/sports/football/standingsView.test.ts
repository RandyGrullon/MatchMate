import { describe, expect, it } from 'vitest';
import type { Match } from '../../../lib/data/matches';
import { FOOTBALL_TABLE } from '../../../sports/team/standings';
import {
  cardLine,
  disciplineMatchText,
  footballRuleLine,
  footballRuleText,
  footballSegment,
  footballShareCard,
  footballTab,
  keeperLine,
  nearSuspension,
  scorerLine,
  scorerRows,
  sortedSanctions,
} from './standingsView';

describe('la Tabla del fútbol', () => {
  it('la pestaña y el segmentado', () => {
    expect(footballTab('disciplina')).toBe('disciplina');
    expect(footballTab('nada')).toBe('tabla');
    expect(footballSegment('tarjetas')).toBe('jugadores');
    expect(footballSegment('tabla')).toBe('tabla');
  });

  it('las líneas de cada lista', () => {
    expect(scorerLine({ assists: 1 })).toBe('1 asistencia');
    expect(scorerLine({ assists: 0 })).toBeNull();
    expect(cardLine({ secondYellows: 1, reds: 2 })).toBe('1 doble amarilla · 2 rojas');
    expect(cardLine({ secondYellows: 0, reds: 0 })).toBeNull();
    expect(keeperLine({ keeperGames: 1, conceded: 3 })).toBe('1 partido · 3 recibidos');
    const scorers = [
      { goals: 0, assists: 0 },
      { goals: 1, assists: 0 },
    ];
    expect(scorerRows({ scorers } as never)).toHaveLength(1);
  });

  it('la regla de la tabla', () => {
    expect(footballRuleLine(FOOTBALL_TABLE)).toBe('Ganar 3 · empatar 1 · perder 0');
    const text = footballRuleText(FOOTBALL_TABLE);
    expect(text[1]).toBe('Los penales no cuentan en los goles ni en la tabla.');
    expect(text[2]).toMatch(/^Desempate: diferencia de goles → goles a favor/);
  });

  it('la disciplina: a una amarilla, las sanciones y el nombre del partido', () => {
    const yellows = [
      { player: 'a', team: 't1', total: 2, pending: 2 },
      { player: 'b', team: 't1', total: 1, pending: 1 },
    ];
    expect(nearSuspension({ yellows }, { yellowsForSuspension: 3 }).map((y) => y.player)).toEqual(['a']);
    expect(nearSuspension({ yellows }, { yellowsForSuspension: 0 })).toEqual([]);
    const sanctions = [{ remaining: 0 }, { remaining: 2 }];
    expect(sortedSanctions({ sanctions } as never).map((s) => s.remaining)).toEqual([2, 0]);
    const m = {
      id: 'm1',
      round: 3,
      sides: [
        { teamId: 't1', label: 'Equipo Uno' },
        { teamId: 't2', label: 'Equipo Dos' },
      ],
    } as unknown as Match;
    const text = disciplineMatchText([m], (id) => (id === 't1' ? 'Tigres de Ejemplo' : null));
    expect(text('m1')).toBe('J3 · Tigres de Ejemplo vs. Equipo Dos');
    expect(text('otro')).toBe('partido borrado');
  });

  it('la imagen para compartir (Pro)', () => {
    const row = { id: 't1', played: 1, won: 1, drawn: 0, lost: 0, points: 3, for: 2, against: 1, diff: 1, extra: {}, rank: 1 };
    const scorer = { player: 'p1', team: 't1', games: 1, goals: 2, assists: 0, ownGoals: 0, yellows: 0, reds: 0, keeperGames: 0, cleanSheets: 0, conceded: 0 };
    const season = { groups: [], standings: [row], scorers: [scorer], cards: [], keepers: [] };
    const teamOf = () => ({ name: 'Equipo Uno', color: null });
    const share = (tab: Parameters<typeof footballShareCard>[0]['tab']) => footballShareCard({ leagueName: 'Liga de Ejemplo', tab, season, teamOf, nameOf: () => 'Jugador Uno' });
    expect(share('tabla')?.sections[0].rows[0]).toMatchObject({ name: 'Equipo Uno' });
    expect(share('goleadores')?.subtitle).toBe('Goleadores');
    expect(share('tarjetas')).toBeNull();
    expect(share('vallas')).toBeNull();
    expect(share('disciplina')).toBeNull();
    const groups = footballShareCard({ leagueName: 'Liga de Ejemplo', tab: 'tabla', season: { ...season, groups: [{ stage: 'Grupo A', rows: [row] }] }, teamOf, nameOf: () => '' });
    expect(groups?.sections[0].heading).toBe('Grupo A');
  });
});
