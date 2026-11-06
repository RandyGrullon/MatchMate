/**
 * Lo que no es pantalla de «Suspender un día» (SuspendDay.tsx en la web y la hoja de la app del teléfono,
 * movil/src/components/seasonAdmin): hoy en la zona de la liga, a quién le llega el aviso, qué falta para poder
 * suspender y el mensaje si falla. Funciones puras.
 */
import { DEFAULT_TZ } from '../../lib/calendar';
import { suspendChanges, suspendable, type SuspendPreview } from '../../lib/data/organizer';
import { asBackendError } from '../../lib/db/errors';
import { saveErrorMessage } from '../../lib/errorText';
import { localNow } from '../../lib/reminders';

/** Una fecha 'YYYY-MM-DD'. */
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Hoy en la zona de la liga ('YYYY-MM-DD'). */
export function leagueToday(tz: string | null | undefined, now: Date = new Date()): string {
  try {
    return localNow(now, tz || DEFAULT_TZ).today;
  } catch {
    return localNow(now, DEFAULT_TZ).today;
  }
}

/** A quién le llega el aviso: «todo el torneo» o «toda la liga». */
export const suspendAudience = (kind: string | null | undefined): string => (kind === 'torneo' ? 'todo el torneo' : 'toda la liga');

export interface SuspendFormInput {
  /** El día que se suspende ('YYYY-MM-DD'). */
  date: string;
  reason: string;
  /** La nueva fecha ('' = todavía no se sabe). */
  newDate: string;
  /** Hoy en la zona de la liga. */
  today: string;
  /** Lo que hay ese día (suspend_day_preview; null mientras carga). */
  preview: SuspendPreview | null | undefined;
  busy: boolean;
}

export interface SuspendFormState {
  validDate: boolean;
  /** La nueva fecha, si se entiende. */
  target: string | null;
  /** La nueva fecha es de antes de hoy o es el mismo día que se suspende. */
  badNewDate: boolean;
  /** El motivo sin los espacios de los lados. */
  why: string;
  /** Lo que se puede cambiar ese día. */
  n: number;
  /** Lo que de verdad cambia así (0 = suspender no cambiaría nada y no sale el aviso). */
  changes: number;
  canSend: boolean;
}

/**
 * Cómo está el formulario de suspender: la nueva fecha (desde hoy y distinta del día), el motivo y si se puede mandar.
 * Sin nueva fecha, lo que tiene inscritos se queda: si es lo único, suspender no cambiaría nada (ni sale el aviso).
 */
export function suspendForm(input: SuspendFormInput): SuspendFormState {
  const validDate = ISO_DATE.test(input.date);
  const p = input.preview ?? null;
  const target = input.newDate && ISO_DATE.test(input.newDate) ? input.newDate : null;
  const badNewDate = !!target && (target < input.today || target === input.date);
  const why = input.reason.trim();
  const n = suspendable(p);
  const changes = suspendChanges(p, target);
  const canSend = validDate && !!why && !!p && changes > 0 && !badNewDate && !input.busy;
  return { validDate, target, badNewDate, why, n, changes, canSend };
}

/** El mensaje si suspend_day falla. */
export function suspendErrorText(e: unknown): string {
  return asBackendError(e)?.kind === 'validation' ? 'Revisa el motivo y la nueva fecha (desde hoy y distinta del día que se suspende).' : saveErrorMessage(e);
}
