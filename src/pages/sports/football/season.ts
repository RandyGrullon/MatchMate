import { useMemo } from 'react';
import { finalMatches, isFinal, sideKey, type Match } from '../../../lib/data/matches';
import { useNow } from '../../../lib/useNow';
import type { FootballVariant } from '../../../sports/team/football';
import {
  disciplineReport,
  suspendedFor,
  type DisciplineAdjustment,
  type DisciplineConfig,
  type DisciplineMatch,
  type DisciplineReport,
  type DisciplineStatus,
  type Suspended,
} from '../../../sports/team/discipline';
import { footballStandings, type FootballTableConfig, type TeamMatchResult } from '../../../sports/team/standings';
import { footballTotals, type FootballTotals } from '../../../sports/team/stats';
import type { StandingRow } from '../../../sports/types';
import type { TeamLeague } from '../team/useTeamLeague';
import { cardLinesOf, matchLines, matchResultOf, seasonLines, type SeasonLine } from './adapter';
import { useFootballSanctions, type FootballSanction } from './data';
import { disciplineFrom, footballTableFrom, variantOf } from './rules';

/**
 * La temporada de fútbol o sala calculada en el teléfono (cada liga es de una sola modalidad: sus estadísticas nunca
 * se mezclan con las de la otra):
 * - tabla 3-1-0 con los desempates de la liga y la regla que decidió cada puesto (y una por grupo en el torneo
 *   relámpago; la eliminatoria no suma en la tabla);
 * - goleadores, tarjetas y vallas invictas (de las actas publicadas: `score.lines`);
 * - disciplina: suspensiones automáticas (rojas, amarillas acumuladas) más las del comité, que se cumplen en el
 *   siguiente partido que el equipo juegue de verdad (aplazados y descansos no cuentan); quién está suspendido
 *   para el próximo partido de cada equipo y quién jugó estando suspendido.
 */

/** Tarjetas de un jugador en la temporada (también las vistas desde el banco). */
export interface CardRow {
  player: string;
  team: string;
  yellows: number;
  /** Rojas por doble amarilla. */
  secondYellows: number;
  /** Rojas directas. */
  reds: number;
  /** Puntos de juego limpio (FIFA: amarilla −1, doble amarilla −3, roja −4, amarilla + roja −5). */
  fairPlay: number;
}

/** Suspendido para el próximo partido de su equipo. */
export interface SuspendedNext extends Suspended {
  matchId: string;
}

export interface GroupTable {
  stage: string;
  rows: StandingRow[];
}

export interface FootballSeason {
  /** Tabla de la liga (en el torneo relámpago, la de todos los partidos de grupos juntos). */
  standings: StandingRow[];
  /** Torneo relámpago: una tabla por grupo («Grupo A», «Grupo B»…). */
  groups: GroupTable[];
  scorers: FootballTotals[];
  cards: CardRow[];
  /** Porteros: los que atajaron algún partido, por vallas invictas y menos goles recibidos. */
  keepers: FootballTotals[];
  lines: SeasonLine[];
  results: TeamMatchResult[];
  /** Los partidos como los ve la disciplina (en orden). */
  disciplineMatches: DisciplineMatch[];
  discipline: DisciplineReport;
  /** Suspendidos para el próximo partido de cada equipo. */
  suspendedNext: SuspendedNext[];
  adjustments: DisciplineAdjustment[];
}

/** «Grupo A»… (partidos de la fase de grupos del torneo relámpago). */
export const isGroupStage = (stage: string) => /^grupo\s+\S+/i.test(stage.trim());

/** Partido de eliminatoria (cuadro): no suma en la tabla. */
export const isKnockout = (m: Pick<Match, 'bracketKey'>) => !!m.bracketKey;

/** Estado de un partido para la disciplina: jugado, programado (se da por jugado al proyectar), aplazado, W.O., anulado. */
export function disciplineStatus(m: Pick<Match, 'status'>): DisciplineStatus {
  switch (m.status) {
    case 'finished':
    case 'confirmed':
    case 'disputed':
      return 'played';
    case 'walkover':
      return 'walkover';
    case 'void':
      return 'cancelled';
    case 'postponed':
    case 'suspended':
      return 'postponed';
    default:
      return 'scheduled';
  }
}

const isoOf = (v: string | null | undefined): string | null => (v && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null);

