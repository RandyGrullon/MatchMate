/**
 * Transmisiones en vivo (docs/equipos-y-en-vivo.md §2) dibujadas sin navegador (renderToString): quién puede transmitir,
 * la franja «EN VIVO» del inicio de la liga, la hoja «Transmitir en vivo» (lo que dice del link), la tarjeta de los
 * ajustes de la liga, «En vivo ahora» de Hoy, «Transmitir en vivo» del «•••» y la píldora «Ver en vivo» de un partido.
 * Las transmisiones son de mentira (vi.mock de src/lib/data/streams).
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveStream } from '../../lib/data/streams';
import type { Match, MatchSide } from '../../lib/data/matches';
import type { SeasonTeam } from '../../lib/data/seasonTeams';
import { LeagueContext, type LeagueCtx } from '../../lib/league';
import type { League, Member } from '../../lib/types';
import type { TeamLeague } from '../../pages/sports/team/useTeamLeague';
import { FeedbackProvider } from '../feedback';

const state = vi.hoisted(() => ({
  streams: [] as LiveStream[],
  now: [] as LiveStream[],
}));

vi.mock('../../lib/data/streams', async (orig) => ({
  ...(await orig<typeof import('../../lib/data/streams')>()),
  useLeagueStreams: () => ({ data: state.streams, loading: false, error: null }),
  useLiveNow: () => ({ data: state.now, loading: false, error: null }),
}));
vi.mock('../../lib/useMode', async (orig) => ({
  ...(await orig<typeof import('../../lib/useMode')>()),
  useIsPro: () => false,
  useMode: () => ({ mode: 'lite', isPro: false, setMode: async () => 'local', suggestedPro: false }),
}));

const { LiveBanner } = await import('./LiveBanner');
const { LiveSettingsCard } = await import('./LiveSettingsCard');
const { LiveStreamsCard, LiveNowStreams } = await import('./LiveNowStreams');
const { StartStreamForm, StartStreamSheet, linkHint } = await import('./StartStreamSheet');
const { LiveWatchPill, canStartStream, isStreamOfficial, streamLine, streamTitle } = await import('./LiveParts');
const { useStartLive } = await import('./useStartLive');
const { MatchDetail: BasketballMatchDetail } = await import('../../pages/sports/basketball/MatchDetail');

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
  sport: 'basketball',
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
  sport: 'basketball',
  matchId: 'm1',
  eventId: null,
  url: 'https://youtu.be/dQw4w9WgXcQ',
  platform: 'youtube',
  title: null,
  label: 'Tigres vs Leones',
  startedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  startedBy: { id: 'u-ana', name: 'Ana' },
  canEnd: false,
  ...p,
});

const render = (el: ReactElement, c: LeagueCtx = ctx()) =>
  renderToString(h(MemoryRouter, null, h(FeedbackProvider, null, h(LeagueContext.Provider, { value: c }, el))));
/** Sin los avisos (FeedbackProvider dibuja su capa): para ver que algo no dibuja nada. */
const bare = (el: ReactElement, c: LeagueCtx = ctx()) => renderToString(h(MemoryRouter, null, h(LeagueContext.Provider, { value: c }, el)));
const text = (html: string) =>
  html
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

beforeEach(() => {
  state.streams = [];
  state.now = [];
});

describe('quién transmite', () => {
  it('los admins y los anotadores; en el boliche, solo los admins; y con la liga en vivo activada', () => {
    expect(isStreamOfficial(ctx({ isAdmin: true }))).toBe(true);
    expect(isStreamOfficial(ctx({ member: member({ scorer: true }) }))).toBe(true);
    expect(isStreamOfficial(ctx({ member: member() }))).toBe(false);
    expect(isStreamOfficial(ctx({ member: null }))).toBe(false);
    const bowling = league({ sport: 'bowling' });
    expect(isStreamOfficial(ctx({ league: bowling, member: member({ scorer: true }) }))).toBe(false);
    expect(isStreamOfficial(ctx({ league: bowling, isAdmin: true }))).toBe(true);
    expect(canStartStream(ctx({ isAdmin: true }))).toBe(true);
    expect(canStartStream(ctx({ isAdmin: true, league: league({ liveEnabled: false }) }))).toBe(false);
  });

  it('el título: el suyo, si no el partido, si no «Transmisión de la liga»; la línea con el partido y la plataforma', () => {
    expect(streamTitle(stream())).toBe('Tigres vs Leones');
    expect(streamTitle(stream({ title: 'Final del torneo' }))).toBe('Final del torneo');
    expect(streamTitle(stream({ title: null, label: null }))).toBe('Transmisión de la liga');
    expect(streamLine(stream({ title: 'Final del torneo' }))).toBe('Tigres vs Leones · YouTube');
    expect(streamLine(stream(), 'Liga del Este')).toBe('Liga del Este · YouTube');
    // El mismo partido escrito con punto no se repite.
    expect(streamLine(stream({ title: 'Tigres vs. Leones' }))).toBe('YouTube');
  });
});

