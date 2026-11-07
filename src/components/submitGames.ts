import { parseDate } from '../lib/format';
import { practiceClosed } from '../lib/live';
import type { BowlingEvent, Entry } from '../lib/types';

/**
 * «Enviar mis juegos» sin pantalla (SubmitGamesModal de la web y la pantalla de enviar de la app): qué eventos salen en
 * «¿Dónde jugaste?», con cuál se abre, «Otro día (elegir fecha)» y lo que dice debajo de la fecha. Pruebas en
 * submitGames.test.ts.
 */

/** Opción para subir juegos de un día sin evento creado (también es el borrador de «Otro día»). */
export const BY_DATE = '__fecha__';

/** Juegos del borrador con al menos los del evento (J1…Jn). */
export function padded(values: readonly string[] | undefined, games = 3): string[] {
  return Array.from({ length: Math.max(games, values?.length ?? 0) }, (_, i) => values?.[i] ?? '');
}

/**
 * Los eventos de «¿Dónde jugaste?»: los de los últimos 120 días, los que ya tienen juegos tuyos y el pedido. Una
 * práctica se anota hasta el final del día siguiente (en la zona de la liga); después solo el admin.
 */
export function submitEventChoices({
  events,
  myEntries,
  preferEventId,
  leagueToday,
  isAdmin,
  now,
}: {
  events: readonly BowlingEvent[];
  myEntries: readonly Pick<Entry, 'eventId'>[];
  preferEventId?: string | null;
  leagueToday: string;
  isAdmin: boolean;
  /** Ahora, en milisegundos. */
  now: number;
}): BowlingEvent[] {
  const cutoff = now - 120 * 86400_000;
  const open = (e: BowlingEvent) => isAdmin || e.type !== 'practica' || !practiceClosed(e.date, leagueToday);
  return events.filter((e) => open(e) && (parseDate(e.date).getTime() >= cutoff || myEntries.some((m) => m.eventId === e.id) || e.id === preferEventId));
}

/**
 * Con qué se abre: el evento pedido; si no, donde se quedó el último borrador; si no, el más reciente que ya se jugó
 * (o «Otro día»).
 */
export function openingEventId(recent: readonly BowlingEvent[], { preferEventId, lastDraftEventId, today }: { preferEventId?: string | null; lastDraftEventId?: string | null; today: string }): string {
  const preferred = preferEventId ? recent.find((e) => e.id === preferEventId) : undefined;
  if (preferred) return preferred.id;
  if (lastDraftEventId === BY_DATE) return BY_DATE;
  return (recent.find((e) => e.id === lastDraftEventId) ?? recent.find((e) => e.date <= today))?.id ?? BY_DATE;
}

/** «Otro día»: si la fecha vale, si ya cerró para quien no es admin y si ese día ya hay práctica o torneo. */
export function byDateCheck({
  date,
  today,
  leagueToday,
  isAdmin,
  events,
}: {
  date: string;
  today: string;
  leagueToday: string;
  isAdmin: boolean;
  events: readonly BowlingEvent[];
}): { ok: boolean; closed: boolean; sameDay: BowlingEvent | undefined } {
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date);
  // Quien no es admin envía hasta los de ayer (después la base responde `cerrado`).
  const closed = !isAdmin && valid && practiceClosed(date, leagueToday);
  return { ok: valid && date <= today && !closed, closed, sameDay: events.find((e) => e.date === date) };
}

/** Lo que dice debajo de «¿Qué día jugaste?». `sameDayTitle`: el nombre de lo que ya hay ese día. */
export function byDateHint(closed: boolean, sameDayTitle: string | null): string {
  if (closed) return 'Ese día ya cerró: tú envías los juegos de hoy o de ayer. Para otro día, pídeselo al admin.';
  if (sameDayTitle) return `Ese día hay ${sameDayTitle}; el admin pondrá tus juegos ahí.`;
  return 'El admin pondrá tus juegos en la práctica de ese día (se crea si no existe).';
}

/** La opción de «¿Dónde jugaste?» para un día sin evento. */
export const BY_DATE_LABEL = 'Otro día (elegir fecha)';
