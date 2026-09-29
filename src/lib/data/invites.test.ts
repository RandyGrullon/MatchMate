import { afterEach, describe, expect, it, vi } from 'vitest';
import { BLOCKED_MESSAGE } from '../backend/errors';
import { BackendError } from '../backend/types';
import { buildNotices } from '../notifications';
import { queryClient } from './client';
import {
  fetchInviteDetails,
  inviteErrorText,
  inviteNotices,
  inviteResultSummary,
  respondErrorText,
  sendInvites,
  type InviteResult,
  type LeagueInvite,
} from './invites';
import { handleMessage } from './topics';

const invite = (over: Partial<LeagueInvite> = {}): LeagueInvite => ({
  id: 'i1',
  leagueId: 'L1',
  leagueName: 'Liga de los martes',
  sport: 'padel',
  kind: 'liga',
  visibility: 'public',
  members: 12,
  invitedBy: { id: 'u-ana', name: 'Ana Pérez', username: 'anaperez' },
  createdAt: '2026-09-28T10:00:00.000Z',
  ...over,
});

const results = (...list: [string, InviteResult['status']][]): InviteResult[] => list.map(([userId, status]) => ({ userId, status }));

describe('avisos de invitaciones (sin base)', () => {
  it('uno por invitación pendiente: quién invitó, a qué liga y a dónde lleva', () => {
    expect(inviteNotices([invite()])).toEqual([
      {
        id: 'invitacion:i1',
        kind: 'social',
        icon: 'invite',
        category: 'ligas',
        title: 'Ana Pérez te invitó a Liga de los martes',
        body: 'Toca para ver la invitación y unirte.',
        url: '/invitacion/i1',
        at: '2026-09-28T10:00:00.000Z',
        lid: 'L1',
        sport: 'padel',
      },
    ]);
  });

  it('sin quien invitó (ya no tiene cuenta) o sin nombre; la más nueva primero', () => {
    const list = inviteNotices([
      invite({ id: 'viejo', invitedBy: null, createdAt: '2026-09-20T10:00:00.000Z' }),
      invite({ id: 'nuevo', invitedBy: { id: 'u', name: '  ', username: 'x' }, leagueName: ' ', createdAt: '2026-09-28T12:00:00.000Z' }),
    ]);
    expect(list.map((n) => [n.id, n.title])).toEqual([
      ['invitacion:nuevo', 'Te invitaron a una liga'],
      ['invitacion:viejo', 'Te invitaron a Liga de los martes'],
    ]);
    expect(inviteNotices(null)).toEqual([]);
    expect(inviteNotices([invite({ id: '' })])).toEqual([]);
  });

  it('en la campana: filtro Mis ligas, ícono de invitación y el deporte aunque no sea una liga mía', () => {
    const now = Date.parse('2026-09-28T13:00:00.000Z');
    const [n] = buildNotices([], [], '2026-09-28', now, null, inviteNotices([invite()]));
    expect(n).toMatchObject({
      id: 'invitacion:i1',
      kind: 'social',
      icon: 'invite',
      category: 'ligas',
      title: 'Ana Pérez te invitó a Liga de los martes',
      to: '/invitacion/i1',
      sport: 'padel',
      lid: '',
      time: Date.parse('2026-09-28T10:00:00.000Z'),
    });
  });
});

describe('resumen después de invitar', () => {
  it('una sola cuenta: una frase', () => {
    expect(inviteResultSummary(results(['a', 'sent']))).toBe('Invitación enviada');
    expect(inviteResultSummary(results(['a', 'member']))).toBe('Ya está en la liga.');
    expect(inviteResultSummary(results(['a', 'pending']))).toBe('Ya tenía una invitación.');
    expect(inviteResultSummary(results(['a', 'declined']))).toBe('La rechazó hace poco. Prueba en unos días.');
    expect(inviteResultSummary(results(['a', 'unavailable']))).toBe('Esa cuenta no está disponible.');
  });

  it('varias: cuántas salieron y por qué las demás no', () => {
    expect(inviteResultSummary(results(['a', 'sent'], ['b', 'sent'], ['c', 'sent'], ['d', 'member']))).toBe(
      'Invitación enviada a 3 personas · 1 ya está en la liga',
    );
    expect(inviteResultSummary(results(['a', 'sent'], ['b', 'pending'], ['c', 'pending']))).toBe('Invitación enviada a 1 persona · 2 ya tenían invitación');
    expect(inviteResultSummary(results(['a', 'member'], ['b', 'member'], ['c', 'declined'], ['d', 'unavailable'], ['e', 'unavailable']))).toBe(
      'No se envió ninguna invitación · 2 ya están en la liga · 1 la rechazó hace poco · 2 no están disponibles',
    );
    expect(inviteResultSummary(results(['a', 'sent'], ['b', 'sent']))).toBe('Invitación enviada a 2 personas');
    expect(inviteResultSummary([])).toBe('No se envió ninguna invitación');
  });

  it('las que no cupieron en el límite de hoy', () => {
    expect(inviteResultSummary(results(['a', 'rate_limited']))).toBe('Mandaste muchas invitaciones hoy. Prueba mañana.');
    expect(inviteResultSummary(results(['a', 'sent'], ['b', 'rate_limited'], ['c', 'rate_limited']))).toBe(
      'Invitación enviada a 1 persona · 2 no cupieron en el límite de hoy',
    );
  });

  it('en un torneo: «en el torneo»', () => {
    expect(inviteResultSummary(results(['a', 'member']), 'torneo')).toBe('Ya está en el torneo.');
    expect(inviteResultSummary(results(['a', 'sent'], ['b', 'member'], ['c', 'member']), 'torneo')).toBe(
      'Invitación enviada a 1 persona · 2 ya están en el torneo',
    );
  });
});

