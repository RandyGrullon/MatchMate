// El mismo tipo de env.ts (desde aquí, './env' sería este mismo archivo: el teléfono prefiere los .native).
type AppEnv = Readonly<Record<string, string | boolean | undefined>>;

/**
 * Las variables de la app en el teléfono (movil/): las EXPO_PUBLIC_* de movil/.env.local y de eas.json, con los mismos
 * nombres VITE_* que lee la lógica compartida. Expo las escribe en el paquete al compilar (por eso van una por una).
 */
const values: AppEnv = {
  DEV: __DEV__,
  PROD: !__DEV__,
  VITE_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  // Sin push web en el teléfono: las notificaciones van por expo-notifications (docs del móvil).
  VITE_VAPID_PUBLIC_KEY: '',
  VITE_TURNSTILE_SITE_KEY: '',
  VITE_VERCEL_GIT_COMMIT_SHA: process.env.EXPO_PUBLIC_APP_VERSION,
};

export const env = (): AppEnv => values;
