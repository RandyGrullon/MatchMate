import type { SportId } from '../../sports/types';

/**
 * Lo que se llena de un espacio deportivo (una cancha, una bolera, una piscina…) según su deporte: cuántas canchas o
 * pistas tiene, la superficie, si es techada, la iluminación… Lo usan el formulario del panel de la empresa, la ficha
 * pública (/canchas/:id) y la validación antes de guardar (la base guarda `details` como JSON y solo revisa su tamaño:
 * las reglas de cada deporte están aquí, en un solo lugar).
 *
 * Sin React: se prueba solo (fields.test.ts).
 */

export type VenueFieldKind = 'count' | 'choice' | 'yesno';

export interface VenueChoice {
  value: string;
  label: string;
}

export interface VenueField {
  key: string;
  label: string;
  kind: VenueFieldKind;
  /** count: el mínimo y el máximo (enteros). */
  min?: number;
  max?: number;
  /** choice: las opciones. */
  options?: readonly VenueChoice[];
  /** Hay que llenarlo para guardar. */
  required?: boolean;
}

const yes = (key: string, label: string): VenueField => ({ key, label, kind: 'yesno' });
const count = (key: string, label: string, max: number): VenueField => ({ key, label, kind: 'count', min: 1, max, required: true });
const choice = (key: string, label: string, options: readonly VenueChoice[], required = false): VenueField => ({ key, label, kind: 'choice', options, required });
const opts = (...pairs: [string, string][]): VenueChoice[] => pairs.map(([value, label]) => ({ value, label }));

const ROOFED = yes('techada', 'Techada');
const LIGHTS = yes('iluminacion', 'Iluminación para jugar de noche');

const FIELDS: Record<SportId, readonly VenueField[]> = {
  bowling: [
    count('pistas', 'Pistas', 80),
    yes('zapatos', 'Alquiler de zapatos'),
    yes('barandas', 'Barandas para niños'),
    yes('proShop', 'Tienda de bolas (pro shop)'),
  ],
  padel: [
    count('canchas', 'Canchas', 40),
    choice('paredes', 'Paredes', opts(['cristal', 'Cristal'], ['muro', 'Muro'], ['mixtas', 'Mixtas'])),
    choice('superficie', 'Superficie', opts(['cesped', 'Césped artificial'], ['cemento', 'Cemento'])),
    ROOFED,
    LIGHTS,
  ],
  tennis: [
    count('canchas', 'Canchas', 40),
    choice('superficie', 'Superficie', opts(['arcilla', 'Arcilla'], ['dura', 'Dura'], ['cesped', 'Césped'], ['sintetica', 'Sintética'])),
    ROOFED,
    LIGHTS,
  ],
  pickleball: [count('canchas', 'Canchas', 40), choice('superficie', 'Superficie', opts(['dura', 'Dura'], ['sintetica', 'Sintética'], ['madera', 'Madera'])), ROOFED, LIGHTS],
  table_tennis: [count('mesas', 'Mesas', 100), yes('aire', 'Aire acondicionado')],
  basketball: [count('canchas', 'Canchas', 20), choice('piso', 'Piso', opts(['madera', 'Madera'], ['sintetico', 'Sintético'], ['cemento', 'Cemento'])), ROOFED, LIGHTS, yes('gradas', 'Gradas')],
  football: [
    count('campos', 'Campos', 20),
    choice('formato', 'Formato', opts(['f5', 'Fútbol 5'], ['f7', 'Fútbol 7'], ['f11', 'Fútbol 11']), true),
    choice('superficie', 'Superficie', opts(['natural', 'Grama natural'], ['sintetica', 'Grama sintética'])),
    LIGHTS,
    yes('gradas', 'Gradas'),
  ],
  futsal: [count('canchas', 'Canchas', 20), choice('piso', 'Piso', opts(['madera', 'Madera'], ['sintetico', 'Sintético'], ['cemento', 'Cemento'])), ROOFED, LIGHTS],
  golf: [
    choice('hoyos', 'Hoyos', opts(['9', '9 hoyos'], ['18', '18 hoyos'], ['27', '27 hoyos'], ['36', '36 hoyos']), true),
    { key: 'par', label: 'Par del campo', kind: 'count', min: 27, max: 80 },
    yes('practica', 'Campo de práctica (driving range)'),
    yes('putting', 'Putting green'),
  ],
  swimming: [
    choice('largo', 'Largo de la piscina', opts(['25', '25 m'], ['50', '50 m']), true),
    count('carriles', 'Carriles', 12),
    yes('climatizada', 'Climatizada'),
    ROOFED,
  ],
  esports: [count('estaciones', 'Estaciones de juego', 500), choice('plataformas', 'Plataformas', opts(['pc', 'PC'], ['consola', 'Consola'], ['ambas', 'PC y consola']))],
};

