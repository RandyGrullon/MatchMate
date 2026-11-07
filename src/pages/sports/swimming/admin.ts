/**
 * Natación: lo del organizador sin pantallas (salió de MeetFormModal, ProgramPanel, HeatSheetPanel, SwimmersAdmin y
 * ClubsAdmin, que lo importan de aquí): el formulario del encuentro, las pruebas del programa, el borrador de la hoja de
 * series, los nadadores y los clubes. Funciones puras: las usan la web y la app del teléfono.
 */
import { SWIM_DISTANCES, validateSwimEvent, type AgeGroup, type SwimStroke } from '../../../sports/swimming';
import type {
  AgeScheme,
  MeetPatch,
  Sex,
  SwimEntry,
  SwimEventInput,
  SwimEventItem,
  SwimMeet,
  SwimmerInfo,
  SwimmerPatch,
  SwimmerPrivate,
} from '../../../lib/data/swimming';
import type { Player } from '../../../lib/types';
import { clubMeetTemplate, draftHeats, eventHasResults, minorAgeProblem, pointsFor, swapLanes, timeTrialTemplate, type SheetHeat } from './logic';

// ---------- El encuentro ----------

/** «6-4-3-2-1» → [6, 4, 3, 2, 1] (también con comas o espacios). null si no se entiende. */
export function parsePoints(text: string): number[] | null {
  const parts = text.split(/[\s,;-]+/).filter(Boolean);
  if (!parts.length || parts.length > 50) return null;
  const nums = parts.map((p) => Number(p.replace(',', '.')));
  return nums.every((n) => Number.isFinite(n) && n >= 0 && n <= 100) ? nums : null;
}

/** Los carriles que se pueden elegir (de 3 a 10). */
export const LANE_OPTIONS: readonly number[] = Array.from({ length: 8 }, (_, k) => k + 3);

/** Los puntos por defecto siguen a los carriles mientras no se cambien a mano. */
export const pointsAfterLanes = (points: string, from: number, to: number): string => (points === pointsFor(from).join('-') ? pointsFor(to).join('-') : points);

/** Con qué pruebas empieza un encuentro nuevo. */
export type MeetTemplate = 'club' | 'control' | 'none';

/** Las pruebas de la plantilla elegida. */
export const templateEvents = (template: MeetTemplate, pool: 25 | 50, scheme: AgeScheme): SwimEventInput[] =>
  template === 'club' ? clubMeetTemplate(pool, scheme) : template === 'control' ? timeTrialTemplate() : [];

/** «Empezar con»: las plantillas con cuántas pruebas trae cada una. */
export const templateOptions = (pool: 25 | 50, scheme: AgeScheme): { value: MeetTemplate; label: string }[] => [
  { value: 'club', label: `Pruebas de un encuentro de club (${clubMeetTemplate(pool, scheme).length})` },
  { value: 'control', label: `Pruebas de control de marcas (${timeTrialTemplate().length})` },
  { value: 'none', label: 'Sin pruebas' },
];

/** Lo que se llena al crear o cambiar un encuentro. */
export interface MeetFormInput {
  type: 'encuentro' | 'control';
  name: string;
  date: string;
  startTime: string | null;
  announcement: string;
  pool: 25 | 50;
  lanes: number;
  points: number[];
  ageGroups: AgeScheme;
}

/** Se puede guardar: con fecha, los puntos se entienden y el nombre cabe. */
export const meetFormValid = (o: { date: string; points: number[] | null; name: string }): boolean => !!o.date && !!o.points && o.name.length <= 80;

