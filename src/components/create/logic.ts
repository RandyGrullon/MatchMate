/**
 * Lo que no es pantalla del asistente «Crear una liga» (se prueba sin navegador): los pasos de cada cosa, las horas del
 * selector, la frase de cuándo juegan, si se puede seguir y los datos que se mandan a create_league / create_tournament
 * (los mismos que armaba el formulario de antes, LeagueFormModal).
 */
import type { LeagueInput } from '../../lib/data';
import { parseDate } from '../../lib/format';
import { formatSchedule, formatTime, WEEKDAYS } from '../../lib/schedule';
import type { LeagueKind } from '../../lib/types';
import { sportMeta } from '../../sports/registry';
import { DEFAULT_TZ, withMinors } from '../league/logic';

export type WizardStep = 'nombre' | 'lugar' | 'temporada' | 'invitar';

/** Los pasos: una liga en 4 (Nombre · Día y lugar · Temporada · Invitar); un torneo sin liga en 3 (no tiene temporada). */
export function wizardSteps(kind: LeagueKind): { key: WizardStep; label: string }[] {
  return kind === 'torneo'
    ? [
        { key: 'nombre', label: 'Nombre' },
        { key: 'lugar', label: 'Fecha y lugar' },
        { key: 'invitar', label: 'Invitar' },
      ]
    : [
        { key: 'nombre', label: 'Nombre' },
        { key: 'lugar', label: 'Día y lugar' },
        { key: 'temporada', label: 'Temporada' },
        { key: 'invitar', label: 'Invitar' },
      ];
}

/** El paso en que se crea (el anterior a Invitar): ahí el botón dice «Crear liga» o «Crear torneo». */
export const createStep = (kind: LeagueKind): WizardStep => (kind === 'torneo' ? 'lugar' : 'temporada');

/** Horas del selector: de 6:00 am a 11:45 pm, cada 15 minutos ('HH:MM'). */
export const TIME_OPTIONS: readonly { value: string; label: string }[] = Array.from({ length: (24 - 6) * 4 }, (_, i) => {
  const mins = 6 * 60 + i * 15;
  const value = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  return { value, label: formatTime(value) };
});

/** «Cada cuánto»: cada semana (los días elegidos) o sin día fijo (cada fecha se crea desde la liga). */
export type Frequency = 'semana' | 'libre';

/** «todos los martes», «todos los martes y jueves». */
function everyDays(days: readonly number[]): string {
  const names = [...new Set(days)]
    .filter((d) => d >= 0 && d < 7)
    .sort((a, b) => a - b)
    .map((d) => `${WEEKDAYS[d].toLowerCase()}${WEEKDAYS[d].endsWith('s') ? '' : 's'}`);
  if (!names.length) return '';
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
  return `todos los ${list}`;
}

/**
 * La frase de abajo del paso «Día y lugar»: `strong` va en negrita («Jugarán **todos los martes, 7:30 pm**»). Sin día
 * todavía, qué falta; sin día fijo, que cada fecha se avisa desde la liga.
 */
export function scheduleSummary(days: readonly number[], time: string, freq: Frequency): { before: string; strong: string; after?: string } {
  const at = formatTime(time);
  if (freq === 'libre') return { before: 'Sin día fijo: ', strong: at ? `cada fecha a las ${at}` : 'cada fecha la creas en la liga' };
  if (!days.length) return { before: 'Elige el día (o los días) en que juegan.', strong: '' };
  return { before: 'Jugarán ', strong: [everyDays(days), at].filter(Boolean).join(', ') };
}

/** El texto que se guarda en la liga («Martes · 7:30 pm», el de siempre): sin día fijo, solo la hora. */
export const scheduleText = (days: readonly number[], time: string, freq: Frequency) => formatSchedule(freq === 'libre' ? [] : [...days], time);

