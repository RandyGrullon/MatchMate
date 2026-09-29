import { createElement as h, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { Season } from '../../lib/seasons';
import { SeasonAwardsCard, SeasonSelect } from './SeasonSelect';

const render = (node: ReactNode) => renderToString(h(MemoryRouter, null, node));
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ');

const season = (over: Partial<Season> = {}): Season => ({
  id: 's26',
  name: 'Temporada 2026',
  startsOn: '2026-01-10',
  endsOn: null,
  status: 'active',
  closedAt: null,
  closedBy: null,
  standings: null,
  awards: [],
  playoffs: [],
  ...over,
});

const closed = season({
  id: 's25',
  name: 'Temporada 2025',
  startsOn: '2025-01-01',
  endsOn: '2025-12-20',
  status: 'closed',
  closedAt: '2025-12-20T23:00:00.000Z',
  awards: [
    { id: 'a2', kind: 'mvp', label: 'MVP', name: 'Luis', playerId: 'p2', teamId: null, note: null },
    { id: 'a1', kind: 'campeon', label: 'Campeón', name: 'Ana Pérez', playerId: 'p1', teamId: null, note: null },
    { id: 'a3', kind: 'otro', label: 'Mejor spare', name: 'Rosa', playerId: 'p3', teamId: null, note: 'La 7-10 en la final' },
  ],
});

describe('selector de temporada', () => {
  it('«Temporada 2026 ▾» con todas (la de ahora dice «en curso»)', () => {
    const html = render(h(SeasonSelect, { seasons: [season(), closed], value: season(), onChange: () => undefined }));
    expect(html).toContain('<select');
    expect(text(html)).toContain('Temporada 2026 (en curso)');
    expect(text(html)).toContain('Temporada 2025');
  });

  it('con una sola temporada solo dice su nombre; sin temporada, nada', () => {
    const one = render(h(SeasonSelect, { seasons: [season()], value: season(), onChange: () => undefined }));
    expect(one).not.toContain('<select');
    expect(text(one)).toContain('Temporada 2026');
    expect(render(h(SeasonSelect, { seasons: [], value: null, onChange: () => undefined }))).toBe('');
  });

  it('los premios de una temporada cerrada, el campeón arriba', () => {
    const t = text(render(h(SeasonAwardsCard, { season: closed })));
    expect(t).toContain('Campeón: Ana Pérez');
    expect(t).toContain('Temporada 2025 · terminó el');
    expect(t.indexOf('MVP')).toBeLessThan(t.indexOf('Mejor spare'));
    expect(t).toContain('La 7-10 en la final');
    // La activa no tiene premios que mostrar.
    expect(render(h(SeasonAwardsCard, { season: season() }))).toBe('');
  });
});
