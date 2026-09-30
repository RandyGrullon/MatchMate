import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendError } from '../backend/types';
import { ballStats, keepBalls } from '../balls';
import type { OutboxItem } from '../db/outbox';
import { toIsoDate } from '../format';
import type { BowlingEvent, Submission } from '../types';
import {
  ballErrorText,
  deleteBall,
  fetchMyBallGames,
  fetchMyBalls,
  queueGameBalls,
  queuedGameBalls,
  rememberBall,
  resurfaceBall,
  retireBall,
  saveBall,
  storedBall,
} from './balls';
import { currentOutbox, rpc } from './client';
import { tags } from './keys';
import { createLeague } from './leagues';
import { tagsForOp } from './pending';
import { SOLO_GROUP, saveSoloSession } from './solo';
import { approveSubmission, submitGames } from './submissions';
import { flaky, openWorld, type FlakyBackend, type TestWorld } from './testkit';

/**
 * Mis bolas contra la base de verdad (PGlite con las migraciones): Ana registra sus bolas (con señal), marca con cuál
 * tiró sus juegos sueltos y su envío de la liga (por la cola, detrás del juego; también sin señal), y las retira, pule y
 * borra. Luis no ve nada de eso.
 */

let w: TestWorld;
let net: FlakyBackend;
let ana: string;
let lid: string;
let anaPlayer: string;

const today = toIsoDate(new Date());
const outbox = () => currentOutbox()!;
const draft = (extra: Partial<Parameters<typeof saveBall>[0]> = {}) => ({
  name: 'Phaze II',
  brand: '',
  weight: 15,
  color: '#1d4ed8',
  cover: null,
  drilledOn: null,
  resurfacedOn: null,
  retired: false,
  ...extra,
});

/** El almacenamiento del teléfono (Node no lo tiene): la última bola que eligió. */
function fakeLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  });
}

beforeAll(async () => {
  fakeLocalStorage();
  w = await openWorld();
  await w.signUp('luis@x.com', 'luis');
  ana = await w.signUp('ana@x.com', 'ana');
  net = flaky(w.b);
  w.use(net);
  lid = await createLeague(
    { uid: ana, name: 'Ana' },
    {
      name: 'Liga de Ana',
      kind: 'liga',
      visibility: 'private',
      venue: 'Bolera',
      schedule: 'Martes',
      seasonStart: '2026-01-01',
      seasonEnd: '2026-12-31',
      contactName: 'Ana',
      contactPhone: '18095551234',
      requirePhoto: false,
    },
  );
  anaPlayer = (await w.b.db.query<{ id: string }>('select id from public.players where league_id = $1 and user_id = $2', [lid, ana])).rows[0].id;
}, 120_000);

beforeEach(() => {
  net.offline = false;
  net.rpcDown = false;
  net.dropReplies = 0;
  net.calls = [];
});

afterAll(async () => {
  await w?.close();
  vi.unstubAllGlobals();
});

