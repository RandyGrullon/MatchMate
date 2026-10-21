/**
 * En la app del teléfono `new Blob([bytes])` no existe (React Native solo arma Blobs de texto o de otros Blobs): lo que
 * se sube es un objeto con lo que usa la lógica compartida (`size`, `type`, `arrayBuffer`) y el backend del teléfono
 * (movil/src/platform/backend.ts) manda a Storage sus bytes.
 */
export const bytesToBlob = (bytes: Uint8Array<ArrayBuffer>, type: string): Blob =>
  ({
    size: bytes.byteLength,
    type,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    bytes: async () => bytes,
    slice: () => {
      throw new Error('slice no está en el teléfono');
    },
    stream: () => {
      throw new Error('stream no está en el teléfono');
    },
    text: async () => {
      throw new Error('text no está en el teléfono');
    },
  }) as unknown as Blob;
