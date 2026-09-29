import { afterEach, describe, expect, it, vi } from 'vitest';
import { BackendError, type Backend } from '../backend/types';
import { REUPLOAD_AFTER_MS, stashPhoto, withPhotoUploads } from './uploads';

vi.mock('../photos', () => ({
  uploadScoreboardPhoto: vi.fn(async (lid: string, img: { width: number; height: number }, photoId: string) => ({
    photoId,
    path: `${lid}/${photoId}.webp`,
    width: img.width,
    height: img.height,
    bytes: 4,
    contentType: 'image/webp',
  })),
}));

const LID = '0190a4b2-0000-7000-8000-000000000001';
const IMG = { data: 'data:image/webp;base64,AAAA', width: 640, height: 480, scan: '' };

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('fotos de los envíos que esperan en la cola', () => {
  it('se sube una vez; si la RPC espera más de 7 días, se vuelve a subir antes de enviarla (el archivo pudo borrarse)', async () => {
    const { uploadScoreboardPhoto } = await import('../photos');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T12:00:00Z'));
    const photo = await stashPhoto('ana', LID, IMG);
    let down = true;
    const rpc = vi.fn(async (_fn: string, args?: Record<string, unknown>) => {
      if (down) throw new BackendError('Sin señal', 'network');
      return args?.p_photo;
    });
    const backend = withPhotoUploads(() => ({ rpc }) as unknown as Backend);
    const send = () => backend.rpc('submit_games', { p_op_id: 'op', p_photo: photo });

    await expect(send()).rejects.toMatchObject({ kind: 'network' });
    expect(uploadScoreboardPhoto).toHaveBeenCalledTimes(1);
    // Al día siguiente (y hasta 7 días) se reintenta con la foto ya subida.
    vi.setSystemTime(new Date('2026-10-08T11:00:00Z'));
    await expect(send()).rejects.toMatchObject({ kind: 'network' });
    expect(uploadScoreboardPhoto).toHaveBeenCalledTimes(1);
    // Más de 7 días después de subirla: se sube otra vez (misma foto, misma ruta) y cuenta desde ahí.
    vi.setSystemTime(new Date('2026-10-08T12:00:01Z'));
    await expect(send()).rejects.toMatchObject({ kind: 'network' });
    expect(uploadScoreboardPhoto).toHaveBeenCalledTimes(2);
    expect(vi.mocked(uploadScoreboardPhoto).mock.calls[1][2]).toBe(vi.mocked(uploadScoreboardPhoto).mock.calls[0][2]);
    vi.setSystemTime(new Date('2026-10-15T12:00:00Z'));
    down = false;
    const sent = (await send()) as { id: string };
    expect(uploadScoreboardPhoto).toHaveBeenCalledTimes(2);
    expect(sent).toMatchObject({ id: vi.mocked(uploadScoreboardPhoto).mock.calls[0][2], width: 640, height: 480 });
    expect(REUPLOAD_AFTER_MS).toBe(7 * 86400_000);
  });
});
