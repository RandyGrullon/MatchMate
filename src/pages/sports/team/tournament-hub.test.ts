/**
 * Humo del «torneo sin liga» de los deportes de equipo (baloncesto, fútbol y sala): la pantalla del evento ya no
 * es un evento vacío. Sin equipos guía a crearlos; con equipos, a «Armar el torneo» (relámpago); con partidos, los
 * muestra por fase. Se dibuja en el servidor (renderToString) con datos en la caché.
 */
import { createElement as h, type ComponentType } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { queryClient } from '../../../lib/data/client';
import { keys } from '../../../lib/data/keys';
import { matchKeys, type Match, type MatchSide } from '../../../lib/data/matches';
import { seasonTeamKeys, type SeasonTeam } from '../../../lib/data/seasonTeams';
import { teamSportKeys } from '../../../lib/data/teamSports';
import { LeagueContext, type LeagueCtx } from '../../../lib/league';
import type { League, Member } from '../../../lib/types';
import { FeedbackProvider } from '../../../components/feedback';
import basketball from '../basketball/screens';
import { templateRules as basketballRules } from '../basketball/rules';
import { sanctionKeys } from '../football/data';
import { templateRules as footballRules } from '../football/rules';
import football from '../football/screens';
import futsal from '../futsal/screens';
import { planTournament, tournamentDrafts } from './tournament';

const lid = 'TT';
const league = (sport: string): League => ({
  id: lid,
  name: 'Relámpago del barrio',
  kind: 'torneo',
  visibility: 'public',
  ownerUid: 'u-admin',
  venue: 'Cancha techada',
  schedule: '',
  seasonStart: '',
  seasonEnd: '',
  contactName: '',
  contactPhone: '',
  requirePhoto: false,
  sport,
  tz: 'America/Santo_Domingo',
});
const members: Member[] = [{ id: `${lid}_u-admin`, leagueId: lid, uid: 'u-admin', name: 'Org', role: 'owner', playerId: null }];
const team = (id: string, name: string, order: number): SeasonTeam => ({ id, leagueId: lid, name, color: null, order, roster: [], createdAt: null, updatedAt: null });
const TEAMS = [team('T1', 'Tigres', 1), team('T2', 'Leones', 2), team('T3', 'Águilas', 3), team('T4', 'Toros', 4)];

function tournamentMatches(): Match[] {
  const plan = planTournament({ teams: TEAMS.map((t) => t.id), groups: 1, perGroup: 2, thirdPlace: false, date: '2030-10-10', start: '08:00', slotMinutes: 50, courts: ['Cancha 1'], tz: 'America/Santo_Domingo' });
  return tournamentDrafts(plan).map((d, i) => ({
    id: `m${i}`,
    leagueId: lid,
    eventId: null,
    round: d.round ?? 1,
    stage: d.stage ?? '',
    bracketKey: d.bracketKey ?? null,
    court: d.court ?? '',
    scheduledAt: d.scheduledAt ?? null,
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
    sides: d.sides.map((s) => ({ side: s.side, teamId: s.teamId ?? null, label: s.label ?? TEAMS.find((t) => t.id === s.teamId)?.name ?? 'Por definir', seed: null, players: [] })) as unknown as [MatchSide, MatchSide],
    createdAt: null,
    updatedAt: null,
  }));
}

function seed(sport: string, teams: SeasonTeam[], matches: Match[]) {
  queryClient.setQueryData(keys.players(lid), []);
  queryClient.setQueryData(keys.leagueMembers(lid), members);
  queryClient.setQueryData(seasonTeamKeys.league(lid), teams);
  queryClient.setQueryData(matchKeys.league(lid), matches);
  queryClient.setQueryData(matchKeys.event('E1'), []);
  queryClient.setQueryData(teamSportKeys.officials(lid), []);
  queryClient.setQueryData(teamSportKeys.rules(lid), sport === 'basketball' ? basketballRules('fiba') : footballRules(sport === 'futsal' ? 'sala' : 'campo', sport === 'futsal' ? 'futsal' : 'football'));
  queryClient.setQueryData(sanctionKeys.league(lid), []);
  queryClient.setQueryData(keys.event(lid, 'E1'), { id: 'E1', type: 'torneo', name: 'Copa de octubre', date: '2030-10-10', games: 0, hcpBase: 0, hcpPercent: 0, teams: {}, playerCount: 0 });
}

