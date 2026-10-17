/**
 * El backend en la app del teléfono (movil/): siempre Supabase, con la sesión guardada en el teléfono y la señal que
 * dice el sistema (movil/src/platform/backend.ts). Mismo contrato que index.ts (la web), que elige Supabase o PGlite.
 */
export * from './types';
export { backendMode, backendReady, getBackend, setBackendForTests } from '@movil/platform/backend';
