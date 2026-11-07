/**
 * Los Términos de uso y la Política de privacidad son pantallas de la app (movil/src/app/terminos.tsx y privacidad.tsx),
 * con el mismo texto de la web (src/pages/legal/texts.ts). El ancla de la web (`/privacidad#fotos`) es `?seccion=fotos`.
 */
import { router } from 'expo-router';
import type { LegalDocKey } from '@mm/lib/legal';
import { PRIVACY_PATH, TERMS_PATH } from '@mm/pages/legal/legal';

/** La ruta de la app de un texto legal, con la sección que se abre (sin `#`). */
export function legalHref(doc: LegalDocKey, section?: string | null) {
  const seccion = section?.replace(/^#/, '') || undefined;
  return { pathname: doc === 'privacidad' ? PRIVACY_PATH : TERMS_PATH, params: seccion ? { seccion } : {} };
}

/** De un link de la web (`/terminos`, `/privacidad#fotos`) al texto legal y su sección; si no es uno de esos, null. */
export function legalTarget(path: string): { doc: LegalDocKey; section: string | null } | null {
  const m = /^(\/[^?#]*)(?:\?[^#]*)?(?:#(.*))?$/.exec(path);
  const base = m?.[1]?.replace(/\/+$/, '');
  const doc: LegalDocKey | null = base === PRIVACY_PATH ? 'privacidad' : base === TERMS_PATH ? 'terminos' : null;
  return doc ? { doc, section: m?.[2] ? decodeURIComponent(m[2]) : null } : null;
}

/** Abre los Términos o la Privacidad (con su sección) en la app. */
export function openLegal(doc: LegalDocKey, section?: string | null) {
  // La ruta es nueva: los tipos de las rutas se arman al arrancar la vista previa.
  router.push(legalHref(doc, section) as never);
}
