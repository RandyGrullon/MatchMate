import { describe, expect, it } from 'vitest';
import { DEMO_COURSE, DEMO_PARS } from '../../../sports/golf/demo';
import type { GolfCardDoc, GolfRoundDoc, GolfRoundFull } from '../../../lib/data/golf';
import {
  canWriteCard,
  dropUnsent,
  emptyLog,
  groupHolesDone,
  groupOrder,
  markSent,
  mergeCard,
  nextGroupHole,
  readLog,
  reconcile,
  setHole,
  shouldPublish,
  unsentCount,
  unsentPatches,
  writeLog,
} from './courtLog';
import {
  bestRounds,
  boardModes,
  cardHoles,
  formatLabel,
  meritEvents,
  modeCompetition,
  playedRounds,
  playerStats,
  roundBoard,
  seasonMerit,
  startIndex,
  thruText,
  toParText,
  tournamentBoard,
} from './logic';

const round = (eventId: string, extra: Partial<GolfRoundFull> = {}): GolfRoundFull => ({
  eventId,
  courseId: 'demo',
  courseName: DEMO_COURSE.name,
  holes: 18,
  nine: 'all',
  competition: { format: 'stroke', basis: 'net', allowance: 95 },
  shotgun: false,
  tournamentId: null,
  roundNo: null,
  closed: false,
  closedAt: null,
  course: DEMO_COURSE,
  ...extra,
});

const card = (id: string, eventId: string, playerId: string, strokes: (number | null)[], extra: Partial<GolfCardDoc> = {}): GolfCardDoc => ({
  id,
  eventId,
  playerId,
  teeId: 'azul',
  hcpIndex: 0,
  courseHcp: 0,
  playingHcp: 0,
  groupNo: 1,
  startHole: 1,
  strokes,
  putts: strokes.map(() => null),
  pickedUp: strokes.map(() => false),
  signed: false,
  signedAt: null,
  scoredAt: null,
  dq: false,
  ...extra,
});

const pars = (delta: (i: number) => number = () => 0) => DEMO_PARS.map((p, i) => p + delta(i));

