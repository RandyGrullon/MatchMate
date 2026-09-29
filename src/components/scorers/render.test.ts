/**
 * «Anotadores» dibujado sin navegador (renderToString) con datos de mentira: la hoja con anotadores, invitados,
 * «Juega» y «Solo anota»; las tres pestañas (De la liga, Por @usuario y Link, también en una liga con menores); y el
 * botón, que solo ve el dueño o un admin.
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PeopleLive, PersonHit } from '../../lib/data/people';
import type { ScorerAccess, ScorerLink, ScorerTarget } from '../../lib/data/scorers';
import { LeagueContext, type LeagueCtx } from '../../lib/league';
import type { League, Member } from '../../lib/types';
import { FeedbackProvider } from '../feedback';

const state = vi.hoisted(() => ({
  members: { data: [] as Member[], loading: false, error: null as Error | null },
  access: { data: { invites: [], links: [] } as ScorerAccess, loading: false, error: null as Error | null },
  people: { data: [], loading: false, error: null, settled: true, query: '' } as PeopleLive,
}));

vi.mock('../../lib/data/members', async (orig) => ({
  ...(await orig<typeof import('../../lib/data/members')>()),
  useLeagueMembers: () => state.members,
}));
vi.mock('../../lib/data/scorers', async (orig) => ({
  ...(await orig<typeof import('../../lib/data/scorers')>()),
  useScorerAccess: () => state.access,
}));
vi.mock('../../lib/data/people', async (orig) => ({
  ...(await orig<typeof import('../../lib/data/people')>()),
  usePeople: () => state.people,
}));

const { default: ScorersSheet } = await import('./ScorersSheet');
const { ScorersButton } = await import('./ScorersButton');

const league = (extra: Partial<League> = {}) =>
  ({ id: 'l1', name: 'Liga de los martes', kind: 'liga', visibility: 'private', sport: 'bowling', tz: 'America/Santo_Domingo', ...extra }) as League;

const member = (uid: string, name: string, extra: Partial<Member> = {}): Member => ({
  id: `l1_${uid}`,
  leagueId: 'l1',
  uid,
  name,
  role: 'member',
  playerId: `p-${uid}`,
  ...extra,
});

const ctx = (extra: Partial<LeagueCtx> = {}): LeagueCtx => ({
  lid: 'l1',
  league: league(),
  member: member('org', 'Org', { role: 'owner' }),
  isAdmin: true,
  isOwner: true,
  isScorer: false,
  canScore: true,
  myPlayerId: 'p-org',
  base: '/l/l1',
  ...extra,
});

const target: ScorerTarget = { scope: 'evento', refId: 'e1', title: 'Copa Aniversario' };

const link = (extra: Partial<ScorerLink> = {}): ScorerLink => ({
  id: 'k1',
  code: 'ABCDEFGH23',
  scope: 'evento',
  refId: 'e1',
  title: 'Copa Aniversario',
  path: '/l/l1/e/e1',
  expiresAt: '2026-10-06T15:00:00Z',
  uses: 2,
  maxUses: 20,
  status: 'ok',
  createdBy: { id: 'org', name: 'Org' },
  createdAt: '2026-09-29T15:00:00Z',
  ...extra,
});

const hit = (id: string, name: string, extra: Partial<PersonHit> = {}): PersonHit => ({
  id,
  name,
  username: name.toLowerCase(),
  isFollowing: true,
  followsYou: false,
  inLeague: false,
  invited: false,
  ...extra,
});

const render = (el: ReactElement, c: LeagueCtx = ctx()) =>
  renderToString(h(MemoryRouter, null, h(FeedbackProvider, null, h(LeagueContext.Provider, { value: c }, el))));
const sheet = (extra: Record<string, unknown> = {}, c?: LeagueCtx) =>
  render(h(ScorersSheet, { target, participants: ['p-carla'], open: true, onClose: () => undefined, ...extra }), c);
/** Texto visible (sin etiquetas), para buscar frases. */
const text = (html: string) =>
  html
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

/** La etiqueta <button …> del botón que dice `label` (en su texto o en su aria-label). */
const buttonTag = (html: string, label: string) =>
  [...html.matchAll(/<button[^>]*>[\s\S]*?<\/button>/g)]
    .map((m) => m[0])
    .find((b) => b.includes(`aria-label="${label}"`) || text(b).trim() === label)
    ?.match(/^<button[^>]*>/)?.[0] ?? '';

