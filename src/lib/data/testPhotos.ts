import type { Backend } from '../backend/types';
import type { UploadedPhoto } from '../photos';

/**
 * Solo pruebas: subida de fotos como la hará photos.ts (el archivo a Storage en `<liga>/<id>.webp`). Va aparte de
 * testkit.ts porque el mock de '../photos' no puede importar la capa de datos (que importa '../photos').
 */
export async function fakeUpload(backend: () => Backend, lid: string, img: { width: number; height: number }, photoId: string = crypto.randomUUID()): Promise<UploadedPhoto> {
  const path = `${lid}/${photoId}.webp`;
  const bytes = new Uint8Array([1, 2, 3, 4]);
  await backend().storage.upload('scoreboards', path, new Blob([bytes], { type: 'image/webp' }), 'image/webp');
  return { photoId, path, width: img.width, height: img.height, bytes: bytes.length, contentType: 'image/webp' };
}
