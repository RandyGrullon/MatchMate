/**
 * Lo puro del formulario de un equipo (crear y editar), sin React ni pantallas: lo usan SquadFields.tsx,
 * CreateSquadSheet.tsx y EditSquadSheet.tsx de la web y la app del teléfono (movil/src/components/squads). Lo prueba
 * squadForm.test.ts.
 */
import { cleanTag, squadProblem, suggestTag, type SquadPage, type SquadPatch } from '../../lib/data/squads';
import { validColor } from '../../components/squads/logic';

export interface SquadForm {
  name: string;
  tag: string;
  city: string;
  /** null = el color del deporte. */
  color: string | null;
  description: string;
  recruiting: boolean;
}

export const emptySquadForm = (): SquadForm => ({ name: '', tag: '', city: '', color: null, description: '', recruiting: false });

export const squadFormOf = (s: Pick<SquadPage, 'name' | 'tag' | 'city' | 'color' | 'description' | 'recruiting'>): SquadForm => ({
  name: s.name,
  tag: s.tag,
  city: s.city ?? '',
  color: validColor(s.color),
  description: s.description ?? '',
  recruiting: s.recruiting,
});

/** Solo lo que cambió (null si nada). */
export function squadPatchOf(s: Pick<SquadPage, 'name' | 'tag' | 'city' | 'color' | 'description' | 'recruiting'>, f: SquadForm): SquadPatch | null {
  const patch: SquadPatch = {};
  if (f.name.trim() !== s.name) patch.name = f.name.trim();
  if (cleanTag(f.tag) !== s.tag) patch.tag = cleanTag(f.tag);
  if ((f.city.trim() || null) !== (s.city?.trim() || null)) patch.city = f.city.trim() || null;
  if (validColor(f.color) !== validColor(s.color)) patch.color = validColor(f.color);
  if (f.description.trim() !== (s.description ?? '').trim()) patch.description = f.description.trim();
  if (f.recruiting !== s.recruiting) patch.recruiting = f.recruiting;
  return Object.keys(patch).length ? patch : null;
}

/** Lo que dice la hoja del formulario: el problema (solo si ya escribió algo) y si se puede crear. */
export function createGate(form: Pick<SquadForm, 'name' | 'tag'> & Partial<Pick<SquadForm, 'description' | 'city'>>, busy = false): { problem: string | null; shown: string | null; canCreate: boolean } {
  const problem = squadProblem(form);
  // Con todo vacío no se regaña: el botón apagado ya lo dice.
  const shown = problem && (form.name.trim() || form.tag.trim()) ? problem : null;
  return { problem, shown, canCreate: !problem && !busy };
}

/** El formulario de entrada al crear: lo que venga (`initial`) y, si no trae tag, el que sale del nombre. */
export function initialCreateForm(initial?: Partial<SquadForm>): SquadForm {
  const f = { ...emptySquadForm(), ...initial };
  return { ...f, tag: f.tag || suggestTag(f.name) };
}

/** Un cambio al crear: mientras no escribió su propio tag (`tagTyped`), el tag sale solo del nombre. */
export function changeCreateForm(form: SquadForm, patch: Partial<SquadForm>, tagTyped: boolean): SquadForm {
  const next = { ...form, ...patch };
  if (patch.name !== undefined && !tagTyped) next.tag = suggestTag(patch.name);
  return next;
}

/** El primer paso al crear: los datos si el deporte pedido es el que sale marcado; si no, elegir el deporte. */
export const createStartStep = (wanted: string | null, start: string | null): 'deporte' | 'datos' => (wanted && wanted === start ? 'datos' : 'deporte');

/** El tag mientras se escribe: mayúsculas, solo letras y números, hasta 5. */
export const typedTag = (raw: string) => cleanTag(raw).slice(0, 5);
