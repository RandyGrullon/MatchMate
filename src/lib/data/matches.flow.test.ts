/**
 * Partidos con la base de verdad (PGlite con las migraciones y la RLS): crear, anotar por la cola (sin señal
 * solo sale lo último), releer bajando solo lo que cambió, terminar, confirmar, mis partidos y plantillas.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Backend } from '../backend/types';
import { currentOutbox } from './client';
import { createLeague, joinLeague } from './leagues';
import {
  claimScorer,
  confirmResult,
  createMatches,
  fetchLeagueMatches,
  fetchMatch,
  fetchMyMatches,
  finishMatch,
  isFinal,
  publishMatch,
  resetMatchesForTests,
} from './matches';
import { fetchPlayers } from './players';
import { createSeasonTeam, fetchSeasonTeams, removeTeamPlayer, setRoster, setTeamPlayer } from './seasonTeams';
import { flaky, openWorld, type FlakyBackend, type TestWorld } from './testkit';

let w: TestWorld;
let net: FlakyBackend;
let reads: string[] = [];
let lid: string;
let rosaId: string;
let anaId: string;
let pRosa: string;
let pAna: string;
let mid: string;

/** Anota qué tablas se leen (para ver que releer solo baja lo que cambió). */
function counting(base: Backend): Backend {
  return {
    get mode() {
      return base.mode;
    },
    get auth() {
      return base.auth;
    },
    get storage() {
      return base.storage;
    },
    select: (q) => {
      reads.push(`${q.table}:${q.columns ?? '*'}`);
      return base.select(q);
    },
    rpc: (fn, args) => base.rpc(fn, args),
    subscribe: (t, cb) => base.subscribe(t, cb),
    invoke: (fn, body) => base.invoke(fn, body),
    online: () => base.online(),
  };
}

const outbox = () => currentOutbox()!;

beforeAll(async () => {
  w = await openWorld();
  anaId = await w.signUp('ana@x.com', 'Ana');
  rosaId = await w.signUp('rosa@x.com', 'Rosa');
  // El pádel está en beta: solo el superadmin crea la liga.
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
  pAna = (await joinLeague(lid, { uid: anaId, name: 'Ana' }, null))!;
  await w.as('rosa@x.com');
  pRosa = (await fetchPlayers(lid)).find((p) => p.uid === rosaId)!.id;
  net = flaky(counting(w.b));
  w.use(net);
}, 120_000);

beforeEach(() => {
  net.offline = false;
  net.rpcDown = false;
  net.calls = [];
  reads = [];
});

afterAll(async () => {
  resetMatchesForTests();
  await w.close();
});

describe('partidos con la base de verdad', () => {
  it('el admin arma la pareja y el partido; la lista trae lados, jugadores y las reglas de la liga', async () => {
    const team = await createSeasonTeam(lid, { name: 'Rosa / Ana', players: [{ playerId: pRosa }, { playerId: pAna }] });
    const teams = await fetchSeasonTeams(lid);
    expect(teams).toHaveLength(1);
    expect(teams[0]).toMatchObject({ id: team, name: 'Rosa / Ana', roster: [{ role: 'player' }, { role: 'player' }] });

    [mid] = await createMatches(lid, [
      { round: 1, court: 'Cancha 1', sides: [{ side: 1, players: [{ playerId: pRosa }] }, { side: 2, players: [{ playerId: pAna }] }] },
    ]);
    const list = await fetchLeagueMatches(lid);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: mid, status: 'scheduled', court: 'Cancha 1', round: 1 });
    expect(list[0].sides.map((s) => s.label)).toEqual(['Rosa', 'Ana']);
    const full = await fetchMatch(lid, mid);
    // Las reglas por defecto del pádel quedaron copiadas en el partido.
    expect(full?.rules).toMatchObject({ match: { sport: 'padel' } });
    expect(full?.state).toBeNull();
  });

  it('la rival anota: sin señal solo sale la última publicación; releer baja solo lo que cambió', async () => {
    await w.as('ana@x.com');
    expect(await claimScorer(lid, mid)).toMatchObject({ ok: true, scorerName: 'Ana' });
    await fetchLeagueMatches(lid);

    net.offline = true;
    const a = publishMatch(lid, mid, { seq: 1, state: { v: 1, seq: 1 }, score: { text: '0-15' } });
    const b = publishMatch(lid, mid, { seq: 2, state: { v: 1, seq: 2 }, score: { text: '0-30' } });
    expect(outbox().getSnapshot().pendingCount).toBe(1);
    net.offline = false;
    await outbox().flush();
    expect(await a.done).toMatchObject({ ok: true, seq: 2, status: 'live' });
    expect(await b.done).toMatchObject({ ok: true, seq: 2 });
    expect(net.calls.filter((c) => c.fn === 'publish_match')).toHaveLength(1);

    // Releer sin cambios: solo `id, version`.
    await fetchLeagueMatches(lid);
    reads = [];
    await fetchLeagueMatches(lid);
    expect(reads).toEqual(['matches:id,version']);
    // Con un cambio: ese partido completo, con sus lados.
    await publishMatch(lid, mid, { seq: 3, state: { v: 1, seq: 3 }, score: { text: '0-40' } }).done;
    reads = [];
    const list = await fetchLeagueMatches(lid);
    expect(reads.map((r) => r.split(':')[0])).toEqual(['matches', 'matches', 'match_sides', 'match_players']);
    expect(list[0]).toMatchObject({ status: 'live', seq: 3, score: { text: '0-40' }, scorerId: anaId });
  });

  it('otro teléfono no pisa: la publicación dice quién tiene el turno', async () => {
    await w.as('rosa@x.com');
    const r = await publishMatch(lid, mid, { seq: 9, state: { v: 1 }, score: null }).done;
    expect(r).toMatchObject({ ok: false, reason: 'lease', scorerName: 'Ana' });
  });

  it('terminar (propone la rival), confirmar (el otro lado) y mis partidos', async () => {
    await w.as('ana@x.com');
    expect(await finishMatch(lid, mid, { score: { text: '4-6 3-6', sides: [0, 2] }, winner: 2, seq: 3 })).toEqual({ ok: true, status: 'finished' });
    const mine = await fetchMyMatches();
    expect(mine.map((m) => [m.id, m.mySide, m.status])).toEqual([[mid, 2, 'finished']]);
    expect(isFinal(mine[0])).toBe(false);

    await w.as('rosa@x.com');
    await confirmResult(lid, mid);
    const [m] = await fetchLeagueMatches(lid);
    expect(m).toMatchObject({ status: 'confirmed', winner: 2, confirmedBy: rosaId, proposedBy: anaId, proposedSide: 2 });
    expect(isFinal(m)).toBe(true);
  });

  it('plantilla de la pareja: dorsal, quitar y reemplazar', async () => {
    await w.as('rosa@x.com');
    const [team] = await fetchSeasonTeams(lid);
    await setTeamPlayer(lid, team.id, { playerId: pAna, jersey: 8, position: 'reves' });
    expect((await fetchSeasonTeams(lid))[0].roster.find((r) => r.playerId === pAna)).toEqual({ playerId: pAna, jersey: 8, position: 'reves', role: 'player' });
    expect(await removeTeamPlayer(lid, team.id, pAna)).toBe(true);
    await setRoster(lid, team.id, [{ playerId: pRosa, role: 'captain' }, { playerId: pAna }]);
    expect((await fetchSeasonTeams(lid))[0].roster.map((r) => [r.playerId, r.role])).toEqual([
      [pRosa, 'captain'],
      [pAna, 'player'],
    ]);
  });
});
