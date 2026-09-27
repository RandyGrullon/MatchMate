/**
 * Deportes de equipo con la base de verdad (PGlite con las migraciones y la RLS): convocatoria por la cola (sin
 * señal se ve de una y sale sola), anotador designado, reglas de la liga y la hora del servidor.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { currentOutbox } from './client';
import { createLeague, joinLeague } from './leagues';
import { createMatches, fetchMatch, finishMatch, resetMatchesForTests } from './matches';
import { fetchPlayers } from './players';
import { createSeasonTeam } from './seasonTeams';
import {
  fetchLeagueRules,
  fetchMatchOfficials,
  fetchMatchRsvps,
  knownServerOffset,
  resetServerOffsetForTests,
  saveLeagueRules,
  serverOffset,
  setMatchOfficial,
  setMatchRsvp,
} from './teamSports';
import { flaky, openWorld, type FlakyBackend, type TestWorld } from './testkit';

let w: TestWorld;
let net: FlakyBackend;
let lid: string;
let rosaId: string;
let anaId: string;
let pRosa: string;
let pAna: string;
let tigres: string;
let leones: string;
let mid: string;

const outbox = () => currentOutbox()!;

beforeAll(async () => {
  w = await openWorld();
  anaId = await w.signUp('ana@x.com', 'Ana');
  rosaId = await w.signUp('rosa@x.com', 'Rosa');
  // El baloncesto está en beta: solo el superadmin crea la liga.
  await w.makeSuper(rosaId);
  lid = await createLeague(
    { uid: rosaId, name: 'Rosa' },
    {
      name: 'Baloncesto del barrio',
      kind: 'liga',
      visibility: 'public',
      venue: 'Cancha',
      schedule: '',
      seasonStart: '',
      seasonEnd: '',
      contactName: '',
      contactPhone: '',
      requirePhoto: false,
      sport: 'basketball',
    },
  );
  await w.as('ana@x.com');
  pAna = (await joinLeague(lid, { uid: anaId, name: 'Ana' }, null))!;
  await w.as('rosa@x.com');
  pRosa = (await fetchPlayers(lid)).find((p) => p.uid === rosaId)!.id;
  tigres = await createSeasonTeam(lid, { name: 'Tigres', color: '#f97316', players: [{ playerId: pRosa, jersey: 7, role: 'captain' }] });
  leones = await createSeasonTeam(lid, { name: 'Leones', players: [{ playerId: pAna, jersey: 4, role: 'delegate' }] });
  [mid] = await createMatches(lid, [{ round: 1, court: 'Cancha 1', format: 'fiba', sides: [{ side: 1, teamId: tigres }, { side: 2, teamId: leones }] }]);
  net = flaky(w.b);
  w.use(net);
}, 120_000);

beforeEach(() => {
  net.offline = false;
  net.rpcDown = false;
  net.calls = [];
});

afterAll(async () => {
  resetMatchesForTests();
  resetServerOffsetForTests();
  await w.close();
});

describe('deportes de equipo con la base de verdad', () => {
  it('convocatoria: sin señal se ve de una, sale sola y el servidor la guarda', async () => {
    await w.as('ana@x.com');
    net.offline = true;
    await setMatchRsvp(lid, mid, pAna, 2, 'maybe');
    await setMatchRsvp(lid, mid, pAna, 2, 'yes');
    // Solo sale la última (misma clave de colapso) y ya se ve.
    expect(outbox().getSnapshot().pendingCount).toBe(1);
    net.offline = false;
    const before = await fetchMatchRsvps(lid, [mid]);
    expect(before).toEqual([expect.objectContaining({ matchId: mid, playerId: pAna, side: 2, status: 'yes', pending: true })]);
    await outbox().flush();
    expect(net.calls.filter((c) => c.fn === 'set_match_rsvp')).toHaveLength(1);
    const after = await fetchMatchRsvps(lid, [mid]);
    expect(after).toEqual([expect.objectContaining({ playerId: pAna, side: 2, status: 'yes', setBy: anaId })]);
    expect(after[0].pending).toBeUndefined();
    // Quitarla.
    await setMatchRsvp(lid, mid, pAna, 2, null);
    await outbox().flush();
    expect(await fetchMatchRsvps(lid, [mid])).toEqual([]);
    expect(await fetchMatchRsvps(lid, [])).toEqual([]);
  });

  it('el admin designa a la delegada rival como anotadora: lo que ella termina queda confirmado', async () => {
    await w.as('rosa@x.com');
    await setMatchOfficial(lid, mid, anaId);
    expect(await fetchMatchOfficials(lid)).toEqual([{ matchId: mid, userId: anaId, name: 'Ana' }]);
    await w.as('ana@x.com');
    expect(await finishMatch(lid, mid, { score: { text: '61-58', sides: [61, 58] }, winner: 1 })).toEqual({ ok: true, status: 'confirmed' });
    expect(await fetchMatch(lid, mid)).toMatchObject({ status: 'confirmed', confirmedBy: anaId, proposedSide: null });
  });

  it('reglas de la liga: se mezclan con las que había (las del partido siguen)', async () => {
    await w.as('rosa@x.com');
    const before = await fetchLeagueRules(lid);
    expect(before).toMatchObject({ match: { variant: '5x5', periods: 4 } });
    await saveLeagueRules(lid, { teams: { reinforcements: 1, minPlayers: 5, runningClock: false, template: 'fiba' } });
    expect(await fetchLeagueRules(lid)).toMatchObject({ match: { variant: '5x5' }, teams: { reinforcements: 1, template: 'fiba' } });
  });

  it('hora del servidor: se pide una vez; sin señal da 0 y lo intenta la próxima vez', async () => {
    resetServerOffsetForTests();
    net.offline = true;
    expect(await serverOffset()).toBe(0);
    net.offline = false;
    const ms = await serverOffset();
    expect(Math.abs(ms)).toBeLessThan(5_000);
    expect(knownServerOffset()).toBe(ms);
    await serverOffset();
    expect(net.calls.filter((c) => c.fn === 'server_now')).toHaveLength(2);
  });
});
