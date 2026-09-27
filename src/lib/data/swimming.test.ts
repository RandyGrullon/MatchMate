import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { personalBests, placeResults, seedHeats, POINTS_6_LANES } from '../../sports/swimming';
import type { OutboxItem } from '../db/outbox';
import { currentOutbox, fetchLive, queryClient } from './client';
import { createLeague, getInviteCode, joinLeague } from './leagues';
import { setMemberScorer } from './members';
import {
  createMeet,
  enterSwimmers,
  fetchClubs,
  fetchMeets,
  fetchSwimEntries,
  fetchSwimEvents,
  fetchSwimHistory,
  fetchSwimmers,
  fetchSwimmersPrivate,
  fetchSwimSeason,
  finalizeMeet,
  overlaySwimResults,
  publishHeats,
  recordHeat,
  registerSwimmer,
  saveClub,
  saveSwimEvents,
  selectAll,
  swimKeys,
  swimMessageTags,
  swimTags,
  swimmerPatch,
  unenterSwimmer,
  updateMeet,
  updateSwimmer,
  type SwimEntry,
} from './swimming';
import { flaky, openWorld, type FlakyBackend, type TestWorld } from './testkit';

vi.mock('../photos', async () => {
  const { fakeUpload } = await import('./testPhotos');
  const { getBackend } = await import('../backend');
  return {
    uploadScoreboardPhoto: (lid: string, img: { width: number; height: number }, photoId?: string) => fakeUpload(getBackend, lid, img, photoId),
    usePhoto: () => ({ data: null, loading: false, error: null }),
  };
});

const YEAR = new Date().getFullYear();

let w: TestWorld;
let net: FlakyBackend;
let lid: string;
let meetId: string;
let ev50: string;
let ev100: string;
let clubA: string;
let clubB: string;
let anaId: string;
const kids: string[] = [];

beforeAll(async () => {
  w = await openWorld();
  const org = await w.signUp('org@x.com', 'Org');
  anaId = await w.signUp('ana@x.com', 'Ana');
  await w.makeSuper(org);
  await w.as('org@x.com');
  lid = await createLeague(
    { uid: org, name: 'Org' },
    {
      name: 'Club de natación',
      kind: 'liga',
      visibility: 'private',
      venue: 'Piscina Olímpica',
      schedule: '',
      seasonStart: '',
      seasonEnd: '',
      contactName: '',
      contactPhone: '',
      requirePhoto: false,
      sport: 'swimming',
      hasMinors: true,
    },
  );
  clubA = await saveClub(lid, { name: 'Delfines', short: 'DEL', color: '#0088cc', coachId: null });
  clubB = await saveClub(lid, { name: 'Tiburones', short: 'TIB', color: null, coachId: null });
  meetId = await createMeet(
    lid,
    { type: 'encuentro', name: 'Copa Delfín', date: `${YEAR}-10-10`, pool: 25, lanes: 4, points: POINTS_6_LANES, ageGroups: 'cccan' },
    [
      { distance: 50, stroke: 'libre', gender: 'X', ageGroups: [] },
      { distance: 100, stroke: 'libre', gender: 'X', ageGroups: [] },
    ],
  );
  [ev50, ev100] = (await fetchSwimEvents(lid, meetId)).map((e) => e.id);
  for (let k = 0; k < 6; k++) {
    kids.push(
      await registerSwimmer(lid, {
        name: `Nadador ${k + 1}`,
        clubId: k % 2 ? clubB : clubA,
        isMinor: true,
        birthYear: YEAR - 10 - (k % 3),
        sex: k % 2 ? 'M' : 'F',
        consent: true,
        guardianName: 'Mamá',
      }),
    );
  }
  // ana entra a la liga y el dueño la hace cronometrista.
  const code = (await getInviteCode(lid))!;
  await w.as('ana@x.com');
  await joinLeague(lid, { uid: anaId, name: 'Ana' }, code);
  await w.as('org@x.com');
  await setMemberScorer({ leagueId: lid, uid: anaId }, true);
  net = flaky(w.b);
  w.use(net);
}, 120_000);

beforeEach(() => {
  net.offline = false;
  net.rpcDown = false;
  net.dropReplies = 0;
  net.calls = [];
});

afterAll(async () => {
  await w.close();
});

