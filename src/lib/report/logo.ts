import { blobToDataUrl } from '../image';
import { logoUrl } from '../logos';
import type { ReportImage } from './pdf';

/**
 * El logo de la liga para el PDF: se baja del bucket público y, si no es JPEG (el WebP no lo lee jsPDF), se pasa a JPEG
 * en un canvas (los logos ya vienen sobre fondo blanco). Si algo falla (sin señal, tarda mucho), el reporte sale sin el
 * logo: null.
 */
export async function reportLogo(path: string | null | undefined, timeoutMs = 5000): Promise<ReportImage | null> {
  if (!path || typeof fetch !== 'function' || typeof createImageBitmap !== 'function') return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    });
    return await Promise.race([load(path), timeout]);
  } catch (e) {
    console.warn('[reporte] logo', e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function load(path: string): Promise<ReportImage | null> {
  const url = await logoUrl(path);
  if (!url) return null;
  const res = await fetch(url);
  if (!res.ok) return null;
  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob);
  try {
    const { width, height } = bitmap;
    if (blob.type === 'image/jpeg') return { data: await blobToDataUrl(blob), format: 'JPEG', width, height };
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0);
    return { data: canvas.toDataURL('image/jpeg', 0.92), format: 'JPEG', width, height };
  } finally {
    bitmap.close();
  }
}
