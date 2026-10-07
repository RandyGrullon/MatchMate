import { useEffect, useMemo, useState } from 'react';
import { gameKey, memoryKeyOf, myGamesPlace, readGameDraft, storageKey, type GameMemory } from '../components/frames/draftMemory';
import { useAuth } from './auth';
import { scoreGame } from './bowling';
import { useEventEntries, type LeagueFeed } from './data';
import { useDraft, type GameDraft } from './draft';
import { parseDate, toIsoDate } from './format';
import { slots } from './stats';
import type { BowlingEvent, Entry, League, Submission } from './types';
import { leagueSport } from '../sports/registry';

/**
 * Qué significa «Anotar» ahora (rediseño «Calma y foco»): el juego que te toca en el evento de hoy, el que dejaste a
 * medias en la hoja de anotar (draftMemory: «Seguimos donde lo dejaste») o, si no hay ninguno, «¿Dónde jugaste?» (un
 * evento reciente o un juego suelto). Lo usa Hoy (TodayCard) y lo pueden usar la Liga, la Práctica y los avisos.
 *
 * Aquí no se anota nada: solo se decide a dónde lleva el botón. Anotar sigue siendo la hoja de siempre (MyGamesPanel +
 * ScoreEntryModal en la pantalla del evento, con `?anotar=1`), así la cola sin señal, el borrador del teléfono, la bola
 * de cada juego y el envío a revisión no cambian.
 */

/** Lo que dejó a medias en la hoja de anotar: lo que lleva («74») y cuánto del juego (cuadros hechos / 10). */
export interface PartialGame {
  score: number | null;
  progress: number | null;
}

/** Cómo está cada juego de la cuenta en el evento (la ficha de Hoy). */
export type GameCell =
  | { kind: 'tabla'; score: number; counted: boolean }
  | { kind: 'telefono'; score: number }
  | { kind: 'enviado'; score: number }
  | { kind: 'medias'; score: number | null; progress: number | null }
  | { kind: 'vacio' };

/** Lo que lleva un juego a medias (null si no hay nada en la memoria). */
export function partialGame(m: Pick<GameMemory, 'work'> | null | undefined): PartialGame | null {
  if (!m) return null;
  const { rolls, total } = m.work;
  if (rolls.length) {
    const g = scoreGame(rolls);
    // Cuadros terminados: strike o dos tiros (el 10.º, cuando se acaba el juego).
    const done = g.frames.filter((f, i) => (i < 9 ? f.rolls[0] === 10 || f.rolls.length >= 2 : g.complete)).length;
    return { score: g.score, progress: done / 10 };
  }
  const t = total.trim() === '' ? NaN : Number(total);
  return { score: Number.isFinite(t) ? t : null, progress: null };
}

/**
 * Los juegos de la cuenta en un evento, como los ve «Mis juegos»: en la tabla (verificado o no), guardado en el teléfono
 * sin enviar, enviado y por aprobar, a medias en la hoja de anotar, o sin anotar. `partial(i)` = lo que quedó a medias
 * del juego i (solo cuenta en un juego sin nada más).
 */
export function gameCells({
  games,
  entry,
  draft,
  subs,
  partial,
}: {
  games: number;
  entry: Pick<Entry, 'scores' | 'photos'> | null | undefined;
  draft: Pick<GameDraft, 'values'> | null | undefined;
  subs: readonly Pick<Submission, 'status' | 'scores' | 'createdAt'>[];
  partial?: (i: number) => PartialGame | null;
}): GameCell[] {
  const count = Math.max(games, draft?.values.length ?? 0);
  const scores = slots(entry?.scores, count, null);
  const photos = slots(entry?.photos, count, null);
  const newest = (s: Pick<Submission, 'createdAt'>) => s.createdAt?.toMillis() ?? Number.MAX_SAFE_INTEGER;
  const pending = subs.filter((s) => s.status === 'pendiente').sort((a, b) => newest(b) - newest(a));
  return Array.from({ length: count }, (_, i): GameCell => {
    if (scores[i] != null) return { kind: 'tabla', score: scores[i]!, counted: photos[i] != null };
    const typed = draft?.values[i]?.trim();
    if (typed) return { kind: 'telefono', score: Number(typed) };
    const sent = pending.find((s) => s.scores[i] != null)?.scores[i];
    if (sent != null) return { kind: 'enviado', score: sent };
    const p = partial?.(i);
    if (p) return { kind: 'medias', score: p.score, progress: p.progress };
    return { kind: 'vacio' };
  });
}

/** La serie: los juegos que ya tienen número (tabla, teléfono o enviado; no el que va a medias). */
export const seriesOf = (cells: readonly GameCell[]) =>
  cells.reduce((sum, c) => sum + (c.kind === 'tabla' || c.kind === 'telefono' || c.kind === 'enviado' ? c.score : 0), 0);

/** La pantalla de un evento, y la misma abriendo la hoja de anotar en el juego que sigue (MyGamesPanel `autoStart`). */
export const eventPath = (lid: string, eventId: string) => `/l/${lid}/e/${eventId}`;
export const scorePath = (lid: string, eventId: string) => `${eventPath(lid, eventId)}?anotar=1`;
/** La planilla (la tabla del admin o del anotador). */
export const sheetPath = (lid: string, eventId: string) => `${eventPath(lid, eventId)}?tab=juegos`;

