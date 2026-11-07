/**
 * Los archivos que la app hace para compartir (el reporte del torneo y el respaldo de la liga), con la misma lógica de
 * la web (src/lib/report/file.ts · reportBytes, src/lib/backup.ts):
 * - el Excel: las hojas de siempre (`reportSheets`) escritas con las mismas piezas de write-excel-file, pero sin Blob
 *   (su versión de navegador termina en `new Blob([bytes])`, que React Native no tiene, y comprime las hojas grandes
 *   en un Worker): el zip sale de una vez;
 * - el logo de la liga para el PDF: bajado y pasado a JPEG con expo-image-manipulator (la web usa un canvas);
 * - guardar el archivo en la caché de la app y abrir la hoja de compartir del teléfono (WhatsApp, Archivos, correo…).
 * En la vista previa web de la app se descarga, como en la web.
 */
import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as Sharing from 'expo-sharing';
import generateXlsxFileContents from 'write-excel-file/modules/xlsx/generateXlsxFileContents.js';
import zipToArrayBufferSync from 'write-excel-file/modules/zip/zipToArrayBufferSync.js';
import { downloadFile } from '@mm/components/share/actions';
import { leagueBackup } from '@mm/lib/backup';
import { logoUrl } from '@mm/lib/logos';
import type { ReportBytes } from '@mm/lib/report/bytes';
import { reportLogo } from '@mm/lib/report/logo';
import type { ReportImage } from '@mm/lib/report/pdf';
import type { ExcelSheet } from '@mm/lib/report/sheets';

/** Las hojas en un .xlsx: los mismos archivos de adentro que arma write-excel-file, comprimidos de una vez. */
export function xlsxBytes(sheets: readonly ExcelSheet[]): Uint8Array {
  const files = generateXlsxFileContents(sheets.map((s) => ({ ...s })));
  const encoder = new TextEncoder();
  const parts: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(files)) {
    if (typeof content === 'string') parts[name] = encoder.encode(content);
    else if (content instanceof Uint8Array) parts[name] = content;
    // Solo las imágenes vendrían como Blob, y los reportes no llevan.
    else throw new Error(`[xlsx] ${name} no es texto`);
  }
  return new Uint8Array(zipToArrayBufferSync(parts));
}

/** El logo de la liga en JPEG para el PDF; si algo falla o tarda más de 5 s, el reporte sale sin él (como la web). */
export async function phoneLogo(path: string | null, timeoutMs = 5000): Promise<ReportImage | null> {
  // En la vista previa web, el de la web (con su canvas).
  if (Platform.OS === 'web') return reportLogo(path, timeoutMs);
  if (!path) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    });
    return await Promise.race([loadLogo(path), timeout]);
  } catch (e) {
    console.warn('[reporte] logo', e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function loadLogo(path: string): Promise<ReportImage | null> {
  const url = await logoUrl(path);
  if (!url) return null;
  const dir = new Directory(Paths.cache, 'mm-reporte');
  if (!dir.exists) dir.create({ idempotent: true });
  const local = await File.downloadFileAsync(url, dir, { idempotent: true });
  try {
    const ref = await ImageManipulator.manipulate(local.uri).renderAsync();
    const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.92, base64: true });
    return out.base64 ? { data: `data:image/jpeg;base64,${out.base64}`, format: 'JPEG', width: out.width, height: out.height } : null;
  } finally {
    if (local.exists) local.delete();
  }
}

/** El teléfono tiene la hoja de compartir para archivos (en la vista previa web, no: se descarga). */
export async function canShareFiles(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  return Sharing.isAvailableAsync().catch(() => false);
}

/** Lo que dice iOS de cada tipo (para que la hoja de compartir ofrezca las apps que lo abren). */
const UTI: Record<string, string> = {
  'application/pdf': 'com.adobe.pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'org.openxmlformats.spreadsheetml.sheet',
  'application/json': 'public.json',
};

/** Guarda el archivo en la caché de la app (si ya estaba, lo cambia). Devuelve dónde quedó. */
export async function saveToCache(file: ReportBytes): Promise<string> {
  const out = new File(Paths.cache, file.name);
  if (out.exists) out.delete();
  out.create();
  await out.write(file.bytes);
  return out.uri;
}

/** Abre la hoja de compartir del teléfono con el archivo ya guardado. */
export async function shareSaved(uri: string, type: string, dialogTitle: string): Promise<void> {
  await Sharing.shareAsync(uri, { mimeType: type, dialogTitle, ...(UTI[type] ? { UTI: UTI[type] } : {}) });
}

/** En la vista previa web (o sin hoja de compartir): se descarga, como en la web. */
export function downloadBytes(file: ReportBytes) {
  downloadFile(new Blob([file.bytes as Uint8Array<ArrayBuffer>], { type: file.type }), file.name);
}

/**
 * «Descargar» el respaldo de la liga en el teléfono: el mismo JSON de la web (src/lib/backup.ts · leagueBackup), guardado
 * en la caché de la app y abierto con la hoja de compartir (Archivos, correo, Drive…). Devuelve cuánto lleva.
 */
export async function shareLeagueBackup(league: { id: string; name: string }): Promise<{ players: number; events: number; entries: number }> {
  const { file, counts } = await leagueBackup(league);
  const type = 'application/json';
  const uri = await saveToCache({ name: file.name, type, bytes: new TextEncoder().encode(file.text) });
  await shareSaved(uri, type, `${league.name} · MatchMate`);
  return counts;
}
