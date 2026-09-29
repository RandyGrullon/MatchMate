import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getBackend } from './backend';
import type { AuthEvent, Session } from './backend/types';
import { touchSeenDaily } from './data/admin';
import { invalidate, queryClient, rpc, select, setDataUser } from './data/client';
import { keys, tags } from './data/keys';
import { fetchLegalAccepted } from './data/legal';
import { toPushPrefs, type PushPrefs } from './data/pushPrefs';
import { createdAfterMark, CURRENT_LEGAL, forgetLegalForGoogle, needsLegal, type LegalAccepted } from './legal';
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

/**
 * El perfil con la marca de «tengo 18 años o más» (profiles.adult_confirmed_at): null = no lo ha dicho (entró con
 * Google o viene de BowlingX); undefined = no se sabe todavía (copia vieja guardada en el teléfono).
 */
export interface AccountProfile extends UserProfile {
  adultConfirmedAt?: string | null;
  /**
   * Qué avisos quiere en el teléfono (profiles.push_prefs, src/lib/data/pushPrefs.ts). undefined = no se sabe: copia
   * vieja guardada en el teléfono o base que todavía no las tiene.
   */
  pushPrefs?: PushPrefs;
  /**
   * La última versión que aceptó de los términos y la privacidad (legal_acceptances). undefined = no se sabe (copia
   * vieja en el teléfono, o no se pudo leer): no se le pregunta hasta saberlo.
   */
  legal?: LegalAccepted;
  /** Cuándo se creó la cuenta (profiles.created_at, ISO): las de antes de guardar la aceptación ven lo nuevo. */
  createdAt?: string | null;
}

interface AuthState {
  user: AppUser | null;
  /** Perfil de la cuenta (tabla profiles); null mientras no exista. */
  profile: AccountProfile | null;
  /** Superadmin (profiles.is_superadmin): ve y administra todas las ligas y las cuentas. */
  isSuper: boolean;
  loading: boolean;
  /** Entró con el link de «olvidé mi contraseña»: falta poner la nueva. */
  recovering: boolean;
  /** Falta que diga «tengo 18 años o más» (una sola vez): la app muestra AdultGate. */
  needsAdult?: boolean;
  /** Falta aceptar la versión vigente de los términos o la privacidad: la app muestra LegalGate. */
  needsLegal?: boolean;
}

const initial: AuthState = { user: null, profile: null, isSuper: false, loading: true, recovering: false, needsAdult: false, needsLegal: false };
const Ctx = createContext<AuthState>(initial);

const toAppUser = (s: Session): AppUser => ({ uid: s.userId, email: s.email, displayName: s.name });
const sameUser = (u: AppUser | null, s: Session | null) =>
  (!u && !s) || (!!u && !!s && u.uid === s.userId && u.email === s.email && u.displayName === s.name);

type AccountProfileRow = ProfileRow & { adult_confirmed_at?: string | null; created_at?: string | null; push_prefs?: unknown };

const PROFILE_COLUMNS = 'id,email,name,is_superadmin,adult_confirmed_at,created_at';
/** Columnas que llegaron después, en el orden de sus migraciones: username (20260929000200) y push_prefs (20260929000500). */
const PROFILE_NEWER_COLUMNS = ['username', 'push_prefs'];

/**
 * Perfil de la cuenta. Si el registro no alcanzó a crearlo (raro), se crea ahora con su nombre. Si la base todavía no
 * tiene username o push_prefs (42703: la app salió antes que la migración), se lee sin esa columna (la que nombra el
 * error, o la más nueva) en vez de quedarse sin perfil.
 */
