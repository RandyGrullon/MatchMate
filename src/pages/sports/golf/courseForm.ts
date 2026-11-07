/**
 * Organizar › Campos sin React (lo usan GolfAdmin.tsx de la web y la pantalla Campos de la app): el borrador del editor
 * de un campo (par y SI de cada hoyo, salidas con rating y slope), pasarlo de 18 a 9 hoyos o al revés, lo que falta
 * para guardarlo, la línea de cada campo en la lista y los puntos del orden de mérito escritos a mano.
 */
import { validateCourse, type GolfCourse, type GolfTee } from '../../../sports/golf/course';

/** Una salida en el editor: lo escrito tal cual (texto) hasta guardar. */
export interface TeeDraft {
  id: string;
  name: string;
  rating: string;
  slope: string;
  byNine: boolean;
  front: { rating: string; slope: string };
  back: { rating: string; slope: string };
  /** Pares o SI propios de esa salida (se conservan tal cual). */
  pars?: number[];
  sis?: number[];
}

/** Un hoyo en el editor (el SI vacío es NaN). */
export interface HoleDraft {
  par: number;
  si: number;
}

/** Lo que se edita de un campo: el nombre, los hoyos y las salidas. */
export interface CourseDraft {
  name: string;
  holes: HoleDraft[];
  tees: TeeDraft[];
}

/** SI por defecto: impares en la ida y pares en la vuelta (con 9 hoyos, 1–9). */
export const defaultSis = (n: number) =>
  n === 9 ? Array.from({ length: 9 }, (_, i) => i + 1) : [...Array.from({ length: 9 }, (_, i) => i * 2 + 1), ...Array.from({ length: 9 }, (_, i) => i * 2 + 2)];

/** Una salida nueva (sin rating ni slope todavía). */
export const newTee = (name: string, rating = '', slope = ''): TeeDraft => ({
  id: `t${Math.random().toString(36).slice(2, 8)}`,
  name,
  rating,
  slope,
  byNine: false,
  front: { rating: '', slope: '' },
  back: { rating: '', slope: '' },
});

/** Hasta cuántas salidas lleva un campo. */
export const MAX_TEES = 10;

const numOrNaN = (s: string) => (s.trim() === '' ? Number.NaN : Number(s.replace(',', '.')));
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Par del campo (la suma del par de sus hoyos). */
export const coursePar = (holes: readonly { par: number }[]) => holes.reduce((a, h) => a + h.par, 0);

/** Borrador del editor → campo del motor (para validar y guardar). */
export function draftCourse(id: string, name: string, holes: { par: number; si: number }[], tees: TeeDraft[]): GolfCourse {
  const n = holes.length;
  return {
    id,
    name: name.trim(),
    holes,
    tees: tees.map((t): GolfTee => {
      const pars = t.pars && t.pars.length === n ? t.pars : holes.map((h) => h.par);
      const tee: GolfTee = { id: t.id, name: t.name.trim(), rating: numOrNaN(t.rating), slope: numOrNaN(t.slope), par: sum(pars) };
      if (t.pars && t.pars.length === n) tee.pars = t.pars;
      if (t.sis && t.sis.length === n) tee.sis = t.sis;
      if (n === 18 && t.byNine) {
        tee.front9 = { rating: numOrNaN(t.front.rating), slope: numOrNaN(t.front.slope), par: sum(pars.slice(0, 9)) };
        tee.back9 = { rating: numOrNaN(t.back.rating), slope: numOrNaN(t.back.slope), par: sum(pars.slice(9)) };
      }
      return tee;
    }),
  };
}

