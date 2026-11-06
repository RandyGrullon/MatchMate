/**
 * Solo en la demostración en memoria (demoBackend.ts, /dev/empresa): las bolas de la cuenta de prueba para probar «Mis
 * bolas» (/bolas), Yo › «Mis bolas» y la bola de cada juego sin el Supabase real. Tres bolas en uso con números
 * distintos (una con perforación, otra con diseño) y una retirada, con sus juegos: los de los tres juegos sueltos de la
 * demostración (demoSolo.ts, DEMO_SOLO_IDS) y los de la cuenta en las dos prácticas pasadas de la liga de boliche
 * ficticia (demoLeague.ts). Lo que cambia (agregar, editar, retirar, pulir, borrar, la bola de un juego) se guarda en
 * sessionStorage y se borra al salir de la demostración (forgetDemoBalls). Todos los datos son ficticios.
 *
 * Contesta las RPC de las bolas con la misma forma que la base (20260930000100_bolas.sql, 20260930000300 y
 * 20261013000100): my_balls, my_ball_games, save_ball, retire_ball, resurface_ball, delete_ball, set_ball_design,
 * set_ball_details y set_game_balls (esta llega por la cola sin conexión, con su p_op_id). `ballRpc` devuelve undefined
 * si no es una de esas.
 *
 * Los puntajes de cada juego no están aquí: salen del juego suelto, del evento o del envío (como el join de
 * my_ball_games). Los juegos sueltos se leen de demoSolo.ts (solo_sessions_of); `read(tabla)` da las demás filas de la
 * demostración ('events', 'entries', 'players', 'submissions', con columnas de la base; también 'solo_sessions', que
 * manda sobre las de demoSolo.ts). Sin `read`, los juegos con bola de la liga no salen (como si el evento no estuviera).
 */
import { BackendError, type BackendErrorKind } from '@mm/lib/backend/types';
import { defaultBallDesign, ballDesignProblem, type BallDesign } from '@mm/lib/ballDesign';
import { BALL_COVERS, BALL_MAX, ballDraftProblem, cleanCatalogId, cleanLayout, isCatalogId, layoutProblem } from '@mm/lib/balls';
import { uuidv7 } from '@mm/lib/db/ids';
import { toIsoDate } from '@mm/lib/format';
import type { GameFrames } from '@mm/lib/types';
import { DEMO_SOLO_IDS, soloRpc } from './demoSolo';

type Row = Record<string, unknown>;

const KEY = 'mm-demo-bolas';
const DAY = 86_400_000;

/** Ids fijos: `00000000-0000-7000-8000-0000000b<tipo><número>` (1 bolas, 2 juegos con bola; 5 son los juegos sueltos). */
const id = (kind: number, n: number) => `00000000-0000-7000-8000-0000000b${kind}${String(n).padStart(3, '0')}`;

const BALL_A = id(1, 1);
const BALL_B = id(1, 2);
const BALL_C = id(1, 3);
const BALL_OLD = id(1, 4);

/** Las dos prácticas pasadas de la liga de boliche ficticia (demoLeague.ts: hace 14 y 7 días). */
const LEAGUE_PAST = ['00000000-0000-7000-8000-00000000f0e2', '00000000-0000-7000-8000-00000000f0e3'];

const day = (n: number) => toIsoDate(new Date(Date.now() + n * DAY));
const iso = (ms = 0) => new Date(Date.now() + ms).toISOString();

// ---------- Lo guardado ----------

interface State {
  balls: Row[];
  games: Row[];
}

