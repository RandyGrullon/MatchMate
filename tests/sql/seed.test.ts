/**
 * supabase/seed.sql carga en PGlite (con las RPC de verdad) y el caso de referencia sale como se espera
 * al pasarlo por stats.ts, igual que en la app.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { individualValue, entryLine, rank } from '../../src/lib/stats';
import type { BowlingEvent, Entry } from '../../src/lib/types';
import { MIGRATIONS_DIR, TestDb } from './harness';

const SEED = readFileSync(join(MIGRATIONS_DIR, '..', 'seed.sql'), 'utf8');
const ORG = '00000000-0000-4000-8000-000000000002';

let db: TestDb;

beforeAll(async () => {
  db = await TestDb.open();
  await db.pg.exec(SEED);
});
afterAll(async () => {
  await db.pg.close();
});

describe('seed.sql', () => {
  it('crea las cuentas, el superadmin y la liga de referencia', async () => {
    expect(await db.admin('select email, is_superadmin from public.profiles order by email')).toEqual([
      { email: 'admin@matchmate.local', is_superadmin: true },
      { email: 'ana@matchmate.local', is_superadmin: false },
      { email: 'luis@matchmate.local', is_superadmin: false },
      { email: 'org@matchmate.local', is_superadmin: false },
    ]);
    expect(await db.count('public.leagues')).toBe(1);
    expect(await db.count('public.league_members')).toBe(3);
    expect(await db.count('public.players')).toBe(7);
    expect(await db.count('public.events')).toBe(3);
    expect(await db.count('public.submissions', `status = 'pendiente'`)).toBe(1);
    // Carla no tiene juegos.
    expect(await db.count('public.entries e join public.players p on p.id = e.player_id', `p.name = 'Carla'`)).toBe(0);
  });

  it('el torneo tiene equipos y un empate con handicap (lo calcula stats.ts)', async () => {
    const [ev] = await db.asUser<{
      id: string;
      type: 'torneo';
      name: string;
      date: string;
      games: number;
      hcp_base: number;
      hcp_percent: number;
      individual_rank_by: 'hcp';
    }>(ORG, `select id, type, name, date::text, games, hcp_base, hcp_percent, individual_rank_by from public.events where type = 'torneo'`);
    const teams = await db.asUser<{ id: string; name: string; sort_order: number }>(ORG, 'select id, name, sort_order from public.teams where event_id = $1', [
      ev.id,
    ]);
    expect(teams.map((t) => t.name).sort()).toEqual(['Los Spares', 'Los Strikes']);
    const rows = await db.asUser<Omit<Entry, 'eventId' | 'playerId' | 'teamId' | 'handicapOverride'> & Record<string, unknown>>(
      ORG,
      `select e.id, e.event_id, e.player_id, e.team_id, e.average, e.handicap_override, e.scores, e.photos, p.name
         from public.entries e join public.players p on p.id = e.player_id where e.event_id = $1`,
      [ev.id],
    );
    const event: BowlingEvent = {
      id: ev.id,
      type: 'torneo',
      name: ev.name,
      date: ev.date,
      games: ev.games,
      hcpBase: ev.hcp_base,
      hcpPercent: ev.hcp_percent,
      individualRankBy: ev.individual_rank_by,
      teams: Object.fromEntries(teams.map((t) => [t.id, { name: t.name, order: t.sort_order }])),
      playerCount: rows.length,
    };
    const lines = rows.map((r) =>
      entryLine(
        {
          id: r.id,
          eventId: r.event_id as string,
          playerId: r.player_id as string,
          teamId: r.team_id as string,
          average: r.average,
          handicapOverride: r.handicap_override as number | null,
          scores: r.scores,
          photos: r.photos,
        },
        event,
      ),
    );
    const ranked = rank(lines, individualValue(event)).map((x) => ({ name: rows.find((r) => r.id === x.row.entry.id)!.name, pos: x.pos, total: x.row.total }));
    expect(ranked).toEqual([
      { name: 'Organizador', pos: 1, total: 683 },
      { name: expect.any(String), pos: 2, total: 671 },
      { name: expect.any(String), pos: 2, total: 671 },
      { name: 'Pedro', pos: 4, total: 643 },
    ]);
  });

  it('cargarlo otra vez no hace nada', async () => {
    await db.pg.exec(SEED);
    expect(await db.count('public.leagues')).toBe(1);
  });
});
