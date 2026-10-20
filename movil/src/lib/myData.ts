/**
 * «Descargar mis datos» en el teléfono: lo mismo que la web (src/pages/legal/account.ts · fetchMyData, myDataFileName),
 * guardado como .json en la caché de la app y abierto con la hoja de compartir del sistema (Archivos, correo, Drive…).
 */
import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { fetchMyData, myDataFileName, saveJsonFile } from '@mm/pages/legal/account';

/** Baja los datos y abre «compartir». Devuelve el nombre del archivo. */
export async function shareMyData(now: Date = new Date()): Promise<string> {
  const data = await fetchMyData();
  const name = myDataFileName(now);
  // En la vista previa web, como la web: se descarga.
  if (Platform.OS === 'web') {
    saveJsonFile(name, data);
    return name;
  }
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  await file.write(JSON.stringify(data, null, 2));
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Tus datos de MatchMate', UTI: 'public.json' });
  }
  return name;
}
