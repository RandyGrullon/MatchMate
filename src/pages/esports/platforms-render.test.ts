/**
 * Plataformas de esports dibujadas sin navegador (renderToString) con datos de mentira (docs/perfiles-equipos-esports.md
 * §4): la página del juego y «Mis torneos» con la plataforma de cada torneo, el campo «Plataforma» de «Crear torneo» por
 * juego, Mi ID de juego con «¿Dónde juegas?» (lista, hoja, NBA 2K por plataforma, `?plataforma=` y `?volver=`) y
 * «Conectar otra cuenta» (con la nota de Steam).
 */
import { createElement as h, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Live } from '../../lib/data/client';
import type { HubData, MyEntry } from '../../lib/data/esports';
import type { GameIdRecord, ProvidersStatus } from '../../lib/data/esportsIds';
import { FeedbackProvider } from '../../components/feedback';

const NOW = Date.now();
const H = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();
const ok = <T,>(data: T): Live<T> => ({ data, loading: false, error: null });

const state = vi.hoisted(() => ({
  auth: { user: { uid: 'u1' } as { uid: string } | null, loading: false },
  pro: false,
  hub: { data: { tournaments: [], teams: [] }, loading: false, error: null } as Live<HubData>,
  myEntries: { data: [], loading: false, error: null } as Live<MyEntry[]>,
  ids: { data: [], loading: false, error: null } as Live<GameIdRecord[]>,
  providers: { data: { lookup: [], link: { steam: true, epic: true, riot: false } }, loading: false, error: null } as Live<ProvidersStatus>,
}));

