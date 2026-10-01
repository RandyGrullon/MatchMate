import { useMemo } from 'react';
import { BLOCKED_MESSAGE, isBlockedError } from '../backend/errors';
import { BackendError } from '../backend/types';
import {
  BALL_MAX,
  ballDraftProblem,
  ballFromDraft,
  ballProblemText,
  composeBalls,
  withBall,
  type Ball,
  type BallDraft,
  type BallGame,
  type BallGameKind,
  type GameBall,
} from '../balls';
import { ballDesignProblem, normalizeBallDesign, type BallDesign } from '../ballDesign';
import { asBackendError } from '../db/errors';
import { uuidv7 } from '../db/ids';
import type { OutboxItem } from '../db/outbox';
import { toIsoDate } from '../format';
import { currentOutbox, enqueue, getUserId, invalidate, onOutbox, queryClient, rpc, type Live } from './client';

/**
 * Mis bolas del boliche: las bolas de la cuenta y con cuál tiró cada juego. La base: public.bowling_balls y
 * public.ball_games (20260930000100_bolas.sql); solo las ve su dueño. Las cuentas (qué bola se elige, los números de
 * cada una): src/lib/balls.ts.
 *
 * Guardar, retirar, pulir y borrar una bola necesita señal (se hace en casa, en «Mis bolas»). La bola de cada juego va
 * por la cola sin conexión detrás del juego, en su mismo grupo (set_game_balls después de save_solo_session en 'solo',
 * de submit_games o save_game en la liga): así llega después del juego aunque no haya señal en la bolera. En un juego
 * suelto va siempre con todos sus juegos y una sola clave por juego suelto: guardarlo otra vez sin señal la reemplaza y
 * la deja detrás del último guardado (si no, saldría antes que él y se perdería o caería en otro juego).
 *
 * El diseño (cómo se ve dibujada, src/lib/ballDesign.ts) también necesita señal: se ve enseguida en la lista (cambio
 * optimista) y, si la base dice que no, vuelve a como estaba (set_ball_design, 20260930000300_diseno_bolas.sql).
 *
 * RPC: save_ball, retire_ball, resurface_ball, delete_ball, set_ball_design, set_game_balls, my_balls y my_ball_games.
 */

export interface MyBalls {
  /** Las que uso primero; cada grupo de la más vieja a la más nueva. */
  balls: Ball[];
  /** La bola del último juego que marqué (en cualquier teléfono). */
  lastUsed: string | null;
}

const EMPTY: MyBalls = { balls: [], lastUsed: null };
const NO_GAMES: BallGame[] = [];

// ---------- Claves y etiquetas ----------

export const ballTags = {
  all: 'balls',
  user: (uid: string) => `balls:${uid}`,
};

export const ballKeys = {
  list: (uid: string) => `balls:list:${uid}`,
  games: (uid: string, ref?: string | null) => `balls:games:${uid}:${ref ?? '*'}`,
};

// ---------- La última bola que eligió en este teléfono ----------

const lastKey = (uid: string) => `mm:bola:${uid}`;

/** La última bola que eligió en este teléfono (null si ninguna o sin almacenamiento). */
export function storedBall(uid = getUserId()): string | null {
  if (!uid) return null;
  try {
    return localStorage.getItem(lastKey(uid));
  } catch {
    return null;
  }
}

/** Recuerda la bola que eligió (la próxima vez se pone sola). */
export function rememberBall(id: string | null | undefined, uid = getUserId()) {
  if (!uid || !id) return;
  try {
    localStorage.setItem(lastKey(uid), id);
  } catch {
    // sin almacenamiento: se usa la del servidor
  }
}

// ---------- Lecturas ----------

export async function fetchMyBalls(): Promise<MyBalls> {
  const r = await rpc<Partial<MyBalls> | null>('my_balls');
  return { balls: r?.balls ?? [], lastUsed: r?.lastUsed ?? null };
}

/** Mis juegos con bola (del más nuevo al más viejo); con `ref`, solo los de ese juego suelto, evento o envío. */
export async function fetchMyBallGames(ref?: string | null): Promise<BallGame[]> {
  return (await rpc<BallGame[] | null>('my_ball_games', { p_ref: ref ?? null })) ?? [];
}

