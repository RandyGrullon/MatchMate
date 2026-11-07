import { describe, expect, it } from 'vitest';
import type { BadgeReview } from '../../lib/data/badges';
import { approveQuestion, leagueReviews, markersText, rejectText, reviewDone, reviewEventText, reviewSubline } from './reviews';

const review = (id: string, leagueId: string): BadgeReview => ({
  id,
  key: 'bowling_perfect_game',
  sport: 'bowling',
  level: 0,
  periodKey: 'e:E1',
  leagueId,
  leagueName: 'Liga de Ejemplo',
  playerId: 'p1',
  playerName: 'Jugador Uno',
  refs: [],
  context: { event: { id: 'E1', name: 'Práctica' } },
  awardedAt: '2026-10-04T12:00:00Z',
  overdue: false,
});

describe('por confirmar (reviews.ts)', () => {
  it('solo las de la liga, con sus textos', () => {
    const list = leagueReviews([review('r1', 'L1'), review('r2', 'L2')], 'L1');
    expect(list.map((m) => m.review.id)).toEqual(['r1']);
    const m = list[0];
    expect(reviewSubline(m)).not.toMatch(/Única/);
    expect(reviewEventText(m)).toBe('Ver Práctica');
    expect(approveQuestion(m).title).toBe(`¿Confirmar «${m.name}» de Jugador Uno?`);
    expect(rejectText(m)).toMatch(/de Jugador Uno no va a contar/);
  });

  it('los marcadores y el aviso al decidir', () => {
    expect(markersText(0)).toBeNull();
    expect(markersText(1)).toBe('Tarjeta firmada por 1 marcador');
    expect(reviewDone(true)).toBe('Confirmada: ya es firme');
    expect(reviewDone(false)).toBe('Listo: no cuenta');
  });
});
