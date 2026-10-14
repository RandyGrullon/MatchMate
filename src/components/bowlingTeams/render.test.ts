/**
 * Los equipos fijos del boliche dibujados sin navegador (renderToString), con datos de mentira: Organizar › Equipos
 * (vacío, con equipos, generar con su vista previa, mover o sacar a un jugador, agregar, nombre y color), la sección
 * «Equipos» del inicio de la liga y la tarjeta «Usar los equipos fijos de la liga» de un torneo.
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BowlingTeam } from '../../lib/data/bowlingTeams';
import { LeagueContext, type LeagueCtx } from '../../lib/league';
import type { League, Player } from '../../lib/types';
import { FeedbackProvider } from '../feedback';

const data = vi.hoisted(() => ({ teams: [] as BowlingTeam[], asked: [] as (string | null)[] }));
vi.mock('../../lib/data/bowlingTeams', async (orig) => ({
  ...(await orig<typeof import('../../lib/data/bowlingTeams')>()),
  useBowlingTeams: (lid: string | null | undefined) => {
    data.asked.push(lid ?? null);
    return { data: lid ? data.teams : [], loading: false, error: null };
  },
}));

const { TeamsAdmin, GenerateSheet, PlayerSheet, AddPlayersSheet, TeamFormSheet, replaceMessage } = await import('./BowlingTeamsAdmin');
const { LeagueTeamsSection, homeAverages } = await import('./LeagueTeams');
const { FixedTeamsCard } = await import('./FixedTeamsCard');
const { inkOn, teamInitials } = await import('./parts');

const league = (over: Partial<League> = {}): League => ({
  id: 'L1',
  name: 'Liga de los martes',
  kind: 'liga',
  visibility: 'private',
  ownerUid: 'u1',
  venue: '',
  schedule: '',
  seasonStart: '',
  seasonEnd: '',
  contactName: '',
  contactPhone: '',
  requirePhoto: true,
  sport: 'bowling',
  ...over,
});

const ctx = (over: Partial<LeagueCtx> = {}, l: Partial<League> = {}): LeagueCtx => ({
  lid: 'L1',
  league: league(l),
  member: null,
  isAdmin: true,
  isOwner: true,
  isScorer: false,
  canScore: true,
  myPlayerId: null,
  base: '/l/L1',
  ...over,
});

const render = (el: ReactElement, value: LeagueCtx = ctx()) =>
  renderToString(h(MemoryRouter, null, h(FeedbackProvider, null, h(LeagueContext.Provider, { value }, el))));
const text = (html: string) =>
  html
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

const players: Player[] = [
  { id: 'p1', name: 'Ana Pérez', averageOverride: null },
  { id: 'p2', name: 'Luis Gómez', averageOverride: null },
  { id: 'p3', name: 'Pedro Díaz', averageOverride: null },
  { id: 'p4', name: 'Carmen Ruiz', averageOverride: 150 },
];
const teams: BowlingTeam[] = [
  {
    id: 'T1',
    name: 'Los Strikers',
    color: '#dc2626',
    order: 1,
    players: [
      { playerId: 'p1', name: 'Ana Pérez' },
      { playerId: 'p2', name: 'Luis Gómez' },
    ],
  },
  { id: 'T2', name: 'Equipo 2', color: null, order: 2, players: [{ playerId: 'p3', name: 'Pedro Díaz' }] },
];
const averages = new Map([
  ['p1', 190],
  ['p2', 170],
  ['p3', 180],
  ['p4', 0],
]);
const noop = () => undefined;

beforeEach(() => {
  data.teams = teams;
  data.asked = [];
});

describe('Organizar › Equipos', () => {
  it('sin equipos: generar o crear uno; sin jugadores, a dónde se agregan', () => {
    let out = render(h(TeamsAdmin, { teams: [], loading: false, players, averages }));
    let t = text(out);
    expect(t).toContain('Todavía no hay equipos');
    expect(t).toContain('Genéralos al azar o parejos por promedio');
    expect(out).toMatch(/<button(?![^>]*disabled="")[^>]*>(?:(?!<\/button>).)*Generar equipos/);
    expect(t).toContain('Crear un equipo');

    out = render(h(TeamsAdmin, { teams: [], loading: false, players: [], averages }));
    t = text(out);
    expect(t).toContain('Primero agrega a los jugadores en Jugadores y miembros');
    expect(out).toContain('href="/l/L1/admin?tab=jugadores"');
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Generar equipos/);
  });

  it('con equipos: cada uno con su marca, sus jugadores (con promedio) y la suma; los que no tienen equipo, aparte', () => {
    const out = render(h(TeamsAdmin, { teams, loading: false, players, averages }));
    const t = text(out);
    expect(t).toContain('Equipos (2)');
    expect(t).toContain('Nuevo equipo');
    expect(t).toContain('LS Los Strikers 2 jugadores · suma 360');
    expect(t).toContain('2 Equipo 2 1 jugador · suma 180');
    expect(t).toMatch(/AP Ana Pérez 190 LG Luis Gómez 170 Agregar jugador/);
    expect(out).toContain('aria-label="Ana Pérez: mover o sacar del equipo"');
    expect(out).toContain('aria-label="Agregar jugador a Los Strikers"');
    expect(out).toContain('aria-label="Nombre y color de Equipo 2"');
    // El color de cada equipo: el suyo, o el de la paleta por su lugar.
    expect(out).toContain('background:#dc2626');
    expect(t).toContain('Sin equipo (1)');
    expect(out).toContain('aria-label="Carmen Ruiz: poner en un equipo"');
    expect(t).not.toContain('Todavía no hay equipos');
  });

  it('mientras carga, el esqueleto (ni vacío ni la lista)', () => {
    const t = text(render(h(TeamsAdmin, { teams: [], loading: true, players: [], averages })));
    expect(t).not.toContain('Todavía no hay equipos');
    expect(t).not.toContain('Equipos (');
  });
});

describe('Generar equipos', () => {
  const sheet = (over: Record<string, unknown> = {}) =>
    render(h(GenerateSheet, { open: true, onClose: noop, players, teams, averages, initialSeed: 1, ...over }));

  it('al azar: de a cuántos, quiénes entran, cómo quedan (con los nombres de ahora) y «Usar estos equipos»', () => {
    const out = sheet();
    const t = text(out);
    expect(t).toContain('Generar equipos');
    // Con equipos de 2 y 1, se proponen de a 2: 4 jugadores → 2 equipos.
    expect(t).toContain('4 jugadores → 2 equipos');
    expect(out).toMatch(/role="radio" aria-checked="true"[^>]*>2</);
    expect(out).toMatch(/role="radio" aria-checked="true"[^>]*>.*Al azar/);
    expect(t).toContain('Quiénes entran · 4 de 4');
    expect(t).toContain('Así quedan');
    expect(t).toContain('Mezclar otra vez');
    expect(t).toMatch(/Los Strikers suma \d+ .* Equipo 2 suma \d+/);
    expect(t).toContain('Usar estos equipos');
    // La misma semilla, el mismo reparto.
    expect(sheet()).toBe(out);
  });

  it('parejos por promedio: la diferencia entre equipos (el fijo cuenta si no tiene juegos)', () => {
    const t = text(sheet({ initialMode: 'parejos' }));
    expect(t).toContain('Diferencia:');
    expect(t).not.toContain('Mezclar otra vez');
    // 190, 180, 170 y Carmen con su fijo (150): 340 y 350 (o al revés).
    expect(t).toMatch(/Diferencia: 10 pinos/);
  });

  it('el aviso al reemplazar los de ahora', () => {
    expect(replaceMessage(1, 1)).toBe('Se reemplaza el equipo de ahora. Los torneos que ya tienen sus equipos no cambian.');
    expect(replaceMessage(4, 3)).toBe('Se reemplazan los 4 equipos de ahora y se borra 1 que sobra. Los torneos que ya tienen sus equipos no cambian.');
    expect(replaceMessage(5, 3)).toContain('y se borran 2 que sobran.');
  });

  it('cerrada no dibuja nada', () => {
    expect(text(render(h(GenerateSheet, { open: false, onClose: noop, players, teams, averages })))).toBe('');
  });
});

describe('Un jugador: mover o sacar', () => {
  it('en un equipo: los otros equipos para moverlo y «Sacar de…»', () => {
    const out = render(h(PlayerSheet, { player: players[0], teams, averages, onClose: noop }));
    const t = text(out);
    expect(t).toContain('Ana Pérez');
    expect(t).toContain('Los Strikers · promedio 190');
    expect(t).toContain('Mover a');
    expect(out).toContain('aria-label="Mover a Ana Pérez en Equipo 2"');
    expect(out).not.toContain('en Los Strikers"');
    expect(t).toContain('Sacar de Los Strikers');
  });

  it('sin equipo: «Poner en» cualquiera, y nada que sacar', () => {
    const out = render(h(PlayerSheet, { player: players[3], teams, averages, onClose: noop }));
    const t = text(out);
    expect(t).toContain('Sin equipo');
    expect(t).toContain('Poner en');
    expect(out).toContain('aria-label="Poner a Carmen Ruiz en Los Strikers"');
    expect(out).toContain('aria-label="Poner a Carmen Ruiz en Equipo 2"');
    expect(t).not.toContain('Sacar de');
  });

  it('agregar a un equipo: primero los que no tienen, después los de otro equipo (se cambian)', () => {
    const out = render(h(AddPlayersSheet, { team: teams[1], teams, players, averages, onClose: noop }));
    const t = text(out);
    expect(t).toContain('Agregar a Equipo 2');
    expect(t).toMatch(/Sin equipo CR Carmen Ruiz .*En otro equipo AP Ana Pérez En Los Strikers: se cambia 190/);
    expect(out).toContain('aria-label="Agregar a Luis Gómez (sale de Los Strikers)"');
    expect(t).not.toContain('Pedro Díaz');
  });

  it('nombre y color: nuevo (con «Equipo N» y el color que sigue) o uno que ya existe (con borrar)', () => {
    let out = render(h(TeamFormSheet, { open: true, team: null, index: 2, onClose: noop }));
    expect(text(out)).toContain('Nuevo equipo');
    expect(out).toContain('placeholder="Equipo 3"');
    expect(text(out)).toContain('Crear equipo');
    expect(out).not.toContain('Borrar');
    out = render(h(TeamFormSheet, { open: true, team: teams[0], index: 0, onClose: noop }));
    expect(text(out)).toContain('Nombre y color');
    expect(out).toContain('value="Los Strikers"');
    expect(out).toMatch(/aria-label="Color #dc2626" aria-pressed="true"/);
    expect(out).toContain('aria-label="Borrar Los Strikers"');
  });
});

describe('La liga › Equipos', () => {
  it('cada equipo con sus jugadores y la suma; el tuyo con «Tú»; quien organiza, «Editar»', () => {
    const out = render(h(LeagueTeamsSection, { averages }), ctx({ myPlayerId: 'p3' }));
    const t = text(out);
    expect(t).toMatch(/^Equipos Editar/);
    expect(out).toContain('href="/l/L1/admin?tab=equipos"');
    expect(t).toContain('LS Los Strikers Ana · Luis 360');
    expect(t).toContain('2 Equipo 2 Tú Pedro 180');
    expect(t).toContain('la suma de los promedios');
    expect(data.asked).toContain('L1');
  });

  it('un jugador no ve «Editar»; sin equipos fijos (o en un torneo suelto) no sale', () => {
    expect(text(render(h(LeagueTeamsSection, { averages }), ctx({ isAdmin: false })))).not.toContain('Editar');
    data.teams = [];
    expect(text(render(h(LeagueTeamsSection, { averages })))).toBe('');
    data.teams = teams;
    data.asked = [];
    expect(text(render(h(LeagueTeamsSection, { averages }), ctx({}, { kind: 'torneo' })))).toBe('');
    expect(data.asked).toEqual([null]);
  });

  it('los promedios del inicio: los de la tabla y, sin juegos, el fijo', () => {
    const m = homeAverages(
      [
        { playerId: 'p1', average: 190 },
        { playerId: 'p4', average: 0 },
      ],
      players,
    );
    expect([...m]).toEqual([
      ['p4', 150],
      ['p1', 190],
    ]);
  });
});

describe('Torneo › Equipos: los fijos de la liga', () => {
  const event = { id: 'E1', teams: {} };
  it('con inscritos: «Usar los equipos fijos de la liga» y que los nuevos entran solos', () => {
    const out = render(h(FixedTeamsCard, { event, entries: [{ teamId: null }] }));
    const t = text(out);
    expect(t).toContain('La liga tiene 2 equipos fijos');
    expect(t).toContain('Quien se inscribe en este torneo entra solo a su equipo.');
    expect(out).toMatch(/<button(?![^>]*disabled="")[^>]*>(?:(?!<\/button>).)*Usar los equipos fijos de la liga/);
  });

  it('sin inscritos, el botón espera; sin equipos fijos, no sale', () => {
    expect(render(h(FixedTeamsCard, { event, entries: [] }))).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Usar los equipos fijos/);
    data.teams = [];
    expect(text(render(h(FixedTeamsCard, { event, entries: [{ teamId: null }] })))).toBe('');
  });
});

describe('piezas', () => {
  it('la marca del equipo: su número o sus iniciales; letra oscura en los colores claros', () => {
    expect([teamInitials('Equipo 3'), teamInitials('Los Strikers'), teamInitials('pinos'), teamInitials('  ')]).toEqual(['3', 'LS', 'P', '?']);
    expect(inkOn('#f59e0b')).toBe('#111827');
    expect(inkOn('#2563eb')).toBe('#fff');
    expect(inkOn('rojo')).toBe('#fff');
  });
});
