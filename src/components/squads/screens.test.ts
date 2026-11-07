/**
 * Lo que se sacó de las pantallas de Equipos a logic.ts (la web y la app del teléfono lo usan igual): el estado de
 * Equipos, la pestaña del link, la invitación pendiente, la parte de Ligas, la posición y el número, las líneas y las
 * confirmaciones. Datos ficticios.
 */
import { describe, expect, it } from 'vitest';
import type { League } from '../../lib/types';
import {
  SQUAD_AUDIENCE_HINT,
  memberEdit,
  ownSquadLeagues,
  pendingInviteLine,
  pendingSquadInvite,
  requestLine,
  squadAsk,
  squadTabParam,
  squadsHomeState,
  squadsSectionMode,
} from './logic';

const list = (n: number, loading = false, error: unknown = null) => ({ data: Array.from({ length: n }, (_, i) => i), loading, error });

describe('Equipos: lo de las pantallas', () => {
  it('Equipos: cargando «Mis equipos» y «Todavía no tienes equipo»', () => {
    expect(squadsHomeState({ mine: list(0, true), esports: list(0), followed: list(0) })).toEqual({ loadingMine: true, nothing: false });
    expect(squadsHomeState({ mine: list(1, true), esports: list(0), followed: list(0) })).toEqual({ loadingMine: false, nothing: false });
    expect(squadsHomeState({ mine: list(0), esports: list(0), followed: list(0) })).toEqual({ loadingMine: false, nothing: true });
    expect(squadsHomeState({ mine: list(0), esports: list(0), followed: list(0, true) }).nothing).toBe(false);
    expect(squadsHomeState({ mine: list(0, false, new Error('x')), esports: list(0), followed: list(0) }).nothing).toBe(false);
  });

  it('la pestaña de entrada no va en el link', () => {
    expect(squadTabParam('publicaciones')).toBeNull();
    expect(squadTabParam('juegos')).toBe('juegos');
    expect(squadTabParam('plantilla', 'u1')).toBeNull();
    expect(squadTabParam('publicaciones', 'u1')).toBe('publicaciones');
  });

  it('la invitación pendiente solo con cuenta y sin ser miembro', () => {
    const invites = [{ id: 'i1', squad: { id: 's1' } }];
    expect(pendingSquadInvite(invites, 's1', true, 'none')?.id).toBe('i1');
    expect(pendingSquadInvite(invites, 's1', false, 'none')).toBeUndefined();
    expect(pendingSquadInvite(invites, 's1', true, 'member')).toBeUndefined();
    expect(pendingSquadInvite(invites, 's2', true, 'none')).toBeUndefined();
  });

  it('Ligas: la lista, la fila o nada', () => {
    expect(squadsSectionMode({ inSport: 2, total: 2, loading: false, sport: null })).toBe('list');
    expect(squadsSectionMode({ inSport: 0, total: 0, loading: false, sport: null })).toBe('row');
    expect(squadsSectionMode({ inSport: 0, total: 0, loading: true, sport: null })).toBeNull();
    expect(squadsSectionMode({ inSport: 0, total: 1, loading: false, sport: 'football' })).toBeNull();
    expect(squadsSectionMode({ inSport: 0, total: 0, loading: false, sport: 'esports' })).toBeNull();
  });

  it('la posición y el número', () => {
    const m = { position: 'Portero', jersey: 1 };
    expect(memberEdit(m, 'Portero', '1')).toEqual({ jersey: 1, badJersey: false, changed: false });
    expect(memberEdit(m, 'Portero', '')).toEqual({ jersey: null, badJersey: false, changed: true });
    expect(memberEdit(m, ' Defensa ', '1').changed).toBe(true);
    expect(memberEdit(m, 'Portero', '1a')).toEqual({ jersey: null, badJersey: true, changed: false });
  });

  it('las líneas de una invitación y de una solicitud', () => {
    const now = Date.parse('2026-11-06T12:00:00Z');
    const user = { id: 'u1', name: 'Jugador Uno', username: 'jugadoruno', avatar: null };
    expect(pendingInviteLine({ user, createdAt: '2026-11-06T10:00:00Z' }, now)).toMatch(/^@jugadoruno · invitado /);
    expect(pendingInviteLine({ user: { ...user, username: null }, createdAt: 'nada' }, now)).toBe('');
    const squad = { sport: 'football', city: 'Santo Domingo', members: 3 };
    expect(requestLine({ squad, requestedBy: { name: 'Jugador Uno' } })).toBe('Fútbol · Santo Domingo · 3 miembros · Lo pidió Jugador Uno');
    expect(requestLine({ squad: { ...squad, city: null }, requestedBy: { name: '' } })).toBe('Fútbol · 3 miembros');
  });

  it('mis ligas del deporte del equipo, sin menores', () => {
    const league = (id: string, sport: string, extra: Partial<League> = {}) => ({ id, name: `Liga ${id}`, sport, kind: 'liga', visibility: 'private', venue: ' Campo de Ejemplo ', logoPath: null, hasMinors: false, ...extra }) as unknown as League;
    const out = ownSquadLeagues([league('a', 'football'), league('b', 'basketball'), league('c', 'football', { hasMinors: true }), league('d', 'football', { kind: 'torneo', visibility: 'public' })], 'football');
    expect(out.map((l) => l.id)).toEqual(['a', 'd']);
    expect(out[0]).toEqual({ id: 'a', name: 'Liga a', sport: 'football', kind: 'liga', visibility: 'private', venue: 'Campo de Ejemplo', logo: null, members: 0, isMember: true });
    expect(out[1]).toMatchObject({ kind: 'torneo', visibility: 'public' });
  });

  it('las confirmaciones', () => {
    expect(squadAsk.request('Liga de Ejemplo', 1).message).toBe('Los admins de la liga deciden. Si aceptan, el equipo entra con su único miembro.');
    expect(squadAsk.request('Liga de Ejemplo', 3).message).toBe('Los admins de la liga deciden. Si aceptan, el equipo entra con sus 3 miembros.');
    expect(squadAsk.accept('Equipo de Ejemplo', 3).message).toMatch(/^Se crea el equipo en la liga y sus 3 miembros entran como jugadores\./);
    expect(squadAsk.accept('Equipo de Ejemplo', 1).message).toMatch(/su único miembro entra como jugador/);
    expect(squadAsk.delete('Equipo de Ejemplo')).toMatchObject({ title: '¿Borrar Equipo de Ejemplo?', confirmText: 'Borrar equipo', danger: true });
    expect(squadAsk.leave('Equipo de Ejemplo').title).toBe('¿Salir de Equipo de Ejemplo?');
    expect(squadAsk.renewCode().confirmText).toBe('Código nuevo');
    expect(SQUAD_AUDIENCE_HINT).toBe('La ve cualquiera y sale a quien sigue el equipo.');
  });
});