describe('de la base al motor', () => {
  it('hoyos de la tarjeta según su salida y sus 9 hoyos', () => {
    expect(cardHoles(round('e'), 'roja')[3]).toEqual({ number: 4, par: 4, si: 1 });
    const back = cardHoles(round('e', { nine: 'back', holes: 9 }), 'azul');
    expect(back.map((h) => h.number)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18]);
    expect(startIndex(round('e', { nine: 'back' }), 13)).toBe(3);
    expect(startIndex(round('e'), 10)).toBe(9);
  });

  it('leaderboard de la ronda: neto con handicap, a mitad de ronda por golpes contra el par', () => {
    const r = round('e');
    const a = card('ca', 'e', 'a', pars((i) => (i === 0 ? 1 : 0)), { playingHcp: 2 });
    const b = card('cb', 'e', 'b', [...pars().slice(0, 9), ...Array(9).fill(null)]);
    const rows = roundBoard(r, [a, b], r.competition);
    // a: +1 bruto, −1 neto. b: par en 9 hoyos.
    expect(rows.map((x) => [x.id, x.rank, x.netToPar, x.thru])).toEqual([
      ['a', 1, -1, 18],
      ['b', 2, 0, 9],
    ]);
    // Cerrada: quien no terminó queda sin puesto.
    const closed = roundBoard({ ...r, closed: true }, [a, b], r.competition);
    expect(closed.find((x) => x.id === 'b')).toMatchObject({ rank: null, unfinished: true, dq: true });
  });

  it('modos del leaderboard', () => {
    const comp = { format: 'stableford' as const, basis: 'net' as const, allowance: 95 };
    expect(boardModes(comp)).toEqual(['official', 'net', 'gross']);
    expect(modeCompetition(comp, 'gross')).toEqual({ format: 'stroke', basis: 'gross', allowance: 95 });
    expect(formatLabel(comp)).toBe('Stableford');
    expect(formatLabel({ format: 'stroke', basis: 'gross' })).toBe('Stroke play bruto');
  });

  it('torneo: suma las rondas; el orden de mérito cuenta el torneo como un evento cuando todas cerraron', () => {
    const r1 = round('r1', { tournamentId: 't', roundNo: 1, closed: true });
    const r2 = round('r2', { tournamentId: 't', roundNo: 2, closed: true });
    const suelta = round('s', { closed: true });
    const cards = [
      card('1a', 'r1', 'a', pars()),
      card('2a', 'r2', 'a', pars((i) => (i === 0 ? 1 : 0))),
      card('1b', 'r1', 'b', pars((i) => (i === 0 ? 2 : 0))),
      card('2b', 'r2', 'b', pars()),
      card('sa', 's', 'a', pars((i) => (i < 2 ? 1 : 0))),
      card('sb', 's', 'b', pars()),
    ];
    const board = tournamentBoard([r2, r1], cards, r1.competition);
    expect(board.map((x) => [x.id, x.rank, x.netToPar])).toEqual([
      ['a', 1, 1],
      ['b', 2, 2],
    ]);
    const light: GolfRoundDoc[] = [r1, r2, suelta].map(({ course: _c, ...x }) => x);
    const events = meritEvents({ rounds: [r1, r2, suelta], cards }, light);
    expect(events.map((e) => [e.kind, e.id])).toEqual([
      ['ronda', 's'],
      ['torneo', 't'],
    ]);
    const merit = seasonMerit(events, [10, 5]);
    // Cada uno ganó un evento: empatan en puntos y victorias y comparten el 1.º.
    expect(merit.map((m) => [m.id, m.points, m.rank]).sort()).toEqual([
      ['a', 15, 1],
      ['b', 15, 1],
    ]);
    // Una ronda del torneo todavía abierta: el torneo no cuenta.
    const open = meritEvents({ rounds: [r1, suelta], cards }, [...light.slice(0, 1), { ...light[1], closed: false }, light[2]]);
    expect(open.map((e) => e.id)).toEqual(['s']);
    // Fuera de la temporada no cuenta.
    expect(meritEvents({ rounds: [r1, r2, suelta], cards }, light, (id) => id !== 's').map((e) => e.id)).toEqual(['t']);
  });

  it('torneo: quien no jugó una ronda ya cerrada no sale con puesto ni gana el orden de mérito', () => {
    const comp = { format: 'stroke' as const, basis: 'gross' as const, allowance: 100 };
    const r1 = round('r1', { tournamentId: 't', roundNo: 1, closed: true, competition: comp });
    const r2 = round('r2', { tournamentId: 't', roundNo: 2, closed: true, competition: comp });
    // A: −1 y +1 (E en las dos). B: −2 en la ronda 1 y no se inscribió en la 2.
    const cards = [
      card('1a', 'r1', 'a', pars((i) => (i === 0 ? -1 : 0))),
      card('2a', 'r2', 'a', pars((i) => (i === 0 ? 1 : 0))),
      card('1b', 'r1', 'b', pars((i) => (i < 2 ? -1 : 0))),
    ];
    const board = tournamentBoard([r1, r2], cards, comp);
    expect(board.map((x) => [x.id, x.rank, x.unfinished])).toEqual([
      ['a', 1, false],
      ['b', null, true],
    ]);
    const light: GolfRoundDoc[] = [r1, r2].map(({ course: _c, ...x }) => x);
    const events = meritEvents({ rounds: [r1, r2], cards }, light);
    expect(events[0].rows).toEqual([
      { id: 'a', rank: 1 },
      { id: 'b', rank: null },
    ]);
    expect(seasonMerit(events, [25, 20]).map((m) => [m.id, m.points])).toEqual([
      ['a', 25],
      ['b', 0],
    ]);
    // Con la ronda 2 todavía abierta, B sigue en el leaderboard con lo que lleva (−2 en 18 hoyos).
    const live = tournamentBoard([r1, { ...r2, closed: false }], cards, comp);
    expect(live.map((x) => [x.id, x.rank, x.toPar, x.unfinished])).toEqual([
      ['b', 1, -2, false],
      ['a', 2, 0, false],
    ]);
    // Tarjeta de la ronda cerrada sin terminar: tampoco tiene puesto.
    const half = [...cards, card('2b', 'r2', 'b', [...pars().slice(0, 9), ...Array(9).fill(null)])];
    expect(tournamentBoard([r1, r2], half, comp).find((x) => x.id === 'b')).toMatchObject({ rank: null, unfinished: true });
  });

  it('estadísticas: solo tarjetas firmadas o de rondas cerradas, sin descalificar', () => {
    const rs = [round('x', { closed: true }), round('y'), round('z')];
    const cards = [
      card('cx', 'x', 'a', pars((i) => (i === 0 ? -1 : 0))),
      card('cy', 'y', 'a', pars(), { signed: true }),
      card('cz', 'z', 'a', pars()),
    ];
    const played = playedRounds({ cards, rounds: rs });
    expect(played.map((p) => p.eventId).sort()).toEqual(['x', 'y']);
    const stats = playerStats(played);
    expect(stats.rounds).toBe(2);
    expect(stats.birdies).toBe(1);
    expect(stats.eighteen.bestGross).toBe(71);
    expect(bestRounds(played)[0].eventId).toBe('x');
  });

  it('textos', () => {
    expect([toParText(0), toParText(3), toParText(-2), toParText(null)]).toEqual(['E', '+3', '−2', '–']);
    expect([thruText(0, 18), thruText(7, 18), thruText(18, 18)]).toEqual(['–', '7', 'F']);
  });
});

