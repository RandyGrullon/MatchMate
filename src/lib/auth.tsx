import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { isFixedSuper } from './admins';
import { auth, db } from './firebase';
import { hideSplash } from './splash';
import type { UserProfile } from './types';

interface AuthState {
  user: User | null;
  /** Cuenta en users/{uid}; null mientras no exista (cuentas creadas en la consola). */
  profile: UserProfile | null;
  /** Superadmin: ve y administra todas las ligas y las cuentas. */
  isSuper: boolean;
  loading: boolean;
}

const initial: AuthState = { user: null, profile: null, isSuper: false, loading: true };
const Ctx = createContext<AuthState>(initial);

const withGoogle = (user: User) => user.providerData.some((p) => p.providerId === 'google.com');

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(initial);

  // La animación de apertura se va cuando ya se sabe quién es el usuario.
  useEffect(() => {
    if (!state.loading) hideSplash();
  }, [state.loading]);

  useEffect(() => {
    let stopProfile: (() => void) | undefined;
    const stopAuth = onAuthStateChanged(auth, (user) => {
      stopProfile?.();
      stopProfile = undefined;
      if (!user) {
        setState({ user: null, profile: null, isSuper: false, loading: false });
        return;
      }
      const fixed = isFixedSuper(user.email);
      const current = () => auth.currentUser?.uid === user.uid;
      const show = (profile: UserProfile | null) => {
        if (current()) setState({ user, profile, isSuper: fixed || profile?.superadmin === true, loading: false });
      };
      setState({ user, profile: null, isSuper: fixed, loading: true });
      // El perfil se escucha en vivo: si otro superadmin lo nombra, se nota al instante.
      const listen = (attempt: number) => {
        stopProfile = onSnapshot(
          doc(db, 'users', user.uid),
          // Avisa también cuando el servidor solo confirma lo que decía la caché.
          { includeMetadataChanges: true },
          (snap) => {
            // "No existe" según la caché del teléfono no basta: se espera la respuesta del servidor
            // (si no, a quien ya tiene cuenta se le pediría completarla o se le intentaría crear otra vez).
            if (!snap.exists() && snap.metadata.fromCache && navigator.onLine) return;
            const profile = snap.exists() ? ({ id: snap.id, ...snap.data() } as UserProfile) : null;
            // Primera vez con Google (también al volver de la redirección): la cuenta se crea sola.
            if (!profile && withGoogle(user)) {
              ensureProfile(user)
                .then(() => getDoc(doc(db, 'users', user.uid)))
                .then((s) => s.exists() && show({ id: s.id, ...s.data() } as UserProfile))
                // Si no se pudo, igual entra: en Configuración de la cuenta puede completar su nombre.
                .catch(() => show(null));
              return;
            }
            show(profile);
          },
          () => {
            // Justo al entrar, Firestore a veces lee todavía con la sesión anterior: se reintenta
            // (0,5 s, 1 s, 2 s, 4 s…) y mientras tanto se muestra lo que haya.
            if (attempt === 0) show(null);
            if (attempt < 6 && current()) setTimeout(() => current() && listen(attempt + 1), 500 * 2 ** attempt);
          },
        );
      };
      listen(0);
    });
    return () => {
      stopProfile?.();
      stopAuth();
    };
  }, []);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

/** Nombre para mostrar de la cuenta (perfil, nombre de Auth o el correo). */
export const displayName = (a: Pick<AuthState, 'user' | 'profile'>) =>
  a.profile?.name || a.user?.displayName || a.user?.email?.split('@')[0] || 'Jugador';

export const login = (email: string, password: string) => signInWithEmailAndPassword(auth, email.trim(), password);

export const logout = () => signOut(auth);

/** Perfil de la cuenta en users/{uid}. También sirve para cuentas creadas en la consola. */
export async function createProfile(user: User, name: string) {
  await updateProfile(user, { displayName: name.trim() });
  await setDoc(doc(db, 'users', user.uid), {
    email: user.email,
    name: name.trim(),
    createdAt: serverTimestamp(),
  });
}

