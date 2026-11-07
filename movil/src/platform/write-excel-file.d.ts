// Las dos piezas de write-excel-file que usa reportFile.ts (no están en sus «exports»: Metro las encuentra por la ruta
// del archivo). Son las mismas que usa la librería por dentro para armar el .xlsx.
declare module 'write-excel-file/modules/xlsx/generateXlsxFileContents.js' {
  /** Los archivos de adentro del .xlsx (el XML de cada hoja, los estilos…); solo las imágenes vendrían como Blob. */
  export default function generateXlsxFileContents(sheets: readonly object[]): Record<string, string | Uint8Array | Blob>;
}

declare module 'write-excel-file/modules/zip/zipToArrayBufferSync.js' {
  /** El .zip (un .xlsx es un .zip) de una vez, sin Worker. */
  export default function zipToArrayBufferSync(files: Record<string, Uint8Array>): ArrayBuffer;
}
