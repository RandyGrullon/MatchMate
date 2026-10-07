import { useMode } from '../../lib/useMode';
import type { Notice } from '../../lib/notices';
import { useNotice } from '../NoticeSlot';
import { announceMode } from './ModeToast';

/** id fijo: se sugiere Pro una sola vez (cerrado en una pantalla, no vuelve en ninguna). */
export const PRO_SUGGESTION_ID = 'sugerir-pro';

/** El aviso «Organizas esta liga · Probar Pro» (sin React, para probarlo). null = no toca sugerirlo. */
export function proSuggestion(
  state: { mode: string; suggestedPro: boolean },
  copy: { title?: string; text?: string } = {},
  onTry?: () => unknown,
): Notice | null {
  if (state.mode !== 'lite' || !state.suggestedPro) return null;
  return {
    id: PRO_SUGGESTION_ID,
    kind: 'pro',
    title: copy.title ?? 'Organizas una liga',
    text: copy.text ?? 'Aprueba juegos en Pro',
    action: { label: 'Probar Pro', onClick: onTry },
  };
}

/**
 * Propone (al NoticeSlot de la pantalla) sugerir Pro a quien organiza una liga y está en Lite: la Liga lo llama con
 * `{ title: 'Organizas esta liga' }`. «Probar Pro» cambia el modo (con «Modo Pro activado · Deshacer»); la X lo cierra
 * para siempre (en ese teléfono).
 * Es el de menos prioridad: si hay algo pendiente, instalar o permitir avisos, sale eso.
 */
export function useProSuggestion(copy: { title?: string; text?: string; enabled?: boolean } = {}): void {
  const { mode, suggestedPro, setMode } = useMode();
  // «Probar Pro» cambia al momento y lo dice abajo, con «Deshacer».
  useNotice(
    copy.enabled !== false &&
      proSuggestion({ mode, suggestedPro }, copy, () => {
        announceMode(mode, 'pro');
        return setMode('pro');
      }),
  );
}