/** Lo que se llena de un espacio de ese deporte (vacío si el deporte no se conoce). */
export const venueFields = (sport: string): readonly VenueField[] => FIELDS[sport as SportId] ?? [];

/** Lo que se guarda: clave → número, texto (una opción) o sí/no. */
export type VenueDetails = Record<string, number | string | boolean>;

export type VenueDetailsResult = { ok: true; details: VenueDetails } | { ok: false; field: string; message: string };

/**
 * Revisa y limpia lo llenado: solo las claves del deporte, enteros dentro de su rango, una de las opciones, sí/no.
 * Lo vacío se quita (salvo lo obligatorio, que da error).
 */
export function cleanVenueDetails(sport: string, raw: Record<string, unknown> | null | undefined): VenueDetailsResult {
  const fields = venueFields(sport);
  if (!fields.length) return { ok: false, field: 'deporte', message: 'Elige el deporte.' };
  const input = raw ?? {};
  const out: VenueDetails = {};
  for (const f of fields) {
    const v = input[f.key];
    const empty = v === undefined || v === null || v === '';
    if (empty) {
      if (f.required) return { ok: false, field: f.key, message: `Falta: ${f.label.toLowerCase()}.` };
      continue;
    }
    if (f.kind === 'count') {
      const n = typeof v === 'number' ? v : Number(String(v).trim());
      if (!Number.isInteger(n) || n < (f.min ?? 1) || n > (f.max ?? 1000)) {
        return { ok: false, field: f.key, message: `${f.label}: un número de ${f.min ?? 1} a ${f.max ?? 1000}.` };
      }
      out[f.key] = n;
    } else if (f.kind === 'choice') {
      const s = String(v);
      if (!f.options?.some((o) => o.value === s)) return { ok: false, field: f.key, message: `${f.label}: elige una opción.` };
      out[f.key] = s;
    } else {
      if (typeof v !== 'boolean') return { ok: false, field: f.key, message: `${f.label}: sí o no.` };
      if (v) out[f.key] = true;
    }
  }
  return { ok: true, details: out };
}

/**
 * Lo llenado en palabras, para la ficha y las tarjetas: «6 canchas · Cristal · Césped artificial · Techada ·
 * Iluminación para jugar de noche». Lo que no es del deporte o no se entiende no sale.
 */
export function venueDetailsLines(sport: string, details: Record<string, unknown> | null | undefined): string[] {
  const d = details ?? {};
  const lines: string[] = [];
  for (const f of venueFields(sport)) {
    const v = d[f.key];
    if (f.kind === 'count' && typeof v === 'number' && Number.isInteger(v)) lines.push(f.key === 'par' ? `Par ${v}` : `${v} ${v === 1 ? singular(f.label) : f.label.toLowerCase()}`);
    else if (f.kind === 'choice' && typeof v === 'string') {
      const o = f.options?.find((x) => x.value === v);
      if (o) lines.push(o.label);
    } else if (f.kind === 'yesno' && v === true) lines.push(f.label);
  }
  return lines;
}

/** «Canchas» → «cancha», «Pistas» → «pista», «Mesas» → «mesa», «Estaciones de juego» → «estación de juego». */
function singular(label: string): string {
  const [first, ...rest] = label.toLowerCase().split(' ');
  const one = first.endsWith('ones') ? `${first.slice(0, -4)}ón` : first.endsWith('es') && !first.endsWith('ces') ? first.slice(0, -1) : first.replace(/s$/, '');
  return [one, ...rest].join(' ');
}
