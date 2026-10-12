/**
 * Leer QR en el navegador: el lector del sistema (BarcodeDetector: Android, Chrome en Mac) y, donde no está (iPhone,
 * Windows), jsQR en un worker (jsqr.worker.ts, su propio archivo, que se baja al abrir el lector) para que el marco no
 * se trabe mientras lee. Los cuadros del video se leen a 640 px como mucho; las fotos, a 1600 px (y a 800 si no sale).
 * Las esquinas vienen en px del cuadro leído (`width`×`height`).
 */
import type { Pt } from './logic';
import { decodePixels, unwrapJsQr, type Hit, type JsQrFn, type PixelsRequest, type PixelsResponse } from './pixels';

export { decodePixels, unwrapJsQr, type Hit };

export interface QrDecoder {
  kind: 'native' | 'jsqr';
  /** Un cuadro del video en vivo. */
  scanVideo(video: HTMLVideoElement): Promise<Hit | null>;
  /** Una foto elegida. */
  scanImage(src: CanvasImageSource & ImageBitmapSource, width: number, height: number): Promise<Hit | null>;
  /** Soltar el worker (al cerrar el lector). */
  close(): void;
}

/** El lado más largo del cuadro del video que se lee (más chico = más rápido en teléfonos lentos). */
export const LIVE_MAX_SIDE = 640;

// ---------- jsQR ----------

let jsQrLoad: Promise<JsQrFn> | null = null;
/** jsQR en el hilo de la pantalla (solo si el worker no anda): su propio archivo, se baja la primera vez. */
export function loadJsQr(): Promise<JsQrFn> {
  jsQrLoad ??= import('jsqr').then(unwrapJsQr).catch((e: unknown) => {
    jsQrLoad = null;
    throw e;
  });
  return jsQrLoad;
}

type PixelsRun = (data: Uint8ClampedArray, width: number, height: number, invert: boolean) => Promise<Hit | null>;

