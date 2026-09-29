/**
 * Humo de las pantallas del fútbol y la sala: se dibujan (sin navegador, renderToString) con datos puestos en la
 * caché, con los roles de admin, capitán y visitante. Atrapa errores al dibujar (undefined, claves, textos) sin la base.
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { queryClient } from '../../../lib/data/client';
import { keys } from '../../../lib/data/keys';
import { matchKeys, type Match, type MatchSide } from '../../../lib/data/matches';
import { seasonKeys } from '../../../lib/data/seasons';
import { seasonTeamKeys, type SeasonTeam } from '../../../lib/data/seasonTeams';
import { teamSportKeys, type MatchOfficial, type MatchRsvp } from '../../../lib/data/teamSports';
import { LeagueContext, type LeagueCtx } from '../../../lib/league';
import type { Season } from '../../../lib/seasons';
import type { League, Member, Player } from '../../../lib/types';
import { football, footballConfig, type FootballEvent } from '../../../sports/team/football';
import { replay } from '../../../sports/types';
import { FeedbackProvider } from '../../../components/feedback';
import futsalScreens from '../futsal/screens';
import { footballScore, footballWinner } from './adapter';
import { sanctionKeys, type FootballSanction } from './data';
import { templateRules } from './rules';
import screens from './screens';

const lid = 'l1';
const now = Date.now();
const MIN = 60_000;
let sport: 'football' | 'futsal' = 'football';
const league = (): League => ({
  id: lid,
  name: sport === 'football' ? 'Liga de Campo' : 'Liga de Sala',
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
  sport,
});
const players: Player[] = [
  { id: 'p1', name: 'Ana Pérez', averageOverride: null, uid: 'u-ana' },
  { id: 'p2', name: 'Luis Soto', averageOverride: null },
  { id: 'p3', name: 'Otra Díaz', averageOverride: null, uid: 'u-otra' },
  { id: 'p4', name: 'Pedro Gómez', averageOverride: null },
  { id: 'p5', name: 'Juan Portero', averageOverride: null },
];
const members: Member[] = [
  { id: `${lid}_u-admin`, leagueId: lid, uid: 'u-admin', name: 'Org', role: 'owner', playerId: null },
  { id: `${lid}_u-ana`, leagueId: lid, uid: 'u-ana', name: 'Ana', role: 'member', playerId: 'p1' },
  { id: `${lid}_u-otra`, leagueId: lid, uid: 'u-otra', name: 'Otra', role: 'member', playerId: 'p3' },
];
const team = (id: string, name: string, color: string, order: number, roster: SeasonTeam['roster']): SeasonTeam => ({ id, leagueId: lid, name, color, order, roster, createdAt: null, updatedAt: null });
const teams = [
  team('T1', 'Tigres', '#f97316', 1, [
    { playerId: 'p1', jersey: 9, position: 'Delantero', role: 'captain' },
    { playerId: 'p2', jersey: 10, position: null, role: 'player' },
    { playerId: 'p5', jersey: 1, position: 'Portero', role: 'player' },
  ]),
  team('T2', 'Leones', '#1e3a8a', 2, [
    { playerId: 'p3', jersey: 4, position: null, role: 'delegate' },
    { playerId: 'p4', jersey: 7, position: null, role: 'player' },
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
    format: sport,
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

function world() {
  const cfg = footballConfig(sport === 'football' ? 'football' : 'futsal');
  const t0 = now - 7 * 86_400_000;
  const doneLog: FootballEvent[] = [
    { type: 'lineup', side: 1, players: ['p1', 'p2', 'p5'], goalkeeper: 'p5' },
    { type: 'lineup', side: 2, players: ['p3', 'p4'] },
    { type: 'clock', action: 'start', at: t0 },
    { type: 'goal', side: 1, player: 'p1', assist: 'p2', at: t0 + 12 * MIN },
    { type: 'card', side: 2, player: 'p4', card: 'red', at: t0 + 15 * MIN },
    { type: 'goal', side: 1, player: 'p1', at: t0 + 18 * MIN },
  ];
  const doneState = replay(football, cfg, doneLog);
  const done = match('m1', {
    round: 1,
    scheduledAt: new Date(t0).toISOString(),
    status: 'confirmed',
    winner: footballWinner(doneState),
    score: footballScore(doneState, t0 + 90 * MIN),
  });
  const liveLog: FootballEvent[] = [
    { type: 'clock', action: 'start', at: now - 23 * MIN },
    { type: 'goal', side: 2, player: 'p3', at: now - 10 * MIN },
    ...(sport === 'futsal' ? Array.from({ length: 5 }, (): FootballEvent => ({ type: 'foul', side: 1, at: now - 5 * MIN })) : []),
  ];
  const live = match('m2', {
    round: 2,
    sides: sides('T2', 'T1'),
    scheduledAt: new Date(now - 30 * MIN).toISOString(),
    status: 'live',
    score: footballScore(replay(football, cfg, liveLog), now),
  });
  const next = match('m3', { round: 3 });
  return { done, live, next, matches: [done, live, next], doneLog };
}

const official: MatchOfficial = { matchId: 'm3', userId: 'u-otra', name: 'Otra' };
const rsvps: MatchRsvp[] = [
  { matchId: 'm3', playerId: 'p4', side: 2, status: 'yes', setBy: 'u-otra', at: null },
  { matchId: 'm3', playerId: 'p2', side: 1, status: 'yes', setBy: 'u-ana', at: null },
];
const sanctions: FootballSanction[] = [{ id: 's1', leagueId: lid, teamId: 'T1', playerId: 'p2', matchId: 'm1', matches: 2, note: 'Reclamo al árbitro', createdBy: 'u-admin', at: null }];

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
  const w = world();
  const rules = templateRules(sport === 'football' ? 'campo' : 'sala', sport);
  queryClient.setQueryData(keys.players(lid), players);
  queryClient.setQueryData(keys.leagueMembers(lid), members);
  queryClient.setQueryData(seasonTeamKeys.league(lid), teams);
  queryClient.setQueryData(seasonKeys.list(lid), [activeSeason]);
  queryClient.setQueryData(matchKeys.league(lid), w.matches);
  for (const m of w.matches) {
    const state = m.id === 'm1' ? { v: 1, seq: w.doneLog.length, config: footballConfig(sport), base: null, log: w.doneLog, at: now } : null;
    queryClient.setQueryData(matchKeys.one(m.id), { ...m, rules, state, history: [] });
  }
  queryClient.setQueryData(teamSportKeys.officials(lid), [official]);
  queryClient.setQueryData(teamSportKeys.rules(lid), rules);
  queryClient.setQueryData(sanctionKeys.league(lid), sanctions);
  for (const ids of [['m3'], ['m1'], ['m2']]) queryClient.setQueryData(teamSportKeys.rsvps(lid, ids), rsvps);
}

function ctx(role: 'admin' | 'captain' | 'visit'): LeagueCtx {
  const admin = role === 'admin';
  const member = role === 'visit' ? null : members[admin ? 0 : 1];
  return { lid, league: league(), member, isAdmin: admin, isOwner: admin, isScorer: false, canScore: admin, myPlayerId: role === 'captain' ? 'p1' : null, base: `/l/${lid}` };
}

function render(el: ReactElement, url: string, role: 'admin' | 'captain' | 'visit', path = '*'): string {
  return renderToString(
    h(MemoryRouter, { initialEntries: [url] }, h(FeedbackProvider, null, h(LeagueContext.Provider, { value: ctx(role) }, h(Routes, null, h(Route, { path, element: el }))))),
  );
}

const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

beforeEach(() => {
  sport = 'football';
  seed();
});
afterEach(() => queryClient.invalidateAll());

describe('pantallas del fútbol', () => {
  it('el contrato: pantallas, pestaña de admin «equipos», nombres de pestañas; la sala usa las mismas', () => {
    expect(Object.keys(screens).sort()).toEqual(['Event', 'Feed', 'Home', 'MyProfile', 'Player', 'Playoffs', 'Standings', 'adminTabs', 'tabs', 'useSeasonTable']);
    expect(screens.adminTabs?.map((t) => t.key)).toEqual(['equipos']);
    expect(screens.tabs).toEqual({ home: 'Calendario', feed: 'Partidos', standings: 'Tabla', profile: 'Mi equipo' });
    expect(futsalScreens).toBe(screens);
  });

  it('calendario: en vivo con el minuto, mi próximo partido con convocatoria, suspendidos y tabla', () => {
    const cap = text(render(h(screens.Home), `/l/${lid}`, 'captain'));
    expect(cap).toContain('En vivo');
    expect(cap).toContain('1.er tiempo');
    expect(cap).toMatch(/2[34]'/);
    expect(cap).toContain('Tu próximo partido');
    expect(cap).toContain('Convocatoria');
    expect(cap).toContain('¿Vas a este partido?');
    expect(cap).toContain('Suspendidos para la próxima jornada');
    expect(cap).toContain('Pedro Gómez'); // roja en el 1.er partido
    expect(cap).toContain('Luis Soto'); // sanción del comité
    expect(cap).toContain('Goleador');
    expect(cap).not.toContain('Armar calendario');
    const admin = text(render(h(screens.Home), `/l/${lid}`, 'admin'));
    expect(admin).toContain('Armar calendario');
    expect(admin).toContain('Descargar Excel');
  });

  it('partidos: detalle con goles y tarjetas, jugadores, admin; el acta en la cancha con GOL LOCAL / GOL VISITA', () => {
    const list = text(render(h(screens.Feed!), `/l/${lid}/juegos`, 'visit'));
    expect(list).toContain('Jornada 1');
    expect(list).toContain('Tigres');
    const detail = text(render(h(screens.Feed!), `/l/${lid}/juegos?partido=m1`, 'admin'));
    expect(detail).toContain('Goles y tarjetas');
    expect(detail).toContain("13'");
    expect(detail).toContain('Asistencia: #10 Luis Soto');
    expect(detail).toContain('Ana Pérez');
    expect(detail).toContain('Corregir resultado');
    expect(detail).toContain('Corregir el acta');
    expect(detail).toContain('Ver el acta completa');
    const next = text(render(h(screens.Feed!), `/l/${lid}/juegos?partido=m3`, 'captain'));
    expect(next).toContain('Abrir el acta del partido');
    expect(next).toContain('Anotador de mesa: Otra');
    // Pedro (roja en la jornada 1) la cumple en el partido que Leones está jugando ahora; Luis tiene 2 del comité.
    expect(next).toContain('Suspendidos para este partido');
    expect(next).toContain('Luis Soto (Tigres) · sanción del comité');
    expect(next).not.toContain('Pedro Gómez (Leones)');
    expect(next).toContain('Luis Soto: Suspendido y está convocado');
    const table = text(render(h(screens.Feed!), `/l/${lid}/juegos?partido=m3&mesa=1`, 'admin'));
    expect(table).toContain('Tigres vs. Leones');
    expect(table).toContain('GOL');
    expect(table).toContain('Local · Tigres');
    expect(table).toContain('Visita · Leones');
    expect(table).toContain('Alineación');
    expect(table).toContain('Fin del 1.er tiempo');
    const gone = text(render(h(screens.Feed!), `/l/${lid}/juegos?partido=nada`, 'visit'));
    expect(gone).toContain('ya no existe');
  });

  it('tabla 3-1-0 con desempates, goleadores, tarjetas, vallas y disciplina', () => {
    const table = text(render(h(screens.Standings!), `/l/${lid}/ranking`, 'visit'));
    expect(table).toContain('Tigres');
    expect(table).toContain('GF');
    expect(table).toContain('Desempate: diferencia de goles → goles a favor');
    const disc = text(render(h(screens.Standings!), `/l/${lid}/ranking?ver=disciplina`, 'visit'));
    expect(disc).toContain('Roja directa: 1 partido');
    expect(disc).toContain('Sanciones de la temporada');
    expect(disc).toContain('Reclamo al árbitro');
  });

  it('perfil con goles por partido y el aviso de suspensión', () => {
    const profile = text(render(h(screens.MyProfile!), `/l/${lid}/perfil`, 'captain'));
    expect(profile).toContain('Capitán');
    expect(profile).toContain('Agregar jugador');
    expect(profile).toContain('#1 en goleadores');
    expect(profile).toContain('vs. Leones');
    const suspended = text(render(h(screens.Player!), `/l/${lid}/j/p4`, 'visit', '/l/:lid/j/:playerId'));
    expect(suspended).toContain('Pedro Gómez');
    expect(suspended).toContain('Suspendido para el próximo partido');
    const keeper = text(render(h(screens.Player!), `/l/${lid}/j/p5`, 'visit', '/l/:lid/j/:playerId'));
    expect(keeper).toContain('Vallas invictas');
  });

  it('admin: equipos con plantillas', () => {
    const out = text(render(h(screens.adminTabs![0].Component), `/l/${lid}/admin?tab=equipos`, 'admin'));
    expect(out).toContain('Equipos (2)');
    expect(out).toContain('Capitán: Ana Pérez');
    expect(out).toContain('Comité');
  });

  it('sala: faltas acumuladas con aviso de 10 m en vivo y las plantillas de sala', async () => {
    sport = 'futsal';
    seed();
    const home = text(render(h(screens.Home), `/l/${lid}`, 'visit'));
    // En vivo Leones es el local (lado 1): sus 5 faltas acumuladas ya avisan del tiro de 10 m.
    expect(home).toContain('Faltas: Leones 5 10 m · Tigres 0');
    expect(home).toContain("20+4'");
    const table = text(render(h(screens.Feed!), `/l/${lid}/juegos?partido=m3&mesa=1`, 'admin'));
    expect(table).toContain('T. muerto');
    expect(table).toContain('Falta');
    const out = text(render(h(screens.adminTabs![0].Component), `/l/${lid}/admin`, 'admin'));
    expect(out).toContain('Equipos');
    const { RulesAdmin, CommitteeAdmin, CalendarAdmin } = await import('./FootballAdmin');
    const { useTeamLeague } = await import('../team/useTeamLeague');
    const rules = text(render(h(() => h(RulesAdmin, { tl: useTeamLeague() })), `/l/${lid}/admin`, 'admin'));
    expect(rules).toContain('Liga de sala');
    expect(rules).toContain('En uso');
    expect(rules).toContain('Torneo relámpago (grupos + final)');
    expect(rules).toContain('Faltas acumuladas por mitad');
    expect(rules).toContain('Diferencia de goles');
    expect(rules).not.toContain('Liga de campo ida y vuelta');
    const com = text(render(h(() => h(CommitteeAdmin, { tl: useTeamLeague() })), `/l/${lid}/admin`, 'admin'));
    expect(com).toContain('Sanciones del comité (1)');
    expect(com).toContain('Luis Soto · 2 partidos');
    const cal = text(render(h(() => h(CalendarAdmin, { tl: useTeamLeague() })), `/l/${lid}/admin`, 'admin'));
    expect(cal).toContain('Torneo relámpago');
    expect(cal).toContain('Anotador: sin designar');
  });
});

describe('ventanas', () => {
  it('alineación, torneo relámpago, acta corregida y reglas con plantillas', async () => {
    const { LineupModal } = await import('./LineupModal');
    const { TournamentBuilder } = await import('../team/TournamentBuilder');
    const { ActaEditor } = await import('./ActaEditor');
    const { useTeamLeague } = await import('../team/useTeamLeague');
    const w = world();
    const Lineup = () =>
      h(LineupModal, {
        tl: useTeamLeague(),
        open: true,
        onClose: () => undefined,
        match: w.next,
        current: [
          { starters: ['p1', 'p5'], goalkeeper: 'p5' },
          { starters: [], goalkeeper: null },
        ],
        players: 11,
        reinforcements: 1,
        suspended: [{ player: 'p1', team: 'T1', reason: 'roja', fromMatchId: 'm1', remaining: 1 }],
        onSave: () => undefined,
      });
    const l = text(render(h(Lineup), `/l/${lid}`, 'admin'));
    expect(l).toContain('Alineación');
    expect(l).toContain('Suspendido');
    expect(l).toContain('Ana Pérez está suspendido');
    expect(l).toContain('Refuerzos (0 de 1)');
    const Builder = () => h(TournamentBuilder, { tl: useTeamLeague(), open: true, onClose: () => undefined, format: 'football' });
    const b = text(render(h(Builder), `/l/${lid}`, 'admin'));
    expect(b).toContain('Torneo relámpago');
    expect(b).toContain('Grupo A');
    const Editor = () => h(ActaEditor, { tl: useTeamLeague(), match: w.done, open: true, onClose: () => undefined });
    const e = text(render(h(Editor), `/l/${lid}`, 'admin'));
    expect(e).toContain('Corregir el acta');
    expect(e).toContain('Ana Pérez');
    expect(e).toContain('Roja directa');
  });
});
