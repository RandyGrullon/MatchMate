import { leagueSport } from '../sports/registry';
import { isMatchSport, matchDetail, matchHref, matchTitle, type CalendarMatch } from './calendar';
import type { Match } from './data/matches';
import { toIsoDate } from './format';
import { formatTime, parseSchedule } from './schedule';
import type { LeagueFeed } from './data';
import { isValidScore, slots } from './stats';
import type { BowlingEvent, Entry, League, LiveScore, Stamp, Submission } from './types';

/** Minutos antes de la hora de la liga en que el evento ya sale como "en juego". */
export const LIVE_EARLY_MIN = 30;

export interface LiveInfo {
  /** Hoy es el día del evento y ya es la hora (o casi). */
  live: boolean;
  /** "7:30 pm" si la liga tiene hora; null si no (entonces está en juego todo el día). */
  startLabel: string | null;
  /** Todavía no llega la hora de empezar (pero ya está dentro de los 30 minutos antes). */
  startsSoon: boolean;
}

/**
 * ¿El evento está en juego ahora? El día del evento, desde 30 minutos antes de la hora de la liga
 * (la que se eligió en "Cuándo juegan") hasta la medianoche. Sin hora, o si el evento cae en otro día
 * que los de la liga (p. ej. un torneo el sábado), todo ese día.
 */
export function liveInfo(event: Pick<BowlingEvent, 'date'>, league: Pick<League, 'schedule'>, now: Date): LiveInfo {
  if (event.date !== toIsoDate(now)) return { live: false, startLabel: null, startsSoon: false };
  const { days, time } = parseSchedule(league.schedule ?? '');
  const weekday = (now.getDay() + 6) % 7; // 0 = lunes, como WEEKDAYS
  if (!time || (days.length > 0 && !days.includes(weekday))) return { live: true, startLabel: null, startsSoon: false };
  const [h, m] = time.split(':').map(Number);
  const start = h * 60 + m;
  const current = now.getHours() * 60 + now.getMinutes();
  return { live: current >= start - LIVE_EARLY_MIN, startLabel: formatTime(time), startsSoon: current < start };
}

export interface LiveGame {
  feed: LeagueFeed;
  league: League;
  event: BowlingEvent;
  info: LiveInfo;
}

/**
 * Eventos en juego ahora en las ligas de la cuenta (los que empiezan antes, primero). Solo las del boliche:
 * la tarjeta es de anotar tus juegos de la práctica o del torneo; los partidos de los otros deportes se
 * siguen en sus propias pantallas.
 */
export function liveGames(feeds: LeagueFeed[], leagues: League[], now: Date): LiveGame[] {
  const out: LiveGame[] = [];
  for (const feed of feeds) {
    const league = leagues.find((l) => l.id === feed.lid);
    if (!league || leagueSport(league) !== 'bowling') continue;
    for (const event of feed.events) {
      const info = liveInfo(event, league, now);
      if (info.live) out.push({ feed, league, event, info });
    }
  }
  return out.sort((a, b) => Number(a.info.startsSoon) - Number(b.info.startsSoon) || a.league.name.localeCompare(b.league.name));
}

/** De dónde sale cada juego del tablero en vivo. */
export type LiveSource = 'tabla' | 'sin-verificar' | 'enviado' | 'jugador';

export interface LiveRow {
  playerId: string;
  /** Participación (para felicitar y comentar), si ya está en la tabla. */
  entryId: string | null;
  games: { score: number | null; source: LiveSource | null }[];
  total: number;
  played: number;
}

/**
 * Cómo va cada jugador en el evento, juntando todo lo que se sabe: lo que está en la tabla (verificado o no),
 * lo que envió y espera aprobación, y lo que va anotando en su teléfono. Ordenado por pinos hasta ahora
 * (no es la clasificación oficial: esa sale de la tabla con handicap y promedio).
 * En un torneo solo salen los inscritos.
 */
export function liveRows(event: Pick<BowlingEvent, 'games' | 'type'>, entries: Entry[], subs: Submission[], live: LiveScore[]): LiveRow[] {
  const ids = new Set(
    event.type === 'torneo'
      ? entries.map((e) => e.playerId)
      : [...entries.map((e) => e.playerId), ...subs.map((s) => s.playerId), ...live.map((l) => l.playerId)],
  );
  const newest = (s: Submission) => s.createdAt?.toMillis() ?? Number.MAX_SAFE_INTEGER;
  const rows: LiveRow[] = [];
  for (const playerId of ids) {
    const entry = entries.find((e) => e.playerId === playerId);
    const pending = subs.filter((s) => s.playerId === playerId && s.status === 'pendiente').sort((a, b) => newest(b) - newest(a));
    const phone = live.find((l) => l.playerId === playerId);
    const count = Math.max(event.games, phone?.scores.length ?? 0, ...pending.map((s) => s.scores.length));
    const scores = slots(entry?.scores, count, null);
    const photos = slots(entry?.photos, count, null);
    // Lo que corrigió en el teléfono después de enviarlo manda (así lo ve también en su pantalla).
    const phoneAt = phone?.updatedAt?.toMillis() ?? Number.MAX_SAFE_INTEGER;
    const games = Array.from({ length: count }, (_, i): LiveRow['games'][number] => {
      if (scores[i] != null) return { score: scores[i], source: photos[i] != null ? 'tabla' : 'sin-verificar' };
      const sentBy = pending.find((s) => s.scores[i] != null);
      const sent = sentBy?.scores[i];
      const typed = phone?.scores[i];
      const phoneOk = typed != null && isValidScore(typed);
      if (sent != null && isValidScore(sent) && !(phoneOk && phoneAt > newest(sentBy!))) return { score: sent, source: 'enviado' };
      if (phoneOk) return { score: typed, source: 'jugador' };
      return { score: null, source: null };
    });
    // Sin juegos de más al final (J4, J5 vacíos).
    while (games.length > event.games && games[games.length - 1].score == null) games.pop();
    const known = games.filter((g) => g.score != null);
    if (!known.length) continue;
    rows.push({
      playerId,
      entryId: entry?.id ?? null,
      games,
      total: known.reduce((a, g) => a + g.score!, 0),
      played: known.length,
    });
  }
  return rows.sort((a, b) => b.total - a.total || b.played - a.played);
}

