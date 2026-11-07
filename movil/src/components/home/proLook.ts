import { useIsPro } from '@mm/lib/useMode';

/**
 * Lo de Pro que es solo cómo se ve (la web: `text-title-pro`, `size={pro ? 'lg' : 'xl'}`): en Pro, la misma pantalla un
 * poco más densa. Lite queda como siempre.
 */

/** text-title-pro de la web (1.75rem, 2.125rem): el título de la pantalla en Pro, un poco más chico que en Lite. */
export const TITLE_PRO = { fontSize: 28, lineHeight: 34, letterSpacing: -0.84 } as const;

/** El estilo del título de la pantalla según el modo (undefined en Lite: el de siempre). */
export function useTitleStyle(): typeof TITLE_PRO | undefined {
  return useIsPro() ? TITLE_PRO : undefined;
}

/** El botón grande de la pantalla: 56 en Lite (`xl`) y 48 en Pro (`lg`), como la web. */
export function useBigButton(): 'lg' | 'xl' {
  return useIsPro() ? 'lg' : 'xl';
}
