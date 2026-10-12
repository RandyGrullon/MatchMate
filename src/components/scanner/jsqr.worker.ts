/**
 * jsQR fuera del hilo de la pantalla: leer un cuadro tarda 15-60 ms en un teléfono y, en el hilo principal, el marco
 * que persigue al QR se trabaría a cada lectura. Recibe los píxeles (transferidos, sin copiar) y devuelve lo leído.
 */
import jsqr from 'jsqr';
import { decodePixels, unwrapJsQr, type PixelsRequest, type PixelsResponse } from './pixels';

const jsQR = unwrapJsQr({ default: jsqr });

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<PixelsRequest>) => void) | null;
  postMessage(msg: PixelsResponse): void;
};

scope.onmessage = (e) => {
  const { id, data, width, height, invert } = e.data;
  let hit: PixelsResponse['hit'] = null;
  try {
    hit = decodePixels(jsQR, data, width, height, invert);
  } catch {
    hit = null;
  }
  scope.postMessage({ id, hit });
};