/** Mis bolas (sin sesión, ninguna). */
export function useMyBalls(): Live<MyBalls> {
  const uid = getUserId();
  const st = queryClient.useQuery<MyBalls>(uid ? ballKeys.list(uid) : null, fetchMyBalls, {
    initial: EMPTY,
    tags: uid ? [ballTags.all, ballTags.user(uid)] : [],
    staleMs: 60_000,
  });
  return useMemo(() => ({ data: st.data, loading: st.loading, error: st.error }), [st]);
}

/**
 * Mis juegos con bola: todos (para los números de cada bola) o, con `ref`, los de un lugar (para abrir la hoja con las
 * bolas que tenía). `enabled = false` no pide nada (p. ej. una cuenta sin bolas).
 */
export function useMyBallGames(ref?: string | null, enabled = true): Live<BallGame[]> {
  const uid = getUserId();
  const st = queryClient.useQuery<BallGame[]>(uid && enabled ? ballKeys.games(uid, ref) : null, () => fetchMyBallGames(ref), {
    initial: NO_GAMES,
    // Los juegos sueltos cambian el puntaje de sus juegos: 'solo' es soloTags.all (src/lib/data/solo.ts, que importa
    // este archivo).
    tags: uid ? [ballTags.all, ballTags.user(uid), 'solo'] : [],
    staleMs: 30_000,
  });
  return useMemo(() => ({ data: st.data, loading: st.loading, error: st.error }), [st]);
}

// ---------- Escrituras ----------

const noSession = () => new BackendError('Entra a tu cuenta para guardar tus bolas.', 'auth', 'session_not_found');

function afterBalls() {
  invalidate(ballTags.all);
}

/** Las bolas nuevas que se agregaron en este teléfono desde que se abrió la app (ver useBallChoice: noBallsAtStart). */
const addedHere = new Set<string>();

/** ¿Esa bola se agregó en este teléfono (desde que se abrió la app)? Las demás llegaron del servidor. */
export const ballAddedHere = (id: string) => addedHere.has(id);

/**
 * Guarda una bola (nueva sin `id`). Necesita señal. Devuelve su id. Una nueva sale enseguida en la lista (si ya se leyó):
 * al agregarla mientras anota, queda elegida para el juego antes de volver a leer la lista.
 */
export async function saveBall(draft: BallDraft, today = toIsoDate(new Date())): Promise<string> {
  const uid = getUserId();
  if (!uid) throw noSession();
  const problem = ballDraftProblem(draft, today);
  if (problem) throw new BackendError(ballProblemText(problem), 'validation', 'invalido');
  const id = draft.id || uuidv7();
  await rpc<string>('save_ball', {
    p_id: id,
    p_name: draft.name.trim(),
    p_weight: draft.weight,
    p_color: draft.color.trim().toLowerCase(),
    p_brand: draft.brand.trim(),
    p_cover: draft.cover,
    p_drilled_on: draft.drilledOn || null,
    p_resurfaced_on: draft.resurfacedOn || null,
    p_retired: draft.retired,
  });
  // Antes de volver a leer: así la lectura sale después del cambio y lo reemplaza (si salió antes, no lo pisa). Un
  // cambio no se pone aquí: lo de la hoja no trae el diseño y la bola se vería lisa hasta volver a leer.
  if (!draft.id) {
    addedHere.add(id);
    const key = ballKeys.list(uid);
    const old = queryClient.getQueryData<MyBalls>(key);
    if (old) queryClient.setQueryData<MyBalls>(key, { ...old, balls: withBall(old.balls, ballFromDraft(id, draft)) });
  }
  afterBalls();
  return id;
}

/** La retira (ya no sale al anotar; sus números quedan) o la vuelve a usar. */
export async function retireBall(id: string, retired = true): Promise<void> {
  if (!getUserId()) throw noSession();
  await rpc('retire_ball', { p_id: id, p_retired: retired });
  afterBalls();
}

/** La pulió ese día (hoy si no se dice): sus juegos se vuelven a contar desde ahí. */
export async function resurfaceBall(id: string, on: string | null = null): Promise<void> {
  if (!getUserId()) throw noSession();
  await rpc('resurface_ball', { p_id: id, p_on: on });
  afterBalls();
}

/** Cambia una bola de la lista en la caché (si está). */
function patchBall(uid: string, id: string, fn: (b: Ball) => Ball) {
  const key = ballKeys.list(uid);
  const old = queryClient.getQueryData<MyBalls>(key);
  if (old?.balls.some((b) => b.id === id)) queryClient.setQueryData<MyBalls>(key, { ...old, balls: old.balls.map((b) => (b.id === id ? fn(b) : b)) });
}