export async function renameProfile(user: User, name: string) {
  await updateProfile(user, { displayName: name.trim() });
  await updateDoc(doc(db, 'users', user.uid), { name: name.trim() });
}

/** Registro con correo y contraseña, sin verificación de correo. */
export async function signUp(name: string, email: string, password: string) {
  const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password);
  try {
    await createProfile(user, name);
  } catch (e) {
    // Sin perfil la cuenta queda a medias: se borra para que pueda volver a registrarse con el mismo correo.
    await deleteUser(user).catch(() => undefined);
    throw e;
  }
}

/** Una sola creación por cuenta aunque la pidan a la vez el login y el listener del perfil. */
const ensuring = new Map<string, Promise<void>>();

/**
 * Crea users/{uid} con el nombre de Google (solo se llama cuando el perfil no existe).
 * Justo al entrar, Firestore puede mandar la primera escritura con la sesión anterior: se reintenta.
 */
function ensureProfile(user: User): Promise<void> {
  let p = ensuring.get(user.uid);
  if (!p) {
    p = (async () => {
      const name = (user.displayName || user.email?.split('@')[0] || 'Jugador').trim().slice(0, 60);
      const create = () => setDoc(doc(db, 'users', user.uid), { email: user.email, name, createdAt: serverTimestamp() });
      try {
        await create();
      } catch {
        await new Promise((r) => setTimeout(r, 800));
        await create();
      }
    })();
    ensuring.set(user.uid, p);
    p.catch(() => ensuring.delete(user.uid));
  }
  return p;
}

/**
 * Entrar o registrarse con Google. Si la persona no tenía cuenta, se crea en ese momento.
 * Ventana emergente; si el navegador no la deja abrir, se va a Google y vuelve (redirección).
 */
export async function loginWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  auth.languageCode = 'es';
  try {
    // El perfil lo crea el listener de AuthProvider si es la primera vez.
    await signInWithPopup(auth, provider);
  } catch (e) {
    const code = (e as { code?: string })?.code ?? '';
    if (/popup-blocked|operation-not-supported-in-this-environment/.test(code)) {
      await signInWithRedirect(auth, provider);
      return;
    }
    throw e;
  }
}

export const MIN_PASSWORD = 6;

/** Mensaje para el usuario; vacío si no hay nada que avisar (cerró la ventana de Google). */
export function authErrorMessage(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  if (/popup-closed-by-user|cancelled-popup-request|user-cancelled/.test(code)) return '';
  if (/invalid-credential|wrong-password|user-not-found/.test(code)) return 'Correo o contraseña incorrectos.';
  if (code.includes('invalid-email')) return 'Ese correo no es válido.';
  if (code.includes('email-already-in-use')) return 'Ya existe una cuenta con ese correo. Entra con tu contraseña o con Google.';
  if (code.includes('account-exists-with-different-credential'))
    return 'Ese correo ya tiene cuenta con contraseña: entra con tu correo y contraseña.';
  if (code.includes('weak-password') || code.includes('password-does-not-meet'))
    return `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`;
  if (/operation-not-allowed|admin-restricted-operation/.test(code))
    return 'Esa forma de entrar no está activada. Hay que activarla en Firebase (Authentication → Método de acceso).';
  if (code.includes('unauthorized-domain'))
    return 'Este sitio no está autorizado para entrar con Google. Agrégalo en Firebase (Authentication → Configuración → Dominios autorizados).';
  if (code.includes('too-many-requests')) return 'Demasiados intentos. Espera unos minutos.';
  if (code.includes('user-disabled')) return 'Esta cuenta está desactivada.';
  if (code.includes('network')) return 'Sin conexión. Revisa tu internet.';
  if (/api-key|invalid-api-key/.test(code)) return 'La configuración de Firebase no es válida (API key). Revisa las variables en Vercel.';
  if (code.includes('permission-denied')) return 'No se pudo crear tu perfil (permisos). Revisa las reglas de Firestore.';
  return 'No se pudo completar. Intenta de nuevo.';
}
