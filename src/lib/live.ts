import { toIsoDate } from './format';
import { formatTime, parseSchedule } from './schedule';
import type { LeagueFeed } from './data';
import { isValidScore, slots } from './stats';
import type { BowlingEvent, Entry, League, LiveScore, Submission } from './types';

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

/** Eventos en juego ahora en las ligas de la cuenta (los que empiezan antes, primero). */
export function liveGames(feeds: LeagueFeed[], leagues: League[], now: Date): LiveGame[] {
  const out: LiveGame[] = [];
  for (const feed of feeds) {
    const league = leagues.find((l) => l.id === feed.lid);
    if (!league) continue;
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