describe('mis bolas (capa de datos)', () => {
  let phaze: string;
  let spare: string;

  it('guardar con señal: recortada, con el color en minúsculas, y la trae my_balls', async () => {
    phaze = await saveBall(draft({ name: ' Phaze II ', brand: ' Storm ', color: '#1D4ED8', cover: 'solida' }), today);
    spare = await saveBall(draft({ name: 'Spare', weight: 14, color: '#f8fafc', cover: 'poliester' }), today);
    const mine = await fetchMyBalls();
    expect(mine).toEqual({
      balls: [
        expect.objectContaining({ id: phaze, name: 'Phaze II', brand: 'Storm', color: '#1d4ed8', cover: 'solida', weight: 15, retired: false }),
        expect.objectContaining({ id: spare, name: 'Spare', weight: 14, cover: 'poliester' }),
      ],
      lastUsed: null,
    });
    // Cambiarla: el mismo id.
    await saveBall({ ...draft({ name: 'Phaze II', brand: 'Storm', cover: 'solida' }), id: phaze, weight: 16 }, today);
    expect((await fetchMyBalls()).balls.find((b) => b.id === phaze)?.weight).toBe(16);
  });

  it('lo que no vale no sale del teléfono (con el texto de la hoja)', async () => {
    await expect(saveBall(draft({ name: '  ' }), today)).rejects.toThrow('Ponle un nombre (hasta 40 letras).');
    await expect(saveBall(draft({ weight: 20 }), today)).rejects.toThrow('El peso va de 6 a 16 libras.');
    expect(net.calls).toHaveLength(0);
    expect(ballErrorText(await saveBall(draft({ name: '' }), today).catch((e) => e))).toBe('Ponle un nombre (hasta 40 letras).');
  });

  it('sin señal, guardar una bola dice que no hay conexión', async () => {
    net.offline = true;
    const err = await saveBall(draft({ name: 'Sin señal' }), today).catch((e) => e);
    expect(ballErrorText(err)).toBe('Sin conexión. Prueba otra vez cuando tengas señal.');
  });

  it('juego suelto sin señal: la bola va detrás del juego en la cola y sale sola al volver', async () => {
    net.offline = true;
    const id = await saveSoloSession({ playedOn: today, venue: 'Bolera', note: '', scores: [190, 210], shared: true, balls: { 0: phaze, 1: null } }, today);
    expect(outbox().listPending(SOLO_GROUP).map((o) => o.fn)).toEqual(['save_solo_session', 'set_game_balls']);
    // La cola no decide cuál se pone sola la próxima vez (eso lo hace quien la eligió: la hoja).
    expect(storedBall()).toBeNull();
    net.offline = false;
    await outbox().flush();
    await outbox().idle();
    const fns = net.calls.map((c) => c.fn);
    expect(fns.indexOf('save_solo_session')).toBeLessThan(fns.indexOf('set_game_balls'));
    expect(net.calls.find((c) => c.fn === 'set_game_balls')?.args).toMatchObject({ p_kind: 'solo', p_ref: id, p_balls: { 0: phaze, 1: null }, p_op_id: expect.any(String) });
    expect(await fetchMyBallGames(id)).toEqual([
      { ball: phaze, kind: 'solo', ref: id, game: 0, date: today, score: 190, frames: null, counted: true },
    ]);
    expect((await fetchMyBalls()).lastUsed).toBe(phaze);

    // Cambiarlo: la bola del segundo juego y el primero sin bola.
    await saveSoloSession({ id, playedOn: today, venue: 'Bolera', note: '', scores: [190, 210], shared: true, balls: { 0: null, 1: spare } }, today);
    await outbox().idle();
    expect((await fetchMyBallGames(id)).map((g) => [g.game, g.ball])).toEqual([[1, spare]]);
  });

  it('sin `balls` (una cuenta sin bolas) no se manda nada más', async () => {
    await saveSoloSession({ playedOn: today, venue: '', note: '', scores: [150], shared: true }, today);
    await outbox().idle();
    expect(net.calls.map((c) => c.fn)).toEqual(['save_solo_session']);
    // Y marcar sin juegos tampoco.
    queueGameBalls('solo', 'x', {}, SOLO_GROUP);
    expect(outbox().getSnapshot().pendingCount).toBe(0);
  });

  it('envío de la liga: la bola sale detrás del envío y cuenta cuando el admin lo aprueba', async () => {
    const { id, sent } = submitGames(lid, {
      playerId: anaPlayer,
      eventId: null,
      date: today,
      scores: [180, null, 200],
      scanned: null,
      frames: null,
      photo: null,
      balls: { 0: phaze, 2: spare },
    });
    await sent;
    await outbox().idle();
    const fns = net.calls.map((c) => c.fn);
    expect(fns.indexOf('submit_games')).toBeLessThan(fns.indexOf('set_game_balls'));
    const pending = await fetchMyBallGames(id);
    expect(pending.map((g) => [g.game, g.ball, g.score, g.counted])).toEqual([
      [2, spare, 200, false],
      [0, phaze, 180, false],
    ]);
    // Son juegos de ahora: la última se pone sola la próxima vez.
    expect(storedBall()).toBe(spare);
    const r = await rpc<{ event_id: string }>('approve_submission', { p_submission: id, p_values: { 0: 180, 2: 200 } });
    // Aprobado: las bolas pasan a los juegos de la práctica (con lo que aprobó el admin) y cuentan.
    expect(await fetchMyBallGames(id)).toEqual([]);
    expect((await fetchMyBallGames(r.event_id)).map((g) => [g.kind, g.game, g.ball, g.score, g.counted]).sort((a, b) => Number(a[1]) - Number(b[1]))).toEqual([
      ['event', 0, phaze, 180, true],
      ['event', 2, spare, 200, true],
    ]);

    // Los números de cada bola con todo lo de arriba.
    const stats = ballStats((await fetchMyBalls()).balls, await fetchMyBallGames());
    // La Phaze quedó sin el juego suelto (se cambió arriba): solo el del envío.
    expect(stats.find((s) => s.ball.id === phaze)).toMatchObject({ games: 1, average: 180, high: 180 });
    expect(stats.find((s) => s.ball.id === spare)).toMatchObject({ games: 2, average: 205, high: 210 });
  });

  it('retirar, volver a usar, pulir y borrar (con sus marcas; los juegos quedan)', async () => {
    await retireBall(spare);
    expect((await fetchMyBalls()).balls.find((b) => b.id === spare)?.retired).toBe(true);
    await retireBall(spare, false);
    expect((await fetchMyBalls()).balls.find((b) => b.id === spare)?.retired).toBe(false);
    await resurfaceBall(phaze, '2026-09-01');
    expect((await fetchMyBalls()).balls.find((b) => b.id === phaze)?.resurfacedOn).toBe('2026-09-01');
    await resurfaceBall(phaze);
    expect((await fetchMyBalls()).balls.find((b) => b.id === phaze)?.resurfacedOn).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    const before = (await fetchMyBallGames()).length;
    await deleteBall(spare);
    expect((await fetchMyBalls()).balls.map((b) => b.id)).toEqual([phaze]);
    expect((await fetchMyBallGames()).length).toBe(before - 2);
    await expect(deleteBall(spare)).rejects.toMatchObject({ kind: 'not_found' });
  });

  it('luis no ve las bolas de ana ni marca sus juegos', async () => {
    await w.as('luis@x.com');
    expect(await fetchMyBalls()).toEqual({ balls: [], lastUsed: null });
    expect(await fetchMyBallGames()).toEqual([]);
    await expect(retireBall(phaze)).rejects.toMatchObject({ kind: 'permission' });
    await w.as('ana@x.com');
  });

  it('la bola de un juego no hace volver a leer la liga (balls.ts vuelve a leer las bolas)', () => {
    const op = (fn: string, group: string) => ({ fn, group, args: { p_op_id: 'x' } }) as unknown as OutboxItem;
    expect(tagsForOp(op('set_game_balls', lid))).toEqual([]);
    expect(tagsForOp(op('set_game_balls', SOLO_GROUP))).toEqual([]);
    expect(tagsForOp(op('otra_cosa', lid))).toEqual([tags.league(lid)]);
  });

  it('los errores de la base, en palabras simples', () => {
    expect(ballErrorText(new BackendError('cupo_lleno', 'validation', 'P0001'))).toBe('Ya tienes 30 bolas: borra una que ya no uses para agregar otra.');
    expect(ballErrorText(new BackendError('rate_limited', 'rate_limited', 'P0001'))).toBe('Cambiaste tus bolas muchas veces hoy. Prueba mañana.');
    expect(ballErrorText(new BackendError('no_permitido', 'permission', '42501'))).toBe('Esa bola no es tuya.');
    expect(ballErrorText(new BackendError('invalido', 'validation', 'P0001'))).toBe('Revisa el nombre, el peso y las fechas de la bola.');
    expect(ballErrorText(new Error('otra cosa'))).toBe('No se pudo guardar. Prueba otra vez.');
  });
});