function seed(uid: string): State {
  const ball = (bid: string, daysAgo: number, extra: Row): Row => ({
    id: bid,
    user_id: uid,
    brand: '',
    cover: null,
    drilled_on: null,
    resurfaced_on: null,
    retired: false,
    created_at: iso(-daysAgo * DAY),
    updated_at: iso(-daysAgo * DAY),
    design: null,
    catalog: null,
    layout: null,
    ...extra,
  });
  const look: BallDesign = { ...defaultBallDesign('#0ea5e9', 'hibrida'), pattern: 'jaspeada', second: '#f8fafc', third: '#1d4ed8' };
  let n = 0;
  /** Los juegos de un lugar con esa bola (la hora: la del día del juego, en orden). */
  const games = (ballId: string, place: { solo?: string; event?: string }, list: number[], daysAgo: number): Row[] =>
    list.map((g) => ({
      id: id(2, ++n),
      user_id: uid,
      ball_id: ballId,
      solo_id: place.solo ?? null,
      event_id: place.event ?? null,
      sub_id: null,
      game: g,
      created_at: iso(-daysAgo * DAY + g * 60_000),
    }));
  return {
    balls: [
      ball(BALL_OLD, 400, { name: 'Bola Vieja', weight: 16, color: '#111827', cover: 'poliester', retired: true }),
      ball(BALL_A, 120, {
        name: 'Bola de Ejemplo',
        brand: 'Marca de Ejemplo',
        weight: 15,
        color: '#7c3aed',
        cover: 'perlada',
        drilled_on: day(-120),
        resurfaced_on: day(-30),
        layout: { drillingAngle: 45, pinToPap: 4.5, valAngle: 30, notes: 'Dual Angle, mano derecha' },
      }),
      ball(BALL_B, 90, { name: 'Bola de Práctica', weight: 14, color: '#dc2626', cover: 'solida' }),
      ball(BALL_C, 60, {
        name: 'Bola de Repuesto',
        brand: 'Marca de Ejemplo',
        weight: 15,
        color: look.base,
        cover: 'hibrida',
        resurfaced_on: day(-50),
        design: look,
      }),
    ],
    // Los juegos sueltos de demoSolo.ts: hace 2 días (3 juegos), hace 9 (3) y hace 40 (1).
    games: [
      ...games(BALL_OLD, { event: LEAGUE_PAST[0] }, [0, 1, 2], 14),
      ...games(BALL_A, { solo: DEMO_SOLO_IDS[0] }, [0, 1, 2], 2),
      ...games(BALL_A, { event: LEAGUE_PAST[1] }, [0, 1, 2], 7),
      ...games(BALL_B, { solo: DEMO_SOLO_IDS[1] }, [0, 1, 2], 9),
      ...games(BALL_C, { solo: DEMO_SOLO_IDS[2] }, [0], 40),
    ],
  };
}

function load(uid: string): State {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as State;
  } catch {
    // sin sessionStorage: lo de fábrica
  }
  return seed(uid);
}

function save(s: State) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // sin sessionStorage
  }
}

/** Al salir de la demostración (junto con forgetDemoLeague). */
export function forgetDemoBalls() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // sin sessionStorage
  }
}

/** Las filas de las bolas de la cuenta de prueba, por tabla (public.bowling_balls y public.ball_games). */
export function ballTables(uid: string): Record<string, Row[]> {
  const s = load(uid);
  return { bowling_balls: s.balls, ball_games: s.games };
}

// ---------- Los lugares de los juegos (para los puntajes) ----------

type Read = (table: string) => readonly Row[];

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const obj = (v: unknown): Record<string, GameFrames> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, GameFrames>) : null);

/** Los juegos sueltos de la demostración (los de `read` o, si no, los de demoSolo.ts). */
function soloRows(uid: string, read?: Read): readonly Row[] {
  const rows = read?.('solo_sessions') ?? [];
  return rows.length ? rows : ((soloRpc(uid, 'solo_sessions_of', {}) as Row[] | undefined) ?? []);
}

/** Un juego suelto de la cuenta: su día, sus pinos y sus cuadros (null si no está). */
function soloOf(uid: string, ref: string, read?: Read) {
  const row = soloRows(uid, read).find((r) => r.id === ref && (r.user_id ?? r.userId ?? uid) === uid);
  if (!row) return null;
  return { date: String(row.played_on ?? row.playedOn ?? ''), scores: arr<number>(row.scores), frames: obj(row.frames) };
}

/** Un evento de boliche y la participación de la cuenta en él (null si el evento no está). */
function eventOf(uid: string, ref: string, read?: Read) {
  const ev = read?.('events').find((r) => r.id === ref);
  if (!ev) return null;
  const me = read?.('players').find((p) => p.league_id === ev.league_id && p.user_id === uid);
  const entry = me ? read?.('entries').find((e) => e.event_id === ref && e.player_id === me.id) : undefined;
  return {
    date: (ev.date as string | null) ?? null,
    games: Number(ev.games) || 0,
    scores: arr<number | null>(entry?.scores),
    photos: arr<string | null>(entry?.photos),
    frames: obj(entry?.frames),
  };
}

/** Un envío de la cuenta («Subir mis juegos»; null si no está). */
function subOf(ref: string, read?: Read) {
  const s = read?.('submissions').find((r) => r.id === ref);
  if (!s) return null;
  const ev = s.event_id ? read?.('events').find((r) => r.id === s.event_id) : undefined;
  return { date: ((ev?.date ?? s.date) as string | null) ?? null, status: String(s.status), scores: arr<number | null>(s.scores), frames: obj(s.frames) };
}

const kindOf = (g: Row) => (g.solo_id ? 'solo' : g.event_id ? 'event' : 'sub');
const refOf = (g: Row) => (g.solo_id ?? g.event_id ?? g.sub_id) as string;

