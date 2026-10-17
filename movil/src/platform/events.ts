/**
 * Avisos de `window` en el teléfono. La lógica compartida con la web se habla por eventos de `window`: 'mm:borrador'
 * (se guardó un juego en el teléfono), 'mm:tema', y escucha 'online' y 'focus' para volver a pedir y mandar la cola
 * (src/lib/db/query.ts y outbox.ts). En React Native `window` es el objeto global pero no tiene addEventListener ni
 * dispatchEvent: aquí van, solo para esos avisos dentro de la app. `document` no se agrega (el código compartido lo
 * mira para saber si es un navegador). En la vista previa web no se toca nada.
 */
type Handler = ((event: Event) => void) | { handleEvent: (event: Event) => void };

const listeners = new Map<string, Set<Handler>>();

export function installWindowEvents() {
  const w = globalThis as unknown as Record<string, unknown>;
  if (typeof w.addEventListener === 'function') return;
  if (typeof w.Event !== 'function') {
    w.Event = class Event {
      readonly type: string;
      constructor(type: string) {
        this.type = type;
      }
    };
  }
  w.addEventListener = (type: string, handler: Handler | null) => {
    if (!handler) return;
    let set = listeners.get(type);
    if (!set) listeners.set(type, (set = new Set()));
    set.add(handler);
  };
  w.removeEventListener = (type: string, handler: Handler | null) => {
    if (handler) listeners.get(type)?.delete(handler);
  };
  w.dispatchEvent = (event: Event) => {
    for (const handler of [...(listeners.get(event.type) ?? [])]) {
      try {
        if (typeof handler === 'function') handler(event);
        else handler.handleEvent(event);
      } catch (e) {
        if (__DEV__) console.warn(`MatchMate: falló un aviso '${event.type}'`, e);
      }
    }
    return true;
  };
}

/** Avisa a quien escuche en `window` (en el teléfono y en la vista previa web). */
export function emitWindowEvent(type: string) {
  const w = globalThis as unknown as { dispatchEvent?: (e: Event) => boolean; Event?: new (type: string) => Event };
  if (typeof w.dispatchEvent === 'function' && w.Event) w.dispatchEvent(new w.Event(type));
}
