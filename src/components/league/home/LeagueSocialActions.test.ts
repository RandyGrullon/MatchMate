/**
 * Lo social arriba del inicio de una liga (la barra «‹ Ligas» de LeagueShell, igual en todos los deportes), dibujado sin
 * navegador: «Muro» en las ligas sin menores y «Seguir» solo para quien no es miembro y la puede seguir (o ya la sigue).
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LeagueSocial } from '../../../lib/data/leagueSocial';
import { LeagueContext, type LeagueCtx } from '../../../lib/league';
import type { League, Member } from '../../../lib/types';

const state = vi.hoisted(() => ({ social: null as LeagueSocial | null, asked: [] as (string | null | undefined)[] }));

vi.mock('../../../lib/data/leagueSocial', async (orig) => ({
  ...(await orig<typeof import('../../../lib/data/leagueSocial')>()),
  useLeagueSocial: (lid: string | null | undefined) => {
    state.asked.push(lid);
    return { data: lid ? state.social : null, loading: false, error: null };
  },
}));
vi.mock('../../feedback', () => ({
  useFeedback: () => ({ toast: () => undefined, confirm: () => Promise.resolve(false) }),
  saveErrorMessage: () => 'error',
}));

const { LeagueHomeActions, hasWall, showLeagueFollow } = await import('./LeagueSocialActions');
const { InvitePill, LeagueTopBar } = await import('./LeagueTopBar');

const league = (extra: Partial<League> = {}) =>
  ({ id: 'l1', name: 'Liga de los martes', kind: 'liga', visibility: 'public', sport: 'padel', venue: '', ...extra }) as League;

const member = { id: 'l1_u1', leagueId: 'l1', uid: 'u1', name: 'Ana', role: 'member', playerId: null } as Member;

const ctx = (extra: Partial<LeagueCtx> = {}): LeagueCtx => ({
  lid: 'l1',
  league: league(),
  member,
  isAdmin: false,
  isOwner: false,
  isScorer: false,
  canScore: false,
  myPlayerId: null,
  base: '/l/l1',
  ...extra,
});

const social = (extra: Partial<LeagueSocial> = {}): LeagueSocial => ({ following: false, followers: 12, isMember: false, canPost: false, canFollow: true, ...extra });

/** La barra del inicio, como la arma LeagueShell (homeBar). */
const bar = (value: LeagueCtx, invite?: ReactElement) =>
  renderToString(h(MemoryRouter, null, h(LeagueContext.Provider, { value }, h(LeagueTopBar, { to: '/ligas', label: 'Ligas', actions: h(LeagueHomeActions, { invite }) }))));
const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const WALL = /<a [^>]*href="\/l\/l1\/muro"[^>]*>.*?Muro<\/a>/;
const FOLLOW = /aria-label="Seguir Liga de los martes"/;

beforeEach(() => {
  state.social = social();
  state.asked = [];
});

describe('«Muro» arriba del inicio de la liga', () => {
  it('liga sin menores: «Muro» lleva a su muro (miembros y quien mira)', () => {
    expect(bar(ctx())).toMatch(WALL);
    expect(bar(ctx({ member: null }))).toMatch(WALL);
    expect(bar(ctx({ league: league({ visibility: 'private' }) }))).toMatch(WALL);
  });

  it('liga con menores: ni muro ni seguir (lo social está apagado)', () => {
    const out = bar(ctx({ member: null, league: league({ hasMinors: true }) }));
    expect(out).not.toMatch(WALL);
    expect(out).not.toMatch(FOLLOW);
    expect(hasWall({ hasMinors: true })).toBe(false);
    expect(hasWall({})).toBe(true);
  });

  it('va junto a «Invitar»', () => {
    const out = bar(ctx(), h(InvitePill, { onClick: () => undefined }));
    expect(out).toMatch(WALL);
    expect(text(out)).toContain('Muro Invitar');
  });
});

describe('«Seguir» la liga', () => {
  it('quien no es miembro de una liga pública que puede seguir: «Seguir», con cuántos la siguen', () => {
    const out = bar(ctx({ member: null }));
    expect(out).toMatch(FOLLOW);
    expect(text(out)).toContain('12 seguidores');
    expect(state.asked).toContain('l1');
  });

  it('ya la sigue: «Siguiendo» (para poder dejarla)', () => {
    state.social = social({ following: true, canFollow: false });
    const out = bar(ctx({ member: null }));
    expect(out).toContain('aria-label="Dejar de seguir Liga de los martes"');
    expect(text(out)).toContain('Siguiendo');
  });

  it('los miembros no lo ven (ni se pregunta a la base)', () => {
    const out = bar(ctx());
    expect(out).not.toMatch(FOLLOW);
    expect(state.asked.every((l) => l == null)).toBe(true);
  });

  it('sin sesión (la base no responde) o sin poder seguirla: no sale', () => {
    state.social = null;
    expect(bar(ctx({ member: null }))).not.toMatch(FOLLOW);
    state.social = social({ canFollow: false });
    expect(bar(ctx({ member: null }))).not.toMatch(FOLLOW);
  });

  it('una liga privada: no se pregunta', () => {
    bar(ctx({ member: null, league: league({ visibility: 'private' }) }));
    expect(state.asked.every((l) => l == null)).toBe(true);
  });

  it('las reglas', () => {
    expect(showLeagueFollow(social(), false)).toBe(true);
    expect(showLeagueFollow(social(), true)).toBe(false);
    expect(showLeagueFollow(social({ isMember: true }), false)).toBe(false);
    expect(showLeagueFollow(social({ canFollow: false, following: true }), false)).toBe(true);
    expect(showLeagueFollow(social({ canFollow: false }), false)).toBe(false);
    expect(showLeagueFollow(null, false)).toBe(false);
  });
});
