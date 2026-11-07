/**
 * «Elegir foto» del lector de QR (QrScanner.tsx en la web y movil/src/app/escanear.tsx en la app del teléfono): leer el
 * QR de una foto de la galería. Lo mismo en los dos lados: los textos, cuánto dura el aviso y qué se hace con lo leído
 * (el primer código con texto; si no hay, el aviso). Sin React ni navegador.
 */

/** El botón de abajo. */
export const PHOTO_BUTTON = 'Elegir foto';
/** La línea de abajo del marco mientras se lee la foto. */
export const PHOTO_READING = 'Leyendo la foto…';
/** La foto no trae un QR que se pueda leer. */
export const PHOTO_NO_QR = 'No encontramos un QR en esa foto. Prueba con otra más de cerca.';
/** La foto no se pudo abrir o leer. */
export const PHOTO_FAILED = 'No pudimos leer esa foto. Prueba con otra.';
/** Los avisos de abajo se van solos después de este rato. */
export const SCAN_NOTE_MS = 4000;

/** Lo leído en la foto (lo que trae cada código, en orden) → el texto del primero que tiene algo, o null. */
export function firstScanText(found: readonly { data?: string | null }[] | null | undefined): string | null {
  for (const f of found ?? []) {
    const text = f.data?.trim();
    if (text) return text;
  }
  return null;
}