describe('la franja «EN VIVO» del inicio de la liga', () => {
  it('sin transmisiones no sale nada (tampoco a quien puede transmitir)', () => {
    expect(bare(h(LiveBanner, { lid: 'L1' }), ctx({ isAdmin: true }))).toBe('');
  });

  it('una tarjeta por transmisión, con «EN VIVO», el título, la plataforma y «Ver» a la página En vivo', () => {
    state.streams = [stream(), stream({ id: 's2', matchId: 'm2', label: 'Águilas vs Toros', title: 'Semifinal', platform: 'twitch', url: 'https://twitch.tv/liga_este' })];
    const html = render(h(LiveBanner, { lid: 'L1' }));
    const t = text(html);
    expect(t.match(/EN VIVO/g)).toHaveLength(2);
    expect(t).toContain('Tigres vs Leones');
    expect(t).toContain('Semifinal');
    expect(t).toContain('Águilas vs Toros · Twitch');
    expect(html).toContain('href="/l/L1/vivo?s=s1"');
    expect(html).toContain('href="/l/L1/vivo?s=s2"');
    expect(html).toContain('aria-label="En vivo: Tigres vs Leones, en YouTube. Ver"');
  });
});

describe('«Transmitir en vivo»: el link', () => {
  const form = (url: string, checked = false, error: string | null = null) =>
    text(
      renderToString(
        h(StartStreamForm, { url, title: '', defaultTitle: 'Tigres vs. Leones', checked, error, canPaste: true, onUrl: () => {}, onTitle: () => {}, onPaste: () => {} }),
      ),
    );

  it('reconoce la plataforma al momento y dice si se ve dentro de la app o se abre afuera', () => {
    expect(form('https://youtu.be/dQw4w9WgXcQ')).toContain('YouTube · Se ve dentro de MatchMate');
    expect(form('https://www.twitch.tv/liga_este')).toContain('Twitch · Se ve dentro de MatchMate');
    expect(form('https://www.instagram.com/liga/live/')).toContain('Instagram · Se abre en Instagram');
    expect(form('https://vm.tiktok.com/ZM123/')).toContain('TikTok · Se abre en TikTok');
    expect(linkHint('https://kick.com/canal', false)).toMatchObject({ tone: 'ok', platform: 'kick' });
  });

  it('un link que no sirve lo dice; vacío, solo cuando ya tocó «Empezar»', () => {
    expect(form('https://evil.com/video')).toContain('Usa un link de YouTube, Twitch, Facebook, Kick, Instagram o TikTok.');
    expect(form('http://youtube.com/watch?v=dQw4w9WgXcQ')).toContain('Usa un link de YouTube');
    expect(form('')).toContain('De YouTube, Twitch, Facebook, Kick, Instagram o TikTok.');
    expect(form('')).not.toContain('Pega el link');
    expect(form('', true)).toContain('Pega el link de la transmisión.');
    expect(form('https://youtu.be/dQw4w9WgXcQ', true, 'La liga ya tiene 5 transmisiones en vivo. Termina una primero.')).toContain('La liga ya tiene 5 transmisiones');
  });

  it('«Pegar» donde el navegador deja leer lo copiado, y el título de ejemplo del partido', () => {
    const html = renderToString(
      h(StartStreamForm, { url: '', title: '', defaultTitle: 'Tigres vs. Leones', checked: false, error: null, canPaste: true, onUrl: () => {}, onTitle: () => {}, onPaste: () => {} }),
    );
    expect(text(html)).toContain('Pegar');
    expect(html).toContain('placeholder="Tigres vs. Leones"');
    expect(html).toContain('maxLength="80"');
    const noPaste = renderToString(
      h(StartStreamForm, { url: '', title: '', checked: false, error: null, canPaste: false, onUrl: () => {}, onTitle: () => {}, onPaste: () => {} }),
    );
    expect(text(noPaste)).not.toContain('Pegar');
  });

  it('la hoja abierta: el título del partido ya puesto, «Empezar» y «Cancelar»; cerrada no dibuja nada', () => {
    const html = render(h(StartStreamSheet, { lid: 'L1', matchId: 'm1', defaultTitle: 'Tigres vs. Leones', open: true, onClose: () => {} }), ctx({ isAdmin: true }));
    const t = text(html);
    expect(t).toContain('Transmitir en vivo');
    expect(t).toContain('Empezar');
    expect(t).toContain('Cancelar');
    expect(html).toContain('value="Tigres vs. Leones"');
    expect(bare(h(StartStreamSheet, { lid: 'L1', open: false, onClose: () => {} }))).toBe('');
  });
});

