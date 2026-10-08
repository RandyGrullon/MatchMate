/**
 * Humo de las pantallas de ping pong: «Nuevo» (sin americano ni mexicano), el admin (reglas y nivel de 1 a 10), la
 * liga con la tabla de la ITTF (Jue., PF, PC), el calendario con mesas, el partido («Anotar en la mesa», la mesa y
 * «solo el resultado»), el sorteo de dobles, el perfil y la portada con «Tenis de mesa». Se dibujan en el servidor
 * (renderToString) con datos en la caché, para el admin, un jugador y un visitante.
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { queryClient } from '../../../lib/data/client';
import { keys } from '../../../lib/data/keys';
import { matchKeys, type Match } from '../../../lib/data/matches';
import { racketKeys, type RacketEvent } from '../../../lib/data/racket';
import { seasonTeamKeys } from '../../../lib/data/seasonTeams';
import type { Wire } from '../../../lib/data/stamp';
import { LeagueContext, type LeagueCtx } from '../../../lib/league';
import type { League, Member, Player } from '../../../lib/types';
import { resolveRules } from '../../../sports/racket';
import { FeedbackProvider } from '../../../components/feedback';
import { SportHero } from '../../../components/home/SportHero';
import { EventWizard } from '../racket/create/EventWizard';
import { AcceptModal } from '../racket-formats/LadderPage';
import { levelKeys } from '../racket/levels';
import { mkMatch, sets } from '../racket/logic/testMatch';
import { RacketProvider } from '../racket/sport';
import { TTSetup } from './court/TableTennisCourt';
import screens, { TABLE_TENNIS_EXT, tableTennisEntry } from './screens';

// El modo de la app: Pro por defecto (lo de organizar a la vista); las pruebas de Lite lo cambian.
const mode = vi.hoisted(() => ({ pro: true }));
vi.mock('../../../lib/useMode', async (orig) => ({
  ...(await orig<typeof import('../../../lib/useMode')>()),
  useIsPro: () => mode.pro,
  useMode: () => ({ mode: mode.pro ? 'pro' : 'lite', isPro: mode.pro, setMode: async () => 'local', suggestedPro: false }),
}));
afterEach(() => {
  mode.pro = true;
});

const L = 'LPP';
const league: League = {
  id: L,
  name: 'Ping pong del Club',
  kind: 'liga',
  visibility: 'public',
  ownerUid: 'u1',
  venue: 'Club',
  schedule: '',
  seasonStart: '',
  seasonEnd: '',
  contactName: '',
  contactPhone: '',
  requirePhoto: false,
  sport: 'table_tennis',
  tz: 'America/Santo_Domingo',
};
const P = ['p1', 'p2', 'p3', 'p4'];
const NAMES = ['Ana', 'Luis', 'Rosa', 'Pedro'];
const players: Player[] = P.map((id, i) => ({ id, name: NAMES[i], averageOverride: null, uid: id === 'p1' ? 'u-ana' : null }));
const nameOf = (id: string) => NAMES[P.indexOf(id)] ?? id;

const today = new Date().toISOString().slice(0, 10);
const ev = (id: string, type: string, name: string, config: Record<string, unknown>, playerCount: number): Wire<RacketEvent> => ({
  id,
  leagueId: L,
  type,
  name,
  date: today,
  startTime: '19:00',
  config,
  playerCount,
  createdAt: null,
  updatedAt: null,
});
const LIGA = ev('G1', 'liga', 'Liga del jueves', { format: 'liga', pairs: P, startDate: today }, 4);
const NUEVA = ev('G2', 'liga', 'Liga nueva', { format: 'liga', pairs: P, startDate: today }, 4);

const withEvent = (m: Match, eventId: string): Match => ({ ...m, eventId });
const score = (text: string, games: [number, number], points: [number, number]) => ({ text, sides: games, totals: { sets: games, games, points } });
const ligaMatches: Match[] = [
  withEvent(sets(['p1'], ['p2'], '', 1, { sets: [3, 1], games: [3, 1] }, { id: 'g1', round: 1, score: score('11-7 9-11 11-5 11-8', [3, 1], [42, 31]) }), 'G1'),
  withEvent(sets(['p3'], ['p4'], '', 1, { sets: [3, 0], games: [3, 0] }, { id: 'g2', round: 1, score: score('11-5 11-5 11-5', [3, 0], [33, 15]) }), 'G1'),
  withEvent(mkMatch({ id: 'g3', a: ['p1'], b: ['p3'], round: 2 }), 'G1'),
];
for (const m of ligaMatches) for (const s of m.sides) s.label = s.players.map((p) => nameOf(p.playerId)).join(' / ');

const members: Member[] = [
  { id: `${L}_u1`, leagueId: L, uid: 'u1', name: 'Dueña', role: 'owner', playerId: null },
  { id: `${L}_u-ana`, leagueId: L, uid: 'u-ana', name: 'Ana', role: 'member', playerId: 'p1' },
];

beforeAll(() => {
  const events = [LIGA, NUEVA];
  queryClient.setQueryData(racketKeys.events(L), events);
  for (const e of events) queryClient.setQueryData(racketKeys.event(e.id), e);
  queryClient.setQueryData(racketKeys.rules(L), { match: { sport: 'table_tennis' } });
  queryClient.setQueryData(levelKeys.league(L, 'tt'), { p1: 5.5, p3: 7 });
  queryClient.setQueryData(keys.players(L), players);
  queryClient.setQueryData(keys.leagueMembers(L), members);
  queryClient.setQueryData(seasonTeamKeys.league(L), []);
  queryClient.setQueryData(matchKeys.league(L), ligaMatches);
  queryClient.setQueryData(matchKeys.event('G1'), ligaMatches);
  queryClient.setQueryData(matchKeys.event('G2'), []);
  queryClient.setQueryData(matchKeys.one('g3'), { ...ligaMatches[2], rules: { match: { sport: 'table_tennis', bestOf: 7 } }, state: null, history: [] });
});

afterAll(() => queryClient.invalidateAll());

const ctx = (over: Partial<LeagueCtx> = {}): LeagueCtx => ({
  lid: L,
  league,
  member: members[0],
  isAdmin: true,
  isOwner: true,
  isScorer: false,
  canScore: true,
  myPlayerId: null,
  base: `/l/${L}`,
  ...over,
});
const ANA = ctx({ member: members[1], isAdmin: false, isOwner: false, canScore: false, myPlayerId: 'p1' });
const GUEST = ctx({ member: null, isAdmin: false, isOwner: false, canScore: false });

function render(el: ReactElement, path = `/l/${L}`, c: LeagueCtx = ctx()): string {
  return renderToString(h(MemoryRouter, { initialEntries: [path] }, h(FeedbackProvider, null, h(LeagueContext.Provider, { value: c }, el))));
}
const eventRoute = (path: string, c?: LeagueCtx) => render(h(Routes, null, h(Route, { path: '/l/:lid/e/:eventId', element: h(screens.Event) })), path, c);
const text = (html: string) =>
  html
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

describe('pantallas de ping pong', () => {
  it('el contrato: pantallas y «Jugadores y niveles» (se juega individual por defecto)', () => {
    expect(Object.keys(screens).sort()).toEqual(['Event', 'Feed', 'Home', 'MyProfile', 'Player', 'Standings', 'adminTabs', 'tabs', 'useSeasonTable']);
    expect(screens.adminTabs?.map((t) => [t.key, t.label])).toEqual([['parejas', 'Jugadores y niveles']]);
  });

  it('«Nuevo»: sin americano ni mexicano; liga, torneo grupos + eliminatoria, cajas y escalera', () => {
    const t = text(render(h(RacketProvider, { sport: 'table_tennis', ext: TABLE_TENNIS_EXT, children: h(EventWizard, { open: true, onClose: () => undefined }) })));
    expect(t).not.toContain('Americano');
    expect(t).not.toContain('Mexicano');
    expect(t).toContain('Liga');
    expect(t).toContain('tabla de la ITTF');
    expect(t).toContain('Torneo grupos + eliminatoria');
    expect(t).toContain('Liga por cajas mensual');
    expect(t).toContain('Escalera');
  });

  it('admin: las plantillas de ping pong y el nivel de 1 a 10 de cada jugador', () => {
    const html = render(h(screens.adminTabs![0].Component));
    const t = text(html);
    expect(t).toContain('Reglas del partido');
    expect(t).toContain('Individual · al mejor de 5 juegos a 11 · ganando por 2 · saque cada 2 puntos');
    expect(t).toContain('Individual, al mejor de 7 juegos a 11');
    expect(t).toContain('Dobles, al mejor de 5 juegos a 11');
    expect(t).toContain('Dobles, al mejor de 7 juegos a 11');
    expect(t).toContain('Jugadores y nivel');
    expect(t).toContain('Nivel del club de 1 a 10');
    expect(html).toContain('value="5.5"');
  });
});

describe('liga', () => {
  it('la tabla de la ITTF: Jue., PF y PC, con ganar 2 y perder 1', () => {
    const t = text(eventRoute(`/l/${L}/e/G1?ver=tabla`));
    for (const col of ['Jue.', 'PF', 'PC']) expect(t).toContain(col);
    expect(t).toContain('grupos de la ITTF');
    // Ana y Rosa ganaron (2 puntos); Luis y Pedro perdieron jugando (1 punto).
    const i = (x: string) => t.indexOf(x);
    expect(i('Rosa')).toBeLessThan(i('Pedro'));
    expect(i('Ana')).toBeLessThan(i('Luis'));
  });

  it('sin calendario: el admin lo arma con mesas; los demás esperan su mesa y hora', () => {
    const t = text(eventRoute(`/l/${L}/e/G2`));
    expect(t).toContain('2. Fechas, mesas y horas');
    expect(t).toContain('Mesas');
    expect(eventRoute(`/l/${L}/e/G2`)).toContain('value="Mesa 1"');
    expect(t).not.toContain('Cancha');
    // El ping pong trae sus propios puntos de la tabla.
    expect(t).not.toContain('Puntos de la tabla');
    expect(text(eventRoute(`/l/${L}/e/G2`, GUEST))).toContain('tus partidos con mesa y hora');
  });
});

describe('el partido', () => {
  it('«Anotar en la mesa», «Poner fecha y mesa» y «solo el resultado» juego por juego', () => {
    const html = eventRoute(`/l/${L}/e/G1?partido=g3`);
    const t = text(html);
    expect(t).toContain('Anotar en la mesa');
    // «Poner fecha y mesa» (y lo demás del admin) va en «•••» del partido.
    expect(html).toContain('aria-label="Más opciones"');
    expect(t).toContain('Solo el resultado');
    expect(t).toContain('Individual · al mejor de 7 juegos a 11');
    expect(t).not.toContain('cancha');
  });

  it('la mesa: deshacer punto, retiro y las reglas del partido', () => {
    const html = eventRoute(`/l/${L}/e/G1?partido=g3&cancha=1`);
    const t = text(html);
    expect(t).toContain('Deshacer punto');
    // El retiro, en «•••» de la mesa (ya no un segundo botón con bandera junto a «Terminar»).
    expect(html).toContain('aria-label="Más opciones"');
    expect(t).toContain('al mejor de 7 juegos a 11');
  });

  it('«solo el resultado»: juego por juego, el 12-10 y el resumen en juegos', () => {
    const spec = tableTennisEntry(ligaMatches[2]);
    expect(spec.points).toBe(false);
    expect(spec.placeholder).toBe('11-7 9-11 11-5 11-8');
    const r = spec.parser('11-8 9-11 12-10 6-11 11-7');
    expect(r.winner).toBe(1);
    expect(r.summary).toBe('Gana el lado 1, 3 juegos a 2');
    expect(r.score.totals).toEqual({ sets: [3, 2], games: [3, 2], points: [49, 47] });
    expect(() => spec.parser('11-10 11-5 11-3')).toThrow();
  });

  it('«solo el resultado»: el marcador de muestra y los ejemplos terminan el partido al mejor de 3, 5 y 7', () => {
    for (const bestOf of [3, 5, 7] as const) {
      for (const doubles of [false, true]) {
        const spec = tableTennisEntry({ ...ligaMatches[2], rules: { match: { sport: 'table_tennis', bestOf, doubles } } });
        expect(spec.examples.length, `al mejor de ${bestOf}`).toBeGreaterThan(1);
        for (const x of [spec.placeholder, ...spec.examples]) {
          const r = spec.parser(x);
          expect(r.winner, `${x} al mejor de ${bestOf}`).not.toBeNull();
          expect(Math.max(...r.score.sides!), `${x} al mejor de ${bestOf}`).toBe(Math.ceil(bestOf / 2));
        }
        expect(spec.hint).toContain(`al mejor de ${bestOf}, gana quien llega a ${Math.ceil(bestOf / 2)} juegos`);
      }
    }
    // Sin reglas en el partido: al mejor de 5.
    expect(tableTennisEntry(ligaMatches[2]).examples).toEqual(tableTennisEntry({ ...ligaMatches[2], rules: { match: { sport: 'table_tennis', bestOf: 5 } } }).examples);
  });

  it('el sorteo de dobles: quién saca primero y quién recibe primero', () => {
    const rules = resolveRules('table_tennis', { doubles: true });
    const t = text(
      render(
        h(TTSetup, {
          rules,
          labels: ['Ana / Luis', 'Rosa / Pedro'] as const,
          people: [
            ['Ana', 'Luis'],
            ['Rosa', 'Pedro'],
          ],
          match: ligaMatches[2],
          canChange: true,
          onStart: () => undefined,
        }),
      ),
    );
    expect(t).toContain('Dobles · al mejor de 5 juegos a 11');
    expect(t).toContain('¿Quién saca primero?');
    expect(t).toContain('Ana / Luis: ¿quién saca primero?');
    expect(t).toContain('Rosa / Pedro: ¿quién recibe primero?');
    expect(t).toContain('¿Quién empieza a tu izquierda?');
    expect(t).toContain('desde la derecha y en diagonal');
  });
});

describe('escalera', () => {
  it('aceptar un reto: se pone la mesa, no la cancha', () => {
    const c = {
      id: 'r1',
      eventId: 'G3',
      challenger: 'p3',
      challenged: 'p1',
      challengerPos: 3,
      challengedPos: 1,
      matchId: 'g9',
      status: 'pending' as const,
      acceptBy: '2026-10-10T00:00:00Z',
      playBy: '2026-10-17T00:00:00Z',
      acceptedAt: null,
      resolvedAt: null,
      winner: null,
      note: null,
      createdAt: '2026-10-07T00:00:00Z',
    };
    const modal = h(AcceptModal, { c, eventId: 'G3', onClose: () => undefined });
    const html = render(h(RacketProvider, { sport: 'table_tennis', ext: TABLE_TENNIS_EXT, children: modal }), `/l/${L}`, ANA);
    const t = text(html);
    expect(t).toContain('Aceptar el reto de Rosa');
    expect(t).toContain('Mesa');
    expect(html).toContain('placeholder="Mesa 2"');
    expect(t).not.toMatch(/cancha/i);
  });
});

describe('perfil y portada', () => {
  it('perfil: el nivel, juegos y puntos', () => {
    const t = text(render(h(screens.MyProfile!), `/l/${L}/perfil`, ANA));
    expect(t).toContain('Nivel 5.5');
    expect(t).toContain('Juegos');
    expect(t).toContain('3-1');
    expect(t).toContain('Puntos 42-31 (+11)');
  });

  it('la portada del deporte: «Ping pong» con «Tenis de mesa» debajo', () => {
    const t = text(
      renderToString(
        h(MemoryRouter, null, h(SportHero, { sport: 'table_tennis', status: 'open', mine: 0, publicCount: 0, signedIn: false, canCreate: true, onCreate: () => undefined })),
      ),
    );
    expect(t).toContain('Ping pong');
    expect(t).toContain('Tenis de mesa');
    expect(t).toContain('Ligas y torneos de ping pong');
  });
});