/** Un juego con bola como lo da my_ball_games (null si su lugar ya no está, como el join de la base). */
function ballGame(uid: string, g: Row, read?: Read) {
  const kind = kindOf(g);
  const ref = refOf(g);
  const n = Number(g.game);
  const base = { ball: g.ball_id, kind, ref, game: n };
  if (kind === 'solo') {
    const s = soloOf(uid, ref, read);
    return s ? { ...base, date: s.date || null, score: s.scores[n] ?? null, frames: s.frames?.[String(n)] ?? null, counted: true } : null;
  }
  if (kind === 'event') {
    const e = eventOf(uid, ref, read);
    if (!e) return null;
    const score = e.scores[n] ?? null;
    return { ...base, date: e.date, score, frames: e.frames?.[String(n)] ?? null, counted: e.photos[n] != null && score != null };
  }
  const s = subOf(ref, read);
  if (!s || s.status !== 'pendiente') return null;
  return { ...base, date: s.date, score: s.scores[n] ?? null, frames: s.frames?.[String(n)] ?? null, counted: false };
}

// ---------- Las RPC ----------

const FNS = new Set(['my_balls', 'my_ball_games', 'save_ball', 'retire_ball', 'resurface_ball', 'delete_ball', 'set_ball_design', 'set_ball_details', 'set_game_balls']);

/** El error como lo da la base (private.fail): el código en el mensaje. */
const fail = (code: string, kind: BackendErrorKind = 'validation'): never => {
  throw new BackendError(code, kind, code);
};

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const dateOrNull = (v: unknown) => (typeof v === 'string' && v ? v : null);

/** La bola de la cuenta (para cambiarla): 'no_existe' si no está. */
function myBall(s: State, uid: string, ballId: unknown): Row {
  const b = s.balls.find((x) => x.id === ballId);
  if (!b) return fail('no_existe', 'not_found');
  if (b.user_id !== uid) return fail('no_permitido', 'permission');
  return b;
}

/** Una bola como la da my_balls. */
const ballOut = (b: Row) => ({
  id: b.id,
  name: b.name,
  brand: b.brand,
  weight: b.weight,
  color: b.color,
  cover: b.cover,
  drilledOn: b.drilled_on,
  resurfacedOn: b.resurfaced_on,
  retired: b.retired,
  createdAt: b.created_at,
  updatedAt: b.updated_at,
  design: b.design ?? null,
  catalog: b.catalog ?? null,
  layout: b.layout ?? null,
});

const byTime = (a: Row, b: Row, key: string) => String(a[key]).localeCompare(String(b[key]));

/**
 * Las RPC de las bolas (las mismas reglas de la base, sin los límites por día). undefined si no es de las bolas. `read`:
 * las filas de la demostración, para los puntajes y los juegos de cada lugar (ver arriba).
 */
