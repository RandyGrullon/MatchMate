import { useMemo } from 'react';
import { byDate, countedFrames, entryStatGames, soloStatGames, type StatGame } from '../lib/bowlingStats';
import { usePlayerAcrossLeagues } from '../lib/data';
import { soloAsEntry, soloOldestFirst, type SoloSession } from '../lib/data/solo';
import { eventLabel, formatDate, toIsoDate } from '../lib/format';
import { calcHandicap, playerStats, type PlayerStats } from '../lib/stats';
import type { BowlingEvent, Entry, GameFrames, League, Member } from '../lib/types';
import { useNow } from '../lib/useNow';
import { leagueSport, sportsOf } from '../sports/registry';

/**
 * Los números del boliche de la cuenta, todo junto (sus ligas, torneos y juegos sueltos), sin pantallas: los usan Yo y
 * «Por liga y temporada» de la web (GlobalStats.tsx, ProfilePage.tsx) y la pestaña Yo de la app del teléfono.
 */

interface Played {
  lid: string;
  entry: Entry;
  event: BowlingEvent;
}

/** Una liga de otro deporte en el perfil global: sus números están en el perfil de esa liga. */
export interface SportLeagueLink {
  lid: string;
  name: string;
  sport: string;
  kind: League['kind'];
}

/**
 * Separa las membresías: las del boliche (el perfil global suma pinos, promedios y series) y las ligas de los
 * otros deportes, que llevan sus números en el perfil de cada liga. Una liga que no se pudo leer se queda con
 * el boliche, como antes (sale sin juegos).
 */
export function splitBySport(memberships: Member[], leagues: League[]): { bowling: Member[]; others: SportLeagueLink[] } {
  const byId = new Map(leagues.map((l) => [l.id, l]));
  const bowling: Member[] = [];
  const others: SportLeagueLink[] = [];
  for (const m of memberships) {
    const league = byId.get(m.leagueId);
    if (!league || leagueSport(league) === 'bowling') bowling.push(m);
    else if (!others.some((o) => o.lid === league.id)) others.push({ lid: league.id, name: league.name, sport: leagueSport(league), kind: league.kind });
  }
  const order = sportsOf(others.map((o) => ({ id: o.lid, sport: o.sport })));
  others.sort((a, b) => order.indexOf(a.sport) - order.indexOf(b.sport) || a.name.localeCompare(b.name));
  return { bowling, others };
}

/** Los números del boliche de la cuenta, todo junto (sus ligas, torneos y juegos sueltos). Solo cuentan los verificados. */
export interface BowlingNumbers {
  all: PlayerStats;
  /** Los juegos que cuentan, del más viejo al más nuevo (con su texto para la gráfica). */
  games: StatGame[];
  /** Los cuadros que cuadran con el puntaje (Teclado y Pines). */
  frames: GameFrames[];
  /** Eventos de sus ligas con al menos un juego que cuenta. */
  attended: number;
  /** Eventos de sus ligas desde el primero al que fue hasta hoy (el de hoy, solo si ya jugó). */
  held: number;
  tournaments: number;
  practices: number;
  /** Por liga, con los mismos juegos que el total (también las que no tienen juegos), la de más juegos primero. */
  perLeague: { lid: string; name: string; stats: PlayerStats }[];
  /** Los juegos sueltos (null si no tiene). */
  solo: PlayerStats | null;
  /** Por año, del más nuevo al más viejo. */
  years: { year: string; stats: PlayerStats }[];
  /** Su handicap en el último torneo con handicap en que está inscrito (null si no hay). */
  hcp: number | null;
}

/**
 * Lo que suma el perfil global (sin leer la base: sirve para probarlo). `across`: las participaciones y los eventos de
 * cada liga; `solo`: los juegos sueltos, del más viejo al más nuevo; `today`: 'YYYY-MM-DD'.
 */
