/**
 * Solo en la demostración en memoria (demoBackend.ts, /dev/empresa): Organizar › Ajustes de la liga y el Buzón de las
 * ligas ficticias (demoLeague.ts). Contesta las RPC de src/lib/data/leagues.ts (update_league, renew_invite_code,
 * delete_league), src/lib/data/streams.ts (set_league_live), src/lib/logos.ts (begin_logo_upload, set_league_logo),
 * src/lib/data/submissions.ts (delete_old_photos) y src/lib/data/suggestions.ts (send_suggestion,
 * mark_suggestions_read, delete_suggestion), con la misma forma que la base (20260926000500_rpc.sql,
 * 20260929001000_sueltos_logos.sql y 20261011000100_equipos_en_vivo.sql), y pone lo cambiado encima de las filas de las
 * ligas: los datos, el logo y «en vivo» en `leagues` (una liga borrada deja de salir en `leagues` y `memberships`), el
 * código en `league_secrets` y las notas en `suggestions` (de fábrica, dos en «Liga de Ejemplo»: una nueva y una leída).
 * Se guarda en sessionStorage y se borra al salir de la demostración (forgetDemoSettings). Todos los datos son
 * ficticios.
 */
import { BackendError, type BackendErrorKind } from '@mm/lib/backend/types';
import { uuidv7 } from '@mm/lib/db/ids';
import { DEMO_LEAGUE } from './demoLeague';

type Row = Record<string, unknown>;
type Filter = { col: string; op: string; value: unknown };
/** Las filas de una tabla de las ligas ficticias por debajo de esta capa, sin filtrar (null si no es de ellas). */
type Read = (table: string) => Row[] | null;

const KEY = 'mm-demo-ajustes';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

interface State {
  /** Lo cambiado de cada liga (columnas de `leagues`: update_league, set_league_live, set_league_logo). */
  leagues: Record<string, Row>;
  /** Ligas borradas (delete_league). */
  deleted: string[];
  /** El código de invitación de cada liga (renew_invite_code). */
  codes: Record<string, string>;
  /** Las notas del buzón (las de fábrica y las nuevas). */
  notes: Row[];
  /** Cuándo mandó la cuenta su última nota en cada liga (el ritmo de la base: una por minuto). */
  paces: Record<string, number>;
}

const iso = (ms = 0) => new Date(Date.now() + ms).toISOString();

/** Lo de fábrica: el código de «Liga de Ejemplo» y dos notas en su buzón (una nueva y una leída de hace días). */
function seed(): State {
  return {
    leagues: {},
    deleted: [],
    codes: { [DEMO_LEAGUE]: 'EJEM2345' },
    notes: [
      { id: '00000000-0000-7000-8000-00000000f9a1', league_id: DEMO_LEAGUE, text: '¿Podemos jugar a las 8:00 en vez de a las 7:00? Así llegamos todos del trabajo.', read: false, created_at: iso(-3 * HOUR) },
      { id: '00000000-0000-7000-8000-00000000f9a2', league_id: DEMO_LEAGUE, text: 'Sería bueno avisar en el grupo cuando cambien las pistas.', read: true, created_at: iso(-4 * DAY) },
    ],
    paces: {},
  };
}

function load(): State {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return { ...seed(), ...(JSON.parse(raw) as Partial<State>) };
  } catch {
    // sin sessionStorage: lo de fábrica
  }
  const s = seed();
  // Las horas de las notas de fábrica quedan fijas desde la primera vez.
  save(s);
  return s;
}

function save(s: State) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // sin sessionStorage: sigue en memoria hasta recargar
  }
}

export function forgetDemoSettings() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // sin sessionStorage
  }
}

const fail = (message: string, kind: BackendErrorKind, code: string | null = null): never => {
  throw new BackendError(message, kind, code);
};