/** Solo lo que cambió (para no tocar la piscina si ya hay tiempos, por ejemplo). */
export function meetChanges(m: SwimMeet, input: MeetFormInput): MeetPatch {
  const out: MeetPatch = {};
  if (input.name.trim() !== m.name) out.name = input.name;
  if (input.date !== m.date) out.date = input.date;
  if ((input.startTime || null) !== m.startTime) out.startTime = input.startTime;
  if (input.announcement !== m.announcement) out.announcement = input.announcement;
  if (m.type !== 'torneo' && input.type !== m.type) out.type = input.type;
  if (input.pool !== m.pool) out.pool = input.pool;
  if (input.lanes !== m.lanes) out.lanes = input.lanes;
  if (input.points.join(',') !== m.points.join(',')) out.points = input.points;
  if (input.ageGroups !== m.ageGroups) out.ageGroups = input.ageGroups;
  return out;
}

// ---------- El programa ----------

/** Una prueba como la manda saveSwimEvents. */
export const toEventInput = (e: SwimEventItem): SwimEventInput => ({ id: e.id, num: e.num, distance: e.distance, stroke: e.stroke, gender: e.gender, ageGroups: e.ageGroups });

/** Cuántos inscritos tiene cada prueba. */
export function entryCounts(entries: readonly Pick<SwimEntry, 'swimEventId'>[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of entries) m.set(e.swimEventId, (m.get(e.swimEventId) ?? 0) + 1);
  return m;
}

/** «1 inscrito», «3 inscritos». */
export const enteredText = (n: number) => (n === 1 ? '1 inscrito' : `${n} inscritos`);

/** Las distancias que se pueden nadar en ese estilo y esa piscina. */
export const strokeDistances = (stroke: SwimStroke, pool: 25 | 50): number[] => SWIM_DISTANCES.filter((d) => !validateSwimEvent({ distance: d, stroke, pool }).length);

/** Al cambiar el estilo: la distancia sigue si se puede; si no, la primera que se puede (o 50). */
export function distanceForStroke(stroke: SwimStroke, distance: number, pool: 25 | 50): number {
  const ok = strokeDistances(stroke, pool);
  return ok.includes(distance) ? distance : (ok[0] ?? 50);
}

/** Lo que no deja guardar la prueba (vacío = se puede). */
export const eventErrors = (distance: number, stroke: SwimStroke, pool: 25 | 50): string[] =>
  validateSwimEvent({ distance: distance as SwimEventItem['distance'], stroke, pool });

/** Marcar o quitar una categoría (quedan en el orden de las categorías). */
export const toggleAgeGroup = (all: readonly AgeGroup[], picked: readonly string[], id: string): string[] =>
  picked.includes(id) ? picked.filter((y) => y !== id) : all.filter((a) => a.id === id || picked.includes(a.id)).map((a) => a.id);

/** Subir (−1) o bajar (+1) una prueba: las dos de al lado cambian de número. null si no hay a dónde. */
export function moveEvent(events: readonly SwimEventItem[], evId: string, dir: -1 | 1): SwimEventInput[] | null {
  const k = events.findIndex((e) => e.id === evId);
  const a = events[k];
  const b = events[k + dir];
  if (!a || !b) return null;
  return [
    { ...toEventInput(a), num: b.num },
    { ...toEventInput(b), num: a.num },
  ];
}

// ---------- La hoja de series (el borrador) ----------

/** Un carril tocado en el borrador (para cambiarlo con el siguiente). */
export type LanePick = { ev: string; heat: number; lane: number };

/** Las pruebas con inscritos y, de ellas, las que se pueden armar (sin tiempos todavía). */
export function sheetEvents(events: readonly SwimEventItem[], entries: readonly SwimEntry[]): { withEntries: SwimEventItem[]; seedable: SwimEventItem[] } {
  const withEntries = events.filter((ev) => entries.some((e) => e.swimEventId === ev.id));
  return { withEntries, seedable: withEntries.filter((ev) => !eventHasResults(ev.id, entries)) };
}

/** El borrador de las pruebas que se arman (todas las que se pueden, o solo una). */
export function buildDraft(list: readonly SwimEventItem[], entries: readonly SwimEntry[], lanes: number): Map<string, SheetHeat[]> {
  const m = new Map<string, SheetHeat[]>();
  for (const ev of list) m.set(ev.id, draftHeats(ev, entries, lanes));
  return m;
}

