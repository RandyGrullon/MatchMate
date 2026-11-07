/**
 * Solo en la demostración en memoria (demoBackend.ts, /dev/empresa): Organizar › Aprobar juegos de «Liga de Ejemplo»
 * (demoLeague.ts). Encima del envío de fábrica de Jugador Uno (con foto, sin leer) pone tres más: uno de Jugadora Dos en
 * la práctica de hoy que no coincide con la foto, uno tuyo por fecha (de anteayer, sin foto y con los cuadros de un
 * juego) y uno de un jugador que ya no existe. Las dos fotos son marcadores dibujados (svg) y «Leer con IA» las lee
 * sin la Edge Function.
 *
 * Contesta set_submission_scan (también el envío de fábrica), approve_submission y reject_submission de los envíos de
 * aquí (el de fábrica lo sigue contestando demoLeague.ts), con la misma forma que la base: aprobar por fecha crea la
 * práctica de ese día y lo aprobado va a la participación del jugador (o lo inscribe). Pone lo cambiado encima de las
 * filas de la liga: submissions, photos, events y entries. Se guarda en sessionStorage y se borra al salir de la
 * demostración (forgetDemoApprovals). Todos los datos son ficticios.
 */
import { uuidv7 } from '@mm/lib/db/ids';
import { PHOTO_BUCKET, photoPath } from '@mm/lib/photos';
import { NO_PHOTO } from '@mm/lib/types';
import { addDays, todayIn } from '@mm/pages/sports/racket/logic/time';
import { DEMO_LEAGUE } from './demoLeague';

type Row = Record<string, unknown>;
type Filter = { col: string; op: string; value: unknown };
/** Las filas de una tabla de las ligas ficticias, sin filtrar (null si no es de ellas). */
type Read = (table: string) => Row[] | null;

const KEY = 'mm-demo-aprobar';
const DAY = 86_400_000;
const TZ = 'America/Santo_Domingo';

// Los de «Liga de Ejemplo» (demoLeague.ts): la práctica de hoy, Juan Pérez (la cuenta de prueba) y Jugadora Dos.
const EVENT = '00000000-0000-7000-8000-00000000f0e1';
const ME_PLAYER = '00000000-0000-7000-8000-00000000f101';
const THIRD = '00000000-0000-7000-8000-00000000f103';
/** La foto del envío de fábrica de Jugador Uno (demoLeague.ts: …f301). */
const SEED_PHOTO = '00000000-0000-7000-8000-00000000f401';
/** Un jugador que ya no está en la liga (su envío se descarta). */
const GONE_PLAYER = '00000000-0000-7000-8000-00000000f1ff';

/** Los envíos que pone esta capa. */
export const DEMO_APPROVAL_SUBS = {
  third: '00000000-0000-7000-8000-00000000f304',
  mine: '00000000-0000-7000-8000-00000000f302',
  gone: '00000000-0000-7000-8000-00000000f303',
} as const;
const THIRD_PHOTO = '00000000-0000-7000-8000-00000000f402';

const iso = (ms = 0) => new Date(Date.now() + ms).toISOString();

// ---------- Las fotos: dos marcadores dibujados ----------

interface Board {
  photoId: string;
  lane: number;
  rows: { name: string; games: (number | null)[] }[];
}