/** Al abrir el editor: lo del campo para cambiarlo o, uno nuevo, 18 hoyos par 4 con Blancas y Rojas. */
export function courseDraft(course: GolfCourse | null): CourseDraft {
  if (!course) {
    return { name: '', holes: defaultSis(18).map((si) => ({ par: 4, si })), tees: [newTee('Blancas'), newTee('Rojas')] };
  }
  return {
    name: course.name,
    holes: course.holes.map((h) => ({ par: h.par, si: h.si })),
    tees: course.tees.map((t) => ({
      id: t.id,
      name: t.name,
      rating: String(t.rating),
      slope: String(t.slope),
      byNine: !!(t.front9 || t.back9),
      front: { rating: t.front9 ? String(t.front9.rating) : '', slope: t.front9 ? String(t.front9.slope) : '' },
      back: { rating: t.back9 ? String(t.back9.rating) : '', slope: t.back9 ? String(t.back9.slope) : '' },
      pars: t.pars,
      sis: t.sis,
    })),
  };
}

/**
 * Pasar el campo a 9 o 18 hoyos. A 9: se quedan los hoyos 1–9 con sus SI en orden (1 al 9). A 18: los SI por
 * defecto. Las salidas pierden sus pares y SI propios (y el rating por vuelta, a 9). null si ya tiene esos hoyos.
 */
export function resizeCourse(holes: readonly HoleDraft[], tees: readonly TeeDraft[], count: 9 | 18): { holes: HoleDraft[]; tees: TeeDraft[] } | null {
  if (count === holes.length) return null;
  let next: HoleDraft[];
  if (count === 9) {
    const first = holes.slice(0, 9);
    const rank = first.map((h, i) => ({ si: h.si, i })).sort((a, b) => a.si - b.si);
    const sis = Array<number>(9);
    rank.forEach((r, k) => (sis[r.i] = k + 1));
    next = first.map((h, i) => ({ par: h.par, si: sis[i] }));
  } else {
    const sis = defaultSis(18);
    next = Array.from({ length: 18 }, (_, i) => ({ par: holes[i]?.par ?? 4, si: sis[i] }));
  }
  return { holes: next, tees: tees.map((t) => ({ ...t, byNine: count === 18 && t.byNine, pars: undefined, sis: undefined })) };
}

/** Lo que falta para guardar el campo (los avisos del motor y el nombre de cada salida). */
export function courseErrors(draft: GolfCourse, tees: readonly TeeDraft[]): string[] {
  const e = validateCourse(draft);
  if (tees.some((t) => !t.name.trim())) e.push('Cada salida lleva nombre (Azules, Blancas, Rojas…).');
  return e;
}

/** Los avisos que se muestran: sin repetir y hasta 8. */
export const shownErrors = (errors: readonly string[]) => [...new Set(errors)].slice(0, 8);

/** «Par total 72 (ida 36 · vuelta 36)»: lo de la derecha del título de los hoyos (sin «Par total»). */
export function parSplit(holes: readonly { par: number }[]): string | null {
  return holes.length === 18 ? `ida ${coursePar(holes.slice(0, 9))} · vuelta ${coursePar(holes.slice(9))}` : null;
}

/** La línea de un campo en la lista: «18 hoyos · par 72 · Azules 71.2/128 · Rojas 70.1/121». */
export const courseLine = (c: Pick<GolfCourse, 'holes' | 'tees'>) =>
  `${c.holes.length} hoyos · par ${coursePar(c.holes)} · ${c.tees.map((t) => `${t.name} ${t.rating}/${t.slope}`).join(' · ')}`;

/** La primera línea de cada salida en el editor: «Salida 1 · par 72 (con pares propios) · SI propios». */
export const teeLine = (i: number, par: number | undefined, t: Pick<TeeDraft, 'pars' | 'sis'>) =>
  `Salida ${i + 1} · par ${par}${t.pars ? ' (con pares propios)' : ''}${t.sis ? ' · SI propios' : ''}`;

/** Los puntos del orden de mérito escritos a mano («25, 20, 16…»): los números y si no sirven (1 a 50, de 0 a 100). */
export function parseMeritPoints(text: string): { points: number[]; bad: boolean } {
  const points = text
    .split(/[,\s]+/)
    .filter(Boolean)
    .map(Number);
  const bad = !points.length || points.length > 50 || points.some((n) => !Number.isFinite(n) || n < 0 || n > 100);
  return { points, bad };
}