const matches = (r: Row, filters: readonly Filter[]) =>
  filters.every((f) => {
    if (f.op === 'eq') return r[f.col] === f.value;
    if (f.op === 'in') return Array.isArray(f.value) && f.value.includes(r[f.col]);
    if (f.op === 'gt') return typeof r[f.col] === 'number' && (r[f.col] as number) > (f.value as number);
    return true;
  });

/** Una tabla con lo cambiado encima (sin filtrar); null si no es de las que tocan los ajustes y el buzón. */
function overlay(s: State, table: string, read: Read): Row[] | null {
  if (table === 'leagues') {
    const base = read('leagues');
    if (!base) return null;
    return base.filter((l) => !s.deleted.includes(l.id as string)).map((l) => (s.leagues[l.id as string] ? { ...l, ...s.leagues[l.id as string] } : l));
  }
  if (table === 'memberships') {
    const base = read('memberships');
    return base ? base.filter((m) => !s.deleted.includes(m.league_id as string)) : null;
  }
  if (table === 'league_secrets') {
    const ids = new Set((read('leagues') ?? []).map((l) => l.id as string));
    return Object.entries(s.codes)
      .filter(([lid]) => ids.has(lid) && !s.deleted.includes(lid))
      .map(([lid, code]) => ({ league_id: lid, invite_code: code }));
  }
  if (table === 'suggestions') {
    return s.notes.filter((n) => !s.deleted.includes(n.league_id as string)).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }
  return null;
}

/**
 * Las filas de `table` con lo cambiado en los ajustes y el buzón, y los filtros (eq, in y gt); null si la tabla no es
 * de estas (entonces contesta la capa de abajo). `read`: la capa de abajo sin filtros.
 */
export function demoSettingsSelect(table: string, filters: readonly Filter[] = [], read: Read): Row[] | null {
  const rows = overlay(load(), table, read);
  return rows ? rows.filter((r) => matches(r, filters)) : null;
}

/** Las columnas que deja cambiar update_league (las demás: 'invalido', como la base). */
const PATCH_KEYS = ['name', 'kind', 'visibility', 'venue', 'schedule', 'season_start', 'season_end', 'contact_name', 'contact_phone', 'require_photo', 'has_minors', 'tz', 'rules'];
/** Los códigos de invitación: 8 letras y números sin los que se confunden (0/O, 1/I). */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LOGO_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(webp|jpg|png)$/;

/**
 * Las RPC de los ajustes y el buzón en las ligas ficticias. `read`: la capa de abajo sin filtros (las filas de las
 * ligas, sus membresías…). undefined si la función no es de estas o la liga no es ficticia (sigue demoBackend).
 */
