// El mismo tipo de query.ts (desde aquí, './query' es el compartido: no tiene hermano .native).
import type { QueryClientOptions } from './query';
import { asyncQueryStore } from '@movil/platform/queryStore';

/**
 * En el teléfono no hay IndexedDB: la copia de las consultas va a AsyncStorage (movil/src/platform/queryStore.ts). Así
 * las pantallas muestran lo último que se vio aunque se abra la app sin señal.
 */
export const queryPersistence = (): QueryClientOptions['persistence'] => asyncQueryStore();
