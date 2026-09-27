import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { toIsoDate } from '../format';
import { playerStats } from '../stats';
import { NO_PHOTO } from '../types';
import { currentOutbox, fetchLive, queryClient } from './client';
import { fetchEntries } from './entries';
import { addEntries, saveGame } from './entries';
import { addEventGame, createEvent, fetchEvent, fetchEvents, practiceForDate, setRsvp, updateEvent } from './events';
import { fetchLeagueFeeds } from './feeds';
import { keys } from './keys';
import { createLeague, createTournament, fetchLeague, getInvite, getInviteCode, joinLeague } from './leagues';
import { fetchEventLive, publishLiveScores } from './liveScores';
import { fetchMembership, fetchMyMemberships } from './members';
import { addTeam, applyTeams, deleteTeam, renameTeam } from './teams';
import { approveSubmission, fetchSubmissions, rejectSubmission, setSubmissionScan, submitGames } from './submissions';
import { claimPlayer, createPlayer, ensurePlayer, fetchEffectiveAverages, fetchPlayers } from './players';
import { stamped, type Wire } from './stamp';
import { openWorld, type TestWorld } from './testkit';
import type { BowlingEvent, Entry, League, Submission } from '../types';

// La foto se sube a Storage local como lo hará photos.ts.
vi.mock('../photos', async () => {
  const { fakeUpload } = await import('./testPhotos');
  const { getBackend } = await import('../backend');
  return {
    uploadScoreboardPhoto: (lid: string, img: { width: number; height: number }, photoId?: string) => fakeUpload(getBackend, lid, img, photoId),
    usePhoto: () => ({ data: null, loading: false, error: null }),
  };
});

const img = { data: 'data:image/webp;base64,AAAA', width: 800, height: 600, scan: '' };
const today = toIsoDate(new Date());

let w: TestWorld;
let lid: string;
let ownerId: string;
let anaId: string;
let anaPlayer: string;
let practice: string;

const baseInput = {
  name: 'Liga de los martes',
  kind: 'liga' as const,
  visibility: 'private' as const,
  venue: 'Bolera',
  schedule: 'Martes 7:00 pm',
  seasonStart: '',
  seasonEnd: '',
  contactName: 'Rosa',
  contactPhone: '18095551234',
  requirePhoto: false,
};

const practiceInput = {
  type: 'practica' as const,
  name: '',
  date: today,
  games: 3,
  hcpBase: 0,
  hcpPercent: 0,
  individualRankBy: 'scratch' as const,
  teamRankBy: 'scratch' as const,
  categoryCuts: [200, 175, 160] as [number, number, number],
  teamSize: 0,
  announcement: 'Nos vemos a las 7',
};

beforeAll(async () => {
  w = await openWorld();
  ownerId = await w.signUp('rosa@x.com', 'Rosa Dueña');
  anaId = await w.signUp('ana@x.com', 'Ana Pérez');
  await w.as('rosa@x.com');
}, 120_000);

afterAll(async () => {
  await w.close();
});