const BOARDS: Board[] = [
  {
    photoId: SEED_PHOTO,
    lane: 7,
    rows: [
      { name: 'Juan Pérez', games: [168, 192, null] },
      { name: 'Jugador Uno', games: [181, 204, null] },
    ],
  },
  { photoId: THIRD_PHOTO, lane: 8, rows: [{ name: 'Jugadora Dos', games: [198, 176, 199] }] },
];
const W = 600;
const H = 400;

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** El marcador de una pista como svg (data URL): la URL «firmada» de su foto y lo que se manda a leer. */
function boardUrl(b: Board): string {
  const cell = (x: number, y: number, t: string, color = '#f5f7ff', size = 26, weight = 600) =>
    `<text x="${x}" y="${y}" fill="${color}" font-family="Arial, sans-serif" font-size="${size}" font-weight="${weight}">${esc(t)}</text>`;
  const head = ['J1', 'J2', 'J3', 'Total'].map((t, i) => cell(300 + i * 72, 120, t, '#9aa4c4', 20)).join('');
  const lines = b.rows
    .map((r, k) => {
      const y = 175 + k * 62;
      const total = r.games.reduce<number>((n, g) => n + (g ?? 0), 0);
      return cell(28, y, r.name) + r.games.map((g, i) => cell(300 + i * 72, y, g == null ? '-' : String(g))).join('') + cell(516, y, String(total), '#ffd34d');
    })
    .join('');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect width="${W}" height="${H}" fill="#10131c"/>` +
    cell(28, 58, `Pista ${b.lane} · Bolera de Ejemplo`, '#ffd34d', 28, 700) +
    head +
    lines +
    cell(28, 376, 'Foto de ejemplo (demostración)', '#5d6684', 16, 400) +
    '</svg>';
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const pathOf = (photoId: string) => photoPath(DEMO_LEAGUE, photoId, 'image/webp');

/**
 * La foto de un envío de la demostración (el `signedUrl` de Storage): el marcador dibujado. null si no es de aquí
 * (entonces contesta el Storage de demoBackend como siempre).
 */
export function demoApprovalFile(bucket: string, path: string): string | null {
  if (bucket !== PHOTO_BUCKET) return null;
  const b = BOARDS.find((x) => pathOf(x.photoId) === path);
  return b ? boardUrl(b) : null;
}

/**
 * «Leer con IA» de una foto de la demostración (la Edge Function `scan-bowling`): las filas del marcador dibujado, con
 * la forma de la función. undefined si no es una de estas fotos (sigue demoBackend como siempre).
 */
export function demoApprovalsInvoke(fn: string, body: unknown): unknown {
  if (fn !== 'scan-bowling') return undefined;
  const image = (body as { image?: unknown } | null)?.image;
  const b = BOARDS.find((x) => boardUrl(x) === image);
  if (!b) return undefined;
  return {
    rows: b.rows.map((r) => {
      const total = r.games.reduce<number>((n, g) => n + (g ?? 0), 0);
      return { name: r.name, handicap: null, games: r.games, total, matchesTotal: true };
    }),
    model: 'demostración',
    cached: false,
  };
}

// ---------- Las filas fijas ----------

const PHOTOS: Row[] = BOARDS.map((b) => ({ id: b.photoId, league_id: DEMO_LEAGUE, path: pathOf(b.photoId), width: W, height: H, purged_at: null }));

const submission = (p: Row): Row => ({
  league_id: DEMO_LEAGUE,
  date: null,
  scanned: null,
  scanned_name: null,
  frames: null,
  photo_id: null,
  status: 'pendiente',
  note: null,
  created_by: null,
  reviewed_at: null,
  reviewed_by: null,
  ...p,
});

/** Un juego de 176 tiro por tiro (X 9/ 8-1 X 7-2 9/ X 8-1 X XX3). */
const FRAMES_176 = [10, 9, 1, 8, 1, 10, 7, 2, 9, 1, 10, 8, 1, 10, 10, 10, 3];

/** Los envíos de aquí (las fechas, de hoy en la zona de la liga). */
function ownSubs(): Row[] {
  return [
    // Tuyo, por fecha (anteayer no hubo práctica: se crea al aprobar), sin la foto que la liga exige.
    submission({ id: DEMO_APPROVAL_SUBS.mine, player_id: ME_PLAYER, event_id: null, date: addDays(todayIn(TZ), -2), scores: [176, 189], frames: { '0': { rolls: FRAMES_176 } }, created_at: iso(-2 * DAY + 2 * 3_600_000) }),
    // De un jugador que ya se borró de la liga.
    submission({ id: DEMO_APPROVAL_SUBS.gone, player_id: GONE_PLAYER, event_id: EVENT, scores: [150], created_at: iso(-DAY) }),
    // Jugadora Dos en la práctica de hoy: anotó 190 en el J3 y la IA leyó 199.
    submission({
      id: DEMO_APPROVAL_SUBS.third,
      player_id: THIRD,
      event_id: EVENT,
      scores: [null, null, 190],
      scanned: [null, null, 199],
      scanned_name: 'Jugadora Dos',
      photo_id: THIRD_PHOTO,
      created_at: iso(-50 * 60_000),
    }),
  ];
}

// ---------- Lo que cambia ----------

interface Slot {
  score: number;
  photo: string;
  frames: unknown;
}

interface State {
  /** Lo cambiado de cada envío: lo leído por la IA, y si se aprobó o se rechazó (con el motivo). */
  subs: Record<string, Row>;
  /** Juegos aprobados aquí, por participación (`<evento>:<jugador>`): juego (desde 0) → pinos, foto y cuadros. */
  games: Record<string, Record<string, Slot>>;
  /** Participaciones nuevas (el jugador no estaba en el evento: se inscribe al aprobar). */
  entries: Row[];
  /** Las prácticas que se crearon al aprobar un envío por fecha. */
  events: Row[];
}

const empty = (): State => ({ subs: {}, games: {}, entries: [], events: [] });

function load(): State {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return { ...empty(), ...(JSON.parse(raw) as Partial<State>) };
  } catch {
    // sin sessionStorage: nada cambiado
  }
  return empty();
}

function save(s: State) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // sin sessionStorage: sigue en memoria hasta recargar
  }
}

export function forgetDemoApprovals() {
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

const entryKey = (eventId: unknown, playerId: unknown) => `${String(eventId)}:${String(playerId)}`;
const filled = (a: unknown[]) => Array.from(a, (x) => x ?? null);

/** Una tabla de la liga con lo de aquí encima (sin filtrar); null si no es de las que toca Aprobar. */
function overlay(s: State, table: string, read: Read): Row[] | null {
  if (table === 'submissions') {
    const base = read('submissions');
    if (!base) return null;
    return [...base, ...ownSubs()].map((r) => (s.subs[r.id as string] ? { ...r, ...s.subs[r.id as string] } : r));
  }
  if (table === 'photos') return [...(read('photos') ?? []), ...PHOTOS];
  if (table === 'events') {
    const base = read('events');
    return base ? [...base, ...s.events] : null;
  }
  if (table === 'entries') {
    const base = read('entries');
    if (!base) return null;
    return [...base, ...s.entries].map((e) => {
      const slots = s.games[entryKey(e.event_id, e.player_id)];
      if (!slots) return e;
      const scores: unknown[] = [...((e.scores as unknown[] | null) ?? [])];
      const photos: unknown[] = [...((e.photos as unknown[] | null) ?? [])];
      const frames: Row = { ...((e.frames as Row | null) ?? {}) };
      for (const [i, x] of Object.entries(slots)) {
        scores[+i] = x.score;
        photos[+i] = x.photo;
        if (x.frames) frames[i] = x.frames;
      }
      return { ...e, scores: filled(scores), photos: filled(photos), frames: Object.keys(frames).length ? frames : null };
    });
  }
  return null;
}

/**
 * Las filas de `table` con lo de Aprobar encima y los filtros (eq, in y gt); null si la tabla no es de las que toca
 * (entonces contesta la capa de abajo). `read`: la capa de abajo sin filtros (demoLeagueSelect).
 */
export function demoApprovalsSelect(table: string, filters: readonly Filter[] = [], read: Read): Row[] | null {
  const rows = overlay(load(), table, read);
  return rows ? rows.filter((r) => matches(r, filters)) : null;
}

const FNS = ['set_submission_scan', 'approve_submission', 'reject_submission'];

/**
 * Las RPC de aprobar en la liga ficticia. `read`: la capa de abajo sin filtros (la misma de demoApprovalsSelect).
 * undefined si no es de Aprobar o el envío no es de aquí (aprobar o rechazar el de fábrica lo contesta demoLeague.ts).
 */
export function approvalsRpc(uid: string, fn: string, a: Record<string, unknown>, read: (table: string) => Row[]): unknown {
  if (!FNS.includes(fn)) return undefined;
  const s = load();
  const id = a.p_submission as string;
  const view = (t: string) => overlay(s, t, read) ?? read(t);

  // Lo leído por la IA (el admin, siempre): también el envío de fábrica.
  if (fn === 'set_submission_scan') {
    if (!view('submissions').some((r) => r.id === id)) return undefined;
    s.subs[id] = { ...s.subs[id], scanned: a.p_scanned ?? null, scanned_name: a.p_scanned_name ?? null };
    save(s);
    return null;
  }

  const own = ownSubs().find((r) => r.id === id);
  if (!own) return undefined;
  const sub = { ...own, ...s.subs[id] };

  if (fn === 'reject_submission') {
    s.subs[id] = { ...s.subs[id], status: 'rechazado', note: a.p_note ?? null, reviewed_at: iso(), reviewed_by: uid };
    save(s);
    return null;
  }

  // Aprobar: sin evento, la práctica de ese día (la que hay o una nueva, en la misma vuelta, como la base).
  let eventId = (a.p_event as string | null) ?? null;
  if (!eventId) {
    const found = view('events').find((e) => e.league_id === DEMO_LEAGUE && e.type === 'practica' && e.date === sub.date);
    if (found) eventId = found.id as string;
    else {
      eventId = uuidv7();
      s.events.push({
        id: eventId,
        league_id: DEMO_LEAGUE,
        type: 'practica',
        name: '',
        date: sub.date,
        start_time: null,
        games: Number(a.p_games) || 3,
        hcp_base: 0,
        hcp_percent: 0,
        individual_rank_by: null,
        team_rank_by: null,
        category_cuts: null,
        team_size: 1,
        announcement: '',
        player_count: 1,
        created_at: iso(),
      });
    }
  }
  // Su participación: la que tiene o, si no estaba, se inscribe con el promedio que mandó la app.
  let entry = view('entries').find((e) => e.event_id === eventId && e.player_id === sub.player_id);
  if (!entry) {
    entry = { id: uuidv7(), league_id: DEMO_LEAGUE, event_id: eventId, player_id: sub.player_id, team_id: null, average: Number(a.p_average ?? 0), handicap_override: null, scores: [], photos: [], frames: null };
    s.entries.push(entry);
  }
  const frames = (a.p_frames ?? null) as Record<string, unknown> | null;
  const key = entryKey(eventId, sub.player_id);
  const slots = { ...s.games[key] };
  for (const [i, v] of Object.entries((a.p_values ?? {}) as Record<string, number>)) {
    slots[i] = { score: Number(v), photo: (sub.photo_id as string | null) ?? NO_PHOTO, frames: frames?.[i] ?? null };
  }
  s.games[key] = slots;
  s.subs[id] = { ...s.subs[id], status: 'aprobado', reviewed_at: iso(), reviewed_by: uid };
  save(s);
  return { entry_id: entry.id, event_id: eventId };
}
