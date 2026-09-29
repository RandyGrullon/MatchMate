import { useMemo } from 'react';
import { BLOCKED_MESSAGE, isBlockedError } from '../backend/errors';
import { BackendError } from '../backend/types';
import { asBackendError } from '../db/errors';
import { uuidv7 } from '../db/ids';
import type { OutboxItem } from '../db/outbox';
import { parseDate, toIsoDate } from '../format';
import { isValidScore, playerStats } from '../stats';
import { NO_PHOTO, type GameFrames } from '../types';
import { currentOutbox, enqueue, getUserId, invalidate, onOutbox, queryClient, remember, rpc, sentOrQueued, updateCached, type Live } from './client';
import { peopleKeys, peopleTags } from './follows';
import { useTopic } from './topics';

/**
 * Juegos sueltos: los juegos de boliche de una cuenta que no son de ninguna liga ni torneo (una tarde en la bolera
 * con los panas). Fecha, bolera, nota, de 1 a 10 juegos (con cuadros si se anotaron tiro por tiro) y si salen en el
 * perfil. La base: public.solo_sessions (20260929001000_sueltos_logos.sql); cada cuenta lee los suyos y, de otra
 * cuenta que se ve, solo los compartidos.
 *
 * Guardar va por la cola sin conexión (grupo 'solo', una clave por juego): se ve de una en la lista y, sin señal,
 * sale solo al volver. Borrar necesita señal (salvo uno que todavía no salió del teléfono). El tiempo real de la
 * cuenta (`user:<uid>`, evento 'solo') avisa cuando cambian desde otro teléfono.
 *
 * RPC: save_solo_session, delete_solo_session, solo_sessions_of.
 */

// ---------- Tipos ----------

export interface SoloSession {
  id: string;
  userId: string;
  /** YYYY-MM-DD. */
  playedOn: string;
  /** Bolera ('' si no la puso). */
  venue: string;
  note: string;
  /** Pinos de cada juego, sin huecos (1 a 10). */
  scores: number[];
  /** Cuadros de los juegos anotados tiro por tiro: {"<juego desde 0>": {rolls, masks}}. */
  frames: Record<string, GameFrames> | null;
  /** Sale en el perfil y en el inicio de quien la sigue. */
  shared: boolean;
  /** ISO (null mientras no llega al servidor). */
  createdAt: string | null;
  updatedAt: string | null;
  likes: number;
  likedByMe: boolean;
  /** Tiene cambios guardados en este teléfono que todavía no llegan al servidor. */
  pending?: boolean;
  /** Solo existe en este teléfono (se creó sin señal y no ha salido). */
  local?: boolean;
}

/** Lo que se guarda desde la hoja (sin `id`: uno nuevo). */
export interface SoloDraft {
  id?: string | null;
  playedOn: string;
  venue: string;
  note: string;
  scores: number[];
  frames?: Record<string, GameFrames> | null;
  shared: boolean;
}

// ---------- Límites (los mismos de la base) ----------

export const SOLO_GROUP = 'solo';
export const SOLO_MAX_GAMES = 10;
export const SOLO_VENUE_MAX = 80;
export const SOLO_NOTE_MAX = 300;
/** Hasta cuántos años atrás se puede anotar. */
export const SOLO_MAX_YEARS = 10;
/** Página de solo_sessions_of (la base acepta hasta 500) y cuántas se leen como máximo. */
const SOLO_PAGE = 500;
const SOLO_MAX_PAGES = 4;

// ---------- Claves y etiquetas ----------

export const soloTags = {
  /** Todos los juegos sueltos que hay en la caché. */
  all: 'solo',
  /** Los de una cuenta. */
  user: (uid: string) => `solo:${uid}`,
};

export const soloKeys = {
  list: (uid: string) => `solo:list:${uid}`,
};

/** Clave de colapso en la cola: guardar otra vez el mismo juego reemplaza lo que no ha salido. */
export const soloCollapse = (id: string) => `solo:${id}`;

// ---------- Cuentas (sin React: se prueban solas) ----------

/** Un juego suelto como participación: todos sus juegos cuentan (no hay foto que verificar ni admin). */
export const soloAsEntry = (s: Pick<SoloSession, 'scores'>) => ({ scores: s.scores, photos: s.scores.map(() => NO_PHOTO) });

export interface SoloSummary {
  sessions: number;
  games: number;
  pins: number;
  /** Promedio (hacia abajo, como en las ligas); null sin juegos. */
  average: number | null;
  high: number;
  /** Mejor serie de 3 juegos seguidos (0 si ninguna tiene 3). */
  bestSeries: number;
}

