import { useState } from 'react';

/**
 * Las últimas búsquedas de la lupa (/buscar), en el teléfono: salen como chips con la caja vacía. Una lista por cuenta
 * (en un teléfono compartido no se ven las de otra) y otra sin cuenta. Si el navegador no deja guardar (modo privado,
 * datos borrados), la pantalla funciona igual: sin chips.
 */

/** Cuántas se recuerdan. */
export const RECENT_MAX = 6;
/** Con menos letras no se recuerda (la base tampoco busca). */
const RECENT_MIN = 2;
const RECENT_LEN = 60;

export const recentKey = (uid: string | null | undefined) => `mm:buscar-recientes:${uid || 'sin-cuenta'}`;

const clean = (q: string) => q.trim().replace(/\s+/g, ' ').slice(0, RECENT_LEN);
const same = (a: string, b: string) => a.toLocaleLowerCase('es') === b.toLocaleLowerCase('es');

/** La lista con `q` primero (sin repetirla, sin mirar mayúsculas), hasta 6. Muy corta: la lista igual. */
export function pushRecent(list: readonly string[], q: string): string[] {
  const v = clean(q);
  if (v.replace(/^@+/, '').length < RECENT_MIN) return [...list];
  return [v, ...list.filter((x) => !same(x, v))].slice(0, RECENT_MAX);
}

/** Lo guardado: vacío si no hay nada, si está dañado o si el navegador no deja leer. */
export function readRecent(uid: string | null | undefined): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(recentKey(uid));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: string[] = [];
    for (const x of parsed) {
      if (typeof x !== 'string') continue;
      const v = clean(x);
      if (v && !out.some((o) => same(o, v))) out.push(v);
    }
    return out.slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

/** Guarda la lista (vacía: la borra). Si el navegador no deja, no pasa nada. */
export function writeRecent(uid: string | null | undefined, list: readonly string[]): void {
  try {
    const store = globalThis.localStorage;
    if (!store) return;
    if (list.length) store.setItem(recentKey(uid), JSON.stringify(list.slice(0, RECENT_MAX)));
    else store.removeItem(recentKey(uid));
  } catch {
    // Sin dónde guardar: los chips duran lo que dura la pantalla.
  }
}

export interface RecentSearches {
  list: string[];
  /** Recuerda una búsqueda (la pone primero). */
  add: (q: string) => void;
  /** Olvida todas. */
  clear: () => void;
}

/** Las búsquedas recientes de la cuenta (`uid`) o del teléfono sin cuenta; se vuelven a leer si cambia la cuenta. */
export function useRecentSearches(uid: string | null | undefined): RecentSearches {
  const owner = uid || null;
  const [state, setState] = useState(() => ({ owner, list: readRecent(owner) }));
  let current = state;
  if (state.owner !== owner) {
    // Cambió la cuenta (entró o salió): sus búsquedas, no las de la otra.
    current = { owner, list: readRecent(owner) };
    setState(current);
  }
  const { list } = current;
  return {
    list,
    add(q) {
      const next = pushRecent(list, q);
      if (next.length === list.length && next.every((x, i) => x === list[i])) return;
      writeRecent(owner, next);
      setState({ owner, list: next });
    },
    clear() {
      writeRecent(owner, []);
      setState({ owner, list: [] });
    },
  };
}
