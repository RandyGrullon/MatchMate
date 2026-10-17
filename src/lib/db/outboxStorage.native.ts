// El mismo tipo de outbox.ts (desde aquí, './outbox' es el compartido: no tiene hermano .native).
import type { OutboxStorage } from './outbox';

/**
 * En el teléfono no hay IndexedDB: la cola va a `localStorage`, que en la app (movil/src/platform/storage.ts) se
 * guarda en AsyncStorage. Así lo anotado sin señal sigue ahí aunque se cierre la app.
 */
export const outboxStorage = (): OutboxStorage | undefined => 'local';
