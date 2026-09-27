import { describe, expect, it } from 'vitest';
import { blobToDataUrl, dataUrlToBlob, fitImage, imageBlob, MAX_STORED_BYTES, storedType } from './image';

describe('comprimir la foto', () => {
  it('baja la calidad hasta el mínimo y después achica, como en BowlingX', async () => {
    const calls: [number, number][] = [];
    // Un "codificador" cuyo peso depende del lado y la calidad.
    const out = await fitImage(
      (side, q) => {
        calls.push([side, Math.round(q * 100) / 100]);
        return { size: Math.round(side * side * q * 0.5) };
      },
      { maxSide: 1100, quality: 0.6, minQuality: 0.4, max: MAX_STORED_BYTES, floor: 480 },
    );
    expect(calls).toEqual([
      [1100, 0.6],
      [1100, 0.5],
      [1100, 0.4],
      [880, 0.4],
      [704, 0.4],
    ]);
    expect(out.size).toBeLessThanOrEqual(MAX_STORED_BYTES);
  });

  it('no achica más que el piso aunque no quepa', async () => {
    const calls: number[] = [];
    const out = await fitImage(
      async (side) => {
        calls.push(side);
        return { size: 10_000_000, side };
      },
      { maxSide: 1000, quality: 0.5, minQuality: 0.5, max: 100, floor: 600 },
    );
    expect(calls).toEqual([1000, 800, 640, 512]);
    expect(out.side).toBe(512);
  });

  it('si ya cabe, un solo intento', async () => {
    let n = 0;
    await fitImage(() => ({ size: ++n }), { maxSide: 1600, quality: 0.75, minQuality: 0.55, max: 700_000, floor: 640 });
    expect(n).toBe(1);
  });
});

describe('el archivo para subir', () => {
  it('data URL ↔ Blob', async () => {
    const blob = dataUrlToBlob('data:image/webp;base64,AQID');
    expect(blob.type).toBe('image/webp');
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([1, 2, 3]);
    expect(await blobToDataUrl(blob)).toBe('data:image/webp;base64,AQID');
    expect(dataUrlToBlob('data:image/jpeg;base64,AQID', 'image/webp').type).toBe('image/webp');
    expect(() => dataUrlToBlob('https://x/y.jpg')).toThrow();
    // Grande (más de un pedazo de 32 kB).
    const big = new Blob([new Uint8Array(100_000).fill(200)], { type: 'image/jpeg' });
    const back = dataUrlToBlob(await blobToDataUrl(big));
    expect(back.size).toBe(100_000);
  });

  it('tipo guardado: el que se sabe, el del archivo o el del data URL (las viejas son JPEG)', () => {
    expect(storedType({ contentType: 'image/jpeg', data: 'data:image/webp;base64,' })).toBe('image/jpeg');
    expect(storedType({ blob: new Blob([], { type: 'image/webp' }), data: '' })).toBe('image/webp');
    expect(storedType({ data: 'data:image/webp;base64,AA==' })).toBe('image/webp');
    expect(storedType({ data: 'data:image/jpeg;base64,AA==' })).toBe('image/jpeg');
  });

  it('el blob, o el data URL convertido si se perdió (p. ej. guardado como JSON)', async () => {
    const blob = new Blob([new Uint8Array([9])], { type: 'image/webp' });
    expect(imageBlob({ blob, data: 'data:image/webp;base64,AQID' })).toBe(blob);
    const rebuilt = imageBlob({ blob: {} as Blob, contentType: 'image/webp', data: 'data:image/webp;base64,AQID' });
    expect(rebuilt.type).toBe('image/webp');
    expect(rebuilt.size).toBe(3);
  });
});
