import { describe, expect, it } from 'vitest';
import type { BadgeAward } from '../../lib/data/badges';
import { attendanceText, badgesHiddenIn, currentTitle, hasEventAwards, playerPageId } from './league';

const aw = (id: string, p: Partial<BadgeAward>): BadgeAward => ({
  id,
  key: 'season_podium',
  sport: 'bowling',
  level: 3,
  periodKey: 's:S1',
  scope: 'liga',
  status: 'firme',
  awardedAt: '2026-09-20T12:00:00Z',
  firmAt: null,
  leagueId: 'L1',
  leagueName: null,
  playerId: 'p1',
  context: {},
  hidden: false,
  seenAt: null,
  history: false,
  ...p,
});

describe('las insignias en la liga (league.ts)', () => {
  it('con menores, solo los miembros', () => {
    expect(badgesHiddenIn({ hasMinors: true }, null)).toBe(true);
    expect(badgesHiddenIn({ hasMinors: true }, { role: 'member' })).toBe(false);
    expect(badgesHiddenIn({}, null)).toBe(false);
  });

  it('el título vigente es el oro de la última temporada (no un torneo suelto)', () => {
    const t = currentTitle([aw('a', {}), aw('b', { periodKey: 's:S2', awardedAt: '2026-10-01T00:00:00Z', playerId: 'p2' }), aw('c', { periodKey: 's:S3', awardedAt: '2026-10-02T00:00:00Z', context: { alt: 'torneo' } })]);
    expect(t?.award.id).toBe('b');
    expect([...(t?.players ?? [])]).toEqual(['p2']);
  });

  it('la página del jugador, las del evento y la asistencia', () => {
    expect(playerPageId('/l/L1/j/p%201', '/l/L1')).toBe('p 1');
    expect(playerPageId('/l/L1/ranking', '/l/L1')).toBeNull();
    expect(hasEventAwards([aw('e', { periodKey: 'e:E1:A' })], 'E1')).toBe(true);
    expect(attendanceText(1)).toBe('Asistencia perfecta: 1 jugador');
  });
});
