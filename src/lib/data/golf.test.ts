import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEMO_COURSE } from '../../sports/golf/demo';
import { handicapFor } from '../../sports/golf/course';
import { DEFAULT_MERIT_POINTS } from '../../sports/golf/leaderboard';
import { currentOutbox } from './client';
import {
  addGolfPlayers,
  closeGolfRound,
  createGolfRound,
  createGolfTournament,
  deleteGolfTournament,
  fetchGolfCourses,
  fetchGolfEvent,
  fetchGolfIndexes,
  fetchGolfPlayer,
  fetchGolfRounds,
  fetchGolfRules,
  fetchGolfSeason,
  fetchGolfTournaments,
  golfCompetition,
  golfRules,
  queueGolfScores,
  registerGolf,
  saveGolfCourse,
  saveGolfRules,
  setGolfGroups,
  setGolfIndex,
  signGolfCard,
  updateGolfRound,
} from './golf';
import { createLeague, getInviteCode, joinLeague } from './leagues';
import { createPlayer } from './players';
import { flaky, openWorld, type FlakyBackend, type TestWorld } from './testkit';

let w: TestWorld;
let net: FlakyBackend;
let lid: string;
let course: string;
let round: string;
let rosaId: string;
let anaId: string;
let anaPlayer: string;
let pedro: string;
const cards: Record<string, string> = {};

const outbox = () => currentOutbox()!;

