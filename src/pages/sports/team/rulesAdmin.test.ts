import { describe, expect, it } from 'vitest';
import type { Match } from '../../../lib/data/matches';
import {
  basketballDraftOf,
  basketballNum,
  basketballRulesPatch,
  committeeCandidates,
  committeeMatches,
  committeeMatchOption,
  committeeMatchText,
  footballDraftOf,
  footballNum,
  footballRulesErrors,
  footballRulesPatch,
  missingTiebreaks,
  moveTiebreak,
  periodsNote,
  sanctionLine,
  sanctionTitle,
} from './rulesAdmin';

const match = (id: string, p: Partial<Match>): Match =>
  ({
    id,
    round: 2,
    stage: '',
    status: 'confirmed',
    score: { text: '2-1' },
    sides: [
      { side: 1, teamId: 't1', label: 'Equipo Uno', seed: null, players: [{ playerId: 'p9' }] },
      { side: 2, teamId: 't2', label: 'Equipo Dos', seed: null, players: [] },
    ],
    ...p,
  }) as unknown as Match;

describe('Organizar › Equipos › Reglas', () => {
  it('los números que se escriben', () => {
    expect(basketballNum('12', 1, 60, 10)).toBe(12);
    expect(basketballNum('70', 1, 60, 10)).toBe(10);
    expect(basketballNum('', 0, 30, 5)).toBe(0);
    expect(footballNum('', 0, 30, 5)).toBe(5);
    expect(footballNum('3', 3, 11, 7)).toBe(3);
  });

  it('baloncesto: el borrador, lo que se guarda y el aviso de los periodos', () => {
    const d = basketballDraftOf({});
    expect(d.cfg.periods).toBe(4);
    expect(basketballRulesPatch(d).teams.template).toBeNull();
    expect(periodsNote(d.cfg, d.cfg)).toBeNull();
    expect(periodsNote({ ...d.cfg, periods: 2 }, d.cfg)).toMatch(/^Con 2 mitades, las faltas de equipo se cuentan por periodo\. FIBA usa 4 cuartos \(.+\)\.$/);
  });

  it('fútbol: lo que se guarda, las validaciones y los desempates', () => {
    const d = footballDraftOf({}, 'futsal');
    const patch = footballRulesPatch({ teams: { other: 1 } }, d, 'futsal');
    expect(patch.match.variant).toBe('futsal');
    expect(patch.teams).toMatchObject({ other: 1, template: null });
    expect(footballRulesErrors({}, patch, 'futsal')).toEqual([]);
    expect(moveTiebreak(['diff', 'for', 'h2h'], 0, 1)).toEqual(['for', 'diff', 'h2h']);
    expect(moveTiebreak(['diff', 'for'], 0, -1)).toEqual(['diff', 'for']);
    expect(missingTiebreaks(['diff', 'for', 'h2h', 'wins', 'fair_play'])).toEqual(['lot']);
  });
});

describe('Organizar › Equipos › Comité', () => {
  it('los partidos, el texto y a quién se sanciona', () => {
    const played = committeeMatches([match('a', { round: 1 }), match('b', { status: 'scheduled', score: null }), match('c', { round: 3, status: 'live' })]);
    expect(played.map((m) => m.id)).toEqual(['c', 'a']);
    const text = committeeMatchText(played, 'a', (t) => (t === 't1' ? 'Tigres de Ejemplo' : null));
    expect(text).toBe('J1 · Tigres de Ejemplo vs. Equipo Dos');
    expect(committeeMatchOption(played[1], text)).toBe('J1 · Tigres de Ejemplo vs. Equipo Dos (2-1)');
    expect(committeeMatchText(played, 'zz', () => null)).toBe('partido borrado');
    expect(committeeCandidates(played[1], 't1', [{ id: 't1', roster: [{ playerId: 'p1', jersey: 4, position: null, role: 'player' }] }])).toEqual(['p1', 'p9']);
    expect(committeeCandidates(undefined, 't1', [])).toEqual([]);
    expect(sanctionTitle('Jugador Uno', 1)).toBe('Jugador Uno · 1 partido');
    expect(sanctionLine(null, 'J1 · Tigres vs. Leones', 'Agresión al árbitro')).toBe('Equipo · desde J1 · Tigres vs. Leones · Agresión al árbitro');
  });
});
