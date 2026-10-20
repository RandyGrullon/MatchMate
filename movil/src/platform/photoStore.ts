/**
 * Las fotos de los envíos que esperan señal (src/lib/data/uploads.ts), en el teléfono: un archivo JSON por foto en
 * `<documentos de la app>/mm-uploads/<clave>.json` (la foto va como data URL; el Blob no se guarda y sale de ahí al
 * subirla). En la vista previa web no hay archivos: se usa IndexedDB, como la web.
 */
import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import type { PhotoStore, StashedPhoto } from '@mm/lib/data/uploads';

const folder = () => new Directory(Paths.document, 'mm-uploads');
// Las claves son uuidv7: igual se limpian para que nunca salgan de la carpeta.
const fileOf = (key: string) => new File(folder(), `${key.replace(/[^A-Za-z0-9-]/g, '_')}.json`);

async function read(file: File): Promise<StashedPhoto | undefined> {
  if (!file.exists) return undefined;
  try {
    const v = JSON.parse(await file.text()) as StashedPhoto;
    return v && typeof v.key === 'string' && v.img ? v : undefined;
  } catch {
    // A medio escribir (se cerró la app): no sirve.
    file.delete();
    return undefined;
  }
}

export function filePhotoStore(): PhotoStore | null {
  if (Platform.OS === 'web') return null;
  return {
    get: (key) => read(fileOf(key)),
    async put(v) {
      const dir = folder();
      if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
      const { blob: _blob, ...img } = v.img;
      const file = fileOf(v.key);
      if (!file.exists) file.create();
      await file.write(JSON.stringify({ ...v, img }));
    },
    async delete(key) {
      const file = fileOf(key);
      if (file.exists) file.delete();
    },
    async all() {
      const dir = folder();
      if (!dir.exists) return [];
      const out: StashedPhoto[] = [];
      for (const item of dir.list()) {
        if (!(item instanceof File) || !item.name.endsWith('.json')) continue;
        const v = await read(item);
        if (v) out.push(v);
      }
      return out;
    },
  };
}