describe('lo anotado en el teléfono', () => {
  const c1 = card('c1', 'e', 'a', Array(18).fill(null));
  const c2 = card('c2', 'e', 'b', Array(18).fill(null));

  it('se guarda por hoyo y se ve encima de lo del servidor', () => {
    let log = setHole(emptyLog('e'), 'c1', 0, { s: 5, p: 2, u: false });
    log = setHole(log, 'c2', 0, { s: null, p: 3, u: true });
    const m1 = mergeCard(c1, log);
    expect([m1.strokes[0], m1.putts[0], m1.pickedUp[0]]).toEqual([5, 2, false]);
    // Recoger borra los putts.
    const m2 = mergeCard(c2, log);
    expect([m2.strokes[0], m2.putts[0], m2.pickedUp[0]]).toEqual([null, null, true]);
    expect(unsentCount(log)).toBe(2);
    writeLog(log);
    expect(readLog('e').holes).toEqual(log.holes);
  });

  it('enviado → confirmado → el servidor lo trae: se borra; lo cambiado después se vuelve a mandar', () => {
    let log = setHole(emptyLog('e'), 'c1', 0, { s: 5, p: null, u: false });
    const sent = unsentPatches(log);
    expect(sent).toEqual([{ cardId: 'c1', holes: [{ i: 0, s: 5, p: null, u: false }] }]);
    // Mientras se enviaba, se anotó el hoyo 2.
    log = setHole(log, 'c1', 1, { s: 4, p: null, u: false });
    log = markSent(log, sent, 1000);
    expect(unsentPatches(log)).toEqual([{ cardId: 'c1', holes: [{ i: 1, s: 4, p: null, u: false }] }]);
    // El servidor todavía no lo trae: se sigue viendo lo enviado.
    log = reconcile(log, [c1], 2000);
    expect(mergeCard(c1, log).strokes.slice(0, 2)).toEqual([5, 4]);
    // Ya lo trae: se borra ese hoyo.
    const server = { ...c1, strokes: [5, ...c1.strokes.slice(1)] };
    log = reconcile(log, [server], 3000);
    expect(Object.keys(log.holes.c1)).toEqual(['1']);
    // Otro teléfono lo cambió después: pasado el minuto gana el servidor.
    let other = setHole(emptyLog('e'), 'c1', 0, { s: 7, p: null, u: false });
    other = markSent(other, unsentPatches(other), 0);
    expect(reconcile(other, [server], 30_000).holes.c1).toBeDefined();
    expect(reconcile(other, [server], 61_000).holes.c1).toBeUndefined();
    // Tarjeta que ya no existe: fuera. Sin datos del servidor no se toca nada.
    expect(reconcile(other, [c2], 0).holes).toEqual({});
    expect(reconcile(other, [], 0)).toBe(other);
    // Lo que no se ha enviado se queda aunque el servidor (o su copia vieja) ya tenga ese valor.
    const unsent = setHole(emptyLog('e'), 'c1', 0, { s: 5, p: null, u: false });
    expect(reconcile(unsent, [server], 0)).toBe(unsent);
  });

  it('va por cuenta: otra cuenta en el mismo teléfono no ve ni manda lo anotado', () => {
    writeLog(setHole(emptyLog('e', 'u1'), 'c1', 0, { s: 5, p: null, u: false }));
    expect(readLog('e', 'u1').holes.c1).toBeDefined();
    expect(readLog('e', 'u1').uid).toBe('u1');
    expect(readLog('e', 'u2').holes).toEqual({});
    expect(unsentPatches(readLog('e', 'u2'))).toEqual([]);
  });

  it('solo las tarjetas que la cuenta puede escribir; lo rechazado sale del teléfono; lo firmado no se queda', () => {
    const mine = { ...c1, groupNo: 1 };
    const mate = { ...c2, groupNo: 1 };
    const other = card('c3', 'e', 'c', Array(18).fill(null), { groupNo: 2 });
    const player = { isAdmin: false, staff: false, myCard: mine };
    expect([mine, mate, other].map((c) => canWriteCard(c, player))).toEqual([true, true, false]);
    expect(canWriteCard({ ...mate, signed: true }, player)).toBe(false);
    expect(canWriteCard(other, { isAdmin: false, staff: false, myCard: { id: 'c1', groupNo: null } })).toBe(false);
    expect(canWriteCard({ ...other, signed: true }, { isAdmin: false, staff: true, myCard: null })).toBe(false);
    expect(canWriteCard({ ...other, signed: true }, { isAdmin: true, staff: true, myCard: null })).toBe(true);
    let log = emptyLog('e', 'u1');
    for (const id of ['c1', 'c2', 'c3']) log = setHole(log, id, 0, { s: 5, p: null, u: false });
    const can = (id: string) => canWriteCard([mine, mate, other].find((c) => c.id === id)!, player);
    expect(unsentPatches(log, can).map((p) => p.cardId)).toEqual(['c1', 'c2']);
    expect(unsentCount(log, can)).toBe(2);
    // Rechazada para siempre: salen los hoyos de ese envío que no se cambiaron después.
    const sent = unsentPatches(log).find((p) => p.cardId === 'c2')!;
    log = setHole(log, 'c2', 1, { s: 4, p: null, u: false });
    log = dropUnsent(log, sent);
    expect(log.holes.c2).toEqual({ '1': { s: 4, p: null, u: false } });
    expect(dropUnsent(log, sent)).toBe(log);
    // Tarjeta firmada en el servidor: lo del teléfono no se queda (quien no es admin ya no la cambia).
    const signed = { ...c2, signed: true };
    expect(reconcile(log, [c1, signed], 0, (c) => !c.signed).holes.c2).toBeUndefined();
    expect(reconcile(log, [c1, signed], 0).holes.c2).toBeDefined();
  });

  it('el grupo avanza al próximo hoyo sin anotar, en su orden de juego, y publica cada 3', () => {
    const order = groupOrder(18, 9);
    expect(order.slice(0, 3)).toEqual([9, 10, 11]);
    const a = { strokes: Array(18).fill(null), pickedUp: Array(18).fill(false) };
    const b = { strokes: Array(18).fill(null), pickedUp: Array(18).fill(false) };
    expect(nextGroupHole([a, b], order)).toBe(9);
    a.strokes[9] = 4;
    expect(nextGroupHole([a, b], order, 9)).toBe(10);
    // b todavía no tiene el 10: el grupo vuelve a él cuando no queda nada más.
    b.pickedUp[9] = true;
    expect(groupHolesDone([a, b], 18)).toBe(1);
    expect(shouldPublish(2, 3, 18)).toBe(true);
    expect(shouldPublish(3, 4, 18)).toBe(false);
    expect(shouldPublish(16, 18, 18)).toBe(true);
    expect(shouldPublish(3, 3, 18)).toBe(false);
    const full = { strokes: Array(18).fill(4), pickedUp: Array(18).fill(false) };
    expect(nextGroupHole([full], order, 5)).toBeNull();
  });
});

