/** «Crear o unirme» sin pantalla (createChoices.ts): las ligas de boliche que organiza la cuenta y los textos. */
import { describe, expect, it } from 'vitest';
import type { League, Member } from '../../lib/types';
import { createChoices, pickLeagueRow, pickLeagueTitle, practiceOptionText, tourneyOptionText } from './createChoices';

const league = (id: string, name: string, sport = 'bowling', kind = 'liga') => ({ id, name, sport, kind, schedule: '' }) as unknown as League;
const member = (leagueId: string, role: Member['role']) => ({ leagueId, role }) as unknown as Member;

describe('create/createChoices', () => {
  it('solo las ligas de boliche que organiza (no los torneos sin liga ni otros deportes), por nombre', () => {
    const leagues = [league('b', 'Liga de los Martes'), league('a', 'Liga de Ejemplo'), league('c', 'Pádel de Ejemplo', 'padel'), league('d', 'Torneo de Ejemplo', 'bowling', 'torneo'), league('e', 'Liga de Otro')];
    const memberships = [member('a', 'owner'), member('b', 'admin'), member('c', 'owner'), member('d', 'owner'), member('e', 'member')];
    expect(createChoices(leagues, memberships).organized.map((o) => o.league.id)).toEqual(['a', 'b']);
  });

  it('los textos de la hoja', () => {
    const one = createChoices([league('a', 'Liga de Ejemplo')], [member('a', 'owner')]).organized;
    expect(pickLeagueTitle('torneo')).toBe('¿Dónde es el torneo?');
    expect(pickLeagueTitle('practica')).toBe('¿En qué liga?');
    expect(pickLeagueRow('torneo', { name: 'Liga de Ejemplo', schedule: 'Martes' })).toEqual({ title: 'En Liga de Ejemplo', text: 'Con los jugadores de la liga' });
    expect(pickLeagueRow('practica', { name: 'Liga de Ejemplo', schedule: '' })).toEqual({ title: 'Liga de Ejemplo', text: 'Práctica de la liga' });
    expect(practiceOptionText(one)).toBe('En Liga de Ejemplo');
    expect(tourneyOptionText(one)).toBe('Un día, con o sin liga');
    expect(tourneyOptionText([])).toBe('Un día, con sus inscritos');
  });
});
