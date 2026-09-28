/**
 * Inscripción «Me apunto» de los americanos y los torneos de raqueta (20260927001400_inscripciones.sql).
 *
 * - Los ajustes van en events.config.signup: {open, cap, until, rev}. `cap` = cupo (en el torneo, por
 *   categoría; null = sin cupo, hasta 64); `until` = fecha límite (ISO); `rev` lo lleva la base: la
 *   configuración se guarda con el `rev` que se leyó (así, si alguien se apuntó mientras tanto, no se pierde).
 * - La lista es la de siempre (config.players de la noche; categories[].pairs del torneo) y cuenta para el cupo
 *   (también los que el admin agregó a mano). La espera vive en event_signups, en turno.
 * Puro: sin React ni backend.
 */
import type { EventSignup, SignupStatus } from '../../../../lib/data/racket';
import { localParts, timeLabel } from './time';

export interface SignupSettings {
  /** Se pueden apuntar (el admin la cierra con false). */
  open: boolean;
  /** Cupo (2–64); null = sin cupo (la lista llega hasta 64). */
  cap: number | null;
  /** Fecha límite (ISO) o null. */
  until: string | null;
  /** Versión de la lista (la sube la base). */
  rev: number;
}

/** Lo más que aguanta la lista (sin cupo). */
export const SIGNUP_MAX = 64;
export const SIGNUP_MIN_CAP = 2;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Los ajustes de events.config.signup (null si el evento no tiene inscripción). */
export function parseSignup(raw: unknown): SignupSettings | null {
  if (!isObj(raw)) return null;
  const cap = typeof raw.cap === 'number' && Number.isInteger(raw.cap) && raw.cap >= SIGNUP_MIN_CAP && raw.cap <= SIGNUP_MAX ? raw.cap : null;
  const until = typeof raw.until === 'string' && Number.isFinite(Date.parse(raw.until)) ? raw.until : null;
  const rev = typeof raw.rev === 'number' && Number.isFinite(raw.rev) ? Math.max(0, Math.trunc(raw.rev)) : 0;
  return { open: raw.open === true, cap, until, rev };
}

/** Lo que se guarda (con el `rev` que se leyó). */
export const signupJson = (s: SignupSettings): Record<string, unknown> => ({ open: s.open, cap: s.cap, until: s.until, rev: s.rev });

/** Inscripción nueva: abierta, con ese cupo y sin fecha límite. */
export const newSignup = (cap: number | null): SignupSettings => ({ open: true, cap: cap == null ? null : clampCap(cap), until: null, rev: 0 });

export const clampCap = (n: number) => Math.min(SIGNUP_MAX, Math.max(SIGNUP_MIN_CAP, Math.round(n)));

/** Tope de la lista: el cupo o 64. */
export const signupCap = (s: SignupSettings | null | undefined) => s?.cap ?? SIGNUP_MAX;

/**
 * En qué está la inscripción: abierta; cerrada por el admin; pasó la fecha límite; ya empezó (la noche publicó
 * una ronda o se cerró; el torneo armó grupos o cuadro); o el evento ya pasó. Como join_signup en la base.
 */
export type SignupPhase = 'open' | 'closed' | 'deadline' | 'started' | 'past';

export function signupPhase(s: SignupSettings, o: { started: boolean; date: string; today: string; now: number }): SignupPhase {
  if (o.started) return 'started';
  if (o.date && o.date < o.today) return 'past';
  if (!s.open) return 'closed';
  if (s.until && Date.parse(s.until) <= o.now) return 'deadline';
  return 'open';
}

export const PHASE_TEXT: Record<SignupPhase, string> = {
  open: 'Inscripción abierta',
  closed: 'Inscripción cerrada',
  deadline: 'Se cerró la inscripción',
  started: 'Ya empezó',
  past: 'Ya pasó',
};

/** La espera todavía puede subir sola (se baja alguien o el admin sube el cupo): antes de empezar y antes del día. */
export const waitlistMoves = (phase: SignupPhase) => phase !== 'started' && phase !== 'past';

/** La lista de una categoría (o de la noche) con la espera y lo que queda libre. */
export interface SignupList {
  /** En la lista, en su orden (inscritos en la app y a mano). */
  listed: string[];
  /** Tope (cupo o 64). */
  cap: number;
  /** Cupos libres. */
  free: number;
  /** En espera, en turno. */
  waiting: EventSignup[];
  /** Los de la lista que se apuntaron en la app. */
  fromApp: Set<string>;
}

