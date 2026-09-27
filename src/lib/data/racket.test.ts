/**
 * Raqueta (racket.ts): lo puro (filas → eventos, nivel, resultado a puntos pendiente encima) y el camino completo
 * con la base de verdad (PGlite con las migraciones y la RLS): la noche con su configuración, publicar la ronda,
 * terminar un partido con empate sin señal y el nivel de los jugadores.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { OutboxItem } from '../db/outbox';
import { currentOutbox } from './client';
import { createLeague, joinLeague } from './leagues';
import { fetchEventMatches, fetchMatch, resetMatchesForTests, type Match } from './matches';
import { createPlayer, fetchPlayers } from './players';
import {
  createRacketEvent,
  fetchLeagueRules,
  fetchPlayerLevels,
  fetchRacketEvent,
  fetchRacketEvents,
  levelOf,
  overlayPoints,
  overlayPointsList,
  saveNightRound,
  savePointsResult,
  setPlayerLevel,
  toRacketEvent,
  updateRacketEvent,
} from './racket';
import type { Wire } from './stamp';
import { flaky, openWorld, type FlakyBackend, type TestWorld } from './testkit';

describe('lo puro', () => {
  it('fila de events → evento con configuración', () => {
    expect(
      toRacketEvent({
        id: 'E',
        league_id: 'L',
        type: 'americano',
        name: 'Jueves',
        date: '2026-10-08',
        start_time: '19:30:00',
        config: { format: 'americano' },
        player_count: 12,
        created_at: '2026-10-01T00:00:00Z',
        updated_at: '2026-10-01T00:00:00Z',
      }),
    ).toEqual({
      id: 'E',
      leagueId: 'L',
      type: 'americano',
      name: 'Jueves',
      date: '2026-10-08',
      startTime: '19:30',
      config: { format: 'americano' },
      playerCount: 12,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    });
    expect(toRacketEvent({ id: 'E', league_id: 'L', type: 'liga', name: '', date: '2026-10-08', start_time: null, config: null, player_count: null, created_at: '', updated_at: '' })).toMatchObject({
      config: {},
      playerCount: 0,
      startTime: null,
    });
  });

  it('nivel: número de 0 a 7', () => {
    expect(levelOf({ level: 4.5 })).toBe(4.5);
    expect(levelOf({ level: 9 })).toBe(7);
    expect(levelOf({ level: 'A' })).toBeNull();
    expect(levelOf(null)).toBeNull();
  });

  it('el resultado a puntos en la cola se ve encima (con empate)', () => {
    const m = { id: 'M', status: 'live', score: { text: '3-2', sides: [3, 2] }, winner: null, scorerId: 'u', leaseUntil: 'x' } as unknown as Wire<Match>;
    const op = { fn: 'save_points_result', args: { p_match: 'M', p_score1: 12, p_score2: 12, p_op_id: 'o' }, createdAt: Date.parse('2026-10-08T23:00:00Z') } as unknown as OutboxItem;
    expect(overlayPoints(m, [op])).toMatchObject({ pending: true, status: 'confirmed', score: { text: '12-12', sides: [12, 12] }, winner: null, scorerId: null });
    expect(overlayPoints(m, [{ ...op, args: { ...op.args, p_match: 'otro' } }])).toBe(m);
    const list = [m];
    expect(overlayPointsList(list, [])).toBe(list);
  });
});

describe('con la base de verdad', () => {
  let w: TestWorld;
  let net: FlakyBackend;
  let lid: string;
  let rosaId: string;
  let anaId: string;
  const ps: string[] = [];

  beforeAll(async () => {
    w = await openWorld();
    anaId = await w.signUp('ana@x.com', 'Ana');
    rosaId = await w.signUp('rosa@x.com', 'Rosa');
    await w.makeSuper(rosaId);
    lid = await createLeague(
      { uid: rosaId, name: 'Rosa' },
      {
        name: 'Pádel del jueves',
        kind: 'liga',
        visibility: 'public',
        venue: 'Club',
        schedule: '',
        seasonStart: '',
        seasonEnd: '',
        contactName: '',
        contactPhone: '',
        requirePhoto: false,
        sport: 'padel',
      },
    );
    await w.as('ana@x.com');
    const pAna = (await joinLeague(lid, { uid: anaId, name: 'Ana' }, null))!;
    await w.as('rosa@x.com');
    const pRosa = (await fetchPlayers(lid)).find((p) => p.uid === rosaId)!.id;
    ps.push(pRosa, pAna);
    for (const name of ['Luis', 'Pedro', 'Juan']) ps.push(await createPlayer(lid, name, null));
    net = flaky(w.b);
    w.use(net);
  }, 120_000);

  afterAll(async () => {
    resetMatchesForTests();
    await w.close();
  });

  it('la noche: se crea con su configuración, se publica la ronda y se guarda quién descansa', async () => {
    await w.as('rosa@x.com');
    expect((await fetchLeagueRules(lid)).match).toMatchObject({ sport: 'padel' });
    const id = await createRacketEvent(lid, {
      type: 'americano',
      name: 'Americano del jueves',
      date: '2026-10-08',
      startTime: '19:30',
      config: { format: 'americano', players: ps, courts: ['Cancha 1'], points: { mode: 'total', target: 24 } },
    });
    const list = await fetchRacketEvents(lid);
    expect(list.map((e) => [e.id, e.type, e.playerCount, e.startTime])).toEqual([[id, 'americano', 5, '19:30']]);
    await updateRacketEvent(lid, id, { config: { ...list[0].config, rounds: 5 } });
    expect((await fetchRacketEvent(lid, id))?.config).toMatchObject({ rounds: 5 });

    const ids = await saveNightRound(
      lid,
      id,
      1,
      [
        {
          court: 'Cancha 1',
          rules: { match: { sport: 'padel' }, points: { mode: 'total', target: 24 } },
          sides: [
            { side: 1, players: [{ playerId: ps[0] }, { playerId: ps[1] }] },
            { side: 2, players: [{ playerId: ps[2] }, { playerId: ps[3] }] },
          ],
        },
      ],
      [ps[4]],
    );
    expect(ids).toHaveLength(1);
    const [m] = await fetchEventMatches(lid, id);
    expect(m).toMatchObject({ id: ids[0], round: 1, format: 'americano', requireConfirm: false, court: 'Cancha 1' });
    expect(m.sides.map((s) => s.label)).toEqual(['Rosa / Ana', 'Luis / Pedro']);
    expect((await fetchRacketEvent(lid, id))?.config).toMatchObject({ round: 1, rests: { '1': [ps[4]] } });
  });

  it('la rival termina 12-12 sin señal: se ve enseguida, sale al volver y queda final (empate)', async () => {
    await w.as('ana@x.com');
    const [night] = await fetchRacketEvents(lid);
    const [m] = await fetchEventMatches(lid, night.id);
    net.offline = true;
    expect(await savePointsResult(lid, m.id, [12, 12])).toBeUndefined();
    expect(currentOutbox()!.getSnapshot().pendingCount).toBe(1);
    net.offline = false;
    await currentOutbox()!.flush();
    expect(currentOutbox()!.getSnapshot().pendingCount).toBe(0);
    const full = await fetchMatch(lid, m.id);
    expect(full).toMatchObject({ status: 'confirmed', winner: null, score: { text: '12-12', sides: [12, 12] } });
    // Pasarse del total no se acepta (queda en «no se pudo enviar»).
    await w.as('rosa@x.com');
    await expect(savePointsResult(lid, m.id, [20, 10])).rejects.toBeTruthy();
    expect(await savePointsResult(lid, m.id, [14, 10], { note: 'Corregido' })).toEqual({ ok: true, status: 'confirmed' });
  });

  it('el nivel del jugador (para el mexicano y la siembra)', async () => {
    await w.as('rosa@x.com');
    await setPlayerLevel(lid, ps[2], 4.55);
    await setPlayerLevel(lid, ps[3], 6);
    expect(await fetchPlayerLevels(lid)).toEqual({ [ps[2]]: 4.6, [ps[3]]: 6 });
    await setPlayerLevel(lid, ps[3], null);
    expect(await fetchPlayerLevels(lid)).toEqual({ [ps[2]]: 4.6 });
  });
});