describe('ajustes de la liga', () => {
  it('apagada: el interruptor sin marcar y lo que hace en una línea', () => {
    const html = render(h(LiveSettingsCard, { lid: 'L1' }), ctx({ isAdmin: true, league: league({ liveEnabled: false }) }));
    const t = text(html);
    expect(t).toContain('Transmisiones en vivo');
    expect(t).toContain(
      'Los admins y anotadores podrán poner el link de YouTube, Twitch, Facebook, Kick, Instagram o TikTok de un partido; sale arriba en la liga y avisa a los miembros y seguidores.',
    );
    expect(html).toMatch(/role="switch" aria-checked="false"/);
    expect(t).not.toContain('Ir a En vivo');
  });

  it('prendida: marcado y con el camino a En vivo; en el boliche transmiten solo los admins', () => {
    const html = render(h(LiveSettingsCard, { lid: 'L1' }), ctx({ isAdmin: true }));
    expect(html).toMatch(/role="switch" aria-checked="true"/);
    expect(html).toContain('href="/l/L1/vivo"');
    const bowling = text(render(h(LiveSettingsCard, { lid: 'L1' }), ctx({ isAdmin: true, league: league({ sport: 'bowling', kind: 'torneo' }) })));
    expect(bowling).toContain('Los admins podrán poner el link');
    expect(bowling).toContain('sale arriba en el torneo');
  });

  it('quien no es admin lo ve sin poder cambiarlo', () => {
    expect(render(h(LiveSettingsCard, { lid: 'L1' }), ctx({ member: member({ scorer: true }) }))).toMatch(/role="switch" aria-checked="true"[^>]*disabled=""/);
  });
});

describe('«En vivo ahora» en Hoy', () => {
  it('sin transmisiones no sale', () => {
    expect(renderToString(h(MemoryRouter, null, h(LiveNowStreams)))).toBe('');
  });

  it('una fila por transmisión con la liga y la plataforma, a la página En vivo de su liga', () => {
    state.now = [stream(), stream({ id: 's9', leagueId: 'L2', leagueName: 'Pádel del Club', sport: 'padel', matchId: null, label: null, title: 'Final', platform: 'instagram', url: 'https://instagram.com/club/live' })];
    const html = renderToString(h(MemoryRouter, null, h(LiveNowStreams)));
    const t = text(html);
    expect(t).toContain('En vivo ahora');
    expect(t).toContain('2 transmisiones');
    expect(t).toContain('Tigres vs Leones');
    expect(t).toContain('Liga del Este · YouTube');
    expect(t).toContain('Pádel del Club · Instagram');
    expect(html).toContain('href="/l/L1/vivo?s=s1"');
    expect(html).toContain('href="/l/L2/vivo?s=s9"');
  });

  it('más de 4: las demás se cuentan abajo', () => {
    const many = Array.from({ length: 6 }, (_, i) => stream({ id: `s${i}`, matchId: `m${i}` }));
    expect(text(renderToString(h(MemoryRouter, null, h(LiveStreamsCard, { streams: many }))))).toContain('Y 2 transmisiones más en vivo.');
  });
});

