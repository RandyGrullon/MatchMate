/**
 * La sugerencia «Organizas esta liga · Probar Pro», sin React (useProSuggestion.ts la propone al NoticeSlot de la web;
 * la app del teléfono, a su aviso de la pantalla).
 */
import type { Notice } from '../../lib/notices';

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
