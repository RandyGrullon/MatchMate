/**
 * La foto de perfil en el teléfono, como la web (prepareAvatar → compressLogo de src/lib/image.ts): el cuadrado del
 * centro (`logoCrop`), de 256 × 256, hasta 120 kB con los mismos pasos de `fitImage` (baja la calidad y, si hace falta,
 * el lado). En JPEG (el teléfono no hace WebP), lista para `uploadAvatar`. La foto se elige o se toma con
 * `pickPhotoAssets` (movil/src/lib/pickImage.ts).
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { dataUrlToBlob, fitImage, LOGO_SIDE, logoCrop, MAX_LOGO_BYTES, type CompressedLogo, type FitOptions } from '@mm/lib/image';
import type { PickedAsset } from '@/lib/pickImage';

/** Los mismos pasos de compressLogo en la web. */
const AVATAR_FIT: FitOptions = { maxSide: LOGO_SIDE, quality: 0.85, minQuality: 0.5, max: MAX_LOGO_BYTES, floor: 128 };

/** La foto lista para subir y cómo se ve (data URL, para «Así se va a ver»). */
export interface AvatarPhoto extends CompressedLogo {
  preview: string;
}

export async function avatarPhoto(asset: PickedAsset): Promise<AvatarPhoto> {
  const { sx, sy, crop } = logoCrop(asset.width, asset.height);
  const out = await fitImage(async (side, quality) => {
    const ctx = ImageManipulator.manipulate(asset.uri);
    ctx.crop({ originX: sx, originY: sy, width: crop, height: crop });
    ctx.resize({ width: side, height: side });
    const ref = await ctx.renderAsync();
    const saved = await ref.saveAsync({ format: SaveFormat.JPEG, compress: quality, base64: true });
    const b64 = saved.base64 ?? '';
    const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
    return { data: `data:image/jpeg;base64,${b64}`, side, size: Math.floor((b64.length * 3) / 4) - padding };
  }, AVATAR_FIT);
  if (!out.size) throw new Error('No se pudo preparar la foto.');
  return { blob: dataUrlToBlob(out.data, 'image/jpeg'), contentType: 'image/jpeg', side: out.side, preview: out.data };
}