describe('natación con la base de verdad', () => {
  it('encuentro, clubes, nadadores (lo privado solo para el admin) y categorías', async () => {
    const meets = await fetchMeets(lid);
    expect(meets).toEqual([
      expect.objectContaining({ id: meetId, type: 'encuentro', name: 'Copa Delfín', pool: 25, lanes: 4, points: POINTS_6_LANES, ageGroups: 'cccan', finalizedAt: null }),
    ]);
    expect((await fetchClubs(lid)).map((c) => c.name)).toEqual(['Delfines', 'Tiburones']);
    const swimmers = await fetchSwimmers(lid);
    expect(swimmers.find((s) => s.playerId === kids[0])).toEqual({ playerId: kids[0], clubId: clubA, category: '9-10', categoryYear: YEAR });
    expect(swimmers.find((s) => s.playerId === kids[2])?.category).toBe('11-12');
    expect((await fetchSwimmersPrivate(lid)).find((p) => p.playerId === kids[0])).toMatchObject({ birthYear: YEAR - 10, sex: 'F', guardianName: 'Mamá' });
    await updateSwimmer(lid, kids[0], { clubId: clubB });
    expect((await fetchSwimmers(lid)).find((s) => s.playerId === kids[0])?.clubId).toBe(clubB);
    await updateSwimmer(lid, kids[0], { clubId: clubA });
    // La cronometrista no ve los datos privados.
    await w.as('ana@x.com');
    expect(await fetchSwimmersPrivate(lid)).toEqual([]);
    await w.as('org@x.com');
  });

  it('inscribir, armar la hoja con el motor y publicarla', async () => {
    const n = await enterSwimmers(
      lid,
      meetId,
      ev50,
      kids.map((p, k) => ({ playerId: p, seed: k === 5 ? null : 3000 + k * 100 })),
    );
    expect(n).toBe(6);
    await enterSwimmers(lid, meetId, ev100, [{ playerId: kids[0], seed: 7000 }]);
    const extra = await registerSwimmer(lid, { name: 'Tarde', clubId: clubA, isMinor: true, birthYear: YEAR - 9, sex: 'F', consent: true, guardianName: null });
    await enterSwimmers(lid, meetId, ev100, [{ playerId: extra, seed: null }]);
    const late = (await fetchSwimEntries(lid, meetId)).find((e) => e.playerId === extra)!;
    expect(await unenterSwimmer(lid, meetId, late.id)).toBe(true);
    const entries = (await fetchSwimEntries(lid, meetId)).filter((e) => e.swimEventId === ev50);
    expect(entries).toHaveLength(6);
    const heats = seedHeats(entries.map((e) => ({ id: e.id, seed: e.seed })), { lanes: 4 });
    const assigned = await publishHeats(lid, meetId, [
      { swimEventId: ev50, lanes: heats.flatMap((h) => h.lanes.map((l) => ({ entryId: l.entryId, heat: h.n, lane: l.lane }))) },
    ]);
    expect(assigned).toBe(6);
    const after = await fetchSwimEntries(lid, meetId);
    expect(after.filter((e) => e.swimEventId === ev50).every((e) => e.heat != null && e.lane != null)).toBe(true);
    expect((await fetchMeets(lid))[0].heatsPublishedAt).not.toBeNull();
  });

  it('«Publicar serie» sin señal: una sola operación, se ve de una y sale una vez al volver', async () => {
    await w.as('ana@x.com');
    const key = swimKeys.entries(meetId);
    await fetchLive<SwimEntry[]>(key, { kind: 'swimEntries', lid, eventId: meetId }, () => fetchSwimEntries(lid, meetId), { initial: [] });
    const heat1 = (queryClient.getQueryData<SwimEntry[]>(key) ?? []).filter((e) => e.swimEventId === ev50 && e.heat === 1);
    expect(heat1.length).toBe(3);
    net.offline = true;
    const first = heat1.map((e, k) => ({ entryId: e.id, time: 3500 + k * 10, status: 'ok' as const }));
    // Se corrigió un carril antes de que saliera: solo se manda la última versión de la serie.
    const fixed = first.map((r, k) => (k === 2 ? { ...r, time: null, status: 'dq' as const } : r));
    await recordHeat(lid, ev50, 1, first, 'Serie 1 · 50 libre');
    await recordHeat(lid, ev50, 1, fixed, 'Serie 1 · 50 libre');
    const outbox = currentOutbox()!;
    await vi.waitFor(() => expect(outbox.getSnapshot().pendingCount).toBe(1));
    const shown = queryClient.getQueryData<SwimEntry[]>(key)!;
    expect(shown.find((e) => e.id === heat1[0].id)).toMatchObject({ time: 3500, status: 'ok' });
    expect(shown.find((e) => e.id === heat1[2].id)).toMatchObject({ time: null, status: 'dq' });
    expect(net.calls).toHaveLength(0);
    // Una lectura del servidor (todavía sin la serie) también se muestra con lo pendiente encima.
    net.offline = false;
    net.rpcDown = true;
    expect((await fetchSwimEntries(lid, meetId)).find((e) => e.id === heat1[1].id)).toMatchObject({ time: 3510, status: 'ok' });
    // (Mientras la RPC no respondía, la cola pudo intentar: esos intentos fallaron y no cuentan.)
    net.calls = [];
    net.rpcDown = false;
    await outbox.flush();
    await outbox.idle();
    expect(net.calls.filter((c) => c.fn === 'swim_record_heat')).toHaveLength(1);
    expect(outbox.getSnapshot().pendingCount).toBe(0);
    const server = await w.b.db.query<{ id: string; time_cs: number | null; status: string }>(
      'select id, time_cs, status from public.swim_entries where swim_event_id = $1 and heat = 1 order by lane',
      [ev50],
    );
    expect(Object.fromEntries(server.rows.map((r) => [r.id, [r.time_cs, r.status]]))).toEqual(
      Object.fromEntries(fixed.map((r) => [r.entryId, [r.time, r.status]])),
    );
  });

  it('si se pierde la respuesta, la serie se reenvía con el mismo op_id y no se repite', async () => {
    await w.as('ana@x.com');
    const heat2 = (await fetchSwimEntries(lid, meetId)).filter((e) => e.swimEventId === ev50 && e.heat === 2);
    net.dropReplies = 1;
    const sent = recordHeat(
      lid,
      ev50,
      2,
      heat2.map((e, k) => ({ entryId: e.id, time: 3000 + k * 25, status: 'ok' })),
    );
    await vi.waitFor(() => expect(net.calls.filter((c) => c.fn === 'swim_record_heat')).toHaveLength(1));
    await currentOutbox()!.flush();
    await sent;
    const calls = net.calls.filter((c) => c.fn === 'swim_record_heat');
    expect(calls).toHaveLength(2);
    expect(calls[0].args.p_op_id).toBe(calls[1].args.p_op_id);
  });

  it('resultados, historial, marcas personales y temporada', async () => {
    await w.as('org@x.com');
    const entries = await fetchSwimEntries(lid, meetId);
    const ev = entries.filter((e) => e.swimEventId === ev50);
    const placed = placeResults(
      ev.map((e) => ({ entryId: e.id, teamId: e.clubId, gender: 'X' as const, ageGroup: e.ageGroup, time: e.time, status: e.status })),
      POINTS_6_LANES,
    );
    expect(placed.filter((p) => p.place === 1).length).toBeGreaterThan(0);
    // Historial del nadador 1 (nadó en la serie 2): su marca en 50 libre piscina 25.
    const hist = await fetchSwimHistory(lid, kids[0]);
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({ distance: 50, stroke: 'libre', pool: 25, date: `${YEAR}-10-10`, meetName: 'Copa Delfín', meetId });
    expect(personalBests(hist)).toEqual([expect.objectContaining({ key: 'libre-50-25', best: hist[0].time })]);
    // Temporada: solo los tiempos que puntúan (ok con tiempo).
    const season = await fetchSwimSeason(lid);
    expect(season.meets.map((m) => m.id)).toEqual([meetId]);
    expect(season.events.map((e) => e.id).sort()).toEqual([ev50, ev100].sort());
    expect(season.entries.every((e) => e.status === 'ok' && (e.time ?? 0) > 0)).toBe(true);
    expect(season.entries).toHaveLength(5);
    // Cerrar el encuentro: la cola ya no puede cambiar resultados (queda en «no se pudo enviar»).
    await finalizeMeet(lid, meetId, true);
    expect((await fetchMeets(lid))[0].finalizedAt).not.toBeNull();
    await w.as('ana@x.com');
    const heat1 = entries.filter((e) => e.swimEventId === ev50 && e.heat === 1);
    await expect(recordHeat(lid, ev50, 1, [{ entryId: heat1[0].id, time: 1, status: 'ok' }])).rejects.toThrow();
    const failed = currentOutbox()!.listFailed();
    expect(failed.some((f) => f.fn === 'swim_record_heat')).toBe(true);
    for (const f of failed) await currentOutbox()!.discard(f.opId);
    await w.as('org@x.com');
    await finalizeMeet(lid, meetId, false);
  });

  it('cambiar datos del encuentro y agregar pruebas', async () => {
    await w.as('org@x.com');
    await updateMeet(lid, meetId, { name: 'Copa Delfín 2', lanes: 6, points: [9, 7, 6, 5, 4, 3, 2, 1] });
    expect((await fetchMeets(lid))[0]).toMatchObject({ name: 'Copa Delfín 2', lanes: 6, points: [9, 7, 6, 5, 4, 3, 2, 1] });
    const [id] = await saveSwimEvents(lid, meetId, [{ distance: 200, stroke: 'combinado', gender: 'F', ageGroups: ['11-12', '13-14'] }]);
    expect((await fetchSwimEvents(lid, meetId)).find((e) => e.id === id)).toMatchObject({ num: 3, distance: 200, stroke: 'combinado', ageGroups: ['11-12', '13-14'] });
  });
});