describe('formularios', () => {
  it('Index escrito a mano: coma o punto, plus con +, vacío = sin Index', async () => {
    const { parseIndex, indexInput } = await import('./GolfPlayers');
    expect(parseIndex('12,4')).toBe(12.4);
    expect(parseIndex(' 8 ')).toBe(8);
    expect(parseIndex('+1.2')).toBe(-1.2);
    expect(parseIndex('')).toBeNull();
    expect(parseIndex('abc')).toBeNaN();
    expect(indexInput(-1.2)).toBe('+1.2');
    expect(indexInput(null)).toBe('');
  });

  it('grupos de a 4 por handicap, parejos', async () => {
    const { autoGroups } = await import('./GolfPlayers');
    const cards = Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, playingHcp: 20 - i }));
    const g = autoGroups(cards);
    const sizes = [1, 2, 3].map((n) => [...g.values()].filter((x) => x === n).length);
    expect(sizes).toEqual([4, 3, 3]);
    // Los de handicap más bajo juntos en el grupo 1.
    expect(g.get('c9')).toBe(1);
    expect(g.get('c0')).toBe(3);
  });

  it('editor de campo: el borrador arma un campo válido con el par de cada salida', async () => {
    const { draftCourse, defaultSis } = await import('./GolfAdmin');
    const { validateCourse } = await import('../../../sports/golf/course');
    expect(defaultSis(18).slice(0, 3)).toEqual([1, 3, 5]);
    expect(new Set(defaultSis(18)).size).toBe(18);
    const holes = DEMO_COURSE.holes.map((x) => ({ par: x.par, si: x.si }));
    const tee = { id: 'b', name: 'Blancas', rating: '71,2', slope: '128', byNine: true, front: { rating: '35.8', slope: '130' }, back: { rating: '35.4', slope: '126' } };
    const c = draftCourse('x', ' Club ', holes, [tee]);
    expect(c.name).toBe('Club');
    expect(c.tees[0]).toMatchObject({ rating: 71.2, slope: 128, par: 72, front9: { par: 36 }, back9: { par: 36 } });
    expect(validateCourse(c)).toEqual([]);
    expect(validateCourse(draftCourse('x', 'Club', holes, [{ ...tee, rating: '' }])).length).toBeGreaterThan(0);
  });
});
