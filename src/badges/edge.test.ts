/**
 * Entrada del motor para la Edge Function (src/badges/edge.ts): los nombres que lee el push agrupado
 * (`context.name` y `context.level_name`, private.badge_push_label).
 */
import { describe, expect, it } from 'vitest';
import { pushLabel, withPushLabels } from './edge';
import type { AwardDecision, BadgeDecision, ProgressDecision, ReviewDecision, RevokeDecision } from './types';

const award = (over: Partial<AwardDecision>): AwardDecision => ({
  kind: 'award',
  badge_key: 'debut',
  sport: 'bowling',
  level: 0,
  period_key: '-',
  player_id: null,
  user_id: 'u1',
  league_id: null,
  status: 'provisional',
  refs: [],
  context: { v: 1 },
  ...over,
});

describe('nombres para el push', () => {
  it('el nombre del deporte, el nivel propio o el metal', () => {
    expect(pushLabel(award({}))).toEqual({ name: 'Primera línea' });
    expect(pushLabel(award({ sport: 'golf' }))).toEqual({ name: 'Primera ronda' });
    expect(pushLabel(award({ badge_key: 'bowling_games', level: 3 }))).toEqual({ name: 'Líneas jugadas', level_name: 'oro' });
    expect(pushLabel(award({ badge_key: 'bowling_club', level: 1 }))).toEqual({ name: 'Club de los 200', level_name: 'Club 200' });
  });

  it('rellena el nombre con lo que trae la evidencia; la cara de la insignia manda', () => {
    expect(pushLabel(award({ badge_key: 'year_recap', sport: 'all', level: 2, period_key: '2026', context: { v: 1, values: { n: 60, anio: 2026 } } }))).toEqual({
      name: 'Tu 2026',
      level_name: 'plata',
    });
    // Sin año en la evidencia, el del periodo; y sin nada, no queda «{anio}».
    expect(pushLabel(award({ badge_key: 'year_recap', sport: 'all', level: 1, period_key: '2025' }))?.name).toBe('Tu 2025');
    expect(pushLabel(award({ badge_key: 'year_recap', sport: 'all', level: 1, period_key: '-' }))?.name).toBe('Tu');
    expect(pushLabel(award({ badge_key: 'season_podium', level: 3, context: { v: 1, alt: 'torneo' } }))).toEqual({ name: 'Título del torneo', level_name: 'Título' });
    expect(pushLabel(award({ badge_key: 'no_existe' }))).toBeNull();
  });

  it('solo en lo que se da o pide aval, sin pisar lo que ya trae', () => {
    const review: ReviewDecision = { ...award({ badge_key: 'bowling_games', level: 1 }), kind: 'review', reviewers: [] };
    const revoke: RevokeDecision = { kind: 'revoke', badge_key: 'debut', sport: 'bowling', level: 0, period_key: '-', player_id: null, user_id: 'u1', league_id: null, reason: 'evidencia' };
    const progress: ProgressDecision = { kind: 'progress', badge_key: 'bowling_games', sport: 'bowling', player_id: null, user_id: 'u1', league_id: null, value: 3, target: 30, next_level: 1 };
    const own = award({ context: { v: 1, name: 'Ya tenía nombre' } });
    const input: BadgeDecision[] = [award({}), review, revoke, progress, own, award({ badge_key: 'no_existe' })];
    const out = withPushLabels(input);
    expect(out.map((d) => (d.kind === 'award' || d.kind === 'review' ? [d.context.name, d.context.level_name] : d.kind))).toEqual([
      ['Primera línea', undefined],
      ['Líneas jugadas', 'bronce'],
      'revoke',
      'progress',
      ['Ya tenía nombre', undefined],
      [undefined, undefined],
    ]);
    expect(out[2]).toBe(revoke);
    // No cambia lo que entró.
    expect((input[0] as AwardDecision).context).toEqual({ v: 1 });
  });
});
