import type { PhotoStore } from './uploads';

/**
 * Dónde guardan los envíos sin señal su foto (src/lib/data/uploads.ts). En la web, lo de siempre (IndexedDB si existe,
 * o en memoria); la app del teléfono (movil/) usa photoStore.native.ts.
 */
export const photoStore = (): PhotoStore | null => null;
