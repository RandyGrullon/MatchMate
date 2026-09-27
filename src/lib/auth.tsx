import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getBackend } from './backend';
import type { AuthEvent, Session } from './backend/types';
import { invalidate, queryClient, rpc, select, setDataUser } from './data/client';
import { keys, tags } from './data/keys';
import { toProfile, type ProfileRow } from './data/rows';
import { asBackendError } from './db/errors';
import { hideSplash } from './splash';
import type { UserProfile } from './types';

/** La cuenta que entró (lo que las pantallas usaban del User de Firebase). */
export interface AppUser {
  uid: string;
  email: string | null;
  /** Nombre con que se registró (el de la cuenta de Google, o el que escribió). */
  displayName: string | null;
}

interface AuthState {
  user: AppUser | null;
  /** Perfil de la cuenta (tabla profiles); null mientras no exista. */
  profile: UserProfile | null;
  /** Superadmin (profiles.is_superadmin): ve y administra todas las ligas y las cuentas. */
  isSuper: boolean;
  loading: boolean;
  /** Entró con el link de «olvidé mi contraseña»: falta poner la nueva. */
  recovering: boolean;
}

const initial: AuthState = { user: null, profile: null, isSuper: false, loading: true, recovering: false };
const Ctx = createContext<AuthState>(initial);

const toAppUser = (s: Session): AppUser => ({ uid: s.userId, email: s.email, displayName: s.name });
const sameUser = (u: AppUser | null, s: Session | null) =>
  (!u && !s) || (!!u && !!s && u.uid === s.userId && u.email === s.email && u.displayName === s.name);

/** Perfil de la cuenta. Si el registro no alcanzó a crearlo (raro), se crea ahora con su nombre. */
export async function fetchProfile(uid: string): Promise<UserProfile | null> {
  const read = () => select<ProfileRow>({ table: 'profiles', columns: 'id,email,name,is_superadmin', filters: [{ col: 'id', op: 'eq', value: uid }] });
  let rows = await read();
  if (!rows.length) {
    try {
      await rpc('ensure_profile');
      rows = await read();
    } catch (e) {
      // Igual entra: en Configuración de la cuenta puede completar su nombre.
      console.warn('[perfil] no se pudo crear', e);
    }
  }
  return rows[0] ? toProfile(rows[0]) : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<{ known: boolean; user: AppUser | null; recovering: boolean }>({ known: false, user: null, recovering: false });

  useEffect(() => {
    let alive = true;
    // Si llega un cambio mientras se lee la sesión guardada, manda el cambio (es más nuevo).
    let changed = false;
    const apply = (s: Session | null, event?: AuthEvent) => {
      if (!alive) return;
      // Primero la capa de datos (caché y cola de esa cuenta), después la pantalla.
      void setDataUser(s?.userId ?? null);
      setSession((prev) => ({
        known: true,
        user: sameUser(prev.user, s) ? prev.user : s ? toAppUser(s) : null,
        recovering: event === 'PASSWORD_RECOVERY' ? true : event === 'SIGNED_OUT' || event === 'USER_UPDATED' ? false : prev.recovering,
      }));
    };
    const b = getBackend();
    const off = b.auth.onChange((event, s) => {
      changed = true;
      apply(s, event);
    });
    b.auth.getSession().then(
      (s) => !changed && apply(s),
      (e) => {
        console.error('[sesión] no se pudo leer', e);
        if (!changed) apply(null);
      },
    );
    return () => {
      alive = false;
      off();
    };
  }, []);

  const uid = session.user?.uid;
  const profile = queryClient.useQuery<UserProfile | null>(uid ? keys.profile(uid) : null, () => fetchProfile(uid!), {
    initial: null,
    tags: uid ? [tags.profile(uid)] : [],
  });

  const state = useMemo<AuthState>(() => {
    const p = uid ? profile.data : null;
    return {
      user: session.user,
      profile: p,
      isSuper: p?.superadmin === true,
      loading: !session.known || (!!uid && profile.loading),
      recovering: session.recovering,
    };
  }, [session, uid, profile.data, profile.loading]);

  // La animación de apertura se va cuando ya se sabe quién es el usuario.
  useEffect(() => {
    if (!state.loading) hideSplash();
  }, [state.loading]);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

/** Nombre para mostrar de la cuenta (perfil, nombre del registro o el correo). */
export const displayName = (a: Pick<AuthState, 'user' | 'profile'>) =>
  a.profile?.name || a.user?.displayName || a.user?.email?.split('@')[0] || 'Jugador';

export const login = (email: string, password: string) => getBackend().auth.signIn(email.trim(), password);

export const logout = () => getBackend().auth.signOut();

/**
 * Registro con correo y contraseña. El perfil lo crea la base con el nombre. Si el proyecto pide confirmar el
 * correo, no entra todavía: `needsConfirm` = hay que abrir el link que llegó al correo.
 */
/** `adult`: marcó «tengo 18 años o más» (queda en profiles.adult_confirmed_at). */
export async function signUp(name: string, email: string, password: string, adult = false): Promise<{ needsConfirm: boolean }> {
  const s = await getBackend().auth.signUp(email.trim(), password, name.trim(), adult ? { adult: true } : undefined);
  return { needsConfirm: !s };
}

/** Vuelve a mandar el correo de confirmación (cuentas sin confirmar, p. ej. las traídas de BowlingX). */
export async function resendConfirmation(email: string) {
  await getBackend().auth.resendConfirmation(email.trim());
}

/** Completa el perfil de una cuenta que no lo tenía (lo crea y le pone el nombre). */
export async function createProfile(user: Pick<AppUser, 'uid'>, name: string) {
  await rpc('ensure_profile');
  await rpc('rename_profile', { p_name: name.trim() });
  invalidate(tags.profile(user.uid));
}

export async function renameProfile(user: Pick<AppUser, 'uid'>, name: string) {
  await rpc('rename_profile', { p_name: name.trim() });
  invalidate(tags.profile(user.uid));
}

/**
 * Entrar o registrarse con Google (si no tenía cuenta, se crea). En Supabase va a Google y vuelve; en el modo
 * local no hay Google y el error lo dice.
 */
export const loginWithGoogle = () => getBackend().auth.signInWithGoogle();

/** Manda el correo para poner una contraseña nueva (el link abre /cuenta?recuperar=1). */
export const resetPassword = (email: string) => getBackend().auth.resetPassword(email.trim());

/** Contraseña nueva de la cuenta que entró (también al volver del link de recuperar). */
export const updatePassword = (password: string) => getBackend().auth.updatePassword(password);

export const MIN_PASSWORD = 6;

/** Mensaje para el usuario; vacío si no hay nada que avisar. */
export function authErrorMessage(e: unknown): string {
  const be = asBackendError(e);
  if (be) {
    if (be.kind === 'network') return 'Sin conexión. Revisa tu internet.';
    // Los errores de la cuenta ya vienen en español (backend/errors.ts), también el de Google en modo local.
    if (be.kind === 'auth' || be.kind === 'validation' || be.kind === 'conflict' || be.kind === 'rate_limited') return be.message;
    if (be.code === 'insecure_context') return be.message;
  }
  return 'No se pudo completar. Intenta de nuevo.';
}
