import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEMO_COURSE, DEMO_PARS } from '../../sports/golf/demo';
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
  pendingGolfSign,
  queueGolfScores,
  queueGolfSign,
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
import { cardWire, emptyLog, markSent, mergeCard, readLog, sendPending, setHole, unsentPatches, writeLog, type CardWriter } from '../../pages/sports/golf/courtLog';

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

  it('la tarjeta del grupo por la cola: sin señal se junta en un envío por tarjeta y sale al volver', async () => {
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
    // Una pendiente por tarjeta: la segunda de cada tarjeta reemplazó a la primera.
    expect(outbox().getSnapshot().pendingCount).toBe(2);
    expect(net.calls).toHaveLength(0);
    net.offline = false;
    await outbox().flush();
    expect(await Promise.all(a.map((x) => x.done))).toEqual([6, 6]);
    expect(await Promise.all(b.map((x) => x.done))).toEqual([6, 6]);
    const calls = net.calls.filter((c) => c.fn === 'golf_save_hole_scores');
    expect(calls).toHaveLength(2);
    expect(calls.map((c) => (c.args.p_cards as { card_id: string }[]).map((x) => x.card_id))).toEqual([[cards.ana], [cards.pedro]]);
    const ev = await fetchGolfEvent(lid, round);
    const pe = ev.cards.find((c) => c.id === cards.pedro)!;
    expect(pe.strokes.slice(0, 7)).toEqual([6, 6, 6, 6, 6, null, null]);
    expect(pe.pickedUp[5]).toBe(true);
    expect(ev.cards.find((c) => c.id === cards.ana)!.putts.slice(0, 6)).toEqual([2, 2, 2, 2, 2, 2]);
  });

  it('si se pierde la respuesta se reenvía con el mismo op_id; firmar va después de los hoyos', async () => {
    net.dropReplies = 1;
    const all = Array.from({ length: 18 }, (_, i) => ({ i, s: DEMO_COURSE.holes[i].par, p: null, u: false }));
    const [q] = queueGolfScores(lid, round, [{ cardId: cards.ana, holes: all }]);
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

describe('la tarjeta en el campo desde el teléfono (courtLog + cola)', () => {
  let r2: string;
  const c2: Record<string, string> = {};
  const who = (): CardWriter => ({ isAdmin: false, staff: false, myCard: { id: c2.ana, groupNo: 1 } });
  const serverCards = async () => (await fetchGolfEvent(lid, r2)).cards;
  const settle = () => new Promise((r) => setTimeout(r, 0));
  const clearFailed = async () => {
    for (const f of outbox().listFailed()) await outbox().discard(f.opId);
  };

  beforeAll(async () => {
    await w.as('rosa@x.com');
    r2 = await createGolfRound(lid, { date: '2026-10-17', courseId: course, name: 'Fin de mes' });
    const luis = await createPlayer(lid, 'Luis', null);
    await w.as('ana@x.com');
    c2.ana = await registerGolf(lid, r2);
    await w.as('rosa@x.com');
    await addGolfPlayers(lid, r2, [{ playerId: pedro }, { playerId: luis }]);
    const ev = await fetchGolfEvent(lid, r2);
    c2.pedro = ev.cards.find((c) => c.playerId === pedro)!.id;
    c2.luis = ev.cards.find((c) => c.playerId === luis)!.id;
    await setGolfGroups(lid, r2, [
      { cardId: c2.ana, groupNo: 1 },
      { cardId: c2.pedro, groupNo: 1 },
      { cardId: c2.luis, groupNo: 2 },
    ]);
  });

  it('va por cuenta y por tarjeta: solo lo que la cuenta puede escribir; una tarjeta rechazada no frena las demás', async () => {
    await w.as('ana@x.com');
    // Lo que anotó otra cuenta (Rosa) en este teléfono no es de Ana: ni lo ve ni lo manda.
    writeLog(setHole(emptyLog(r2, rosaId), c2.luis, 0, { s: 3, p: null, u: false }));
    expect(readLog(r2, anaId).holes).toEqual({});
    let log = emptyLog(r2, anaId);
    for (const id of [c2.ana, c2.pedro, c2.luis]) log = setHole(log, id, 0, { s: 5, p: null, u: false });
    writeLog(log);
    // Mientras tanto el admin firmó la tarjeta de Pedro (el teléfono de Ana todavía no lo sabe).
    const stale = await serverCards();
    await w.b.db.query(`update public.golf_cards set status = 'firmada' where id = $1`, [c2.pedro]);
    const wait = sendPending(lid, r2, stale, who())!;
    await outbox().flush();
    await expect(wait).rejects.toThrow('cerrado');
    await settle();
    // Una llamada por tarjeta; la de Luis (otro grupo) ni se manda.
    const calls = net.calls.filter((c) => c.fn === 'golf_save_hole_scores');
    expect(calls.map((c) => (c.args.p_cards as { card_id: string }[]).map((x) => x.card_id))).toEqual([[c2.ana], [c2.pedro]]);
    const after = await serverCards();
    expect(after.find((c) => c.id === c2.ana)!.strokes[0]).toBe(5);
    expect(after.find((c) => c.id === c2.pedro)!.strokes[0]).toBeNull();
    expect(after.find((c) => c.id === c2.luis)!.strokes[0]).toBeNull();
    // La de Ana quedó enviada; la rechazada salió del teléfono (queda en «no se pudo enviar») y no se vuelve a armar.
    const now = readLog(r2, anaId);
    expect(now.holes[c2.ana]['0'].sentAt).toBeTypeOf('number');
    expect(now.holes[c2.pedro]).toBeUndefined();
    expect(outbox().listFailed()).toHaveLength(1);
    expect(sendPending(lid, r2, after, who())).toBeNull();
    expect(readLog(r2, rosaId).holes[c2.luis]).toBeDefined();
    await clearFailed();
  });

  it('la firma no depende del orden: «Enviar» otra vez no pasa los hoyos detrás de ella y la firma lleva la tarjeta revisada', async () => {
    await w.b.db.query(`update public.golf_cards set status = 'abierta' where id = $1`, [c2.pedro]);
    await w.as('ana@x.com');
    let log = emptyLog(r2, anaId);
    DEMO_PARS.forEach((par, i) => (log = setHole(log, c2.ana, i, { s: par, p: null, u: false })));
    writeLog(log);
    const cardsNow = await serverCards();
    net.offline = true;
    // «Revisar y firmar»: salen los hoyos (G1) y detrás la firma, con la tarjeta tal como se revisó.
    const g1 = sendPending(lid, r2, cardsNow, who())!;
    const reviewed = { cardId: c2.ana, holes: cardWire(mergeCard(cardsNow.find((c) => c.id === c2.ana)!, readLog(r2, anaId))) };
    const sign = queueGolfSign(lid, r2, c2.ana, { holes: reviewed.holes });
    void sign.done.then(() => writeLog(markSent(readLog(r2, anaId), [reviewed], Date.now())));
    expect(pendingGolfSign(lid, c2.ana)).toBe(true);
    // «Enviar» otra vez sin cambios: ya está igual en la cola, no se vuelve a encolar (quedaría detrás de la firma).
    expect(sendPending(lid, r2, cardsNow, who())).toBeNull();
    expect(outbox().getSnapshot().pendingCount).toBe(2);
    // Un hoyo de un compañero sale aparte, sin mover los de Ana.
    writeLog(setHole(readLog(r2, anaId), c2.pedro, 1, { s: 4, p: null, u: false }));
    const gp = sendPending(lid, r2, cardsNow, who())!;
    // Y un cambio en la de Ana después de firmar (en pantalla solo el admin puede) sí queda detrás de la firma.
    writeLog(setHole(readLog(r2, anaId), c2.ana, 0, { s: 9, p: null, u: false }));
    const g2 = sendPending(lid, r2, cardsNow, who())!;
    const order = outbox()
      .listPending(lid)
      .map((o) => (o.fn === 'golf_sign_card' ? 'firma' : (o.args.p_cards as { card_id: string }[])[0].card_id));
    expect(order).toEqual(['firma', c2.pedro, c2.ana]);
    net.offline = false;
    await outbox().flush();
    // La firma guarda la tarjeta revisada y firma; el cambio de después ya no entra (firmada).
    await sign.done;
    expect(await gp).toBe(1);
    await expect(g2).rejects.toThrow('cerrado');
    await expect(g1).rejects.toThrow('cerrado');
    await settle();
    const after = await serverCards();
    const ana = after.find((c) => c.id === c2.ana)!;
    expect(ana.signed).toBe(true);
    expect(ana.strokes).toEqual(DEMO_PARS);
    expect(after.find((c) => c.id === c2.pedro)!.strokes[1]).toBe(4);
    expect(pendingGolfSign(lid, c2.ana)).toBe(false);
    expect(unsentPatches(readLog(r2, anaId))).toEqual([]);
    await clearFailed();
  });
});