const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** «sábado 24 de octubre» (el día del torneo). */
export function longDay(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const d = parseDate(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${WEEKDAYS[(d.getDay() + 6) % 7].toLowerCase()} ${d.getDate()} de ${MONTHS_LONG[d.getMonth()]}`;
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];

/** «del 7 oct al 31 dic» (con el año solo si no es el mismo: «del 1 sept de 2026 al 31 ene de 2027»). */
export function seasonRange(start: string, end: string): string {
  const a = parseDate(start);
  const b = parseDate(end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return '';
  const same = a.getFullYear() === b.getFullYear();
  const day = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}${same ? '' : ` de ${d.getFullYear()}`}`;
  return `del ${day(a)} al ${day(b)}`;
}

/** Lo que el asistente va llenando. */
export interface WizardForm {
  name: string;
  visibility: LeagueInput['visibility'];
  venue: string;
  days: number[];
  time: string;
  freq: Frequency;
  /** Torneo sin liga: su día. */
  date: string;
  hasSeason: boolean;
  seasonStart: string;
  seasonEnd: string;
  requirePhoto: boolean;
  contactName: string;
  contactPhone: string;
  tz: string;
  hasMinors: boolean;
}

/** Lo de entrada: privada si es liga y pública si es torneo, con foto del marcador, y el contacto es quien la crea. */
export function emptyForm(kind: LeagueKind, contactName: string, today: string): WizardForm {
  return {
    name: '',
    visibility: kind === 'torneo' ? 'public' : 'private',
    venue: '',
    days: [],
    time: '',
    freq: 'semana',
    date: today,
    hasSeason: false,
    seasonStart: '',
    seasonEnd: '',
    requirePhoto: true,
    contactName,
    contactPhone: '',
    tz: DEFAULT_TZ,
    hasMinors: false,
  };
}

/** Temporada por defecto al activarla: desde hoy hasta el 31 de diciembre. */
export const defaultSeason = (today: string) => ({ seasonStart: today, seasonEnd: `${today.slice(0, 4)}-12-31` });

/** ¿Se puede pasar al paso siguiente? Nombre: con nombre. Lugar del torneo: con fecha. Temporada: fechas en orden. */
export function canAdvance(step: WizardStep, kind: LeagueKind, f: WizardForm): boolean {
  if (step === 'nombre') return f.name.trim().length > 0;
  if (step === 'lugar') return kind !== 'torneo' || /^\d{4}-\d{2}-\d{2}$/.test(f.date);
  if (step === 'temporada') return !f.hasSeason || (!!f.seasonStart && !!f.seasonEnd && f.seasonEnd >= f.seasonStart);
  return true;
}

/**
 * Los datos para crear, como los armaba el formulario de antes: sin espacios de más, la temporada solo si se activó, el
 * teléfono solo con dígitos, sin foto obligatoria en los deportes sin foto, y con menores, privada y sin foto. El torneo
 * nuevo no manda menores ni zona horaria (create_tournament no las recibe).
 */
export function wizardInput(kind: LeagueKind, sport: string, f: WizardForm): LeagueInput & { sport: string } {
  const torneo = kind === 'torneo';
  const data = withMinors({
    name: f.name.trim(),
    kind,
    visibility: f.visibility,
    venue: f.venue.trim(),
    schedule: torneo ? '' : scheduleText(f.days, f.time, f.freq),
    seasonStart: !torneo && f.hasSeason ? f.seasonStart : '',
    seasonEnd: !torneo && f.hasSeason ? f.seasonEnd : '',
    contactName: f.contactName.trim(),
    contactPhone: f.contactPhone.replace(/[^\d+]/g, ''),
    requirePhoto: sportMeta(sport)?.photos === false ? false : f.requirePhoto,
    hasMinors: torneo ? false : f.hasMinors,
    tz: f.tz || DEFAULT_TZ,
  });
  return torneo ? { ...data, hasMinors: undefined, tz: undefined, sport } : { ...data, sport };
}