describe('partidos y eventos', () => {
  function Entry({ matchId, eventId }: { matchId?: string; eventId?: string }) {
    const live = useStartLive({ matchId, eventId, title: 'Tigres vs. Leones' });
    return h('div', null, live.item ? live.item.label : 'sin opción', live.stream ? ` · en vivo ${live.stream.id}` : '');
  }

  it('«Transmitir en vivo» en «•••»: admins y anotadores, con la liga activada y sin transmisión de ese partido', () => {
    expect(text(render(h(Entry, { matchId: 'm1' }), ctx({ isAdmin: true })))).toBe('Transmitir en vivo');
    expect(text(render(h(Entry, { matchId: 'm1' }), ctx({ member: member({ scorer: true }) })))).toBe('Transmitir en vivo');
    expect(text(render(h(Entry, { matchId: 'm1' }), ctx({ member: member() })))).toBe('sin opción');
    expect(text(render(h(Entry, { matchId: 'm1' }), ctx({ isAdmin: true, league: league({ liveEnabled: false }) })))).toBe('sin opción');
    state.streams = [stream()];
    expect(text(render(h(Entry, { matchId: 'm1' }), ctx({ isAdmin: true })))).toBe('sin opción · en vivo s1');
    // Otro partido de la misma liga sí puede.
    expect(text(render(h(Entry, { matchId: 'm2' }), ctx({ isAdmin: true })))).toBe('Transmitir en vivo');
    // Un evento (boliche, golf, natación) por su id.
    state.streams = [stream({ id: 's5', matchId: null, eventId: 'e1' })];
    expect(text(render(h(Entry, { eventId: 'e1' }), ctx({ isAdmin: true })))).toBe('sin opción · en vivo s5');
  });

  it('la píldora «Ver en vivo» sale solo si ese partido o evento está en vivo', () => {
    expect(bare(h(LiveWatchPill, { lid: 'L1', matchId: 'm1' }))).toBe('');
    state.streams = [stream(), stream({ id: 's5', matchId: null, eventId: 'e1' })];
    const html = render(h(LiveWatchPill, { lid: 'L1', matchId: 'm1' }));
    expect(text(html)).toBe('Ver en vivo');
    expect(html).toContain('href="/l/L1/vivo?s=s1"');
    expect(render(h(LiveWatchPill, { lid: 'L1', eventId: 'e1' }))).toContain('href="/l/L1/vivo?s=s5"');
    expect(bare(h(LiveWatchPill, { lid: 'L1', matchId: 'm9' }))).toBe('');
  });

  it('en la pantalla de un partido (básquet): «Ver en vivo» cuando se transmite', () => {
    const sides: [MatchSide, MatchSide] = [
      { side: 1, teamId: 'T1', label: 'Tigres', seed: null, players: [] },
      { side: 2, teamId: 'T2', label: 'Leones', seed: null, players: [] },
    ];
    const m = {
      id: 'm1',
      leagueId: 'L1',
      eventId: null,
      round: 3,
      stage: '',
      bracketKey: null,
      court: 'Cancha 1',
      scheduledAt: '2026-10-10T23:00:00.000Z',
      status: 'confirmed',
      format: 'fiba',
      requireConfirm: true,
      score: { text: '72-65', sides: [72, 65] },
      winner: 1,
      walkoverSide: null,
      scorerId: null,
      leaseUntil: null,
      seq: 0,
      version: 0,
      proposedBy: null,
      proposedAt: null,
      proposedSide: null,
      confirmedBy: null,
      confirmedAt: null,
      disputedBy: null,
      disputedAt: null,
      disputeNote: null,
      note: null,
      createdBy: null,
      sides,
      createdAt: null,
      updatedAt: null,
    } as Match;
    const team = (id: string, name: string, order: number): SeasonTeam => ({ id, leagueId: 'L1', name, color: '#f97316', order, roster: [], createdAt: null, updatedAt: null });
    const teams = [team('T1', 'Tigres', 1), team('T2', 'Leones', 2)];
    const ok = <T,>(data: T) => ({ data, loading: false, error: null });
    const tl = {
      lid: 'L1',
      base: '/l/L1',
      league: league(),
      tz: 'America/Santo_Domingo',
      isAdmin: false,
      member: null,
      userId: 'u-me',
      myPlayerId: null,
      matches: ok([m]),
      rules: ok(null),
      allTeams: ok(teams),
      members: ok([]),
      players: ok([]),
      teamOf: (id: string | null | undefined) => teams.find((t) => t.id === id) ?? null,
      speakerOf: () => null,
      officialOf: () => null,
    } as unknown as TeamLeague;
    const screen = () => text(render(h(BasketballMatchDetail, { tl, matchId: 'm1', table: false, onTable: () => {}, onBack: () => {} })));
    expect(screen()).toContain('Tigres');
    expect(screen()).not.toContain('Ver en vivo');
    state.streams = [stream()];
    expect(screen()).toContain('Ver en vivo');
  });
});
