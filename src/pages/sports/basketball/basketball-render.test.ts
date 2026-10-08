/**
 * Humo de las pantallas del baloncesto: se dibujan (sin navegador, renderToString) con datos puestos en la caché,
 * con los roles de admin y de capitán. Atrapa errores al dibujar (undefined, claves, textos) sin la base.
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '../../../lib/data/client';
import { keys } from '../../../lib/data/keys';
import { matchKeys, type Match, type MatchSide } from '../../../lib/data/matches';
import { seasonKeys } from '../../../lib/data/seasons';
import { seasonTeamKeys, type SeasonTeam } from '../../../lib/data/seasonTeams';
import { teamSportKeys, type MatchOfficial, type MatchRsvp } from '../../../lib/data/teamSports';
import { LeagueContext, type LeagueCtx } from '../../../lib/league';
import type { Season } from '../../../lib/seasons';
import type { League, Member, Player } from '../../../lib/types';
import { FeedbackProvider } from '../../../components/feedback';
import screens from './screens';
import { templateRules } from './rules';

// Lite o Pro (el modo de la app): Lite por defecto; algunas pruebas miran lo de Pro.
const mode = vi.hoisted(() => ({ pro: false }));
vi.mock('../../../lib/useMode', async (orig) => ({
  ...(await orig<typeof import('../../../lib/useMode')>()),
  useIsPro: () => mode.pro,
}));

const lid = 'l1';
const now = Date.now();
const league: League = {
  id: lid,
  name: 'Baloncesto del Barrio',
  kind: 'liga',
  visibility: 'public',
  ownerUid: 'u-admin',
  venue: 'Cancha',
  schedule: '',
  seasonStart: '',
  seasonEnd: '',
  contactName: '',
  contactPhone: '',
  requirePhoto: false,
  sport: 'basketball',
};
const players: Player[] = [
  { id: 'p1', name: 'Ana Pérez', averageOverride: null, uid: 'u-ana' },
  { id: 'p2', name: 'Luis Soto', averageOverride: null },
  { id: 'p3', name: 'Otra Díaz', averageOverride: null, uid: 'u-otra' },
  { id: 'p4', name: 'Pedro Gómez', averageOverride: null },
];
const members: Member[] = [
  { id: `${lid}_u-admin`, leagueId: lid, uid: 'u-admin', name: 'Org', role: 'owner', playerId: null },
  { id: `${lid}_u-ana`, leagueId: lid, uid: 'u-ana', name: 'Ana', role: 'member', playerId: 'p1' },
  { id: `${lid}_u-otra`, leagueId: lid, uid: 'u-otra', name: 'Otra', role: 'member', playerId: 'p3' },
];
const team = (id: string, name: string, color: string, order: number, roster: SeasonTeam['roster']): SeasonTeam => ({
  id,
  leagueId: lid,
  name,
  color,
  order,
  roster,
  createdAt: null,
  updatedAt: null,
});
const teams = [
  team('T1', 'Tigres', '#f97316', 1, [
    { playerId: 'p1', jersey: 7, position: 'Base', role: 'captain' },
    { playerId: 'p2', jersey: 10, position: null, role: 'player' },
  ]),
  team('T2', 'Leones', '#1e3a8a', 2, [
    { playerId: 'p3', jersey: 4, position: null, role: 'delegate' },
    { playerId: 'p4', jersey: 12, position: 'Pívot', role: 'player' },
  ]),
];
const sides = (a: string, b: string): [MatchSide, MatchSide] => [
  { side: 1, teamId: a, label: a === 'T1' ? 'Tigres' : 'Leones', seed: null, players: [] },
  { side: 2, teamId: b, label: b === 'T1' ? 'Tigres' : 'Leones', seed: null, players: [] },
];
function match(id: string, p: Partial<Match>): Match {
  return {
    id,
    leagueId: lid,
    eventId: null,
    round: 1,
    stage: '',
    bracketKey: null,
    court: 'Cancha 1',
    scheduledAt: new Date(now + 86_400_000).toISOString(),
    status: 'scheduled',
    format: 'fiba',
    requireConfirm: true,
    score: null,
    winner: null,
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
    sides: sides('T1', 'T2'),
    createdAt: null,
    updatedAt: null,
    ...p,
  };
}
const rules = templateRules('fiba');
const done = match('m1', {
  round: 1,
  scheduledAt: new Date(now - 7 * 86_400_000).toISOString(),
  status: 'confirmed',
  winner: 1,
  score: {
    text: '70-64',
    sides: [70, 64],
    periods: [
      [20, 18],
      [15, 16],
      [20, 10],
      [15, 20],
    ],
    lines: 'p1:1:24:4:4:4:3;p2:1:10:0:5:0:5;p3:2:30:2:5:6:1;p4:2:0:0:0:0:0',
  },
});
const live = match('m2', {
  round: 2,
  sides: sides('T2', 'T1'),
  scheduledAt: new Date(now - 1_800_000).toISOString(),
  status: 'live',
  score: { text: '12-9', sides: [12, 9], live: { p: 2, pl: '2.º cuarto', tf: [4, 1], bonus: [true, false], clk: { r: true, ms: 300_000, t: now } } },
});
const next = match('m3', { round: 3 });
const matches = [done, live, next];
const official: MatchOfficial = { matchId: 'm3', userId: 'u-otra', name: 'Otra' };
const rsvps: MatchRsvp[] = [{ matchId: 'm3', playerId: 'p2', side: 1, status: 'yes', setBy: 'u-ana', at: null }];

/** La temporada en curso (sin ella, las tablas no salen: no se sabe qué partidos son de cuál). */
const activeSeason: Season = {
  id: 's1',
  name: 'Temporada 2026',
  startsOn: '2000-01-01',
  endsOn: null,
  status: 'active',
  closedAt: null,
  closedBy: null,
  standings: null,
  awards: [],
  playoffs: [],
};