const MEMBERS = [
  member('org', 'Org', { role: 'owner' }),
  member('sofi', 'Sofi', { role: 'admin' }),
  member('carla', 'Carla', { scorer: true }),
  member('beto', 'Beto', { scorer: true, scorerOnly: true, playerId: null }),
  member('dani', 'Dani'),
];

beforeEach(() => {
  state.members = { data: MEMBERS, loading: false, error: null };
  state.access = {
    data: {
      invites: [
        {
          id: 'i1',
          user: { id: 'eva', name: 'Eva', username: 'eva' },
          invitedBy: { id: 'org', name: 'Org' },
          asPlayer: false,
          scope: 'evento',
          refId: 'e1',
          title: 'Copa Aniversario',
          createdAt: '2026-09-29T12:00:00Z',
        },
      ],
      links: [],
    },
    loading: false,
    error: null,
  };
  state.people = { data: [], loading: false, error: null, settled: true, query: '' };
});

describe('la hoja «Anotadores»', () => {
  it('cerrada o sin ser admin, nada', () => {
    expect(text(sheet({ open: false }))).not.toContain('Anotan ahora');
    expect(text(sheet({}, ctx({ isAdmin: false, isOwner: false })))).not.toContain('Anotan ahora');
  });

  it('quién anota: con «Juega», «Solo anota» e «Invitado», y los admins', () => {
    const t = text(sheet());
    expect(t).toContain('Anotadores');
    expect(t).toContain('Copa Aniversario');
    expect(t).toContain('Podrán anotar en los torneos de esta liga (no en las prácticas). No los inscribe como jugadores.');
    expect(t).toContain('Anotan ahora');
    expect(t).toMatch(/Beto Solo anota Quitar/);
    expect(t).toMatch(/Carla Juega Quitar/);
    expect(t).toMatch(/Eva @eva Invitado Retirar/);
    expect(t).toContain('Los admins (2) también anotan.');
    // Los admins no salen como anotadores.
    expect(t).not.toMatch(/Sofi[^.]*Quitar/);
  });

  it('sin anotadores: cómo sumar a alguien', () => {
    state.members = { data: [member('org', 'Org', { role: 'owner' }), member('dani', 'Dani')], loading: false, error: null };
    state.access = { data: { invites: [], links: [] }, loading: false, error: null };
    expect(text(sheet())).toContain('Todavía no hay anotadores. Elige a alguien de la liga, búscalo por su @usuario o manda el link.');
  });

  it('«De la liga»: los miembros que todavía no anotan, con «Hacer anotador»', () => {
    const t = text(sheet());
    expect(t).toContain('De la liga');
    expect(t).toContain('Por @usuario');
    expect(t).toContain('Link');
    expect(t).toMatch(/Dani Hacer anotador/);
    expect(t).not.toMatch(/Carla Hacer anotador/);
  });

  it('en un torneo sin liga la pestaña es «Del torneo» y el texto habla del torneo', () => {
    const t = text(sheet({}, ctx({ league: league({ kind: 'torneo', name: 'Copa' }) })));
    expect(t).toContain('Del torneo');
    expect(t).toContain('Anotan los resultados de este torneo.');
  });

  it('«Por @usuario»: el botón de cada persona', () => {
    state.people = {
      data: [
        hit('dani', 'Dani', { inLeague: true }),
        hit('carla', 'Carla', { inLeague: true }),
        hit('sofi', 'Sofi', { inLeague: true }),
        hit('eva', 'Eva', { invited: true }),
        hit('nora', 'Nora'),
      ],
      loading: false,
      error: null,
      settled: true,
      query: '',
    };
    const t = text(sheet({ initialTab: 'usuario' }));
    expect(t).toContain('Personas que sigues');
    expect(t).toMatch(/Dani @dani Hacer anotador/);
    expect(t).toMatch(/Carla @carla Juega Ya anota/);
    expect(t).toMatch(/Sofi @sofi Admin/);
    expect(t).toMatch(/Eva @eva Invitado Retirar/);
    expect(t).toMatch(/Nora @nora Invitar a anotar/);
  });

  it('«Link» sin link: por qué y «Crear link para anotar»', () => {
    const t = text(sheet({ initialTab: 'link' }));
    expect(t).toContain('Todavía no hay link para anotar en este torneo.');
    expect(t).toContain('Crear link para anotar');
    state.access = { ...state.access, data: { ...state.access.data, links: [link({ status: 'expired' })] } };
    const t2 = text(sheet({ initialTab: 'link' }));
    expect(t2).toContain('El link para anotar venció.');
    expect(t2).toContain('Crear link para anotar');
  });

  it('«Link» que sirve: compartir, cuándo vence, el aviso, cambiar y quitar', () => {
    state.access = { ...state.access, data: { ...state.access.data, links: [link({ refId: 'otro' }), link()] } };
    const out = sheet({ initialTab: 'link' });
    const t = text(out);
    expect(out).toContain('/anotar/ABCDEFGH23');
    expect(out).toContain(encodeURIComponent('Te invito a anotar en Copa Aniversario con MatchMate'));
    expect(t).toContain('Vence el 6 de octubre · 2 de 20 usos');
    expect(t).toContain('Cualquiera con este link puede entrar a anotar. Mándalo solo a quien va a anotar.');
    expect(t).toContain('Cambiar link');
    expect(t).toContain('Quitar link');
    expect(t).not.toContain('Crear link para anotar');
  });

  it('sin la lista de quién juega (un torneo de varios eventos que todavía carga): nadie sale con «Juega»', () => {
    const c = ctx({ league: league({ kind: 'torneo', name: 'Copa' }) });
    expect(text(sheet({ participants: undefined }, c))).not.toContain('Juega');
    expect(text(sheet({ participants: ['p-carla'] }, c))).toMatch(/Carla Juega Quitar/);
  });

  it('los botones de cada fila miden 44 px (h-11), como los del link', () => {
    const out = sheet();
    for (const label of ['Quitarle el permiso de anotar a Carla', 'Retirar la invitación a Eva', 'Hacer anotador']) {
      expect(buttonTag(out, label), label).toContain('h-11');
    }
    state.people = {
      data: [hit('dani', 'Dani', { inLeague: true }), hit('carla', 'Carla', { inLeague: true }), hit('sofi', 'Sofi', { inLeague: true }), hit('eva', 'Eva', { invited: true }), hit('nora', 'Nora')],
      loading: false,
      error: null,
      settled: true,
      query: '',
    };
    const byUser = sheet({ initialTab: 'usuario' });
    for (const label of ['Hacer anotador', 'Ya anota', 'Admin', 'Retirar la invitación a Eva', 'Invitar a anotar']) {
      expect(buttonTag(byUser, label), label).toContain('h-11');
    }
  });

  it('en una liga con menores no se habla del link en ningún lado', () => {
    const c = ctx({ league: league({ hasMinors: true }) });
    state.members = { data: [member('org', 'Org', { role: 'owner' })], loading: false, error: null };
    state.access = { data: { invites: [], links: [] }, loading: false, error: null };
    const t = text(sheet({}, c));
    expect(t).toContain('Todavía no hay anotadores. Elige a alguien de la liga o búscalo por su @usuario.');
    expect(t).toContain('Todavía no hay miembros sin permisos. Búscalo por su @usuario.');
    expect(t).not.toMatch(/manda(le)? el link/);
    const u = text(sheet({ initialTab: 'usuario' }, c));
    expect(u).toContain('Escribe su nombre o su @usuario. Si todavía no tiene cuenta, pídele que se cree una y búscalo aquí.');
    expect(u).not.toContain('mándale el link');
    // Sin menores, sí.
    expect(text(sheet({ initialTab: 'usuario' }))).toContain('Si todavía no tiene cuenta, mándale el link.');
  });

  it('en una liga con menores: sin link, y el aviso de que verá a los menores', () => {
    const t = text(sheet({ initialTab: 'link' }, ctx({ league: league({ hasMinors: true }) })));
    expect(t).toContain('En una liga con menores no hay link para anotar: invita a cada anotador por su @usuario.');
    expect(t).toContain('Quien anota ve la liga completa, también a los menores.');
    expect(t).not.toContain('Crear link para anotar');
  });
});

describe('el botón «Anotadores»', () => {
  it('solo lo ve el dueño o un admin', () => {
    expect(render(h(ScorersButton, { target }), ctx({ isAdmin: false, isOwner: false }))).not.toContain('Anotadores');
    const out = render(h(ScorersButton, { target }));
    expect(out).toContain('aria-label="Anotadores"');
    expect(text(render(h(ScorersButton, { target, labeled: true })))).toContain('Anotadores');
  });
});
