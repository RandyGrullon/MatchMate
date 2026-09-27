/**
 * El importador de torneos del Excel con las RPC de verdad, como un admin de la liga, sobre una liga ya migrada.
 */
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLocalBackend, type LocalBackend } from '../../src/lib/backend/local';
import { entryLine, individualValue, rank } from '../../src/lib/stats';
import type { BowlingEvent, Entry } from '../../src/lib/types';
import { makeAuthExport, makeBackup } from './fixture';
import { leagueUuid, playerUuid, userUuid } from './ids';
import { dataUrlBytes, runImport } from './importar';
import { createLocalTarget, loadSqlFromDisk, memorySession, type LocalTarget } from './target';
import { checkTournamentFile, importTournament, tournamentEventId, type TournamentFile } from './torneo';
import { transformBackup } from './transform';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const L1 = leagueUuid('L1banco');

const FILE: TournamentFile = {
  event: { id: 'torneo-2025', type: 'torneo', name: 'Torneo 2025', date: '2025-11-15', games: 3, hcpBase: 230, hcpPercent: 80, individualRankBy: 'hcp', teamRankBy: 'scratch', teamSize: 3 },
  teams: ['Los Strikes', 'Los Spares'],
  players: [
    // Pedro ya existe en la liga (se reusa aunque venga en mayúsculas y con tilde).
    { name: 'PEDRÓ', average: 175, handicap: 44, team: 'Los Strikes', scores: [190, 175, 201] },
    { name: 'Carla Núñez', average: 150, handicap: 64, team: 'Los Strikes', scores: [160, 150] },
    { name: 'Tomás', average: 200, handicap: 10, team: 'Los Spares', scores: [210, 220, 230] },
  ],
};

let target: LocalTarget;
const opened: LocalBackend[] = [];
async function as(uid: string): Promise<LocalBackend> {
  const b = await createLocalBackend({ sql: loadSqlFromDisk(ROOT), db: target.backend.db, sessionStore: memorySession(JSON.stringify({ userId: userUuid(uid), email: null })) });
  opened.push(b);
  return b;
}

beforeAll(async () => {
  target = await createLocalTarget({ root: ROOT });
  const plan = transformBackup(makeBackup({ dirty: false }), { auth: makeAuthExport() });
  await runImport(plan, target, { readFile: async (f) => ('dataUrl' in f.source ? dataUrlBytes(f.source.dataUrl) : new Uint8Array()) });
});

afterAll(async () => {
  for (const b of opened) await b.close();
  await target?.close();
});

describe('importar un torneo del Excel', () => {
  it('revisa el archivo antes de tocar nada', () => {
    expect(checkTournamentFile(FILE)).toEqual([]);
    expect(checkTournamentFile({ event: { id: 'x', name: 'X', date: '15/11/2025', games: 3 }, teams: [], players: [] })).toEqual([
      'event.date tiene que ser AAAA-MM-DD',
      'falta "players"',
    ]);
    const bad = structuredClone(FILE);
    bad.players[0].scores = [301];
    bad.players[1].team = 'Otro';
    expect(checkTournamentFile(bad)).toEqual(['players[0] PEDRÓ: pinos de 0 a 300 (o null)', 'players[1] Carla Núñez: el equipo «Otro» no está en "teams"']);
  });

  it('un miembro que no es admin no puede', async () => {
    await expect(importTournament(await as('uLuis'), L1, FILE)).rejects.toMatchObject({ kind: 'permission' });
  });

  it('carga evento, jugadores, equipos y juegos «importado» con las RPC', async () => {
    const org = await as('uOrg');
    const r = await importTournament(org, L1, FILE);
    expect(r).toEqual({ eventId: tournamentEventId(L1, 'torneo-2025'), created: 2, entered: 3, teams: 2, replaced: false });

    const [ev] = await org.select<Record<string, unknown>>({ table: 'events', filters: [{ col: 'id', op: 'eq', value: r.eventId }] });
    expect(ev).toMatchObject({ type: 'torneo', name: 'Torneo 2025', date: '2025-11-15', hcp_base: 230, hcp_percent: 80, category_cuts: [200, 175, 160], team_size: 3, player_count: 3 });
    const teams = await org.select<{ id: string; name: string; sort_order: number }>({ table: 'teams', filters: [{ col: 'event_id', op: 'eq', value: r.eventId }], order: [{ col: 'sort_order' }] });
    expect(teams.map((t) => t.name)).toEqual(['Los Strikes', 'Los Spares']);
    const entries = await org.select<Record<string, unknown>>({ table: 'entries', filters: [{ col: 'event_id', op: 'eq', value: r.eventId }] });
    const players = await org.select<{ id: string; name: string }>({ table: 'players', filters: [{ col: 'league_id', op: 'eq', value: L1 }] });
    const of = (name: string) => entries.find((e) => e.player_id === players.find((p) => p.name === name)?.id)!;
    // Pedro ya estaba (mismo jugador); 44 = (230 - 175) × 80 % es la fórmula → no queda fijo.
    expect(of('Pedro')).toMatchObject({ player_id: playerUuid('L1banco', 'pPedro'), scores: [190, 175, 201], photos: ['importado', 'importado', 'importado'], handicap_override: null, team_id: teams[0].id });
    expect(of('Carla Núñez')).toMatchObject({ scores: [160, 150, null], photos: ['importado', 'importado', null], handicap_override: null, team_id: teams[0].id });
    // Tomás: la fórmula da 24 y el Excel dice 10 → queda fijo.
    expect(of('Tomás')).toMatchObject({ handicap_override: 10, team_id: teams[1].id, average: 200 });

    // La clasificación sale con stats.ts como en la app: total con handicap.
    const event = { id: r.eventId, type: 'torneo', name: '', date: '2025-11-15', games: 3, hcpBase: 230, hcpPercent: 80, teams: {}, playerCount: 3, individualRankBy: 'hcp' } as BowlingEvent;
    const lines = entries.map((e) => entryLine({ id: e.id, eventId: e.event_id, playerId: e.player_id, teamId: e.team_id, average: e.average, handicapOverride: e.handicap_override, scores: e.scores, photos: e.photos } as Entry, event));
    expect(rank(lines, individualValue(event)).map((x) => [x.pos, x.row.total])).toEqual([
      [1, 698],
      [2, 690],
      [3, 438],
    ]);
  });

  it('otra vez: no lo duplica; con reemplazar lo carga de nuevo', async () => {
    const org = await as('uOrg');
    await expect(importTournament(org, L1, FILE)).rejects.toThrow(/ya está en la liga/);
    const r = await importTournament(org, L1, FILE, { replace: true });
    expect(r).toMatchObject({ created: 0, entered: 3, replaced: true });
    expect(await org.select({ table: 'events', filters: [{ col: 'league_id', op: 'eq', value: L1 }, { col: 'date', op: 'eq', value: '2025-11-15' }] })).toHaveLength(1);
    expect(await org.select({ table: 'players', filters: [{ col: 'league_id', op: 'eq', value: L1 }] })).toHaveLength(7);
  });
});