export function settingsRpc(uid: string, fn: string, a: Record<string, unknown>, read: (table: string) => Row[]): unknown {
  const FNS = ['update_league', 'set_league_live', 'begin_logo_upload', 'set_league_logo', 'renew_invite_code', 'delete_league', 'delete_old_photos', 'send_suggestion', 'mark_suggestions_read', 'delete_suggestion'];
  if (!FNS.includes(fn)) return undefined;
  const s = load();
  const leagues = overlay(s, 'leagues', read) ?? [];
  const members = overlay(s, 'memberships', read) ?? [];
  const leagueOf = (id: unknown) => leagues.find((l) => l.id === id) ?? null;
  const roleIn = (lid: unknown) => (members.find((m) => m.league_id === lid && m.user_id === uid)?.role as string | undefined) ?? null;
  const requireAdmin = (lid: unknown) => {
    const role = roleIn(lid);
    if (role !== 'owner' && role !== 'admin') fail('no_permitido', 'permission', 'no_permitido');
  };
  const patch = (lid: string, p: Row) => {
    s.leagues[lid] = { ...s.leagues[lid], ...p };
  };

  // Las notas: la de una liga ficticia (si la nota o la liga no es de la demostración, sigue demoBackend).
  if (fn === 'mark_suggestions_read') {
    const ids = Array.isArray(a.p_ids) ? (a.p_ids as unknown[]) : [];
    const notes = s.notes.filter((n) => ids.includes(n.id));
    if (!notes.length) return ids.length ? undefined : 0;
    for (const n of notes) requireAdmin(n.league_id);
    const value = a.p_read !== false;
    let changed = 0;
    for (const n of notes) {
      if (n.read !== value) {
        n.read = value;
        changed++;
      }
    }
    save(s);
    return changed;
  }
  if (fn === 'delete_suggestion') {
    const note = s.notes.find((n) => n.id === a.p_suggestion);
    if (!note) return undefined;
    requireAdmin(note.league_id);
    s.notes = s.notes.filter((n) => n !== note);
    save(s);
    return true;
  }

  const lid = String(a.p_league ?? '').toLowerCase();
  const league = leagueOf(lid);
  if (!league) return undefined;

  if (fn === 'send_suggestion') {
    if (!roleIn(lid)) fail('no_permitido', 'permission', 'no_permitido');
    const text = typeof a.p_text === 'string' ? a.p_text.trim() : '';
    if (text.length < 1 || text.length > 1000) fail('invalido', 'validation', 'invalido');
    const last = s.paces[lid] ?? 0;
    if (Date.now() - last < 60_000) fail('rate_limited', 'rate_limited');
    const id = uuidv7();
    s.notes.push({ id, league_id: lid, text, read: false, created_at: iso() });
    s.paces[lid] = Date.now();
    save(s);
    return id;
  }

  requireAdmin(lid);
  if (fn === 'update_league') {
    const p = (a.p_patch ?? {}) as Row;
    if (typeof p !== 'object' || Array.isArray(p)) fail('invalido', 'validation', 'invalido');
    if (Object.keys(p).some((k) => !PATCH_KEYS.includes(k))) fail('invalido', 'validation', 'invalido');
    // «Liga con menores» solo la apaga el superadmin (la cuenta de prueba no lo es).
    if ('has_minors' in p && league.has_minors === true && p.has_minors === false) fail('no_permitido', 'permission', 'no_permitido');
    const out: Row = {};
    for (const [k, v] of Object.entries(p)) {
      if (k === 'name') out.name = String(v ?? '').trim().replace(/\s+/g, ' ');
      else if (k === 'venue' || k === 'schedule' || k === 'contact_name') out[k] = String(v ?? '').trim();
      else if (k === 'season_start' || k === 'season_end') out[k] = v ? String(v) : null;
      else out[k] = v;
    }
    if ('name' in out && !out.name) fail('invalido', 'validation', 'invalido');
    patch(lid, out);
    save(s);
    return null;
  }
  if (fn === 'set_league_live') {
    patch(lid, { live_enabled: a.p_enabled === true });
    save(s);
    return null;
  }
  if (fn === 'begin_logo_upload') {
    const path = String(a.p_path ?? '');
    if (!LOGO_PATH.test(path) || !path.startsWith(`${lid}/`)) fail('invalido', 'validation', 'invalido');
    return null;
  }
  if (fn === 'set_league_logo') {
    const old = (league.logo_path as string | null | undefined) ?? null;
    const path = a.p_path == null ? null : String(a.p_path);
    if (path && (!LOGO_PATH.test(path) || !path.startsWith(`${lid}/`))) fail('invalido', 'validation', 'invalido');
    patch(lid, { logo_path: path });
    save(s);
    return old;
  }
  if (fn === 'renew_invite_code') {
    let code = '';
    for (let i = 0; i < 8; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    s.codes[lid] = code;
    save(s);
    return code;
  }
  if (fn === 'delete_league') {
    // Solo el dueño (o el superadmin) la borra.
    if (roleIn(lid) !== 'owner') fail('no_permitido', 'permission', 'no_permitido');
    s.deleted.push(lid);
    save(s);
    return null;
  }
  // delete_old_photos: en la demostración no hay fotos de hace más de un año.
  return [];
}
