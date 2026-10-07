/**
 * Las pantallas de Organizar (`/l/:lid/admin?tab=…`) dibujadas sin navegador (renderToString): «‹ Organizar» y su
 * título, Jugadores · Miembros · Reclamos, Temporada y fechas con «Suspender un día», Ajustes de la liga (el logo y el
 * respaldo) y los permisos de Miembros con su ruedita. Sin pantalla (o con la vieja «Pendientes») van a Organizar.
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedbackProvider } from '../components/feedback';
import { LeagueContext, type LeagueCtx } from '../lib/league';
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

// Ir a otra pantalla, a la vista: «[ir a …]» (sin navegador, <Navigate> no corre).
vi.mock('react-router', async (orig) => ({
  ...(await orig<typeof import('react-router')>()),
  Navigate: ({ to }: { to: string }) => `[ir a ${to}]`,
}));

// Las pantallas de los otros deportes, ya cargadas (sin pantallas propias de Admin).
vi.mock('../sports/screens', async (orig) => ({
  ...(await orig<typeof import('../sports/screens')>()),
  useSportScreens: (sport: string | null | undefined) => (sport && sport !== 'bowling' ? { adminTabs: [] } : null),
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

const draw = (sport: string, url: string, value: LeagueCtx = ctx(sport)) =>
  renderToString(h(MemoryRouter, { initialEntries: [url] }, h(FeedbackProvider, null, h(LeagueContext.Provider, { value }, h(AdminPage)))));
const words = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

beforeEach(() => {
  data.members = null;
  pending.key = null;
});

describe('Organizar › pantallas', () => {
  it('sin pantalla, con la vieja «Pendientes» o con una que no existe, va a Organizar de esa liga', () => {
    for (const url of ['/l/l1/admin', '/l/l1/admin?tab=pendientes', '/l/l1/admin?tab=nada']) {
      const out = draw('bowling', url);
      expect(out, url).toMatch(/^\[ir a \/organizar\?liga=l1\]/);
      expect(out, url).not.toContain('<h1');
    }
  });

  it('cada una con «‹ Organizar» (a esta liga) y su título; la gente, con Jugadores · Miembros · Reclamos', () => {
    const out = draw('bowling', '/l/l1/admin?tab=miembros');
    expect(out).toContain('href="/organizar?liga=l1"');
    expect(out).toMatch(/<h1 class="[^"]*text-title-pro[^"]*">Jugadores y miembros<\/h1>/);
    expect(out).toMatch(/role="radiogroup" aria-label="Gente de la liga"/);
    expect(out).toMatch(/role="radio" aria-checked="true"[^>]*>Miembros/);
    expect(words(out)).toMatch(/Jugadores Miembros Reclamos/);
    // Ya no hay pestañas ni tour.
    expect(out).not.toContain('role="tablist"');
  });

  it('Temporada y fechas trae «Suspender un día»; Aprobar juegos es solo del boliche', () => {
    const out = draw('bowling', '/l/l1/admin?tab=temporada');
    expect(out).toMatch(/<h1[^>]*>Temporada y fechas<\/h1>/);
    expect(words(out)).toContain('Suspender un día');
    expect(draw('bowling', '/l/l1/admin?tab=aprobar')).toMatch(/<h1[^>]*>Aprobar juegos<\/h1>/);
    expect(draw('golf', '/l/l1/admin?tab=aprobar')).toMatch(/^\[ir a \/organizar\?liga=l1\]/);
    expect(draw('golf', '/l/l1/admin?tab=temporada')).toMatch(/<h1[^>]*>Temporada y fechas<\/h1>/);
  });

  it('Avisar e Insignias tienen su pantalla (antes iban dentro de Liga)', () => {
    expect(draw('bowling', '/l/l1/admin?tab=avisar')).toMatch(/<h1[^>]*>Avisar a toda la liga<\/h1>/);
    expect(draw('bowling', '/l/l1/admin?tab=insignias')).toMatch(/<h1[^>]*>Insignias<\/h1>/);
    const ajustes = words(draw('bowling', '/l/l1/admin?tab=liga'));
    expect(ajustes).toContain('Ajustes de la liga');
    expect(ajustes).not.toContain('Avisar a toda la liga');
    expect(ajustes).toContain('Respaldo y borrar la liga');
  });
});

describe('Ajustes de la liga: el logo', () => {
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

describe('Jugadores y miembros › Miembros: los anotadores', () => {
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
