/**
 * Natación: pruebas y categorías por edad.
 *
 * Una prueba = distancia (25–1500) × estilo × piscina (25 o 50 m) × sexo × categorías que nadan juntas.
 * Sin relevos en la v1 (recorte aceptado): ni inscripción de relevo ni puntos dobles.
 *
 * Datos de menores: el año de nacimiento y el sexo se guardan solo en privado (los ven los admins);
 * en público se muestra solo la categoría ya calculada.
 */

export type SwimStroke = 'libre' | 'espalda' | 'pecho' | 'mariposa' | 'combinado';
export type PoolLength = 25 | 50;
/** Femenino, masculino o mixto (pruebas de los más pequeños en encuentros de club). */
export type SwimGender = 'F' | 'M' | 'X';

export const SWIM_STROKES: SwimStroke[] = ['libre', 'espalda', 'pecho', 'mariposa', 'combinado'];
export const SWIM_DISTANCES = [25, 50, 100, 200, 400, 800, 1500] as const;
export type SwimDistance = (typeof SWIM_DISTANCES)[number];

export const STROKE_LABEL: Record<SwimStroke, string> = {
  libre: 'Libre',
  espalda: 'Espalda',
  pecho: 'Pecho',
  mariposa: 'Mariposa',
  combinado: 'Combinado',
};

export const GENDER_LABEL: Record<SwimGender, string> = { F: 'Femenino', M: 'Masculino', X: 'Mixto' };

/** Distancias que existen en cada estilo (el combinado de 100 solo en piscina de 25). */
const STROKE_DISTANCES: Record<SwimStroke, readonly number[]> = {
  libre: SWIM_DISTANCES,
  espalda: [25, 50, 100, 200],
  pecho: [25, 50, 100, 200],
  mariposa: [25, 50, 100, 200],
  combinado: [100, 200, 400],
};

export interface SwimEvent {
  id: string;
  distance: SwimDistance;
  stroke: SwimStroke;
  pool: PoolLength;
  gender: SwimGender;
  /** Categorías que nadan esta prueba (ids de `AgeGroup`). Vacía = abierta. En finales por tiempo se mezclan en las series. */
  ageGroups: string[];
}

/** Errores de la prueba en español (vacía = válida). */
export function validateSwimEvent(ev: Pick<SwimEvent, 'distance' | 'stroke' | 'pool'>): string[] {
  const out: string[] = [];
  if (ev.pool !== 25 && ev.pool !== 50) out.push('La piscina es de 25 o de 50 m.');
  if (!SWIM_STROKES.includes(ev.stroke)) {
    out.push('Estilo desconocido.');
    return out;
  }
  const name = `${ev.distance} m ${STROKE_LABEL[ev.stroke].toLowerCase()}`;
  // Largos enteros; en el combinado, los 4 estilos con los mismos largos (100 m combinado solo en piscina de 25).
  const lengths = ev.distance / ev.pool;
  if (!STROKE_DISTANCES[ev.stroke].includes(ev.distance)) out.push(`No existe ${name}.`);
  else if (!Number.isInteger(lengths) || (ev.stroke === 'combinado' && lengths % 4 !== 0)) out.push(`${name} no se puede nadar en piscina de ${ev.pool} m.`);
  return out;
}

/** «100 m Libre · piscina 25 m · Femenino · 11-12, 13-14». */
export function swimEventName(ev: SwimEvent, groups: readonly AgeGroup[] = []): string {
  const parts = [`${ev.distance} m ${STROKE_LABEL[ev.stroke]}`, `piscina ${ev.pool} m`, GENDER_LABEL[ev.gender]];
  if (ev.ageGroups.length) parts.push(ev.ageGroups.map((id) => groups.find((g) => g.id === id)?.label ?? id).join(', '));
  return parts.join(' · ');
}

/** Clave de la marca personal: estilo + distancia + piscina (25 y 50 m van separadas). */
export function bestKey(ev: { stroke: SwimStroke; distance: number; pool: PoolLength }): string {
  return `${ev.stroke}-${ev.distance}-${ev.pool}`;
}

// ---------------------------------------------------------------------------------------------
// Categorías por edad

export interface AgeGroup {
  id: string;
  label: string;
  /** Edades incluidas (null = sin límite). */
  min: number | null;
  max: number | null;
}

/** Categorías del CCCAN y las menores de club. */
export const CCCAN_AGE_GROUPS: AgeGroup[] = [
  { id: '8-', label: '8 y menos', min: null, max: 8 },
  { id: '9-10', label: '9-10', min: 9, max: 10 },
  { id: '11-12', label: '11-12', min: 11, max: 12 },
  { id: '13-14', label: '13-14', min: 13, max: 14 },
  { id: '15-17', label: '15-17', min: 15, max: 17 },
  { id: '18+', label: '18 y más', min: 18, max: null },
];

/** Másters en tramos de 5 años desde 25-29 (hasta 95-99, y luego 100 y más). */
export function mastersAgeGroups(): AgeGroup[] {
  const out: AgeGroup[] = [];
  for (let a = 25; a < 100; a += 5) out.push({ id: `m${a}-${a + 4}`, label: `${a}-${a + 4}`, min: a, max: a + 4 });
  out.push({ id: 'm100+', label: '100 y más', min: 100, max: null });
  return out;
}

/** Fecha de referencia de la edad: el 31 de diciembre del año del encuentro (por defecto) o el día del encuentro. */
export function ageReference(meetDate: string, mode: 'dec31' | 'meetDate' = 'dec31'): string {
  return mode === 'dec31' ? `${meetDate.slice(0, 4)}-12-31` : meetDate.slice(0, 10);
}

/**
 * Edad en la fecha de referencia ('AAAA-MM-DD').
 * - Con fecha de nacimiento completa ('AAAA-MM-DD'), la edad exacta en esa fecha.
 * - Con solo el año (lo que se guarda de los menores), la edad que cumple en el año de la referencia
 *   (= la edad al 31 de diciembre), sea cual sea el día de la referencia.
 */
export function ageOn(birth: number | string, reference: string): number {
  const refYear = Number(reference.slice(0, 4));
  if (typeof birth === 'number') return refYear - birth;
  const [y, m, d] = birth.split('-').map(Number);
  const [, rm, rd] = reference.split('-').map(Number);
  const hadBirthday = rm > m || (rm === m && rd >= d);
  return refYear - y - (hadBirthday ? 0 : 1);
}

/** Categoría de una edad (null = ninguna, p. ej. 22 años en másters). */
export function ageGroupOf(age: number, groups: readonly AgeGroup[] = CCCAN_AGE_GROUPS): AgeGroup | null {
  return groups.find((g) => (g.min == null || age >= g.min) && (g.max == null || age <= g.max)) ?? null;
}
