/**
 * Los juegos sueltos de la demostración (/dev/empresa › Entrar a la demostración), en memoria y en sessionStorage: tres
 * días de boliche fuera de una liga (uno de un solo juego y sin salir en el perfil) y las RPC que usa la app para
 * leerlos, guardarlos (por la cola) y borrarlos. Datos de mentira.
 */
import { toIsoDate } from '@mm/lib/format';

type Row = Record<string, unknown>;

const KEY = 'mm-demo-solo';
const DAY = 86_400_000;
/** Los ids de los días de la demo (las bolas de la demo, demoBalls.ts, apuntan a estos). */
export const DEMO_SOLO_IDS = ['00000000-0000-7000-8000-0000000b5001', '00000000-0000-7000-8000-0000000b5002', '00000000-0000-7000-8000-0000000b5003'] as const;

const dayAgo = (n: number) => toIsoDate(new Date(Date.now() - n * DAY));
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();

function seed(uid: string): Row[] {
  return [
    { id: DEMO_SOLO_IDS[0], userId: uid, playedOn: dayAgo(2), venue: 'Bolera de Ejemplo', note: 'Con Jugador Uno.', scores: [178, 192, 201], frames: null, shared: true, createdAt: iso(-2 * DAY), updatedAt: iso(-2 * DAY), likes: 2, likedByMe: false },
    { id: DEMO_SOLO_IDS[1], userId: uid, playedOn: dayAgo(9), venue: 'Bolera Centro de Ejemplo', note: '', scores: [165, 170, 188], frames: null, shared: true, createdAt: iso(-9 * DAY), updatedAt: iso(-9 * DAY), likes: 0, likedByMe: false },
    { id: DEMO_SOLO_IDS[2], userId: uid, playedOn: dayAgo(40), venue: 'Bolera de Ejemplo', note: '', scores: [212], frames: null, shared: false, createdAt: iso(-40 * DAY), updatedAt: iso(-40 * DAY), likes: 0, likedByMe: false },
  ];
}

function load(uid: string): Row[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Row[];
  } catch {
    // sin sessionStorage: los de fábrica
  }
  return seed(uid);
}

function save(rows: Row[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(rows));
  } catch {
    // sin sessionStorage
  }
}

export function forgetDemoSolo() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // sin sessionStorage
  }
}

/** Del más nuevo al más viejo (el mismo día, el id más nuevo primero), como solo_sessions_of. */
const newestFirst = (a: Row, b: Row) => String(b.playedOn).localeCompare(String(a.playedOn)) || String(b.id).localeCompare(String(a.id));

/**
 * Las RPC de los juegos sueltos: `solo_sessions_of` (la lista), `save_solo_session` (guardar, por la cola) y
 * `delete_solo_session`. undefined si no es de juegos sueltos.
 */
export function soloRpc(uid: string, fn: string, a: Record<string, unknown>): unknown {
  if (fn !== 'solo_sessions_of' && fn !== 'save_solo_session' && fn !== 'delete_solo_session') return undefined;
  const rows = load(uid);
  if (fn === 'solo_sessions_of') {
    if (a.p_user && a.p_user !== uid) return [];
    const sorted = [...rows].sort(newestFirst);
    const before = typeof a.p_before === 'string' ? a.p_before : null;
    const beforeId = typeof a.p_before_id === 'string' ? a.p_before_id : null;
    const after = before ? sorted.filter((r) => String(r.playedOn) < before || (r.playedOn === before && !!beforeId && String(r.id) < beforeId)) : sorted;
    return after.slice(0, typeof a.p_limit === 'number' ? a.p_limit : 500);
  }
  if (fn === 'delete_solo_session') {
    save(rows.filter((r) => r.id !== a.p_id));
    return null;
  }
  const i = rows.findIndex((r) => r.id === a.p_id);
  const prev = i >= 0 ? rows[i] : null;
  const next: Row = {
    id: a.p_id,
    userId: uid,
    playedOn: a.p_played_on,
    venue: a.p_venue ?? '',
    note: a.p_note ?? '',
    scores: a.p_scores,
    frames: a.p_frames ?? null,
    shared: a.p_shared !== false,
    createdAt: prev?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    likes: prev?.likes ?? 0,
    likedByMe: prev?.likedByMe ?? false,
  };
  save(i >= 0 ? rows.map((r, j) => (j === i ? next : r)) : [...rows, next]);
  return a.p_id;
}
