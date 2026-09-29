import { describe, expect, it } from 'vitest';
import { evaluate, evaluatorsOf, permitted, rowKey, settle, type EvaluatorSet } from './engine';
import { job, NOW, row, snap, world } from './evaluators/fixtures';
import type { Evaluator } from './evaluators/kit';
import type { BadgeSnapshot } from './snapshot';
import { snapLeague } from './testkit';
import type { AwardDecision, BadgeDecision, ProgressDecision, ReviewDecision, RevokeDecision } from './types';

const give = (over: Partial<AwardDecision> = {}): AwardDecision => ({
  kind: 'award',
  badge_key: 'bowling_clean_game',
  sport: 'bowling',
  player_id: 'p1',
  user_id: null,
  league_id: 'L',
  level: 0,
  period_key: 'g:x1:0',
  status: 'provisional',
  refs: ['entry:x1:0'],
  context: { v: 1 },
  ...over,
});

const ask = (over: Partial<ReviewDecision> = {}): ReviewDecision => ({
  kind: 'review',
  badge_key: 'bowling_perfect_game',
  sport: 'bowling',
  player_id: 'p1',
  user_id: null,
  league_id: 'L',
  level: 0,
  period_key: 'g:x1:0',
  refs: ['entry:x1:0'],
  context: { v: 1 },
  reviewers: ['u-owner'],
  ...over,
});

const pull = (d: AwardDecision): RevokeDecision => ({ kind: 'revoke', badge_key: d.badge_key, sport: d.sport, player_id: d.player_id, user_id: d.user_id, league_id: d.league_id, level: d.level, period_key: d.period_key, reason: 'evidencia' });

const progress = (over: Partial<ProgressDecision> = {}): ProgressDecision => ({
  kind: 'progress',
  badge_key: 'bowling_games',
  sport: 'bowling',
  player_id: null,
  user_id: 'u1',
  league_id: null,
  value: 12,
  target: 30,
  next_level: 1,
  ...over,
});

const base = (over: Partial<BadgeSnapshot> = {}): BadgeSnapshot => snap(job('resultado'), world('bowling', over));

describe('settle: permitido por el catálogo y la liga', () => {
  const leagues = new Map([
    ['L', snapLeague('L')],
    ['S', snapLeague('S', { badges_auto: 'sin_titulos' })],
    ['N', snapLeague('N', { badges_auto: 'ninguna' })],
    ['M', snapLeague('M', { has_minors: true, badges_auto: 'sin_titulos' })],
  ]);

  it('key y deporte que existen; las de liga con jugador y liga', () => {
    expect(permitted(give(), leagues)).toBe(true);
    expect(permitted(give({ badge_key: 'no_existe' }), leagues)).toBe(false);
    expect(permitted(give({ sport: 'golf' }), leagues)).toBe(false);
    expect(permitted(give({ league_id: null }), leagues)).toBe(false);
    expect(permitted(give({ player_id: null, user_id: 'u1', league_id: null }), leagues)).toBe(false);
  });

  it('badges_auto: sin títulos apaga los títulos; ninguna apaga las de liga, no las de cuenta', () => {
    const podium = give({ badge_key: 'event_podium', level: 3, period_key: 'e:E' });
    expect(permitted({ ...podium, league_id: 'S' }, leagues)).toBe(false);
    expect(permitted({ ...give(), league_id: 'S' }, leagues)).toBe(true);
    expect(permitted({ ...give(), league_id: 'N' }, leagues)).toBe(false);
    // Copia de respaldo (jugador sin cuenta) de una de cuenta: sigue valiendo en una liga «ninguna».
    expect(permitted(give({ badge_key: 'bowling_games', level: 1, period_key: '-', league_id: 'N' }), leagues)).toBe(true);
    // Ligas con menores: no hay títulos por defecto.
    expect(permitted({ ...podium, league_id: 'M' }, leagues)).toBe(false);
  });

  it('las que piden cuenta no van a un jugador sin cuenta', () => {
    expect(permitted(give({ badge_key: 'anniversary', sport: 'all', level: 1, period_key: '-' }), leagues)).toBe(false);
    expect(permitted(give({ badge_key: 'anniversary', sport: 'all', level: 1, period_key: '-', player_id: null, user_id: 'u1', league_id: null }), leagues)).toBe(true);
  });

  it('lo que ya no se permite y estaba provisional se retira', () => {
    const podium = give({ badge_key: 'event_podium', level: 3, period_key: 'e:E', league_id: 'S' });
    const s = base({ leagues: [snapLeague('S', { badges_auto: 'sin_titulos' })], awards: [row({ ...podium, status: 'provisional' })] });
    expect(settle(s, [podium])).toEqual([pull(podium)]);
  });
});

