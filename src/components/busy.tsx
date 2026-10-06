/**
 * Ruedita de «cargando» en lo que espera algo (guardar, borrar, subir, leer la foto…). `useBusy` dice qué acción está
 * en curso y no deja tocar dos veces; `BusyIcon` cambia el ícono por la ruedita, del mismo tamaño (no mueve nada).
 * El <Button> ya la trae con `loading`.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cx } from './ui';

export interface BusyCore<K> {
  /** La acción en curso, o null. */
  current: () => K | null;
  /** Corre `fn` marcando `key`; si ya hay otra en curso no hace nada y devuelve undefined. */
  run: <T>(key: K, fn: () => Promise<T>) => Promise<T | undefined>;
}

/**
 * Lo de `useBusy` sin React (para probarlo): una sola acción a la vez, y avisa al empezar y al terminar
 * (salga bien o mal). Los errores de `fn` siguen de largo: los muestra quien llama (useAction, useRun, toast).
 */
export function createBusy<K>(onChange: (busy: K | null) => void): BusyCore<K> {
  let current: K | null = null;
  return {
    current: () => current,
    async run<T>(key: K, fn: () => Promise<T>): Promise<T | undefined> {
      if (current !== null) return undefined;
      current = key;
      onChange(key);
      try {
        return await fn();
      } finally {
        current = null;
        onChange(null);
      }
    },
  };
}

export interface Busy<K> {
  /** La acción en curso (p. ej. 'guardar' o el id de la fila), o null. */
  busy: K | null;
  /** Sin `key`: si hay alguna en curso. Con `key`: si es esa. */
  isBusy: (key?: K) => boolean;
  /** Estable (sirve en dependencias). Ej.: `run('guardar', () => action(() => save(x), 'Guardado'))`. */
  run: <T>(key: K, fn: () => Promise<T>) => Promise<T | undefined>;
}

/**
 * Qué acción de la pantalla está esperando. Con una sola acción, cualquier clave fija sirve (`run('x', …)`);
 * en listas, el id de la fila, para que solo esa muestre la ruedita.
 */
export function useBusy<K extends string | number = string>(): Busy<K> {
  const [busy, setBusy] = useState<K | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // Si la pantalla se cerró mientras esperaba, no se toca el estado.
  const [core] = useState(() =>
    createBusy<K>((k) => {
      if (mounted.current) setBusy(k);
    }),
  );
  const isBusy = useCallback((key?: K) => (key === undefined ? busy !== null : busy === key), [busy]);
  return { busy, isBusy, run: core.run };
}

/** El ícono, o la ruedita del mismo tamaño mientras espera. `className` es el tamaño del ícono (size-4 si no). */
export function BusyIcon({ busy, icon, className }: { busy: boolean; icon?: ReactNode; className?: string }) {
  if (busy) return <Loader2 className={cx('animate-spin', className ?? 'size-4')} aria-hidden="true" />;
  return <>{icon}</>;
}
