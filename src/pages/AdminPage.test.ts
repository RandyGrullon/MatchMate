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
import type { League, Member } from '../lib/types';
import AdminPage from './AdminPage';

// Los miembros de la liga (Admin › Miembros): los de la prueba, o los de verdad (vacíos sin base) si no hay.
const data = vi.hoisted(() => ({ members: null as Member[] | null }));
vi.mock('../lib/data', async (orig) => {
  const real = await orig<typeof import('../lib/data')>();
  return {
    ...real,
    useLeagueMembers: (lid?: string) => (data.members ? { data: data.members, loading: false, error: null } : real.useLeagueMembers(lid)),
  };
});

// La acción que espera (useBusy), para ver la ruedita sin tocar nada; null = la de verdad.
const pending = vi.hoisted(() => ({ key: null as string | null }));
vi.mock('../components/busy', async (orig) => {
  const real = await orig<typeof import('../components/busy')>();
  return {
    ...real,
    useBusy: () => {
      const b = real.useBusy();
      const key = pending.key;
      return key == null ? b : { ...b, busy: key, isBusy: (k?: string) => (k === undefined ? true : k === key) };
    },
  };
});

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
  data.members = null;
  pending.key = null;
});

describe('tour de Admin', () => {
  it('sale en las ligas del boliche', () => {
    expect(adminTourWhen('bowling')).toBe(true);
  });

  it('no sale en los otros deportes (no tienen «Aprobar» ni promedios)', () => {
    for (const sport of ['padel', 'tennis', 'pickleball', 'table_tennis', 'golf', 'swimming', 'basketball', 'football', 'futsal']) {
      expect(adminTourWhen(sport), sport).toBe(false);
    }
  });
});

describe('pestaña «Pendientes»', () => {
  const html = (sport: string, url = '/l/l1/admin') =>
    renderToString(h(MemoryRouter, { initialEntries: [url] }, h(FeedbackProvider, null, h(LeagueContext.Provider, { value: ctx(sport) }, h(AdminPage)))));

  it('va primera y el Admin abre ahí (el orden en los otros deportes: arrangeAdminTabs en league/logic.test.ts)', () => {
    const out = html('bowling');
    expect(out).toMatch(/role="tab" aria-selected="true"[^>]*>(?:(?!<\/button>).)*Pendientes/);
    expect(out.indexOf('Pendientes')).toBeLessThan(out.indexOf('Jugadores'));
    expect(out).toContain('Suspender un día');
  });

  it('con otra pestaña pedida, sigue primera pero abre la pedida', () => {
    const out = html('bowling', '/l/l1/admin?tab=miembros');
    expect(out.indexOf('Pendientes')).toBeLessThan(out.indexOf('Miembros'));
    expect(out).not.toContain('Suspender un día');
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

describe('Admin › Miembros: los anotadores', () => {
  const member = (uid: string, name: string, extra: Partial<Member> = {}): Member => ({
    id: `l1_${uid}`,
    leagueId: 'l1',
    uid,
    name,
    role: 'member',
    playerId: `p-${uid}`,
    ...extra,
  });
  const members = [
    member('u-owner', 'Org', { role: 'owner' }),
    member('u-sofi', 'Sofi', { role: 'admin' }),
    member('u-luis', 'Luis', { role: 'admin' }),
    member('u-dani', 'Dani'),
    member('u-beto', 'Beto', { scorer: true, scorerOnly: true, playerId: null }),
  ];
  const draw = (asOwner: boolean) => {
    data.members = members;
    const base = ctx('bowling');
    const value: LeagueCtx = asOwner ? base : { ...base, isOwner: false, member: { ...base.member!, uid: 'u-sofi', name: 'Sofi', role: 'admin' } };
    return renderToString(
      h(MemoryRouter, { initialEntries: ['/l/l1/admin?tab=miembros'] }, h(FeedbackProvider, null, h(LeagueContext.Provider, { value }, h(AdminPage)))),
    )
      .replace(/<!-- -->/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ');
  };

  it('un admin nombra anotadores a los miembros, no a otro admin ni al dueño (y no nombra admins)', () => {
    const t = draw(false);
    expect(t).toContain('Solo el dueño nombra admins. Tú puedes nombrar anotadores.');
    expect(t.match(/Hacer anotador/g)).toHaveLength(1);
    expect(t).toMatch(/Dani Jugador: [^ ]+ Hacer anotador/);
    expect(t).toMatch(/Beto Anotador Solo anota Quitar anotador/);
    expect(t).not.toContain('Hacer admin');
  });

  it('el dueño, en la liga de boliche: anotadores para los torneos, y nombra admins', () => {
    const t = draw(true);
    expect(t).toContain('Solo tú, como dueño, nombras admins. Tú y los admins nombran anotadores.');
    expect(t).toContain('solo anota los juegos de los torneos');
    // Dani (miembro) y los dos admins.
    expect(t.match(/Hacer anotador/g)).toHaveLength(3);
    expect(t).toContain('Hacer admin');
  });

  it('mientras se guarda un permiso, solo ese botón da vueltas y los demás esperan', () => {
    data.members = members;
    const draw = () =>
      renderToString(
        h(MemoryRouter, { initialEntries: ['/l/l1/admin?tab=miembros'] }, h(FeedbackProvider, null, h(LeagueContext.Provider, { value: ctx('bowling') }, h(AdminPage)))),
      );
    expect(draw()).not.toContain('animate-spin');
    pending.key = 'l1_u-dani:scorer';
    const html = draw();
    const buttons = html.match(/<button[^>]*>(?:(?!<\/button>).)*<\/button>/g) ?? [];
    const spinning = buttons.filter((b) => b.includes('animate-spin'));
    expect(spinning).toHaveLength(1);
    expect(spinning[0]).toContain('Hacer anotador');
    expect(spinning[0]).toContain('disabled=""');
    // Los de los otros miembros (y los demás de Dani) no se pueden tocar mientras tanto.
    for (const label of ['Hacer admin', 'Quitar admin', 'Quitar anotador']) {
      const b = buttons.filter((x) => x.includes(label));
      expect(b.length, label).toBeGreaterThan(0);
      for (const x of b) expect(x, label).toContain('disabled=""');
    }
  });
});
