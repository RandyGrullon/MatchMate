/**
 * Solo en la demostración en memoria (demoBackend.ts, /dev/empresa): Configuración (/cuenta) de la cuenta de prueba.
 * Contesta, con la misma forma que la base, las RPC de tu nombre y tu @usuario (rename_profile, ensure_profile,
 * username_status, set_username: src/lib/auth.tsx y src/lib/data/people.ts), las del perfil público (set_bio,
 * set_avatar, my_blocked_users, block_user, unblock_user: src/lib/data/profileSocial.ts) y public_profile de la cuenta
 * de prueba; pone el nombre y el @usuario cambiados encima de la fila de `profiles`. La contraseña contesta como la base
 * sin guardar nada (demoUpdatePassword). Se guarda en sessionStorage y se borra al salir de la demostración
 * (forgetDemoAccount). Todos los datos son ficticios.
 */
import { mapAuthError } from '@mm/lib/backend/errors';
import { BackendError, type BackendErrorKind } from '@mm/lib/backend/types';
import { MIN_PASSWORD } from '@mm/lib/auth';
import type { PublicProfile } from '@mm/lib/data/follows';
import { normalizeUsername, usernameProblem, type UsernameStatus } from '@mm/lib/data/people';
import type { BlockedPerson } from '@mm/lib/data/profileSocial';

type Row = Record<string, unknown>;
type Filter = { col: string; op: string; value: unknown };
/** Las filas fijas de una tabla (para `profiles`, la de la cuenta de prueba). */
type Read = (table: string) => Row[] | null;

const KEY = 'mm-demo-cuenta';

/** Personas ficticias que la cuenta de prueba ya bloqueó (para probar «Desbloquear»). */
const SEED_BLOCKED: BlockedPerson[] = [
  { id: '00000000-0000-7000-8000-00000000d0b1', name: 'Jugador Tres', username: 'jugadortres', avatar: null, at: '2026-10-20T15:00:00.000Z' },
  { id: '00000000-0000-7000-8000-00000000d0b2', name: 'Jugadora Cuatro', username: 'jugadoracuatro', avatar: null, at: '2026-10-12T15:00:00.000Z' },
];

/** Otras cuentas ficticias que se pueden bloquear desde la demostración (su nombre en la lista). */
const KNOWN: Record<string, { name: string; username: string | null }> = {
  '00000000-0000-7000-8000-00000000d0ff': { name: 'Persona de Prueba', username: 'prueba' },
};

/** @usuarios que ya tiene otra cuenta ficticia y los que la app se guarda. */
const TAKEN = ['prueba', 'jugadortres', 'jugadoracuatro', 'jugadoruno'];
const RESERVED = ['admin', 'matchmate', 'soporte'];

interface State {
  /** Lo cambiado (null: lo de la base). */
  name: string | null;
  username: string | null;
  bio: string | null;
  /** Ruta de la foto en el bucket `avatars` (el archivo lo guarda el storage de demoBackend). */
  avatar: string | null;
  /** Las personas bloqueadas, la más nueva primero. */
  blocked: BlockedPerson[];
}

const empty = (): State => ({ name: null, username: null, bio: null, avatar: null, blocked: SEED_BLOCKED.map((p) => ({ ...p })) });

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

export function forgetDemoAccount() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // sin sessionStorage
  }
}

const fail = (message: string, kind: BackendErrorKind, code: string | null = null): never => {
  throw new BackendError(message, kind, code);
};

const matches = (r: Row, filters: readonly Filter[]) => filters.every((f) => f.op !== 'eq' || r[f.col] === f.value);

/** La fila de `profiles` con el nombre y el @usuario cambiados; null si la tabla no es `profiles`. */
export function demoAccountSelect(table: string, filters: readonly Filter[] = [], read: Read): Row[] | null {
  if (table !== 'profiles') return null;
  const s = load();
  return (read(table) ?? [])
    .map((r) => ({ ...r, name: s.name ?? r.name, username: s.username ?? r.username }))
    .filter((r) => matches(r, filters));
}