/**
 * Tocar un carril del borrador: el primero queda marcado; el segundo (de la misma prueba) se cambia con él; el mismo
 * otra vez lo desmarca; uno de otra prueba pasa a ser el marcado.
 */
export function tapLane(draft: ReadonlyMap<string, SheetHeat[]>, pick: LanePick | null, at: LanePick): { draft: Map<string, SheetHeat[]>; pick: LanePick | null } {
  const same = new Map(draft);
  if (!pick || pick.ev !== at.ev) return { draft: same, pick: at };
  if (pick.heat === at.heat && pick.lane === at.lane) return { draft: same, pick: null };
  same.set(at.ev, swapLanes(draft.get(at.ev) ?? [], pick, { heat: at.heat, lane: at.lane }));
  return { draft: same, pick: null };
}

/** «1 inscrito sin serie (se inscribieron después).» */
export const unassignedText = (n: number) => `${n === 1 ? '1 inscrito sin serie' : `${n} inscritos sin serie`} (se inscribieron después).`;

// ---------- Nadadores ----------

export const SEX_LABEL: Record<Sex, string> = { F: 'Femenino', M: 'Masculino', X: 'Otro' };

/** Los nadadores con lo buscado y el club elegido ('' = todos; '-' = sin club). */
export function filterSwimmers<P extends Pick<Player, 'id' | 'name'>>(players: readonly P[], q: string, club: string, infoBy: ReadonlyMap<string, Pick<SwimmerInfo, 'clubId'>>): P[] {
  const needle = q.trim().toLowerCase();
  return players
    .filter((p) => !needle || p.name.toLowerCase().includes(needle))
    .filter((p) => !club || (club === '-' ? !infoBy.get(p.id)?.clubId : infoBy.get(p.id)?.clubId === club));
}

/** El título de la lista: «Nadadores» (cargando), «1 nadador», «12 nadadores». */
export const swimmersTitle = (loading: boolean, n: number) => (loading ? 'Nadadores' : n === 1 ? '1 nadador' : `${n} nadadores`);

/** La línea de un nadador: el club (o «Sin club»), el año y el sexo (solo los admins los ven). */
export const swimmerLine = (clubName: string | null | undefined, priv: Pick<SwimmerPrivate, 'birthYear' | 'sex'> | undefined): string =>
  [clubName ?? 'Sin club', priv?.birthYear ? String(priv.birthYear) : null, priv?.sex ? SEX_LABEL[priv.sex] : null].filter(Boolean).join(' · ');

/** La marca de la fila: menor (con o sin permiso), con cuenta, o nada. */
export function swimmerTag(p: Pick<Player, 'isMinor' | 'uid'>, priv: Pick<SwimmerPrivate, 'consentAt'> | undefined): { label: string; tone: 'accent' | 'danger' | 'ok' } | null {
  if (p.isMinor) return priv?.consentAt ? { label: 'Menor', tone: 'accent' } : { label: 'Menor sin permiso', tone: 'danger' };
  return p.uid ? { label: 'Con cuenta', tone: 'ok' } : null;
}

/** Lo que se llena al registrar o cambiar un nadador. */
export interface SwimmerForm {
  name: string;
  isMinor: boolean;
  /** Lo escrito (solo cifras). */
  year: string;
  sex: Sex | '';
  club: string;
  guardian: string;
  consent: boolean;
}

/** El nadador que se cambia (sin él, se registra uno nuevo). */
export interface SwimmerEditing {
  player: Player;
  info: SwimmerInfo | undefined;
  priv: SwimmerPrivate | undefined;
}

