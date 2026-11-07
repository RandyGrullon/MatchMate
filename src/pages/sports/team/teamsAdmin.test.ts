import { describe, expect, it } from 'vitest';
import { BackendError } from '../../../lib/backend/types';
import type { SeasonTeam } from '../../../lib/data/seasonTeams';
import { addableLine, addablePlayers, rosterEdit, rosterError, rosterSubtitle, teamLine, validTeamName } from './teamsAdmin';

const team = (id: string, name: string, roster: SeasonTeam['roster']): Pick<SeasonTeam, 'id' | 'name' | 'roster'> => ({ id, name, roster });
const names: Record<string, string> = { p1: 'Jugador Uno', p2: 'Jugador Dos', p3: 'Jugador Tres', p4: 'Ángel Ejemplo' };
const nameOf = (id: string) => names[id] ?? '(jugador borrado)';

describe('Organizar › Equipos (plantillas)', () => {
  it('la línea del equipo con su capitán y el error del dorsal repetido', () => {
    const t = team('t1', 'Tigres de Ejemplo', [
      { playerId: 'p1', jersey: 4, position: 'Base', role: 'captain' },
      { playerId: 'p2', jersey: 5, position: null, role: 'player' },
    ]);
    expect(teamLine({ nameOf }, t)).toBe('2 jugadores · Capitán: Jugador Uno');
    expect(teamLine({ nameOf }, team('t2', 'Leones', [{ playerId: 'p2', jersey: null, position: null, role: 'player' }]))).toBe('1 jugador');
    expect(rosterSubtitle(t.roster[0])).toBe('Base · Capitán');
    expect(rosterError(new BackendError('dup', 'conflict'))).toBe('Ese dorsal ya lo usa otro jugador del equipo.');
    expect(validTeamName('  ')).toBe(false);
    expect(validTeamName('Tigres')).toBe(true);
  });

  it('lo que cambió en la hoja de un jugador', () => {
    const entry = { jersey: 4, position: 'Pívot', role: 'player' as const };
    const same = rosterEdit(entry, { jersey: '4', position: 'Pívot', role: 'player' }, true, ['Base', 'Escolta']);
    expect(same.changed).toBe(false);
    expect(same.posOptions).toEqual(['Base', 'Escolta', 'Pívot']);
    const changed = rosterEdit(entry, { jersey: '', position: '', role: 'captain' }, true, ['Base']);
    expect(changed.patch).toEqual({ jersey: null, position: null, role: 'captain' });
    // El capitán no cambia roles; un dorsal de 100 no vale.
    expect(rosterEdit(entry, { jersey: '100', position: 'Pívot', role: 'captain' }, false, []).badJersey).toBe(true);
    expect(rosterEdit(entry, { jersey: '4', position: 'Pívot', role: 'captain' }, false, []).changed).toBe(false);
  });

  it('a quién se puede agregar: sin equipo primero y la búsqueda sin tildes', () => {
    const t1 = team('t1', 'Tigres', [{ playerId: 'p1', jersey: 4, position: null, role: 'player' }]);
    const t2 = team('t2', 'Leones', [{ playerId: 'p2', jersey: 7, position: null, role: 'player' }]);
    const players = [
      { id: 'p1', name: 'Jugador Uno', uid: 'u1' },
      { id: 'p2', name: 'Jugador Dos', uid: null },
      { id: 'p3', name: 'Jugador Tres', uid: 'u3' },
      { id: 'p4', name: 'Ángel Ejemplo', uid: 'u4' },
    ];
    const { list, teamOf } = addablePlayers(players, t1, [t1, t2], '');
    expect(list.map((p) => p.id)).toEqual(['p4', 'p3', 'p2']);
    expect(addableLine(players[1], teamOf)).toBe('En Leones · Sin cuenta');
    expect(addableLine(players[2], teamOf)).toBe('');
    expect(addablePlayers(players, t1, [t1, t2], 'angel').list.map((p) => p.id)).toEqual(['p4']);
  });
});
