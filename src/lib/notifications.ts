import { eventLabel, formatDate, formatDateLong, parseDate } from './format';
import type { LeagueFeed } from './data';
import type { League } from './types';

export type NoticeKind =
  | 'torneo'
  | 'torneo-hoy'
  | 'practica'
  | 'aprobado'
  | 'rechazado'
  | 'por-aprobar'
  | 'reaccion'
  | 'comentario'
  | 'sugerencia';

/** Un aviso de la campana: qué pasó, en qué liga y a dónde lleva. */
export interface Notice {
  id: string;
  kind: NoticeKind;
  title: string;
  body: string;
  lid: string;
  leagueName: string;
  /** Liga o torneo sin liga. */
  leagueKind: 'liga' | 'torneo';
  private: boolean;
  to: string;
  /** Milisegundos: para ordenar y saber si es nuevo. */
  time: number;
}

const DAY = 86400_000;
const ms = (t: { toMillis(): number } | null | undefined, fallback: number) => (t && typeof t.toMillis === 'function' ? t.toMillis() : fallback);
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
/**
 * "Pedro", "Pedro y Ana", "Pedro y 3 más" (el más reciente primero). Cuenta personas (cuentas), no nombres:
 * dos Pedros distintos son dos. Devuelve también cuántas son (para "felicitó" o "felicitaron").
 */
function people(list: { uid: string; name: string }[]): { who: string; count: number } {
  const byUid = [...new Map(list.map((x) => [x.uid, firstName(x.name)] as const)).values()];
  const who = byUid.length === 1 ? byUid[0] : byUid.length === 2 ? `${byUid[0]} y ${byUid[1]}` : `${byUid[0]} y ${byUid.length - 1} más`;
  return { who, count: byUid.length };
}
/** Más reciente primero; lo que todavía no tiene hora del servidor, arriba. */
const newestFirst = <T extends { createdAt?: { toMillis(): number } | null }>(list: T[], now: number) =>
  [...list].sort((a, b) => ms(b.createdAt, now) - ms(a.createdAt, now));
/** Link al juego en "Juegos" (se abre con sus me gusta y comentarios). */
export const postUrl = (lid: string, entryId: string) => `/l/${lid}/juegos?juego=${encodeURIComponent(entryId)}`;

/**
 * Arma los avisos a partir de lo que pasa en las ligas de la cuenta.
 * `today` es 'YYYY-MM-DD' y `now` en milisegundos (se pasan para poder probarlo).
 */
