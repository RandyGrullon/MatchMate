/**
 * El cuadrito de una liga (LeagueIcon) y su fila (LeagueRow) dibujados sin navegador (renderToString): con logo,
 * la imagen (sin texto alternativo: el nombre ya está al lado); mientras llega su URL, un cuadro vacío del mismo
 * tamaño; sin logo, el ícono del deporte o el trofeo, como siempre.
 */
import { createElement as h, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { primeLogoUrl } from '../../lib/logos';
import type { League } from '../../lib/types';
import { LeagueIcon, LeagueLogo, LeagueRow } from './LeagueCard';

const render = (node: ReactNode) => renderToString(h(MemoryRouter, null, node));

const LID = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const PATH = `${LID}/0199a1b2-c3d4-7e5f-8a9b-000000000001.webp`;
const URL_OK = 'https://x.supabase.co/storage/v1/object/public/logos/' + PATH;

const league = (extra: Partial<League> = {}): League => ({
  id: LID,
  name: 'Liga de los martes',
  kind: 'liga',
  visibility: 'public',
  ownerUid: 'u1',
  venue: 'Bolera del Este',
  schedule: 'Martes 7:00 pm',
  seasonStart: '',
  seasonEnd: '',
  contactName: '',
  contactPhone: '',
  requirePhoto: false,
  sport: 'bowling',
  ...extra,
});

describe('cuadrito de la liga', () => {
  it('sin logo: el ícono del deporte, sin imagen', () => {
    const html = render(h(LeagueIcon, { league: league() }));
    expect(html).not.toContain('<img');
    expect(html).toContain('<svg');
    expect(html).toContain('size-10 rounded-xl');
  });

  it('con logo que todavía no tiene URL: un cuadro vacío del mismo tamaño mientras llega (no salta al aparecer)', () => {
    const html = render(h(LeagueIcon, { league: league({ logoPath: `${LID}/0199a1b2-c3d4-7e5f-8a9b-00000000ffff.webp` }) }));
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<svg');
    expect(html).toMatch(/<span aria-hidden="true" class="[^"]*bg-surface-2[^"]*size-10 rounded-xl"><\/span>/);
  });

  it('con logo: la imagen con el mismo tamaño y esquinas, sin texto alternativo', () => {
    primeLogoUrl(PATH, URL_OK);
    const html = render(h(LeagueIcon, { league: league({ logoPath: PATH }) }));
    expect(html).toContain(`src="${URL_OK}"`);
    expect(html).toContain('alt=""');
    expect(html).toMatch(/<img[^>]*class="[^"]*object-cover[^"]*size-10 rounded-xl/);
    expect(html).not.toContain('<svg');
  });

  it('los tamaños: chico, grande y de portada', () => {
    primeLogoUrl(PATH, URL_OK);
    expect(render(h(LeagueIcon, { league: league({ logoPath: PATH }), size: 'sm' }))).toContain('size-7 rounded-lg');
    expect(render(h(LeagueIcon, { league: league({ logoPath: PATH }), size: 'lg' }))).toContain('size-12 rounded-2xl');
    expect(render(h(LeagueIcon, { league: league({ logoPath: PATH }), size: 'xl' }))).toContain('size-16 rounded-2xl');
    expect(render(h(LeagueIcon, { league: league(), size: 'xl' }))).toContain('size-16 rounded-2xl');
  });

  it('un torneo sin logo sigue con su trofeo', () => {
    const html = render(h(LeagueIcon, { league: league({ kind: 'torneo' }) }));
    expect(html).toContain('lucide-trophy');
  });

  it('LeagueLogo: sin ruta, lo de adentro (o nada)', () => {
    expect(render(h(LeagueLogo, { path: null, className: 'size-6' }, h('b', null, 'X')))).toBe('<b>X</b>');
    expect(render(h(LeagueLogo, { path: undefined, className: 'size-6' }))).toBe('');
    primeLogoUrl(PATH, URL_OK);
    expect(render(h(LeagueLogo, { path: PATH, className: 'size-6 rounded-md' }, h('b', null, 'X')))).not.toContain('<b>X</b>');
  });
});

describe('fila de la liga', () => {
  it('lleva el logo a la izquierda del nombre y abre la liga', () => {
    primeLogoUrl(PATH, URL_OK);
    const html = render(h(LeagueRow, { league: league({ logoPath: PATH }), today: '2026-09-29' }));
    expect(html).toContain(`href="/l/${LID}"`);
    expect(html.indexOf('<img')).toBeGreaterThan(-1);
    expect(html.indexOf('<img')).toBeLessThan(html.indexOf('>Liga de los martes<'));
  });

  it('sin logo, como siempre', () => {
    const html = render(h(LeagueRow, { league: league(), today: '2026-09-29' }));
    expect(html).not.toContain('<img');
    expect(html).toContain('Liga de los martes');
    expect(html).toContain('Pública');
  });
});
