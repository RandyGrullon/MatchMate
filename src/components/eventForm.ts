import type { EventInput } from '../lib/data/events';
import { nextTuesday, toIsoDate } from '../lib/format';
import { DEFAULT_CUTS } from '../lib/stats';
import type { BowlingEvent, EventType } from '../lib/types';

/**
 * El formulario de la práctica o del torneo del boliche (EventFormModal de la web y EventFormSheet de la app), sin
 * pantalla: con qué nace un evento nuevo, lo de un evento que se edita, lo que se guarda (dentro de los límites de la
 * base), el ejemplo del handicap y el título de la hoja. Pruebas en eventForm.test.ts.
 */

/** Un evento nuevo. El torneo nace con la regla del dueño: individual con handicap y equipos por scratch. */
export const defaults = (type: EventType, now: Date = new Date()): EventInput => ({
  type,
  name: '',
  date: type === 'practica' ? nextTuesday(now) : toIsoDate(now),
  games: 3,
  // Regla del torneo 2025: (230 − promedio) × 80%.
  hcpBase: type === 'torneo' ? 230 : 0,
  hcpPercent: type === 'torneo' ? 80 : 0,
  individualRankBy: 'hcp',
  teamRankBy: 'scratch',
  categoryCuts: DEFAULT_CUTS,
  teamSize: type === 'torneo' ? 3 : 0,
  announcement: '',
});

/** Lo que el formulario muestra de un evento que se edita (lo que falta, con lo de siempre). */
export function eventFormOf(event: BowlingEvent): EventInput {
  return {
    type: event.type,
    name: event.name,
    date: event.date,
    games: event.games,
    hcpBase: event.hcpBase,
    hcpPercent: event.hcpPercent,
    individualRankBy: event.individualRankBy ?? 'hcp',
    teamRankBy: event.teamRankBy ?? 'scratch',
    categoryCuts: event.categoryCuts ?? DEFAULT_CUTS,
    teamSize: event.teamSize ?? (event.type === 'torneo' ? 3 : 0),
    announcement: event.announcement ?? '',
  };
}

/** Lo que se guarda: el nombre sin espacios de más y cada número dentro de lo que acepta la base. */
export function cleanEventInput(form: EventInput): EventInput {
  return {
    ...form,
    name: form.name.trim(),
    games: Math.min(10, Math.max(1, Math.round(form.games) || 1)),
    hcpBase: Math.max(0, Math.round(form.hcpBase) || 0),
    hcpPercent: Math.min(100, Math.max(0, Math.round(form.hcpPercent) || 0)),
    teamSize: Math.min(10, Math.max(0, Math.round(form.teamSize) || 0)),
    announcement: form.announcement.trim().slice(0, 500),
  };
}

/** El handicap por juego de un promedio de ejemplo (165): «Ej.: promedio 165 → 52 pinos». */
export const hcpExample = (form: Pick<EventInput, 'hcpBase' | 'hcpPercent'>, average = 165) =>
  Math.max(0, Math.floor((((form.hcpBase || 0) - average) * (form.hcpPercent || 0)) / 100));

/** El título de la hoja: «Configurar» al editar; si no, «Nuevo torneo» o «Nueva práctica». */
export const eventFormTitle = (editing: boolean, type: EventType) => (editing ? 'Configurar' : type === 'torneo' ? 'Nuevo torneo' : 'Nueva práctica');

/** El aviso al guardar: «Cambios guardados», «Torneo creado» o «Práctica creada». */
export const eventSavedText = (editing: boolean, type: EventType) => (editing ? 'Cambios guardados' : type === 'torneo' ? 'Torneo creado' : 'Práctica creada');

/** El nombre de ejemplo del campo Nombre: «Torneo 2026» o «Práctica del martes». */
export const eventNamePlaceholder = (form: Pick<EventInput, 'type' | 'date'>) => (form.type === 'torneo' ? `Torneo ${form.date.slice(0, 4)}` : 'Práctica del martes');