export function bowlingNumbers({
  across,
  links,
  names,
  solo,
  today,
}: {
  across: readonly { lid: string; entries: readonly Entry[]; events: readonly BowlingEvent[] }[];
  links: readonly { lid: string }[];
  names: ReadonlyMap<string, string>;
  solo: readonly SoloSession[];
  today: string;
}): BowlingNumbers {
  const played: Played[] = across
    .flatMap(({ lid, entries, events }) => {
      const byId = new Map(events.map((e) => [e.id, e]));
      return entries.filter((e) => byId.has(e.eventId)).map((entry) => ({ lid, entry, event: byId.get(entry.eventId)! }));
    })
    .sort((a, b) => a.event.date.localeCompare(b.event.date));
  const soloEntries = solo.map(soloAsEntry);
  const all = playerStats([...played.map((p) => p.entry), ...soloEntries]);
  // Todos los juegos que cuentan (de las ligas y los sueltos), del más viejo al más nuevo: la tendencia y, con los
  // cuadros que cuadran con el puntaje, los porcentajes y el pino por pino.
  const games = byDate([
    ...played.flatMap(({ lid, entry, event }) =>
      entryStatGames(entry, event.date, (i) => `${names.get(lid) ?? 'Liga'} · ${eventLabel(event)} · J${i + 1} · ${formatDate(event.date)}`),
    ),
    ...solo.flatMap((s) =>
      soloStatGames(s, (i) => `${['Juego suelto', s.venue.trim()].filter(Boolean).join(' · ')} · J${i + 1} · ${formatDate(s.playedOn)}`),
    ),
  ]);
  const counted = played.filter(({ entry }) => entry.scores?.some((s, i) => s != null && entry.photos?.[i] != null));
  const tournaments = counted.filter((p) => p.event.type === 'torneo').length;

  // Asistencia: en cada liga, desde el primer evento al que fue hasta hoy (el de hoy cuenta solo si ya jugó).
  let held = 0;
  for (const { lid, events } of across) {
    const went = new Set(counted.filter((p) => p.lid === lid).map((p) => p.event.id));
    const first = counted.find((p) => p.lid === lid)?.event.date;
    if (!first) continue;
    held += events.filter((e) => e.date >= first && (e.date < today || went.has(e.id))).length;
  }

  // Por liga con los mismos juegos que el total (así las ligas suman el global); también las que no tienen juegos.
  const perLeague = links
    .map(({ lid }) => ({ lid, name: names.get(lid) ?? 'Liga', stats: playerStats(played.filter((p) => p.lid === lid).map((p) => p.entry)) }))
    .sort((a, b) => b.stats.games - a.stats.games || a.name.localeCompare(b.name));

  const byYear = new Map<string, Pick<Entry, 'scores' | 'photos'>[]>();
  const addYear = (date: string, e: Pick<Entry, 'scores' | 'photos'>) => byYear.set(date.slice(0, 4), [...(byYear.get(date.slice(0, 4)) ?? []), e]);
  for (const p of played) addYear(p.event.date, p.entry);
  solo.forEach((s, i) => addYear(s.playedOn, soloEntries[i]));
  const years = [...byYear.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([year, list]) => ({ year, stats: playerStats(list) }));

  // El handicap: el del último torneo con handicap en que está inscrito (el fijado a mano, o con el promedio con que
  // entró; si todavía no tiene, con su promedio de ahora).
  const torneo = [...played].reverse().find(({ entry, event }) => event.type === 'torneo' && (event.hcpPercent > 0 || entry.handicapOverride != null));
  const hcp = torneo
    ? (torneo.entry.handicapOverride ?? calcHandicap(torneo.entry.average || all.autoAverage || 0, torneo.event.hcpBase, torneo.event.hcpPercent))
    : null;

  return {
    all,
    games,
    frames: countedFrames(games),
    attended: counted.length,
    held: Math.max(held, counted.length),
    tournaments,
    practices: counted.length - tournaments,
    perLeague,
    solo: solo.length ? playerStats(soloEntries) : null,
    years,
    hcp,
  };
}

/** Cómo están los números del boliche: listos, leyéndose, con error o sin nada que sumar (y si su jugador se está creando). */
export type BowlingNumbersState =
  | { status: 'ready'; data: BowlingNumbers }
  | { status: 'loading' }
  | { status: 'error'; error: Error }
  | { status: 'none'; preparing: string | null };

const NO_SOLO: SoloSession[] = [];

/**
 * Los números del boliche de la cuenta (Yo y «Por liga y temporada»): sus ligas de boliche (`memberships`, ver
 * splitBySport) y sus juegos sueltos (`solo`; sin pasarlos, no suma juegos sueltos).
 */
export function useBowlingNumbers(memberships: Member[], leagues: League[], solo: SoloSession[] = NO_SOLO, soloLoading = false): BowlingNumbersState {
  const links = useMemo(() => memberships.filter((m) => m.playerId).map((m) => ({ lid: m.leagueId, playerId: m.playerId! })), [memberships]);
  const across = usePlayerAcrossLeagues(links);
  const names = useMemo(() => new Map(leagues.map((l) => [l.id, l.name])), [leagues]);
  // Del más viejo al más nuevo, como los de las ligas (el mismo día, en el orden en que se anotaron).
  const soloOld = useMemo(() => soloOldestFirst(solo), [solo]);
  const today = toIsoDate(useNow());
  const data = useMemo(() => bowlingNumbers({ across: across.data, links, names, solo: soloOld, today }), [across.data, links, names, soloOld, today]);
  if (!links.length && !solo.length) {
    if (soloLoading) return { status: 'loading' };
    // Recién unido: su jugador se está creando (si no aparece, "Mis juegos" lo vuelve a intentar).
    return { status: 'none', preparing: memberships[0]?.leagueId ?? null };
  }
  if (across.error) return { status: 'error', error: across.error };
  if (across.loading || (soloLoading && !solo.length)) return { status: 'loading' };
  return { status: 'ready', data };
}
