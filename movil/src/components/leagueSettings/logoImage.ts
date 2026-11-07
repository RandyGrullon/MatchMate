/**
 * El logo de la liga elegido en el teléfono (de la galería o con la cámara) y dejado como el de la web
 * (src/lib/image.ts · compressLogo): el cuadrado del centro (`logoCrop`), de 256 × 256, hasta 120 kB bajando la calidad
 * y, si hace falta, el lado (`fitImage`, los mismos pasos). Sale en JPEG (como la web donde el navegador no sabe hacer
 * WebP), listo para `uploadLeagueLogo`.
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { BackendError } from '@mm/lib/backend/types';
import { dataUrlToBlob, fitImage, LOGO_SIDE, logoCrop, MAX_LOGO_BYTES, type CompressedLogo } from '@mm/lib/image';
import { pickPhotoAssets, type PhotoSource } from '@/lib/pickImage';

/** Los pasos de compressLogo de la web (calidad de arranque y mínima, y el lado más chico). */
const LOGO_FIT = { maxSide: LOGO_SIDE, quality: 0.85, minQuality: 0.5, max: MAX_LOGO_BYTES, floor: 128 };

/**
 * Abre la galería o la cámara y prepara el logo. null: canceló o no dio permiso. Si la imagen no se puede abrir, el
 * mismo error que la web (BackendError 'validation' con código 'imagen': «No se pudo abrir esa imagen…»).
 */
export async function pickLogo(source: PhotoSource): Promise<CompressedLogo | null> {
  const [asset] = await pickPhotoAssets(source);
  if (!asset) return null;
  try {
    // Las medidas de la imagen ya girada como se ve (la del selector puede venir sin girar).
    const probe = await ImageManipulator.manipulate(asset.uri).renderAsync();
    const { sx, sy, crop } = logoCrop(probe.width, probe.height);
    const encode = async (side: number, quality: number) => {
      const ctx = ImageManipulator.manipulate(asset.uri);
      ctx.crop({ originX: sx, originY: sy, width: crop, height: crop });
      ctx.resize({ width: side, height: side });
      const ref = await ctx.renderAsync();
      const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress: quality, base64: true });
      const b64 = out.base64 ?? '';
      const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
      return { data: `data:image/jpeg;base64,${b64}`, side, size: Math.floor((b64.length * 3) / 4) - padding };
    };
    const out = await fitImage(encode, LOGO_FIT);
    return { blob: dataUrlToBlob(out.data, 'image/jpeg'), contentType: 'image/jpeg', side: out.side };
  } catch (e) {
    console.warn('[logo]', e);
    throw new BackendError('No se pudo abrir esa imagen.', 'validation', 'imagen');
  }
}
