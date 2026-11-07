/**
 * Crear una ronda o un torneo de golf, o cambiar el campo y el formato de una ronda, sin React (lo usan RoundForm.tsx
 * de la web y la hoja de la app): las plantillas del formato, los hoyos que se pueden jugar, cuándo se puede guardar,
 * qué cambia al guardar y el texto del botón.
 */
import type { Nine } from '../../../sports/golf/course';
import type { GolfCompetition } from '../../../sports/golf/scoring';
import type { GolfCourseDoc, GolfRoundFull } from '../../../lib/data/golf';
import { COMPETITION_TEMPLATES, sameCompetition } from './logic';

export type RoundKind = 'ronda' | 'torneo';

/** Hasta cuántas rondas lleva un torneo (una por fecha). */
export const MAX_TOURNAMENT_ROUNDS = 6;

type Template = (typeof COMPETITION_TEMPLATES)[number];

/** La plantilla del formato elegido (por formato y base; el % del handicap no cuenta). */
export const templateOf = (value: GolfCompetition): Template | undefined =>
  COMPETITION_TEMPLATES.find((t) => t.comp.format === value.format && t.comp.basis === value.basis);

/** Elegir una plantilla: el bruto va al 100 %; el neto se queda con el % que ya tenía. */
export const pickTemplate = (t: Template, value: GolfCompetition): GolfCompetition => ({
  ...t.comp,
  allowance: t.comp.basis === 'gross' ? 100 : (value.allowance ?? t.comp.allowance),
});

/** El % del handicap escrito a mano, de 0 a 100. */
export const allowanceOf = (text: string) => Math.max(0, Math.min(100, Number(text) || 0));

/** Lo que se juega de un campo: de 18, los 18, la ida o la vuelta; de 9, los 9. */
export function nineOptions(eighteen: boolean): { key: Nine; label: string }[] {
  return eighteen
    ? [
        { key: 'all', label: '18 hoyos' },
        { key: 'front', label: 'Ida 1–9' },
        { key: 'back', label: 'Vuelta 10–18' },
      ]
    : [{ key: 'all', label: '9 hoyos' }];
}

/** El campo en la lista para elegir: «Campo de ejemplo · 18 hoyos · par 72». */
export const courseOption = (c: Pick<GolfCourseDoc, 'name' | 'holes'>) => `${c.name} · ${c.holes.length} hoyos · par ${c.holes.reduce((a, h) => a + h.par, 0)}`;

/** Lo que se llena al crear: la ronda con su fecha, o el torneo con su nombre y una fecha por ronda. */
export interface RoundFormValues {
  kind: RoundKind;
  name: string;
  date: string;
  dates: readonly string[];
  courseId: string;
}

/** Se puede guardar: con campo y, al crear, la fecha de la ronda o el nombre y las fechas del torneo. */
export function roundFormValid(f: RoundFormValues, editing: boolean): boolean {
  if (!f.courseId) return false;
  if (editing) return true;
  return f.kind === 'ronda' ? !!f.date : !!f.name.trim() && f.dates.length > 0 && f.dates.every(Boolean);
}

/** Una ronda más al torneo: con la fecha de la última (o la de hoy). */
export const addDate = (dates: readonly string[], today: string) => [...dates, dates[dates.length - 1] ?? today];

/**
 * Lo que cambia al guardar «Campo y formato» de una ronda (`round` null: todavía sin campo, va todo). Con golpes
 * anotados (`locked`) el campo y los hoyos no cambian.
 */
export function roundPatch(
  round: GolfRoundFull | null,
  f: { courseId: string; nine: Nine; comp: GolfCompetition; shotgun: boolean; eighteen: boolean },
  locked: boolean,
): { courseId?: string; nine?: Nine; competition?: GolfCompetition; shotgun?: boolean } {
  const patch: { courseId?: string; nine?: Nine; competition?: GolfCompetition; shotgun?: boolean } = {};
  if (!round || (!locked && f.courseId !== round.courseId)) patch.courseId = f.courseId;
  if (!locked && (!round || f.nine !== round.nine)) patch.nine = f.eighteen ? f.nine : 'all';
  if (!round || !sameCompetition(f.comp, round.competition)) patch.competition = f.comp;
  if (!round || f.shotgun !== round.shotgun) patch.shotgun = f.shotgun;
  return patch;
}

/** El botón de abajo: «Guardar», «Crear ronda» o «Crear torneo (3 rondas)». */
export function submitLabel(editing: boolean, kind: RoundKind, rounds: number): string {
  if (editing) return 'Guardar';
  return kind === 'ronda' ? 'Crear ronda' : `Crear torneo (${rounds} ${rounds === 1 ? 'ronda' : 'rondas'})`;
}
