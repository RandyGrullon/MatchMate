import { useAuth } from '../../lib/auth';
import { useMode } from '../../lib/useMode';
import { useNotice } from '../NoticeSlot';
import { modeSheetSeen, openModeSheet } from './modeSheet';
import { announceMode } from './ModeToast';
import { proSuggestion } from './proSuggestion';

// El aviso sin React (lo usa también la app del teléfono) está en proSuggestion.ts.
export { PRO_SUGGESTION_ID, proSuggestion } from './proSuggestion';

/**
 * Propone (al NoticeSlot de la pantalla) sugerir Pro a quien organiza una liga y está en Lite: la Liga lo llama con
 * `{ title: 'Organizas esta liga' }`. «Probar Pro» abre la hoja «Elige cómo ver la app» con Pro «Para ti» si nunca la
 * vio (se cambia desde ahí); si ya la vio, cambia el modo (con «Modo Pro activado · Deshacer»). La X lo cierra para
 * siempre (en ese teléfono).
 * Es el de menos prioridad: si hay algo pendiente, instalar o permitir avisos, sale eso.
 */
export function useProSuggestion(copy: { title?: string; text?: string; enabled?: boolean } = {}): void {
  const { mode, suggestedPro, setMode } = useMode();
  const { user } = useAuth();
  useNotice(
    copy.enabled !== false &&
      proSuggestion({ mode, suggestedPro }, copy, () => {
        if (!modeSheetSeen(user?.uid)) return openModeSheet('pro', user?.uid);
        announceMode(mode, 'pro');
        return setMode('pro');
      }),
  );
}