/**
 * Orden en el calendario: la fecha y la jornada (no la jornada primero: los aplazados se juegan fuera de orden).
 * Un partido sin fecha que ya tiene resultado va cuando se anotó (propuesto o confirmado; el W.O. también se
 * confirma): la roja de un partido armado sin horario se cumple en el siguiente del equipo. Solo los que no tienen
 * ninguna fecha (sin jugar y sin programar) van al final, por jornada.
 */
export function disciplineOrder(m: Pick<Match, 'scheduledAt' | 'round'> & Partial<Pick<Match, 'proposedAt' | 'confirmedAt'>>): string {
  const when = isoOf(m.scheduledAt) ?? isoOf(m.proposedAt) ?? isoOf(m.confirmedAt) ?? '9999-12-31T23:59:59.999Z';
  return `${when}#${String(m.round ?? 999).padStart(3, '0')}`;
}

/** Los partidos de la temporada entre equipos, como los usa src/sports/team/discipline. */
export function toDisciplineMatches(matches: readonly Match[]): DisciplineMatch[] {
  return matches
    .filter((m) => m.sides.every((s) => s.teamId))
    .map((m) => {
      const status = disciplineStatus(m);
      const teams = m.sides.map((s) => s.teamId!) as string[];
      const out: DisciplineMatch = { id: m.id, order: disciplineOrder(m), teams, status };
      if (status === 'played') {
        const lines = matchLines(m);
        out.cards = cardLinesOf(m);
        out.present = m.sides.map((s) => ({ team: s.teamId!, players: lines.filter((l) => l.side === s.side && l.played).map((l) => l.playerId) }));
      }
      return out;
    });
}

export const toAdjustments = (list: readonly FootballSanction[]): DisciplineAdjustment[] =>
  list.map((s) => ({ player: s.playerId, team: s.teamId, matchId: s.matchId, matches: s.matches, ...(s.note ? { note: s.note } : {}) }));

/** Suspendidos para un partido (ids de jugador → cuántos partidos le faltan contando ese). */
export function suspendedIn(dm: readonly DisciplineMatch[], matchId: string, cfg: DisciplineConfig, adjustments: readonly DisciplineAdjustment[]): Suspended[] {
  if (!dm.some((m) => m.id === matchId)) return [];
  return suspendedFor(dm, matchId, cfg, adjustments);
}

/** El próximo partido de cada equipo (programado o en juego) y quién está suspendido para él. */
export function suspendedForNext(dm: readonly DisciplineMatch[], cfg: DisciplineConfig, adjustments: readonly DisciplineAdjustment[]): SuspendedNext[] {
  const sorted = [...dm].sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : a.id < b.id ? -1 : 1));
  const nextByTeam = new Map<string, string>();
  for (const m of sorted) {
    if (m.status !== 'scheduled') continue;
    for (const t of m.teams) if (!nextByTeam.has(t)) nextByTeam.set(t, m.id);
  }
  const out: SuspendedNext[] = [];
  const done = new Map<string, Suspended[]>();
  for (const [team, matchId] of nextByTeam) {
    let list = done.get(matchId);
    if (!list) {
      list = suspendedFor(dm, matchId, cfg, adjustments);
      done.set(matchId, list);
    }
    for (const s of list) if (s.team === team) out.push({ ...s, matchId });
  }
  return out.sort((a, b) => a.team.localeCompare(b.team) || a.player.localeCompare(b.player));
}

/** Tarjetas de la temporada por jugador (de los partidos que cuentan). */
export function cardTable(lines: readonly SeasonLine[], fair = { yellow: -1, secondYellow: -3, red: -4, yellowRed: -5 }): CardRow[] {
  const by = new Map<string, CardRow>();
  for (const l of lines) {
    if (!l.yellows && !l.red) continue;
    const r = by.get(l.playerId) ?? { player: l.playerId, team: l.team, yellows: 0, secondYellows: 0, reds: 0, fairPlay: 0 };
    r.team = l.team;
    r.yellows += l.yellows;
    if (l.red === 'second_yellow') {
      r.secondYellows++;
      r.fairPlay += fair.secondYellow;
    } else if (l.red === 'direct') {
      r.reds++;
      r.fairPlay += l.yellows > 0 ? fair.yellowRed : fair.red;
    } else r.fairPlay += fair.yellow * l.yellows;
    by.set(l.playerId, r);
  }
  return [...by.values()].sort((a, b) => a.fairPlay - b.fairPlay || b.reds - a.reds || b.yellows - a.yellows || a.player.localeCompare(b.player));
}