/** El formulario al abrirlo: lo del nadador que se cambia, o vacío (menor si la liga admite menores). */
export function swimmerFormStart(editing: SwimmerEditing | null | undefined, o: { minorsOk: boolean; fixedClub?: string }): SwimmerForm {
  return {
    name: editing?.player.name ?? '',
    isMinor: editing ? !!editing.player.isMinor : o.minorsOk,
    year: editing?.priv?.birthYear ? String(editing.priv.birthYear) : '',
    sex: editing?.priv?.sex ?? '',
    club: o.fixedClub ?? editing?.info?.clubId ?? '',
    guardian: editing?.priv?.guardianName ?? '',
    consent: !!editing?.priv?.consentAt,
  };
}

/**
 * Si se puede guardar: el nombre (de 1 a 60), el año (de 1900 a este año), lo de la edad (minorAgeProblem), los menores
 * con año, sexo y permiso, y el entrenador solo en su club.
 */
export function swimmerFormCheck(
  f: SwimmerForm,
  o: { thisYear: number; editing: SwimmerEditing | null | undefined; minorsOk: boolean; fixedClub?: string },
): { birthYear: number | null; badYear: boolean; ageProblem: string | null; valid: boolean } {
  const birthYear = f.year ? Number(f.year) : null;
  const badYear = birthYear != null && (!Number.isInteger(birthYear) || birthYear < 1900 || birthYear > o.thisYear);
  // Con año de menor tiene que ser menor (sin cuenta); si no, la base lo rechaza.
  const ageProblem = badYear
    ? null
    : minorAgeProblem({ birthYear, year: o.thisYear, isMinor: f.isMinor, editing: !!o.editing, hasAccount: !!o.editing?.player.uid, minorsOk: o.minorsOk });
  const name = f.name.trim();
  const valid =
    name.length > 0 && name.length <= 60 && !badYear && !ageProblem && (!f.isMinor || (birthYear != null && !!f.sex && f.consent)) && (!o.fixedClub || f.club === o.fixedClub);
  return { birthYear, badYear, ageProblem, valid };
}

/** Al cambiar un nadador, solo lo que cambió (el permiso del tutor solo se da, no se quita). */
export function swimmerChanges(editing: SwimmerEditing, f: SwimmerForm, birthYear: number | null): SwimmerPatch {
  const p = editing.priv;
  return {
    ...(f.name.trim() !== editing.player.name ? { name: f.name } : {}),
    ...((f.club || null) !== (editing.info?.clubId ?? null) ? { clubId: f.club || null } : {}),
    ...(birthYear !== (p?.birthYear ?? null) ? { birthYear } : {}),
    ...((f.sex || null) !== (p?.sex ?? null) ? { sex: f.sex || null } : {}),
    ...((f.guardian.trim() || null) !== (p?.guardianName ?? null) ? { guardianName: f.guardian || null } : {}),
    ...(f.consent && !p?.consentAt ? { consent: true } : {}),
  };
}

// ---------- Clubes ----------

/** El club se puede guardar: nombre de 1 a 60 y sigla de hasta 8. */
export const clubValid = (name: string, short: string) => name.trim().length > 0 && name.trim().length <= 60 && short.trim().length <= 8;

/** El título de la lista: «1 club», «3 clubes». */
export const clubsTitle = (n: number) => (n === 1 ? '1 club' : `${n} clubes`);

/** La línea de un club: cuántos nadadores y quién lo entrena. */
export const clubLine = (count: number, coachName: string | null) => `${count === 1 ? '1 nadador' : `${count} nadadores`}${coachName != null ? ` · Entrena: ${coachName}` : ''}`;

/** Lo que la liga pone a cada encuentro nuevo, como se edita. */
export interface RulesForm {
  pool: 25 | 50;
  lanes: number;
  points: string;
  ageGroups: AgeScheme;
}

/** ¿Cambió algo de las reglas? */
export const rulesDirty = (f: RulesForm, r: { pool: 25 | 50; lanes: number; points: number[]; ageGroups: AgeScheme }) =>
  f.pool !== r.pool || f.lanes !== r.lanes || f.points !== r.points.join('-') || f.ageGroups !== r.ageGroups;