describe('piezas sin base', () => {
  it('lee de a páginas por id sin perder filas', async () => {
    await w.as('org@x.com');
    const all = await selectAll<{ id: string }>({ table: 'swim_entries', columns: 'id', filters: [{ col: 'league_id', op: 'eq', value: lid }] }, 'id', 2);
    const direct = (await w.b.db.query<{ id: string }>('select id from public.swim_entries where league_id = $1 order by id', [lid])).rows;
    expect(all.map((r) => r.id)).toEqual(direct.map((r) => r.id));
    expect(all.length).toBeGreaterThan(2);
  });

  it('la serie pendiente encima de lo que llegó', () => {
    const base: SwimEntry = {
      id: 'a',
      meetId: 'm',
      swimEventId: 'e',
      playerId: 'p',
      clubId: null,
      ageGroup: null,
      seed: null,
      heat: 1,
      lane: 3,
      time: 3000,
      status: 'ok',
      resultAt: '2026-01-01T00:00:00Z',
    };
    const op = (results: unknown[]): OutboxItem =>
      ({ opId: 'o', userId: 'u', fn: 'swim_record_heat', args: { p_op_id: 'o', p_results: results }, group: 'l', createdAt: 0, seq: 0, attempts: 0, status: 'pending' }) as OutboxItem;
    const list = [base, { ...base, id: 'b' }];
    expect(overlaySwimResults(list, [])).toBe(list);
    const out = overlaySwimResults(list, [op([{ entry_id: 'a', time_cs: null, status: 'dns' }]), op([{ entry_id: 'b', time_cs: null, status: 'ok' }])]);
    expect(out[0]).toMatchObject({ time: null, status: 'dns', resultAt: base.resultAt });
    expect(out[1]).toMatchObject({ time: null, status: 'ok', resultAt: null });
  });

  it('qué se vuelve a leer con cada aviso', () => {
    expect(swimMessageTags('event:m1', 'l1', { event: 'swim', payload: { t: 'entries', op: 'update' } })).toEqual([swimTags.meetEntries('m1'), swimTags.entries('l1')]);
    expect(swimMessageTags('league:l1', 'l1', { event: 'swim', payload: { t: 'clubs' } })).toEqual([swimTags.clubs('l1')]);
    expect(swimMessageTags('event:m1', 'l1', { event: 'live', payload: {} })).toEqual([]);
    expect(swimMessageTags('event:m1', 'l1', null)).toContain(swimTags.meetEntries('m1'));
  });

  it('patch del nadador', () => {
    expect(swimmerPatch({ name: ' Ana ', clubId: null, birthYear: 2015, sex: 'F', guardianName: ' ', consent: true })).toEqual({
      name: 'Ana',
      club_id: null,
      birth_year: 2015,
      sex: 'F',
      guardian_name: null,
      consent: true,
    });
    expect(swimmerPatch({ consent: false })).toEqual({});
  });
});
