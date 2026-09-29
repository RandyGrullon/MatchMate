/**
 * El tour de Admin (tours.ts › ADMIN_TOUR) explica las pestañas del boliche: «Aprobar» y los promedios de los
 * jugadores. En los otros deportes esa pestaña no existe, así que el tour no arranca. Se dibuja Admin (sin
 * navegador, renderToString) con un Tour de mentira que guarda con qué se llamó.
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TourStep } from '../components/Tour';
import { FeedbackProvider } from '../components/feedback';
import { LeagueContext, type LeagueCtx } from '../lib/league';
import { ADMIN_TOUR } from '../lib/tours';
import type { League } from '../lib/types';
import AdminPage from './AdminPage';

const calls = vi.hoisted(() => [] as { name: string; steps: TourStep[]; when?: boolean }[]);
vi.mock('../components/Tour', () => ({
  Tour: (props: { name: string; steps: TourStep[]; when?: boolean }) => {
    calls.push(props);
    return null;
  },
}));

const league = (sport: string): League => ({
  id: 'l1',
  name: 'Liga del Club',
  kind: 'liga',
  visibility: 'private',
  ownerUid: 'u-admin',
  venue: '',
  schedule: '',
  seasonStart: '',
  seasonEnd: '',
  contactName: '',
  contactPhone: '',
  requirePhoto: false,
  sport,
});

const ctx = (sport: string): LeagueCtx => ({
  lid: 'l1',
  league: league(sport),
  member: { id: 'l1_u', leagueId: 'l1', uid: 'u-admin', name: 'Org', role: 'owner', playerId: 'p1' },
  isAdmin: true,
  isOwner: true,
  isScorer: false,
  canScore: true,
  myPlayerId: 'p1',
  base: '/l/l1',
});

/** Con qué `when` se pidió el tour de Admin al dibujar la pantalla de esa liga. */
function adminTourWhen(sport: string): boolean | undefined {
  calls.length = 0;
  renderToString(
    h(MemoryRouter, { initialEntries: ['/l/l1/admin?tab=miembros'] }, h(FeedbackProvider, null, h(LeagueContext.Provider, { value: ctx(sport) }, h(AdminPage)))),
  );
  const tour = calls.find((c) => c.name === 'admin');
  expect(tour?.steps).toBe(ADMIN_TOUR);
  return tour?.when;
}

beforeEach(() => {
  calls.length = 0;
});

describe('tour de Admin', () => {
  it('sale en las ligas del boliche', () => {
    expect(adminTourWhen('bowling')).toBe(true);
  });

  it('no sale en los otros deportes (no tienen «Aprobar» ni promedios)', () => {
    for (const sport of ['padel', 'tennis', 'pickleball', 'golf', 'swimming', 'basketball', 'football', 'futsal']) {
      expect(adminTourWhen(sport), sport).toBe(false);
    }
  });
});

describe('Admin › Liga: el logo', () => {
  const draw = (extra: Partial<League>) =>
    renderToString(
      h(
        MemoryRouter,
        { initialEntries: ['/l/l1/admin?tab=liga'] },
        h(FeedbackProvider, null, h(LeagueContext.Provider, { value: { ...ctx('bowling'), league: { ...league('bowling'), ...extra } } }, h(AdminPage))),
      ),
    );
  const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  it('sin logo: «Subir logo» (solo imágenes) y el ícono del deporte', () => {
    const html = draw({});
    const t = text(html);
    expect(t).toContain('Logo');
    expect(t).toContain('Subir logo');
    expect(t).toContain('Es una imagen pública');
    expect(t).not.toContain('Quitar');
    expect(html).toContain('accept="image/*"');
  });

  it('con logo: «Cambiar» y «Quitar»', () => {
    const t = text(draw({ logoPath: 'l1/0199a1b2-c3d4-7e5f-8a9b-000000000001.webp' }));
    expect(t).toContain('Cambiar');
    expect(t).toContain('Quitar');
    expect(t).not.toContain('Subir logo');
  });
});
