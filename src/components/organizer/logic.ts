/**
 * Lo que no es pantalla del organizador (src/components/organizer): las secciones de «Pendientes» en palabras, la
 * línea de la tarjeta del inicio, los «primeros pasos», y el resumen de suspender un día. Funciones puras, con
 * pruebas en logic.test.ts.
 */
import { minutesLabel, zonedParts } from '../../lib/calendar';
import type { Checklist, ChecklistStep, LeaguePending, SuspendPreview, SuspendResult } from '../../lib/data/organizer';
import { formatDate, parseDate } from '../../lib/format';
import { relativeTime } from '../../lib/notifications';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// ---------- Pendientes ----------

export type PendingKey = 'submissions' | 'disputes' | 'overdue' | 'claims' | 'waitlists';

export interface PendingItemView {
  id: string;
  title: string;
  sub: string;
  url: string;
}

export interface PendingSectionView {
  key: PendingKey;
  title: string;
  hint: string;
  count: number;
  url: string;
  items: PendingItemView[];
}

/** 'martes 29 de septiembre' (como en los avisos de la base). */
export function dayWords(iso: string): string {
  const d = parseDate(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${days[d.getDay()]} ${d.getDate()} de ${months[d.getMonth()]}`;
}

/** «el martes 29 de septiembre a las 8:00 pm» de una hora ISO en la zona de la liga ('' si no hay). */
function whenText(iso: string | null, tz: string | null | undefined): string {
  const p = zonedParts(iso, tz);
  return p ? `el ${dayWords(p.date)} a las ${minutesLabel(p.minutes)}` : '';
}

const ago = (iso: string | null, now: number) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? relativeTime(t, now) : '';
};

/**
 * Las secciones de «Pendientes» que tienen algo, en el orden en que conviene atenderlas: primero lo que frena a
 * los jugadores (envíos, resultados reclamados), después lo atrasado, los reclamos y las listas de espera.
 */
export function pendingSections(p: LeaguePending | null | undefined, now: number, tz?: string | null): PendingSectionView[] {
  if (!p) return [];
  const out: PendingSectionView[] = [
    {
      key: 'submissions',
      title: 'Juegos por aprobar',
      hint: 'Los que subieron los jugadores. Revisa la foto y apruébalos para que cuenten.',
      count: p.submissions.count,
      url: p.submissions.url,
      items: p.submissions.items.map((s) => ({
        id: s.id,
        title: s.playerName,
        sub: [
          plural(s.games, 'juego', 'juegos'),
          s.eventName || (s.date ? formatDate(s.date) : ''),
          s.hasPhoto ? 'con foto' : 'sin foto',
          ago(s.sentAt, now),
        ]
          .filter(Boolean)
          .join(' · '),
        url: p.submissions.url,
      })),
    },
    {
      key: 'disputes',
      title: 'Resultados reclamados',
      hint: 'Un lado dice que el resultado no fue así. Revísalo y corrígelo o confírmalo.',
      count: p.disputes.count,
      url: p.disputes.url,
      items: p.disputes.items.map((m) => ({
        id: m.id,
        title: m.label,
        sub: [m.note ? `«${m.note}»` : '', m.disputedAt ? `reclamado ${ago(m.disputedAt, now)}` : ''].filter(Boolean).join(' · '),
        url: m.url,
      })),
    },
    {
      key: 'overdue',
      title: 'Partidos sin resultado',
      hint: 'Ya pasó la hora y nadie anotó el resultado. Anótalo, aplázalo o anúlalo.',
      count: p.overdue.count,
      url: p.overdue.url,
      items: p.overdue.items.map((m) => {
        const when = whenText(m.scheduledAt, tz);
        const state = m.status === 'suspended' ? 'Suspendido' : m.status === 'live' ? 'Se quedó en juego' : 'Era';
        return { id: m.id, title: m.label, sub: when ? `${state} ${when}` : state, url: m.url };
      }),
    },
    {
      key: 'claims',
      title: 'Reclamos de jugadores',
      hint: 'Cuentas que dicen ser un jugador de la lista. Al aprobar, sus juegos quedan juntos.',
      count: p.claims.count,
      url: p.claims.url,
      items: p.claims.items.map((c) => ({
        id: c.id,
        title: `${c.claimantName} dice que es ${c.playerName}`,
        sub: [c.note ? `«${c.note}»` : '', ago(c.requestedAt, now)].filter(Boolean).join(' · '),
        url: p.claims.url,
      })),
    },
    {
      key: 'waitlists',
      title: 'Listas de espera',
      hint: 'Eventos que se llenaron y tienen gente esperando un cupo.',
      count: p.waitlists.count,
      url: p.waitlists.url,
      items: p.waitlists.items.map((w) => ({
        id: w.eventId,
        title: w.name,
        sub: [plural(w.waiting, 'en espera', 'en espera'), w.date ? dayWords(w.date) : ''].filter(Boolean).join(' · '),
        url: w.url,
      })),
    },
  ];
  return out.filter((s) => s.count > 0);
}

const SHORT: Record<PendingKey, [string, string]> = {
  submissions: ['juego por aprobar', 'juegos por aprobar'],
  disputes: ['resultado reclamado', 'resultados reclamados'],
  overdue: ['partido sin resultado', 'partidos sin resultado'],
  claims: ['reclamo por revisar', 'reclamos por revisar'],
  waitlists: ['lista de espera', 'listas de espera'],
};

/**
 * La línea de la tarjeta del inicio: «2 juegos por aprobar · 1 resultado reclamado» (hasta 3 cosas, y «y más»).
 * Sin pendientes y con los primeros pasos por hacer: «Primeros pasos: 2 de 4». Vacía si no hay nada.
 */
export function pendingLine(p: LeaguePending | null | undefined): string {
  if (!p) return '';
  const parts = (Object.keys(SHORT) as PendingKey[]).filter((k) => p[k].count > 0).map((k) => plural(p[k].count, ...SHORT[k]));
  if (parts.length) return parts.length > 3 ? `${parts.slice(0, 3).join(' · ')} y más` : parts.join(' · ');
  const c = p.checklist;
  return c && !c.complete ? `Primeros pasos: ${c.done} de ${c.total}` : '';
}

/** La tarjeta del inicio sale si hay algo pendiente o faltan primeros pasos. */
export const showPendingCard = (p: LeaguePending | null | undefined) => !!p && (p.total > 0 || (!!p.checklist && !p.checklist.complete));

/**
 * Los primeros pasos con el enlace a la pestaña que sirve en esta app: invitar está en «Liga» (la invitación) y
 * los jugadores, en la pestaña de gente del deporte si tiene (Nadadores, Parejas).
 */
export function checklistSteps(c: Checklist | null | undefined, lid: string, opts: { playersTab?: string | null } = {}): ChecklistStep[] {
  if (!c) return [];
  const admin = `/l/${lid}/admin`;
  return c.steps.map((s) =>
    s.key === 'invite' ? { ...s, url: `${admin}?tab=liga` } : s.key === 'players' && opts.playersTab ? { ...s, url: `${admin}?tab=${opts.playersTab}` } : s,
  );
}

// ---------- Suspender un día ----------

/** Motivos listos (lo más común en RD). */
export function suspendReasons(sport: string | null | undefined): string[] {
  const place: Record<string, string> = { bowling: 'La bolera está cerrada', golf: 'El campo está cerrado', swimming: 'La piscina está cerrada' };
  return ['Lluvia', 'No hay luz en el lugar', place[sport ?? 'bowling'] ?? 'La cancha está ocupada', 'Muy pocos confirmaron'];
}

/** El aviso que va a salir (el mismo texto que arma la base). */
export function suspendNotice(date: string, reason: string, newDate: string | null): string {
  const why = reason.replace(/\n/g, ' ').trim().replace(/[. ]+$/, '');
  return `Se suspende el ${dayWords(date)}: ${why}. ${newDate ? `Nueva fecha: ${dayWords(newDate)}.` : 'La nueva fecha se avisará.'}`;
}

/** 3 partidos, 1 torneo de boliche… de lo que se puede cambiar ese día. */
export function suspendCounts(p: SuspendPreview): string[] {
  const c = p.counts;
  return [
    c.matches ? plural(c.matches, 'partido', 'partidos') : '',
    c.bowlingEvents ? plural(c.bowlingEvents, 'evento de boliche', 'eventos de boliche') : '',
    c.golfRounds ? plural(c.golfRounds, 'ronda de golf', 'rondas de golf') : '',
    c.swimMeets ? plural(c.swimMeets, 'encuentro de natación', 'encuentros de natación') : '',
    c.otherEvents ? plural(c.otherEvents, 'evento', 'eventos') : '',
  ].filter(Boolean);
}

/** Qué va a pasar, en frases cortas (para antes de confirmar). */
export function suspendLines(p: SuspendPreview, newDate: string | null): string[] {
  const lines: string[] = [];
  if (newDate) {
    const to = dayWords(newDate);
    if (p.withNewDate.matches) lines.push(`${plural(p.withNewDate.matches, 'partido pasa', 'partidos pasan')} al ${to}, a la misma hora.`);
    if (p.withNewDate.events) lines.push(`${plural(p.withNewDate.events, 'evento pasa', 'eventos pasan')} al ${to}.`);
  } else {
    if (p.withoutDate.postponed) lines.push(`${plural(p.withoutDate.postponed, 'partido queda aplazado', 'partidos quedan aplazados')} hasta que les pongas fecha.`);
    if (p.withoutDate.cancelled) lines.push(`${plural(p.withoutDate.cancelled, 'evento se cancela', 'eventos se cancelan')} (no tenía nadie inscrito).`);
    if (p.withoutDate.kept) lines.push(`${plural(p.withoutDate.kept, 'evento se queda', 'eventos se quedan')} en su fecha porque ya tiene gente anotada: ponle una nueva fecha para moverlo.`);
  }
  if (p.counts.locked) lines.push(`${plural(p.counts.locked, 'ya empezó o tiene resultados', 'ya empezaron o tienen resultados')}: no se toca.`);
  return lines;
}

/** El aviso de listo después de suspender. */
export function suspendDoneText(r: SuspendResult): string {
  const list = (a: string, b: string) => [a, b].filter(Boolean).join(' y ');
  const moved = list(
    r.matches.moved ? plural(r.matches.moved, 'partido', 'partidos') : '',
    r.events.moved ? plural(r.events.moved, 'evento', 'eventos') : '',
  );
  const stopped = list(
    r.matches.postponed ? plural(r.matches.postponed, 'partido aplazado', 'partidos aplazados') : '',
    r.events.cancelled ? plural(r.events.cancelled, 'evento cancelado', 'eventos cancelados') : '',
  );
  const what = r.newDate && moved ? `Pasan al ${dayWords(r.newDate)}: ${moved}` : stopped;
  if (!what && !r.announced) return 'No había nada que mover ese día; no se mandó ningún aviso.';
  const notice = r.announced
    ? r.recipients
      ? `aviso enviado a ${plural(r.recipients, 'miembro', 'miembros')}`
      : 'aviso publicado en el inicio'
    : r.skipped === 'duplicado'
      ? 'el mismo aviso ya había salido hace un momento'
      : r.skipped === 'limite'
        ? 'el aviso no salió (ya se mandaron los de hoy)'
        : 'no se mandó otro aviso (ya salió uno igual o se llegó al límite de hoy)';
  return `${what || 'Día suspendido'}; ${notice}.`;
}