describe('liga completa con la base de verdad (PGlite + RLS)', () => {
  it('crear liga: el dueño queda como miembro con su jugador y un código', async () => {
    lid = await createLeague({ uid: ownerId, name: 'Rosa' }, baseInput);
    const league = stamped<League | null>(await fetchLeague(lid));
    expect(league).toMatchObject({ id: lid, name: 'Liga de los martes', ownerUid: ownerId, visibility: 'private', seasonStart: '', requirePhoto: false, sport: 'bowling' });
    expect(league!.createdAt!.toMillis()).toBeGreaterThan(0);
    const me = await fetchMembership(lid, ownerId);
    expect(me).toMatchObject({ id: `${lid}_${ownerId}`, role: 'owner', uid: ownerId, name: 'Rosa Dueña' });
    expect(me!.playerId).toBeTruthy();
    expect(await getInviteCode(lid)).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  });

  it('unirse con el código: sin código no se ve la liga; con él queda su jugador (reclama el del mismo nombre)', async () => {
    const code = (await getInviteCode(lid))!;
    // El admin ya tenía a "Ana Perez" en la lista (sin cuenta): al unirse se vincula sola por el nombre.
    const listed = await createPlayer(lid, 'Ana Perez', 190);
    await w.as('ana@x.com');
    expect(await fetchLeague(lid)).toBeNull();
    const invite = await getInvite(code.toLowerCase());
    expect(invite).toMatchObject({ id: code, leagueId: lid, leagueName: 'Liga de los martes' });
    expect(await getInvite('ZZZZZZZZ')).toBeNull();
    await expect(joinLeague(lid, { uid: anaId, name: 'Ana' }, 'ZZZZZZZZ')).rejects.toThrow(/código/);
    anaPlayer = (await joinLeague(lid, { uid: anaId, name: 'Ana' }, code))!;
    expect(anaPlayer).toBe(listed);
    expect((await fetchLeague(lid))?.name).toBe('Liga de los martes');
    const mine = await fetchMyMemberships(anaId);
    expect(mine).toEqual([expect.objectContaining({ leagueId: lid, role: 'member', playerId: listed })]);
    // Idempotente: volver a pedir su jugador da el mismo.
    expect(await ensurePlayer(lid, anaId, 'Ana')).toBe(listed);
    await expect(claimPlayer(lid, anaId, listed)).resolves.toBeUndefined();
  });

  it('práctica con «Voy», +1 juego (sin sumar dos veces) y en vivo', async () => {
    await w.as('rosa@x.com');
    practice = await createEvent(lid, practiceInput);
    await w.as('ana@x.com');
    await setRsvp(lid, practice, anaPlayer, true);
    let ev = stamped<BowlingEvent | null>((await fetchEvent(lid, practice))!);
    expect(ev).toMatchObject({ type: 'practica', games: 3, rsvp: { [anaPlayer]: true }, announcement: 'Nos vemos a las 7', teams: {} });
    // Dos teléfonos ven 3 juegos y los dos tocan "+1": queda en 4.
    await Promise.all([addEventGame(lid, { id: practice, games: 3, type: 'practica' }), addEventGame(lid, { id: practice, games: 3, type: 'practica' })]);
    ev = stamped<BowlingEvent | null>((await fetchEvent(lid, practice))!);
    expect(ev?.games).toBe(4);
    await setRsvp(lid, practice, anaPlayer, false);
    expect((await fetchEvent(lid, practice))?.rsvp).toEqual({});

    await publishLiveScores(lid, practice, anaPlayer, ['180', '', '']);
    const live = await fetchEventLive(lid, practice);
    expect(live).toEqual([expect.objectContaining({ id: `${practice}_${anaPlayer}`, playerId: anaPlayer, scores: [180] })]);
    // Consultar de nuevo sin cambios solo baja versiones y da lo mismo.
    expect(await fetchEventLive(lid, practice)).toEqual(live);
  });

  it('enviar juegos con foto (se sube antes) → leer la foto → aprobar → cuentan en las estadísticas', async () => {
    const { id, sent } = submitGames(lid, {
      playerId: anaPlayer,
      eventId: practice,
      date: null,
      scores: [180, 200],
      scanned: null,
      frames: null,
      photo: img,
    });
    await sent;
    // Lo enviado sale del en vivo.
    expect(await fetchEventLive(lid, practice)).toEqual([]);
    await setSubmissionScan(lid, id, [181, 200], 'ANA P');
    const subs = await fetchSubmissions({ kind: 'subs', lid, playerId: anaPlayer }, [{ col: 'player_id', op: 'eq', value: anaPlayer }]);
    expect(subs).toEqual([expect.objectContaining({ id, status: 'pendiente', scores: [180, 200], scanned: [181, 200], scannedName: 'ANA P', createdBy: anaId })]);
    const sub = stamped<Submission>(subs[0]);
    expect(sub.photoId).toBeTruthy();
    // Una cuenta sin permisos no aprueba.
    const event = stamped<BowlingEvent>((await fetchEvent(lid, practice))!);
    await expect(approveSubmission(lid, sub, event, null, 0, { 0: 181, 1: 200 }, 0)).rejects.toMatchObject({ kind: 'permission' });

    await w.as('rosa@x.com');
    const ana = (await fetchPlayers(lid)).find((p) => p.id === anaPlayer)!;
    expect(ana).toMatchObject({ name: 'Ana Perez', uid: anaId, averageOverride: 190 });
    // Promedio fijo del jugador que había creado el admin; sin fijo, el de sus juegos verificados (todavía ninguno).
    expect((await fetchEffectiveAverages(lid, [ana])).get(anaPlayer)).toBe(190);
    expect((await fetchEffectiveAverages(lid, [{ ...ana, averageOverride: null }])).get(anaPlayer)).toBe(0);
    const r = await approveSubmission(lid, sub, event, null, 190, { 0: 181, 1: 200 }, 0);
    expect(r.eventId).toBe(practice);
    expect((await fetchEffectiveAverages(lid, [{ ...ana, averageOverride: null }])).get(anaPlayer)).toBe(190); // (181 + 200) / 2, sin decimales como stats.ts
    const entries = await fetchEntries(lid, [{ col: 'event_id', op: 'eq', value: practice }]);
    const mine = entries.find((e) => e.playerId === anaPlayer)!;
    expect(mine.scores.slice(0, 2)).toEqual([181, 200]);
    expect(mine.photos.slice(0, 2)).toEqual([sub.photoId, sub.photoId]);
    expect(playerStats(entries.filter((e) => e.playerId === anaPlayer)).games).toBe(2);
    const done = await fetchSubmissions({ kind: 'subs', lid }, [{ col: 'id', op: 'eq', value: id }]);
    expect(done[0]).toMatchObject({ status: 'aprobado', reviewedBy: ownerId, eventId: practice });

    // La campana de Ana: su envío aprobado (con el evento para nombrarlo).
    await w.as('ana@x.com');
    const feeds = await fetchLeagueFeeds([{ id: `${lid}_${anaId}`, leagueId: lid, uid: anaId, name: 'Ana', role: 'member', playerId: anaPlayer }], '2000-01-01');
    expect(feeds[0].mySubs[0]).toMatchObject({ id, status: 'aprobado' });
    expect(feeds[0].events.map((e) => e.id)).toContain(practice);
    expect(typeof feeds[0].mySubs[0].reviewedAt).toBe('string');
    expect(stamped<Submission[]>(feeds[0].mySubs)[0].reviewedAt!.toMillis()).toBeGreaterThan(0);
  });

  it('envío por fecha: la práctica de ese día la crea la base al aprobar; rechazar deja la nota', async () => {
    const { id, sent } = submitGames(lid, { playerId: anaPlayer, eventId: null, date: '2026-01-06', scores: [150, 160, 170, 180], scanned: null, frames: null, photo: null });
    await sent;
    const second = submitGames(lid, { playerId: anaPlayer, eventId: null, date: '2026-01-07', scores: [99], scanned: null, frames: null, photo: null });
    await second.sent;
    await w.as('rosa@x.com');
    const events = stamped<BowlingEvent[]>(await fetchEvents(lid));
    const [sub] = await fetchSubmissions({ kind: 'subs', lid }, [{ col: 'id', op: 'eq', value: id }]);
    const target = await practiceForDate(lid, events, '2026-01-06', 4);
    expect(target.id).toBe('');
    const r = await approveSubmission(lid, stamped<Submission>(sub), target, null, 0, { 0: 150, 1: 160, 2: 170, 3: 180 }, 0);
    const created = stamped<BowlingEvent | null>((await fetchEvent(lid, r.eventId))!);
    expect(created).toMatchObject({ type: 'practica', date: '2026-01-06', games: 4 });
    const entries = await fetchEntries(lid, [{ col: 'event_id', op: 'eq', value: r.eventId }]);
    expect(entries[0]).toMatchObject({ playerId: anaPlayer, scores: [150, 160, 170, 180], photos: [NO_PHOTO, NO_PHOTO, NO_PHOTO, NO_PHOTO] });

    await rejectSubmission(lid, { id: second.id }, 'No hubo práctica ese día');
    const [rej] = await fetchSubmissions({ kind: 'subs', lid }, [{ col: 'id', op: 'eq', value: second.id }]);
    expect(rej).toMatchObject({ status: 'rechazado', note: 'No hubo práctica ese día' });
  });

  it('anotar por la cola: se ve de una en la caché y la base pone la marca sin foto', async () => {
    const event = stamped<BowlingEvent>((await fetchEvent(lid, practice))!);
    // La tabla del evento ya está en la caché (como si la pantalla estuviera abierta).
    const key = keys.eventEntries(practice);
    const loader = () => fetchEntries(lid, [{ col: 'event_id', op: 'eq', value: practice }]);
    const before = await fetchLive<Entry[]>(key, { kind: 'entries', lid, eventId: practice }, loader, { initial: [] });
    const entry = before.find((e) => e.playerId === anaPlayer)!;
    const saving = saveGame(lid, event, entry, 2, { score: 222, frames: null }, false);
    // Optimista: antes de que responda el servidor.
    expect(queryClient.getQueryData<Entry[]>(key)?.find((e) => e.id === entry.id)?.scores[2]).toBe(222);
    await saving;
    await currentOutbox()!.idle();
    const after = (await loader()).find((e) => e.id === entry.id)!;
    expect(after.scores.slice(0, 3)).toEqual([181, 200, 222]);
    expect(after.photos[2]).toBe(NO_PHOTO);
    // Borrar el juego.
    await saveGame(lid, event, entry, 2, { score: null, frames: null }, false);
    expect((await loader()).find((e) => e.id === entry.id)!.scores[2]).toBeNull();
  });

  it('equipos: crear, renombrar, armar de una vez y borrar (los integrantes quedan sin equipo)', async () => {
    const t = await createTournament({ uid: ownerId, name: 'Rosa' }, { ...baseInput, name: 'Copa de verano', kind: 'torneo' }, '2026-07-01');
    const players = await fetchPlayers(t.lid);
    const extra = await createPlayer(t.lid, 'Beto', 170);
    await addEntries(t.lid, { id: t.eid }, [...players.map((p) => ({ id: p.id, average: 180 })), { id: extra, average: 170 }]);
    const entries = await fetchEntries(t.lid, [{ col: 'event_id', op: 'eq', value: t.eid }]);
    expect(entries).toHaveLength(2);
    const team = await addTeam(t.lid, t.eid, 'Los Strikes');
    await renameTeam(t.lid, t.eid, team, 'Los Spares');
    let ev = stamped<BowlingEvent | null>((await fetchEvent(t.lid, t.eid))!);
    expect(ev).toMatchObject({ type: 'torneo', games: 3, hcpBase: 230, hcpPercent: 80, teamSize: 3, categoryCuts: [200, 175, 160], teams: { [team]: { name: 'Los Spares', order: 1 } } });
    await applyTeams(t.lid, ev!, [
      { teamId: team, name: 'Equipo A', entryIds: [entries[0].id] },
      { teamId: null, name: 'Equipo B', entryIds: [entries[1].id] },
    ]);
    ev = stamped<BowlingEvent | null>((await fetchEvent(t.lid, t.eid))!);
    expect(Object.values(ev!.teams).map((x) => x.name).sort()).toEqual(['Equipo A', 'Equipo B']);
    const assigned = await fetchEntries(t.lid, [{ col: 'event_id', op: 'eq', value: t.eid }]);
    expect(new Set(assigned.map((e) => e.teamId)).size).toBe(2);
    await deleteTeam(t.lid, t.eid, team, [entries[0].id]);
    const left = await fetchEntries(t.lid, [{ col: 'event_id', op: 'eq', value: t.eid }]);
    expect(left.find((e) => e.id === entries[0].id)?.teamId).toBeNull();
    // En un torneo, "Otro juego" lo hace el admin cambiando el evento.
    await addEventGame(t.lid, { id: t.eid, games: 3, type: 'torneo' });
    expect((await fetchEvent(t.lid, t.eid))?.games).toBe(4);
    await updateEvent(t.lid, t.eid, { name: 'Copa grande' });
    expect((await fetchEvent(t.lid, t.eid))?.name).toBe('Copa grande');
  });

  it('las horas del servidor llegan como texto a la caché y como toMillis() a la pantalla', async () => {
    const wire = (await fetchEvent(lid, practice)) as Wire<BowlingEvent>;
    expect(typeof wire.createdAt).toBe('string');
    const app = stamped<BowlingEvent>(wire);
    expect(app.createdAt!.toMillis()).toBe(Date.parse(wire.createdAt as string));
    // Mismos datos, mismo objeto (no dispara efectos de más).
    expect(stamped<BowlingEvent>(wire)).toBe(app);
  });
});
