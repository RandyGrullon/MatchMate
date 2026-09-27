/**
 * Ids UUID versión 7 (RFC 9562). Los primeros 48 bits son la hora en ms, así que ordenan por fecha de creación
 * (sirven como clave en Postgres sin desordenar el índice). Dentro del mismo ms, o si el reloj del teléfono se
 * atrasa, un contador de 42 bits (rand_a + el inicio de rand_b, método 1 del RFC) sigue subiendo: en esta pestaña
 * nunca se repiten ni se desordenan. La cola sin conexión los usa como op_id, y el cliente para crear filas sin señal.
 *
 * Formato: tttttttt-tttt-7aaa-{8,9,a,b}bbb-bbbbbbbbbbbb (t = hora, a/b = contador y azar).
 */

export interface UuidV7Options {
  /** Hora en ms (por defecto Date.now). */
  now?: () => number;
  /** Llena el arreglo con bytes al azar (por defecto crypto.getRandomValues). */
  random?: (bytes: Uint8Array<ArrayBuffer>) => void;
}

const TWO_30 = 2 ** 30;
const MAX_COUNTER = 2 ** 42 - 1;
const MAX_MS = 2 ** 48 - 1;

const HEX: string[] = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

/** Crea un generador propio (las pruebas le pasan un reloj y un azar fijos). */
export function createUuidV7(opts: UuidV7Options = {}): () => string {
  const now = opts.now ?? Date.now;
  const fill = opts.random ?? ((bytes: Uint8Array<ArrayBuffer>) => void crypto.getRandomValues(bytes));
  const seed = new Uint8Array(6);
  const bytes = new Uint8Array(16);
  let lastMs = -1;
  let counter = 0;

  // Contador inicial al azar con el bit de arriba en 0: deja 2^41 ids seguidos en el mismo ms.
  const reseed = () => {
    fill(seed);
    counter = (seed[0] & 0x01) * 2 ** 40 + seed[1] * 2 ** 32 + seed[2] * 2 ** 24 + seed[3] * 2 ** 16 + seed[4] * 2 ** 8 + seed[5];
  };

  return () => {
    const ms = Math.min(Math.max(0, Math.floor(now())), MAX_MS);
    if (ms > lastMs) {
      lastMs = ms;
      reseed();
    } else if (++counter > MAX_COUNTER) {
      // Se acabó el contador en este ms: se toma prestado el ms siguiente (sigue ordenando).
      lastMs++;
      reseed();
    }
    fill(bytes); // los últimos 32 bits quedan al azar
    for (let i = 0; i < 6; i++) bytes[i] = Math.floor(lastMs / 2 ** (8 * (5 - i))) % 256;
    const high = Math.floor(counter / TWO_30); // 12 bits → rand_a
    const low = counter % TWO_30; // 30 bits → inicio de rand_b
    bytes[6] = 0x70 | (high >>> 8);
    bytes[7] = high & 0xff;
    bytes[8] = 0x80 | ((low >>> 24) & 0x3f);
    bytes[9] = (low >>> 16) & 0xff;
    bytes[10] = (low >>> 8) & 0xff;
    bytes[11] = low & 0xff;
    let out = '';
    for (let i = 0; i < 16; i++) {
      if (i === 4 || i === 6 || i === 8 || i === 10) out += '-';
      out += HEX[bytes[i]];
    }
    return out;
  };
}

/** Un UUID v7 nuevo (creciente dentro de esta pestaña). */
export const uuidv7: () => string = createUuidV7();

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID_RE.test(value);

/** Hora (ms) guardada en un UUID v7; null si no es un v7. */
export function uuidv7Time(id: string): number | null {
  if (!isUuid(id) || id[14] !== '7') return null;
  return parseInt(id.slice(0, 8) + id.slice(9, 13), 16);
}
