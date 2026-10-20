// El mismo tipo de uploads.ts (desde aquí, './uploads' es el compartido: no tiene hermano .native).
import type { PhotoStore } from './uploads';
import { filePhotoStore } from '@movil/platform/photoStore';

/**
 * En el teléfono no hay IndexedDB: la foto de un envío sin señal se guarda como archivo de la app
 * (movil/src/platform/photoStore.ts) y sigue ahí aunque se cierre la app hasta que se suba.
 */
export const photoStore = (): PhotoStore | null => filePhotoStore();
