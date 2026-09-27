import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendError, setBackendForTests } from './backend';
import { createLocalBackend, type LocalBackend } from './backend/local';
import { loadLocalSql } from './backend/migrations';
import { createFakeBackend } from './db/fakeBackend';
import { uuidv7 } from './db/ids';
import { fetchPhoto, forgetPhoto, loadPhoto, photoDeps, photoPath, uploadScoreboardPhoto, URL_FRESH_MS, type PhotoView } from './photos';

const WEBP = 'data:image/webp;base64,UklGRgwAAABXRUJQVlA4IAAAAAA=';
const webpImage = () => ({
  data: WEBP,
  blob: new Blob([Uint8Array.from(atob(WEBP.split(',')[1]), (c) => c.charCodeAt(0))], { type: 'image/webp' }),
  contentType: 'image/webp' as const,
  bytes: 20,
  width: 800,
  height: 600,
  scan: 'data:image/jpeg;base64,/9j/AA==',
});

describe('subir la foto', () => {
  afterEach(() => setBackendForTests(null));

  it('ruta <liga>/<foto>.webp (o .jpg), la que piden la política de Storage y photos.path', () => {
    const lid = uuidv7();
    const id = uuidv7();
    expect(photoPath(lid.toUpperCase(), id, 'image/webp')).toBe(`${lid}/${id}.webp`);
    expect(photoPath(lid, id, 'image/jpeg')).toBe(`${lid}/${id}.jpg`);
  });

  it('sube al bucket scoreboards con su tipo; un reintento puede usar el mismo id', async () => {
    const b = createFakeBackend();
    const upload = vi.fn(async () => {});
    b.storage.upload = upload;
    setBackendForTests(b);
    const lid = uuidv7();
    const img = webpImage();
    const up = await uploadScoreboardPhoto(lid, img);
    expect(up).toEqual({ photoId: up.photoId, path: `${lid}/${up.photoId}.webp`, width: 800, height: 600, bytes: img.blob.size, contentType: 'image/webp' });
    expect(upload).toHaveBeenCalledWith('scoreboards', up.path, img.blob, 'image/webp');
    const again = await uploadScoreboardPhoto(lid, img, up.photoId);
    expect(again.path).toBe(up.path);
    // Safari (sin WebP) y fotos sin el blob: JPEG desde el data URL.
    const jpg = await uploadScoreboardPhoto(lid, { data: 'data:image/jpeg;base64,/9j/4AAQ', width: 10, height: 10, scan: '' });
    expect(jpg).toMatchObject({ contentType: 'image/jpeg', bytes: 6 });
    expect(jpg.path).toMatch(/\.jpg$/);
    const sent = (upload.mock.calls as unknown as [string, string, Blob, string][])[2];
    expect(sent[2].type).toBe('image/jpeg');
  });

  it('liga o id que no sirven, o foto de más de 1 MB: no sube', async () => {
    const b = createFakeBackend();
    const upload = vi.fn(async () => {});
    b.storage.upload = upload;
    setBackendForTests(b);
    await expect(uploadScoreboardPhoto('liga-1', webpImage())).rejects.toMatchObject({ kind: 'validation' });
    await expect(uploadScoreboardPhoto(uuidv7(), webpImage(), 'foto')).rejects.toMatchObject({ kind: 'validation' });
    const big = { ...webpImage(), blob: new Blob([new Uint8Array(1_048_577)], { type: 'image/webp' }) };
    await expect(uploadScoreboardPhoto(uuidv7(), big)).rejects.toBeInstanceOf(BackendError);
    expect(upload).not.toHaveBeenCalled();
  });

  it('sin señal falla con el error de red (quien llama decide si la encola)', async () => {
    const b = createFakeBackend();
    b.storage.upload = async () => {
      throw new BackendError('Sin conexión', 'network');
    };
    setBackendForTests(b);
    await expect(uploadScoreboardPhoto(uuidv7(), webpImage())).rejects.toMatchObject({ kind: 'network', retryable: true });
  });
});

describe('con el backend local (las migraciones de verdad)', () => {
  let b: LocalBackend;
  beforeAll(async () => {
    b = await createLocalBackend({ sql: loadLocalSql() });
    setBackendForTests(b);
  }, 120_000);
  afterAll(async () => {
    setBackendForTests(null);
    await b.close();
  });

  it('se sube, se registra con add_photo y se ve con la URL firmada; nadie de fuera la ve', async () => {
    await b.auth.signUp('dueno@example.com', 'secreto1', 'Dueño');
    const { league_id: lid } = await b.rpc<{ league_id: string }>('create_league', { p_name: 'Liga de fotos' });
    const up = await uploadScoreboardPhoto(lid, webpImage());
    const reg = await b.rpc('add_photo', {
      p_league: lid,
      p_id: up.photoId,
      p_width: up.width,
      p_height: up.height,
      p_bytes: up.bytes,
      p_content_type: up.contentType,
    });
    // La base arma la misma ruta (CHECK de photos.path).
    expect(reg).toEqual({ id: up.photoId, path: up.path });
    expect(await fetchPhoto(lid, up.photoId)).toEqual({ id: up.photoId, url: WEBP, width: 800, height: 600 });
    expect(await fetchPhoto(uuidv7(), up.photoId)).toBeNull();
    expect(await fetchPhoto(lid, uuidv7())).toBeNull();

    // Registrada pero el archivo ya no está: como si no hubiera foto.
    const gone = await uploadScoreboardPhoto(lid, webpImage());
    await b.rpc('add_photo', { p_league: lid, p_id: gone.photoId, p_content_type: gone.contentType });
    await b.storage.remove('scoreboards', [gone.path]);
    expect(await fetchPhoto(lid, gone.photoId)).toBeNull();

    // Otra cuenta, sin entrar a la liga privada.
    await b.auth.signUp('otro@example.com', 'secreto1', 'Otro');
    expect(await fetchPhoto(lid, up.photoId)).toBeNull();
  }, 60_000);
});