export function ballRpc(uid: string, fn: string, a: Record<string, unknown>, read?: Read): unknown {
  if (!FNS.has(fn)) return undefined;
  const s = load(uid);
  const mine = (g: Row) => g.user_id === uid;
  const today = day(0);
  const touch = (b: Row) => {
    b.updated_at = iso();
  };

  switch (fn) {
    case 'my_balls': {
      const balls = s.balls
        .filter(mine)
        .sort((x, y) => Number(x.retired) - Number(y.retired) || byTime(x, y, 'created_at') || String(x.id).localeCompare(String(y.id)))
        .map(ballOut);
      const last = s.games.filter(mine).sort((x, y) => byTime(y, x, 'created_at') || Number(y.game) - Number(x.game))[0];
      return { balls, lastUsed: last?.ball_id ?? null };
    }

    case 'my_ball_games': {
      const ref = typeof a.p_ref === 'string' ? a.p_ref : null;
      const limit = Math.min(5000, Math.max(1, Number(a.p_limit) || 3000));
      const rows = s.games
        .filter((g) => mine(g) && (!ref || refOf(g) === ref))
        .map((g) => ({ g, out: ballGame(uid, g, read) }))
        .filter((x): x is { g: Row; out: NonNullable<ReturnType<typeof ballGame>> } => x.out != null)
        .sort((x, y) => {
          const dx = x.out.date ?? '';
          const dy = y.out.date ?? '';
          if (dx !== dy) return !dx ? 1 : !dy ? -1 : dy.localeCompare(dx);
          return byTime(y.g, x.g, 'created_at') || y.out.game - x.out.game;
        });
      return rows.slice(0, limit).map((x) => x.out);
    }

    case 'save_ball': {
      const draft = {
        name: text(a.p_name),
        brand: text(a.p_brand),
        weight: Number(a.p_weight),
        color: text(a.p_color).toLowerCase(),
        drilledOn: dateOrNull(a.p_drilled_on),
        resurfacedOn: dateOrNull(a.p_resurfaced_on),
      };
      const cover = text(a.p_cover) || null;
      if (ballDraftProblem(draft, today) || (cover && !BALL_COVERS.some((c) => c.key === cover))) fail('invalido');
      const ballId = typeof a.p_id === 'string' && a.p_id ? a.p_id : uuidv7();
      const had = s.balls.find((b) => b.id === ballId);
      if (had && had.user_id !== uid) fail('no_permitido', 'permission');
      const fields = {
        name: draft.name,
        brand: draft.brand,
        weight: draft.weight,
        color: draft.color,
        cover,
        drilled_on: draft.drilledOn,
        resurfaced_on: draft.resurfacedOn,
        retired: a.p_retired === true,
      };
      if (had) {
        Object.assign(had, fields);
        touch(had);
      } else {
        if (s.balls.filter(mine).length >= BALL_MAX) fail('cupo_lleno');
        s.balls.push({ id: ballId, user_id: uid, ...fields, created_at: iso(), updated_at: iso(), design: null, catalog: null, layout: null });
      }
      save(s);
      return ballId;
    }

    case 'retire_ball': {
      const b = myBall(s, uid, a.p_id);
      b.retired = a.p_retired !== false;
      touch(b);
      save(s);
      return null;
    }

    case 'resurface_ball': {
      const b = myBall(s, uid, a.p_id);
      const on = dateOrNull(a.p_on) ?? today;
      if (ballDraftProblem({ name: 'x', brand: '', weight: 15, color: '#000000', drilledOn: dateOrNull(b.drilled_on), resurfacedOn: on }, today)) fail('invalido');
      b.resurfaced_on = on;
      touch(b);
      save(s);
      return null;
    }

    case 'delete_ball': {
      const b = myBall(s, uid, a.p_id);
      s.balls = s.balls.filter((x) => x !== b);
      s.games = s.games.filter((g) => g.ball_id !== b.id);
      save(s);
      return null;
    }

    case 'set_ball_design': {
      const b = myBall(s, uid, a.p_ball);
      const design = (a.p_design ?? null) as BallDesign | null;
      if (design && ballDesignProblem(design)) fail('invalido');
      b.design = design;
      if (design?.base) b.color = design.base;
      touch(b);
      save(s);
      return design;
    }

    case 'set_ball_details': {
      const b = myBall(s, uid, a.p_ball);
      const catalog = cleanCatalogId(typeof a.p_catalog === 'string' ? a.p_catalog : null);
      const layout = cleanLayout(a.p_layout);
      if ((catalog && !isCatalogId(catalog)) || layoutProblem(layout)) fail('invalido');
      b.catalog = catalog;
      b.layout = layout;
      touch(b);
      save(s);
      return null;
    }

    default: {
      // set_game_balls: {"<juego>": bola | null | <otro juego>} de un juego suelto, un evento o un envío.
      const kind = a.p_kind;
      const ref = typeof a.p_ref === 'string' ? a.p_ref : '';
      const balls = (a.p_balls && typeof a.p_balls === 'object' ? a.p_balls : {}) as Record<string, unknown>;
      if (kind !== 'solo' && kind !== 'event' && kind !== 'sub') return fail('invalido');
      const games =
        kind === 'solo' ? soloOf(uid, ref, read)?.scores.length : kind === 'event' ? eventOf(uid, ref, read)?.games : subOf(ref, read)?.scores.length;
      // Ya no está (o en un envío revisado: la demostración no pasa sus bolas al evento): nada que marcar.
      if (games == null || (kind === 'sub' && subOf(ref, read)?.status !== 'pendiente')) return 0;
      if (Object.keys(balls).some((k) => !/^[0-9]$/.test(k) || Number(k) >= games)) fail('invalido');
      const at = (g: Row) => kindOf(g) === kind && refOf(g) === ref && mine(g);
      // Cómo queda cada juego que viene (un número lee la bola que tiene ahora ese otro juego).
      const target = new Map<number, string | null>();
      for (const [k, v] of Object.entries(balls)) {
        if (typeof v === 'string') target.set(Number(k), s.balls.some((b) => b.id === v && mine(b)) ? v : null);
        else if (typeof v === 'number' && kind === 'solo') target.set(Number(k), (s.games.find((g) => at(g) && Number(g.game) === v)?.ball_id as string | undefined) ?? null);
        else target.set(Number(k), null);
      }
      s.games = s.games.filter((g) => !at(g) || (Number(g.game) < games && !(target.has(Number(g.game)) && target.get(Number(g.game)) !== g.ball_id)));
      for (const [game, ball] of target) {
        if (!ball || s.games.some((g) => at(g) && Number(g.game) === game)) continue;
        s.games.push({
          id: uuidv7(),
          user_id: uid,
          ball_id: ball,
          solo_id: kind === 'solo' ? ref : null,
          event_id: kind === 'event' ? ref : null,
          sub_id: kind === 'sub' ? ref : null,
          game,
          created_at: iso(),
        });
      }
      save(s);
      return s.games.filter(at).length;
    }
  }
}
