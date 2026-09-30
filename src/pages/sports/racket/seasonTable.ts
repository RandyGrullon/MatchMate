import { useMemo } from 'react';
import { useMatches, type Match } from '../../../lib/data/matches';
import { useLeagueRules, useRacketEvents, useWithPendingPoints, type RacketEvent } from '../../../lib/data/racket';
import { useLeagueCtx } from '../../../lib/league';
import { inSeason, type Season } from '../../../lib/seasons';
import { useNow } from '../../../lib/useNow';
import { awardees, makeSnapshot, snapshotTable, type SeasonSnapshot, type SeasonTableResult, type SnapshotField, type SnapshotTable } from '../../../components/season/logic';
import { isGameSport, type RacketSport } from '../../../sports/racket';
import type { StandingRow } from '../../../sports/types';
import { engineRules } from './court/adapters';
import { parseLeagueConfig } from './logic/league';
import { byModality, MODALITY_LABEL } from './logic/modality';
import { isSetsMatch, pairStandings, seasonDay, seasonNightTable, seasonPlayerTable, type NightSeasonRow } from './logic/results';
import { groupStage, groupTables, parseTourneyConfig } from './logic/tourney';
import { useNames, type Names } from './names';
import type { RacketExtensions } from './sport';

/**
 * La temporada de raqueta (pádel, tenis, pickleball y ping pong): los partidos de sus fechas y sus tablas (las ligas de parejas
 * y los grupos de los torneos, las cajas y demás formatos del deporte, el ranking individual y las noches). La usan
 * la pantalla Tabla y Admin › Temporada (la foto que se guarda al cerrarla). Aquí la temporada va solo por fecha:
 * las parejas sirven de una temporada a otra.
 */

export interface Competition {
  key: string;
  name: string;
  rows: StandingRow[];
}

/** Tablas de las ligas de parejas y de los grupos de los torneos. */
export function competitions(sport: RacketSport, events: readonly RacketEvent[], matches: readonly Match[], now: number): Competition[] {
  const out: Competition[] = [];
  for (const e of events) {
    const list = matches.filter((m) => m.eventId === e.id);
    if (e.type === 'liga') {
      const cfg = parseLeagueConfig(e.config, e.date);
      if (cfg.pairs.length && list.length) out.push({ key: e.id, name: e.name || 'Liga', rows: pairStandings(sport, cfg.pairs, list, { scheme: cfg.points, lotSeed: e.id, now }) });
    } else if (e.type === 'torneo') {
      const cfg = parseTourneyConfig(e.config);
      for (const c of cfg.categories) {
        groupTables(sport, c, list, { scheme: cfg.points, now }).forEach((rows, g) => out.push({ key: `${e.id}:${c.id}:${g}`, name: `${e.name || 'Torneo'} · ${groupStage(c, g)}`, rows }));
      }
    }
  }
  return out;
}

/**
 * Los partidos de la temporada, por el día de cada uno (seasonDay: el del evento, o el del partido en escaleras y
 * cajas). Sin temporada, todos; uno sin día va en la activa.
 */
export function racketSeasonMatches<M extends Match>(
  matches: readonly M[],
  season: Pick<Season, 'startsOn' | 'endsOn' | 'status'> | null | undefined,
  events: ReadonlyMap<string, { date: string; type: string }>,
  tz?: string | null,
): M[] {
  if (!season) return [...matches];
  return matches.filter((m) => {
    const day = seasonDay(m, events, tz);
    return day ? inSeason(season, day) : season.status === 'active';
  });
}

/** Todo lo de la temporada (sin temporada: todo lo de la liga). */
export function useRacketSeason(season: Season | null, sport: RacketSport, ext: RacketExtensions) {
  const { lid, league } = useLeagueCtx();
  const names = useNames();
  const now = useNow().getTime();
  const events = useRacketEvents(lid);
  const q = useMatches({ lid });
  const all = useWithPendingPoints(lid, q.data);
  const eventDays = useMemo(() => new Map(events.data.map((e) => [e.id, { date: e.date, type: e.type }] as const)), [events.data]);
  const matches = useMemo(() => racketSeasonMatches(all, season, eventDays, league.tz), [all, season, eventDays, league.tz]);
  const comps = useMemo(
    () => [...competitions(sport, events.data, matches, now), ...(ext.competitions?.(events.data, matches, now) ?? [])],
    [sport, events.data, matches, now, ext],
  );
  // Individual y dobles van por separado (tenis, pickleball y ping pong pueden tener de los dos en la misma liga).
  const kinds = useMemo(() => byModality(matches.filter(isSetsMatch), names.rosterOf), [matches, names]);
  const nights = useMemo(() => seasonNightTable(matches, { now }), [matches, now]);
  return { q, all, events, matches, comps, kinds, split: kinds.individual.length > 0 && kinds.dobles.length > 0, nights, names, now };
}

const signed = (n: number) => (n > 0 ? `+${n}` : n);