/** jsQR en un worker; null si no se puede crear. Si el worker falla, lo que estaba esperando falla también. */
function startWorker(): { run: PixelsRun; stop: () => void } | null {
  if (typeof Worker === 'undefined') return null;
  let worker: Worker;
  try {
    worker = new Worker(new URL('./jsqr.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
  let next = 1;
  let dead: unknown = null;
  const waiting = new Map<number, { resolve: (h: Hit | null) => void; reject: (e: unknown) => void }>();
  worker.onmessage = (e: MessageEvent<PixelsResponse>) => {
    const w = waiting.get(e.data.id);
    if (!w) return;
    waiting.delete(e.data.id);
    w.resolve(e.data.hit);
  };
  worker.onerror = (e) => {
    dead = e;
    waiting.forEach((w) => w.reject(e));
    waiting.clear();
  };
  return {
    run: (data, width, height, invert) => {
      if (dead) return Promise.reject(dead);
      const id = next++;
      return new Promise((resolve, reject) => {
        waiting.set(id, { resolve, reject });
        const msg: PixelsRequest = { id, data, width, height, invert };
        worker.postMessage(msg, [data.buffer]);
      });
    },
    stop: () => {
      worker.terminate();
      waiting.forEach((w) => w.resolve(null));
      waiting.clear();
    },
  };
}

/** Lee píxeles con jsQR: en el worker y, si no anda, en el hilo de la pantalla. */
function jsQrPixels(): { run: PixelsRun; stop: () => void } {
  let worker = startWorker();
  let main: JsQrFn | null = null;
  return {
    async run(data, width, height, invert) {
      if (worker) {
        try {
          return await worker.run(data, width, height, invert);
        } catch {
          // el worker no carga (sin conexión y sin guardar): este cuadro se pierde, los que siguen van sin worker
          worker.stop();
          worker = null;
          return null;
        }
      }
      main ??= await loadJsQr();
      return decodePixels(main, data, width, height, invert);
    },
    stop: () => worker?.stop(),
  };
}

/** Dibuja la imagen reducida (lado más largo ≤ `maxSide`) y devuelve sus píxeles. */
function grabber() {
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  return (src: CanvasImageSource, w: number, h: number, maxSide: number): { data: Uint8ClampedArray; width: number; height: number } | null => {
    if (!w || !h) return null;
    const s = Math.min(1, maxSide / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * s));
    const ch = Math.max(1, Math.round(h * s));
    canvas ??= document.createElement('canvas');
    ctx ??= canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    if (canvas.width !== cw) canvas.width = cw;
    if (canvas.height !== ch) canvas.height = ch;
    ctx.drawImage(src, 0, 0, cw, ch);
    return { data: ctx.getImageData(0, 0, cw, ch).data, width: cw, height: ch };
  };
}

// ---------- BarcodeDetector ----------

interface DetectedBarcode {
  rawValue: string;
  cornerPoints: readonly Pt[];
  boundingBox: { width: number; height: number };
}
interface BarcodeDetectorLike {
  detect(src: ImageBitmapSource): Promise<DetectedBarcode[]>;
}
interface BarcodeDetectorCtor {
  new (opts: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

/** El lector del sistema si sabe leer QR; null si no está (o falla al crearlo). */
async function nativeDetector(): Promise<BarcodeDetectorLike | null> {
  const BD = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  if (typeof BD !== 'function') return null;
  try {
    const formats = await BD.getSupportedFormats?.();
    if (formats && !formats.includes('qr_code')) return null;
    return new BD({ formats: ['qr_code'] });
  } catch {
    return null;
  }
}

/** El más grande de los QR encontrados (el que se está apuntando). */
function pickNative(found: readonly DetectedBarcode[], width: number, height: number): Hit | null {
  let best: DetectedBarcode | null = null;
  for (const b of found) {
    if (!b.rawValue) continue;
    if (!best || b.boundingBox.width * b.boundingBox.height > best.boundingBox.width * best.boundingBox.height) best = b;
  }
  if (!best) return null;
  return { text: best.rawValue, corners: best.cornerPoints.map((p) => ({ x: p.x, y: p.y })), width, height };
}

/** El lector: el del sistema si hay; si no (o si deja de andar), jsQR. */
export async function createDecoder(): Promise<QrDecoder> {
  const native = await nativeDetector();
  let broken = !native;
  /** Errores seguidos del lector del sistema: con 3 se deja (un cuadro raro suelto no cuenta). */
  let fails = 0;
  let pixels: ReturnType<typeof jsQrPixels> | null = null;
  const grab = grabber();
  const js = async (src: CanvasImageSource, w: number, h: number, maxSide: number, invert: boolean) => {
    const img = grab(src, w, h, maxSide);
    if (!img) return null;
    pixels ??= jsQrPixels();
    return pixels.run(img.data, img.width, img.height, invert);
  };
  // Sin lector del sistema (iPhone): el worker se baja ya, mientras la cámara arranca.
  if (broken) pixels = jsQrPixels();
  return {
    get kind() {
      return broken ? 'jsqr' : 'native';
    },
    async scanVideo(video) {
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (native && !broken) {
        try {
          const hit = pickNative(await native.detect(video), w, h);
          fails = 0;
          return hit;
        } catch {
          if (++fails < 3) return null;
          broken = true;
        }
      }
      return js(video, w, h, LIVE_MAX_SIDE, false);
    },
    async scanImage(src, w, h) {
      if (native && !broken) {
        try {
          const hit = pickNative(await native.detect(src), w, h);
          if (hit) return hit;
        } catch {
          // probamos con jsQR
        }
      }
      return (await js(src, w, h, 1600, true)) ?? (await js(src, w, h, 800, true));
    },
    close() {
      pixels?.stop();
      pixels = null;
    },
  };
}

/** La foto elegida, lista para leer (y cómo soltarla después). */
export async function loadImageFile(file: Blob): Promise<{ src: ImageBitmap | HTMLImageElement; width: number; height: number; release: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file);
      return { src: bmp, width: bmp.width, height: bmp.height, release: () => bmp.close() };
    } catch {
      // formato que createImageBitmap no abre: con <img>
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { src: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

interface FrameVideo {
  requestVideoFrameCallback(cb: (now: number) => void): number;
  cancelVideoFrameCallback(id: number): void;
}

/** Llama a `cb` con cada cuadro nuevo del video (requestVideoFrameCallback; si no hay, en cada repintado). */
export function everyVideoFrame(video: HTMLVideoElement, cb: (now: number) => void): () => void {
  let id = 0;
  let stopped = false;
  if ('requestVideoFrameCallback' in video) {
    const v = video as HTMLVideoElement & FrameVideo;
    const tick = (now: number) => {
      if (stopped) return;
      cb(now);
      id = v.requestVideoFrameCallback(tick);
    };
    id = v.requestVideoFrameCallback(tick);
    return () => {
      stopped = true;
      v.cancelVideoFrameCallback(id);
    };
  }
  const tick = (now: number) => {
    if (stopped) return;
    cb(now);
    id = requestAnimationFrame(tick);
  };
  id = requestAnimationFrame(tick);
  return () => {
    stopped = true;
    cancelAnimationFrame(id);
  };
}
