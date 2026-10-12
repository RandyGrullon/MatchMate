/**
 * «Compartir en Social» en la tarjeta de un juego (perfil e inicio): sale si quien mira es miembro de la liga del juego
 * (aunque el juego sea de otro); no sale sin cuenta, si no es miembro o en una liga con menores; un juego suelto, solo
 * para su dueño. Y el juego para pegar en una publicación (sin me gusta ni «Reportar»). Sin navegador.
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileGame } from '../../lib/data/profileGames';
import type { League, Member } from '../../lib/types';
import { FeedbackProvider } from '../feedback';

const state = vi.hoisted(() => ({
  auth: { user: { uid: 'u-me' } as { uid: string } | null },
  members: [] as Member[],
  leagues: [] as League[],
}));

vi.mock('../../lib/auth', async (orig) => ({ ...(await orig<typeof import('../../lib/auth')>()), useAuth: () => state.auth }));
vi.mock('../../lib/data/members', async (orig) => ({
  ...(await orig<typeof import('../../lib/data/members')>()),
  useMyMemberships: (uid: string | undefined) => ({ data: uid ? state.members : [], loading: false, error: null }),
}));
vi.mock('../../lib/data/leagues', async (orig) => ({
  ...(await orig<typeof import('../../lib/data/leagues')>()),
  useLeaguesByIds: (ids: string[]) => ({ data: state.leagues.filter((l) => ids.includes(l.id)), loading: false, error: null }),
}));

const { GameCard, GameEmbed } = await import('./GameCard');

const render = (el: ReactElement) => renderToString(h(MemoryRouter, null, h(FeedbackProvider, null, el)));
const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

const bowling: ProfileGame = {
  key: 'b:g1',
  id: 'g1',
  kind: 'bowling',
  playerId: 'p-ana',
  userId: 'u-ana',
  userName: 'Ana Pérez',
  leagueId: 'L1',
  leagueName: 'Liga de los martes',
  sport: 'bowling',
  eventId: 'e1',
  eventName: 'Práctica',
  eventType: 'practica',
  eventDate: '2026-10-10',
  at: '2026-10-10T20:00:00Z',
  url: '/l/L1/juegos?juego=e1_p-ana',
  likes: 2,
  likedByMe: false,
  detail: { scores: [210, 180], verified: [true, true], series: 390, high: 210 },
};
const solo = (userId: string): ProfileGame => ({
  key: 'j:s1',
  id: 's1',
  kind: 'solo',
  playerId: null,
  userId,
  userName: 'Yo',
  leagueId: null,
  leagueName: null,
  sport: 'bowling',
  eventId: null,
  eventName: '',
  eventType: null,
  eventDate: '2026-10-10',
  at: '2026-10-10T20:00:00Z',
  url: userId === 'u-me' ? '/juegos-sueltos' : null,
  likes: 0,
  likedByMe: false,
  detail: { title: 'Juego suelto', venue: 'Bolera Sur', scores: [200], series: 200, high: 200 },
});
const league = (extra: Partial<League> = {}): League => ({ id: 'L1', name: 'Liga de los martes', kind: 'liga', visibility: 'public', sport: 'bowling', ...extra }) as League;
const member: Member = { id: 'L1_u-me', leagueId: 'L1', uid: 'u-me', name: 'Yo', role: 'member', playerId: 'p-me' };
const SHARE = 'aria-label="Compartir en Social"';

beforeEach(() => {
  state.auth = { user: { uid: 'u-me' } };
  state.members = [member];
  state.leagues = [league()];
});

describe('GameCard: «Compartir en Social»', () => {
  it('miembro de la liga del juego (aunque sea de otro): sale', () => {
    expect(render(h(GameCard, { game: bowling, today: '2026-10-12' }))).toContain(SHARE);
  });

  it('sin cuenta, sin ser miembro o liga con menores: no sale', () => {
    state.members = [];
    expect(render(h(GameCard, { game: bowling }))).not.toContain(SHARE);
    state.members = [member];
    state.leagues = [league({ hasMinors: true })];
    expect(render(h(GameCard, { game: bowling }))).not.toContain(SHARE);
    state.leagues = [league()];
    state.auth = { user: null };
    expect(render(h(GameCard, { game: bowling }))).not.toContain(SHARE);
  });

  it('un juego suelto: solo su dueño', () => {
    expect(render(h(GameCard, { game: solo('u-me') }))).toContain(SHARE);
    expect(render(h(GameCard, { game: solo('u-otro') }))).not.toContain(SHARE);
  });
});

describe('GameEmbed', () => {
  it('el deporte, dónde, el resultado y el link; sin me gusta ni reportar', () => {
    const html = render(h(GameEmbed, { game: bowling, today: '2026-10-12' }));
    const t = text(html);
    expect(html).toContain('href="/l/L1/juegos?juego=e1_p-ana"');
    expect(t).toContain('Liga de los martes · Práctica');
    expect(t).toContain('390');
    expect(t).toContain('Boliche');
    expect(html).not.toContain('Me gusta');
    expect(html).not.toContain('Reportar');
    // Quién lo jugó (el de otro) y sin link si no tiene ruta.
    expect(text(render(h(GameEmbed, { game: bowling, showUser: true })))).toContain('Ana Pérez Liga de los martes · Práctica');
    const noLink = render(h(GameEmbed, { game: solo('u-otro') }));
    expect(noLink).not.toContain('href=');
    expect(text(noLink)).toContain('Juego suelto · Bolera Sur');
  });
});