describe('settle: idempotencia', () => {
  it('no repite lo que ya está igual', () => {
    const d = give();
    expect(settle(base({ awards: [row({ ...d, refs: ['entry:x1:0'] })] }), [d])).toEqual([]);
    expect(settle(base({ awards: [row({ ...d, status: 'firme', refs: ['otra'] })] }), [d])).toEqual([]);
    expect(settle(base({ awards: [row({ ...ask(), status: 'en_revision' })] }), [ask()])).toEqual([]);
  });

  it('una provisional con otra evidencia se actualiza; una revocada por evidencia vuelve', () => {
    const d = give();
    expect(settle(base({ awards: [row({ ...d, refs: ['entry:x2:0'] })] }), [d])).toEqual([d]);
    expect(settle(base({ awards: [row({ ...d, status: 'revocada', revoke_reason: 'evidencia', revoked_at: NOW })] }), [d])).toEqual([d]);
  });

  it('una provisional que ahora pide aval pasa a revisión, y al revés', () => {
    const eagle = give({ badge_key: 'golf_eagle', sport: 'golf', period_key: 'c:c1', refs: ['card:c1'] });
    const albatross = ask({ badge_key: 'golf_eagle', sport: 'golf', period_key: 'c:c1', refs: ['card:c1'], context: { v: 1, alt: 'albatross' } });
    expect(settle(base({ awards: [row({ ...eagle })] }), [albatross])).toEqual([albatross]);
    expect(settle(base({ awards: [row({ ...albatross, status: 'en_revision' })] }), [eagle])).toEqual([eagle]);
  });

  it('nunca revive un aval rechazado ni un fraude', () => {
    for (const reason of ['aval', 'fraude'] as const) {
      expect(settle(base({ awards: [row({ ...ask(), status: 'revocada', revoke_reason: reason, revoked_at: NOW })] }), [ask()])).toEqual([]);
      expect(settle(base({ awards: [row({ ...give(), status: 'revocada', revoke_reason: reason, revoked_at: NOW })] }), [give()])).toEqual([]);
    }
  });

  it('retirar solo lo activo que no es firme; dar gana a retirar', () => {
    const d = give();
    expect(settle(base({ awards: [row({ ...d })] }), [pull(d)])).toEqual([pull(d)]);
    expect(settle(base({ awards: [row({ ...ask(), status: 'en_revision' })] }), [pull(ask() as unknown as AwardDecision)])).toHaveLength(1);
    expect(settle(base({ awards: [row({ ...d, status: 'firme' })] }), [pull(d)])).toEqual([]);
    expect(settle(base({ awards: [row({ ...d, status: 'revocada', revoke_reason: 'evidencia', revoked_at: NOW })] }), [pull(d)])).toEqual([]);
    expect(settle(base(), [pull(d)])).toEqual([]);
    expect(settle(base({ awards: [row({ ...d, refs: ['x'] })] }), [pull(d), d])).toEqual([d]);
  });

  it('dos decisiones de la misma fila: la primera', () => {
    const a = give();
    const b = give({ refs: ['entry:x1:0', 'otra'] });
    expect(settle(base(), [a, b])).toEqual([a]);
  });

  it('el progreso igual no se repite; borrar solo si existe', () => {
    const p = progress();
    const existing = { player_id: null, user_id: 'u1', league_id: null, badge_key: 'bowling_games', sport: 'bowling' as const, value: 12, target: 30, next_level: 1 as const, updated_at: NOW };
    expect(settle(base({ progress: [existing] }), [p])).toEqual([]);
    expect(settle(base({ progress: [existing] }), [progress({ value: 13 })])).toEqual([progress({ value: 13 })]);
    expect(settle(base(), [progress({ next_level: null })])).toEqual([]);
    expect(settle(base({ progress: [existing] }), [progress({ next_level: null })])).toEqual([progress({ next_level: null })]);
  });

  it('la clave de fila es la de badge_awards_once', () => {
    expect(rowKey(give())).toBe('p1|bowling_clean_game|bowling|0|g:x1:0');
    expect(rowKey(give({ player_id: null, user_id: 'u1' }))).toBe('u1|bowling_clean_game|bowling|0|g:x1:0');
  });
});

describe('evaluate: reparte por tipo de trabajo', () => {
  const calls: string[] = [];
  const spy =
    (name: string, out: BadgeDecision[] = []): Evaluator =>
    (j) => {
      calls.push(`${name}:${j.kind}`);
      return out;
    };
  const families: EvaluatorSet[] = [{ bowling_game: spy('juego'), debut: [spy('debut-a'), spy('debut-b')] }, { debut: spy('debut-c', [give()]) }];

  it('solo corre los evaluadores de ese tipo, en el orden de las familias', () => {
    calls.length = 0;
    const s = base();
    const out = evaluate(job('vinculo'), s, NOW, families);
    expect(calls).toEqual(['debut-a:vinculo', 'debut-b:vinculo', 'debut-c:vinculo']);
    expect(out).toEqual([give()]);
    calls.length = 0;
    evaluate(job('resultado'), s, NOW, families);
    expect(calls).toContain('juego:resultado');
    expect(evaluatorsOf('debut', families)).toHaveLength(3);
  });

  it('los avisos los resuelve SQL: el motor no hace nada', () => {
    calls.length = 0;
    expect(evaluate(job('aviso'), base(), NOW, families)).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('las familias de boliche, golf y natación están registradas', () => {
    expect(evaluatorsOf('bowling_career')).toHaveLength(1);
    expect(evaluatorsOf('golf_card')).toHaveLength(1);
    expect(evaluatorsOf('swim_meet')).toHaveLength(1);
    expect(evaluatorsOf('debut').length).toBeGreaterThanOrEqual(3);
    expect(evaluatorsOf('event_podium').length).toBeGreaterThanOrEqual(2);
  });
});
