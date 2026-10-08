/** Íconos de las insignias (docs/insignias.md §4.4 y §5.4). */
import { describe, expect, it } from 'vitest';
import { SPORT_FAMILY, type SportId } from '../../sports/types';
import { BADGE_ICONS, BADGE_ICON_KEYS, FALLBACK_ICON, ICON_TABS, SPORT_EMBLEM, UI_ICONS, iconNode, iconToPath, isBadgeIconKey, searchIcons, type IconNode } from './icons';

/** Números de un camino o de los atributos de una figura (para ver que no se salen de la grilla de 24). */
const coords = (node: IconNode) =>
  node.flatMap(([tag, a]) => {
    if (tag === 'path') {
      // Solo caminos absolutos se pueden revisar número a número; los relativos se revisan pintados (render.test).
      return /^[MLHVCSQTAZ\d\s.,-]+$/.test(a.d ?? '') && !/A/.test(a.d ?? '') ? (a.d ?? '').match(/-?\d*\.?\d+/g)!.map(Number) : [];
    }
    return Object.entries(a)
      .filter(([k]) => ['cx', 'cy', 'x', 'y', 'x1', 'y1', 'x2', 'y2'].includes(k))
      .map(([, v]) => Number(v));
  });

describe('lista curada', () => {
  it('53 íconos en 5 pestañas: deporte 14, premios 9, esfuerzo 11, comunidad 10, nuestra tierra 9', () => {
    expect(BADGE_ICON_KEYS).toHaveLength(53);
    expect(ICON_TABS.map((t) => [t.key, BADGE_ICON_KEYS.filter((k) => BADGE_ICONS[k].tab === t.key).length])).toEqual([
      ['deporte', 14],
      ['premios', 9],
      ['esfuerzo', 11],
      ['comunidad', 10],
      ['tierra', 9],
    ]);
  });

  it('las claves pasan el check de league_badges.icon y cada ícono tiene nombre, etiquetas y figuras', () => {
    for (const k of BADGE_ICON_KEYS) {
      expect(k).toMatch(/^[a-z0-9-]{1,32}$/);
      const def = BADGE_ICONS[k];
      expect(def.label.length, k).toBeGreaterThan(1);
      expect(def.tags.length, k).toBeGreaterThan(0);
      for (const t of def.tags) expect(t, k).toMatch(/^[a-z0-9]+$/);
      expect(def.node.length, k).toBeGreaterThan(0);
      for (const v of coords(def.node)) {
        expect(v, k).toBeGreaterThanOrEqual(0);
        expect(v, k).toBeLessThanOrEqual(24);
      }
    }
  });

  it('fuera: el logo Dúo, letras, números, dinero y banderas de otros países', () => {
    for (const k of BADGE_ICON_KEYS) expect(k).not.toMatch(/duo|logo|letter|dollar|euro|coin|banknote|flag-[a-z]{2}$/);
  });

  it('cada deporte tiene su emblema; fútbol y sala comparten balón', () => {
    for (const s of Object.keys(SPORT_FAMILY) as SportId[]) expect(isBadgeIconKey(SPORT_EMBLEM[s]), s).toBe(true);
    expect(SPORT_EMBLEM.futsal).toBe(SPORT_EMBLEM.football);
    expect(new Set(Object.values(SPORT_EMBLEM)).size).toBe(10);
    // Esports: la mira (ya curada), aunque todavía no tenga insignias.
    expect(SPORT_EMBLEM.esports).toBe('crosshair');
    // Los de tenis y baloncesto son los mismos de src/sports/registry.ts.
    expect(BADGE_ICONS.tennis.node[0]).toEqual(['circle', { cx: '12', cy: '12', r: '10' }]);
    expect(BADGE_ICONS.swimming.node.length).toBe(5);
    // Ping pong: la paleta del registro, con su clave de guion.
    expect(SPORT_EMBLEM.table_tennis).toBe('ping-pong');
    expect(BADGE_ICONS['ping-pong'].node[0]).toEqual(['circle', { cx: '9.5', cy: '14.5', r: '6.5' }]);
    expect(searchIcons('ping pong')).toEqual(['ping-pong']);
    expect(searchIcons('pingpong')).toEqual(['ping-pong']);
  });

  it('una clave que no existe da el trofeo; los de estado no salen en el creador', () => {
    expect(iconNode('no-existe')).toBe(BADGE_ICONS[FALLBACK_ICON].node);
    expect(iconNode('lock')).toBe(UI_ICONS.lock);
    expect(iconNode('eye-off')).toBe(UI_ICONS['eye-off']);
    expect(isBadgeIconKey('lock')).toBe(false);
    expect(isBadgeIconKey('eye-off')).toBe(false);
    expect(isBadgeIconKey('constructor')).toBe(false);
  });
});

describe('búsqueda', () => {
  it('por nombre, etiqueta o clave, sin tildes', () => {
    expect(searchIcons('cigua')).toEqual(['bird']);
    expect(searchIcons('Pájaro')).toEqual(['bird']);
    expect(searchIcons('trofeo')).toEqual(['trophy']);
    expect(searchIcons('FUEGO')).toContain('flame');
    expect(searchIcons('montaña')).toEqual(['mountain']);
    expect(searchIcons('zzz')).toEqual([]);
  });

  it('sin texto: los de la pestaña', () => {
    expect(searchIcons('', 'premios')).toEqual(['trophy', 'medal', 'award', 'crown', 'star', 'gem', 'ribbon', 'badge-check', 'sparkles']);
    expect(searchIcons('  ')).toHaveLength(14);
  });
});

describe('a caminos (canvas)', () => {
  it('círculo, elipse, rectángulo con y sin esquinas, línea y polilínea', () => {
    expect(iconToPath(['circle', { cx: '12', cy: '12', r: '10' }])).toBe('M2 12A10 10 0 1 0 22 12A10 10 0 1 0 2 12Z');
    expect(iconToPath(['ellipse', { cx: '12', cy: '20', rx: '8', ry: '2' }])).toBe('M4 20A8 2 0 1 0 20 20A8 2 0 1 0 4 20Z');
    expect(iconToPath(['rect', { x: '3', y: '4', width: '18', height: '18' }])).toBe('M3 4H21V22H3Z');
    expect(iconToPath(['rect', { x: '3', y: '3', width: '18', height: '18', rx: '2' }])).toBe(
      'M5 3H19A2 2 0 0 1 21 5V19A2 2 0 0 1 19 21H5A2 2 0 0 1 3 19V5A2 2 0 0 1 5 3Z',
    );
    expect(iconToPath(['line', { x1: '10', y1: '2', x2: '14', y2: '2' }])).toBe('M10 2L14 2');
    expect(iconToPath(['polyline', { points: '22 7 13.5 15.5 8.5 10.5 2 17' }])).toBe('M22 7L13.5 15.5L8.5 10.5L2 17');
    expect(iconToPath(['polygon', { points: '12 2 15 8 9 8' }])).toBe('M12 2L15 8L9 8Z');
    expect(iconToPath(['path', { d: 'M4 22h16' }])).toBe('M4 22h16');
  });

  it('todas las figuras de todos los íconos dan un camino', () => {
    for (const k of BADGE_ICON_KEYS) for (const n of BADGE_ICONS[k].node) expect(iconToPath(n), k).toMatch(/^[Mm]/);
    for (const node of Object.values(UI_ICONS)) for (const n of node) expect(iconToPath(n)).toMatch(/^[Mm]/);
  });
});
