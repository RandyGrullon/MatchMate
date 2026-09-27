/** Tope de la foto que se guarda (Firestore gratis: 1 GiB; ~100 kB por foto = miles de fotos). */
const MAX_STORED = 110_000;
/** La copia para la IA va más nítida (no se guarda). */
const MAX_SCAN = 700_000;

export interface CompressedImage {
  /** Foto que se guarda como comprobante. */
  data: string;
  width: number;
  height: number;
  /** Copia más nítida solo para leerla con la IA. */
  scan: string;
}

function encode(bitmap: ImageBitmap, maxSide: number, quality: number) {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
  return { data: canvas.toDataURL('image/jpeg', quality), width, height };
}

/** Reduce hasta que quepa en `max` bajando calidad y luego tamaño. */
function fit(bitmap: ImageBitmap, maxSide: number, quality: number, minQuality: number, max: number, floor: number) {
  for (;;) {
    const out = encode(bitmap, maxSide, quality);
    if (out.data.length <= max || maxSide <= floor) return out;
    if (quality > minQuality) quality -= 0.1;
    else maxSide = Math.round(maxSide * 0.8);
  }
}

/** Reduce y recomprime la foto en el navegador (respeta la orientación de la cámara). */
export async function compressImage(file: Blob): Promise<CompressedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const scan = fit(bitmap, 1600, 0.75, 0.55, MAX_SCAN, 640);
    const stored = fit(bitmap, 1100, 0.6, 0.4, MAX_STORED, 480);
    return { ...stored, scan: scan.data };
  } finally {
    bitmap.close();
  }
}
