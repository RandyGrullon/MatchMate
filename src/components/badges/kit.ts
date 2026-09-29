import { useEffect, useState } from 'react';

/**
 * El catálogo y el dibujo de las insignias pesan: las piezas que van en todas las pantallas (Avisos, el aviso al
 * ganar, la portada de la liga) los cargan aparte y solo cuando hay algo que mostrar.
 */
export type BadgeKit = typeof import('./logic');

let kit: BadgeKit | null = null;
let loading: Promise<BadgeKit> | null = null;

export function loadBadgeKit(): Promise<BadgeKit> {
  loading ??= import('./logic').then((m) => (kit = m));
  return loading;
}

/** El kit (null mientras carga o si `enabled` es false). */
export function useBadgeKit(enabled = true): BadgeKit | null {
  const [k, setK] = useState<BadgeKit | null>(kit);
  useEffect(() => {
    if (!enabled || k) return;
    let alive = true;
    loadBadgeKit()
      .then((m) => alive && setK(m))
      .catch((e) => {
        loading = null;
        console.error(e);
      });
    return () => {
      alive = false;
    };
  }, [enabled, k]);
  return enabled ? k : null;
}