/** Columnas de las tablas de raqueta en la foto (las mismas de racketColumns, más Pts). */
export function racketFields(sport: string): SnapshotField<StandingRow>[] {
  const pk = isGameSport(sport);
  return [
    { label: 'PJ', title: 'Partidos jugados', value: (r) => r.played },
    { label: 'G', title: 'Ganados', value: (r) => r.won },
    { label: 'P', title: 'Perdidos', value: (r) => r.lost },
    { label: pk ? 'Jue.' : 'Sets', title: pk ? 'Diferencia de juegos' : 'Diferencia de sets', value: (r) => signed(r.extra[pk ? 'gamesDiff' : 'setsDiff'] ?? 0) },
    { label: pk ? 'PF' : 'JF', title: pk ? 'Puntos a favor' : 'Juegos a favor', wide: true, value: (r) => r.for },
    { label: pk ? 'PC' : 'JC', title: pk ? 'Puntos en contra' : 'Juegos en contra', wide: true, value: (r) => r.against },
    { label: 'Pts', title: 'Puntos de la tabla', value: (r) => r.points },
  ];
}

/**
 * La foto de la temporada de raqueta (puro, para probar): cada liga de parejas, grupo o caja; el ranking (por
 * modalidad si hay de las dos) y las noches.
 */
export function racketSnapshot(input: {
  sport: RacketSport;
  doubles: boolean;
  comps: readonly Competition[];
  rankings: readonly { key: string; title: string; rows: StandingRow[] }[];
  nights: readonly NightSeasonRow[];
  nightsWord: string;
  names: Pick<Names, 'entrantName' | 'nameOf' | 'team'>;
  now?: number;
}): SeasonSnapshot {
  const { sport, names } = input;
  const fields = racketFields(sport);
  const entrant = (r: StandingRow) => {
    const pair = names.team(r.id);
    if (pair) return { name: pair.name, teamId: r.id };
    if (r.id.startsWith('p:')) return { name: names.entrantName(r.id) };
    return { name: names.entrantName(r.id), playerId: r.id };
  };
  const player = (r: { id: string }) => ({ name: names.nameOf(r.id), playerId: r.id });
  const tables: SnapshotTable[] = [
    ...input.rankings.map((x) => snapshotTable({ key: x.key, title: x.title, nameLabel: 'Jugador' }, x.rows, fields, player)),
    ...input.comps.map((c) => snapshotTable({ key: c.key, title: c.name, nameLabel: input.doubles ? 'Pareja' : 'Jugador' }, c.rows, fields, entrant)),
    snapshotTable<NightSeasonRow>(
      { key: 'noches', title: input.nightsWord, nameLabel: 'Jugador' },
      input.nights,
      [
        { label: 'Noches', title: 'Noches', value: (r) => r.nights },
        { label: 'PJ', title: 'Partidos jugados', value: (r) => r.played },
        { label: 'G', title: 'Ganados', value: (r) => r.won },
        { label: 'Prom.', title: 'Puntos por partido', wide: true, value: (r) => r.avg },
        { label: 'Pts', title: 'Puntos', value: (r) => r.points },
      ],
      player,
    ),
  ];
  return makeSnapshot(sport, tables, input.now);
}

/** Los rankings de la temporada: uno, o individual y dobles por separado. */
export function racketRankings(data: Pick<ReturnType<typeof useRacketSeason>, 'kinds' | 'split' | 'matches' | 'names' | 'now'>, sport: RacketSport, lotSeed: string) {
  const table = (list: readonly Match[]) => seasonPlayerTable(list, { sport, rosterOf: data.names.rosterOf, lotSeed, now: data.now });
  return data.split
    ? (['individual', 'dobles'] as const).map((k) => ({ key: `ranking:${k}`, title: `Ranking ${MODALITY_LABEL[k].toLowerCase()}`, rows: table(data.kinds[k]) }))
    : [{ key: 'ranking', title: 'Ranking', rows: table(data.matches) }];
}

/**
 * Admin › Temporada de raqueta (SportScreens.useSeasonTable, desde racketScreens): la foto de esa temporada y a
 * quién se le pueden dar premios (parejas y jugadores). Sin el contexto de las pantallas: recibe el deporte.
 */
export function useRacketSeasonTable(season: Season, sport: RacketSport, ext: RacketExtensions): SeasonTableResult {
  const { lid } = useLeagueCtx();
  const leagueRules = useLeagueRules(lid).data;
  const data = useRacketSeason(season, sport, ext);
  const doubles = useMemo(() => engineRules(sport, leagueRules).doubles, [sport, leagueRules]);
  const loading = (data.q.loading && !data.q.data.length) || (data.names.loading && !data.names.players.length);
  return useMemo(() => {
    const snapshot = racketSnapshot({
      sport,
      doubles,
      comps: data.comps,
      rankings: racketRankings(data, sport, lid),
      nights: data.nights,
      nightsWord: ext.words?.nights ?? 'Noches',
      names: data.names,
    });
    return {
      loading,
      snapshot,
      teams: awardees(data.names.teams.map((t) => ({ id: t.id, name: t.name }))),
      players: awardees(data.names.players.map((p) => ({ id: p.id, name: p.name }))),
    };
  }, [data, sport, doubles, lid, ext, loading]);
}
