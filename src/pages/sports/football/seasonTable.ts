import { useMemo } from 'react';
import { isFinal, type Match } from '../../../lib/data/matches';
import type { Season } from '../../../lib/seasons';
import {
  awardees,
  makeSnapshot,
  snapshotTable,
  teamRef,
  withRank,
  type Podium,
  type SeasonSnapshot,
  type SnapshotField,
  type SeasonTableResult,
} from '../../../components/season/logic';
import type { FootballTotals } from '../../../sports/team/stats';
import type { StandingRow } from '../../../sports/types';
import { isPlayoffMatch } from '../team/playoffs';
import { useTeamLeague } from '../team/useTeamLeague';
import { useFootballSeason, type FootballSeason } from './season';

/** Cuántos goleadores y porteros se guardan al cerrar. */
const TOP = 20;

const signed = (n: number) => (n > 0 ? `+${n}` : n);

const TABLE_FIELDS: SnapshotField<StandingRow>[] = [
  { label: 'PJ', title: 'Partidos jugados', value: (r) => r.played },
  { label: 'G', title: 'Ganados', value: (r) => r.won },
  { label: 'E', title: 'Empatados', value: (r) => r.drawn },
  { label: 'P', title: 'Perdidos', value: (r) => r.lost },
  { label: 'GF', title: 'Goles a favor', wide: true, value: (r) => r.for },
  { label: 'GC', title: 'Goles en contra', wide: true, value: (r) => r.against },
  { label: 'Dif.', title: 'Diferencia de goles', value: (r) => signed(r.diff) },
  { label: 'Pts', title: 'Puntos de la tabla', value: (r) => r.points },
];

/**
 * La foto de la temporada de fútbol o sala: la tabla (o una por grupo en el torneo relámpago), los goleadores y
 * las vallas invictas (puro, para probar).
 */
export function footballSnapshot(
  season: Pick<FootballSeason, 'standings' | 'groups' | 'scorers' | 'keepers'>,
  sport: string,
  teamName: (id: string) => string,
  playerName: (id: string) => string,
  now?: number,
): SeasonSnapshot {
  const team = (r: StandingRow) => ({ name: teamName(r.id), teamId: r.id });
  const tables = season.groups.length
    ? season.groups.map((g) => snapshotTable({ key: `grupo:${g.stage}`, title: g.stage, nameLabel: 'Equipo' }, g.rows, TABLE_FIELDS, team))
    : [snapshotTable({ key: 'tabla', title: 'Tabla', nameLabel: 'Equipo' }, season.standings, TABLE_FIELDS, team)];
  const player = (r: FootballTotals) => ({ name: playerName(r.player), playerId: r.player });
  const scorers = snapshotTable<FootballTotals & { rank: number }>(
    { key: 'goleadores', title: 'Goleadores', nameLabel: 'Jugador' },
    withRank(
      season.scorers.filter((s) => s.goals > 0).slice(0, TOP),
      (s) => s.goals,
    ),
    [
      { label: 'PJ', title: 'Partidos jugados', value: (r) => r.games },
      { label: 'A', title: 'Asistencias', value: (r) => r.assists },
      { label: 'G', title: 'Goles', value: (r) => r.goals },
    ],
    player,
  );
  const keepers = snapshotTable<FootballTotals & { rank: number }>(
    { key: 'vallas', title: 'Vallas invictas', nameLabel: 'Portero' },
    withRank(
      season.keepers.filter((k) => k.cleanSheets > 0).slice(0, TOP),
      (k) => k.cleanSheets,
    ),
    [
      { label: 'PJ', title: 'Partidos de portero', value: (r) => r.keeperGames },
      { label: 'GR', title: 'Goles recibidos', value: (r) => r.conceded },
      { label: 'VI', title: 'Vallas invictas', value: (r) => r.cleanSheets },
    ],
    player,
  );
  return makeSnapshot(sport, [...tables, scorers, keepers], now);
}

type KnockoutMatch = Pick<Match, 'bracketKey' | 'status' | 'winner' | 'proposedAt' | 'sides'> & { seriesId?: string | null };

/**
 * Podio del cuadro del torneo relámpago (los partidos con bracketKey 'R<ronda>-<n>' que no son del playoff; 'P3' =
 * 3.er lugar): campeón y subcampeón de la final (la ronda más alta, un solo partido) y el ganador del 3.er lugar si se
 * jugó. null sin cuadro o con la final sin un resultado que cuente.
 */
export function knockoutPodium(matches: readonly KnockoutMatch[], now: number = Date.now()): [string, string, string | null] | null {
  const ko = matches.filter((m) => m.bracketKey && !isPlayoffMatch(m));
  const round = (m: KnockoutMatch) => Number(/^R(\d+)-\d+$/.exec(m.bracketKey ?? '')?.[1] ?? 0);
  const top = Math.max(0, ...ko.map(round));
  const finals = ko.filter((m) => top > 0 && round(m) === top);
  const result = (m: KnockoutMatch | undefined): [string, string] | null => {
    if (!m || !isFinal(m, now) || (m.winner !== 1 && m.winner !== 2)) return null;
    const w = m.sides[m.winner - 1]?.teamId;
    const l = m.sides[m.winner === 1 ? 1 : 0]?.teamId;
    return w && l ? [w, l] : null;
  };
  const final = finals.length === 1 ? result(finals[0]) : null;
  if (!final) return null;
  return [final[0], final[1], result(ko.find((m) => m.bracketKey === 'P3'))?.[0] ?? null];
}

/**
 * El podio que se propone al cerrar: el del cuadro del torneo relámpago si su final ya terminó; con grupos y sin
 * cuadro terminado, ninguno (la primera tabla es la del Grupo A: no sirve); si no, el de la tabla (undefined).
 */
export function footballPodium(season: Pick<FootballSeason, 'groups' | 'matches'>, now?: number): Podium | null | undefined {
  const ko = knockoutPodium(season.matches, now);
  if (ko) return [teamRef(ko[0]), teamRef(ko[1]), ko[2] ? teamRef(ko[2]) : ''];
  return season.groups.length ? null : undefined;
}

/** Admin › Temporada: la tabla de esa temporada para cerrarla (SportScreens.useSeasonTable). */
export function useFootballSeasonTable(season: Season): SeasonTableResult {
  const tl = useTeamLeague();
  const data = useFootballSeason(tl, season);
  const loading = (tl.matches.loading && !tl.matches.data.length) || (tl.allTeams.loading && !tl.allTeams.data.length);
  const sport = tl.league.sport ?? 'football';
  return useMemo(() => {
    const teams = tl.teamsFor(season);
    const teamName = (id: string) => tl.teamOf(id)?.name ?? '(equipo borrado)';
    return {
      loading,
      snapshot: footballSnapshot(data, sport, teamName, tl.nameOf),
      podium: footballPodium(data),
      teams: awardees(teams.map((t) => ({ id: t.id, name: t.name }))),
      players: awardees(teams.flatMap((t) => t.roster.map((r) => ({ id: r.playerId, name: tl.nameOf(r.playerId) })))),
    };
  }, [data, season, loading, sport, tl]);
}