vi.mock('../../lib/auth', async (orig) => ({ ...(await orig<typeof import('../../lib/auth')>()), useAuth: () => ({ ...state.auth, profile: null, isSuper: false, recovering: false }) }));
vi.mock('../../components/Shell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));
vi.mock('../../lib/useMode', () => ({
  useIsPro: () => state.pro,
  useMode: () => ({ mode: state.pro ? 'pro' : 'lite', isPro: state.pro, setMode: async () => 'saved', suggestedPro: false }),
}));
vi.mock('../../lib/data/esports', async (orig) => ({
  ...(await orig<typeof import('../../lib/data/esports')>()),
  useEsportsHub: () => state.hub,
  useMyEsportsTeams: () => ok([]),
  useMyEsportsEntries: (uid: string | null) => (uid ? state.myEntries : ok([])),
}));
vi.mock('../../lib/data/esportsIds', async (orig) => ({
  ...(await orig<typeof import('../../lib/data/esportsIds')>()),
  useMyGameIds: (uid: string | null) => (uid ? state.ids : ok([])),
  useGameIdsFor: () => ok([]),
  useMyIdMoves: () => ok([]),
  useProviders: () => state.providers,
}));

const { default: EsportsHomePage } = await import('./EsportsHomePage');
const { default: GameHubPage } = await import('./GameHubPage');
const { default: GameIdsPage } = await import('./GameIdsPage');
const { GameIdSheet } = await import('./ids/GameIdSheet');
const { FormatFields } = await import('./create/steps');
const { emptyForm } = await import('./create/logic');

const page = (url: string) =>
  renderToString(
    h(
      MemoryRouter,
      { initialEntries: [url] },
      h(
        FeedbackProvider,
        null,
        h(
          Routes,
          null,
          h(Route, { path: '/esports', element: h(EsportsHomePage) }),
          h(Route, { path: '/esports/mi-id', element: h(GameIdsPage) }),
          h(Route, { path: '/esports/:game', element: h(GameHubPage) }),
        ),
      ),
    ),
  );
const bare = (node: ReactNode) => renderToString(h(MemoryRouter, null, h(FeedbackProvider, null, node)));
const text = (html: string) =>
  html
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

const rec = (over: Partial<GameIdRecord> = {}): GameIdRecord => ({
  userId: 'u1',
  game: 'rocket_league',
  platform: '',
  platforms: [],
  region: '',
  idDisplay: 'AnaRL',
  status: 'pendiente',
  ownership: 'declarado',
  ranks: {},
  rankSource: 'declarado',
  verifiedAt: null,
  confirmedAt: null,
  updatedAt: null,
  ...over,
});
const login = (over: Partial<GameIdRecord> = {}) => rec({ status: 'confirmado', ownership: 'login', confirmedAt: iso(NOW), ...over });
const PROVIDERS: ProvidersStatus = { lookup: ['valorant', 'lol'], link: { steam: true, epic: true, riot: true } };
const BACK = '/l/L1/e/E1';

beforeEach(() => {
  state.auth = { user: { uid: 'u1' }, loading: false };
  state.pro = false;
  state.hub = ok({ tournaments: [], teams: [] });
  state.myEntries = ok([]);
  state.ids = ok([]);
  state.providers = ok(PROVIDERS);
});

describe('la plataforma de cada torneo en las listas', () => {
  it('la página del juego: «PlayStation · 3 contra 3 · …» en la fila', () => {
    const tour = (eventId: string, platform: HubData['tournaments'][number]['platform']) => ({
      eventId,
      leagueId: `l-${eventId}`,
      name: `Copa ${eventId}`,
      game: 'rocket_league' as const,
      mode: '3v3' as const,
      entryType: 'teams' as const,
      format: 'single_elim' as const,
      status: 'registration' as const,
      startsAt: iso(NOW + 48 * H),
      registrationOpensAt: null,
      registrationClosesAt: iso(NOW + 24 * H),
      checkinMinutes: null,
      maxEntries: 16,
      prizeText: '',
      leagueName: 'Liga',
      visibility: 'public' as const,
      logoPath: null,
      approved: 6,
      pending: 0,
      ...(platform ? { platform } : {}),
    });
    state.hub = ok({ tournaments: [tour('a', 'playstation'), tour('b', 'crossplay')], teams: [] });
    const t = text(page('/esports/rocket_league'));
    expect(t).toContain('PlayStation · 3 contra 3 · Eliminación simple · Solo equipos · 6/16');
    expect(t).toContain('Crossplay · 3 contra 3');
  });

  it('«Mis torneos»: el juego y la plataforma del torneo', () => {
    state.myEntries = ok([
      {
        entryId: 'e1',
        eventId: 'ev1',
        leagueId: 'l1',
        tournament: 'Copa Xbox',
        game: 'rocket_league',
        mode: '3v3',
        entryStatus: 'approved',
        tournamentStatus: 'registration',
        startsAt: iso(NOW + 48 * H),
        entryName: 'Los Tigres',
        role: 'captain',
        kind: 'team',
        platform: 'xbox',
      },
    ]);
    const t = text(page('/esports'));
    expect(t).toContain('Mis torneos');
    expect(t).toContain('Rocket League · Xbox · Los Tigres');
  });
});

describe('crear torneo: la plataforma en el paso de formato', () => {
  const fields = (game: Parameters<typeof emptyForm>[0], pro = false) => text(bare(h(FormatFields, { value: emptyForm(game, '2026-10-08'), onChange: () => {}, pro })));

  it('un juego de varias: las fichas a la vista (también en Lite), crossplay elegido', () => {
    const rl = fields('rocket_league');
    expect(rl).toContain('Plataforma Crossplay PC PlayStation Xbox Nintendo Switch');
    expect(rl).toContain('Entra gente de todas las plataformas.');
    // En Lite los ajustes van escondidos, la plataforma no.
    expect(rl).toContain('Ajustes del formato');
    const html = bare(h(FormatFields, { value: emptyForm('rocket_league', '2026-10-08'), onChange: () => {}, pro: false }));
    expect(html).toMatch(/role="radio" aria-checked="true"[^>]*>Crossplay</);
    expect(fields('sf6')).toContain('Crossplay PC PlayStation Xbox');
    expect(fields('sf6')).not.toContain('Nintendo Switch');
    expect(fields('fortnite')).toContain('Móvil');
    // NBA 2K: las mismas fichas (ya no la lista escondida en «Más opciones»).
    expect(fields('nba_2k')).toContain('Crossplay PC PlayStation Xbox Nintendo Switch');
    expect(fields('nba_2k')).not.toContain('Elige la plataforma');
  });

  it('un juego de una sola: el texto, sin fichas', () => {
    expect(fields('valorant')).toContain('VALORANT se juega en PC .');
    expect(fields('mlbb')).toContain('Mobile Legends: Bang Bang se juega en Móvil .');
    expect(fields('smash')).toContain('Super Smash Bros. Ultimate se juega en Nintendo Switch .');
    const html = bare(h(FormatFields, { value: emptyForm('valorant', '2026-10-08'), onChange: () => {}, pro: true }));
    expect(html).not.toContain('aria-label="Plataforma"');
  });
});

describe('Mi ID de juego: dónde juegas y otra cuenta', () => {
  const sheet = (props: Record<string, unknown>) =>
    bare(h(GameIdSheet, { open: true, onClose: () => {}, game: 'rocket_league', record: null, providers: PROVIDERS, onDone: () => {}, ...props }));

  it('la lista dice dónde juega cada ID (o que falta decirlo); NBA 2K, la plataforma de cada uno', () => {
    state.ids = ok([rec({ platforms: ['pc', 'playstation'] }), rec({ game: 'sf6', idDisplay: 'ANA123', platforms: [] }), rec({ game: 'nba_2k', platform: 'psn', idDisplay: 'AnaPS' }), rec({ game: 'valorant', idDisplay: 'Ana#LAN' })]);
    const t = text(page('/esports/mi-id'));
    expect(t).toContain('Rocket League · PC y PlayStation');
    expect(t).toContain('Street Fighter 6 · Di dónde juegas');
    expect(t).toContain('NBA 2K · PlayStation');
    expect(t).not.toContain('VALORANT · PC');
  });

  it('escribir el ID: «¿Dónde juegas?» con las del juego (varias), marcada la del torneo de donde viene', () => {
    const out = sheet({ wanted: 'playstation' });
    const t = text(out);
    expect(t).toContain('¿Dónde juegas?');
    expect(t).toContain('Este torneo es de PlayStation.');
    expect(out).toMatch(/aria-pressed="true"[^>]*aria-label="PlayStation \(la del torneo\)"/);
    expect(out).toMatch(/aria-pressed="false"[^>]*>PC</);
    // Sin torneo: ninguna marcada, la pista general.
    expect(text(sheet({}))).toContain('Marca todas: los torneos que no son crossplay lo piden.');
    // Los de una sola plataforma y NBA 2K (un ID por plataforma) no preguntan.
    expect(text(sheet({ game: 'valorant' }))).not.toContain('¿Dónde juegas?');
    expect(text(sheet({ game: 'nba_2k' }))).not.toContain('¿Dónde juegas?');
  });

  it('lo que hay: el ID sin plataforma viniendo de un torneo de PlayStation → marcada y «Guardar dónde juego»', () => {
    const t = text(sheet({ record: rec(), wanted: 'playstation' }));
    expect(t).toContain('¿Dónde juegas?');
    expect(t).toContain('Guardar dónde juego');
    // Ya dice dónde juega y es de otra: lo dice, sin marcar nada solo.
    const other = text(sheet({ record: rec({ platforms: ['pc'] }), wanted: 'playstation' }));
    expect(other).toContain('Tu ID es de PC y el torneo es de PlayStation: márcala si también juegas ahí, o usa otra cuenta.');
    expect(other).not.toContain('Guardar dónde juego');
    // Sin cambios no hay botón.
    expect(text(sheet({ record: rec({ platforms: ['pc'] }) }))).not.toContain('Guardar dónde juego');
  });

  it('conectado con Epic: «¿Dónde juegas?» también, y «Conectar otra cuenta» (entra con otra de Epic)', () => {
    const t = text(sheet({ record: login({ platforms: ['playstation'] }) }));
    expect(t).toContain('Cuenta conectada');
    expect(t).toContain('Lo conectaste con tu cuenta de Epic.');
    expect(t).not.toContain('Si cambió, quítalo');
    expect(t).toContain('¿Dónde juegas?');
    expect(t).toContain('Conectar otra cuenta');
    expect(t).toContain('Entra con otra cuenta de Epic');
    expect(t).not.toContain('Cambiar mi ID');
    // Epic apagado: no se ofrece.
    expect(text(sheet({ record: login(), providers: { lookup: [], link: { steam: false, epic: false, riot: false } } }))).not.toContain('Conectar otra cuenta');
  });

  it('Steam: «Conectar otra cuenta» con la nota de cerrar la sesión antes', () => {
    const t = text(sheet({ game: 'cs2', record: login({ game: 'cs2', idDisplay: '22202' }) }));
    expect(t).toContain('Conectar otra cuenta');
    expect(t).toContain('Para usar otra cuenta de Steam, cierra sesión de Steam en el navegador antes.');
    // Al escribir el ID (con «Conectar con Steam» arriba), la misma nota.
    expect(text(sheet({ game: 'cs2' }))).toContain('Para usar otra cuenta de Steam, cierra sesión de Steam en el navegador antes.');
    expect(text(sheet({ game: 'cs2' }))).toContain('Conectar con Steam');
  });

  it('`?juego=&plataforma=&volver=`: la hoja del ID con la del torneo y «Volver» al torneo', () => {
    state.ids = ok([rec({ platforms: ['pc'] })]);
    const out = page(`/esports/mi-id?juego=rocket_league&plataforma=playstation&volver=${encodeURIComponent(BACK)}`);
    const t = text(out);
    expect(t).toContain('AnaRL');
    expect(t).toContain('el torneo es de PlayStation');
    expect(out).toContain(`href="${BACK}"`);
    expect(t).toContain('Volver');
  });

  it('NBA 2K con `?plataforma=playstation` (o la vieja psn): el ID de PlayStation; sin él, escribirlo con PlayStation elegida', () => {
    state.ids = ok([rec({ game: 'nba_2k', platform: 'steam', idDisplay: 'AnaPC' }), rec({ game: 'nba_2k', platform: 'psn', idDisplay: 'AnaPS' })]);
    expect(text(page('/esports/mi-id?juego=nba_2k&plataforma=playstation'))).toContain('Usuario de la consola · PlayStation AnaPS');
    expect(text(page('/esports/mi-id?juego=nba_2k&plataforma=psn'))).toContain('Usuario de la consola · PlayStation AnaPS');
    expect(text(page('/esports/mi-id?juego=nba_2k&plataforma=pc'))).toContain('AnaPC');
    state.ids = ok([rec({ game: 'nba_2k', platform: 'steam', idDisplay: 'AnaPC' })]);
    const out = page('/esports/mi-id?juego=nba_2k&plataforma=xbox');
    expect(out).toMatch(/<option value="xbox" selected="">Xbox<\/option>/);
    expect(text(out)).toContain('Tu usuario de la consola');
  });
});
