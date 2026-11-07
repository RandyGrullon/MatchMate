import { describe, expect, it } from 'vitest';
import { DEMO_COURSE, DEMO_PARS } from '../../../sports/golf/demo';
import type { GolfCardDoc, GolfRoundFull } from '../../../lib/data/golf';
import { playedRounds, playerStats } from './logic';
import { liteNumbers, recentRounds, roundLine, roundsCount } from './profile';

const round = (eventId: string): GolfRoundFull => ({
  eventId,
  courseId: 'demo',
  courseName: DEMO_COURSE.name,
  holes: 18,
  nine: 'all',
  competition: { format: 'stroke', basis: 'net', allowance: 95 },
  shotgun: false,
  tournamentId: null,
  roundNo: null,
  closed: true,
  closedAt: null,
  course: DEMO_COURSE,
});

const card = (eventId: string, strokes: (number | null)[]): GolfCardDoc => ({
  id: `c-${eventId}`,
  eventId,
  playerId: 'p1',
  teeId: 'azul',
  hcpIndex: 10,
  courseHcp: 10,
  playingHcp: 10,
  groupNo: 1,
  startHole: 1,
  strokes,
  putts: strokes.map(() => null),
  pickedUp: strokes.map(() => false),
  signed: true,
  signedAt: null,
  scoredAt: null,
  dq: false,
});

/** Mi golf: los números de Lite, las últimas rondas y su línea. */
describe('perfil de golf', () => {
  const data = {
    rounds: [round('e1'), round('e2')],
    cards: [card('e1', DEMO_PARS.map((p, i) => (i === 0 ? p - 1 : p))), card('e2', DEMO_PARS.map((p) => p + 1))],
  };
  const rounds = playedRounds(data);

  it('Lite: Mejor bruto · Promedio · Birdies', () => {
    expect(liteNumbers(playerStats(rounds))).toEqual([
      { label: 'Mejor bruto', value: 71, accent: true },
      { label: 'Promedio', value: (80.5).toLocaleString('es-DO') },
      { label: 'Birdies', value: 1 },
    ]);
  });

  it('las últimas, la más nueva primero, y la línea de cada una', () => {
    const dates: Record<string, string> = { e1: '2026-10-01', e2: '2026-10-15' };
    expect(recentRounds(rounds, (id) => dates[id]).map((r) => r.eventId)).toEqual(['e2', 'e1']);
    expect(roundLine(rounds[0])).toMatch(/^Campo de ejemplo · 18 hoyos · neto /);
    expect(roundsCount(1)).toBe('1 ronda firmada o cerrada');
    expect(roundsCount(2)).toBe('2 rondas firmadas o cerradas');
  });
});