/** Lista de la noche (category = null) o de una categoría del torneo. */
export function signupList(listed: readonly string[], rows: readonly EventSignup[], settings: SignupSettings | null, category: string | null = null): SignupList {
  const cap = signupCap(settings);
  const inCategory = (r: EventSignup) => category == null || r.category === category;
  return {
    listed: [...listed],
    cap,
    free: Math.max(0, cap - listed.length),
    waiting: rows.filter((r) => r.status === 'wait' && inCategory(r)).sort((a, b) => a.queue - b.queue),
    fromApp: new Set(rows.filter((r) => r.status === 'in').map((r) => r.entrantId)),
  };
}

/** Dónde estoy: en la lista (puesto) o en la espera (turno). */
export interface MySignup {
  entrant: string;
  status: SignupStatus;
  /** Puesto en la lista, o turno en la espera (desde 1). */
  position: number;
  category: string | null;
}

/**
 * Mi inscripción: la de un inscrito que es mío (`mine`: mi jugador o una pareja donde juego). La lista manda
 * (el admin pudo agregarme a mano); si no, la espera.
 */
export function mySignup(
  lists: readonly { category: string | null; listed: readonly string[] }[],
  rows: readonly EventSignup[],
  mine: (entrant: string) => boolean,
): MySignup | null {
  for (const l of lists) {
    const i = l.listed.findIndex(mine);
    if (i >= 0) return { entrant: l.listed[i], status: 'in', position: i + 1, category: l.category };
  }
  const w = rows.find((r) => r.status === 'wait' && mine(r.entrantId));
  if (!w) return null;
  const position = rows.filter((r) => r.status === 'wait' && r.category === w.category && r.queue <= w.queue).length;
  return { entrant: w.entrantId, status: 'wait', position, category: w.category };
}

/** «12 de 16 cupos · 3 en espera» / «12 apuntados». */
export function signupCount(list: Pick<SignupList, 'listed' | 'waiting'>, settings: SignupSettings | null, words: readonly [string, string] = ['apuntado', 'apuntados']): string {
  const n = list.listed.length;
  const head = settings?.cap != null ? `${n} de ${settings.cap} ${settings.cap === 1 ? 'cupo' : 'cupos'}` : `${n} ${n === 1 ? words[0] : words[1]}`;
  return list.waiting.length ? `${head} · ${list.waiting.length} en espera` : head;
}

/** «jue 8 oct, 6:00 pm» en la zona de la liga. */
export function deadlineText(until: string | null | undefined, tz?: string | null): string {
  const p = localParts(until, tz);
  if (!p) return '';
  const [y, m, d] = p.date.split('-').map(Number);
  const day = new Intl.DateTimeFormat('es-DO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
  return `${day.replace(/\./g, '').replace(/,/g, '')}, ${timeLabel(p.time)}`;
}

/** Línea corta para las listas de eventos: «Me apunto: 12 de 16 cupos» (null si no hay inscripción abierta). */
export function signupBlurb(settings: SignupSettings | null, count: number, phase: SignupPhase): string | null {
  if (!settings || phase !== 'open') return null;
  return settings.cap != null ? `inscripción: ${count} de ${settings.cap}` : `inscripción abierta: ${count}`;
}

/** Qué decir cuando «Me apunto» falla por algo de la inscripción (null = el error de siempre). */
export function signupErrorText(e: unknown): string | null {
  const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  const code = msg.trim().split(/[\s:]/)[0];
  if (code === 'cerrado') return 'La inscripción ya se cerró (o el evento ya empezó).';
  if (code === 'duplicado') return 'Tú o tu compañero ya están apuntados en este evento.';
  if (code === 'no_permitido') return 'Esta liga es privada: pide el código de invitación para unirte.';
  if (code === 'invalido') return 'No se pudo con esa pareja o categoría. Revisa y prueba otra vez.';
  return null;
}

/** Texto del resultado de «Me apunto». */
export function joinedText(r: { status: SignupStatus; position: number }): string {
  return r.status === 'in' ? `¡Listo! Estás en la lista (n.º ${r.position})` : `La lista está llena: quedaste n.º ${r.position} en la espera. Si se libera un cupo, entras solo y te avisamos.`;
}
