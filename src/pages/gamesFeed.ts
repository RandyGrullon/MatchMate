/**
 * La lógica de «Resultados anteriores» (`/l/:lid/juegos`, GamesFeedPage.tsx), sin React ni pantallas: la comparten la
 * web y la app del teléfono (movil/src/components/bowling/GamesFeed.tsx). Qué fechas se ven y de a cuántas, quiénes
 * jugaron cada una (de la mejor serie a la peor, con «Mejor juego» o «Mejor serie»), las líneas y los textos.
 */
import { parseDate, typeLabel } from '../lib/format';
import type { LiveInfo } from '../lib/live';
import { entryLine, type Line } from '../lib/stats';
import type { BowlingEvent, Entry, League, Player } from '../lib/types';

/** Eventos pasados que se muestran de a poco. */
export const FEED_PAGE = 4;

/** Los textos de la pantalla (los mismos en la web y en el teléfono). */
export const FEED_TEXT = {
  title: 'Resultados anteriores',
  hint: 'Toca a alguien para felicitarlo o comentar',
  emptyTitle: 'Todavía no hay juegos',
  emptyText: 'Cuando se juegue una práctica o un torneo, sale aquí.',
  noGames: 'Nadie anotó juegos en esta fecha.',
  more: 'Ver fechas más viejas',
} as const;

/** Un juego del evento para el muro: la línea del jugador y sus distinciones. */
export interface FeedPost {
  entry: Entry;
  line: Line;
  name: string;
  /** Cuenta del jugador (su perfil `/u/:id`); null si no tiene cuenta. */
  uid: string | null;
  badges: string[];
}

const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/** Debajo del nombre del evento: «Martes · práctica · 6 jugaron». */
export function eventLine(event: Pick<BowlingEvent, 'date' | 'type'>, players: number): string {
  const day = WEEKDAYS[parseDate(event.date).getDay()];
  return [day, typeLabel(event.type).toLowerCase(), players > 0 && `${players} ${players === 1 ? 'jugó' : 'jugaron'}`].filter(Boolean).join(' · ');
}

/** «176 · 195 · 203 · 192»: los juegos que cuentan, en una línea. */
export const scoresLine = (scores: readonly (number | null)[]): string => scores.filter((s): s is number => s != null).join(' · ');

/** Lo jugado hasta hoy, del más nuevo al más viejo: lo de hoy y lo de antes, aparte. */
export function playedEvents(events: readonly BowlingEvent[], today: string): { played: BowlingEvent[]; todays: BowlingEvent[]; past: BowlingEvent[] } {
  const played = [...events].filter((e) => e.date <= today).sort((a, b) => b.date.localeCompare(a.date));
  return { played, todays: played.filter((e) => e.date === today), past: played.filter((e) => e.date < today) };
}

/**
 * Juego abierto desde un aviso: el evento que hay que cargar aunque sea viejo. Los avisos de Social traen
 * `?juego=<juego>&evento=<evento>`; los links viejos, `?juego=evento_jugador`. Un `?juego=<juego>` solo (el aviso al
 * teléfono) no dice su evento: null (abre si su fecha se ve). Nunca un id cortado: el `in (…)` de la base fallaría.
 */
export function openEventIdOf(open: string | null, event?: string | null): string | null {
  if (!open) return null;
  if (event) return event;
  const cut = open.indexOf('_');
  return cut > 0 ? open.slice(0, cut) : null;
}

/** Los eventos cuyos juegos se leen: los que se ven y el del juego abierto. */
export function feedEventIds(shown: readonly BowlingEvent[], openEventId: string | null): string[] {
  const list = shown.map((e) => e.id);
  if (openEventId && !list.includes(openEventId)) list.push(openEventId);
  return list;
}

/** El nombre de cada jugador y su cuenta (los menores nunca tienen cuenta ni perfil público). */
export function feedPeople(players: readonly Player[]): { nameOf: Map<string, string>; uidOf: Map<string, string> } {
  return {
    nameOf: new Map(players.map((p) => [p.id, p.name])),
    uidOf: new Map(players.flatMap((p) => (p.uid && !p.isMinor ? [[p.id, p.uid] as const] : []))),
  };
}

/** Adónde lleva una fecha: a su evento (en un torneo sin liga, a la portada). */
export const feedEventUrl = (league: Pick<League, 'kind'>, base: string, ev: Pick<BowlingEvent, 'id'>): string => (league.kind === 'torneo' ? base : `${base}/e/${ev.id}`);

/** Debajo de lo de hoy: «En juego · 3 jugando» (con el punto), «Hoy a las 7:00 p. m.» o «Hoy». */
export function todayLine(info: Pick<LiveInfo, 'live' | 'startLabel'>, playing: number): { live: boolean; text: string } {
  if (info.live) return { live: true, text: `En juego${playing > 0 ? ` · ${playing} jugando` : ''}` };
  return { live: false, text: info.startLabel ? `Hoy a las ${info.startLabel}` : 'Hoy' };
}

/** Juegos de cada jugador del evento, de la mejor serie a la peor, con sus distinciones. */
export function feedPosts(event: BowlingEvent, entries: readonly Entry[], nameOf: Map<string, string>, uidOf: Map<string, string>, live: boolean): FeedPost[] {
  // En juego se ven también los juegos sin verificar (en vivo); en los pasados, solo los que cuentan.
  const lines = entries.map((entry) => ({ entry, line: entryLine(entry, event, live) })).filter((p) => p.line.games > 0);
  const many = lines.length > 1;
  const best = Math.max(0, ...lines.map((p) => p.line.high));
  const bestSeries = Math.max(0, ...lines.map((p) => p.line.scratch));
  return lines
    .map(({ entry, line }) => {
      const badges: string[] = [];
      if (line.high === 300) badges.push('¡Juego perfecto!');
      else if (many && line.high === best) badges.push('Mejor juego');
      if (many && line.games > 1 && line.scratch === bestSeries) badges.push('Mejor serie');
      return { entry, line, name: nameOf.get(entry.playerId) ?? '(jugador borrado)', uid: uidOf.get(entry.playerId) ?? null, badges };
    })
    .sort((a, b) => b.line.scratch - a.line.scratch || b.line.high - a.line.high);
}

/** Lo que dice la fila de quien jugó al lector de pantalla: «Ver el juego de Ana: serie 574» (o «… 188 pinos»). */
export const postLabel = (post: Pick<FeedPost, 'name' | 'line'>): string =>
  `Ver el juego de ${post.name}: ${post.line.games > 1 ? `serie ${post.line.scratch}` : `${post.line.scratch} pinos`}`;

/** «2 reacciones, 1 comentarios» (lo que dicen el corazón y el globito de la fila). */
export const postCountsLabel = (likes: number, said: number): string =>
  [likes > 0 && `${likes} reacciones`, said > 0 && `${said} comentarios`].filter(Boolean).join(', ');
