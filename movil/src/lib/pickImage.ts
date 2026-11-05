/**
 * Elegir o tomar una foto en el teléfono y dejarla como la web (src/lib/image.ts · compressImage): la copia que se
 * guarda (hasta ~110 kB, lado de 1100 px) con los mismos pasos (`fitImage`), en JPEG, como data URL. La copia para la
 * IA (`scan`) solo si se pide (la foto del marcador); en una publicación no hace falta.
 *
 * Las fotos de un espacio de una empresa (compressShowcase de la web) son más grandes: `pickPhotoAssets` (varias de la
 * galería a la vez) y `showcasePhoto` (hasta 1600 px y 450 kB, lista para uploadVenuePhoto).
 */
import { Alert, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { dataUrlToBlob, fitImage, MAX_STORED_BYTES, SHOWCASE_FIT, type CompressedImage, type ShowcasePhoto } from '@mm/lib/image';

export type PhotoSource = 'library' | 'camera';

/** La copia para la IA (como MAX_SCAN de la web: tope en letras del data URL). */
const MAX_SCAN = 700_000;

async function allowed(source: PhotoSource): Promise<boolean> {
  const r = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (r.granted) return true;
  if (!r.canAskAgain) {
    Alert.alert(
      source === 'camera' ? 'Sin permiso para la cámara' : 'Sin permiso para tus fotos',
      'Actívalo en los ajustes del teléfono para agregar una foto.',
      [
        { text: 'Ahora no', style: 'cancel' },
        { text: 'Abrir ajustes', onPress: () => void Linking.openSettings() },
      ],
    );
  }
  return false;
}

/** La foto en JPEG con el lado más largo en `maxSide` (sin agrandarla) y su tamaño en bytes. */
async function encode(uri: string, width: number, height: number, maxSide: number, quality: number) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const ctx = ImageManipulator.manipulate(uri);
  if (scale < 1) ctx.resize(width >= height ? { width: Math.round(width * scale), height: null } : { width: null, height: Math.round(height * scale) });
  const ref = await ctx.renderAsync();
  const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress: quality, base64: true });
  const b64 = out.base64 ?? '';
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return { data: `data:image/jpeg;base64,${b64}`, width: out.width, height: out.height, size: Math.floor((b64.length * 3) / 4) - padding };
}

/** Una foto elegida (su archivo en el teléfono y su tamaño). */
export type PickedAsset = Pick<ImagePicker.ImagePickerAsset, 'uri' | 'width' | 'height'>;

/** Abre la galería (hasta `limit` fotos a la vez) o la cámara. Vacío: canceló o no dio permiso. */
export async function pickPhotoAssets(source: PhotoSource, limit = 1): Promise<PickedAsset[]> {
  if (!(await allowed(source))) return [];
  const many = source === 'library' && limit > 1;
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: 'images', quality: 1, exif: false, allowsMultipleSelection: many, selectionLimit: many ? limit : 1 };
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  return result.canceled ? [] : result.assets.slice(0, Math.max(1, limit));
}

/** Abre la galería o la cámara. null: canceló o no dio permiso. */
export async function pickPhoto(source: PhotoSource, opts: { scan?: boolean } = {}): Promise<CompressedImage | null> {
  const [asset] = await pickPhotoAssets(source);
  if (!asset) return null;
  const stored = await fitImage((side, q) => encode(asset.uri, asset.width, asset.height, side, q), {
    maxSide: 1100,
    quality: 0.6,
    minQuality: 0.4,
    max: MAX_STORED_BYTES,
    floor: 480,
  });
  const scan = opts.scan
    ? (
        await fitImage(
          async (side, q) => {
            const e = await encode(asset.uri, asset.width, asset.height, side, q);
            return { ...e, size: e.data.length };
          },
          { maxSide: 1600, quality: 0.75, minQuality: 0.55, max: MAX_SCAN, floor: 640 },
        )
      ).data
    : '';
  return { data: stored.data, contentType: 'image/jpeg', bytes: stored.size, width: stored.width, height: stored.height, scan };
}

/** La foto de un espacio como la de la web (SHOWCASE_FIT, en JPEG), con sus bytes listos para subir. */
export async function showcasePhoto(asset: PickedAsset): Promise<ShowcasePhoto> {
  const out = await fitImage((side, q) => encode(asset.uri, asset.width, asset.height, side, q), SHOWCASE_FIT);
  return { blob: dataUrlToBlob(out.data, 'image/jpeg'), contentType: 'image/jpeg', width: out.width, height: out.height };
}
