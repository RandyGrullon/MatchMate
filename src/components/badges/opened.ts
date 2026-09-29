import { useCallback, useState } from 'react';

/**
 * Las insignias que la cuenta ya abrió en este teléfono: la marca «Nueva» dura 7 días o hasta abrirla (§4.7). Es solo
 * una comodidad (si el teléfono no guarda, sale «Nueva» los 7 días).
 */
const MAX = 300;
const keyOf = (uid: string) => `mm:insignias-abiertas:${uid}`;

export function loadOpened(uid: string | null | undefined): Set<string> {
  if (!uid) return new Set();
  try {
    const raw = JSON.parse(localStorage.getItem(keyOf(uid)) ?? '[]');
    return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function saveOpened(uid: string, ids: ReadonlySet<string>) {
  try {
    localStorage.setItem(keyOf(uid), JSON.stringify([...ids].slice(-MAX)));
  } catch {
    // Sin almacenamiento: no pasa nada.
  }
}

/** Las abiertas y cómo anotar más. */
export function useOpened(uid: string | null | undefined): [ReadonlySet<string>, (ids: readonly string[]) => void] {
  const [state, setState] = useState<{ uid: string | null | undefined; set: Set<string> }>(() => ({ uid, set: loadOpened(uid) }));
  let set = state.set;
  if (state.uid !== uid) {
    set = loadOpened(uid);
    setState({ uid, set });
  }
  const mark = useCallback(
    (ids: readonly string[]) =>
      setState((s) => {
        if (!s.uid || ids.every((id) => s.set.has(id))) return s;
        const next = new Set([...s.set, ...ids]);
        saveOpened(s.uid, next);
        return { uid: s.uid, set: next };
      }),
    [],
  );
  return [set, mark];
}
