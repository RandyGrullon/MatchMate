/**
 * El camino completo de tenis y pickleball con la base de verdad (PGlite con las migraciones y la RLS): NTRP en
 * players.attrs, la liga por cajas (abrir el mes con save_box_month y cerrarlo) y la escalera (entrar, retar,
 * aceptar, el resultado confirmado que mueve la escalera) usando la capa de datos de las pantallas.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLeague, joinLeague } from '../../../lib/data/leagues';
import { confirmResult, fetchEventMatches, finishMatch, resetMatchesForTests, type Match } from '../../../lib/data/matches';
import { createPlayer, fetchPlayers } from '../../../lib/data/players';
import { createRacketEvent, fetchRacketEvent } from '../../../lib/data/racket';
import { openWorld, type TestWorld } from '../../../lib/data/testkit';
import { fetchSportLevels, levelScale, setLevel } from '../racket/levels';
import { acceptChallenge, cancelChallenge, createChallenge, fetchChallenges, fetchRungs, joinLadder, saveBoxMonth, setLadder, syncLadder } from './data';
import { boxTables, closeMonth, firstBoxes, monthDrafts, parseBoxConfig } from './logic/box';
import { ladderOrder } from './logic/ladder';

describe('tenis con la base de verdad', () => {
  let w: TestWorld;
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
        name: 'Tenis del Club',
        kind: 'liga',
        visibility: 'public',
        venue: 'Club',
        schedule: '',
        seasonStart: '',
        seasonEnd: '',
        contactName: '',
        contactPhone: '',
        requirePhoto: false,
        sport: 'tennis',
      },
    );
    await w.as('ana@x.com');
    const pAna = (await joinLeague(lid, { uid: anaId, name: 'Ana' }, null))!;
    await w.as('rosa@x.com');
    const pRosa = (await fetchPlayers(lid)).find((p) => p.uid === rosaId)!.id;
    ps.push(pRosa, pAna);
    for (const name of ['Luis', 'Pedro', 'Juan', 'Mía']) ps.push(await createPlayer(lid, name, null));
  }, 120_000);

  afterAll(async () => {
    resetMatchesForTests();
    await w.close();
  });

  it('NTRP en players.attrs (y fuera de rango no pasa)', async () => {
    await w.as('rosa@x.com');
    await setLevel(lid, ps[2], 'tennis', 4.5);
    await setLevel(lid, ps[3], 'tennis', 3);
    await setLevel(lid, ps[0], 'tennis', 5);
    expect(await fetchSportLevels(lid, levelScale('tennis'))).toEqual({ [ps[2]]: 4.5, [ps[3]]: 3, [ps[0]]: 5 });
    await setLevel(lid, ps[3], 'tennis', null);
    expect(await fetchSportLevels(lid, levelScale('tennis'))).toEqual({ [ps[2]]: 4.5, [ps[0]]: 5 });
  });

  it('liga por cajas: abrir el mes (cajas por nivel y partidos) y cerrarlo con subidas y bajadas', async () => {
    await w.as('rosa@x.com');
    const single = (id: string) => ({ id, players: [id], team: false });
    const id = await createRacketEvent(lid, { type: 'cajas', name: 'Cajas', date: '2026-10-01', config: { format: 'cajas', entrants: ps, rules: { min: 3, max: 3 } } });
    const cfg0 = parseBoxConfig((await fetchRacketEvent(lid, id))!.config);
    const boxes = firstBoxes(ps.map(single), { [ps[0]]: 5, [ps[2]]: 4.5 }, cfg0.rules);
    expect(boxes).toHaveLength(2);
    expect(boxes[0].slice(0, 2)).toEqual([ps[0], ps[2]]);
    const ids = await saveBoxMonth(lid, id, { month: 1, boxes, drafts: monthDrafts(boxes, single), label: 'Octubre 2026', start: '2026-10-01', end: '2026-10-31' });
    expect(ids).toHaveLength(6);
    const ev = (await fetchRacketEvent(lid, id))!;
    expect(ev.playerCount).toBe(6);
    const cfg = parseBoxConfig(ev.config);
    expect(cfg.months[0]).toMatchObject({ n: 1, label: 'Octubre 2026', closed: false });

    // Se juega uno (lo anota el admin: queda final) y se cierra el mes.
    const matches = await fetchEventMatches(lid, id);
    const first = matches.find((m) => m.stage === 'Caja 2')!;
    await finishMatch(lid, first.id, { score: { text: '6-4 6-4', sides: [2, 0], totals: { sets: [2, 0], games: [12, 8] } }, winner: 1 });
    const after = await fetchEventMatches(lid, id);
    const tables = boxTables('tennis', cfg.months[0], after as unknown as Match[]);
    const result = closeMonth(cfg, cfg.months[0], tables);
    const ids2 = await saveBoxMonth(lid, id, { month: 2, boxes: result.boxes, drafts: monthDrafts(result.boxes, single), moves: result.moves, label: 'Noviembre 2026' });
    expect(ids2).toHaveLength(6);
    const cfg2 = parseBoxConfig((await fetchRacketEvent(lid, id))!.config);
    expect(cfg2.months.map((m) => [m.n, m.closed])).toEqual([
      [1, true],
      [2, false],
    ]);
    expect(cfg2.months[0].moves.length).toBeGreaterThan(0);
    const month1 = (await fetchEventMatches(lid, id)).filter((m) => m.round === 1);
    expect(month1.filter((m) => m.status === 'void')).toHaveLength(5);
  });

  it('escalera: entrar, retar, aceptar y el resultado confirmado mueve la escalera', async () => {
    await w.as('rosa@x.com');
    const id = await createRacketEvent(lid, { type: 'escalera', name: 'Escalera', date: '2026-10-01', config: { format: 'escalera', open: true, maxUp: 3 } });
    await setLadder(lid, id, [ps[2], ps[3], ps[0]]);
    await w.as('ana@x.com');
    expect(await joinLadder(lid, id)).toBe(4);
    expect(ladderOrder(await fetchRungs(lid, id))).toEqual([ps[2], ps[3], ps[0], ps[1]]);
    // Ana (4.ª) reta a Luis (1.º): son 3 puestos.
    const c = await createChallenge(lid, id, ps[2]);
    let list = await fetchChallenges(lid, id);
    expect(list[0]).toMatchObject({ id: c, status: 'pending', challenger: ps[1], challenged: ps[2], challengerPos: 4, challengedPos: 1 });
    // No puede tener dos abiertos.
    await expect(createChallenge(lid, id, ps[3])).rejects.toBeTruthy();
    // Luis no tiene cuenta: acepta el admin, con hora y cancha.
    await w.as('rosa@x.com');
    expect(await acceptChallenge(lid, id, c, { scheduledAt: '2026-10-03T23:00:00.000Z', court: 'Cancha 1' })).toBe('accepted');
    const matchId = (await fetchChallenges(lid, id))[0].matchId!;
    // Ana anota que ganó; como Luis no tiene cuenta, confirma el admin.
    await w.as('ana@x.com');
    await finishMatch(lid, matchId, { score: { text: '6-3 6-2', sides: [2, 0], totals: { sets: [2, 0], games: [12, 5] } }, winner: 1 });
    expect(ladderOrder(await fetchRungs(lid, id))[0]).toBe(ps[2]);
    await w.as('rosa@x.com');
    await confirmResult(lid, matchId);
    list = await fetchChallenges(lid, id);
    expect(list[0]).toMatchObject({ status: 'played', winner: ps[1] });
    expect(ladderOrder(await fetchRungs(lid, id))).toEqual([ps[1], ps[2], ps[3], ps[0]]);
    // Poner al día: nada que hacer. Un reto nuevo cancelado por el admin.
    expect(await syncLadder(lid, id, { force: true })).toBe(0);
    const c2 = await createChallenge(lid, id, ps[1], ps[0]);
    expect(await cancelChallenge(lid, id, c2, 'Se lesionó')).toBe(true);
    expect((await fetchChallenges(lid, id)).find((x) => x.id === c2)).toMatchObject({ status: 'cancelled', note: 'Se lesionó' });
  });
});