/** Los números de los juegos sueltos (con las mismas cuentas de las ligas: src/lib/stats.ts). */
export function soloSummary(sessions: readonly Pick<SoloSession, 'scores'>[]): SoloSummary {
  const s = playerStats(sessions.map(soloAsEntry));
  return { sessions: sessions.length, games: s.games, pins: s.pins, average: s.autoAverage, high: s.high, bestSeries: s.highSeries };
}

/** Suma de los juegos de ese día. */
export const soloSeries = (s: Pick<SoloSession, 'scores'>) => s.scores.reduce((a, b) => a + b, 0);

/** El juego más alto de ese día. */
export const soloHigh = (s: Pick<SoloSession, 'scores'>) => (s.scores.length ? Math.max(...s.scores) : 0);

/** Del más nuevo al más viejo (fecha y después id, como la base). */
export function sortSolo<T extends Pick<SoloSession, 'playedOn' | 'id'>>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => b.playedOn.localeCompare(a.playedOn) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}

export interface SoloMonth<T> {
  /** YYYY-MM. */
  month: string;
  /** «septiembre de 2026». */
  label: string;
  sessions: T[];
}

/** Agrupados por mes (en el orden en que vienen). */
export function soloByMonth<T extends Pick<SoloSession, 'playedOn'>>(list: readonly T[]): SoloMonth<T>[] {
  const out: SoloMonth<T>[] = [];
  for (const s of list) {
    const month = s.playedOn.slice(0, 7);
    let g = out.at(-1);
    if (!g || g.month !== month) {
      g = { month, label: parseDate(`${month}-01`).toLocaleDateString('es-DO', { month: 'long', year: 'numeric' }), sessions: [] };
      out.push(g);
    }
    g.sessions.push(s);
  }
  return out;
}

