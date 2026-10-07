import { createElement as h, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { HOME_TOUR } from '../../lib/tours';
import { initialSport } from '../LeagueFormModal';
import { FollowingSlot } from './FollowingSlot';
import { LeagueRow } from './LeagueCard';
import { MyLeaguesBody, NoLeaguesYet } from './MyLeagues';
import { SportHero, heroCountsLabel } from './SportHero';
import { sportTileNote } from './SportPickerRow';

const render = (node: ReactNode) => renderToString(h(MemoryRouter, null, node));
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ');

describe('Home del deporte: portada', () => {
  it('cuenta mis ligas y las públicas', () => {
    expect(heroCountsLabel(0, 0)).toBe('Ninguna liga tuya todavía');
    expect(heroCountsLabel(1, 0)).toBe('1 liga tuya');
    expect(heroCountsLabel(2, 1)).toBe('2 ligas tuyas · 1 pública');
    expect(heroCountsLabel(0, 5)).toBe('Ninguna liga tuya todavía · 5 públicas');
  });

  it('dice en qué deporte estás y ofrece crear una liga de ese deporte', () => {
    const html = text(
      render(h(SportHero, { sport: 'padel', status: 'open', mine: 2, publicCount: 3, signedIn: true, canCreate: true, onCreate: () => undefined })),
    );
    expect(html).toContain('Estás en');
    expect(html).toContain('Pádel');
    expect(html).toContain('Crear liga de pádel');
    expect(html).toContain('2 ligas tuyas · 3 públicas');
    expect(html).toContain('Ver todos los deportes');
  });

  it('si todavía no se puede crear de ese deporte, lo explica en vez del botón', () => {
    const html = text(
      render(h(SportHero, { sport: 'golf', status: 'beta', mine: 0, publicCount: 0, signedIn: true, canCreate: false, onCreate: () => undefined })),
    );
    expect(html).not.toContain('Crear liga de');
    expect(html).toContain('se abre pronto');
    expect(html).toContain('En prueba');
  });
});

describe('Home: piezas', () => {
  it('la nota de cada deporte en la fila de deportes', () => {
    expect(sportTileNote(1, 'open')).toBe('1 liga');
    expect(sportTileNote(3, 'beta')).toBe('3 ligas');
    expect(sportTileNote(0, 'beta')).toBe('Beta');
    expect(sportTileNote(0, 'open')).toBe('Explorar');
  });

  it('sin ligas: enseña qué hacer (crear solo si se puede)', () => {
    const yes = text(render(h(NoLeaguesYet, { sportName: 'tenis', canCreate: true, onCreate: () => undefined, exploreTo: '/ligas' })));
    expect(yes).toContain('Todavía no estás en ninguna liga de tenis');
    expect(yes).toContain('Crear liga de tenis');
    expect(yes).toContain('Ver ligas públicas');
    const no = text(render(h(NoLeaguesYet, { canCreate: false, onCreate: () => undefined })));
    expect(no).not.toContain('Crear liga');
    expect(no).toContain('Únete a una pública');
  });

  it('mis ligas: lo que hay gana; si no, error, cargando o vacío', () => {
    const body = (p: { count: number; loading: boolean; error: Error | null }) => text(render(h(MyLeaguesBody, { ...p, empty: 'VACIO', children: 'LISTA' })));
    expect(body({ count: 2, loading: true, error: new Error('x') })).toContain('LISTA');
    expect(body({ count: 0, loading: false, error: new Error('x') })).toContain('No se pudieron cargar');
    expect(body({ count: 0, loading: true, error: null })).not.toMatch(/VACIO|LISTA/);
    expect(body({ count: 0, loading: false, error: null })).toContain('VACIO');
  });

  it('«Siguiendo» vacío no sale en Hoy (antes ocupaba media pantalla explicando cómo seguir)', () => {
    for (const sport of [null, 'basketball'] as const) {
      const out = text(render(h(FollowingSlot, { sport })));
      expect(out).not.toContain('Siguiendo');
      expect(out).not.toContain('De quienes sigues');
    }
  });
});

describe('Crear desde el Home del deporte', () => {
  it('el deporte pedido sale marcado si se puede crear; si no, el de siempre', () => {
    expect(initialSport(['bowling', 'padel'], 'padel')).toEqual({ sport: 'padel', direct: true });
    expect(initialSport(['bowling'], 'golf')).toEqual({ sport: 'bowling', direct: false });
    expect(initialSport(['bowling', 'padel'], null).direct).toBe(false);
  });
});

describe('Tour del Home', () => {
  it('cada paso apunta a algo distinto e incluye el deporte en que estás y «Siguiendo»', () => {
    const targets = HOME_TOUR.map((s) => s.target);
    expect(new Set(targets).size).toBe(targets.length);
    expect(targets).toEqual(expect.arrayContaining(['nav', 'deporte', 'deportes', 'portada-deporte', 'siguiendo', 'unirse']));
  });
});

describe('Ligas públicas: la fila', () => {
  const league = {
    id: 'L1',
    name: 'Liga del Naco',
    kind: 'liga' as const,
    visibility: 'public' as const,
    ownerUid: '',
    venue: 'Club Naco',
    schedule: 'Martes 7 pm',
    seasonStart: '',
    seasonEnd: '',
    contactName: '',
    contactPhone: '',
    requirePhoto: false,
    sport: 'bowling',
  };

  it('dice cuántos son y cuándo juega, y debajo dónde y cuándo', () => {
    const html = text(render(h(LeagueRow, { league, today: '2026-09-28', line: '24 jugadores · juega el martes' })));
    expect(html).toContain('Liga del Naco');
    expect(html).toContain('24 jugadores · juega el martes');
    expect(html).toContain('Club Naco · Martes 7 pm');
  });

  it('sin línea (no hay nada que decir) queda solo dónde y cuándo', () => {
    const html = text(render(h(LeagueRow, { league, today: '2026-09-28', line: '' })));
    expect(html).not.toContain('jugadores');
    expect(html).toContain('Club Naco · Martes 7 pm');
  });
});
