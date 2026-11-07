import { useAuth } from '@mm/lib/auth';
import type { Notice } from '@mm/lib/notices';
import { useMode } from '@mm/lib/useMode';
import { modeSheetSeen, openModeSheet } from '@mm/components/mode/modeSheet';
import { proSuggestion } from '@mm/components/mode/proSuggestion';
import { announceMode } from '@mm/components/mode/toast';

/**
 * La sugerencia «Organizas una liga · Aprueba juegos en Pro · Probar Pro» (useProSuggestion de la web) para el aviso de
 * la pantalla (ScreenNotice): a quien organiza una liga y está en Lite, una sola vez (cerrada en una pantalla no vuelve
 * en ninguna). «Probar Pro» abre la hoja «Elige cómo ver la app» con Pro «Para ti» si nunca la vio; si ya la vio,
 * cambia el modo (con «Modo Pro activado · Deshacer»). null en Pro o si no toca. Es el de menos prioridad: si hay algo
 * pendiente, sale eso.
 */
export function useProSuggestion(copy: { title?: string; text?: string; enabled?: boolean } = {}): Notice | null {
  const { mode, suggestedPro, setMode } = useMode();
  const { user } = useAuth();
  if (copy.enabled === false) return null;
  return proSuggestion({ mode, suggestedPro }, copy, () => {
    if (!modeSheetSeen(user?.uid)) return openModeSheet('pro', user?.uid);
    announceMode(mode, 'pro');
    return setMode('pro');
  });
}
