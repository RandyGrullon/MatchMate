import { describe, expect, it } from 'vitest';
import { BackendError } from '../../lib/backend/types';
import type { BadgeAward } from '../../lib/data/badges';
import { makerErrorText } from './maker/design';
import { groupTiles } from './logic';
import { awardDetail, awardSubject, moreTimesText, progressPct, reportErrorText, sheetActions, tileSub, toggleFeatured } from './sheet';

const NOW = Date.parse('2026-10-05T15:00:00Z');
const aw = (id: string, p: Partial<BadgeAward> & Pick<BadgeAward, 'key'>): BadgeAward => ({
  id,
  sport: 'bowling',
  level: 1,
  periodKey: '-',
  scope: 'cuenta',
  status: 'firme',
  awardedAt: '2026-09-20T12:00:00Z',
  firmAt: null,
  leagueId: null,
  leagueName: null,
  playerId: null,
  context: {},
  hidden: false,
  seenAt: null,
  history: false,
  ...p,
});

describe('el detalle (sheet.ts)', () => {
  const tiles = groupTiles([aw('c1', { key: 'bowling_club', level: 1 }), aw('c2', { key: 'bowling_club', level: 2, awardedAt: '2026-09-25T12:00:00Z' })], { own: true, now: NOW });
  const tile = tiles[0];

  it('los niveles de menor a mayor y el texto de la grilla', () => {
    const d = awardDetail(tile, { own: true });
    expect(d.levels.map((v) => v.award.id)).toEqual(['c1', 'c2']);
    expect(d.times).toEqual([]);
    expect(tileSub(tile)).toBe(tile.top.levelName === tile.top.metal ? tile.top.metal : `${tile.top.levelName} · ${tile.top.metal}`);
    expect(progressPct(1.4)).toBe(100);
    expect(moreTimesText(25)).toBe('y 5 más');
  });

  it('las acciones del dueño: destacar, y si salen solas y es la única, sin quitar', () => {
    const subject = { kind: 'award', tile } as const;
    const a = sheetActions(subject, { own: true, featured: ['c2'], featuredAuto: true });
    expect(a.isFeatured).toBe(true);
    expect(a.canToggleFeatured).toBe(false);
    expect(a.canShare).toBe(true);
    expect(sheetActions(subject, { own: false }).canShare).toBe(false);
    expect(toggleFeatured(['x', 'y', 'z'], { ids: ['c1'], isFeatured: false }, 'c2')).toEqual({ full: true });
    expect(toggleFeatured(['c2', 'x'], { ids: ['c1', 'c2'], isFeatured: true }, 'c2')).toEqual({ full: false, next: ['x'] });
  });

  it('una sola fila de la liga abre su detalle', () => {
    const rows = [aw('m1', { key: 'player_of_month', scope: 'liga', leagueId: 'L1', periodKey: '2026-09' })];
    expect(awardSubject(rows, 'm1', NOW)?.kind).toBe('award');
    expect(awardSubject(rows, null, NOW)).toBeNull();
  });

  it('el error al reportar dice lo mismo que el creador', () => {
    const errors = [
      new BackendError('rate_limited', 'rate_limited', 'P0001'),
      new BackendError('no_permitido', 'permission', '42501'),
      new BackendError('invalido', 'validation', 'P0001'),
      new BackendError('no_existe', 'not_found', 'P0001'),
      new BackendError('sin señal', 'network'),
      new Error('otra cosa'),
    ];
    for (const e of errors) expect(reportErrorText(e)).toBe(makerErrorText(e, { action: 'reportar' }));
  });
});
