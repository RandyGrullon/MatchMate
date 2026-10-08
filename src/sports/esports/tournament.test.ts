import { describe, expect, it } from 'vitest';
import { canCheckIn, canRegister, formatLine, PHASE_TEXT, stagesFor, tournamentPhase, type PhaseInput } from '.';

const T = (iso: string) => Date.parse(iso);
const base: PhaseInput = {
  status: 'registration',
  startsAt: '2026-10-20T20:00:00Z',
  registrationOpensAt: '2026-10-10T00:00:00Z',
  registrationClosesAt: '2026-10-20T18:00:00Z',
  checkinMinutes: null,
};

describe('tournamentPhase', () => {
  it('el estado manda fuera de la inscripción', () => {
    const now = T('2026-10-15T00:00:00Z');
    expect(tournamentPhase({ ...base, status: 'live' }, now)).toBe('live');
    expect(tournamentPhase({ ...base, status: 'finished' }, now)).toBe('finished');
    expect(tournamentPhase({ ...base, status: 'cancelled' }, now)).toBe('cancelled');
  });

  it('pronto, abierta y cerrada', () => {
    expect(tournamentPhase(base, T('2026-10-09T23:59:59Z'))).toBe('soon');
    expect(tournamentPhase(base, T('2026-10-10T00:00:00Z'))).toBe('registration');
    expect(tournamentPhase(base, T('2026-10-20T17:59:59Z'))).toBe('registration');
    expect(tournamentPhase(base, T('2026-10-20T18:00:00Z'))).toBe('closed');
    expect(tournamentPhase(base, T('2026-10-25T00:00:00Z'))).toBe('closed');
    // Sin apertura: abierta desde ya.
    expect(tournamentPhase({ ...base, registrationOpensAt: null }, T('2026-01-01T00:00:00Z'))).toBe('registration');
  });

  it('check-in desde startsAt − minutos hasta startsAt + 30 min, cuando la inscripción ya cerró', () => {
    const t = { ...base, checkinMinutes: 60 };
    expect(tournamentPhase(t, T('2026-10-20T18:30:00Z'))).toBe('closed');
    expect(tournamentPhase(t, T('2026-10-20T19:00:00Z'))).toBe('checkin');
    expect(tournamentPhase(t, T('2026-10-20T20:29:59Z'))).toBe('checkin');
    expect(tournamentPhase(t, T('2026-10-20T20:30:00Z'))).toBe('closed');
  });

  it('si conviven, se ve la inscripción y se puede hacer check-in igual', () => {
    const t = { ...base, checkinMinutes: 180 };
    const now = T('2026-10-20T17:30:00Z');
    expect(tournamentPhase(t, now)).toBe('registration');
    expect(canRegister(t, now)).toBe(true);
    expect(canCheckIn(t, now)).toBe(true);
    const later = T('2026-10-20T18:10:00Z');
    expect(tournamentPhase(t, later)).toBe('checkin');
    expect(canRegister(t, later)).toBe(false);
    expect(canCheckIn(t, later)).toBe(true);
  });
});

describe('canRegister y canCheckIn', () => {
  it('inscripción', () => {
    expect(canRegister(base, T('2026-10-15T00:00:00Z'))).toBe(true);
    expect(canRegister(base, T('2026-10-09T00:00:00Z'))).toBe(false);
    expect(canRegister(base, T('2026-10-20T19:00:00Z'))).toBe(false);
    expect(canRegister({ ...base, status: 'live' }, T('2026-10-15T00:00:00Z'))).toBe(false);
    expect(canRegister({ ...base, status: 'cancelled' }, T('2026-10-15T00:00:00Z'))).toBe(false);
  });

  it('check-in solo con check-in, en la ventana y en inscripción', () => {
    const t = { ...base, checkinMinutes: 30 };
    expect(canCheckIn(base, T('2026-10-20T19:45:00Z'))).toBe(false);
    expect(canCheckIn(t, T('2026-10-20T19:29:00Z'))).toBe(false);
    expect(canCheckIn(t, T('2026-10-20T19:45:00Z'))).toBe(true);
    expect(canCheckIn(t, T('2026-10-20T20:15:00Z'))).toBe(true);
    expect(canCheckIn(t, T('2026-10-20T20:31:00Z'))).toBe(false);
    expect(canCheckIn({ ...t, status: 'live' }, T('2026-10-20T19:45:00Z'))).toBe(false);
  });
});

describe('textos', () => {
  it('PHASE_TEXT', () => {
    expect(PHASE_TEXT).toEqual({
      soon: 'Pronto',
      registration: 'Inscripción abierta',
      checkin: 'Check-in abierto',
      closed: 'Inscripción cerrada',
      live: 'En curso',
      finished: 'Terminado',
      cancelled: 'Cancelado',
    });
  });

  it('formatLine', () => {
    expect(formatLine({ game: 'valorant', mode: '5v5', format: 'double_elim', entryType: 'teams' })).toBe('5 contra 5 · Doble eliminación · Solo equipos');
    expect(formatLine({ game: 'free_fire', mode: 'squad', format: 'br', entryType: 'open' })).toBe('Escuadras · Battle royale · Libre');
    expect(formatLine({ game: 'ea_fc', mode: '1v1', format: 'round_robin', entryType: 'open' })).toBe('1 contra 1 · Todos contra todos · Libre');
  });

  it('stagesFor', () => {
    expect(stagesFor('single_elim')).toEqual(['bracket']);
    expect(stagesFor('double_elim')).toEqual(['bracket']);
    expect(stagesFor('groups_playoffs', 'double')).toEqual(['groups', 'playoffs']);
    expect(stagesFor('round_robin')).toEqual(['league']);
    expect(stagesFor('br')).toEqual([]);
  });
});
