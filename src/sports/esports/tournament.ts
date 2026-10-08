/**
 * Lo que se calcula al leer un torneo (docs/esports.md §3.7): la fase según el estado y la hora (que se recibe, nunca
 * se lee del sistema), si se puede inscribir o hacer check-in, y textos cortos del formato.
 */
import { modeLabel, type GameId, type Mode } from './catalog';
import type { StageKind } from './brackets';
import { ENTRY_LABEL, FORMAT_LABEL, type EntryType, type Format } from './settings';

export type Phase = 'soon' | 'registration' | 'checkin' | 'closed' | 'live' | 'finished' | 'cancelled';
export interface PhaseInput {
  status: 'registration' | 'live' | 'finished' | 'cancelled';
  startsAt: string;
  registrationOpensAt: string | null;
  registrationClosesAt: string;
  checkinMinutes: number | null;
}

/** El check-in sigue abierto hasta 30 minutos después del inicio. */
const CHECKIN_AFTER_MS = 30 * 60_000;

const at = (iso: string | null | undefined): number => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : NaN;
};

function windows(t: PhaseInput, now: number) {
  const opens = at(t.registrationOpensAt);
  const closes = at(t.registrationClosesAt);
  const start = at(t.startsAt);
  const beforeOpen = Number.isFinite(opens) && now < opens;
  const regOpen = !beforeOpen && (!Number.isFinite(closes) || now < closes);
  const cm = t.checkinMinutes;
  const inCheckin = cm != null && cm > 0 && Number.isFinite(start) && now >= start - cm * 60_000 && now < start + CHECKIN_AFTER_MS;
  return { beforeOpen, regOpen, inCheckin };
}

/**
 * Fase del torneo: cancelado, terminado o en curso, el estado. En inscripción: antes de que abra 'soon'; hasta que
 * cierra 'registration'; después, en la ventana de check-in (desde `startsAt − checkinMinutes` hasta `startsAt + 30
 * min`) 'checkin'; si no, 'closed'. Si la inscripción y el check-in conviven, se ve 'registration' (y se puede hacer
 * check-in igual: `canCheckIn`); 'checkin' gana cuando la inscripción ya cerró.
 */
export function tournamentPhase(t: PhaseInput, now: number): Phase {
  if (t.status !== 'registration') return t.status;
  const w = windows(t, now);
  if (w.beforeOpen) return 'soon';
  if (w.regOpen) return 'registration';
  if (w.inCheckin) return 'checkin';
  return 'closed';
}

/** Se puede inscribir: fase 'registration' (o 'checkin' con la inscripción todavía abierta). */
export const canRegister = (t: PhaseInput, now: number): boolean => {
  const phase = tournamentPhase(t, now);
  return phase === 'registration' || (phase === 'checkin' && windows(t, now).regOpen);
};

/** Se puede hacer check-in (capitán o individual): torneo en inscripción, con check-in y dentro de la ventana. */
export const canCheckIn = (t: PhaseInput, now: number): boolean => t.status === 'registration' && windows(t, now).inCheckin;

export const PHASE_TEXT: Record<Phase, string> = {
  soon: 'Pronto',
  registration: 'Inscripción abierta',
  checkin: 'Check-in abierto',
  closed: 'Inscripción cerrada',
  live: 'En curso',
  finished: 'Terminado',
  cancelled: 'Cancelado',
};

/** «5 contra 5 · Doble eliminación · Solo equipos». */
export function formatLine(t: { game: GameId; mode: Mode; format: Format; entryType: EntryType }): string {
  return `${modeLabel(t.mode)} · ${FORMAT_LABEL[t.format]} · ${ENTRY_LABEL[t.entryType]}`;
}

/** Las fases que tiene el formato: simple/doble → ['bracket']; grupos → ['groups', 'playoffs']; liga → ['league']; BR → []. */
export function stagesFor(format: Format, _playoffs?: 'single' | 'double'): StageKind[] {
  switch (format) {
    case 'single_elim':
    case 'double_elim':
      return ['bracket'];
    case 'groups_playoffs':
      return ['groups', 'playoffs'];
    case 'round_robin':
      return ['league'];
    default:
      return [];
  }
}