// ---------- Partidos en vivo (raqueta y equipos) ----------

/**
 * Un partido «en vivo» que no publica nada hace más de 3 horas se quedó así (el teléfono del anotador se apagó o
 * nadie lo terminó): ya no sale en «En juego ahora» (el admin lo arregla en la liga).
 */
export const LIVE_MATCH_STALE_MS = 3 * 60 * 60 * 1000;

/** El turno del anotador dura 5 minutos desde que publicó (docs/partidos.md). */
const LEASE_MS = 5 * 60 * 1000;

/** Lo que «En juego ahora» necesita de un partido (sirve con `Match` de useLiveMatches y de useMyMatches). */
export type LiveMatchLike = CalendarMatch & Pick<Match, 'score' | 'leaseUntil' | 'version'> & { updatedAt?: Stamp | null };

export interface LiveMatchItem<M extends LiveMatchLike = LiveMatchLike> {
  match: M;
  league: League;
  sport: string;
  href: string;
  /** Juego en este partido (sale primero). */
  mine: boolean;
  /** «Tigres vs. Leones». */
  title: string;
  /** «2-1», «6-4 3-2» (null si todavía no hay tantos). */
  score: string | null;
  /** «Jornada 3 · Cancha 2» (vacío si no hay). */
  detail: string;
}

/** Lo último que se supo del partido (ms): su último cambio o su última publicación; 0 si no se sabe. */
function lastActivity(m: LiveMatchLike): number {
  const updated = m.updatedAt?.toMillis() ?? 0;
  const lease = m.leaseUntil ? Date.parse(m.leaseUntil) - LEASE_MS : 0;
  return Math.max(Number.isFinite(updated) ? updated : 0, Number.isFinite(lease) ? lease : 0);
}

/** El marcador corto para la lista: el texto del partido o el número grande de cada lado. */
export function liveScoreText(score: Match['score']): string | null {
  const text = typeof score?.text === 'string' ? score.text.trim() : '';
  if (text) return text;
  const sides = score?.sides;
  return Array.isArray(sides) && sides.length === 2 && sides.every((n) => typeof n === 'number') ? `${sides[0]}-${sides[1]}` : null;
}

/**
 * «En juego ahora» de los partidos: los que están en vivo en tus ligas de raqueta y equipos, los tuyos primero.
 * `live` = los en vivo de tus ligas (useLiveMatches); `mine` = tus partidos (useMyMatches, que queda guardado y
 * sirve sin señal). De un mismo partido manda la copia más nueva (`version`); tu lado sale de `mine`.
 */
export function liveMatches<M extends LiveMatchLike>(live: readonly M[], mine: readonly M[], leagues: readonly League[], now: number): LiveMatchItem<M>[] {
  const mySide = new Map(mine.map((m) => [m.id, m.mySide ?? null] as const));
  const byId = new Map<string, M>();
  for (const m of [...live, ...mine]) {
    const old = byId.get(m.id);
    if (!old || m.version > old.version) byId.set(m.id, m);
  }
  const out: LiveMatchItem<M>[] = [];
  for (const m of byId.values()) {
    if (m.status !== 'live') continue;
    const league = leagues.find((l) => l.id === m.leagueId);
    if (!league) continue;
    const sport = leagueSport(league);
    if (!isMatchSport(sport)) continue;
    const last = lastActivity(m);
    if (last > 0 && now - last > LIVE_MATCH_STALE_MS) continue;
    out.push({
      match: m,
      league,
      sport,
      href: matchHref(league.id, m, sport),
      mine: mySide.has(m.id),
      title: matchTitle(m),
      score: liveScoreText(m.score),
      detail: matchDetail(m, sport),
    });
  }
  const at = (m: LiveMatchLike) => (m.scheduledAt ? Date.parse(m.scheduledAt) : Number.POSITIVE_INFINITY);
  return out.sort(
    (a, b) =>
      Number(b.mine) - Number(a.mine) ||
      at(a.match) - at(b.match) ||
      a.league.name.localeCompare(b.league.name) ||
      (a.match.id < b.match.id ? -1 : a.match.id > b.match.id ? 1 : 0),
  );
}
