/**
 * Ganchos de la consola: estado en el link (filtros, página, cuenta abierta), búsqueda con espera,
 * reintentar lecturas y copiar al portapapeles.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { queryClient } from '../../lib/data/client';
import { saveErrorMessage, useFeedback } from '../../components/feedback';
import { asBackendError } from '../../lib/db/errors';
import { BLOCKED_MESSAGE, isBlockedError } from '../../lib/backend/errors';

/** Lo que tarda la búsqueda en salir después de la última tecla (ms). */
export const SEARCH_DEBOUNCE_MS = 300;

/** El valor, pero solo después de `ms` sin cambios. */
export function useDebounced<T>(value: T, ms = SEARCH_DEBOUNCE_MS): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export type ParamPatch = Record<string, string | number | null | undefined>;

/**
 * Filtros y página guardados en el link (?q=…&p=2): «atrás» y compartir el link los respetan.
 * `patch` cambia varios a la vez (null o '' los quita) sin agregar una entrada al historial.
 */
export function useSearchState() {
  const [params, setParams] = useSearchParams();
  const get = useCallback((key: string, fallback = '') => params.get(key) ?? fallback, [params]);
  const patch = useCallback(
    (changes: ParamPatch) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(changes)) {
            if (v == null || v === '') next.delete(k);
            else next.set(k, String(v));
          }
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );
  return useMemo(() => ({ params, get, patch }), [params, get, patch]);
}

export type SearchState = ReturnType<typeof useSearchState>;

/**
 * Texto de un buscador que va al link (`?q=…`) un momento después de la última tecla; al cambiar vuelve a la
 * primera página. Devuelve lo escrito (inmediato) y cómo cambiarlo.
 */
export function useSearchText(s: SearchState, key = 'q'): [string, (v: string) => void] {
  const current = s.get(key);
  const [text, setText] = useState(current);
  const debounced = useDebounced(text.trim());
  useEffect(() => {
    if (debounced !== current) s.patch({ [key]: debounced || null, p: null });
    // Solo cuando cambia lo escrito (no cuando cambia el link por «atrás»).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  return [text, setText];
}

/** Número entero de un parámetro, dentro de lo permitido. */
export function intParam(raw: string | null | undefined, fallback: number, allowed?: readonly number[]): number {
  const n = raw == null || raw === '' ? NaN : Number(raw);
  if (!Number.isInteger(n) || n < 0) return fallback;
  if (allowed && !allowed.includes(n)) return fallback;
  return n;
}

export const PAGE_SIZES = [25, 50, 100] as const;

/**
 * Vuelve a pedir lo que está en pantalla y falló (o está viejo). Es lo mismo que pasa al volver la señal,
 * así que no depende de cómo se llame cada consulta.
 */
export function retryReads() {
  queryClient.onReconnect();
}

/** Vuelve a pedir todo lo que está en pantalla (botón «Actualizar» y después de cambiar algo). */
export function refreshAll() {
  queryClient.invalidateAll();
}

/**
 * Ejecuta una acción de la consola: aviso de «listo» o del error en palabras sencillas.
 * Devuelve true si salió bien (useAction de la app no lo distingue cuando la acción no devuelve nada).
 */
export function useRun() {
  const { toast } = useFeedback();
  return useCallback(
    async (fn: () => Promise<unknown>, ok?: string, errorFor?: (e: unknown) => string | null): Promise<boolean> => {
      try {
        await fn();
        if (ok) toast(ok);
        return true;
      } catch (e) {
        console.error(e);
        toast(errorFor?.(e) ?? consoleErrorMessage(e), 'error');
        return false;
      }
    },
    [toast],
  );
}

/** Mensaje de error de una acción de la consola (los códigos de la base, en palabras sencillas). */
export function consoleErrorMessage(e: unknown): string {
  const be = asBackendError(e);
  const msg = e instanceof Error ? e.message : String(e);
  if (isBlockedError(be ?? e)) return BLOCKED_MESSAGE;
  if (be?.kind === 'validation' || /invalido/i.test(msg)) return 'Algún dato no sirve. Revisa y vuelve a intentar.';
  // 'no_permitido': ya no es superadmin, o la acción no se puede (p. ej. bloquear a otro superadmin).
  if (be?.kind === 'permission') return 'No se puede: solo un superadmin puede hacerlo, y nunca sobre otro superadmin.';
  return saveErrorMessage(e);
}

/** Copia al portapapeles. Devuelve si se pudo. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