export function buildNotices(feeds: LeagueFeed[], leagues: League[], today: string, now: number): Notice[] {
  const byId = new Map(leagues.map((l) => [l.id, l]));
  const out: Notice[] = [];
  const startOfToday = parseDate(today).getTime();
  const weekAhead = new Date(startOfToday + 7 * DAY);
  const inAWeek = `${weekAhead.getFullYear()}-${String(weekAhead.getMonth() + 1).padStart(2, '0')}-${String(weekAhead.getDate()).padStart(2, '0')}`;

  for (const feed of feeds) {
    const league = byId.get(feed.lid);
    if (!league) continue;
    const base = {
      lid: feed.lid,
      leagueName: league.name,
      leagueKind: (league.kind ?? 'liga') as 'liga' | 'torneo',
      private: league.visibility === 'private',
    };
    const eventsById = new Map(feed.events.map((e) => [e.id, e]));

    for (const e of feed.events) {
      if (e.date < today) continue;
      const created = ms(e.createdAt, now);
      if (e.type === 'torneo') {
        const isToday = e.date === today;
        const extra = e.announcement?.trim();
        out.push({
          ...base,
          id: `torneo:${feed.lid}:${e.id}`,
          kind: isToday ? 'torneo-hoy' : 'torneo',
          title: isToday ? `¡Hoy es ${eventLabel(e)}!` : `Nuevo torneo: ${eventLabel(e)}`,
          body: [formatDateLong(e.date), extra && (extra.length > 90 ? `${extra.slice(0, 90)}…` : extra)].filter(Boolean).join(' · '),
          to: `/l/${feed.lid}/e/${e.id}`,
          // El del día sube arriba ese día aunque se haya anunciado antes.
          time: isToday ? Math.max(created, startOfToday) : created,
        });
      } else if (e.date <= inAWeek) {
        const count = Object.keys(e.rsvp ?? {}).length;
        const going = !!(feed.playerId && e.rsvp?.[feed.playerId]);
        out.push({
          ...base,
          id: `practica:${feed.lid}:${e.id}`,
          kind: 'practica',
          title: `Práctica ${e.date === today ? 'hoy' : formatDateLong(e.date)}`,
          body: `${going ? 'Vas ✓' : feed.playerId ? '¿Vas? Confírmalo en la liga' : 'Mira si puedes ir'} · ${count} ${count === 1 ? 'confirmado' : 'confirmados'}`,
          to: `/l/${feed.lid}`,
          time: created,
        });
      }
    }

    // Lo que un admin aprobó o rechazó de lo que subiste (último mes).
    for (const s of feed.mySubs) {
      // Lo que revisó uno mismo (el dueño y los admins también juegan) no es aviso.
      if (s.status === 'pendiente' || s.reviewedBy === feed.uid) continue;
      const reviewed = ms(s.reviewedAt, 0);
      if (!reviewed || now - reviewed > 30 * DAY) continue;
      const ev = s.eventId ? eventsById.get(s.eventId) : undefined;
      const games = (s.scores ?? []).filter((g) => g != null).join(' · ');
      const where = ev ? eventLabel(ev) : s.date ? `Práctica ${formatDate(s.date)}` : '';
      const approved = s.status === 'aprobado';
      out.push({
        ...base,
        id: `envio:${feed.lid}:${s.id}`,
        kind: approved ? 'aprobado' : 'rechazado',
        title: approved ? 'Aprobaron tus juegos' : 'Rechazaron tus juegos',
        body: [games, where, !approved && s.note ? `Motivo: ${s.note}` : ''].filter(Boolean).join(' · '),
        to: approved && s.eventId ? `/l/${feed.lid}/e/${s.eventId}` : `/l/${feed.lid}/perfil`,
        time: reviewed,
      });
    }

    // Me gusta y felicitaciones a tus juegos (último mes): un aviso por juego, con quiénes fueron.
    const recent = (t: { toMillis(): number } | null | undefined) => now - ms(t, now) <= 30 * DAY;
    const byEntry = new Map<string, typeof feed.reactions>();
    for (const r of feed.reactions) {
      if (r.uid === feed.uid || !recent(r.createdAt)) continue;
      byEntry.set(r.entryId, [...(byEntry.get(r.entryId) ?? []), r]);
    }
    for (const [entryId, list] of byEntry) {
      const sorted = newestFirst(list, now);
      const { who, count } = people(sorted);
      const many = count > 1;
      const types = new Set(sorted.map((r) => r.type));
      const ev = eventsById.get(sorted[0].eventId);
      out.push({
        ...base,
        id: `reaccion:${feed.lid}:${entryId}`,
        kind: 'reaccion',
        title:
          types.size > 1
            ? `${who} reaccionaron a tu juego`
            : types.has('felicitar')
              ? `${who} te ${many ? 'felicitaron' : 'felicitó'} 🎉`
              : `A ${who} le${many ? 's' : ''} gustó tu juego`,
        body: ev ? eventLabel(ev) : 'Toca para ver tu juego',
        to: postUrl(feed.lid, entryId),
        time: ms(sorted[0].createdAt, now),
      });
    }

    // Comentarios en tus juegos (último mes): un aviso por juego, con el último comentario.
    const commentsByEntry = new Map<string, typeof feed.comments>();
    for (const c of feed.comments) {
      if (c.uid === feed.uid || !recent(c.createdAt)) continue;
      commentsByEntry.set(c.entryId, [...(commentsByEntry.get(c.entryId) ?? []), c]);
    }
    for (const [entryId, list] of commentsByEntry) {
      const sorted = newestFirst(list, now);
      const { who, count } = people(sorted);
      const last = sorted[0];
      const ev = eventsById.get(last.eventId);
      const text = last.text.trim();
      out.push({
        ...base,
        id: `comentario:${feed.lid}:${entryId}`,
        kind: 'comentario',
        title: `${who} ${count > 1 ? 'comentaron' : 'comentó'} tu juego`,
        body: [`“${text.length > 90 ? `${text.slice(0, 90)}…` : text}”`, ev && eventLabel(ev)].filter(Boolean).join(' · '),
        to: postUrl(feed.lid, entryId),
        time: ms(last.createdAt, now),
      });
    }

    // Organizadores: notas nuevas en el buzón de sugerencias (un aviso por liga, con la última).
    const notes = feed.isAdmin ? newestFirst(feed.suggestions, now) : [];
    if (notes.length) {
      const n = notes.length;
      const text = notes[0].text.trim();
      out.push({
        ...base,
        id: `sugerencias:${feed.lid}`,
        kind: 'sugerencia',
        title: n === 1 ? 'Nueva sugerencia en el buzón' : `${n} sugerencias nuevas en el buzón`,
        body: `“${text.length > 90 ? `${text.slice(0, 90)}…` : text}” · anónima`,
        to: `/l/${feed.lid}/admin?tab=buzon`,
        time: ms(notes[0].createdAt, now),
      });
    }

    // Admin: lo que falta por aprobar en su liga (un solo aviso por liga).
    // Sus propios envíos no cuentan (los ve igual en Aprobar, marcados "Tú").
    const othersPending = feed.pending.filter((s) => s.playerId !== feed.playerId);
    if (feed.isAdmin && othersPending.length) {
      const n = othersPending.length;
      out.push({
        ...base,
        id: `pendientes:${feed.lid}`,
        kind: 'por-aprobar',
        title: `${n} ${n === 1 ? 'envío' : 'envíos'} por aprobar`,
        body: 'Juegos que subieron los jugadores esperan tu revisión.',
        to: `/l/${feed.lid}/admin?tab=aprobar`,
        time: Math.max(...othersPending.map((s) => ms(s.createdAt, now))),
      });
    }
  }

  return out.sort((a, b) => b.time - a.time).slice(0, 40);
}

/** Medianoche local del día de `t` (para contar días de calendario, no bloques de 24 h). */
const midnight = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** "ahora", "hace 5 min", "hace 3 h", "ayer", "hace 4 días" o la fecha. */
export function relativeTime(time: number, now: number): string {
  const diff = Math.max(0, now - time);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  // Días de calendario: lo de anteanoche a las 11 no es "ayer" aunque hayan pasado menos de 48 h.
  const d = Math.round((midnight(now) - midnight(time)) / DAY);
  if (d <= 1) return 'ayer';
  if (d < 7) return `hace ${d} días`;
  return new Date(time).toLocaleDateString('es-DO', { day: 'numeric', month: 'short' });
}