describe('juegos sueltos sin señal: las bolas siguen a su juego', () => {
  let x: string;
  let y: string;
  let z: string;
  const tagsOf = async (id: string) =>
    (await fetchMyBallGames(id)).map((g) => [g.game, g.ball] as const).sort((a, b) => a[0] - b[0]);
  const ballOps = () => outbox().listPending(SOLO_GROUP).filter((o) => o.fn === 'set_game_balls');
  const sync = async () => {
    net.offline = false;
    await outbox().flush();
    await outbox().idle();
  };
  const solo = (scores: number[], extra: Partial<Parameters<typeof saveSoloSession>[0]> = {}) =>
    saveSoloSession({ playedOn: today, venue: 'Bolera', note: '', scores, shared: true, ...extra }, today);

  beforeAll(async () => {
    net.offline = false;
    x = await saveBall(draft({ name: 'X' }), today);
    y = await saveBall(draft({ name: 'Y' }), today);
    z = await saveBall(draft({ name: 'Z' }), today);
  });

  it('se crea sin señal y se vuelve a guardar: la bola queda detrás del último guardado (no se pierde)', async () => {
    net.offline = true;
    const id = await solo([190, 210], { balls: { 0: x, 1: y } });
    // Al volver a abrirlo sin señal, la hoja sabe sus bolas por lo que está en la cola.
    expect(queuedGameBalls('solo', id)).toEqual({ 0: x, 1: y });
    await solo([190, 210, 180], { id, balls: { 0: x, 1: y, 2: y } });
    expect(outbox().listPending(SOLO_GROUP).map((o) => o.fn)).toEqual(['save_solo_session', 'set_game_balls']);
    await sync();
    expect(outbox().listFailed()).toEqual([]);
    expect(await tagsOf(id)).toEqual([
      [0, x],
      [1, y],
      [2, y],
    ]);
  });

  it('se vuelve a guardar sin decir las bolas (p. ej. solo la bolera): las de la cola pasan detrás', async () => {
    net.offline = true;
    const id = await solo([150, 160], { balls: { 0: x, 1: z } });
    await solo([150, 160], { id, venue: 'Otra bolera' });
    expect(outbox().listPending(SOLO_GROUP).map((o) => o.fn)).toEqual(['save_solo_session', 'set_game_balls']);
    await sync();
    expect(await tagsOf(id)).toEqual([
      [0, x],
      [1, z],
    ]);
  });

  it('uno que ya llegó, cambiado sin señal y sin saber sus bolas: cada juego se lleva la suya (no la del que se borró)', async () => {
    const id = await solo([190, 200, 150], { balls: { 0: x, 1: y, 2: z } });
    await outbox().idle();
    net.offline = true;
    // Se borra el J2 (el de la Y): la hoja solo sabe cómo se movieron los juegos.
    await solo([190, 150], { id, balls: keepBalls(['190', '', '150'], 3)! });
    // Y otra vez, todavía sin señal, el J1: se junta con lo de la cola (queda el que era el J3).
    await solo([150], { id, balls: keepBalls(['', '150'], 2)! });
    expect(queuedGameBalls('solo', id)).toEqual({ 0: 2 });
    expect(ballOps()).toHaveLength(1);
    await sync();
    expect(outbox().listFailed()).toEqual([]);
    expect(await tagsOf(id)).toEqual([[0, z]]);
  });

  it('dos cambios sin señal con otra cantidad de juegos: una sola bola en la cola, detrás del último (sin «no se pudo enviar»)', async () => {
    const id = await solo([180, 190, 200], { balls: { 0: x, 1: x, 2: x } });
    await outbox().idle();
    net.offline = true;
    await solo([180, 190, 200, 210], { id, balls: { 0: x, 1: x, 2: x, 3: y } });
    await solo([180, 190, 200], { id, balls: { 0: x, 1: x, 2: y } });
    expect(outbox().listPending(SOLO_GROUP).map((o) => o.fn)).toEqual(['save_solo_session', 'set_game_balls']);
    await sync();
    expect(outbox().listFailed()).toEqual([]);
    expect(await tagsOf(id)).toEqual([
      [0, x],
      [1, x],
      [2, y],
    ]);
  });

  it('guardar un juego viejo con las mismas bolas no lo vuelve «la última que usé»', async () => {
    const old = await solo([170, 175], { playedOn: '2026-01-10', balls: { 0: x, 1: x } });
    await solo([200], { balls: { 0: z } });
    await outbox().idle();
    expect((await fetchMyBalls()).lastUsed).toBe(z);
    // La hoja manda las mismas (p. ej. había unas en la cola): la base no las toca.
    queueGameBalls('solo', old, { 0: x, 1: x }, SOLO_GROUP);
    await outbox().idle();
    expect((await fetchMyBalls()).lastUsed).toBe(z);
    rememberBall(z);
    expect(storedBall()).toBe(z);
  });

  it('aprobar desde la app dice dónde cae el J1: cada bola pasa a su juego del evento, con lo que aprobó el admin', async () => {
    const day = toIsoDate(new Date(Date.now() - 3 * 86_400_000));
    const { id, sent } = submitGames(lid, {
      playerId: anaPlayer,
      eventId: null,
      date: day,
      scores: [201, 202],
      scanned: null,
      frames: null,
      photo: null,
      balls: { 0: x, 1: y },
    });
    await sent;
    await outbox().idle();
    // Ana es la dueña: aprueba en los juegos 3 y 4 de una práctica nueva de 5 juegos, con el J2 corregido.
    const r = await approveSubmission(lid, { id, frames: null } as unknown as Submission, { id: '', games: 5 } as unknown as BowlingEvent, null, 0, { 2: 201, 3: 199 }, 2);
    expect((await fetchMyBallGames(r.eventId)).map((g) => [g.kind, g.game, g.ball, g.score, g.counted]).sort((a, b) => Number(a[1]) - Number(b[1]))).toEqual([
      ['event', 2, x, 201, true],
      ['event', 3, y, 199, true],
    ]);
  });
});
