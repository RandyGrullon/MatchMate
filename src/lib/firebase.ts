import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/**
 * Variables que faltan o que vienen con caracteres raros (p. ej. la API key copiada oculta como "AIza••••").
 * Sin config válida la app no puede arrancar; App.tsx muestra cuáles corregir en vez de fallar callada.
 */
export const badConfig = (
  [
    ['VITE_FIREBASE_API_KEY', firebaseConfig.apiKey],
    ['VITE_FIREBASE_AUTH_DOMAIN', firebaseConfig.authDomain],
    ['VITE_FIREBASE_PROJECT_ID', firebaseConfig.projectId],
    ['VITE_FIREBASE_APP_ID', firebaseConfig.appId],
  ] as const
)
  .filter(([, v]) => typeof v !== 'string' || !/^[!-~]+$/.test(v))
  .map(([k]) => k);

export const firebaseConfigured = badConfig.length === 0;

export const usingEmulators = import.meta.env.VITE_USE_EMULATORS === 'true';

export const app = initializeApp(
  firebaseConfigured ? firebaseConfig : { apiKey: 'missing', projectId: 'missing', appId: 'missing' },
);

export const auth = getAuth(app);

// Caché persistente: la app carga al instante con lo último visto y funciona sin conexión.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  ignoreUndefinedProperties: true,
});

if (usingEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8089);
}
