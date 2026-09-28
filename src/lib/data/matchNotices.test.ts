import { describe, expect, it } from 'vitest';
import type { League, Member } from '../types';
import { lastScheduleChange, matchLeagueItems } from './matchNotices';
import type { MatchHistoryItem } from './matches';

const member = (leagueId: string, role: Member['role'] = 'member', playerId: string | null = `p-${leagueId}`): Member => ({
  id: `${leagueId}_u1`,
  leagueId,
  uid: 'u1',
  name: 'Ana',
  role,
  playerId,
});

const league = (id: string, sport?: string): Pick<League, 'id' | 'sport'> => ({ id, sport });

describe('qué ligas leen avisos de partidos', () => {
  it('solo raqueta y equipos; organizador si es dueño o admin; noches en pádel y pickleball', () => {
    const items = matchLeagueItems(
      [member('bol'), member('pad', 'owner'), member('ten'), member('pic', 'admin', null), member('fut'), member('golf'), member('nado'), member('sin-liga')],
      [league('bol'), league('pad', 'padel'), league('ten', 'tennis'), league('pic', 'pickleball'), league('fut', 'futsal'), league('golf', 'golf'), league('nado', 'swimming')],
    );
    expect(items).toEqual([
      { lid: 'pad', playerId: 'p-pad', isAdmin: true, family: 'racket', nights: true },
      { lid: 'ten', playerId: 'p-ten', isAdmin: false, family: 'racket', nights: false },
      { lid: 'pic', playerId: null, isAdmin: true, family: 'racket', nights: true },
      { lid: 'fut', playerId: 'p-fut', isAdmin: false, family: 'team', nights: false },
    ]);
  });

  it('un deporte que esta versión no conoce no lee nada', () => {
    expect(matchLeagueItems([member('x')], [league('x', 'curling')])).toEqual([]);
  });
});

describe('el último cambio de hora del historial', () => {
  const h = (a: string, by: string | null, extra: Partial<MatchHistoryItem> = {}): MatchHistoryItem => ({ at: '2026-10-08T20:00:00.123456+00:00', by, a, ...extra });

  it('el más nuevo de hora, cancha o aplazado (lo demás del historial no cuenta)', () => {
    const history = [
      h('schedule', 'admin', { from: { at: null, court: '' }, to: { at: '2026-10-09T00:00:00+00:00', court: 'Cancha 1' } }),
      h('reschedule', 'admin', {
        at: '2026-10-08T21:00:00+00:00',
        note: ' Lluvia ',
        from: { at: '2026-10-09T00:00:00+00:00', court: 'Cancha 1' },
        to: { at: '2026-10-10T00:00:00+00:00', court: 'Cancha 2' },
      }),
      h('takeover', 'otro'),
      h('release', 'u1'),
    ];
    expect(lastScheduleChange(history, 'u1')).toEqual({
      a: 'reschedule',
      at: '2026-10-08T21:00:00+00:00',
      fromAt: '2026-10-09T00:00:00+00:00',
      toAt: '2026-10-10T00:00:00+00:00',
      fromCourt: 'Cancha 1',
      toCourt: 'Cancha 2',
      note: 'Lluvia',
    });
  });

  it('aplazado: el `from` es el estado anterior (no una hora)', () => {
    expect(lastScheduleChange([h('postpone', 'admin', { from: 'scheduled', note: 'Se fue la luz' })], 'u1')).toMatchObject({
      a: 'postpone',
      fromAt: null,
      toAt: null,
      note: 'Se fue la luz',
    });
  });

  it('nada si el último cambio lo hizo la misma cuenta, si no cambió nada o si no hay historial', () => {
    const moved = h('reschedule', 'admin', { from: { at: 'a', court: '1' }, to: { at: 'b', court: '1' } });
    expect(lastScheduleChange([moved, h('reschedule', 'u1', { from: { at: 'b' }, to: { at: 'c' } })], 'u1')).toBeNull();
    expect(lastScheduleChange([h('schedule', 'admin', { from: { at: 'a', court: '1' }, to: { at: 'a', court: '1' } })], 'u1')).toBeNull();
    expect(lastScheduleChange([], 'u1')).toBeNull();
    expect(lastScheduleChange(null, 'u1')).toBeNull();
    expect(lastScheduleChange([h('finish', 'admin')], 'u1')).toBeNull();
  });
});