describe('errores de invitaciones', () => {
  it('en palabras simples', () => {
    expect(inviteErrorText(new BackendError('rate_limited', 'rate_limited', 'P0001'))).toBe('Mandaste muchas invitaciones hoy. Prueba mañana.');
    expect(inviteErrorText(new BackendError('no_permitido', 'permission', '42501'))).toBe('No tienes permiso para invitar a esta liga.');
    expect(inviteErrorText(new BackendError('no_existe', 'not_found', 'P0001'))).toBe('Esa invitación o esa liga ya no existe.');
    expect(inviteErrorText(new BackendError('invalido', 'validation', 'P0001'))).toBe('Elige entre 1 y 50 personas.');
    expect(inviteErrorText(new BackendError('x', 'network'))).toBe('Sin conexión. Prueba otra vez cuando tengas señal.');
    expect(inviteErrorText(new BackendError(BLOCKED_MESSAGE, 'permission', 'bloqueada'))).toBe(BLOCKED_MESSAGE);
    expect(inviteErrorText(new Error('otra'))).toBe('No se pudo. Prueba otra vez.');
    expect(inviteErrorText(new BackendError('no_permitido', 'permission', '42501'), 'torneo')).toBe('No tienes permiso para invitar a este torneo.');
  });

  it('al aceptar o rechazar: nada de «invitar» ni de cuántas personas elegir', () => {
    expect(respondErrorText(new BackendError('no_permitido', 'permission', '42501'))).toBe('No puedes responder esta invitación.');
    expect(respondErrorText(new BackendError('no_existe', 'not_found', 'P0001'))).toBe('Esa invitación ya no existe.');
    expect(respondErrorText(new BackendError('invalido', 'validation', 'P0001'))).toBe('No se pudo responder la invitación. Prueba otra vez.');
    expect(respondErrorText(new BackendError('x', 'network'))).toBe('Sin conexión. Prueba otra vez cuando tengas señal.');
    expect(respondErrorText(new BackendError(BLOCKED_MESSAGE, 'permission', 'bloqueada'))).toBe(BLOCKED_MESSAGE);
    expect(respondErrorText(new Error('otra'))).toBe('No se pudo responder la invitación. Prueba otra vez.');
  });

  it('sin nadie (o más de 50) ni pregunta a la base; un id que no es de invitación da null', async () => {
    await expect(sendInvites('L1', [])).rejects.toMatchObject({ kind: 'validation', code: 'invalido' });
    await expect(sendInvites('L1', Array.from({ length: 51 }, (_, i) => `u${i}`))).rejects.toMatchObject({ kind: 'validation' });
    await expect(fetchInviteDetails('no-es-un-id')).resolves.toBeNull();
  });
});

describe('tiempo real de invitaciones', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const invalidated = (topic: string, event: string) => {
    const spy = vi.spyOn(queryClient, 'invalidate');
    handleMessage(topic, null, { event, payload: { id: 'i1', status: 'pending' } });
    const out = spy.mock.calls.map(([t]) => t);
    spy.mockRestore();
    return out;
  };

  it("'invites' en user: mis invitaciones, la búsqueda, mis membresías y la campana", () => {
    expect(invalidated('user:u1', 'invites')).toEqual(['invites:me', 'people:search', 'members', 'feeds']);
  });

  it("'invites' en league: las de esa liga y la búsqueda", () => {
    expect(invalidated('league:L1', 'invites')).toEqual(['invites:L1', 'people:search']);
  });
});