export async function fetchProfile(uid: string): Promise<AccountProfile | null> {
  const query = (columns: string) => select<AccountProfileRow>({ table: 'profiles', columns, filters: [{ col: 'id', op: 'eq', value: uid }] });
  let newer = PROFILE_NEWER_COLUMNS;
  const read = async () => {
    for (;;) {
      try {
        return await query([PROFILE_COLUMNS, ...newer].join(','));
      } catch (e) {
        const err = asBackendError(e);
        if (err?.code !== '42703' || !newer.length) throw e;
        const missing = newer.find((c) => err.message.includes(c)) ?? newer[newer.length - 1];
        newer = newer.filter((c) => c !== missing);
      }
    }
  };
  // Qué versión de los términos y la privacidad aceptó, a la vez (si no se puede leer, no se pregunta ahora).
  const [first, legal] = await Promise.all([
    read(),
    fetchLegalAccepted(uid).catch((e: unknown) => {
      console.warn('[legal] no se pudo leer la aceptación', e);
      return undefined;
    }),
  ]);
  let rows = first;
  if (!rows.length) {
    try {
      await rpc('ensure_profile');
      rows = await read();
    } catch (e) {
      // Igual entra: en Configuración de la cuenta puede completar su nombre.
      console.warn('[perfil] no se pudo crear', e);
    }
  }
  const row = rows[0];
  if (!row) return null;
  const profile: AccountProfile = { ...toProfile(row), adultConfirmedAt: row.adult_confirmed_at ?? null, legal, createdAt: row.created_at ?? null };
  if (row.push_prefs !== undefined) profile.pushPrefs = toPushPrefs(row.push_prefs);
  return profile;
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
      if (event === 'SIGNED_OUT') forgetGoogleMarks();
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
  const profile = queryClient.useQuery<AccountProfile | null>(uid ? keys.profile(uid) : null, () => fetchProfile(uid!), {
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
      // Solo con el perfil leído de la base (una copia vieja sin la marca no cuenta).
      needsAdult: !!p && p.adultConfirmedAt === null,
      needsLegal: !!p && needsLegal(p.legal),
    };
  }, [session, uid, profile.data, profile.loading]);

  // La animación de apertura se va cuando ya se sabe quién es el usuario.
  useEffect(() => {
    if (!state.loading) hideSplash();
  }, [state.loading]);

  // «Está usando la app» (activos por día en la consola del superadmin): una vez al día por teléfono y cuenta,
  // también si la app queda abierta y vuelve a primer plano otro día. Sin esperar y sin mostrar errores.
  const hasProfile = !!uid && profile.data != null;
  useEffect(() => {
    if (!uid || !hasProfile) return;
    const run = () => void touchSeenDaily(uid);
    run();
    if (typeof document === 'undefined') return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') run();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [uid, hasProfile]);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

/** Nombre para mostrar de la cuenta (perfil, nombre del registro o el correo). */
export const displayName = (a: Pick<AuthState, 'user' | 'profile'>) =>
  a.profile?.name || a.user?.displayName || a.user?.email?.split('@')[0] || 'Jugador';

/**
 * «Tengo 18 años o más» (la app es solo para adultos): lo guarda en el perfil la primera vez (profiles.
 * adult_confirmed_at) y la app deja de preguntar. Quien se registra con correo ya lo marcó al crear la cuenta.
 */
export async function confirmAdult(uid: string): Promise<void> {
  await rpc('confirm_adult');
  const at = new Date().toISOString();
  queryClient.setQueryData<AccountProfile | null>(keys.profile(uid), (old) => (old ? { ...old, adultConfirmedAt: old.adultConfirmedAt ?? at } : old ?? null));
  invalidate(tags.profile(uid));
}

/**
 * Registro con Google: la casilla «tengo 18 años o más» se marcó antes de ir a Google (vale 1 hora y solo para una
 * cuenta creada después de marcarla, como «Acepto…» en src/lib/legal.ts). Al salir de la cuenta se olvida.
 */
const ADULT_PENDING_KEY = 'mm:mayor-de-edad';
const ADULT_PENDING_MS = 60 * 60 * 1000;

/** Antes de ir a Google a registrarse: recuerda que marcó la casilla, para confirmarlo al volver sin preguntar. */
export function rememberAdultForGoogle(now = Date.now()): void {
  try {
    localStorage.setItem(ADULT_PENDING_KEY, String(now));
  } catch {
    // Sin almacenamiento: al volver se le pregunta.
  }
}

/**
 * ¿Marcó la casilla antes de ir a Google (hace menos de 1 hora) y esta cuenta (`createdAt`, profiles.created_at) se
 * creó después? Se usa una sola vez: se borra aunque no valga.
 */
export function takeAdultPending(createdAt: string | null | undefined, now = Date.now()): boolean {
  try {
    const raw = localStorage.getItem(ADULT_PENDING_KEY);
    if (raw == null) return false;
    localStorage.removeItem(ADULT_PENDING_KEY);
    const at = Number(raw);
    return Number.isFinite(at) && now - at >= 0 && now - at < ADULT_PENDING_MS && createdAfterMark(createdAt, at);
  } catch {
    return false;
  }
}

/** Al salir de la cuenta: las casillas marcadas antes de ir a Google ya no valen (eran de otra vez o de otra persona). */
function forgetGoogleMarks(): void {
  try {
    localStorage.removeItem(ADULT_PENDING_KEY);
  } catch {
    // sin almacenamiento
  }
  forgetLegalForGoogle();
}

/** `captcha`: token de Turnstile si el proyecto lo pide (src/components/Turnstile.tsx). */
export const login = (email: string, password: string, captcha?: string) => getBackend().auth.signIn(email.trim(), password, captcha);

export const logout = () => getBackend().auth.signOut();

/**
 * Registro con correo y contraseña. El perfil lo crea la base con el nombre. Si el proyecto pide confirmar el
 * correo, no entra todavía: `needsConfirm` = hay que abrir el link que llegó al correo.
 */
/**
 * `adult`: marcó «tengo 18 años o más» (queda en profiles.adult_confirmed_at). `terms`: marcó «Acepto los Términos
 * y la Política de privacidad» (la base guarda la aceptación de las versiones vigentes al crear la cuenta).
 */
export async function signUp(
  name: string,
  email: string,
  password: string,
  adult = false,
  captcha?: string,
  terms = false,
): Promise<{ needsConfirm: boolean }> {
  const meta = { ...(adult ? { adult: true } : {}), ...(terms ? { legal: { ...CURRENT_LEGAL } } : {}) };
  const s = await getBackend().auth.signUp(email.trim(), password, name.trim(), Object.keys(meta).length ? meta : undefined, captcha);
  return { needsConfirm: !s };
}

/** Vuelve a mandar el correo de confirmación (cuentas sin confirmar, p. ej. las traídas de BowlingX). */
export async function resendConfirmation(email: string, captcha?: string) {
  await getBackend().auth.resendConfirmation(email.trim(), captcha);
}

/**
 * El error de entrar es «correo sin confirmar». Pasa con las cuentas traídas de BowlingX que no tenían el correo
 * verificado: se crearon sin mandarles ningún correo, así que la pantalla les ofrece mandar el link.
 */
export const isEmailNotConfirmed = (e: unknown): boolean => asBackendError(e)?.code === 'email_not_confirmed';

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
export const resetPassword = (email: string, captcha?: string) => getBackend().auth.resetPassword(email.trim(), captcha);

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
