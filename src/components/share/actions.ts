/**
 * Compartir la imagen: con el menú del teléfono (Web Share con archivos: WhatsApp, Instagram…) cuando se puede;
 * si no, se descarga. Todo con cuidado de no romper sin navegador (pruebas, render en el servidor).
 */

export type ShareOutcome = 'shared' | 'cancelled' | 'unsupported' | 'failed';

/** El teléfono puede compartir este archivo con el menú del sistema. */
export function canShareFiles(file: File): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false;
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/**
 * Abre el menú del teléfono con la imagen y el texto (el link va dentro del texto: con archivos, varias apps
 * ignoran el campo `url`). Hay que llamarla directo desde el toque (sin esperas antes), o el navegador la frena.
 */
export async function shareFile(file: File, text: string, title?: string): Promise<ShareOutcome> {
  if (!canShareFiles(file)) return 'unsupported';
  try {
    await navigator.share({ files: [file], text, ...(title ? { title } : {}) });
    return 'shared';
  } catch (e) {
    return (e as { name?: unknown } | null)?.name === 'AbortError' ? 'cancelled' : 'failed';
  }
}

/** Descarga el archivo (en la computadora o en un teléfono sin menú para archivos). */
export function downloadFile(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Safari necesita el link vivo un momento después del clic.
  setTimeout(() => URL.revokeObjectURL(href), 30_000);
}

/** Copia al portapapeles. false si el navegador no deja. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Nombre del archivo: «tabla-liga-de-padel-2026-09-27.png» (sin tildes ni símbolos; `ext` para otro tipo: 'pdf', 'xlsx'). */
export function shareFileName(parts: readonly (string | null | undefined)[], date: Date = new Date(), ext = 'png'): string {
  const slug = parts
    .filter(Boolean)
    .join(' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return `${slug || 'matchmate'}-${day}.${ext}`;
}