/** Lo que hace el botón principal. */
export type NextGame =
  /** Un juego a medias en la hoja de anotar: «Seguir mi juego 3». */
  | { kind: 'medias'; game: number; progress: number | null; to: string }
  /** El que sigue, sin anotar: «Anotar juego 3». */
  | { kind: 'anotar'; game: number; to: string }
  /** Ya anotó todos y quedan en el teléfono: «Enviar mis juegos». */
  | { kind: 'enviar'; count: number; to: string }
  /** No falta nada (enviados o en la tabla): «Ver mis juegos». */
  | { kind: 'ver'; pending: boolean; to: string }
  /** Sin jugador en la liga: «Preparar mi jugador». */
  | { kind: 'preparar'; to: string }
  /** Organiza o anota el evento y no juega: la planilla. */
  | { kind: 'planilla'; to: string };

/**
 * El botón de la tarjeta de hoy. Cada cuenta anota sus juegos en su teléfono (el dueño y los admins también juegan);
 * en un torneo, quien lo organiza o lo anota juega solo si ya empezó sus juegos (si no, lo suyo es la planilla).
 */
export function nextGame({
  lid,
  event,
  playerId,
  staff,
  cells,
  hasSubs,
  today,
}: {
  lid: string;
  event: Pick<BowlingEvent, 'id' | 'type' | 'date'>;
  playerId: string | null | undefined;
  staff: boolean;
  cells: readonly GameCell[];
  hasSubs: boolean;
  today: string;
}): NextGame {
  const url = eventPath(lid, event.id);
  const started = hasSubs || cells.some((c) => c.kind !== 'vacio');
  const player = !!playerId && !(staff && event.type === 'torneo' && !started);
  if (!player) return staff ? { kind: 'planilla', to: sheetPath(lid, event.id) } : { kind: 'preparar', to: `/l/${lid}/perfil` };
  // El que sigue es el primero sin número (MyGamesPanel abre ese con ?anotar=1): si quedó a medias, se sigue.
  const first = event.date <= today ? cells.findIndex((c) => c.kind === 'vacio' || c.kind === 'medias') : -1;
  if (first >= 0) {
    const c = cells[first];
    return c.kind === 'medias'
      ? { kind: 'medias', game: first + 1, progress: c.progress, to: scorePath(lid, event.id) }
      : { kind: 'anotar', game: first + 1, to: scorePath(lid, event.id) };
  }
  const inPhone = cells.filter((c) => c.kind === 'telefono').length;
  if (inPhone) return { kind: 'enviar', count: inPhone, to: url };
  return { kind: 'ver', pending: cells.some((c) => c.kind === 'enviado'), to: url };
}

/** El texto del botón. Pro, más corto («Seguir juego 3»). */
export function nextGameLabel(n: NextGame, { pro = false }: { pro?: boolean } = {}): string {
  switch (n.kind) {
    case 'medias':
      return pro ? `Seguir juego ${n.game}` : `Seguir mi juego ${n.game}`;
    case 'anotar':
      return `Anotar juego ${n.game}`;
    case 'enviar':
      return n.count === 1 ? 'Enviar mi juego' : 'Enviar mis juegos';
    case 'ver':
      return 'Ver mis juegos';
    case 'preparar':
      return 'Preparar mi jugador';
    case 'planilla':
      return pro ? 'Planilla' : 'Anotar juegos de todos';
  }
}

// ---------- Juegos a medias en cualquier evento (la memoria de la hoja de anotar) ----------

/** Un juego que quedó a medias en la hoja de anotar de «Mis juegos» de un evento. */
export interface StartedGame {
  lid: string;
  playerId: string;
  eventId: string;
  /** Número del juego (desde 1). */
  game: number;
  at: number;
  partial: PartialGame;
}

function safeStorage(): Pick<Storage, 'length' | 'key'> | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Los juegos a medias de la cuenta (del más nuevo al más viejo), de todas sus ligas: las claves de «Mis juegos» son
 * `juego:<cuenta>:<liga>:<jugador>:<evento>:<juego>` (myGamesPlace + gameKey). Los vencidos o dañados se borran al leerlos.
 */
export function startedGames(uid: string | null | undefined, now = Date.now(), store = safeStorage()): StartedGame[] {
  if (!uid || !store) return [];
  const prefix = storageKey(`${memoryKeyOf('juego', uid)}:`);
  const keys: string[] = [];
  try {
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k?.startsWith(prefix)) keys.push(k);
    }
  } catch {
    return [];
  }
  const out: StartedGame[] = [];
  for (const k of keys) {
    const [lid, playerId, eventId, n, ...rest] = k.slice(prefix.length).split(':');
    const game = Number(n);
    if (rest.length || !lid || !playerId || !eventId || eventId === '-' || !Number.isInteger(game) || game < 0) continue;
    const m = readGameDraft(gameKey(myGamesPlace(uid, lid, playerId, eventId), game), now);
    const partial = partialGame(m);
    if (m && partial) out.push({ lid, playerId, eventId, game: game + 1, at: m.at, partial });
  }
  return out.sort((a, b) => b.at - a.at);
}