/** Las boleras que ya puso (la más reciente primero, sin repetir sin importar mayúsculas), para sugerirlas. */
export function soloVenues(list: readonly Pick<SoloSession, 'venue'>[], max = 20): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of list) {
    const v = s.venue.trim();
    const k = v.toLocaleLowerCase('es');
    if (!v || seen.has(k)) continue;
    seen.add(k);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

/** El día más viejo que se puede anotar (hace 10 años). */
export function soloMinDate(today: string): string {
  const d = parseDate(today);
  d.setFullYear(d.getFullYear() - SOLO_MAX_YEARS);
  return toIsoDate(d);
}

/** Lo que no deja guardar (null = todo bien). La base revisa lo mismo. */
export type SoloProblem = 'date' | 'games' | 'score' | 'venue' | 'note';

export function soloDraftProblem(d: Pick<SoloDraft, 'playedOn' | 'scores' | 'venue' | 'note'>, today: string): SoloProblem | null {
  const tomorrow = parseDate(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  // Hasta mañana: la base cuenta el día en hora de RD y el teléfono puede estar en otra.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.playedOn) || d.playedOn < soloMinDate(today) || d.playedOn > toIsoDate(tomorrow)) return 'date';
  if (!d.scores.length || d.scores.length > SOLO_MAX_GAMES) return 'games';
  if (!d.scores.every(isValidScore)) return 'score';
  if (d.venue.trim().length > SOLO_VENUE_MAX) return 'venue';
  if (d.note.trim().length > SOLO_NOTE_MAX) return 'note';
  return null;
}

const PROBLEM_TEXT: Record<SoloProblem, string> = {
  date: `Elige una fecha de los últimos ${SOLO_MAX_YEARS} años.`,
  games: `Anota de 1 a ${SOLO_MAX_GAMES} juegos.`,
  score: 'Cada juego va de 0 a 300.',
  venue: `El nombre de la bolera puede tener hasta ${SOLO_VENUE_MAX} letras.`,
  note: `La nota puede tener hasta ${SOLO_NOTE_MAX} letras.`,
};

export const soloProblemText = (p: SoloProblem) => PROBLEM_TEXT[p];

/** Solo los cuadros de juegos que existen ('0' a '9'); ninguno = null. */
export function cleanSoloFrames(frames: Record<string, GameFrames> | null | undefined, games: number): Record<string, GameFrames> | null {
  if (!frames) return null;
  const out: Record<string, GameFrames> = {};
  for (const [k, f] of Object.entries(frames)) {
    if (/^\d$/.test(k) && Number(k) < games && f && Array.isArray(f.rolls)) out[k] = f;
  }
  return Object.keys(out).length ? out : null;
}

/** El error de guardar o borrar un juego suelto, en palabras simples. */
export function soloErrorText(e: unknown): string {
  if (isBlockedError(e)) return BLOCKED_MESSAGE;
  const be = asBackendError(e);
  const code = (e instanceof Error ? e.message : '').trim().split(/[\s:]/)[0];
  if (be?.kind === 'rate_limited' || code === 'rate_limited') return 'Anotaste muchos juegos sueltos hoy. Prueba mañana.';
  if (be?.kind === 'permission' || code === 'no_permitido') return 'Ese juego no es tuyo.';
  if (be?.kind === 'not_found' || code === 'no_existe') return 'Ese juego ya no existe.';
  if (be?.kind === 'network') return 'Sin conexión. Prueba otra vez cuando tengas señal.';
  if (be?.kind === 'auth') return 'Entra a tu cuenta para guardar tus juegos.';
  // Los de la revisión de aquí ya vienen en palabras simples.
  if (be?.kind === 'validation' && Object.values(PROBLEM_TEXT).includes(be.message)) return be.message;
  if (be?.kind === 'validation' || code === 'invalido') return 'Revisa la fecha y los juegos (cada uno de 0 a 300).';
  return 'No se pudo guardar. Prueba otra vez.';
}

// ---------- Lo que está en la cola ----------

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** El juego como quedará cuando llegue (sobre el que ya estaba, si había). */
function sessionFromOp(o: OutboxItem, prev: SoloSession | null): SoloSession {
  const a = o.args;
  const at = new Date(o.createdAt).toISOString();
  const scores = Array.isArray(a.p_scores) ? (a.p_scores as unknown[]).filter(isValidScore) : [];
  return {
    id: String(a.p_id),
    userId: o.userId,
    playedOn: text(a.p_played_on),
    venue: text(a.p_venue),
    note: text(a.p_note),
    scores,
    frames: cleanSoloFrames(a.p_frames as Record<string, GameFrames> | null, scores.length),
    shared: a.p_shared !== false,
    createdAt: prev?.createdAt ?? null,
    updatedAt: at,
    likes: prev?.likes ?? 0,
    likedByMe: prev?.likedByMe ?? false,
    pending: true,
    local: !prev || !!prev.local,
  };
}

/** Lo guardado en este teléfono que todavía no llega, encima de lo que dice el servidor. */
export function overlaySolo(list: SoloSession[], ops: readonly OutboxItem[]): SoloSession[] {
  const saves = ops.filter((o) => o.fn === 'save_solo_session' && typeof o.args.p_id === 'string');
  if (!saves.length) return list;
  let out = list;
  for (const o of saves) {
    const i = out.findIndex((s) => s.id === o.args.p_id);
    const next = sessionFromOp(o, i >= 0 ? out[i] : null);
    out = i >= 0 ? out.map((s, j) => (j === i ? next : s)) : [...out, next];
  }
  return sortSolo(out);
}

const pendingSolo = (): OutboxItem[] => currentOutbox()?.listPending(SOLO_GROUP) ?? [];

/**
 * Juegos cuyo guardado ya se intentó mandar y pudo llegar aunque no llegó la respuesta (se cortó la señal o el
 * servidor tardó). Si después se cambia antes de salir, la cola reemplaza ese envío por uno nuevo que todavía no se
 * intentó: esto recuerda que el servidor quizás ya lo tiene, para que borrarlo lo borre también allá.
 */
const maybeSent = new Set<string>();

/** Un envío que ya salió al menos una vez sin respuesta clara (el servidor pudo guardarlo). */
const triedOp = (o: OutboxItem) => o.attempts > 0 && o.status !== 'failed';

// ---------- Lecturas ----------

/**
 * Los juegos sueltos de una cuenta (null = la mía), del más nuevo al más viejo: los míos, todos; los de otra, solo
 * los compartidos (y ninguno si no se ve). Se leen de a 500 (el resumen necesita todos).
 */
export async function fetchSoloSessions(uid: string | null, pageSize = SOLO_PAGE): Promise<SoloSession[]> {
  const out: SoloSession[] = [];
  for (let i = 0; i < SOLO_MAX_PAGES; i++) {
    const last = out.at(-1);
    const page =
      (await rpc<SoloSession[] | null>('solo_sessions_of', {
        p_user: uid,
        p_limit: pageSize,
        p_before: last?.playedOn ?? null,
        p_before_id: last?.id ?? null,
      })) ?? [];
    out.push(...page);
    if (page.length < pageSize) break;
  }
  return out;
}

/** Los míos, con lo que está en la cola encima. */
async function fetchMine(uid: string): Promise<SoloSession[]> {
  const list = await fetchSoloSessions(uid);
  return uid === getUserId() ? overlaySolo(list, pendingSolo()) : list;
}

/** Juegos sueltos de una cuenta (los míos en tiempo real). Sin sesión, nada. */
export function useSoloSessions(uid: string | null | undefined): Live<SoloSession[]> {
  const me = getUserId();
  const mine = !!uid && uid === me;
  // El canal de la cuenta es privado: solo se escucha el mío.
  useTopic(mine ? `user:${uid}` : null);
  const key = uid && me ? soloKeys.list(uid) : null;
  if (key) remember(key, { kind: 'solo', id: uid! });
  const st = queryClient.useQuery<SoloSession[]>(key, () => (mine ? fetchMine(uid!) : fetchSoloSessions(uid!)), {
    initial: [],
    // Los me gusta de mis juegos llegan por las etiquetas de la cuenta.
    tags: uid ? [soloTags.all, soloTags.user(uid), peopleTags.user(uid)] : [],
    staleMs: 30_000,
  });
  return useMemo(() => ({ data: st.data, loading: st.loading, error: st.error }), [st]);
}

/** Mis juegos sueltos. */
export const useMySoloSessions = (): Live<SoloSession[]> => useSoloSessions(getUserId());

// ---------- Escrituras ----------

/** Lo que cambia cuando cambia un juego suelto: la lista, el perfil (juegos, números, me gusta) y el inicio de otros. */
function afterSolo(uid: string) {
  invalidate(soloTags.user(uid), peopleTags.user(uid), peopleTags.feed);
  queryClient.invalidateKey(peopleKeys.profile(uid));
}

const noSession = () => new BackendError('Entra a tu cuenta para guardar tus juegos.', 'auth', 'session_not_found');

/**
 * Guarda un juego suelto (nuevo sin `id`). Va por la cola: se ve de una en la lista y, sin señal (o si el servidor
 * tarda), queda guardado en el teléfono y sale solo. Con señal espera al servidor y sale su error si dice que no.
 * Devuelve el id (el del teléfono si es nuevo).
 */
export async function saveSoloSession(draft: SoloDraft, today = toIsoDate(new Date())): Promise<string> {
  if (!getUserId()) throw noSession();
  const problem = soloDraftProblem(draft, today);
  if (problem) throw new BackendError(soloProblemText(problem), 'validation', 'invalido');
  const id = draft.id || uuidv7();
  if (pendingSolo().some((o) => o.collapseKey === soloCollapse(id) && triedOp(o))) maybeSent.add(id);
  const { done } = enqueue(
    'save_solo_session',
    {
      p_id: id,
      p_played_on: draft.playedOn,
      p_scores: draft.scores,
      p_frames: cleanSoloFrames(draft.frames, draft.scores.length),
      p_venue: draft.venue.trim(),
      p_note: draft.note.trim(),
      p_shared: draft.shared,
    },
    { group: SOLO_GROUP, collapseKey: soloCollapse(id), label: 'Juego suelto' },
  );
  await sentOrQueued(done);
  return id;
}

/**
 * Borra un juego suelto (con sus me gusta). Lo que de él estaba en la cola se descarta; si nunca salió del teléfono
 * (ningún envío se intentó: sin señal no se intenta), no hace falta señal. Si alguno salió sin respuesta, el servidor
 * quizás lo tiene y se borra allá también (sin señal, el error lo dice). Si el servidor ya no lo tenía, queda borrado
 * igual.
 */
export async function deleteSoloSession(session: Pick<SoloSession, 'id'> & Partial<Pick<SoloSession, 'local'>>): Promise<void> {
  const uid = getUserId();
  if (!uid) throw noSession();
  const ob = currentOutbox();
  const collapseKey = soloCollapse(session.id);
  let queued = false;
  let sending = false;
  let tried = maybeSent.has(session.id);
  if (ob) {
    for (const o of [...ob.listPending(SOLO_GROUP), ...ob.listFailed()]) {
      if (o.collapseKey !== collapseKey) continue;
      queued = true;
      if (triedOp(o)) tried = true;
      if (o.status === 'sending') sending = true;
      else {
        try {
          await ob.discard(o.opId);
        } catch {
          // Empezó a enviarse justo ahora.
          sending = true;
        }
      }
    }
    // Uno que se está enviando llega al servidor: se espera y se borra allá.
    if (sending) await ob.idle();
  }
  try {
    if (!(session.local && queued && !sending && !tried)) await rpc('delete_solo_session', { p_id: session.id });
  } catch (e) {
    if (asBackendError(e)?.kind !== 'not_found') {
      afterSolo(uid);
      throw e;
    }
  }
  maybeSent.delete(session.id);
  updateCached<SoloSession[]>('solo', (list) => (list.some((s) => s.id === session.id) ? list.filter((s) => s.id !== session.id) : list));
  afterSolo(uid);
}

// ---------- Al encolar y al confirmar ----------

onOutbox({
  enqueue: (item) => {
    if (item.fn !== 'save_solo_session') return;
    updateCached<SoloSession[]>('solo', (list, d) => (d.id === item.userId ? overlaySolo(list, [item]) : list));
  },
  settled: (item, outcome) => {
    if (item.fn !== 'save_solo_session') return;
    // Llegó: ya no hace falta recordarlo (la lista vuelve a leer del servidor).
    if (outcome.ok && typeof item.args.p_id === 'string') maybeSent.delete(item.args.p_id);
    afterSolo(item.userId);
  },
});