function seed() {
  queryClient.setQueryData(keys.players(lid), players);
  queryClient.setQueryData(keys.leagueMembers(lid), members);
  queryClient.setQueryData(seasonTeamKeys.league(lid), teams);
  queryClient.setQueryData(seasonKeys.list(lid), [activeSeason]);
  queryClient.setQueryData(matchKeys.league(lid), matches);
  for (const m of matches) queryClient.setQueryData(matchKeys.one(m.id), { ...m, rules, state: null, history: [] });
  queryClient.setQueryData(teamSportKeys.officials(lid), [official]);
  queryClient.setQueryData(teamSportKeys.rules(lid), rules);
  for (const ids of [['m3'], ['m1'], ['m2']]) queryClient.setQueryData(teamSportKeys.rsvps(lid, ids), rsvps);
}

function ctx(role: 'admin' | 'captain' | 'visit'): LeagueCtx {
  const admin = role === 'admin';
  const member = role === 'visit' ? null : members[admin ? 0 : 1];
  return {
    lid,
    league,
    member,
    isAdmin: admin,
    isOwner: admin,
    isScorer: false,
    canScore: admin,
    myPlayerId: role === 'captain' ? 'p1' : null,
    base: `/l/${lid}`,
  };
}

function render(el: ReactElement, url: string, role: 'admin' | 'captain' | 'visit', path = '*'): string {
  return renderToString(
    h(
      MemoryRouter,
      { initialEntries: [url] },
      h(FeedbackProvider, null, h(LeagueContext.Provider, { value: ctx(role) }, h(Routes, null, h(Route, { path, element: el })))),
    ),
  );
}

const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');

beforeEach(() => {
  mode.pro = false;
  seed();
});
afterEach(() => queryClient.invalidateAll());