/**
 * Un número que cambia cuando la memoria de la hoja de anotar pudo cambiar: al volver a la app o a la pestaña, y cuando
 * el teléfono guarda un juego (el borrador avisa con 'mm:borrador'). Así las fichas «A medias» no se quedan viejas.
 */
export function useMemoryTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    const onVisible = () => document.visibilityState === 'visible' && bump();
    window.addEventListener('focus', bump);
    window.addEventListener('storage', bump);
    window.addEventListener('mm:borrador', bump);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', bump);
      window.removeEventListener('storage', bump);
      window.removeEventListener('mm:borrador', bump);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return tick;
}

/** Los juegos de la cuenta en el evento de hoy (las fichas) y qué hace el botón. */
export interface TodayGames {
  cells: GameCell[];
  next: NextGame;
  /** La serie hasta ahora (sin el juego a medias). */
  series: number;
  /** Lo que lleva el juego a medias, si hay. */
  partial: { game: number; score: number | null } | null;
  /** Todavía se lee la tabla del evento: las fichas pueden cambiar. */
  loading: boolean;
}

/**
 * Los juegos de la cuenta en un evento de boliche y qué hace «Anotar» ahí: lo de la tabla, lo que guardó en este
 * teléfono, lo enviado y lo que dejó a medias en la hoja. `game` = el evento con lo de la cuenta en su liga (LeagueFeed);
 * null = no hay evento (devuelve null).
 */
export function useNextGame(game: { feed: LeagueFeed; event: BowlingEvent } | null, today: string): TodayGames | null {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const lid = game?.feed.lid;
  const eventId = game?.event.id;
  const playerId = game?.feed.playerId ?? null;
  const entries = useEventEntries(lid, eventId);
  const draft = useDraft(lid ?? '', playerId, eventId ?? '');
  const tick = useMemoryTick();

  return useMemo(() => {
    if (!game || !lid || !eventId) return null;
    const { feed, event } = game;
    const entry = playerId ? (entries.data.find((e) => e.playerId === playerId) ?? null) : null;
    const subs = feed.mySubs.filter((s) => s.eventId === event.id);
    const place = playerId ? myGamesPlace(uid, lid, playerId, event.id) : null;
    const cells = gameCells({
      games: event.games,
      entry,
      draft,
      subs,
      partial: (i) => (place ? partialGame(readGameDraft(gameKey(place, i))) : null),
    });
    const next = nextGame({ lid, event, playerId, staff: feed.isAdmin || feed.isScorer, cells, hasSubs: subs.length > 0, today });
    const at = cells.findIndex((c) => c.kind === 'medias');
    const half = at >= 0 ? cells[at] : null;
    return {
      cells,
      next,
      series: seriesOf(cells),
      partial: half?.kind === 'medias' ? { game: at + 1, score: half.score } : null,
      loading: entries.loading && !entries.data.length,
    };
    // tick: volver a leer la memoria de la hoja de anotar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, lid, eventId, playerId, uid, entries.data, entries.loading, draft, today, tick]);
}

// ---------- ¿Dónde jugaste? ----------

/** Un evento reciente de boliche donde la cuenta juega (para «¿Dónde jugaste?» y «Seguir mi juego» fuera de hoy). */
export interface RecentEvent {
  lid: string;
  leagueName: string;
  event: BowlingEvent;
  playerId: string;
}

const addDays = (iso: string, n: number) => {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return toIsoDate(d);
};

/**
 * Los eventos de boliche de ayer y de hoy donde la cuenta tiene jugador (la campana los lee desde ayer), del más nuevo al
 * más viejo: a dónde puede ir a anotar lo que jugó.
 */
export function recentEvents(feeds: readonly LeagueFeed[], leagues: readonly League[], today: string): RecentEvent[] {
  const yesterday = addDays(today, -1);
  const out: RecentEvent[] = [];
  for (const feed of feeds) {
    const league = leagues.find((l) => l.id === feed.lid);
    if (!league || leagueSport(league) !== 'bowling' || !feed.playerId) continue;
    for (const event of feed.events) {
      if (event.date >= yesterday && event.date <= today) out.push({ lid: feed.lid, leagueName: league.name, event, playerId: feed.playerId });
    }
  }
  return out.sort((a, b) => (a.event.date < b.event.date ? 1 : a.event.date > b.event.date ? -1 : a.leagueName.localeCompare(b.leagueName)));
}

/** El juego a medias más nuevo de un evento reciente (que no sea `skip`, el que ya sale en la tarjeta de hoy). */
export function resumeElsewhere(started: readonly StartedGame[], recent: readonly RecentEvent[], skip?: string | null): (StartedGame & { recent: RecentEvent }) | null {
  for (const s of started) {
    if (s.eventId === skip) continue;
    const r = recent.find((e) => e.event.id === s.eventId && e.lid === s.lid && e.playerId === s.playerId);
    if (r) return { ...s, recent: r };
  }
  return null;
}
