/**
 * Rutas de las páginas legales (privacidad y términos). Las versiones, los datos de contacto, lo que falta llenar y
 * la aceptación viven en src/lib/legal.ts (un solo lugar); aquí se vuelven a exportar para las páginas.
 * BORRADOR: el texto lo tiene que revisar un abogado de República Dominicana (el aviso solo lo ve el superadmin).
 */
export { LEGAL_CONTACT, LEGAL_DOCS, LEGAL_DRAFT, isPlaceholder, legalDate } from '../../lib/legal';

/** Rutas de las páginas (también las usan Login, Configuración, la pantalla de 18 años y el aviso de las fotos). */
export const PRIVACY_PATH = '/privacidad';
export const TERMS_PATH = '/terminos';
/** Rutas que se pueden leer aunque falte decir «tengo 18 años o más» o aceptar los términos nuevos. */
export const LEGAL_PATHS: readonly string[] = [PRIVACY_PATH, TERMS_PATH];
