import { describe, expect, it } from 'vitest';
import type { BadgeAward, ProfileBadges } from '../../lib/data/badges';
import { ALL, awardTileLabel, canFeature, currentSubject, emptyTab, linkedSubject, pickerSave, pickerSlot, pickerToggle, tabModel, tabView } from './tab';

const NOW = Date.parse('2026-10-05T15:00:00Z');
let n = 0;
const aw = (p: Partial<BadgeAward> & Pick<BadgeAward, 'key'>): BadgeAward => ({
  id: `t${++n}`,
  sport: 'bowling',
  level: 0,
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

const data = (isMe: boolean, awards: BadgeAward[]): ProfileBadges => ({ userId: 'u1', isMe, featured: [], featuredLeague: [], hasChosen: false, awards, truncated: false, leagueAwards: [] });

describe('la pestaña Insignias (tab.ts)', () => {
  const club = aw({ key: 'bowling_club', level: 1 });
  const hidden = aw({ key: 'bowling_breakthrough', level: 1, hidden: true });
  const model = tabModel(data(true, [club, hidden]), [], ['bowling'], NOW);

  it('cuenta las que se ven y filtra por deporte; un filtro que ya no está vuelve a «Todas»', () => {
    expect(model.count).toBe(1);
    const all = tabView(model, { sports: ['bowling'], name: 'Jugador Uno', filter: ALL, showLocked: false });
    expect(all.filter).toBeNull();
    expect(all.first).toBe('Jugador');
    expect(all.shown).toHaveLength(2);
    expect(tabView(model, { sports: ['bowling'], name: 'Ana', filter: 'golf', showLocked: false }).active).toBe(ALL);
  });

  it('el nombre accesible dice «solo tú la ves» en la oculta; el vacío depende de quién mira', () => {
    const t = model.tiles.find((x) => x.bucket === 'hidden')!;
    expect(awardTileLabel(t)).toMatch(/, solo tú la ves$/);
    expect(emptyTab(false, 'Ana', []).text).toBe('Cuando Ana gane una en sus ligas, sale aquí.');
  });

  it('abre desde un link la que tiene esa fila y, si cambió, muestra la de ahora', () => {
    const s = linkedSubject(model, club.id);
    expect(s?.kind).toBe('award');
    expect(linkedSubject(model, 'otra')).toBeNull();
    expect(currentSubject(model, s)).toEqual(s);
  });

  it('destacadas: hasta 3, quitar todas las filas de una, y guardar solo si cambió', () => {
    expect(canFeature(data(true, [hidden]))).toBe(false);
    const t = model.tiles[0];
    expect(pickerToggle([], t)).toEqual({ full: false, next: [t.top.award.id] });
    expect(pickerToggle(['a', 'b', 'c'], t)).toEqual({ full: true });
    expect(pickerToggle([t.top.award.id], t)).toEqual({ full: false, next: [] });
    expect(pickerSlot(['x', t.top.award.id], t)).toBe(1);
    expect(pickerSave(['a'], ['a'], false)).toEqual({ save: false });
    expect(pickerSave(['a'], [], false)).toEqual({ save: true, done: 'Listo: ahora salen solas' });
  });
});