const ctx = (sport: string, admin: boolean): LeagueCtx => ({
  lid,
  league: league(sport),
  member: admin ? members[0] : null,
  isAdmin: admin,
  isOwner: admin,
  isScorer: false,
  canScore: admin,
  myPlayerId: null,
  base: `/l/${lid}`,
});

const render = (Event: ComponentType, sport: string, admin = true) =>
  renderToString(
    h(
      MemoryRouter,
      { initialEntries: [`/l/${lid}/e/E1?tab=inscritos`] },
      h(FeedbackProvider, null, h(LeagueContext.Provider, { value: ctx(sport, admin) }, h(Routes, null, h(Route, { path: '/l/:lid/e/:eventId', element: h(Event) })))),
    ),
  );
const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

afterEach(() => queryClient.invalidateAll());

describe.each([
  ['basketball', basketball.Event],
  ['football', football.Event],
  ['futsal', futsal.Event],
] as const)('torneo sin liga de %s', (sport, Event) => {
  it('sin equipos: guía a crear los equipos (ahí mismo) y después a armar el relámpago', () => {
    seed(sport, [], []);
    const t = text(render(Event, sport));
    expect(t).toContain('Copa de octubre');
    expect(t).toContain('Torneo relámpago');
    expect(t).toContain('Los equipos');
    // Los equipos se crean en su hoja, ahí mismo (el único botón mientras no hay 2).
    expect(t).toContain('Crear los equipos');
    expect(t).toContain('Arma el torneo');
    expect(t).not.toContain('Sin partidos en este evento');
    expect(t).not.toContain('todos contra todos, de ida');
  });

  it('con equipos: «Armar el torneo»; quien no es admin ve que todavía no está armado', () => {
    seed(sport, TEAMS, []);
    const t = text(render(Event, sport));
    expect(t).toContain('4 equipos listos');
    expect(t).toContain('Armar el torneo');
    const visit = text(render(Event, sport, false));
    expect(visit).toContain('El torneo todavía no está armado');
    expect(visit).toContain('Equipos 4');
    expect(visit).not.toContain('Armar el torneo');
  });

  it('armado: los partidos por fase (grupo y final) y los equipos', () => {
    seed(sport, TEAMS, tournamentMatches());
    const t = text(render(Event, sport));
    expect(t).not.toContain('Arma el torneo');
    expect(t).toContain('Grupo A');
    expect(t).toContain('Final');
    expect(t.indexOf('Grupo A')).toBeLessThan(t.lastIndexOf('Final'));
    expect(t).toContain('Equipos 4');
    // Abierto como evento: «•••» con el reporte y los anotadores (el admin).
    expect(render(Event, sport)).toContain('aria-label="Más opciones"');
    expect(t).toContain('Tigres');
  });
});

describe('una jornada de una liga (no torneo)', () => {
  it('sin partidos sigue llevando al Calendario', () => {
    seed('basketball', TEAMS, []);
    const html = renderToString(
      h(
        MemoryRouter,
        { initialEntries: [`/l/${lid}/e/E1`] },
        h(
          FeedbackProvider,
          null,
          h(LeagueContext.Provider, { value: { ...ctx('basketball', true), league: { ...league('basketball'), kind: 'liga' } } }, h(Routes, null, h(Route, { path: '/l/:lid/e/:eventId', element: h(basketball.Event) }))),
        ),
      ),
    );
    expect(text(html)).toContain('Sin partidos en este evento');
  });
});