describe('pantallas del baloncesto', () => {
  it('el contrato: pantallas, pestaña de admin «equipos» y nombres de pestañas', () => {
    expect(Object.keys(screens).sort()).toEqual(['Event', 'Feed', 'Home', 'MyProfile', 'Player', 'Playoffs', 'Standings', 'adminTabs', 'tabs', 'useSeasonTable']);
    expect(screens.adminTabs?.map((t) => t.key)).toEqual(['equipos']);
    expect(screens.tabs).toEqual({ home: 'Calendario', feed: 'Partidos', standings: 'Tabla', profile: 'Mi equipo' });
  });

  it('inicio (rediseño): en vivo con periodo, faltas y BONUS; tu próximo partido con Voy en un toque; próximos, resultados y tabla', () => {
    const cap = text(render(h(screens.Home), `/l/${lid}`, 'captain'));
    expect(cap).toContain('En vivo');
    expect(cap).toContain('2.º cuarto');
    expect(cap).toContain('BONUS');
    // «Tu próximo partido» con la convocatoria en línea (Voy / Tal vez / No voy) y cómo va el equipo.
    expect(cap).toContain('Tu próximo partido');
    expect(cap).toContain('Voy Tal vez No voy');
    expect(cap).toMatch(/Tu equipo: 1 va · faltan \d/);
    // Los resultados como filas con quién ganó y el marcador; la tabla con «Tu equipo».
    expect(cap).toContain('Resultados');
    expect(cap).toContain('Ganó Tigres');
    expect(cap).toContain('70–64');
    expect(cap).toContain('Tabla');
    expect(cap).toContain('Tu equipo');
    expect(cap).toContain('Máximo anotador: Otra Díaz');
    expect(cap).not.toContain('Armar calendario');
    // Con partidos, armar el calendario y el Excel ya no están en el inicio (Organizar y la Tabla en Pro).
    const admin = text(render(h(screens.Home), `/l/${lid}`, 'admin'));
    expect(admin).not.toContain('Armar calendario');
    expect(admin).not.toContain('Descargar Excel');
    expect(admin).toContain('Próximos partidos');
  });

  it('inicio vacío: sin equipos, «Primero, los equipos»; con equipos y sin partidos, el único botón es «Armar calendario»', () => {
    queryClient.setQueryData(matchKeys.league(lid), []);
    const empty = text(render(h(screens.Home), `/l/${lid}`, 'admin'));
    expect(empty).toContain('Todavía no hay calendario');
    expect(empty).toContain('Armar calendario');
    expect(text(render(h(screens.Home), `/l/${lid}`, 'visit'))).toContain('Cuando el admin arme el calendario');
    queryClient.setQueryData(seasonTeamKeys.league(lid), []);
    const noTeams = text(render(h(screens.Home), `/l/${lid}`, 'admin'));
    expect(noTeams).toContain('Primero, los equipos');
    expect(noTeams).toContain('Crear los equipos');
    expect(noTeams).not.toContain('Armar calendario');
  });

  it('partidos: Por jugar | Resultados | Mi equipo por jornada, y el detalle con la mesa, cuartos, puntos por jugador y «•••»', () => {
    const list = text(render(h(screens.Feed!), `/l/${lid}/juegos`, 'visit'));
    expect(list).toContain('Partidos');
    expect(list).toContain('Por jugar Resultados');
    expect(list).toContain('En vivo');
    expect(list).toContain('Jornada 3');
    expect(list).not.toContain('Jornada 1');
    expect(list).toContain('Tigres');
    const done = text(render(h(screens.Feed!), `/l/${lid}/juegos?ver=resultados`, 'visit'));
    expect(done).toContain('Jornada 1');
    expect(done).toContain('Ganó Tigres');
    expect(done).toContain('70–64');
    expect(text(render(h(screens.Feed!), `/l/${lid}/juegos?ver=mios`, 'captain'))).toContain('Mi equipo');
    const detailHtml = render(h(screens.Feed!), `/l/${lid}/juegos?partido=m1`, 'admin');
    const detail = text(detailHtml);
    expect(detail).toContain('Jornada 1');
    expect(detail).toContain('Final');
    expect(detail).toContain('4C');
    expect(detail).toContain('Ana Pérez');
    expect(detail).toContain('Compartir el resultado');
    // Lo del admin va en «•••» (una hoja), ya no en una tarjeta con botones.
    expect(detailHtml).toContain('aria-label="Más opciones"');
    expect(detail).not.toContain('Admin del partido');
    const next3 = text(render(h(screens.Feed!), `/l/${lid}/juegos?partido=m3`, 'captain'));
    expect(next3).toContain('Abrir la mesa anotadora');
    expect(next3).toContain('Anotador de mesa: Otra');
    expect(next3).toContain('Convocatoria');
    expect(next3).toContain('¿Vas a este partido?');
    // La mesa se abre encima (sin estado todavía en el servidor).
    const table = text(render(h(screens.Feed!), `/l/${lid}/juegos?partido=m3&mesa=1`, 'admin'));
    expect(table).toContain('Tigres vs. Leones');
    expect(table).toContain('Rápido');
    expect(table).toContain('Por jugador');
    expect(table).toContain('Fin del cuarto');
    // Un partido que ya no está en la lista de la liga.
    const gone = text(render(h(screens.Feed!), `/l/${lid}/juegos?partido=nada`, 'visit'));
    expect(gone).toContain('ya no existe');
  });

  it('tabla FIBA y perfil con puntos por partido', () => {
    const table = text(render(h(screens.Standings!), `/l/${lid}/ranking`, 'visit'));
    expect(table).toContain('Tabla Anotadores');
    expect(table).toContain('Tigres');
    // La regla en una línea; lo demás en «Cómo se cuenta».
    expect(table).toContain('Ganar 2 · perder 1 · desempate FIBA');
    expect(table).toContain('Cómo se cuenta');
    const scorers = text(render(h(screens.Standings!), `/l/${lid}/ranking?ver=anotadores`, 'visit'));
    expect(scorers).toContain('Otra Díaz');
    expect(scorers).toContain('por partido');
    const profile = text(render(h(screens.MyProfile!), `/l/${lid}/perfil`, 'captain'));
    expect(profile).toContain('Tigres');
    expect(profile).toContain('Capitán');
    expect(profile).toContain('Plantilla');
    expect(profile).toContain('Agregar jugador');
    expect(profile).toContain('Mis números');
    expect(profile).toContain('Por partido');
    expect(profile).toContain('vs. Leones');
    const player = text(render(h(screens.Player!), `/l/${lid}/j/p3`, 'visit', '/l/:lid/j/:playerId'));
    expect(player).toContain('Otra Díaz');
    expect(player).toContain('Leones · Delegado · #4');
    expect(player).toContain('#1 en anotadores');
    // Lite: los cuatro números de siempre; Pro: también triples, tiros libres, faltas y partido por partido.
    expect(player).not.toContain('Triples');
    mode.pro = true;
    const pro = text(render(h(screens.Player!), `/l/${lid}/j/p3`, 'visit', '/l/:lid/j/:playerId'));
    expect(pro).toContain('Triples');
    expect(pro).toContain('Tiros libres');
    expect(pro).toContain('PTS 3P TL F');
    const proScorers = text(render(h(screens.Standings!), `/l/${lid}/ranking?ver=anotadores`, 'visit'));
    expect(proScorers).toContain('PTS');
    expect(proScorers).toContain('Prom');
  });

  it('temporadas: una cerrada sin tabla guardada se calcula con sus partidos y sus equipos; sin temporadas, no sale una tabla mezclada', () => {
    // Una temporada de años de antes (la base la cerró sola: sin tabla ni equipos propios) con su campeón anotado.
    const before: Season = {
      ...activeSeason,
      id: 's0',
      name: 'Temporada 2025',
      startsOn: '2000-01-01',
      endsOn: '2998-12-31',
      status: 'closed',
      closedAt: '2026-01-01T00:00:00.000Z',
      awards: [{ id: 'a1', kind: 'campeon', label: 'Campeón', name: 'Tigres', playerId: null, teamId: 'T1', note: null }],
    };
    queryClient.setQueryData(seasonKeys.list(lid), [{ ...activeSeason, startsOn: '2999-01-01' }, before]);
    const closed = text(render(h(screens.Standings!), `/l/${lid}/ranking?temporada=s0`, 'visit'));
    expect(closed).toContain('Campeón: Tigres');
    expect(closed).toContain('desempate FIBA');
    expect(closed).toContain('Leones');
    expect(closed).not.toContain('Sin tabla guardada');
    // Otra liga con sus partidos pero sin las temporadas todavía: nada de tabla.
    const other = 'l9';
    queryClient.setQueryData(seasonTeamKeys.league(other), teams);
    queryClient.setQueryData(matchKeys.league(other), matches);
    queryClient.setQueryData(teamSportKeys.rules(other), rules);
    const html = renderToString(
      h(
        MemoryRouter,
        { initialEntries: [`/l/${other}/ranking`] },
        h(FeedbackProvider, null, h(LeagueContext.Provider, { value: { ...ctx('visit'), lid: other, base: `/l/${other}` } }, h(Routes, null, h(Route, { path: '*', element: h(screens.Standings!) })))),
      ),
    );
    expect(text(html)).not.toContain('desempate FIBA');
  });

  it('admin: Equipos | Partidos | Reglas (?parte=), con los anotadores de mesa y las plantillas de reglas', () => {
    const tab = screens.adminTabs![0];
    const out = text(render(h(tab.Component), `/l/${lid}/admin?tab=equipos`, 'admin'));
    expect(out).toContain('Equipos Partidos Reglas');
    expect(out).toContain('Equipos (2)');
    expect(out).toContain('Capitán: Ana Pérez');
    const cal = text(render(h(tab.Component), `/l/${lid}/admin?tab=equipos&parte=partidos`, 'admin'));
    expect(cal).toContain('Armar calendario');
    expect(cal).toContain('Partido suelto');
    expect(cal).toContain('Anotador de mesa');
    expect(cal).toContain('Anota: Otra');
    const rules = text(render(h(tab.Component), `/l/${lid}/admin?tab=equipos&parte=reglas`, 'admin'));
    expect(rules).toContain('Plantillas');
    expect(rules).toContain('En uso');
    expect(rules).toContain('Ajustar a mano');
    expect(rules).toContain('Guardar reglas');
  });

  it('«•••» del partido: lo del admin según cómo está el partido, y el anotador de mesa con los capitanes y delegados', async () => {
    const { adminMenuEntries, OfficialPicker } = await import('../team/MatchAdminPanel');
    const { scorerCandidates } = await import('../team/logic');
    const keys = (m: Match) => adminMenuEntries(m, { official: null, first: 'Tigres' }).map((e) => e.label);
    expect(keys(next)).toEqual(['Anotador de mesa', 'Reprogramar', 'Aplazar', 'W.O.', 'Poner resultado', 'Anular', 'Borrar el partido']);
    expect(keys(done)).toEqual(['Corregir resultado', 'Anular', 'Borrar el partido']);
    expect(keys({ ...done, status: 'disputed' })).toContain('Decidir el reclamo');
    // En disputa: el admin lo ve como tarjeta (dejar lo anotado o decidir); los demás no.
    queryClient.setQueryData(matchKeys.league(lid), [{ ...done, status: 'disputed', disputeNote: 'Fue 70-66' }, live, next]);
    const disputed = text(render(h(screens.Feed!), `/l/${lid}/juegos?partido=m1`, 'admin'));
    expect(disputed).toContain('En disputa');
    expect(disputed).toContain('«Fue 70-66»');
    expect(disputed).toContain('Dejar lo anotado');
    expect(text(render(h(screens.Feed!), `/l/${lid}/juegos?partido=m1`, 'captain'))).not.toContain('Dejar lo anotado');
    const picker = text(
      render(h(OfficialPicker, { tl: { lid }, match: next, official, candidates: scorerCandidates(next, teams, members, players) }), `/l/${lid}`, 'admin'),
    );
    expect(picker).toContain('Sin designar');
    expect(picker).toContain('Delegado de Leones');
  });

  it('ventanas: armar calendario, presentes y reglas', async () => {
    const { ScheduleBuilder } = await import('../team/ScheduleBuilder');
    const { PresentesModal } = await import('../team/PresentesModal');
    const { useTeamLeague } = await import('../team/useTeamLeague');
    const Builder = () => h(ScheduleBuilder, { tl: useTeamLeague(), open: true, onClose: () => undefined, format: 'fiba' });
    const b = text(render(h(Builder), `/l/${lid}`, 'admin'));
    expect(b).toContain('Armar el calendario');
    expect(b).toContain('Jornada 4');
    const Presentes = () => h(PresentesModal, { tl: useTeamLeague(), open: true, onClose: () => undefined, match: next, current: [['p1'], []], reinforcements: 2, onSave: () => undefined });
    const p = text(render(h(Presentes), `/l/${lid}`, 'admin'));
    expect(p).toContain('Refuerzos (0 de 2)');
    expect(p).toContain('Ana Pérez');
  });
});