beforeAll(async () => {
  w = await openWorld();
  anaId = await w.signUp('ana@x.com', 'Ana');
  rosaId = await w.signUp('rosa@x.com', 'Rosa');
  // El golf está en beta: lo crea el superadmin.
  await w.makeSuper(rosaId);
  lid = await createLeague(
    { uid: rosaId, name: 'Rosa' },
    { name: 'Golf del Club', kind: 'liga', visibility: 'private', venue: 'Campo', schedule: '', seasonStart: '', seasonEnd: '', contactName: '', contactPhone: '', requirePhoto: false, sport: 'golf' },
  );
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

describe('reglas', () => {
  it('normaliza lo que viene de la base (con valores por defecto)', () => {
    expect(golfRules(null)).toEqual({ competition: { format: 'stroke', basis: 'net', allowance: 95 }, meritPoints: DEFAULT_MERIT_POINTS });
    expect(golfCompetition({ format: 'stableford', basis: 'gross', allowance: 100 })).toEqual({ format: 'stableford', basis: 'gross', allowance: 100 });
    expect(golfCompetition({ format: 'otro' })).toEqual({ format: 'stroke', basis: 'net', allowance: 95 });
    expect(golfCompetition({ format: 'maxScore', maxScore: { kind: 'doublePar' } })).toMatchObject({ format: 'maxScore', maxScore: { kind: 'doublePar' } });
  });

  it('la liga nace con las reglas del registro; el admin las cambia sin perder otras claves', async () => {
    expect(await fetchGolfRules(lid)).toEqual({ competition: { format: 'stroke', basis: 'net', allowance: 95 }, meritPoints: DEFAULT_MERIT_POINTS });
    await saveGolfRules(lid, { competition: { format: 'stableford', basis: 'net', allowance: 95 }, meritPoints: [10, 6, 4] });
    expect(await fetchGolfRules(lid)).toEqual({ competition: { format: 'stableford', basis: 'net', allowance: 95 }, meritPoints: [10, 6, 4] });
    const [row] = (await w.b.db.query<{ rules: Record<string, unknown> }>('select rules from public.leagues where id = $1', [lid])).rows;
    expect(Object.keys(row.rules).sort()).toEqual(['competition', 'meritPoints']);
  });
});

describe('campos, rondas y tarjetas con la base de verdad', () => {
  it('campo y ronda: la ronda lleva la copia del campo', async () => {
    const { id: _id, ...demo } = DEMO_COURSE;
    course = await saveGolfCourse(lid, demo);
    expect(await fetchGolfCourses(lid)).toEqual([expect.objectContaining({ id: course, name: 'Campo de ejemplo', holes: DEMO_COURSE.holes })]);
    round = await createGolfRound(lid, { date: '2026-10-10', courseId: course, name: 'Mensual de octubre' });
    const rounds = await fetchGolfRounds(lid);
    expect(rounds).toEqual([
      expect.objectContaining({ eventId: round, courseId: course, courseName: 'Campo de ejemplo', holes: 18, nine: 'all', closed: false, tournamentId: null }),
    ]);
    // La competencia sale de las reglas de la liga (Stableford desde la prueba anterior).
    expect(rounds[0].competition).toEqual({ format: 'stableford', basis: 'net', allowance: 95 });
    const ev = await fetchGolfEvent(lid, round);
    expect(ev.round?.course.tees.map((t) => t.id)).toEqual(['azul', 'roja']);
    expect(ev.cards).toEqual([]);
  });

  it('inscripción: el Index del perfil queda congelado y el handicap sale como en el motor', async () => {
    const code = (await getInviteCode(lid))!;
    pedro = await createPlayer(lid, 'Pedro', null);
    await w.as('ana@x.com');
    anaPlayer = (await joinLeague(lid, { uid: anaId, name: 'Ana' }, code))!;
    await setGolfIndex(lid, anaPlayer, 14.2);
    expect((await fetchGolfIndexes(lid))[anaPlayer]).toMatchObject({ index: 14.2 });
    cards.ana = await registerGolf(lid, round, { teeId: 'roja' });
    await w.as('rosa@x.com');
    expect(await addGolfPlayers(lid, round, [{ playerId: pedro, index: 30 }])).toBe(1);
    const ev = await fetchGolfEvent(lid, round);
    const ana = ev.cards.find((c) => c.playerId === anaPlayer)!;
    expect(ana).toMatchObject({ hcpIndex: 14.2, teeId: 'roja', playingHcp: handicapFor(14.2, DEMO_COURSE, 'roja').playingHcp, strokes: Array(18).fill(null), signed: false });
    cards.pedro = ev.cards.find((c) => c.playerId === pedro)!.id;
    expect(ev.cards.find((c) => c.playerId === pedro)?.playingHcp).toBe(handicapFor(30, DEMO_COURSE, 'azul').playingHcp);
    await setGolfGroups(lid, round, [
      { cardId: cards.ana, groupNo: 1 },
      { cardId: cards.pedro, groupNo: 1 },
    ]);
    expect((await fetchGolfEvent(lid, round)).cards.map((c) => c.groupNo)).toEqual([1, 1]);
  });

  it('la tarjeta del grupo por la cola: sin señal se junta en un solo envío y sale al volver', async () => {
    await w.as('ana@x.com');
    net.offline = true;
    const a = queueGolfScores(lid, round, [
      { cardId: cards.ana, holes: [0, 1, 2].map((i) => ({ i, s: 5, p: 2, u: false })) },
      { cardId: cards.pedro, holes: [0, 1, 2].map((i) => ({ i, s: 6, p: null, u: false })) },
    ]);
    const b = queueGolfScores(lid, round, [
      { cardId: cards.ana, holes: [0, 1, 2, 3, 4, 5].map((i) => ({ i, s: 5, p: 2, u: false })) },
      { cardId: cards.pedro, holes: [0, 1, 2, 3, 4, 5].map((i) => ({ i, s: i === 5 ? null : 6, p: null, u: i === 5 })) },
    ]);
    expect(outbox().getSnapshot().pendingCount).toBe(1);
    expect(net.calls).toHaveLength(0);
    net.offline = false;
    await outbox().flush();
    expect(await a.done).toBe(12);
    expect(await b.done).toBe(12);
    expect(net.calls.filter((c) => c.fn === 'golf_save_hole_scores')).toHaveLength(1);
    const ev = await fetchGolfEvent(lid, round);
    const pe = ev.cards.find((c) => c.id === cards.pedro)!;
    expect(pe.strokes.slice(0, 7)).toEqual([6, 6, 6, 6, 6, null, null]);
    expect(pe.pickedUp[5]).toBe(true);
    expect(ev.cards.find((c) => c.id === cards.ana)!.putts.slice(0, 6)).toEqual([2, 2, 2, 2, 2, 2]);
  });

  it('si se pierde la respuesta se reenvía con el mismo op_id; firmar va después de los hoyos', async () => {
    net.dropReplies = 1;
    const all = Array.from({ length: 18 }, (_, i) => ({ i, s: DEMO_COURSE.holes[i].par, p: null, u: false }));
    const q = queueGolfScores(lid, round, [{ cardId: cards.ana, holes: all }]);
    const signed = signGolfCard(lid, round, cards.ana);
    await outbox().flush();
    await outbox().flush();
    await q.done;
    await signed;
    await outbox().idle();
    const calls = net.calls.filter((c) => c.fn === 'golf_save_hole_scores');
    expect(calls.length).toBe(2);
    expect(calls[0].args.p_op_id).toBe(calls[1].args.p_op_id);
    const ana = (await fetchGolfEvent(lid, round)).cards.find((c) => c.id === cards.ana)!;
    expect(ana.signed).toBe(true);
    expect(ana.strokes).toEqual(DEMO_COURSE.holes.map((h) => h.par));
  });

  it('cerrar la ronda: entra en la temporada; el perfil trae sus rondas con el campo', async () => {
    await w.as('rosa@x.com');
    expect((await fetchGolfSeason(lid)).rounds).toHaveLength(0);
    await closeGolfRound(lid, round);
    const season = await fetchGolfSeason(lid);
    expect(season.rounds.map((r) => [r.eventId, r.closed])).toEqual([[round, true]]);
    expect(season.cards.map((c) => c.id).sort()).toEqual([cards.ana, cards.pedro].sort());
    const mine = await fetchGolfPlayer(lid, anaPlayer);
    expect(mine.cards).toHaveLength(1);
    expect(mine.rounds[0].course.holes).toHaveLength(18);
    await expect(updateGolfRound(lid, round, { shotgun: true })).rejects.toThrow();
    await closeGolfRound(lid, round, false);
    await updateGolfRound(lid, round, { shotgun: true });
    expect((await fetchGolfRounds(lid)).find((r) => r.eventId === round)?.shotgun).toBe(true);
  });

  it('torneo de varias rondas', async () => {
    const t = await createGolfTournament(lid, { name: 'Copa', dates: ['2026-11-07', '2026-11-08'], courseId: course, nine: 'front' });
    expect(t.eventIds).toHaveLength(2);
    expect(await fetchGolfTournaments(lid)).toEqual([{ id: t.tournamentId, name: 'Copa' }]);
    const rounds = (await fetchGolfRounds(lid)).filter((r) => r.tournamentId === t.tournamentId);
    expect(rounds.map((r) => [r.roundNo, r.holes]).sort()).toEqual([
      [1, 9],
      [2, 9],
    ]);
    await deleteGolfTournament(lid, t.tournamentId);
    expect(await fetchGolfTournaments(lid)).toEqual([]);
    expect((await fetchGolfRounds(lid)).filter((r) => r.tournamentId === t.tournamentId)).toEqual([]);
  });
});
