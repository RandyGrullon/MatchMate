import type { OutboxStorage } from './outbox';

/**
 * Dónde guarda la cola sin conexión la capa de datos (src/lib/data/client.ts). En la web, lo de siempre (IndexedDB si
 * existe); la app del teléfono (movil/) usa outboxStorage.native.ts.
 */
export const outboxStorage = (): OutboxStorage | undefined => undefined;
