/**
 * Solo en la demostración en memoria (demoBackend.ts, /dev/empresa): los me gusta, las felicitaciones y los comentarios
 * de los juegos de boliche de «Liga de Ejemplo» (demoLeague.ts), los que se ven en el detalle de un juego (el evento y
 * «Resultados anteriores»). Contesta las tablas `reactions` y `comments` y las RPC de src/lib/data/social.ts
 * (set_reaction, add_comment y delete_comment) con las mismas reglas que la base (20260926000500_rpc.sql: hay que ser
 * miembro de la liga y que no tenga menores; una reacción por persona; de 1 a 500 letras; un comentario cada 3 s por
 * cuenta y liga; borra el autor o un admin). De fábrica: tu juego de la práctica de hace 14 días con un me gusta, una
 * felicitación, dos comentarios y sus cuadros tiro por tiro (el 201); el de Jugador Uno de hace 7 días y el de Jugadora
 * Dos en la «Copa de Ejemplo», con algo. Se guarda en sessionStorage y se borra al salir (forgetDemoGameSocial). Todos
 * los datos son ficticios.
 */
import { BackendError } from '@mm/lib/backend/types';
import { uuidv7 } from '@mm/lib/db/ids';
import { DEMO_LEAGUE } from './demoLeague';

type Row = Record<string, unknown>;
type Filter = { col: string; op: string; value: unknown };
/** Las filas de una tabla con todas las capas de abajo, sin filtrar. */
type Read = (table: string) => Row[] | null;

const KEY = 'mm-demo-juegos-social';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const iso = (ms = 0) => new Date(Date.now() + ms).toISOString();

// Lo de «Liga de Ejemplo» (demoLeague.ts): las dos prácticas pasadas, la copa ya jugada y sus jugadores.
const PRACTICE_14 = '00000000-0000-7000-8000-00000000f0e2';
const PRACTICE_7 = '00000000-0000-7000-8000-00000000f0e3';
const COPA = '00000000-0000-7000-8000-00000000f0e6';
const ME_PLAYER = '00000000-0000-7000-8000-00000000f101';
const OTHER = '00000000-0000-7000-8000-00000000f102';
const THIRD = '00000000-0000-7000-8000-00000000f103';
/** Tu juego en la práctica de hace 14 días (188 · 201 · 176) y los otros dos con algo. */
const MY_ENTRY = '00000000-0000-7000-8000-0000000f5001';
const OTHER_ENTRY = '00000000-0000-7000-8000-0000000f5005';
const THIRD_ENTRY = '00000000-0000-7000-8000-0000000f5009';
/** Las cuentas de mentira que siguen a la cuenta de prueba (las mismas de demoSocial.ts). */
const JUGADORA_DOS = { uid: '00000000-0000-7000-8000-0000000c0a02', name: 'Jugadora Dos' };
const JUGADOR_TRES = { uid: '00000000-0000-7000-8000-0000000c0a03', name: 'Jugador Tres' };
const id = (n: number) => `00000000-0000-7000-8000-0000000c5${String(n).padStart(3, '0')}`;

/** El 201 de tu juego tiro por tiro: X X 9/ X X X 9/ 7 1 X 8 1 (6 strikes, 2 spares y 2 abiertos). */
const MY_FRAMES = { '1': { rolls: [10, 10, 9, 1, 10, 10, 10, 9, 1, 7, 1, 10, 8, 1] } };

interface State {
  reactions: Row[];
  comments: Row[];
  /** Cuándo comentó la cuenta por última vez en cada liga (el ritmo de 3 s). */
  lastComment: Record<string, number>;
}

const social = (n: number, entry: string, event: string, player: string, who: { uid: string; name: string }, ago: number): Row => ({
  id: id(n),
  league_id: DEMO_LEAGUE,
  entry_id: entry,
  event_id: event,
  player_id: player,
  user_id: who.uid,
  author_name: who.name,
  created_at: iso(-ago),
});

function seed(): State {
  return {
    reactions: [
      { ...social(1, MY_ENTRY, PRACTICE_14, ME_PLAYER, JUGADORA_DOS, 13 * DAY), type: 'felicitar' },
      { ...social(2, MY_ENTRY, PRACTICE_14, ME_PLAYER, JUGADOR_TRES, 12 * DAY), type: 'like' },
      { ...social(3, OTHER_ENTRY, PRACTICE_7, OTHER, JUGADORA_DOS, 6 * DAY), type: 'like' },
      { ...social(4, THIRD_ENTRY, COPA, THIRD, JUGADOR_TRES, 2 * DAY), type: 'felicitar' },
    ],
    comments: [
      { ...social(11, MY_ENTRY, PRACTICE_14, ME_PLAYER, JUGADORA_DOS, 13 * DAY), text: '¡Qué juegazo! 🔥' },
      { ...social(12, MY_ENTRY, PRACTICE_14, ME_PLAYER, JUGADOR_TRES, 12 * DAY + HOUR), text: 'Comentario de ejemplo: ese 201 estuvo bueno.' },
      { ...social(13, OTHER_ENTRY, PRACTICE_7, OTHER, JUGADORA_DOS, 6 * DAY), text: 'Comentario de ejemplo: ¡buena serie!' },
    ],
    lastComment: {},
  };
}