/** localStorage en memoria (Node no tiene). */
function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    get length() {
      return m.size;
    },
    key: (i: number) => [...m.keys()][i] ?? null,
  };
}

describe('caché de URLs firmadas', () => {
  const original = { ...photoDeps };
  const L = uuidv7();
  const P = uuidv7();
  let now = 0;
  let fetchMock = vi.fn<(lid: string, id: string) => Promise<PhotoView | null>>();
  const view = (n: number): PhotoView => ({ id: P, url: `https://x.supabase.co/storage/v1/object/sign/scoreboards/${L}/${P}.webp?token=${n}`, width: 8, height: 6 });

  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
    forgetPhoto();
    now = 1_000_000;
    fetchMock = vi.fn();
    photoDeps.now = () => now;
    photoDeps.fetch = fetchMock;
  });
  afterEach(() => {
    Object.assign(photoDeps, original);
    vi.unstubAllGlobals();
  });

  it('reutiliza la URL 50 min y después pide otra', async () => {
    fetchMock.mockResolvedValueOnce(view(1)).mockResolvedValueOnce(view(2));
    expect(await loadPhoto(L, P)).toEqual({ data: view(1), loading: false, error: null });
    now += URL_FRESH_MS - 60_000;
    expect((await loadPhoto(L, P)).data).toEqual(view(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    now += 2 * 60_000;
    expect((await loadPhoto(L, P)).data).toEqual(view(2));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('dos pantallas a la vez comparten la misma consulta', async () => {
    fetchMock.mockResolvedValue(view(1));
    const [a, b] = await Promise.all([loadPhoto(L, P), loadPhoto(L.toUpperCase(), P)]);
    expect(a).toBe(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('foto que no existe: null (no se vuelve a pedir enseguida); ids que no son fotos: nada', async () => {
    fetchMock.mockResolvedValue(null);
    expect(await loadPhoto(L, P)).toEqual({ data: null, loading: false, error: null });
    await loadPhoto(L, P);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await loadPhoto(L, 'sin-foto')).toEqual({ data: null, loading: false, error: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sin señal: se queda con la URL que tenía; sin URL, el error (y se reintenta a los 10 s)', async () => {
    fetchMock.mockResolvedValueOnce(view(1)).mockRejectedValue(new BackendError('Sin conexión', 'network'));
    await loadPhoto(L, P);
    now += URL_FRESH_MS + 1;
    expect(await loadPhoto(L, P)).toEqual({ data: view(1), loading: false, error: null });

    const Q = uuidv7();
    const failed = await loadPhoto(L, Q);
    expect(failed.data).toBeNull();
    expect(failed.error?.message).toBe('Sin conexión');
    const calls = fetchMock.mock.calls.length;
    await loadPhoto(L, Q);
    expect(fetchMock).toHaveBeenCalledTimes(calls);
    now += 11_000;
    await loadPhoto(L, Q);
    expect(fetchMock).toHaveBeenCalledTimes(calls + 1);
  });

  it('la última URL queda en el teléfono: se usa si está fresca, o si no hay señal', async () => {
    fetchMock.mockResolvedValueOnce(view(1));
    await loadPhoto(L, P);
    const saved = localStorage.getItem('mm:photo-urls');
    expect(saved).toContain(`token=1`);

    // La app se cierra y se abre (memoria vacía, lo del teléfono sigue).
    const reopen = () => {
      forgetPhoto();
      localStorage.setItem('mm:photo-urls', saved!);
    };
    reopen();
    expect((await loadPhoto(L, P)).data).toEqual(view(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Vieja y sin señal: la vieja (el service worker la guarda por la ruta sin el token).
    reopen();
    now += URL_FRESH_MS + 1;
    fetchMock.mockRejectedValueOnce(new BackendError('Sin conexión', 'network'));
    expect(await loadPhoto(L, P)).toEqual({ data: view(1), loading: false, error: null });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // forgetPhoto() (cambio de cuenta) borra también lo del teléfono.
    forgetPhoto();
    expect(localStorage.getItem('mm:photo-urls')).toBeNull();
  });
});