/**
 * La temporada completa. `teamIds` = equipos de la liga (todos salen en la tabla, también sin partidos).
 * Solo partidos entre equipos de la temporada; los anulados y aplazados no cuentan.
 */
export function footballSeason(input: {
  matches: readonly Match[];
  teamIds: readonly string[];
  rules: unknown;
  sanctions?: readonly FootballSanction[];
  now: number;
}): FootballSeason {
  const { now } = input;
  const known = new Set(input.teamIds);
  const between = input.matches.filter((m) => m.sides.every((s) => s.teamId && known.has(s.teamId)));
  const table: FootballTableConfig = footballTableFrom(input.rules);
  const cfg = disciplineFrom(input.rules);
  const tableMatches = between.filter((m) => !isKnockout(m));
  const results = finalMatches(tableMatches, now)
    .map(matchResultOf)
    .filter((r): r is TeamMatchResult => r !== null);
  const groupNames = [...new Set(tableMatches.map((m) => m.stage.trim()).filter(isGroupStage))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  const groups: GroupTable[] = groupNames.map((stage) => {
    const ms = tableMatches.filter((m) => m.stage.trim() === stage);
    const ids = [...new Set(ms.flatMap((m) => m.sides.map((s) => sideKey(s))))];
    const set = new Set(ms.map((m) => m.id));
    return { stage, rows: footballStandings(ids, results.filter((r) => set.has(r.id)), table) };
  });
  const lines = seasonLines(between, now);
  const played = lines.filter((l) => l.played);
  const scorers = footballTotals(
    played.map((l) => ({
      player: l.playerId,
      team: l.team,
      goals: l.goals,
      assists: l.assists,
      ownGoals: l.ownGoals,
      yellows: l.yellows,
      red: l.red,
      keeper: l.keeper,
      conceded: l.conceded,
      cleanSheet: l.cleanSheet,
    })),
  );
  const keepers = scorers
    .filter((s) => s.keeperGames > 0)
    .sort((a, b) => b.cleanSheets - a.cleanSheets || a.conceded / a.keeperGames - b.conceded / b.keeperGames || b.keeperGames - a.keeperGames || a.player.localeCompare(b.player));
  const adjustments = toAdjustments(input.sanctions ?? []);
  const dm = toDisciplineMatches(between);
  return {
    standings: footballStandings(input.teamIds, results, table),
    groups,
    scorers,
    cards: cardTable(lines, table.fairPlay),
    keepers,
    lines,
    results,
    disciplineMatches: dm,
    discipline: disciplineReport(dm, cfg, adjustments),
    suspendedNext: suspendedForNext(dm, cfg, adjustments),
    adjustments,
  };
}

/** La variante de la liga (campo o sala) y la temporada, al día con la caché y el tiempo real. */
export function useFootballSeason(tl: TeamLeague): FootballSeason {
  const now = useNow(5 * 60_000).getTime();
  const sanctions = useFootballSanctions(tl.lid);
  const teamIds = tl.teams.data.map((t) => t.id);
  const key = teamIds.join();
  return useMemo(
    () => footballSeason({ matches: tl.matches.data, teamIds: key ? key.split(',') : [], rules: tl.rules.data, sanctions: sanctions.data, now }),
    [tl.matches.data, key, tl.rules.data, sanctions.data, now],
  );
}

/** Variante de la liga abierta (campo o sala). */
export const useVariant = (tl: Pick<TeamLeague, 'league'>): FootballVariant => variantOf(tl.league.sport);

/**
 * Tabla final de un grupo del torneo relámpago (ids en orden) o null si ese grupo todavía tiene partidos que no
 * cuentan (por jugar, en juego o por confirmar). Los anulados no frenan.
 */
export function groupRanking(season: Pick<FootballSeason, 'groups'>, matches: readonly Match[], stage: string, now: number = Date.now()): string[] | null {
  const ms = matches.filter((m) => m.stage.trim() === stage && !m.bracketKey);
  if (!ms.length || !ms.every((m) => m.status === 'void' || isFinal(m, now))) return null;
  return season.groups.find((g) => g.stage === stage)?.rows.map((r) => r.id) ?? null;
}
