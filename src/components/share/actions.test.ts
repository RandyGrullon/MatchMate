import { afterEach, describe, expect, it, vi } from 'vitest';
import { canShareFiles, copyText, downloadFile, shareFile, shareFileName } from './actions';

const png = () => new File([new Uint8Array([137, 80, 78, 71])], 'tabla.png', { type: 'image/png' });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('nombre del archivo', () => {
  it('sin tildes, símbolos ni espacios, con la fecha', () => {
    expect(shareFileName(['tabla', 'Liga de Pádel «Los Cocos»', 'Temporada 2026'], new Date(2026, 8, 7))).toBe('tabla-liga-de-padel-los-cocos-temporada-2026-2026-09-07.png');
  });

  it('corta los nombres largos y sin nada queda «matchmate»', () => {
    const long = shareFileName(['resultado', 'x'.repeat(200)], new Date(2026, 0, 1));
    expect(long).toBe(`resultado-${'x'.repeat(50)}-2026-01-01.png`);
    expect(shareFileName([null, undefined, '¡¿?!'], new Date(2026, 0, 1))).toBe('matchmate-2026-01-01.png');
  });
});

describe('compartir con el menú del teléfono', () => {
  it('sin Web Share (o sin archivos) no se puede', async () => {
    vi.stubGlobal('navigator', {});
    expect(canShareFiles(png())).toBe(false);
    expect(await shareFile(png(), 'Tabla')).toBe('unsupported');
    vi.stubGlobal('navigator', { share: vi.fn(), canShare: () => false });
    expect(canShareFiles(png())).toBe(false);
    vi.stubGlobal('navigator', {
      share: vi.fn(),
      canShare: () => {
        throw new Error('raro');
      },
    });
    expect(canShareFiles(png())).toBe(false);
  });

  it('manda la imagen con el texto (el link va dentro) y el título', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share, canShare: (d: ShareData) => !!d.files?.length });
    const file = png();
    expect(canShareFiles(file)).toBe(true);
    expect(await shareFile(file, 'Tabla\nhttps://m.do/l/a', 'Liga')).toBe('shared');
    expect(share).toHaveBeenCalledWith({ files: [file], text: 'Tabla\nhttps://m.do/l/a', title: 'Liga' });
    await shareFile(file, 'Tabla');
    expect(share).toHaveBeenLastCalledWith({ files: [file], text: 'Tabla' });
  });

  it('cancelar no es un error; lo demás, sí', async () => {
    const abort = Object.assign(new Error('cancelado'), { name: 'AbortError' });
    vi.stubGlobal('navigator', { share: vi.fn().mockRejectedValue(abort), canShare: () => true });
    expect(await shareFile(png(), 'x')).toBe('cancelled');
    vi.stubGlobal('navigator', { share: vi.fn().mockRejectedValue(new Error('NotAllowedError')), canShare: () => true });
    expect(await shareFile(png(), 'x')).toBe('failed');
  });
});

describe('copiar y descargar', () => {
  it('copia el link; sin portapapeles o si el navegador no deja, false', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    expect(await copyText('https://m.do')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('https://m.do');
    vi.stubGlobal('navigator', {});
    expect(await copyText('x')).toBe(false);
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('no')) } });
    expect(await copyText('x')).toBe(false);
  });

  it('descarga con un link escondido y suelta la memoria después', () => {
    vi.useFakeTimers();
    const a = { href: '', download: '', rel: '', style: { display: '' }, click: vi.fn(), remove: vi.fn() };
    const appendChild = vi.fn();
    vi.stubGlobal('document', { createElement: vi.fn(() => a), body: { appendChild } });
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    try {
      downloadFile(png(), 'tabla-2026-09-27.png');
      expect(a).toMatchObject({ href: 'blob:x', download: 'tabla-2026-09-27.png', style: { display: 'none' } });
      expect(appendChild).toHaveBeenCalledWith(a);
      expect(a.click).toHaveBeenCalledOnce();
      expect(a.remove).toHaveBeenCalledOnce();
      expect(revokeObjectURL).not.toHaveBeenCalled();
      vi.advanceTimersByTime(30_000);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:x');
    } finally {
      createObjectURL.mockRestore();
      revokeObjectURL.mockRestore();
    }
  });
});