/** Cómo está un @usuario para la cuenta de prueba (username_status de la base). */
function statusOf(v: string, current: string): UsernameStatus {
  if (usernameProblem(v)) return 'invalid';
  if (v === current) return 'mine';
  if (RESERVED.includes(v)) return 'reserved';
  if (TAKEN.includes(v)) return 'taken';
  return 'ok';
}

/**
 * Las RPC de Configuración para la cuenta de prueba. `read`: las filas fijas de una tabla (la de `profiles` para el
 * nombre y el @usuario de la base). undefined si la función no es de aquí (sigue demoBackend como siempre).
 */
export function accountRpc(uid: string, fn: string, a: Record<string, unknown>, read: Read): unknown {
  const FNS = ['rename_profile', 'ensure_profile', 'username_status', 'set_username', 'set_bio', 'set_avatar', 'public_profile', 'my_blocked_users', 'block_user', 'unblock_user'];
  if (!FNS.includes(fn)) return undefined;
  // Solo el perfil de la cuenta de prueba (el de otras cuentas, como siempre).
  if (fn === 'public_profile' && a.p_user !== uid) return undefined;
  const s = load();
  const base = (read('profiles') ?? []).find((r) => r.id === uid) ?? {};
  const currentName = s.name ?? (typeof base.name === 'string' ? base.name : '');
  const currentUsername = s.username ?? (typeof base.username === 'string' ? base.username : '');
  const done = <T>(out: T): T => {
    save(s);
    return out;
  };

  switch (fn) {
    case 'ensure_profile':
      return null;
    case 'rename_profile': {
      const name = typeof a.p_name === 'string' ? a.p_name.trim() : '';
      if (!name || name.length > 60) fail('invalido', 'validation', 'invalido');
      s.name = name;
      return done(null);
    }
    case 'username_status':
      return statusOf(normalizeUsername(String(a.p_username ?? '')), currentUsername);
    case 'set_username': {
      const v = normalizeUsername(String(a.p_username ?? ''));
      const status = statusOf(v, currentUsername);
      if (status === 'invalid') fail('invalido', 'validation', 'invalido');
      if (status === 'reserved') fail('reservado', 'validation', 'reservado');
      if (status === 'taken') fail('duplicado', 'conflict', 'duplicado');
      s.username = v;
      return done(v);
    }
    case 'set_bio': {
      const bio = typeof a.p_bio === 'string' ? a.p_bio.replace(/\s+/g, ' ').trim() : '';
      s.bio = bio || null;
      return done(s.bio);
    }
    case 'set_avatar':
      s.avatar = typeof a.p_path === 'string' && a.p_path ? a.p_path : null;
      return done({ avatar: s.avatar });
    case 'my_blocked_users':
      return s.blocked;
    case 'block_user': {
      const id = String(a.p_user);
      if (id === uid) fail('invalido', 'validation', 'invalido');
      if (!s.blocked.some((p) => p.id === id)) {
        const who = KNOWN[id] ?? { name: 'Jugador de Ejemplo', username: null };
        s.blocked = [{ id, name: who.name, username: who.username, avatar: null, at: new Date().toISOString() }, ...s.blocked];
      }
      return done({ blocked: true });
    }
    case 'unblock_user':
      s.blocked = s.blocked.filter((p) => p.id !== a.p_user);
      return done({ blocked: false });
    default: {
      // public_profile de la cuenta de prueba.
      const me: PublicProfile = {
        id: uid,
        name: currentName,
        username: currentUsername,
        since: typeof base.created_at === 'string' ? base.created_at : null,
        sports: [],
        followers: 0,
        following: 0,
        likesReceived: 0,
        gamesCount: 0,
        isFollowing: false,
        followsYou: false,
        isMe: true,
        bio: s.bio,
        avatar: s.avatar,
        posts: 0,
        blockedByMe: false,
      };
      return me;
    }
  }
}

/** Contraseña nueva en la demostración: contesta como la base (la muy corta no pasa) y no guarda nada. */
export async function demoUpdatePassword(password: string): Promise<void> {
  if (password.length < MIN_PASSWORD) throw mapAuthError({ name: 'AuthWeakPasswordError', message: 'weak_password', status: 422, code: 'weak_password' });
}
