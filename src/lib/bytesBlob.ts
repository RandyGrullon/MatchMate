/**
 * Bytes → Blob para subir a Storage (dataUrlToBlob de image.ts). En la app del teléfono no se puede (React Native no
 * arma un Blob con bytes): usa bytesBlob.native.ts.
 */
export const bytesToBlob = (bytes: Uint8Array<ArrayBuffer>, type: string): Blob => new Blob([bytes], { type });
