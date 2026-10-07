import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useAuth } from './auth';
import { useMyMemberships } from './data/members';
import { canSuggestPro, chooseMode, localModeOf, reconcileMode, resolveMode, subscribeMode, type SaveResult, type UiMode } from './mode';

/**
 * Hooks del modo de la app (src/lib/mode.ts): Lite por defecto, Pro con todo. El modo solo muestra u oculta secciones;
 * los permisos siguen siendo los de cada liga.
 */

export interface ModeState {
  mode: UiMode;
  isPro: boolean;
  /**
   * Cambia el modo: se ve al momento en todas las pantallas, queda en el teléfono y se manda a la cuenta. Nunca falla
   * ni avisa errores: devuelve 'local' si la cuenta no lo pudo guardar (sin señal o base sin la columna).
   */
  setMode: (mode: UiMode) => Promise<SaveResult>;
  /** Organiza alguna liga (dueño o admin; o superadmin): se le sugiere Pro, sin cambiárselo. */
  suggestedPro: boolean;
}

/** El modo resuelto (teléfono + cuenta) y su puesta de acuerdo. Lo comparten useMode y useIsPro. */
function useResolvedMode(): { uid: string | null; mode: UiMode } {
  const { user, profile } = useAuth();
  const uid = user?.uid ?? null;
  const local = useSyncExternalStore(
    subscribeMode,
    () => localModeOf(uid),
    () => localModeOf(uid),
  );
  // Sin perfil leído no se sabe el de la cuenta (undefined), igual que con la base sin la columna.
  const server = profile ? profile.uiMode : undefined;
  useEffect(() => {
    if (uid) reconcileMode(uid, server);
  }, [uid, server, local]);
  return { uid, mode: resolveMode(local, server) };
}

/** Solo si está en Pro (lo usan <ProOnly> y <LiteOnly>; no lee las ligas). */
export function useIsPro(): boolean {
  return useResolvedMode().mode === 'pro';
}

/**
 * El modo de la app: `{ mode, isPro, setMode, suggestedPro }`. Lite por defecto; la elección se guarda por cuenta (en
 * el teléfono al momento y en la cuenta cuando se puede).
 */
export function useMode(): ModeState {
  const { uid, mode } = useResolvedMode();
  const { isSuper } = useAuth();
  const members = useMyMemberships(uid ?? undefined);
  const setMode = useCallback(async (next: UiMode): Promise<SaveResult> => (uid ? chooseMode(uid, next) : 'local'), [uid]);
  return { mode, isPro: mode === 'pro', setMode, suggestedPro: canSuggestPro(members.data, isSuper) };
}
