import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rowFor, ScanError, type ScanRow } from './scan-result';
import { cancelScan, scanDeps, scanDone, scanState, startScan } from './scanJobs';

const row = (name: string, games: (number | null)[]): ScanRow => ({ name, handicap: null, games, total: null, matchesTotal: null });
const original = { ...scanDeps };

describe('lectura de la foto en segundo plano', () => {
  let online: boolean;
  let reconnect: () => void;
  const sleeps: number[] = [];

  beforeEach(() => {
    online = true;
    sleeps.length = 0;
    scanDeps.isOnline = () => online;
    scanDeps.untilOnline = () => new Promise<void>((r) => (reconnect = r));
    scanDeps.sleep = async (ms) => {
      sleeps.push(ms);
    };
  });
  afterEach(() => Object.assign(scanDeps, original));

  it('lee la foto y guarda el resultado', async () => {
    scanDeps.scan = vi.fn(async () => [row('Luis', [180, 200])]);
    const id = startScan('data:image/jpeg;base64,x');
    expect(scanState(id)).toEqual({ status: 'leyendo' });
    expect(await scanDone(id)).toEqual([row('Luis', [180, 200])]);
    expect(scanState(id)).toEqual({ status: 'listo', rows: [row('Luis', [180, 200])] });
  });

  it('sin señal espera a que vuelva la conexión y lee sola', async () => {
    online = false;
    scanDeps.scan = vi.fn(async () => [row('Luis', [150])]);
    const id = startScan('x');
    const done = scanDone(id);
    await Promise.resolve();
    expect(scanState(id)).toEqual({ status: 'esperando', motivo: 'sin-senal' });
    expect(scanDeps.scan).not.toHaveBeenCalled();
    online = true;
    reconnect();
    expect(await done).toEqual([row('Luis', [150])]);
    expect(scanDeps.scan).toHaveBeenCalledTimes(1);
  });

  it('si la red falla con señal, reintenta con esperas y al final avisa', async () => {
    scanDeps.scan = vi.fn(async () => {
      throw new ScanError('No se pudo escanear la foto.', 'red');
    });
    const id = startScan('x');
    await expect(scanDone(id)).rejects.toThrow('No se pudo escanear la foto.');
    expect(scanDeps.scan).toHaveBeenCalledTimes(4);
    expect(sleeps).toEqual([5_000, 15_000, 30_000]);
    expect(scanState(id)).toEqual({ status: 'error', message: 'No se pudo escanear la foto.' });
  });

  it('sin cupo gratis reintenta en un minuto; una foto que no sirve no se reintenta', async () => {
    let calls = 0;
    scanDeps.scan = vi.fn(async () => {
      if (calls++ === 0) throw new ScanError('Se alcanzó el límite gratuito.', 'cupo');
      return [row('Ana', [210])];
    });
    expect(await scanDone(startScan('x'))).toEqual([row('Ana', [210])]);
    expect(sleeps).toEqual([65_000]);

    scanDeps.scan = vi.fn(async () => {
      throw new ScanError('La foto no parece una pantalla de resultados de boliche.');
    });
    const bad = startScan('x');
    await expect(scanDone(bad)).rejects.toBeInstanceOf(ScanError);
    expect(scanDeps.scan).toHaveBeenCalledTimes(1);
  });

  it('el admin (mirando la pantalla) no espera: sin señal o si falla, avisa enseguida', async () => {
    online = false;
    scanDeps.scan = vi.fn(async () => [row('Luis', [150])]);
    const id = startScan('x', { background: false });
    await expect(scanDone(id)).rejects.toThrow('Sin conexión para escanear la foto.');
    expect(scanState(id)).toEqual({ status: 'error', message: 'Sin conexión para escanear la foto.' });
    online = true;
    scanDeps.scan = vi.fn(async () => {
      throw new ScanError('Se alcanzó el límite gratuito.', 'cupo');
    });
    await expect(scanDone(startScan('x', { background: false }))).rejects.toThrow('Se alcanzó el límite gratuito.');
    expect(scanDeps.scan).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([]);
  });

  it('cancelada (otra foto o se cerró sin enviar): no se manda a leer ni gasta cupo', async () => {
    online = false;
    scanDeps.scan = vi.fn(async () => [row('Luis', [150])]);
    const id = startScan('x');
    const done = scanDone(id);
    await Promise.resolve();
    cancelScan(id);
    await expect(done).rejects.toThrow('Se canceló la lectura de la foto.');
    online = true;
    reconnect?.();
    expect(scanDeps.scan).not.toHaveBeenCalled();
    expect(scanState(id)?.status).toBe('error');
  });

  it('la fila del jugador: por su nombre, o la única que hay', () => {
    const rows = [row('LUIS G', [180]), row('ANA', [150])];
    expect(rowFor('Luis Gómez', rows)?.name).toBe('LUIS G');
    expect(rowFor('Pedro', rows)).toBeNull();
    expect(rowFor('Pedro', [row('JUGADOR 1', [170])])?.name).toBe('JUGADOR 1');
  });
});
