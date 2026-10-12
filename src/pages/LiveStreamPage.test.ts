/**
 * La página En vivo de la liga (`/l/:lid/vivo`, el link que se comparte) dibujada sin navegador (renderToString): el video
 * dentro de la app o el botón para abrirlo afuera, la transmisión elegida con `?s=`, las otras, «Terminar transmisión»
 * para quien puede, «Transmitir en vivo» para quien transmite y lo que sale sin nada en vivo. Las transmisiones son de
 * mentira (vi.mock de src/lib/data/streams).
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveStream } from '../lib/data/streams';
import { LeagueContext, type LeagueCtx } from '../lib/league';
import type { League, Member } from '../lib/types';
import { FeedbackProvider } from '../components/feedback';

const state = vi.hoisted(() => ({
  streams: [] as LiveStream[],
  loading: false,
}));

vi.mock('../lib/data/streams', async (orig) => ({
  ...(await orig<typeof import('../lib/data/streams')>()),
  useLeagueStreams: () => ({ data: state.streams, loading: state.loading, error: null }),
}));
vi.mock('../lib/useMode', async (orig) => ({
  ...(await orig<typeof import('../lib/useMode')>()),
  useIsPro: () => false,
  useMode: () => ({ mode: 'lite', isPro: false, setMode: async () => 'local', suggestedPro: false }),
}));

const { default: LiveStreamPage } = await import('./LiveStreamPage');

const league = (extra: Partial<League> = {}): League => ({
  id: 'L1',
  name: 'Liga del Este',
  visibility: 'public',
  ownerUid: 'u-dueno',
  venue: '',
  schedule: '',
  seasonStart: '',
  seasonEnd: '',
  contactName: '',
  contactPhone: '',
  requirePhoto: false,
  sport: 'football',
  liveEnabled: true,
  ...extra,
});
const member = (extra: Partial<Member> = {}): Member => ({ id: 'mm', leagueId: 'L1', uid: 'u-me', name: 'Yo', role: 'member', playerId: null, ...extra });
const ctx = (extra: Partial<LeagueCtx> = {}): LeagueCtx => {
  const l = extra.league ?? league();
  return { lid: l.id, league: l, member: null, isAdmin: false, isOwner: false, isScorer: false, canScore: false, myPlayerId: null, base: `/l/${l.id}`, ...extra };
};

const stream = (p: Partial<LiveStream> = {}): LiveStream => ({
  id: 's1',
  leagueId: 'L1',
  leagueName: 'Liga del Este',
  sport: 'football',
  matchId: 'm1',
  eventId: null,
  url: 'https://youtu.be/dQw4w9WgXcQ',
  platform: 'youtube',
  title: null,
  label: 'Tigres vs Leones',
  startedAt: new Date(Date.now() - 12 * 60_000).toISOString(),
  startedBy: { id: 'u-ana', name: 'Ana Pérez' },
  canEnd: false,
  ...p,
});

const render = (c: LeagueCtx = ctx(), url = '/l/L1/vivo') =>
  renderToString(h(MemoryRouter, { initialEntries: [url] }, h(FeedbackProvider, null, h(LeagueContext.Provider, { value: c }, h(LiveStreamPage)))));
const text = (html: string) =>
  html
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

beforeAll(() => {
  vi.stubGlobal('location', { hostname: 'app.test', origin: 'https://app.test' });
});
afterAll(() => {
  vi.unstubAllGlobals();
});
beforeEach(() => {
  state.streams = [];
  state.loading = false;
});

describe('la transmisión', () => {
  it('YouTube se ve dentro de la app (16:9), con el título, cuándo empezó, quién, «Abrir en YouTube» y «Compartir»', () => {
    state.streams = [stream()];
    const html = render();
    const t = text(html);
    expect(html).toContain('<iframe');
    expect(html).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&amp;playsinline=1"');
    expect(html).toContain('allow="autoplay; encrypted-media; picture-in-picture; fullscreen"');
    expect(html).toContain('allowFullScreen=""');
    expect(html).toContain('referrerPolicy="strict-origin-when-cross-origin"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('aspect-video');
    expect(t).toContain('En vivo');
    expect(t).toContain('Liga del Este');
    expect(t).toContain('EN VIVO');
    expect(t).toContain('Tigres vs Leones');
    expect(t).toContain('Empezó hace 12 min');
    expect(t).toContain('Ana Pérez');
    expect(t).toContain('Abrir en YouTube');
    expect(t).toContain('Compartir');
    // Solo quien puede la termina.
    expect(t).not.toContain('Terminar transmisión');
    expect(t).not.toContain('Ver en YouTube');
  });

  it('Twitch se ve dentro con el dominio de la app', () => {
    state.streams = [stream({ platform: 'twitch', url: 'https://www.twitch.tv/Liga_Este' })];
    expect(render()).toContain('src="https://player.twitch.tv/?channel=liga_este&amp;parent=app.test&amp;autoplay=true"');
  });

  it('Instagram y TikTok no se dejan ver adentro: un botón grande «Ver en Instagram» que abre afuera', () => {
    state.streams = [stream({ platform: 'instagram', url: 'https://www.instagram.com/liga/live/' })];
    const html = render();
    expect(html).not.toContain('<iframe');
    expect(text(html)).toContain('Ver en Instagram');
    expect(html).toMatch(/<a href="https:\/\/www\.instagram\.com\/liga\/live\/" target="_blank" rel="noopener noreferrer"/);
    expect(text(html)).not.toContain('Abrir en Instagram');
  });

  it('`?s=` elige la transmisión; las demás salen en «También en vivo»', () => {
    state.streams = [stream(), stream({ id: 's2', matchId: 'm2', label: 'Águilas vs Toros', title: 'Semifinal', platform: 'kick', url: 'https://kick.com/canal' })];
    const html = render(ctx(), '/l/L1/vivo?s=s2');
    const t = text(html);
    expect(html).toContain('src="https://player.kick.com/canal"');
    expect(t).toContain('Semifinal');
    expect(t).toContain('También en vivo');
    expect(html).toContain('href="/l/L1/vivo?s=s1"');
    // Un link viejo (ya terminó): la primera.
    expect(render(ctx(), '/l/L1/vivo?s=viejo')).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ');
  });

  it('quien puede terminarla ve «Terminar transmisión»', () => {
    state.streams = [stream({ canEnd: true })];
    expect(text(render(ctx({ member: member({ scorer: true }) })))).toContain('Terminar transmisión');
  });

  it('sin cuenta en una liga pública se ve igual, sin nada para transmitir', () => {
    state.streams = [stream()];
    const t = text(render(ctx({ member: null })));
    expect(t).toContain('Tigres vs Leones');
    expect(t).not.toContain('Transmitir en vivo');
  });

  it('quien transmite (admin o anotador, con la liga activada) tiene «Transmitir en vivo» debajo', () => {
    state.streams = [stream()];
    expect(text(render(ctx({ isAdmin: true })))).toContain('Transmitir en vivo');
    expect(text(render(ctx({ member: member({ scorer: true }) })))).toContain('Transmitir en vivo');
    expect(text(render(ctx({ member: member() })))).not.toContain('Transmitir en vivo');
    // En el boliche, solo los admins.
    expect(text(render(ctx({ league: league({ sport: 'bowling' }), member: member({ scorer: true }) })))).not.toContain('Transmitir en vivo');
  });
});

describe('sin nada en vivo', () => {
  it('«No hay nada en vivo ahora», y para quien transmite, el botón', () => {
    const t = text(render(ctx({ isAdmin: true })));
    expect(t).toContain('No hay nada en vivo ahora');
    expect(t).toContain('Cuando la liga transmita un partido, se ve aquí.');
    expect(t).toContain('Transmitir en vivo');
    const viewer = text(render(ctx({ member: member() })));
    expect(viewer).toContain('No hay nada en vivo ahora');
    expect(viewer).not.toContain('Transmitir en vivo');
  });

  it('la liga sin transmisiones activadas: al admin, dónde activarlas; a los demás, solo que no las tiene', () => {
    const off = league({ liveEnabled: false });
    const html = render(ctx({ league: off, isAdmin: true }));
    expect(text(html)).toContain('Esta liga no tiene activadas las transmisiones en vivo.');
    expect(text(html)).toContain('Actívalas en Ajustes de la liga');
    expect(html).toContain('href="/l/L1/admin?tab=liga"');
    expect(text(html)).not.toContain('Transmitir en vivo');
    const member0 = text(render(ctx({ league: off, member: member({ scorer: true }) })));
    expect(member0).toContain('no tiene activadas');
    expect(member0).not.toContain('Actívalas');
  });

  it('mientras carga, el lugar del video', () => {
    state.loading = true;
    const html = render();
    expect(html).toContain('aspect-video');
    expect(text(html)).not.toContain('No hay nada en vivo ahora');
  });
});