/** Lo que dice cuando el diseño no se puede guardar (lo revisa aquí y la base). */
export const BALL_DESIGN_INVALID = 'Ese diseño no se puede guardar. Prueba con «Restablecer».';

/**
 * Pone el diseño de una bola (null lo quita: se dibuja lisa, de su color y su cubierta). Necesita señal. Se ve enseguida
 * en la lista (también el color, que la base copia de `base`) y, si la base dice que no, vuelve a como estaba. Va
 * arreglado (normalizeBallDesign: números redondeados y en su rango) y revisado antes de salir del teléfono. Devuelve el
 * diseño que quedó.
 */
export async function setBallDesign(id: string, design: BallDesign | null): Promise<BallDesign | null> {
  const uid = getUserId();
  if (!uid) throw noSession();
  const key = ballKeys.list(uid);
  const before = queryClient.getQueryData<MyBalls>(key)?.balls.find((b) => b.id === id);
  const next = design == null ? null : normalizeBallDesign(design, before?.color);
  if (next && ballDesignProblem(next)) throw new BackendError(BALL_DESIGN_INVALID, 'validation', 'invalido');
  patchBall(uid, id, (b) => ({ ...b, design: next, color: next?.base ?? b.color }));
  try {
    return (await rpc<BallDesign | null>('set_ball_design', { p_ball: id, p_design: next })) ?? null;
  } catch (e) {
    // Vuelve a como estaba (sin señal no se puede volver a leer).
    if (before) patchBall(uid, id, (b) => ({ ...b, design: before.design ?? null, color: before.color }));
    throw e;
  } finally {
    afterBalls();
  }
}

/** Borra la bola y con cuál juego se usó (los juegos quedan). */
export async function deleteBall(id: string): Promise<void> {
  if (!getUserId()) throw noSession();
  await rpc('delete_ball', { p_id: id });
  afterBalls();
}

/** Clave de colapso en la cola: un juego suelto, una por juego suelto (manda todos sus juegos); lo demás, por juegos. */
export function ballsCollapse(kind: BallGameKind, ref: string, games: readonly string[]): string {
  return kind === 'solo' ? `balls:solo:${ref}` : `balls:${kind}:${ref}:${[...games].sort().join(',')}`;
}

/** Los set_game_balls de ese lugar que están en la cola (también los que no se pudieron enviar), en orden. */
function queuedBallOps(kind: BallGameKind, ref: string): OutboxItem[] {
  const ob = currentOutbox();
  if (!ob) return [];
  return [...ob.listPending(), ...ob.listFailed()]
    .filter((o) => o.fn === 'set_game_balls' && o.args.p_kind === kind && o.args.p_ref === ref)
    .sort((a, b) => a.seq - b.seq);
}

/** El último que se puede reemplazar (el que se está enviando no: llega igual). */
const replaceable = (kind: BallGameKind, ref: string) => queuedBallOps(kind, ref).filter((o) => o.status !== 'sending').at(-1);

/**
 * Las bolas de un juego suelto que están en la cola y no han llegado ({"<juego>": bola | null | número}, todos sus
 * juegos: ver knownBalls en src/lib/balls.ts); null si no hay.
 */
export function queuedGameBalls(kind: BallGameKind, ref: string): Record<string, GameBall> | null {
  const last = queuedBallOps(kind, ref).at(-1);
  return last ? { ...(last.args.p_balls as Record<string, GameBall>) } : null;
}

/**
 * Las bolas de un evento o de un envío que están en la cola sin llegar ({"<juego>": bola | null}); null si no hay. Cada
 * cambio trae solo sus juegos (una por juego: ver ballsCollapse), así que se juntan en orden y la última de cada juego
 * gana (queuedGameBalls da solo la última, que en un juego suelto trae todos).
 */
export function queuedBallsByGame(kind: 'event' | 'sub', ref: string): Record<string, GameBall> | null {
  const ops = queuedBallOps(kind, ref);
  return ops.length ? Object.assign({}, ...ops.map((o) => o.args.p_balls as Record<string, GameBall>)) : null;
}

