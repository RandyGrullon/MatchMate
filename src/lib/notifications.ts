import { leagueSport } from '../sports/registry';
import { SPORT_FAMILY, type Side, type SportFamily } from '../sports/types';
import { eventLabel, formatDate, formatDateLong, joinList, parseDate } from './format';
import type { LeagueFeed } from './data';
import type { Match } from './data/matches';
import type { MatchNoticeFeed } from './data/matchNotices';
import { formatTime } from './schedule';
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
  | 'sugerencia'
  // Partidos (raqueta y equipos)
  | 'partido-hoy'
  | 'por-confirmar'
  | 'reclamo'
  | 'cambio-hora'
  | 'aplazado'
  | 'ronda'
  | 'reto';

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
const HOUR = 3600_000;
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

/** Máximo de avisos en la lista. */
const MAX_NOTICES = 40;

/**
 * Arma los avisos a partir de lo que pasa en las ligas de la cuenta (y, si juega deportes de partidos, de sus
 * partidos: `matches`, ver `buildMatchNotices`). `today` es 'YYYY-MM-DD' y `now` en milisegundos (se pasan para
 * poder probarlo).
 */
export function buildNotices(feeds: LeagueFeed[], leagues: League[], today: string, now: number, matches: MatchNoticeFeed | null = null): Notice[] {
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
    const sport = leagueSport(league);
    const bowling = sport === 'bowling';

    for (const e of feed.events) {
      if (e.date < today) continue;
      // Los otros deportes tienen sus propios tipos (americano, ronda, encuentro…): de ellos solo se avisa
      // el torneo; nada de «Práctica» ni de «¿Vas?», que son del boliche.
      if (!bowling && e.type !== 'torneo') continue;
      const created = ms(e.createdAt, now);
      if (e.type === 'torneo') {
        const isToday = e.date === today;
        const extra = e.announcement?.trim();
        out.push({
          ...base,
          id: `torneo:${feed.lid}:${e.id}`,
          kind: isToday ? 'torneo-hoy' : 'torneo',
          title: isToday ? `¡Hoy es ${eventLabel(e, sport)}!` : `Nuevo torneo: ${eventLabel(e, sport)}`,
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
      const where = ev ? eventLabel(ev, sport) : s.date ? `Práctica ${formatDate(s.date)}` : '';
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
        body: ev ? eventLabel(ev, sport) : 'Toca para ver tu juego',
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
        body: [`“${text.length > 90 ? `${text.slice(0, 90)}…` : text}”`, ev && eventLabel(ev, sport)].filter(Boolean).join(' · '),
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

  const all = matches ? [...out, ...buildMatchNotices(matches, leagues, now)] : out;
  return all.sort((a, b) => b.time - a.time).slice(0, MAX_NOTICES);
}

// ---------- Partidos (raqueta y equipos) ----------

const DEFAULT_TZ = 'America/Santo_Domingo';
/** Un cambio de hora o un reto aceptado se avisa esta cantidad de días. */
const CHANGE_DAYS = 7;
/** Un partido de hoy se sigue avisando hasta unas horas después de la hora (por si se atrasó). */
const TODAY_GRACE_MS = 3 * HOUR;
const NIGHT_FORMATS = new Set(['americano', 'mexicano']);

const formats = new Map<string, Intl.DateTimeFormat>();

/** Intl con la zona de la liga (guardado: armarlo cuesta); si la zona no sirve, la de Santo Domingo. */
function inZone(options: Intl.DateTimeFormatOptions, tz: string, locale = 'es-DO'): Intl.DateTimeFormat {
  const key = `${locale}|${tz}|${JSON.stringify(options)}`;
  let f = formats.get(key);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat(locale, { ...options, timeZone: tz });
    } catch {
      f = new Intl.DateTimeFormat(locale, { ...options, timeZone: DEFAULT_TZ });
    }
    formats.set(key, f);
  }
  return f;
}

const valid = (iso: string | null | undefined): iso is string => !!iso && Number.isFinite(Date.parse(iso));

/** «8:00 pm» (como los push) en la zona de la liga. */
function clock(iso: string, tz: string): string {
  return formatTime(inZone({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, tz, 'en-GB').format(new Date(iso)));
}

/** 'YYYY-MM-DD' en la zona de la liga. */
function dayIn(t: number, tz: string): string {
  return inZone({ year: 'numeric', month: '2-digit', day: '2-digit' }, tz, 'en-CA').format(new Date(t));
}

/** «sáb 10 oct» en la zona de la liga. */
function shortDay(iso: string, tz: string): string {
  return inZone({ weekday: 'short', day: 'numeric', month: 'short' }, tz)
    .format(new Date(iso))
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** «hoy a las 8:00 pm», «mañana a las 8:00 pm» o «el sáb 10 oct a las 8:00 pm». */
function whenPhrase(iso: string, tz: string, now: number): string {
  const day = dayIn(Date.parse(iso), tz);
  const at = `a las ${clock(iso, tz)}`;
  if (day === dayIn(now, tz)) return `hoy ${at}`;
  if (day === dayIn(now + DAY, tz)) return `mañana ${at}`;
  return `el ${shortDay(iso, tz)} ${at}`;
}

/** «sáb 10 oct, 8:00 pm» (hoy/mañana en palabras). */
function whenShort(iso: string, tz: string, now: number): string {
  const day = dayIn(Date.parse(iso), tz);
  const d = day === dayIn(now, tz) ? 'hoy' : day === dayIn(now + DAY, tz) ? 'mañana' : shortDay(iso, tz);
  return `${d}, ${clock(iso, tz)}`;
}

/** «las próximas 31 h» o «los próximos 25 min» hasta esa hora. */
function timeLeft(until: number, now: number): string {
  const left = until - now;
  const h = Math.floor(left / HOUR);
  return h >= 1 ? `las próximas ${h} h` : `los próximos ${Math.max(1, Math.ceil(left / 60_000))} min`;
}

/** Medianoche local del día de `t` (para contar días de calendario, no bloques de 24 h). */
const midnight = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const label = (m: Pick<Match, 'sides'>, side: Side) => m.sides[side - 1]?.label || 'Por definir';
const versus = (m: Pick<Match, 'sides'>) => `${label(m, 1)} contra ${label(m, 2)}`;
const scoreText = (m: Pick<Match, 'score'>) => (typeof m.score?.text === 'string' && m.score.text.trim() ? m.score.text.trim() : null);
/** «Luis contra Ana: 6-4 6-3.» (sin marcador, solo los lados). */
const withScore = (m: Pick<Match, 'sides' | 'score'>) => {
  const text = scoreText(m);
  return text ? `${versus(m)}: ${text}.` : `${versus(m)}.`;
};
/** «nota». (cortada si es larga), o nada. */
const quoted = (note: string | null | undefined) => {
  const t = note?.trim();
  return t ? `«${t.length > 90 ? `${t.slice(0, 90)}…` : t}».` : '';
};
const stamp = (t: { toMillis(): number } | string | null | undefined): number | null =>
  typeof t === 'string' ? (valid(t) ? Date.parse(t) : null) : t && typeof t.toMillis === 'function' ? t.toMillis() : null;
const matchUrl = (m: Pick<Match, 'leagueId' | 'id'>) => `/l/${m.leagueId}/juegos?partido=${m.id}`;
/** «la Cancha 2», «la cancha 3» o «la cancha Central». */
function courtPhrase(court: string): string {
  const c = court.trim();
  if (!c) return 'jugar';
  return /^(cancha|pista)\b/i.test(c) ? `la ${c}` : `la cancha ${c}`;
}

/**
 * Avisos de los partidos de la cuenta, de lo que leyó `useMatchNotices`:
 * - «Partido hoy a las 8:00 pm, Cancha 2» (el día del partido);
 * - «Tienes un resultado por confirmar» al rival (raqueta: cualquiera del lado; equipos: capitán o delegado),
 *   mientras corren las 48 h;
 * - «Reclamaron un resultado» a los organizadores y «Reclamaron tu resultado» a quien lo anotó;
 * - cambio de hora, de fecha o de cancha, y aplazado, hecho por otra cuenta (una semana);
 * - «Ronda 3: te toca la Cancha 2» (o «descansas») en la noche de americano, mexicano o round robin;
 * - retos de la escalera: «Te retaron» mientras falta aceptarlo y «Aceptaron tu reto».
 * Los ids son los mismos tags de los push del servidor (así la notificación del teléfono reemplaza y no repite).
 */
export function buildMatchNotices(feed: MatchNoticeFeed | null | undefined, leagues: League[], now: number): Notice[] {
  if (!feed) return [];
  const byId = new Map(leagues.map((l) => [l.id, l]));
  const out = new Map<string, Notice>();
  const admins = new Set(feed.adminLeagues);
  const startOfToday = midnight(now);

  const add = (lid: string, n: Omit<Notice, 'lid' | 'leagueName' | 'leagueKind' | 'private'>) => {
    const league = byId.get(lid);
    if (!league || out.has(n.id)) return;
    out.set(n.id, { ...n, lid, leagueName: league.name, leagueKind: (league.kind ?? 'liga') as 'liga' | 'torneo', private: league.visibility === 'private' });
  };
  const tzOf = (lid: string) => byId.get(lid)?.tz || DEFAULT_TZ;
  const sportOf = (lid: string) => {
    const league = byId.get(lid);
    return league ? leagueSport(league) : 'bowling';
  };

  // Organizadores: los reclamos por resolver de su liga (antes que el de «tu resultado», que es el mismo).
  for (const m of feed.disputes) {
    if (m.status !== 'disputed' || !admins.has(m.leagueId) || m.disputedBy === feed.uid) continue;
    add(m.leagueId, {
      id: `reclamo:${m.id}`,
      kind: 'reclamo',
      title: 'Reclamaron un resultado',
      body: [withScore(m), quoted(m.disputeNote), 'Toca para resolverlo.'].filter(Boolean).join(' '),
      to: matchUrl(m),
      time: stamp(m.disputedAt) ?? stamp(m.updatedAt) ?? now,
    });
  }

  const challengeByMatch = new Map(feed.challenges.map((c) => [c.matchId, c] as const));

  for (const m of feed.mine) {
    const tz = tzOf(m.leagueId);
    const mySide = m.mySide ?? null;

    // Resultado por confirmar (lo propuso el otro lado).
    const proposed = stamp(m.proposedAt);
    if (
      m.status === 'finished' &&
      proposed !== null &&
      proposed + 2 * DAY > now &&
      m.canAnswer &&
      mySide !== null &&
      m.proposedSide !== null &&
      m.proposedSide !== mySide &&
      m.proposedBy !== feed.uid
    ) {
      add(m.leagueId, {
        id: `confirmar:${m.id}`,
        kind: 'por-confirmar',
        title: 'Tienes un resultado por confirmar',
        body: `${label(m, m.proposedSide)} anotó ${scoreText(m) ?? 'el resultado'}. Confírmalo o reclama en ${timeLeft(proposed + 2 * DAY, now)}.`,
        to: matchUrl(m),
        time: proposed,
      });
    }

    // Reclamaron el resultado que anotó mi lado (si es organizador, ya lo tiene arriba).
    if (m.status === 'disputed' && mySide !== null && m.proposedSide === mySide && m.disputedBy !== feed.uid && !admins.has(m.leagueId)) {
      add(m.leagueId, {
        id: `reclamo:${m.id}`,
        kind: 'reclamo',
        title: 'Reclamaron tu resultado',
        body: [withScore(m), quoted(m.disputeNote), 'El organizador lo va a revisar.'].filter(Boolean).join(' '),
        to: matchUrl(m),
        time: stamp(m.disputedAt) ?? stamp(m.updatedAt) ?? now,
      });
    }

    // Partido de hoy (las rondas de las noches de puntos van aparte).
    const at = stamp(m.scheduledAt);
    if (m.status === 'scheduled' && at !== null && !NIGHT_FORMATS.has(m.format) && dayIn(at, tz) === dayIn(now, tz) && at > now - TODAY_GRACE_MS) {
      const court = m.court.trim();
      add(m.leagueId, {
        id: `partido:${m.id}`,
        kind: 'partido-hoy',
        title: `${m.stage === 'Reto' ? 'Reto' : 'Partido'} hoy a las ${clock(m.scheduledAt!, tz)}${court ? `, ${court}` : ''}`,
        body: [m.stage.trim() && m.stage !== 'Reto' ? m.stage.trim() : '', versus(m)].filter(Boolean).join(' · '),
        to: matchUrl(m),
        time: Math.max(startOfToday, stamp(m.createdAt) ?? startOfToday),
      });
    }

    // Cambio de hora, de cancha o aplazado (lo hizo otra cuenta, hace menos de una semana).
    const change = m.change;
    const changedAt = change ? stamp(change.at) : null;
    if (change && changedAt !== null && now - changedAt <= CHANGE_DAYS * DAY) {
      const reto = challengeByMatch.get(m.id);
      // Al aceptar un reto con hora ya llega «Aceptaron tu reto» con la hora: no se repite.
      const sameAsAccept = !!reto?.acceptedAt && valid(reto.acceptedAt) && Math.abs(Date.parse(reto.acceptedAt) - changedAt) < 5 * 60_000;
      if (change.a === 'postpone' && m.status === 'postponed') {
        add(m.leagueId, {
          id: `hora:${m.id}`,
          kind: 'aplazado',
          title: 'Aplazaron tu partido',
          body: [`${versus(m)}.`, quoted(change.note), 'Te avisamos aquí cuando tenga fecha nueva.'].filter(Boolean).join(' '),
          to: matchUrl(m),
          time: changedAt,
        });
      } else if (change.a !== 'postpone' && m.status === 'scheduled' && !sameAsAccept && (at === null || at > now - TODAY_GRACE_MS)) {
        const newAt = valid(change.toAt) ? change.toAt : null;
        const oldAt = valid(change.fromAt) ? change.fromAt : null;
        const title = !oldAt && newAt
          ? 'Tu partido ya tiene fecha'
          : newAt && oldAt && Date.parse(newAt) !== Date.parse(oldAt)
            ? dayIn(Date.parse(newAt), tz) === dayIn(Date.parse(oldAt), tz)
              ? 'Cambiaron la hora de tu partido'
              : 'Cambiaron la fecha de tu partido'
            : 'Cambiaron la cancha de tu partido';
        const where = [newAt ? whenShort(newAt, tz, now) : 'sin fecha', change.toCourt?.trim() || ''].filter(Boolean).join(', ');
        add(m.leagueId, {
          id: `hora:${m.id}`,
          kind: 'cambio-hora',
          title,
          body: [`${versus(m)} · Ahora: ${where}.`, quoted(change.note)].filter(Boolean).join(' '),
          to: matchUrl(m),
          time: changedAt,
        });
      }
    }
  }

  // Retos de la escalera (lado 1 = retador, lado 2 = retado).
  const mineById = new Map(feed.mine.map((m) => [m.id, m] as const));
  for (const c of feed.challenges) {
    const m = mineById.get(c.matchId);
    if (!m) continue;
    const tz = tzOf(c.leagueId);
    const to = `/l/${c.leagueId}/e/${c.eventId}`;
    if (c.status === 'pending' && m.mySide === 2 && valid(c.acceptBy) && Date.parse(c.acceptBy) > now) {
      add(c.leagueId, {
        id: `reto:${c.id}`,
        kind: 'reto',
        title: 'Te retaron en la escalera',
        body: `${label(m, 1)}${c.challengerPos ? ` (puesto ${c.challengerPos})` : ''} te retó. Tienes hasta el ${shortDay(c.acceptBy, tz)} a las ${clock(c.acceptBy, tz)} para aceptar.`,
        to,
        time: stamp(c.sentAt) ?? now,
      });
    } else if (c.status === 'accepted' && m.mySide === 1 && c.acceptedBy !== feed.uid && valid(c.acceptedAt) && now - Date.parse(c.acceptedAt) <= CHANGE_DAYS * DAY) {
      const court = m.court.trim();
      const when =
        m.scheduledAt && valid(m.scheduledAt)
          ? `Juegan ${whenPhrase(m.scheduledAt, tz, now)}${court ? `, ${court}` : ''}.`
          : valid(c.playBy)
            ? `Tienen hasta el ${shortDay(c.playBy, tz)} para jugar.`
            : '';
      add(c.leagueId, {
        id: `reto:${c.id}`,
        kind: 'reto',
        title: 'Aceptaron tu reto',
        body: [`${label(m, 2)} aceptó el reto.`, when].filter(Boolean).join(' '),
        to,
        time: Date.parse(c.acceptedAt),
      });
    }
  }

  // Noches de puntos: la última ronda publicada (mi cancha o que descanso).
  for (const night of feed.nights) {
    if (night.round <= 0 || !byId.has(night.leagueId)) continue;
    const name = eventLabel({ type: night.type, name: night.name, date: night.date }, sportOf(night.leagueId));
    const mine = feed.mine.find((m) => m.eventId === night.eventId && m.round === night.round && m.mySide);
    if (mine) {
      const other: Side = mine.mySide === 1 ? 2 : 1;
      add(night.leagueId, {
        id: `ronda:${night.eventId}`,
        kind: 'ronda',
        title: `Ronda ${night.round}: te toca ${courtPhrase(mine.court)}`,
        body: `${label(mine, mine.mySide!)} contra ${label(mine, other)} · ${name}`,
        to: `/l/${night.leagueId}/e/${night.eventId}?partido=${mine.id}`,
        time: stamp(mine.createdAt) ?? stamp(night.changedAt) ?? now,
      });
    } else if (feed.players[night.leagueId] && night.rests.includes(feed.players[night.leagueId])) {
      add(night.leagueId, {
        id: `ronda:${night.eventId}`,
        kind: 'ronda',
        title: `Ronda ${night.round}: descansas`,
        body: `Te toca descansar esta ronda · ${name}`,
        to: `/l/${night.leagueId}/e/${night.eventId}`,
        time: stamp(night.changedAt) ?? now,
      });
    }
  }

  return [...out.values()];
}

// ---------- Textos según los deportes de la cuenta ----------

const familyOf = (sport: string): SportFamily | null => (SPORT_FAMILY as Record<string, SportFamily | undefined>)[sport] ?? null;

function sportsSummary(sports: readonly string[]) {
  const set = new Set(sports.map((s) => s || 'bowling'));
  const has = (s: string) => set.has(s);
  const racket = [...set].some((s) => familyOf(s) === 'racket');
  const team = [...set].some((s) => familyOf(s) === 'team');
  return { set, bowling: has('bowling'), golf: has('golf'), swimming: has('swimming'), racket, team, nights: has('padel') || has('pickleball') };
}

/** Lo que dice «¿Te avisamos?» con solo boliche (igual que siempre). */
export const BOWLING_NOTIFICATIONS_TEXT =
  'Recordatorios de tus prácticas y torneos (el día antes, el mismo día y, si la liga tiene hora, poco antes de empezar), aunque la app esté cerrada. Con la app abierta o en segundo plano, también felicitaciones, comentarios y cuando aprueben tus juegos.';

/**
 * Qué avisamos por push, según los deportes de las ligas de la cuenta (Activar notificaciones). Sin ligas: lo
 * general. Solo boliche: el texto de siempre.
 */
export function notificationsText(sports: readonly string[]): string {
  const s = sportsSummary(sports);
  if (!s.set.size) {
    return 'Recordatorios de tus partidos, rondas, encuentros, prácticas y torneos (el día antes y el mismo día), aunque la app esté cerrada. También te avisamos cuando tienes un resultado por confirmar.';
  }
  if (s.set.size === 1 && s.bowling) return BOWLING_NOTIFICATIONS_TEXT;
  const what: string[] = [];
  if (s.racket || s.team) what.push(`tus partidos, el día antes y unas horas antes («Partido hoy a las 8:00 pm, Cancha 2»${s.team ? ', con la convocatoria' : ''})`);
  if (s.nights) what.push('las noches de americano, con tu cancha en cada ronda');
  if (s.golf) what.push('tus rondas de golf, con tu grupo y tu hoyo de salida');
  if (s.swimming) what.push('los encuentros de natación');
  if (s.bowling) what.push('tus prácticas y torneos de boliche');
  const also: string[] = [];
  if (s.racket || s.team) also.push('cuando tienes un resultado por confirmar', 'cuando reclaman un resultado en la liga que organizas');
  if (s.racket) also.push('cuando te retan en la escalera');
  let text = `Recordatorios de ${joinList(what)}, aunque la app esté cerrada.`;
  if (also.length) text += ` También te avisamos ${joinList(also)}.`;
  if (s.bowling) text += ' Con la app abierta o en segundo plano, también felicitaciones, comentarios y cuando aprueben tus juegos.';
  return text;
}

/** La campana vacía: de qué te avisamos aquí, según los deportes de la cuenta. */
export function emptyNoticesText(sports: readonly string[]): string {
  const s = sportsSummary(sports);
  if (!s.set.size || (s.set.size === 1 && s.bowling)) {
    return 'Aquí te avisamos de torneos nuevos, prácticas de la semana y cuando aprueben tus juegos, con la liga de cada cosa.';
  }
  const what: string[] = [];
  if (s.racket || s.team) what.push('tus partidos del día, los resultados por confirmar y los cambios de hora');
  if (s.nights) what.push('tu cancha en cada ronda del americano');
  if (s.racket) what.push('los retos de la escalera');
  if (s.bowling) what.push('las prácticas de la semana y cuando aprueben tus juegos');
  what.push('los torneos nuevos');
  return `Aquí te avisamos de ${joinList(what)}, con la liga de cada cosa.`;
}

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
