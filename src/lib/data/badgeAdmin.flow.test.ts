import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rpc } from './client';
import { badgeJobs, dismissBadgeReports, editBlockedTerms, startBackfill, superRevokeBadge, toBadgeEngine, toBadgeReports, toBlockedTerms } from './badgeAdmin';
import { openWorld, type TestWorld } from './testkit';

/**
 * La consola › Insignias contra la base de verdad (PGlite con las migraciones): lo que mandan las pantallas llega a
 * las RPC del superadmin (20260929000810 y …0820) con los nombres y la forma que piden, y lo que vuelve se lee bien.
 */

let w: TestWorld;
let boss: string;
let rosa: string;
let ana: string;
let lid: string;
let award: string;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await w.b.db.query<T>(sql, params)).rows;

beforeAll(async () => {
  w = await openWorld();
  rosa = await w.signUp('rosa@x.com', 'Rosa');
  ana = await w.signUp('ana@x.com', 'Ana');
  boss = await w.signUp('jefe@x.com', 'Jefe');
  await w.makeSuper(boss);
  [{ id: lid }] = await q<{ id: string }>(
    `insert into public.leagues (sport, kind, visibility, name, owner_id, venue, schedule, season_start, season_end, contact_name, contact_phone, require_photo)
     values ('bowling', 'liga', 'private', 'Liga Los Pinos', $1, 'Bolera', 'Martes', '2026-01-01', '2026-12-31', 'Rosa', '18095550000', false) returning id`,
    [rosa],
  );
  await q(`insert into public.league_members (league_id, user_id, role, display_name) values ($1, $2, 'owner', 'Rosa'), ($1, $3, 'member', 'Ana')`, [lid, rosa, ana]);
  const [{ id: pid }] = await q<{ id: string }>(`insert into public.players (league_id, name, user_id) values ($1, 'Ana', $2) returning id`, [lid, ana]);
  [{ id: award }] = await q<{ id: string }>(
    `insert into public.badge_awards (badge_key, sport, level, period_key, player_id, league_id, status, firm_at, context)
     values ('bowling_clean_game', 'bowling', 0, 'g:x:0', $1, $2, 'firme', now(), '{"v": 1}') returning id`,
    [pid, lid],
  );
  // Rosa reporta la insignia de Ana.
  await w.as('rosa@x.com');
  await rpc('report_badge', { p_award: award, p_reason: 'No fue limpio' });
  await w.as('jefe@x.com');
}, 120_000);

afterAll(async () => {
  await w.close();
});

describe('consola › insignias con la base de verdad', () => {
  it('reportes: se leen, y retirar por fraude los cierra', async () => {
    const open = toBadgeReports(await rpc('admin_badge_reports', { p_open: true, p_limit: 100 }));
    expect(open.open).toBe(1);
    expect(open.rows[0]).toMatchObject({ kind: 'insignia', reason: 'No fue limpio', reporterName: 'Rosa', leagueName: 'Liga Los Pinos', award: { id: award, key: 'bowling_clean_game' } });
    await superRevokeBadge(award, 'Probado con la liga');
    expect(toBadgeReports(await rpc('admin_badge_reports', { p_open: true })).open).toBe(0);
    const closed = toBadgeReports(await rpc('admin_badge_reports', { p_open: false }));
    expect(closed.rows[0]).toMatchObject({ resolution: 'retirada' });
    expect(await dismissBadgeReports([closed.rows[0].id])).toBe(0);
  });

  it('palabras bloqueadas: añadir (entera) y quitar (sobre la lista base)', async () => {
    const base = toBlockedTerms(await rpc('admin_blocked_terms', {})).map((t) => t.term);
    expect(base.length).toBeGreaterThan(20);
    const added = await editBlockedTerms({ add: ['Feó', 'mala'], whole: true });
    expect(added).toEqual(
      expect.arrayContaining([
        { term: 'feo', whole: true, createdAt: expect.any(String) },
        { term: 'mala', whole: true, createdAt: expect.any(String) },
      ]),
    );
    expect(added).toHaveLength(base.length + 2);
    const left = (await editBlockedTerms({ remove: ['mala'] })).map((t) => t.term);
    expect(left).toContain('feo');
    expect(left).not.toContain('mala');
    expect(toBlockedTerms(await rpc('admin_blocked_terms', {})).map((t) => t.term).sort()).toEqual([...base, 'feo'].sort());
  });

  it('el motor: historial en seco (una liga y sus cuentas), la cola y los trabajos que ya no se toman', async () => {
    const run = await startBackfill(lid, true);
    expect(run).toMatchObject({ dryRun: true, leagues: 1, accounts: 1, jobs: 2 });
    const e = toBadgeEngine(await rpc('admin_badges_engine', { p_run: null }))!;
    expect(e.backfill).toEqual([{ runId: run.runId, dryRun: true, pending: 2, dead: 0 }]);
    expect(e.queue.pending).toBeGreaterThanOrEqual(2);
    const [{ id }] = await q<{ id: number }>(`select id from private.badge_queue where kind = 'historial' order by id limit 1`);
    await q(`update private.badge_queue set attempts = 5 where id = $1`, [id]);
    expect(toBadgeEngine(await rpc('admin_badges_engine', {}))!.dead.map((j) => j.id)).toEqual([Number(id)]);
    expect(await badgeJobs([Number(id)], 'retry')).toBe(1);
    expect(toBadgeEngine(await rpc('admin_badges_engine', {}))!.queue.dead).toBe(0);
  });
});