function enqueueBalls(kind: BallGameKind, ref: string, balls: Record<string, GameBall>, group: string): void {
  const games = Object.keys(balls);
  try {
    enqueue(
      'set_game_balls',
      { p_kind: kind, p_ref: ref, p_balls: balls },
      { group, collapseKey: ballsCollapse(kind, ref, games), label: games.length === 1 ? 'Bola del juego' : 'Bolas de los juegos' },
    ).done.catch(() => {
      // Si el servidor dice que no, queda en «no se pudo enviar» (el juego ya está guardado).
    });
  } catch (e) {
    // Sin cola (se cerró la sesión justo ahora): el juego se guardó igual, solo sin su bola.
    console.warn('[bolas] no se guardó la bola del juego', e);
  }
}

/**
 * Con qué bola tiró cada juego de un lugar ({"<juego>": bola | null | número}; null = sin bola; un número, solo en un
 * juego suelto, = la bola que tiene ahora ese otro juego). Va por la cola en `group`, el mismo del juego (y después de
 * él): sin señal sale sola al volver. Lo que no ha salido del mismo lugar (los mismos juegos, o el mismo juego suelto)
 * se reemplaza por esto (en un juego suelto, los números se juntan con lo que reemplaza). No recuerda la bola para el
 * próximo juego: eso lo decide quien la eligió (rememberBall). Sin sesión no hace nada (no hay cola ni bolas).
 */
export function queueGameBalls(kind: BallGameKind, ref: string, balls: Record<string, GameBall>, group: string): void {
  if (!Object.keys(balls).length || !getUserId()) return;
  const prev = kind === 'solo' ? replaceable(kind, ref) : undefined;
  enqueueBalls(kind, ref, prev ? composeBalls(balls, prev.args.p_balls as Record<string, GameBall>) : balls, group);
}

/**
 * Se guardó otra vez un juego suelto sin decir sus bolas: lo que de él estaba en la cola sin salir se vuelve a poner
 * detrás del guardado (si no, saldría antes y podría no encontrar el juego), sin los juegos que ya no tiene (`games`).
 */
export function requeueGameBalls(kind: BallGameKind, ref: string, games: number, group: string): void {
  const prev = replaceable(kind, ref);
  if (!prev || !getUserId()) return;
  const kept = Object.fromEntries(Object.entries(prev.args.p_balls as Record<string, GameBall>).filter(([k]) => Number(k) < games));
  if (Object.keys(kept).length) enqueueBalls(kind, ref, kept, group);
}

const LOCAL_PROBLEMS = (['name', 'brand', 'weight', 'color', 'dates'] as const).map(ballProblemText);

/** Lo que dice la base cuando algo de la bola no vale (en la hoja de la bola). */
const BALL_INVALID = 'Revisa el nombre, el peso y las fechas de la bola.';

/** El error de guardar o cambiar una bola, en palabras simples. */
export function ballErrorText(e: unknown): string {
  if (isBlockedError(e)) return BLOCKED_MESSAGE;
  const be = asBackendError(e);
  const code = (e instanceof Error ? e.message : '').trim().split(/[\s:]/)[0];
  if (be?.kind === 'rate_limited' || code === 'rate_limited') return 'Cambiaste tus bolas muchas veces hoy. Prueba mañana.';
  if (code === 'cupo_lleno') return `Ya tienes ${BALL_MAX} bolas: borra una que ya no uses para agregar otra.`;
  if (be?.kind === 'permission' || code === 'no_permitido') return 'Esa bola no es tuya.';
  if (be?.kind === 'not_found' || code === 'no_existe') return 'Esa bola ya no existe.';
  if (be?.kind === 'network') return 'Sin conexión. Prueba otra vez cuando tengas señal.';
  if (be?.kind === 'auth') return 'Entra a tu cuenta para guardar tus bolas.';
  // Los de la revisión de aquí ya vienen en palabras simples.
  if (be?.kind === 'validation' && LOCAL_PROBLEMS.includes(be.message)) return be.message;
  if (be?.kind === 'validation' || code === 'invalido') return BALL_INVALID;
  return 'No se pudo guardar. Prueba otra vez.';
}

/** El error de guardar el diseño de una bola: lo mismo, pero lo que no vale es el diseño. */
export function ballDesignErrorText(e: unknown): string {
  const text = ballErrorText(e);
  return text === BALL_INVALID ? BALL_DESIGN_INVALID : text;
}

// ---------- Al confirmar ----------

onOutbox({
  settled: (item) => {
    // La bola de un juego llegó (o no): los números de cada bola se vuelven a leer.
    if (item.fn === 'set_game_balls') afterBalls();
  },
});
