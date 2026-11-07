/**
 * El logo del equipo en el teléfono, como prepareLogo de la web (src/lib/image.ts · compressLogo): el cuadrado del
 * centro (`logoCrop`), de 256 px, hasta 120 kB con los mismos pasos (`fitImage`). La web lo guarda en WebP sobre
 * blanco; aquí sale en JPEG (sin transparencia), que el bucket `logos` también acepta. La foto se elige con
 * `pickPhotoAssets` (src/lib/pickImage.ts: el permiso y la galería o la cámara).
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { BackendError } from '@mm/lib/backend/types';
import { LOGO_SIDE, MAX_LOGO_BYTES, dataUrlToBlob, fitImage, logoCrop, type CompressedLogo } from '@mm/lib/image';
import { pickPhotoAssets, type PhotoSource } from '@/lib/pickImage';

/** El logo listo para `uploadSquadLogo` y su vista previa (data URL). */
export interface PickedLogo {
  logo: CompressedLogo;
  preview: string;
}

/** Abre la galería o la cámara y deja el logo listo. null: canceló o no dio permiso. Si no se abre: BackendError 'imagen'. */
export async function pickSquadLogo(source: PhotoSource): Promise<PickedLogo | null> {
  const [asset] = await pickPhotoAssets(source);
  if (!asset) return null;
  try {
    const { sx, sy, crop } = logoCrop(asset.width, asset.height);
    const out = await fitImage(
      async (side, quality) => {
        const ctx = ImageManipulator.manipulate(asset.uri);
        ctx.crop({ originX: sx, originY: sy, width: crop, height: crop });
        ctx.resize({ width: side, height: side });
        const ref = await ctx.renderAsync();
        const saved = await ref.saveAsync({ format: SaveFormat.JPEG, compress: quality, base64: true });
        const b64 = saved.base64 ?? '';
        const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
        return { data: `data:image/jpeg;base64,${b64}`, side, size: Math.floor((b64.length * 3) / 4) - padding };
      },
      { maxSide: LOGO_SIDE, quality: 0.85, minQuality: 0.5, max: MAX_LOGO_BYTES, floor: 128 },
    );
    return { logo: { blob: dataUrlToBlob(out.data, 'image/jpeg'), contentType: 'image/jpeg', side: out.side }, preview: out.data };
  } catch (e) {
    console.warn('[logo]', e);
    throw new BackendError('No se pudo abrir esa imagen.', 'validation', 'imagen');
  }
}
