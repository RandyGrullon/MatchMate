import type { QueryClientOptions } from './query';

/**
 * Dónde guarda la caché de consultas lo que ya cargó (src/lib/data/client.ts). En la web, lo de siempre (IndexedDB si
 * existe); la app del teléfono (movil/) usa queryStore.native.ts.
 */
export const queryPersistence = (): QueryClientOptions['persistence'] => undefined;
