/**
 * Las variables de la app (VITE_* en la web). La app del teléfono (movil/) usa env.native.ts, que las arma con las
 * EXPO_PUBLIC_*: así la lógica compartida no lee `import.meta.env` (no existe en React Native).
 */
export type AppEnv = Readonly<Record<string, string | boolean | undefined>>;

export const env = (): AppEnv => import.meta.env;
