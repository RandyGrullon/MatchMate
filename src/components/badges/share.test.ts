import { describe, expect, it } from 'vitest';
import type { BadgeAward } from '../../lib/data/badges';
import { groupTiles, unlockPlan } from './logic';
import { sheetSharing, unlockShareLink, unlockSharing } from './share';

const NOW = new Date('2026-10-05T15:00:00Z');
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

describe('compartir una insignia (share.ts)', () => {
  const [tile] = groupTiles([aw('c1', { key: 'bowling_club', level: 1, leagueName: 'Liga de Ejemplo' })], { own: true, now: NOW.getTime() });
  const url = 'https://matchmate.grullonb.com/u/usuario-1';

  it('la ganada: la tarjeta con quien la ganó, el marco del deporte, el archivo y el texto con el link', () => {
    const s = sheetSharing({ kind: 'award', tile }, { playerName: 'Jugador Uno', url, own: true, now: NOW });
    expect(s).not.toBeNull();
    expect(s!.card.kind).toBe('badge');
    expect(s!.card.title).toBe(tile.top.name);
    expect(s!.url).toBe(url);
    expect(s!.frame.link).toBe(url);
    expect(s!.frame.sportLabel).not.toBe('MatchMate');
    expect(s!.filename).toMatch(/^insignia-.*jugador-uno-2026-10-05\.png$/);
    expect(s!.caption.endsWith(`\n${url}`)).toBe(true);
    expect(s!.caption).toContain(tile.top.name);
  });

  it('un admin la anuncia: «Liga … premió a …»', () => {
    const s = sheetSharing({ kind: 'award', tile }, { playerName: 'Jugador Uno', url, announce: true, now: NOW });
    expect(s!.caption).toContain('Liga de Ejemplo premió a Jugador Uno');
    // Su dueño (o quien comparte su propio jugador) no la anuncia.
    expect(sheetSharing({ kind: 'award', tile }, { playerName: 'Jugador Uno', url, announce: true, mayShare: true, now: NOW })!.caption).not.toContain('premió a');
  });

  it('lo que no se comparte (nada abierto, una bloqueada): null', () => {
    expect(sheetSharing(null, { playerName: 'Jugador Uno' })).toBeNull();
  });

  it('el aviso al ganar: con tu nombre y el link de tu perfil', () => {
    const plan = unlockPlan([aw('n1', { key: 'bowling_club', level: 1 })]);
    const [item] = plan.items;
    expect(item).toBeDefined();
    const link = unlockShareLink('https://matchmate.grullonb.com', 'usuario-1', 'https://matchmate.grullonb.com/yo');
    expect(link).toBe(url);
    const s = unlockSharing(item!, { name: 'Jugador Uno', url: link, now: NOW });
    expect(s.card.kind).toBe('badge');
    expect(s.filename).toMatch(/^insignia-.*jugador-uno-2026-10-05\.png$/);
    expect(s.caption).toContain(url);
    // Sin cuenta, el link de la pantalla.
    expect(unlockShareLink('https://matchmate.grullonb.com', null, 'https://matchmate.grullonb.com/yo')).toBe('https://matchmate.grullonb.com/yo');
  });
});
