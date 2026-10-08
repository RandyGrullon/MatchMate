/**
 * La capa de datos de esports sin base (backend de mentira): las filas y lo que devuelven las RPC → la app, el lote del
 * cuadro (`createStage`: ids por llave y enlaces), los resultados por llave para el motor, los argumentos de cada RPC y
 * los textos de error (§9.13).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendError, setBackendForTests } from '../backend';
import { createFakeBackend, type FakeBackend } from '../db/fakeBackend';
import { isUuid } from '../db/ids';
import { defaultSettings, doubleEliminationPlan, type StagePlan } from '../../sports/esports';
import { queryClient } from './client';
import {
  addMatchProof,
  createEsportsLeague,
  createEsportsTournament,
  createStage,
  createTeam,
  deleteBrGame,
  entriesBySideTeam,
  esportsErrorText,
  esportsKeys,
  esportsTags,
  fetchBrGames,
  fetchEntries,
  fetchTeam,
  formTeams,
  handleEsportsMessage,
  joinTeam,
  keyResults,
  previewTeamCode,
  registerSolo,
  registerTeam,
  removeTeamLogo,
  saveBrGame,
  seriesInput,
  setSeeds,
  stageMatchesArg,
  syncBracket,
  teamJoinUrl,
  teamShareText,
  toBrGame,
  toEntry,
  toHubData,
  toLink,
  toMyEntries,
  toTeam,
  toTeamMember,
  toTeamPreview,
  toTournament,
  tournamentPatchArg,
  tournamentSettings,
  updateEntry,
  updateTeam,
  uploadTeamLogo,
  type StageLink,
  type TournamentInput,
} from './esports';
import type { Match, MatchScore, MatchSide } from './matches';

vi.mock('../image', async (orig) => ({
  ...(await orig<typeof import('../image')>()),
  // Sin navegador no hay createImageBitmap: la captura «comprimida» es una imagen chica de mentira.
  compressImage: async () => ({
    data: 'data:image/webp;base64,UklGRgwAAABXRUJQVlA4IAAAAAA=',
    blob: new Blob([new Uint8Array(20)], { type: 'image/webp' }),
    contentType: 'image/webp' as const,
    bytes: 20,
    width: 800,
    height: 600,
    scan: '',
  }),
}));

const LID = '01900000-0000-7000-8000-00000000000a';
const EID = '01900000-0000-7000-8000-00000000000e';

let fake: FakeBackend;
beforeEach(() => {
  fake = createFakeBackend();
  setBackendForTests(fake);
});
afterEach(() => {
  setBackendForTests(null);
  vi.restoreAllMocks();
});

const call = (fn: string) => fake.calls.find((c) => c.fn === fn)?.args;

describe('filas → app', () => {
  it('equipo y miembros', () => {
    expect(
      toTeam({
        id: 't1',
        game: 'valorant',
        name: 'Los Tigres',
        tag: 'TGR',
        description: null,
        logo_path: null,
        captain_id: 'u1',
        member_count: 3,
        created_at: '2026-10-01T10:00:00Z',
        updated_at: '2026-10-02T10:00:00Z',
      }),
    ).toEqual({
      id: 't1',
      game: 'valorant',
      name: 'Los Tigres',
      tag: 'TGR',
      description: '',
      logoPath: null,
      captainId: 'u1',
      memberCount: 3,
      createdAt: '2026-10-01T10:00:00Z',
      updatedAt: '2026-10-02T10:00:00Z',
    });
    expect(toTeamMember({ team_id: 't1', user_id: 'u2', role: 'raro', display_name: null, joined_at: '2026-10-01T10:00:00Z' })).toEqual({
      teamId: 't1',
      userId: 'u2',
      role: 'member',
      displayName: '',
      joinedAt: '2026-10-01T10:00:00Z',
    });
  });

  it('torneo: el nombre y el aviso del evento; los ajustes con los del juego debajo', () => {
    const t = toTournament(
      {
        event_id: EID,
        league_id: LID,
        game: 'valorant',
        mode: '5v5',
        entry_type: 'teams',
        format: 'double_elim',
        status: 'registration',
        starts_at: '2026-10-20T23:00:00Z',
        registration_opens_at: null,
        registration_closes_at: '2026-10-20T22:00:00Z',
        checkin_minutes: 30,
        max_entries: 8,
        settings: { thirdPlace: true },
        prize_text: 'RD$5,000',
        updated_at: '2026-10-08T10:00:00Z',
      },
      { id: EID, name: 'Copa Radiante', announcement: 'Mapas del pool actual.' },
    );
    expect(t).toMatchObject({
      eventId: EID,
      leagueId: LID,
      name: 'Copa Radiante',
      announcement: 'Mapas del pool actual.',
      game: 'valorant',
      mode: '5v5',
      entryType: 'teams',
      format: 'double_elim',
      status: 'registration',
      startsAt: '2026-10-20T23:00:00Z',
      registrationOpensAt: null,
      registrationClosesAt: '2026-10-20T22:00:00Z',
      checkinMinutes: 30,
      maxEntries: 8,
      prizeText: 'RD$5,000',
      updatedAt: '2026-10-08T10:00:00Z',
    });
    expect(t.settings).toEqual({ ...defaultSettings('valorant', '5v5', 'double_elim'), thirdPlace: true });
    // Sin evento (no se pudo leer): nombre y aviso vacíos.
    const br = toTournament({
      event_id: EID,
      league_id: LID,
      game: 'fortnite',
      mode: 'duo',
      entry_type: 'open',
      format: 'br',
      status: 'live',
      starts_at: '2026-10-20T23:00:00Z',
      registration_opens_at: null,
      registration_closes_at: '2026-10-20T23:00:00Z',
      checkin_minutes: null,
      max_entries: 50,
      settings: null,
      prize_text: null,
    });
    expect(br).toMatchObject({ name: '', announcement: '', prizeText: '', status: 'live' });
    expect(br.settings).toEqual(defaultSettings('fortnite', 'duo', 'br'));
  });

  it('ajustes: pedir ID confirmado o rango verificado solo cuenta donde el juego los comprueba', () => {
    const on = { requireConfirmedId: true, requireVerifiedRank: true };
    expect(tournamentSettings(on, 'lol', '5v5', 'single_elim')).toMatchObject(on);
    expect(tournamentSettings(on, 'cs2', '5v5', 'single_elim')).toMatchObject({ requireConfirmedId: true, requireVerifiedRank: false });
    expect(tournamentSettings(on, 'mlbb', '5v5', 'single_elim')).toMatchObject({ requireConfirmedId: false, requireVerifiedRank: false });
    // Lo de antes (sin las claves): apagados.
    expect(tournamentSettings({}, 'valorant', '5v5', 'single_elim')).toMatchObject({ requireConfirmedId: false, requireVerifiedRank: false });
    // Un juego que esta versión no conoce: tal cual.
    expect(tournamentSettings(on, 'tetris' as never, '5v5', 'single_elim')).toEqual(on);
  });

  it('inscrito con su plantilla (solo la suya, el capitán primero, después titulares y suplentes)', () => {
    const member = (entry: string, user: string, role: string, name: string) => ({
      entry_id: entry,
      user_id: user,
      role,
      display_name: name,
      gamer_tag: `${name}#LAN`,
      ranks: { main: { tier: 'gold', div: 2 } },
      rank_source: 'verificado',
      player_id: null,
    });
    const e = toEntry(
      {
        id: 'e1',
        league_id: LID,
        event_id: EID,
        kind: 'team',
        team_id: 't1',
        name: 'Los Tigres',
        tag: 'TGR',
        captain_id: 'u1',
        status: 'approved',
        seed: 2,
        checked_in_at: null,
        note: null,
        side_team_id: 'st1',
        assigned_entry: null,
        created_at: '2026-10-08T10:00:00Z',
      },
      [member('e1', 'u3', 'sub', 'Zoe'), member('e2', 'u9', 'captain', 'Otro'), member('e1', 'u2', 'member', 'Bea'), member('e1', 'u1', 'captain', 'Ana')],
    );
    expect(e).toMatchObject({ id: 'e1', kind: 'team', status: 'approved', seed: 2, sideTeamId: 'st1', tag: 'TGR' });
    expect(e.members.map((m) => [m.userId, m.role])).toEqual([
      ['u1', 'captain'],
      ['u2', 'member'],
      ['u3', 'sub'],
    ]);
    expect(e.members[0]).toEqual({ userId: 'u1', role: 'captain', displayName: 'Ana', gamerTag: 'Ana#LAN', ranks: { main: { tier: 'gold', div: 2 } }, rankSource: 'verificado', playerId: null });
  });

  it('enlaces del cuadro y partidas de battle royale', () => {
    expect(
      toLink({ match_id: 'm1', stage: 'bracket', part: 'W', group_no: null, best_of: 3, winner_to: 'm3', winner_side: 1, loser_to: 'm4', loser_side: 2 }),
    ).toEqual({ matchId: 'm1', stage: 'bracket', part: 'W', groupNo: null, bestOf: 3, winnerTo: 'm3', winnerSide: 1, loserTo: 'm4', loserSide: 2 });
    expect(toLink({ match_id: 'm2', stage: 'x', part: 'GF2', group_no: 0, best_of: 4, winner_to: null, winner_side: null, loser_to: null, loser_side: null })).toMatchObject({
      stage: 'bracket',
      part: 'GF2',
      groupNo: 0,
      bestOf: 1,
    });
    const g = toBrGame(
      { id: 'g1', event_id: EID, round: 1, game_no: 2, map: null, status: 'finished', scheduled_at: null, proof: '{p1,p2}' },
      [
        { game_id: 'g1', entry_id: 'b', placement: null, kills: 0 },
        { game_id: 'g1', entry_id: 'a', placement: 1, kills: 3 },
        { game_id: 'g2', entry_id: 'z', placement: 2, kills: 1 },
      ],
    );
    expect(g).toEqual({
      id: 'g1',
      eventId: EID,
      round: 1,
      gameNo: 2,
      map: '',
      status: 'finished',
      scheduledAt: null,
      proof: ['p1', 'p2'],
      results: [
        { entryId: 'a', placement: 1, kills: 3 },
        { entryId: 'b', placement: null, kills: 0 },
      ],
    });
    expect(toBrGame({ id: 'g3', event_id: EID, round: 2, game_no: 1, map: 'Bermuda', status: 'void', scheduled_at: null, proof: ['p9'] }).proof).toEqual(['p9']);
  });

  it('lo que devuelven esports_hub, esports_my_entries y esports_team_preview', () => {
    const hub = toHubData(
      {
        tournaments: [
          {
            eventId: EID,
            leagueId: LID,
            name: 'Copa',
            leagueName: 'Copa',
            visibility: 'private',
            logoPath: null,
            mode: '5v5',
            entryType: 'open',
            format: 'single_elim',
            status: 'registration',
            startsAt: '2026-10-20T23:00:00Z',
            registrationOpensAt: null,
            registrationClosesAt: '2026-10-20T22:00:00Z',
            checkinMinutes: null,
            maxEntries: 16,
            approved: 3,
            pending: 1,
            prizeText: '',
          },
          'basura',
        ],
        teams: [{ id: 't1', name: 'Los Tigres', tag: 'TGR', logoPath: null, memberCount: 5 }],
      },
      'valorant',
    );
    expect(hub.tournaments).toHaveLength(1);
    expect(hub.tournaments[0]).toMatchObject({ game: 'valorant', visibility: 'private', approved: 3, pending: 1, maxEntries: 16, entryType: 'open' });
    expect(hub.teams).toEqual([{ id: 't1', name: 'Los Tigres', tag: 'TGR', logoPath: null, memberCount: 5 }]);
    expect(toHubData(null, 'cs2')).toEqual({ tournaments: [], teams: [] });

    const mine = toMyEntries([
      { entryId: 'e2', eventId: 'v2', leagueId: 'l2', tournament: 'B', game: 'cs2', mode: '5v5', entryStatus: 'approved', tournamentStatus: 'live', startsAt: '2026-10-22T00:00:00Z', entryName: 'X', role: 'member', kind: 'team' },
      { entryId: 'e1', eventId: 'v1', leagueId: 'l1', tournament: 'A', game: 'sf6', mode: '1v1', entryStatus: 'pending', tournamentStatus: 'registration', startsAt: '2026-10-21T00:00:00Z', entryName: 'Ana', role: 'captain', kind: 'player' },
      { entryId: '' },
    ]);
    expect(mine.map((e) => e.entryId)).toEqual(['e1', 'e2']);
    expect(mine[0]).toMatchObject({ game: 'sf6', kind: 'player', role: 'captain', entryStatus: 'pending', tournamentStatus: 'registration' });

    expect(toTeamPreview([{ team_id: 't1', game: 'rocket_league', name: 'Turbo', tag: 'TRB', logo_path: null, member_count: 2 }])).toEqual({
      teamId: 't1',
      game: 'rocket_league',
      name: 'Turbo',
      tag: 'TRB',
      logoPath: null,
      memberCount: 2,
    });
    expect(toTeamPreview([])).toBeNull();
    expect(toTeamPreview(null)).toBeNull();
  });
});

describe('lecturas (backend de mentira)', () => {
  it('inscritos del torneo con sus miembros; partidas con sus resultados por ronda y número', async () => {
    const tables: Record<string, unknown[]> = {
      esports_entries: [
        { id: 'e2', league_id: LID, event_id: EID, kind: 'team', team_id: null, name: 'B', tag: '', captain_id: null, status: 'approved', seed: null, checked_in_at: null, note: null, side_team_id: null, assigned_entry: null, created_at: '2026-10-08T11:00:00Z' },
        { id: 'e1', league_id: LID, event_id: EID, kind: 'team', team_id: null, name: 'A', tag: '', captain_id: null, status: 'approved', seed: 1, checked_in_at: null, note: null, side_team_id: null, assigned_entry: null, created_at: '2026-10-08T12:00:00Z' },
      ],
      esports_entry_members: [{ entry_id: 'e2', user_id: 'u2', role: 'captain', display_name: 'Bea', gamer_tag: 'Bea#1', ranks: {}, rank_source: null, player_id: null }],
      esports_br_games: [
        { id: 'g2', event_id: EID, round: 1, game_no: 2, map: '', status: 'finished', scheduled_at: null, proof: [] },
        { id: 'g1', event_id: EID, round: 1, game_no: 1, map: '', status: 'finished', scheduled_at: null, proof: [] },
      ],
      esports_br_results: [{ game_id: 'g1', entry_id: 'e1', placement: 1, kills: 4 }],
    };
    const queries: string[] = [];
    fake.select = (async (q: { table: string }) => {
      queries.push(q.table);
      return tables[q.table] ?? [];
    }) as FakeBackend['select'];
    const entries = await fetchEntries(EID);
    // Siembra primero (e1), sin siembra al final.
    expect(entries.map((e) => [e.id, e.members.length])).toEqual([
      ['e1', 0],
      ['e2', 1],
    ]);
    const games = await fetchBrGames(EID);
    expect(games.map((g) => [g.id, g.results.length])).toEqual([
      ['g1', 1],
      ['g2', 0],
    ]);
    // Sin cuenta: el equipo sin la lista de miembros (la RLS no la deja leer).
    tables.esports_teams = [{ id: 't1', game: 'lol', name: 'Nexo', tag: 'NXO', description: '', logo_path: null, captain_id: 'u1', member_count: 5 }];
    queries.length = 0;
    expect(await fetchTeam('t1')).toMatchObject({ team: { id: 't1', game: 'lol', name: 'Nexo' }, members: [] });
    expect(queries).toEqual(['esports_teams']);
    tables.esports_teams = [];
    expect(await fetchTeam('t9')).toBeNull();
  });

  it('claves y etiquetas', () => {
    expect(esportsKeys.hub('valorant')).toBe('esports:hub:valorant');
    expect(esportsKeys.entries('E')).not.toBe(esportsKeys.myEntries('E'));
    expect(esportsTags.all).toBe('esports');
    expect(esportsTags.mine).toBe('esports:mine');
    expect(new Set([esportsTags.team('x'), esportsTags.event('x'), esportsTags.league('x')]).size).toBe(3);
  });

  it("tiempo real: 'esports' en event:<id> invalida el torneo (y mis inscripciones si cambian los inscritos)", () => {
    const spy = vi.spyOn(queryClient, 'invalidate');
    handleEsportsMessage(`event:${EID}`, { event: 'esports', payload: { table: 'links', op: 'UPDATE', ids: ['m1'] } });
    expect(spy.mock.calls.map((c) => c[0])).toEqual([esportsTags.event(EID)]);
    spy.mockClear();
    handleEsportsMessage(`event:${EID}`, { event: 'esports', payload: { table: 'entries', op: 'INSERT', ids: ['e1'] } });
    expect(spy.mock.calls.map((c) => c[0])).toEqual([esportsTags.event(EID), esportsTags.mine]);
    spy.mockClear();
    handleEsportsMessage(`league:${LID}`, { event: 'esports', payload: { table: 'tournament' } });
    expect(spy.mock.calls.map((c) => c[0])).toEqual([esportsTags.league(LID), esportsTags.mine]);
    spy.mockClear();
    handleEsportsMessage(`event:${EID}`, { event: 'match', payload: {} });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('el cuadro: del plan del motor al lote de esports_create_stage', () => {
  const plan: StagePlan = {
    kind: 'bracket',
    matches: [
      {
        key: 'W1-1',
        part: 'W',
        round: 1,
        index: 0,
        group: null,
        stage: 'Ganadores · Semifinal',
        bestOf: 3,
        sides: [
          { kind: 'entry', entryId: 'e1' },
          { kind: 'entry', entryId: 'e4' },
        ],
        labels: ['', ''],
        winnerTo: { key: 'W2-1', side: 1 },
        loserTo: { key: 'L1-1', side: 1 },
      },
      {
        key: 'W2-1',
        part: 'W',
        round: 2,
        index: 0,
        group: null,
        stage: 'Final de ganadores',
        bestOf: 3,
        sides: [
          { kind: 'winner', key: 'W1-1' },
          { kind: 'entry', entryId: 'e2' },
        ],
        labels: ['Ganador W1-1', ''],
        winnerTo: null,
        loserTo: null,
      },
      {
        key: 'L1-1',
        part: 'L',
        round: 1,
        index: 0,
        group: null,
        stage: 'Final de perdedores',
        bestOf: 3,
        sides: [
          { kind: 'loser', key: 'W1-1' },
          { kind: 'reset', side: 2 },
        ],
        labels: ['Perdedor W1-1', ''],
        winnerTo: null,
        loserTo: null,
      },
    ],
  };

  it('un id por llave; inscritos como entry_id y los enlaces como {id, side}', () => {
    let n = 0;
    const out = stageMatchesArg(plan, { newId: () => `id-${++n}`, scheduledAt: { 'W2-1': '2026-10-20T23:00:00Z' } });
    expect(out).toEqual([
      {
        id: 'id-1',
        key: 'W1-1',
        part: 'W',
        round: 1,
        group_no: null,
        stage: 'Ganadores · Semifinal',
        best_of: 3,
        scheduled_at: null,
        sides: [
          { side: 1, entry_id: 'e1', label: '' },
          { side: 2, entry_id: 'e4', label: '' },
        ],
        winner_to: { id: 'id-2', side: 1 },
        loser_to: { id: 'id-3', side: 1 },
      },
      expect.objectContaining({
        id: 'id-2',
        key: 'W2-1',
        scheduled_at: '2026-10-20T23:00:00Z',
        sides: [
          { side: 1, entry_id: null, label: 'Ganador W1-1' },
          { side: 2, entry_id: 'e2', label: '' },
        ],
        winner_to: null,
        loser_to: null,
      }),
      // Sin texto: «Por definir».
      expect.objectContaining({ id: 'id-3', sides: [{ side: 1, entry_id: null, label: 'Perdedor W1-1' }, { side: 2, entry_id: null, label: 'Por definir' }] }),
    ]);
    // Un enlace a una llave que no está en el plan es un error del plan.
    const broken: StagePlan = { kind: 'bracket', matches: [{ ...plan.matches[0], winnerTo: { key: 'W9-9', side: 1 } }] };
    expect(() => stageMatchesArg(broken)).toThrow(BackendError);
  });

  it('con un cuadro de doble eliminación de verdad: ids nuevos (uuid) y todo enlace apunta a un partido del lote', () => {
    const real = doubleEliminationPlan(['a', 'b', 'c', 'd', 'e', 'f'], { bracketReset: true, bestOf: 3, finalBestOf: 5 });
    const out = stageMatchesArg(real);
    expect(out).toHaveLength(real.matches.length);
    const ids = new Set(out.map((m) => m.id as string));
    expect(ids.size).toBe(out.length);
    for (const id of ids) expect(isUuid(id)).toBe(true);
    for (const m of out) {
      for (const l of [m.winner_to, m.loser_to] as ({ id: string } | null)[]) if (l) expect(ids.has(l.id)).toBe(true);
    }
    // Los 6 inscritos salen como entry_id (ninguno se pierde ni se repite fuera de la ronda 1 y los byes).
    const entries = out.flatMap((m) => (m.sides as { entry_id: string | null }[]).map((s) => s.entry_id)).filter(Boolean);
    expect(new Set(entries)).toEqual(new Set(['a', 'b', 'c', 'd', 'e', 'f']));
  });

  it('createStage llama a esports_create_stage con la fase y devuelve los ids', async () => {
    fake.onRpc = (fn, args) => (fn === 'esports_create_stage' ? (args.p_matches as { id: string }[]).map((m) => m.id) : null);
    const ids = await createStage(LID, EID, plan);
    const args = call('esports_create_stage')!;
    expect(args).toMatchObject({ p_event: EID, p_stage: 'bracket' });
    expect((args.p_matches as unknown[]).length).toBe(3);
    expect(ids).toEqual((args.p_matches as { id: string }[]).map((m) => m.id));
    expect(await createStage(LID, EID, { kind: 'league', matches: [] })).toEqual([]);
    fake.onRpc = () => 2;
    expect(await syncBracket(EID)).toBe(2);
    expect(call('esports_sync')).toEqual({ p_event: EID });
    // Quien mira un torneo público sin ser de la liga: la base dice «no_permitido» y no es un error para él.
    fake.onRpc = () => {
      throw new BackendError('no_permitido', 'permission', 'no_permitido');
    };
    expect(await syncBracket(EID)).toBe(0);
    fake.onRpc = () => {
      throw new BackendError('Sin conexión', 'network');
    };
    await expect(syncBracket(EID)).rejects.toThrow('Sin conexión');
  });
});

describe('de los partidos al motor', () => {
  const side = (n: 1 | 2, teamId: string | null): MatchSide => ({ side: n, teamId, label: teamId ?? 'Por definir', seed: null, players: [] });
  const match = (patch: Partial<Match>): Match =>
    ({
      id: 'm',
      leagueId: LID,
      eventId: EID,
      round: 1,
      stage: '',
      bracketKey: null,
      court: '',
      scheduledAt: null,
      status: 'scheduled',
      format: 'valorant',
      requireConfirm: true,
      score: null,
      winner: null,
      walkoverSide: null,
      scorerId: null,
      leaseUntil: null,
      seq: 0,
      version: 1,
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
      sides: [side(1, 'st1'), side(2, 'st2')],
      createdAt: null,
      updatedAt: null,
      ...patch,
    }) as Match;
  const bySide = entriesBySideTeam([
    { id: 'e1', sideTeamId: 'st1' },
    { id: 'e2', sideTeamId: 'st2' },
    { id: 'e3', sideTeamId: null },
  ]);
  const NOW = Date.parse('2026-10-10T12:00:00Z');
  const score: MatchScore = { text: '2-1', sides: [2, 1], totals: { maps: [2, 1], points: [33, 31] }, games: [{ a: 13, b: 9 }, { a: 7, b: 13 }, { a: 13, b: 9 }], bestOf: 3 };

  it('seriesInput: los lados como inscritos, el ganador (también por W.O.) y el marcador', () => {
    expect(bySide).toEqual(
      new Map([
        ['st1', 'e1'],
        ['st2', 'e2'],
      ]),
    );
    const done = seriesInput(match({ id: 'm1', status: 'confirmed', winner: 1, score }), bySide);
    expect(done).toMatchObject({ id: 'm1', side1: 'e1', side2: 'e2', winner: 1, walkover: null });
    expect(done?.score?.sides).toEqual([2, 1]);
    expect(seriesInput(match({ status: 'walkover', walkoverSide: 2, score: null }), bySide)).toMatchObject({ winner: 1, walkover: 2, score: null });
    expect(seriesInput(match({ status: 'walkover', walkoverSide: 0 }), bySide)).toMatchObject({ winner: null, walkover: 0 });
    // Sin resultado, o con un lado que todavía no es un inscrito: nada.
    expect(seriesInput(match({ status: 'scheduled' }), bySide)).toBeNull();
    expect(seriesInput(match({ status: 'confirmed', winner: 1, sides: [side(1, 'st1'), side(2, null)] }), bySide)).toBeNull();
  });

  it('keyResults: solo los finales del cuadro, por llave; empate o W.O. de los dos sin ganador', () => {
    const links = ['w11', 'w12', 'w21', 'l11', 'g11', 'gf'].map((id): StageLink => ({ matchId: id, stage: 'bracket', part: 'W', groupNo: null, bestOf: 3, winnerTo: null, winnerSide: null, loserTo: null, loserSide: null }));
    const matches = [
      match({ id: 'w11', bracketKey: 'W1-1', status: 'confirmed', winner: 2, score }),
      match({ id: 'w12', bracketKey: 'W1-2', status: 'walkover', walkoverSide: 1 }),
      // Propuesto hace 49 h: ya cuenta; hace 1 h, todavía no.
      match({ id: 'w21', bracketKey: 'W2-1', status: 'finished', winner: 1, proposedAt: '2026-10-08T11:00:00Z' }),
      match({ id: 'l11', bracketKey: 'L1-1', status: 'finished', winner: 1, proposedAt: '2026-10-10T11:00:00Z' }),
      match({ id: 'g11', bracketKey: 'G1-R1-1', status: 'confirmed', winner: null }),
      match({ id: 'gf', bracketKey: 'GF', status: 'disputed', winner: 1 }),
      // Fuera del cuadro de este evento, o sin llave.
      match({ id: 'otro', bracketKey: 'W1-3', status: 'confirmed', winner: 1 }),
      match({ id: 'w31', bracketKey: null, status: 'confirmed', winner: 1 }),
    ];
    expect(keyResults(matches, links, bySide, NOW)).toEqual({
      'W1-1': { winner: 'e2', loser: 'e1' },
      'W1-2': { winner: 'e2', loser: 'e1' },
      'W2-1': { winner: 'e1', loser: 'e2' },
      'G1-R1-1': { winner: null, loser: null },
    });
  });
});

describe('escrituras (lo que se le manda a cada RPC)', () => {
  it('equipos: crear, cambiar, unirse con el código y ver a dónde lleva', async () => {
    fake.onRpc = (fn, args) => {
      if (fn === 'esports_create_team') return { teamId: args.p_id, inviteCode: 'ABCD2345' };
      if (fn === 'esports_join_team') return args.p_code === 'ABCD2345' ? { teamId: 't1' } : null;
      if (fn === 'esports_team_preview') return [{ team_id: 't1', game: 'valorant', name: 'Los Tigres', tag: 'TGR', logo_path: null, member_count: 3 }];
      return null;
    };
    const made = await createTeam({ game: 'valorant', name: '  Los Tigres ', tag: 'tgr', description: ' Del barrio ' });
    expect(call('esports_create_team')).toMatchObject({ p_game: 'valorant', p_name: 'Los Tigres', p_tag: 'TGR', p_description: 'Del barrio' });
    expect(isUuid(call('esports_create_team')!.p_id)).toBe(true);
    expect(made).toEqual({ teamId: call('esports_create_team')!.p_id, inviteCode: 'ABCD2345' });

    await updateTeam('t1', { tag: ' x1 ', description: '' });
    expect(call('esports_update_team')).toEqual({ p_team: 't1', p_patch: { tag: 'X1', description: '' } });

    expect(await joinTeam(' abcd-2345 ')).toEqual({ teamId: 't1' });
    expect(call('esports_join_team')).toEqual({ p_code: 'ABCD2345' });
    expect(await joinTeam('MALO1234')).toBeNull();
    expect(await joinTeam('   ')).toBeNull();
    expect(await previewTeamCode('abcd 2345')).toMatchObject({ teamId: 't1', name: 'Los Tigres', memberCount: 3 });
    expect(call('esports_team_preview')).toEqual({ p_code: 'ABCD2345' });
  });

  it('logo del equipo: reserva la ruta en su carpeta, sube, lo pone y borra el anterior', async () => {
    const team = '01900000-0000-7000-8000-0000000000aa';
    const uploads: string[] = [];
    const removed: string[][] = [];
    fake.storage.upload = async (bucket, path) => void uploads.push(`${bucket}:${path}`);
    fake.storage.remove = async (_bucket, paths) => void removed.push(paths);
    fake.onRpc = (fn) => (fn === 'esports_set_team_logo' ? `${team}/viejo.webp` : null);
    const path = await uploadTeamLogo(team, { blob: new Blob([new Uint8Array(100)], { type: 'image/webp' }), contentType: 'image/webp' } as never);
    expect(path).toMatch(new RegExp(`^${team}/[0-9a-f-]{36}\\.webp$`));
    expect(call('esports_begin_team_logo')).toEqual({ p_team: team, p_path: path });
    expect(uploads).toEqual([`logos:${path}`]);
    expect(call('esports_set_team_logo')).toEqual({ p_team: team, p_path: path });
    expect(removed).toEqual([[`${team}/viejo.webp`]]);
    await removeTeamLogo(team);
    expect(fake.calls.at(-1)).toEqual({ fn: 'esports_set_team_logo', args: { p_team: team, p_path: null } });
    // Muy grande: no se sube.
    await expect(uploadTeamLogo(team, { blob: new Blob([new Uint8Array(300_000)], { type: 'image/webp' }), contentType: 'image/webp' } as never)).rejects.toMatchObject({
      code: 'imagen',
    });
  });

  it('torneos: suelto (con su liga nueva) o dentro de una liga; liga de esports; cambios con los nombres de la base', async () => {
    fake.onRpc = (fn, args) => (fn === 'esports_create_tournament' ? { leagueId: args.p_league ?? args.p_id, eventId: args.p_event_id, inviteCode: null } : null);
    const input: TournamentInput = {
      game: 'rocket_league',
      name: ' Copa Turbo ',
      mode: '3v3',
      entryType: 'open',
      format: 'double_elim',
      startsAt: '2026-10-20T23:00:00.000Z',
      maxEntries: 8,
      settings: defaultSettings('rocket_league', '3v3', 'double_elim'),
      visibility: 'public',
      checkinMinutes: 30,
      prizeText: ' Trofeo ',
    };
    const made = await createEsportsTournament(input);
    const args = call('esports_create_tournament')!;
    expect(args).toMatchObject({
      p_game: 'rocket_league',
      p_name: 'Copa Turbo',
      p_mode: '3v3',
      p_entry_type: 'open',
      p_format: 'double_elim',
      p_starts_at: '2026-10-20T23:00:00.000Z',
      p_max_entries: 8,
      p_visibility: 'public',
      p_registration_opens_at: null,
      p_registration_closes_at: null,
      p_checkin_minutes: 30,
      p_prize_text: 'Trofeo',
      p_venue: '',
    });
    expect(args).not.toHaveProperty('p_league');
    expect(isUuid(args.p_id)).toBe(true);
    expect(made).toEqual({ leagueId: args.p_id, eventId: args.p_event_id, inviteCode: null });

    fake.calls = [];
    const inLeague = await createEsportsTournament(input, LID);
    expect(call('esports_create_tournament')).toMatchObject({ p_league: LID });
    expect(call('esports_create_tournament')).not.toHaveProperty('p_id');
    expect(inLeague.leagueId).toBe(LID);

    fake.onRpc = () => null;
    const lid = await createEsportsLeague({ game: 'cs2', name: ' Liga CS ', visibility: 'private' });
    expect(call('create_league')).toEqual({ p_name: 'Liga CS', p_visibility: 'private', p_kind: 'liga', p_sport: 'esports', p_venue: '', p_rules: { game: 'cs2' }, p_id: lid });

    expect(tournamentPatchArg({ name: ' Nuevo ', startsAt: 'X', checkinMinutes: null, maxEntries: 16, entryType: 'teams' })).toEqual({
      name: 'Nuevo',
      starts_at: 'X',
      checkin_minutes: null,
      max_entries: 16,
      entry_type: 'teams',
    });
  });

  it('el tope de torneos nuevos sale en palabras', async () => {
    fake.onRpc = () => {
      throw new BackendError('rate_limited', 'rate_limited', 'P0001');
    };
    const err = await createEsportsTournament({
      game: 'valorant',
      name: 'X',
      mode: '5v5',
      entryType: 'teams',
      format: 'single_elim',
      startsAt: '2026-10-20T23:00:00Z',
      maxEntries: 8,
      settings: defaultSettings('valorant', '5v5', 'single_elim'),
      visibility: 'public',
    }).catch((e: unknown) => e);
    expect(esportsErrorText(err)).toMatch(/Llegaste al tope de 5 ligas y torneos nuevos por día/);
  });

  it('inscripciones, siembra, equipos de agentes libres y battle royale', async () => {
    fake.onRpc = (fn, args) => (fn === 'esports_form_teams' ? ['n1'] : fn === 'esports_br_save_game' ? (args.p_game as { id: string }).id : 'e1');
    expect(await registerTeam(EID, 't1', [{ userId: 'u2', role: 'member' }, { userId: 'u3', role: 'sub' }])).toBe('e1');
    expect(call('esports_register_team')).toEqual({
      p_event: EID,
      p_team: 't1',
      p_members: [
        { user_id: 'u2', role: 'member' },
        { user_id: 'u3', role: 'sub' },
      ],
    });
    await registerSolo(EID);
    expect(call('esports_register_solo')).toEqual({ p_event: EID });
    await updateEntry('e1', { tag: 'abc', seed: null, note: '  ok ' });
    expect(call('esports_update_entry')).toEqual({ p_entry: 'e1', p_patch: { tag: 'ABC', seed: null, note: 'ok' } });
    await setSeeds(EID, ['e2', 'e1']);
    expect(call('esports_set_seeds')).toEqual({ p_event: EID, p_order: ['e2', 'e1'] });
    expect(await formTeams(EID, [{ name: ' Equipo 1 ', tag: '', members: [{ userId: 'u4', role: 'captain' }] }])).toEqual(['n1']);
    expect(call('esports_form_teams')).toEqual({ p_event: EID, p_teams: [{ name: 'Equipo 1', members: [{ user_id: 'u4', role: 'captain' }] }] });

    const id = await saveBrGame(EID, { round: 1, gameNo: 3, map: ' Bermuda ', results: [{ entryId: 'e1', placement: 1, kills: 5 }, { entryId: 'e2', placement: null, kills: 0 }] });
    expect(isUuid(id)).toBe(true);
    expect(call('esports_br_save_game')).toEqual({
      p_event: EID,
      p_game: {
        id,
        round: 1,
        game_no: 3,
        map: 'Bermuda',
        results: [
          { entry_id: 'e1', placement: 1, kills: 5 },
          { entry_id: 'e2', placement: null, kills: 0 },
        ],
      },
    });
    await deleteBrGame(EID, id);
    expect(call('esports_br_delete_game')).toEqual({ p_game: id });
  });

  it('captura del partido: sube a scoreboards en la carpeta de la liga y la registra con add_photo', async () => {
    const uploads: string[] = [];
    fake.storage.upload = async (bucket, path) => void uploads.push(`${bucket}:${path}`);
    fake.onRpc = (fn, args) => (fn === 'add_photo' ? { id: args.p_id, path: 'x' } : null);
    const id = await addMatchProof(LID, EID, new Blob(['x'], { type: 'image/png' }));
    expect(isUuid(id)).toBe(true);
    expect(uploads).toEqual([`scoreboards:${LID}/${id}.webp`]);
    expect(call('add_photo')).toMatchObject({ p_league: LID, p_id: id, p_event: EID, p_width: 800, p_height: 600, p_content_type: 'image/webp' });
  });

  it('link y texto para invitar al equipo', () => {
    expect(teamJoinUrl('https://matchmate-oficial.vercel.app/', 'ABCD2345')).toBe('https://matchmate-oficial.vercel.app/esports/unirse/ABCD2345');
    expect(teamShareText({ name: 'Los Tigres', game: 'valorant' })).toBe('Únete a Los Tigres (VALORANT) en MatchMate');
    expect(teamShareText({ name: 'Turbo', game: 'rocket_league' })).toBe('Únete a Turbo (Rocket League) en MatchMate');
  });
});

describe('textos de error (§9.13)', () => {
  const p0001 = (message: string, kind: ConstructorParameters<typeof BackendError>[1] = 'validation') => new BackendError(message, kind, 'P0001');

  it('los códigos nuevos', () => {
    expect(esportsErrorText(p0001('sin_id'), 'valorant')).toBe('Primero pon tu ID de VALORANT.');
    expect(esportsErrorText(p0001('sin_id: Ana Pérez'), 'lol')).toBe('Ana Pérez todavía no pone su ID de League of Legends.');
    expect(esportsErrorText(p0001('sin_id'))).toBe('Primero pon tu ID de juego.');
    expect(esportsErrorText(p0001('id_sin_comprobar'), 'cs2')).toBe('Este torneo pide tu ID de Counter-Strike 2 comprobado.');
    expect(esportsErrorText(p0001('id_sin_comprobar: Bea'), 'fortnite')).toBe('Bea todavía no tiene su ID de Fortnite comprobado.');
    expect(esportsErrorText(p0001('id_sin_comprobar'))).toBe('Este torneo pide tu ID del juego comprobado.');
    expect(esportsErrorText(p0001('sin_rango'), 'lol')).toBe('Este torneo pide tu rango verificado de League of Legends.');
    expect(esportsErrorText(p0001('sin_rango: Carl'), 'lol')).toBe('Carl todavía no tiene su rango de League of Legends verificado.');
    expect(esportsErrorText(p0001('id_tomado'))).toBe('Ese ID está conectado a otra cuenta con su inicio de sesión.');
    expect(esportsErrorText(p0001('limite: equipos'))).toBe('Llegaste al máximo de equipos.');
  });

  it('los de siempre, según qué se estaba haciendo', () => {
    expect(esportsErrorText(p0001('cupo_lleno'))).toBe('Ya no hay cupo.');
    expect(esportsErrorText(p0001('cupo_lleno'), 'valorant', 'equipo')).toBe('El equipo está lleno.');
    expect(esportsErrorText(p0001('cerrado'))).toBe('La inscripción está cerrada.');
    expect(esportsErrorText(p0001('cerrado'), undefined, 'torneo')).toBe('El torneo ya empezó.');
    expect(esportsErrorText(p0001('cerrado: cuadro'))).toBe('El partido siguiente ya empezó: anúlalo primero.');
    expect(esportsErrorText(p0001('duplicado', 'conflict'))).toBe('Ya está inscrito en este torneo.');
    expect(esportsErrorText(p0001('duplicado', 'conflict'), 'cs2', 'equipo')).toBe('Ya hay un equipo con ese nombre.');
    expect(esportsErrorText(p0001('no_permitido', 'permission'))).toBe('No tienes permiso para eso.');
    expect(esportsErrorText(new BackendError('x', 'network'))).toBe('Sin conexión. Prueba otra vez cuando tengas señal.');
    expect(esportsErrorText(new Error('algo raro'))).toBe('No se pudo. Prueba otra vez.');
    expect(esportsErrorText(new BackendError('Tu cuenta está bloqueada. Escríbele al equipo de MatchMate.', 'permission', 'bloqueada'))).toBe(
      'Tu cuenta está bloqueada. Escríbele al equipo de MatchMate.',
    );
  });
});