function load(): State {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return { ...seed(), ...(JSON.parse(raw) as Partial<State>) };
  } catch {
    // sin sessionStorage: lo de fábrica
  }
  return seed();
}

function save(s: State) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // sin sessionStorage: sigue en memoria hasta recargar
  }
}

export function forgetDemoGameSocial() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // sin sessionStorage
  }
}

const matches = (r: Row, filters: readonly Filter[]) =>
  filters.every((f) => {
    if (f.op === 'eq') return r[f.col] === f.value;
    if (f.op === 'in') return Array.isArray(f.value) && f.value.includes(r[f.col]);
    if (f.op === 'gt') return typeof r[f.col] === 'number' && (r[f.col] as number) > (f.value as number);
    return true;
  });
const byDate = (a: Row, b: Row) => String(a.created_at).localeCompare(String(b.created_at));

/**
 * `reactions` y `comments` de los juegos (con lo hecho en la demo) y, en `entries`, los cuadros de tu 201 de la práctica
 * de hace 14 días (para ver la hoja de 10 cuadros y los strikes en el detalle). null si la tabla no es de aquí. `read`:
 * la tabla con las capas de abajo, sin filtrar.
 */
export function demoGameSocialSelect(table: string, filters: readonly Filter[] = [], read: Read): Row[] | null {
  if (table === 'reactions' || table === 'comments') {
    const s = load();
    return (table === 'reactions' ? s.reactions : s.comments).filter((r) => matches(r, filters)).sort(byDate);
  }
  if (table === 'entries') {
    const rows = read('entries');
    if (!rows) return null;
    // Solo si el juego sigue como de fábrica (otra capa pudo cambiarlo): los cuadros tienen que dar 201.
    const framed = rows.map((r) => (r.id === MY_ENTRY && !r.frames && Array.isArray(r.scores) && r.scores[1] === 201 ? { ...r, frames: MY_FRAMES } : r));
    return framed.filter((r) => matches(r, filters));
  }
  return null;
}

const deny = (): never => {
  throw new BackendError('no_permitido', 'permission', 'no_permitido');
};
const invalid = (): never => {
  throw new BackendError('invalido', 'validation', 'invalido');
};

/**
 * set_reaction, add_comment y delete_comment de los juegos de las ligas ficticias. `read`: una tabla con todas las capas
 * (sin filtrar). undefined si la función no es de aquí o el juego (o el comentario) no es de la demostración.
 */
export function gameSocialRpc(uid: string, fn: string, a: Record<string, unknown>, read: (table: string) => Row[]): unknown {
  if (fn !== 'set_reaction' && fn !== 'add_comment' && fn !== 'delete_comment') return undefined;
  const s = load();
  const memberOf = (league: unknown) => read('memberships').find((m) => m.league_id === league && m.user_id === uid) ?? null;

  if (fn === 'delete_comment') {
    const cm = s.comments.find((x) => x.id === a.p_comment);
    if (!cm) return undefined;
    const m = memberOf(cm.league_id);
    if (cm.user_id !== uid && m?.role !== 'owner' && m?.role !== 'admin') deny();
    s.comments = s.comments.filter((x) => x.id !== cm.id);
    save(s);
    return true;
  }

  const entry = read('entries').find((e) => e.id === a.p_entry);
  if (!entry) return undefined;
  if (fn === 'set_reaction' && a.p_type == null) {
    s.reactions = s.reactions.filter((r) => !(r.entry_id === entry.id && r.user_id === uid));
    save(s);
    return null;
  }
  // Hay que ser miembro de la liga, y que la liga no tenga menores (private.social_entry).
  const member = memberOf(entry.league_id);
  const league = read('leagues').find((l) => l.id === entry.league_id);
  if (!member || league?.has_minors) deny();
  const author = { uid, name: String(member?.display_name ?? '') };
  const base = { league_id: entry.league_id, entry_id: entry.id, event_id: entry.event_id, player_id: entry.player_id, user_id: author.uid, author_name: author.name, created_at: iso() };

  if (fn === 'set_reaction') {
    if (a.p_type !== 'like' && a.p_type !== 'felicitar') invalid();
    const had = s.reactions.find((r) => r.entry_id === entry.id && r.user_id === uid);
    if (had) Object.assign(had, { type: a.p_type, author_name: author.name, created_at: iso() });
    else s.reactions.push({ id: uuidv7(), ...base, type: a.p_type });
    save(s);
    return null;
  }

  // add_comment: de 1 a 500 letras y uno cada 3 s por cuenta y liga.
  const body = typeof a.p_text === 'string' ? a.p_text.trim() : '';
  if (body.length < 1 || body.length > 500) invalid();
  const key = String(entry.league_id);
  const last = s.lastComment[key] ?? 0;
  if (Date.now() - last < 3000) throw new BackendError('rate_limited', 'rate_limited', 'rate_limited');
  const newId = typeof a.p_id === 'string' ? a.p_id : uuidv7();
  s.comments.push({ id: newId, ...base, text: body });
  s.lastComment[key] = Date.now();
  save(s);
  return newId;
}
