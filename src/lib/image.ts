/**
 * Fotos del marcador, comprimidas en el teléfono antes de subirlas.
 *
 * - La copia que se GUARDA (Storage, bucket `scoreboards`): WebP de hasta ~110 kB (1 GB gratis = miles de fotos).
 *   Safari no sabe hacer WebP con canvas: ahí sale JPEG (`contentType` dice cuál).
 * - La copia para la IA (`scan`): JPEG más nítido, igual que en BowlingX (leyó 32 de 32 fotos de prueba).
 *   No se guarda: solo viaja a la Edge Function scan-bowling.
 */

/** Tope de la foto que se guarda, en bytes. */
export const MAX_STORED_BYTES = 110_000;
/** La copia para la IA va más nítida (tope en letras del data URL, como en BowlingX). */
const MAX_SCAN = 700_000;

export type StoredImageType = 'image/webp' | 'image/jpeg';

export interface CompressedImage {
  /** Foto que se guarda como comprobante, como data URL (para verla antes de subirla). */
  data: string;
  /** El mismo archivo, listo para subir. Si se perdió (p. ej. guardado como JSON), sale de `data` con imageBlob. */
  blob?: Blob;
  /** 'image/webp', o 'image/jpeg' si el navegador no sabe hacer WebP. Sin él, se mira el data URL. */
  contentType?: StoredImageType;
  bytes?: number;
  width: number;
  height: number;
  /** Copia más nítida (data URL JPEG) solo para leerla con la IA. */
  scan: string;
}

export interface FitOptions {
  /** Lado más largo al empezar (px). */
  maxSide: number;
  quality: number;
  /** Bajando calidad hasta esta; después se achica. */
  minQuality: number;
  /** Tope de `size`. */
  max: number;
  /** No se achica más que esto (se queda con lo que salga). */
  floor: number;
}

/** Reduce hasta que quepa en `max` bajando calidad y luego tamaño (el mismo paso a paso de BowlingX). */
export async function fitImage<T extends { size: number }>(encode: (maxSide: number, quality: number) => T | Promise<T>, o: FitOptions): Promise<T> {
  let { maxSide, quality } = o;
  for (;;) {
    const out = await encode(maxSide, quality);
    if (out.size <= o.max || maxSide <= o.floor) return out;
    if (quality > o.minQuality) quality -= 0.1;
    else maxSide = Math.round(maxSide * 0.8);
  }
}

function draw(bitmap: ImageBitmap, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
  return { canvas, width, height };
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/** El navegador sabe hacer WebP (se averigua con la primera foto; Safari devuelve PNG). */
let webpOk: boolean | null = null;

async function encodeStored(bitmap: ImageBitmap, maxSide: number, quality: number) {
  const { canvas, width, height } = draw(bitmap, maxSide);
  let blob: Blob | null = null;
  if (webpOk !== false) {
    blob = await toBlob(canvas, 'image/webp', quality);
    webpOk = blob?.type === 'image/webp';
    if (!webpOk) blob = null;
  }
  blob ??= await toBlob(canvas, 'image/jpeg', quality);
  if (!blob) throw new Error('No se pudo comprimir la foto.');
  return { blob, width, height, size: blob.size, contentType: (blob.type === 'image/webp' ? 'image/webp' : 'image/jpeg') as StoredImageType };
}

/** Reduce y recomprime la foto en el navegador (respeta la orientación de la cámara). */
export async function compressImage(file: Blob): Promise<CompressedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const scan = await fitImage(
      (side, q) => {
        const { canvas, width, height } = draw(bitmap, side);
        const data = canvas.toDataURL('image/jpeg', q);
        return { data, width, height, size: data.length };
      },
      { maxSide: 1600, quality: 0.75, minQuality: 0.55, max: MAX_SCAN, floor: 640 },
    );
    const stored = await fitImage((side, q) => encodeStored(bitmap, side, q), {
      maxSide: 1100,
      quality: 0.6,
      minQuality: 0.4,
      max: MAX_STORED_BYTES,
      floor: 480,
    });
    return {
      data: await blobToDataUrl(stored.blob),
      blob: stored.blob,
      contentType: stored.contentType,
      bytes: stored.blob.size,
      width: stored.width,
      height: stored.height,
      scan: scan.data,
    };
  } finally {
    bitmap.close();
  }
}

