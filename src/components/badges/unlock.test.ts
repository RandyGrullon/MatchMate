import { describe, expect, it } from 'vitest';
import type { BadgeAward } from '../../lib/data/badges';
import { unlockPlan } from './logic';
import { canShareUnlock, historyTitle, isPrivateUnlock, recapFacts, unlockHeader, unlockMoreLine, unlockTarget } from './unlock';

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
  leagueName: 'Liga de Ejemplo',
  playerId: null,
  context: {},
  hidden: false,
  seenAt: null,
  history: false,
  ...p,
});

describe('el aviso al ganar (unlock.ts)', () => {
  it('una automática: «¡Te ganaste una insignia!» con su nivel y su liga; sola, «Ver mis insignias» la abre', () => {
    const plan = unlockPlan([aw('a1', { key: 'bowling_club' })]);
    const h = unlockHeader(plan.items[0]);
    expect(h.title).toBe('¡Te ganaste una insignia!');
    expect(h.where).toBe('Liga de Ejemplo');
    expect(unlockTarget(plan)).toBe('a1');
    expect(unlockMoreLine(plan)).toBeNull();
  });

  it('la privada pregunta hasta que se contesta y solo se comparte si se mostró', () => {
    const plan = unlockPlan([aw('p1', { key: 'bowling_breakthrough', hidden: true })]);
    const it = plan.items[0];
    expect(isPrivateUnlock(it)).toBe(true);
    expect(isPrivateUnlock(it, new Set(['p1']))).toBe(false);
    expect(canShareUnlock(it, new Set())).toBe(false);
    expect(canShareUnlock(it, new Set(['p1']))).toBe(true);
  });

  it('el historial y el resumen del año', () => {
    expect(historyTitle(1)).toBe('Te dimos 1 insignia por tu historial');
    expect(unlockMoreLine({ more: 2, history: [{} as never] })).toBe('y 2 más · 1 por tu historial');
    expect(recapFacts({ year: '2026', days: 1, sports: null, months: 4, rarest: null, rarestText: null })).toEqual([
      { n: 1, label: 'día jugado' },
      { n: 4, label: 'meses activos' },
    ]);
  });
});
