/**
 * Lecturas de las pantallas de reclamos contra la base local (PGlite con las migraciones): lo que jugó un jugador
 * (lo que ve el admin antes de aprobar) y los pendientes de las ligas donde la cuenta es admin (la campana).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openWorld, type TestWorld } from '../../lib/data/testkit';
import { fetchPendingClaimsOf, fetchPlayerHistory } from './data';
import { historyText } from './logic';

describe('reclamos: lecturas de las pantallas', () => {
  let w: TestWorld;
  let org: string;
  let lid: string;
  let pedro: string;
  const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await w.b.db.query<T>(sql, params)).rows;

  beforeAll(async () => {
    w = await openWorld();
    org = await w.signUp('org@x.com', 'org');
    await w.signUp('ana@x.com', 'ana');
    [{ id: lid }] = await q<{ id: string }>(
      `insert into public.leagues (sport, kind, visibility, name, owner_id, venue, schedule, season_start, season_end, contact_name, contact_phone, require_photo)
       values ('bowling', 'liga', 'public', 'Liga Abierta', $1, 'Bolera', 'Martes', '2026-01-01', '2026-12-31', 'Org', '18095550000', false) returning id`,
      [org],
    );
    await q(`insert into public.league_members (league_id, user_id, role, display_name) values ($1, $2, 'owner', 'org')`, [lid, org]);
    [{ id: pedro }] = await q<{ id: string }>(`insert into public.players (league_id, name) values ($1, 'Pedro') returning id`, [lid]);
    const [{ id: ev }] = await q<{ id: string }>(`insert into public.events (league_id, type, name, date) values ($1, 'practica', 'Martes', '2026-09-01') returning id`, [lid]);
    await q(`insert into public.entries (league_id, event_id, player_id, scores) values ($1, $2, $3, '{150,160,170}')`, [lid, ev, pedro]);
  }, 120_000);

  afterAll(async () => {
    await w?.close();
  });

  it('el admin ve lo que jugó el jugador sin cuenta y el pedido pendiente de su liga', async () => {
    await w.as('ana@x.com');
    const joined = await w.b.rpc<{ player_id: string; claim_id: string | null }>('join_league', { p_league: lid, p_prefer: pedro });
    expect(joined.claim_id).toBeTruthy();
    // Ana no es admin: no ve pendientes de la liga que no sean suyos (el suyo sí).
    expect((await fetchPendingClaimsOf([lid])).map((c) => c.userId)).toEqual([expect.any(String)]);
    expect(await fetchPendingClaimsOf([])).toEqual([]);

    await w.as('org@x.com');
    const history = await fetchPlayerHistory(pedro);
    expect(history).toEqual({ entries: 1, matches: 0, golfCards: 0, swims: 0 });
    expect(historyText(history)).toBe('1 evento con juegos');
    expect(historyText(await fetchPlayerHistory(joined.player_id))).toBe('Todavía no ha jugado');
    const pending = await fetchPendingClaimsOf([lid, 'a0000000-0000-4000-8000-000000000000']);
    expect(pending.map((c) => [c.id, c.playerName, c.claimantName, c.status])).toEqual([[joined.claim_id, 'Pedro', 'ana', 'pending']]);
  });
});