/** Tipo del archivo guardado: el que se sabe o el del data URL (las fotos viejas son JPEG). */
export function storedType(img: Pick<CompressedImage, 'contentType' | 'blob' | 'data'>): StoredImageType {
  if (img.contentType) return img.contentType;
  if (img.blob?.type === 'image/webp' || img.data.startsWith('data:image/webp')) return 'image/webp';
  return 'image/jpeg';
}

/** El archivo para subir: el blob, o el data URL convertido. */
export function imageBlob(img: Pick<CompressedImage, 'contentType' | 'blob' | 'data'>): Blob {
  if (img.blob instanceof Blob && img.blob.size > 0) return img.blob;
  return dataUrlToBlob(img.data, storedType(img));
}

export function dataUrlToBlob(dataUrl: string, type?: string): Blob {
  const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!m) throw new Error('No es un data URL.');
  const payload = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
  const bytes = new Uint8Array(payload.length);
  for (let i = 0; i < payload.length; i++) bytes[i] = payload.charCodeAt(i);
  return new Blob([bytes], { type: type ?? (m[1] || 'application/octet-stream') });
}

/** data URL de un archivo (sin FileReader: sirve igual en el navegador y en las pruebas). */
export async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  // Por pedazos, para no pasar el límite de argumentos de String.fromCharCode.
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`;
}

// ---------- Logo de la liga ----------

/** Lado del logo guardado (px): cuadrado. */
export const LOGO_SIDE = 256;
/** Tope del logo guardado, en bytes (el bucket `logos` acepta hasta 256 kB). */
export const MAX_LOGO_BYTES = 120_000;

export interface CompressedLogo {
  blob: Blob;
  /** 'image/webp', o 'image/jpeg' si el navegador no sabe hacer WebP. */
  contentType: StoredImageType;
  /** Lado del cuadrado (px). */
  side: number;
}

/**
 * El cuadrado del centro de la imagen (lo que se recorta para el logo): `sx`/`sy` desde dónde, `crop` el lado que
 * se toma y `side` el lado que sale (siempre `out`, aunque la imagen sea más chica).
 */
export function logoCrop(width: number, height: number, out = LOGO_SIDE): { sx: number; sy: number; crop: number; side: number } {
  const crop = Math.max(1, Math.min(width, height));
  return { sx: Math.max(0, Math.floor((width - crop) / 2)), sy: Math.max(0, Math.floor((height - crop) / 2)), crop, side: out };
}

/**
 * El logo listo para subir: el cuadrado del centro, de 256 × 256, en WebP (o JPEG si el navegador no sabe hacer
 * WebP), siempre sobre fondo blanco: un logo transparente (letras negras sobre nada) se vería en modo claro y
 * desaparecería en el oscuro, y así sale igual lo suba quien lo suba. Hasta 120 kB: baja la calidad y, si hace falta,
 * el lado.
 */
export async function compressLogo(file: Blob): Promise<CompressedLogo> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const { sx, sy, crop } = logoCrop(bitmap.width, bitmap.height);
    const encode = async (side: number, quality: number) => {
      const canvas = document.createElement('canvas');
      canvas.width = side;
      canvas.height = side;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingQuality = 'high';
      // Fondo blanco (es el lienzo del archivo, no un color de la pantalla): lo transparente queda blanco.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, side, side);
      ctx.drawImage(bitmap, sx, sy, crop, crop, 0, 0, side, side);
      let blob: Blob | null = null;
      if (webpOk !== false) {
        blob = await toBlob(canvas, 'image/webp', quality);
        webpOk = blob?.type === 'image/webp';
        if (!webpOk) blob = null;
      }
      if (!blob) blob = await toBlob(canvas, 'image/jpeg', quality);
      if (!blob) throw new Error('No se pudo preparar el logo.');
      return { blob, side, size: blob.size, contentType: (blob.type === 'image/webp' ? 'image/webp' : 'image/jpeg') as StoredImageType };
    };
    const out = await fitImage(encode, { maxSide: LOGO_SIDE, quality: 0.85, minQuality: 0.5, max: MAX_LOGO_BYTES, floor: 128 });
    return { blob: out.blob, contentType: out.contentType, side: out.side };
  } finally {
    bitmap.close();
  }
}
