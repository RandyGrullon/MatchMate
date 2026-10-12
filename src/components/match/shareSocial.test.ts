/**
 * «Publicar en Social» en la hoja para compartir el resultado (raqueta, fútbol y baloncesto): sale a los miembros de la
 * liga con el partido terminado (si no lo jugaron, va con un jugador con cuenta); no sale en una liga con menores, a
 * quien no es miembro ni con el partido sin terminar. Sin navegador (renderToString).
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Match } from '../../lib/data/matches';
import { LeagueContext, type LeagueCtx } from '../../lib/league';
import type { League, Member, Player } from '../../lib/types';
import { FeedbackProvider } from '../feedback';

const state = vi.hoisted(() => ({ players: [] as Player[] }));

vi.mock('../../lib/data/players', async (orig) => ({
  ...(await orig<typeof import('../../lib/data/players')>()),
  usePlayers: () => ({ data: state.players, loading: false, error: null }),
}));

const { ShareResultCard } = await import('./ShareResultCard');

const league = (extra: Partial<League> = {}): League =>
  ({
    id: 'L1',
    name: 'Pádel del Club',
    kind: 'liga',
    visibility: 'private',
    ownerUid: 'u1',
    venue: '',
    schedule: '',
    seasonStart: '',
    seasonEnd: '',
    contactName: '',
    contactPhone: '',
    requirePhoto: false,
    sport: 'padel',
    tz: 'America/Santo_Domingo',
    ...extra,
  }) as League;
const member: Member = { id: 'L1_u-me', leagueId: 'L1', uid: 'u-me', name: 'Yo', role: 'member', playerId: 'p-me' };
const ctx = (extra: Partial<LeagueCtx> = {}): LeagueCtx => ({
  lid: 'L1',
  league: league(),
  member,
  isAdmin: false,
  isOwner: false,
  isScorer: false,
  canScore: false,
  myPlayerId: 'p-me',
  base: '/l/L1',
  ...extra,
});

const side = (s: 1 | 2, label: string, players: string[]) => ({
  side: s,
  teamId: null,
  label,
  seed: null,
  players: players.map((playerId) => ({ playerId, side: s, position: null, jersey: null, sub: false })),
});
const match = (extra: Partial<Match> = {}): Match =>
  ({
    id: 'm1',
    leagueId: 'L1',
    eventId: null,
    round: 3,
    stage: '',
    court: '',
    status: 'confirmed',
    winner: 1,
    walkoverSide: null,
    score: { text: '6-4 6-3', sides: [2, 0] },
    sides: [side(1, 'Yo / Eva', ['p-me', 'p-eva']), side(2, 'Luis / Juan', ['p-luis', 'p-juan'])],
    ...extra,
  }) as Match;

const render = (c: LeagueCtx, m: Match, mySide: 1 | 2 | null) =>
  renderToString(h(FeedbackProvider, null, h(LeagueContext.Provider, { value: c }, h(ShareResultCard, { match: m, title: 'Pádel del Club', mySide }))));

beforeEach(() => {
  state.players = [
    { id: 'p-luis', name: 'Luis', averageOverride: null, uid: 'u-luis' },
    { id: 'p-eva', name: 'Eva', averageOverride: null, uid: null },
  ];
});

describe('ShareResultCard: «Publicar en Social»', () => {
  it('un miembro que lo jugó: sale debajo de compartir', () => {
    const html = render(ctx(), match(), 1);
    expect(html).toContain('Publicar en Social');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html.indexOf('WhatsApp')).toBeLessThan(html.indexOf('Publicar en Social'));
  });

  it('un miembro que no lo jugó: sale si alguno tiene cuenta; si nadie, no', () => {
    expect(render(ctx({ myPlayerId: null }), match(), null)).toContain('Publicar en Social');
    state.players = [];
    expect(render(ctx({ myPlayerId: null }), match(), null)).not.toContain('Publicar en Social');
  });

  it('liga con menores, quien no es miembro y el partido sin terminar: no sale', () => {
    expect(render(ctx({ league: league({ hasMinors: true }) }), match(), 1)).not.toContain('Publicar en Social');
    expect(render(ctx({ member: null, myPlayerId: null }), match(), null)).not.toContain('Publicar en Social');
    expect(render(ctx(), match({ status: 'live', winner: null }), 1)).not.toContain('Publicar en Social');
    expect(render(ctx(), match({ status: 'scheduled', winner: null, score: null }), 1)).not.toContain('Publicar en Social');
    // Lo de siempre sigue.
    expect(render(ctx({ league: league({ hasMinors: true }) }), match(), 1)).toContain('WhatsApp');
  });
});
