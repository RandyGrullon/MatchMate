import { dayKey } from '../../components/match/format';
import { isFinal, type Match } from '../data/matchCore';
import type { Playoff, PlayoffSeries } from '../data/playoffs';
import { num } from '../format';
import { seasonLines as basketballLines } from '../../pages/sports/basketball/adapter';
import { basketballSheets } from '../../pages/sports/basketball/excel';
import { basketballSeason } from '../../pages/sports/basketball/season';
import { seasonLines as footballLines } from '../../pages/sports/football/adapter';
import { footballSheets } from '../../pages/sports/football/excel';
import { footballSeason, scorersOf, type FootballSeason } from '../../pages/sports/football/season';
import { bestOfLabel, seriesGames, seriesRoundName, seriesScore } from '../../pages/sports/team/playoffs';
import { stageGroups, tournamentSetupOf } from '../../pages/sports/team/tournament';
import { playoffProvider, teamKoComplete, teamKoProvider, type TeamNames } from '../../prizes/sports';
import { roundName } from '../../sports/formats/knockout';
import { basketballTotals, type BasketballTotals, type FootballTotals } from '../../sports/team/stats';
import type { StandingRow } from '../../sports/types';
import { matchesTable, numCol, pendingCount, pendingNote, playedCount, standingHead } from './matches';
import { podiumsFrom, reportHeader, type ReportFact, type ReportLeague, type ReportRow, type ReportTable, type TournamentReport } from './model';
import type { ExcelSheet } from './sheets';

/**
 * El reporte de los deportes de equipo (baloncesto, fútbol y sala), con las tablas y los podios de la app:
 * - torneo relámpago (TournamentHub): el campeón y el podio de la eliminatoria (`teamKoProvider`), la tabla de cada
 *   grupo (la del deporte) y los partidos por fase; en «Individual», los goleadores o anotadores del torneo. Detalle
 *   del Excel: el de siempre de la liga (calendario, tabla, resultados, tarjetas y disciplina);
 * - playoff (PlayoffsPage): el podio del playoff (`playoffProvider`), las series y sus juegos; en «Individual», los
 *   goleadores o anotadores de los juegos del playoff.
 */

/** Nombres de la liga: jugadores y equipos (null si el equipo se borró) con su plantilla. */
export interface TeamReportNames {
  nameOf: (playerId: string) => string;
  teamName: (teamId: string) => string | null;
  rosterOf: (teamId: string) => readonly string[];
}

const isBasketball = (sport: string | null | undefined) => sport === 'basketball';

const prizeNames = (n: TeamReportNames): TeamNames => ({
  nameOf: n.nameOf,
  rosterOf: (id) => [...n.rosterOf(id)],
  teamName: (id) => n.teamName(id) ?? '(equipo borrado)',
});

/** El nombre de un lado: el equipo de ahora (si se borró, el copiado en el partido). */
const sideLabel = (n: TeamReportNames) => (m: Match, side: 1 | 2) => {
  const s = m.sides[side - 1];
  return (s.teamId ? n.teamName(s.teamId) : null) ?? (s.label || 'Por definir');
};

/** Puesto compartido cuando empatan en lo que ordena (como la tabla de líderes de la pantalla). */
function sharedRanks<T>(rows: readonly T[], value: (r: T) => number): number[] {
  let rank = 0;
  return rows.map((r, i) => (i === 0 || value(r) !== value(rows[i - 1]) ? (rank = i + 1) : rank));
}

// ---------- Tablas de posiciones y líderes ----------

function footballTable(title: string, rows: readonly StandingRow[], teamName: (id: string) => string, note?: string): ReportTable {
  return {
    title,
    ...(note ? { note } : {}),
    columns: [
      ...standingHead('Equipo'),
      numCol('PJ'),
      numCol('G'),
      numCol('E'),
      numCol('P'),
      numCol('GF'),
      numCol('GC'),
      numCol('Dif.'),
      numCol('Pts', { strong: true }),
      numCol('Juego limpio', { width: 12, only: 'excel' }),
    ],
    rows: rows.map((r) => [r.rank, teamName(r.id), r.played, r.won, r.drawn, r.lost, r.for, r.against, r.diff, r.points, r.extra.fairPlay ?? 0]),
    empty: 'Todavía no hay resultados.',
  };
}

function basketballTable(title: string, rows: readonly StandingRow[], teamName: (id: string) => string, note?: string): ReportTable {
  return {
    title,
    ...(note ? { note } : {}),
    columns: [...standingHead('Equipo'), numCol('PJ'), numCol('G'), numCol('P'), numCol('PF'), numCol('PC'), numCol('Dif.'), numCol('Pts', { strong: true })],
    rows: rows.map((r) => [r.rank, teamName(r.id), r.played, r.won, r.lost, r.for, r.against, r.diff, r.points]),
    empty: 'Todavía no hay resultados.',
  };
}

/** Goleadores: todos los que jugaron, con goles, asistencias, tarjetas y lo del portero (en el Excel). */
function scorersTable(title: string, rows: readonly FootballTotals[], n: TeamReportNames, note: string): ReportTable {
  const ranks = sharedRanks(rows, (r) => r.goals);
  return {
    title,
    note,
    columns: [
      { label: '#', align: 'center', place: true, width: 6 },
      { label: 'Jugador', width: 28 },
      { label: 'Equipo', width: 24 },
      numCol('PJ'),
      numCol('Goles', { strong: true }),
      numCol('Asist.', { width: 11 }),
      numCol('Autogoles', { width: 10 }),
      numCol('TA'),
      numCol('TR'),
      numCol('Portero: PJ', { width: 11, only: 'excel' }),
      numCol('Vallas invictas', { width: 11, only: 'excel' }),
      numCol('Goles recibidos', { width: 11, only: 'excel' }),
    ],
    rows: rows.map((r, i) => [ranks[i], n.nameOf(r.player), n.teamName(r.team) ?? '', r.games, r.goals, r.assists, r.ownGoals, r.yellows, r.reds, r.keeperGames, r.cleanSheets, r.conceded]),
    empty: 'Los goles salen del acta de cada partido (quién jugó y quién marcó).',
  };
}

/** Anotadores: todos los que jugaron, con puntos, promedio, máximo, triples, tiros libres y faltas. */
function leadersTable(title: string, rows: readonly BasketballTotals[], n: TeamReportNames, note: string): ReportTable {
  const ranks = sharedRanks(rows, (r) => r.points);
  return {
    title,
    note,
    columns: [
      { label: '#', align: 'center', place: true, width: 6 },
      { label: 'Jugador', width: 28 },
      { label: 'Equipo', width: 24 },
      numCol('PJ'),
      numCol('Puntos', { strong: true }),
      numCol('Prom.', { width: 9 }),
      numCol('Máx.'),
      numCol('Triples', { width: 9 }),
      numCol('TL'),
      numCol('Faltas'),
    ],
    rows: rows.map((r, i) => [ranks[i], n.nameOf(r.player), n.teamName(r.team) ?? '', r.games, r.points, r.avg, r.high, r.threes, r.ftm, r.fouls]),
    empty: 'Los puntos salen de la planilla de cada partido.',
  };
}

/** «Ana (Tigres) · 5 goles» (con empate, los nombres juntos). */
function topOf<T extends { player: string; team: string }>(rows: readonly T[], value: (r: T) => number, n: TeamReportNames, unit: readonly [string, string]): string | null {
  const best = Math.max(0, ...rows.map(value));
  if (!best) return null;
  const who = rows.filter((r) => value(r) === best).map((r) => `${n.nameOf(r.player)}${n.teamName(r.team) ? ` (${n.teamName(r.team)})` : ''}`);
  const names = who.length <= 3 ? who : [...who.slice(0, 3), `${who.length - 3} más`];
  return `${names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}` : names[0]} · ${num(best)} ${best === 1 ? unit[0] : unit[1]}`;
}

// ---------- Torneo relámpago ----------

export interface TeamKoReportInput {
  lid: string;
  league: ReportLeague;
  /** El nombre de la pantalla (el del evento o el de la liga). */
  title: string;
  /** Día del torneo ('YYYY-MM-DD'). */
  date?: string | null;
  /** Todos los partidos de la liga (el relámpago son los que no son de un playoff). */
  matches: readonly Match[];
  /** Los equipos del torneo. */
  teamIds: readonly string[];
  names: TeamReportNames;
  /** Reglas de la liga (tabla, disciplina y el armado del torneo). */
  rules: unknown;
  now: number;
  /** Fútbol y sala: la temporada que ya calculó la pantalla (con las sanciones del comité). */
  football?: FootballSeason;
}

export function teamKoReport(input: TeamKoReportInput): TournamentReport {
  const { league, matches, names, rules, now } = input;
  const basketball = isBasketball(league.sport);
  const tz = league.tz || 'America/Santo_Domingo';
  const teamName = (id: string) => names.teamName(id) ?? '(equipo borrado)';
  const ko = matches.filter((m) => !m.seriesId && m.status !== 'void');
  const who = prizeNames(names);
  // Terminado: cuenta la final (y el 3.er lugar, si se juega).
  const final = teamKoComplete(matches, now);
  const pending = pendingCount(ko, now);

  const setup = tournamentSetupOf(rules);
  const facts: ReportFact[] = [
    {
      label: 'Formato',
      value: [
        setup ? `${setup.groups === 1 ? '1 grupo' : `${setup.groups} grupos`}, ${setup.perGroup === 1 ? 'pasa 1' : `pasan ${setup.perGroup}`} de cada uno` : null,
        setup?.thirdPlace ? 'eliminatoria con 3.er lugar' : 'eliminatoria',
        `${num(input.teamIds.length)} equipos`,
      ]
        .filter(Boolean)
        .join(' · ')
        .replace(/^./, (c) => c.toUpperCase()),
    },
  ];

  const stages = stageGroups(ko);
  const general: ReportTable[] = [];
  let individual: ReportTable[];
  let sheets: ExcelSheet[];
  const highlights: ReportFact[] = [
    { label: 'Equipos', value: num(input.teamIds.length) },
    { label: 'Partidos jugados', value: num(playedCount(ko, now)) },
    ...(pending ? [{ label: 'Por jugar o confirmar', value: num(pending) }] : []),
  ];

  if (basketball) {
    // La tabla FIBA de cada grupo con sus partidos (la misma de «Pasar a la fase final»).
    for (const g of stages.filter((s) => !s.knockout)) {
      const ids = [...new Set(g.matches.flatMap((m) => m.sides.map((s) => s.teamId)).filter((x): x is string => !!x))];
      general.push(basketballTable(g.stage, basketballSeason(g.matches, ids, rules, now).standings, teamName));
    }
    const season = basketballSeason(matches, input.teamIds, rules, now);
    const top = topOf(season.leaders, (l) => l.points, names, ['punto', 'puntos']);
    const high = topOf(season.leaders, (l) => l.high, names, ['punto', 'puntos']);
    if (top) highlights.push({ label: 'Máximo anotador', value: top });
    if (high) highlights.push({ label: 'Más puntos en un partido', value: high });
    individual = [leadersTable('Anotadores', season.leaders, names, 'Todos los que jugaron (lista de presentes), con los puntos de la planilla de cada partido.')];
    // El detalle de siempre (los anotadores ya van enteros en «Individual»).
    sheets = basketballSheets({ leagueName: input.title, matches, season, teamName, playerName: names.nameOf, tz, now }).filter((s) => s.sheet !== 'Anotadores');
  } else {
    const season = input.football ?? footballSeason({ matches, teamIds: input.teamIds, rules, now });
    for (const g of season.groups) general.push(footballTable(g.stage, g.rows, teamName));
    const top = topOf(season.scorers, (s) => s.goals, names, ['gol', 'goles']);
    if (top) highlights.push({ label: 'Máximo goleador', value: top });
    const goals = season.scorers.reduce((n, s) => n + s.goals + s.ownGoals, 0);
    if (goals) highlights.push({ label: 'Goles', value: num(goals) });
    individual = [scorersTable('Goleadores', season.scorers, names, 'Todos los que jugaron (acta de cada partido). TA y TR: tarjetas amarillas y rojas.')];
    sheets = footballSheets({ leagueName: input.title, matches, season, teamName, playerName: names.nameOf, tz, now }).filter((s) => s.sheet !== 'Goleadores');
  }

  general.push(
    matchesTable({
      title: 'Partidos',
      sides: ['Local', 'Visita'],
      groups: stages.map((g) => ({ title: g.stage, matches: g.matches })),
      now,
      tz,
      sideName: sideLabel(names),
      empty: 'Todavía no hay partidos.',
    }),
  );

  return {
    ...reportHeader(league, { title: input.title, dates: input.date ?? [], facts }),
    final,
    notes: final ? [] : [pendingNote(pending) ?? 'El torneo todavía no termina: el podio puede cambiar.'],
    podiums: podiumsFrom({ kind: 'team_ko' }, teamKoProvider(matches, who, now)),
    prizes: [],
    highlights,
    general,
    individual,
    sheets,
  };
}

// ---------- Playoffs ----------

export interface PlayoffReportInput {
  lid: string;
  league: ReportLeague;
  playoff: Playoff;
  /** Todos los partidos de la liga (los del playoff son los de sus series). */
  matches: readonly Match[];
  names: TeamReportNames;
  now: number;
}

export function playoffReport(input: PlayoffReportInput): TournamentReport {
  const { league, playoff, matches, names, now } = input;
  const tz = league.tz || 'America/Santo_Domingo';
  const who = prizeNames(names);
  const ids = new Set(playoff.series.map((s) => s.id));
  const games = matches.filter((m) => !!m.seriesId && ids.has(m.seriesId) && m.status !== 'void');
  const final = playoff.status === 'finished';
  const nameIn = (s: PlayoffSeries, side: 'a' | 'b') => {
    const id = side === 'a' ? s.teamA : s.teamB;
    return (id ? names.teamName(id) : null) ?? (side === 'a' ? s.labelA : s.labelB) ?? 'Por definir';
  };
  const withSeed = (s: PlayoffSeries, side: 'a' | 'b') => {
    const seed = side === 'a' ? s.seedA : s.seedB;
    return `${seed != null ? `(${seed}) ` : ''}${nameIn(s, side)}`;
  };
  const rounds = Math.max(playoff.bestOf.length, ...playoff.series.map((s) => s.round), 1);
  const series = [...playoff.series].sort((a, b) => a.round - b.round || a.slot - b.slot);
  const shown = series.filter((s) => !s.bye && s.teamA && s.teamB);

  const facts: ReportFact[] = [
    {
      label: 'Formato',
      value: [
        `${num(playoff.seeds.length)} equipos`,
        playoff.bestOf.map((b, i) => `${roundName(i + 1, rounds)}: ${bestOfLabel(b).toLowerCase()}`).join(', '),
      ]
        .filter(Boolean)
        .join(' · '),
    },
  ];

  const byRound = new Map<number, PlayoffSeries[]>();
  for (const s of series) byRound.set(s.round, [...(byRound.get(s.round) ?? []), s]);
  const seriesRows: ReportRow[] = [];
  for (const [, list] of byRound) {
    seriesRows.push({ group: `${seriesRoundName(list[0], playoff)} · ${bestOfLabel(list[0].bestOf).toLowerCase()}` });
    for (const s of list) {
      const winner = s.winner ? (s.winner === s.teamA ? nameIn(s, 'a') : s.winner === s.teamB ? nameIn(s, 'b') : null) : null;
      if (s.bye) seriesRows.push([withSeed(s, s.teamA ? 'a' : 'b'), 'Pase directo', null, winner]);
      else seriesRows.push([withSeed(s, 'a'), s.teamA && s.teamB ? seriesScore(s) : null, withSeed(s, 'b'), winner]);
    }
  }

  const general: ReportTable[] = [
    {
      title: 'Series',
      note: 'Entre paréntesis, la siembra. Serie: juegos ganados por cada uno.',
      columns: [
        { label: 'Equipo 1', width: 28 },
        { label: 'Serie', align: 'center', width: 12 },
        { label: 'Equipo 2', width: 28 },
        { label: 'Ganador', width: 26 },
      ],
      rows: seriesRows,
      empty: 'Todavía no hay series.',
    },
    matchesTable({
      title: 'Juegos',
      sides: ['Local', 'Visita'],
      groups: shown.map((s) => ({ title: `${seriesRoundName(s, playoff)} · ${nameIn(s, 'a')} vs. ${nameIn(s, 'b')}`, matches: seriesGames(s.id, games) })),
      now,
      tz,
      sideName: sideLabel(names),
      empty: 'Todavía no hay juegos.',
    }),
  ];

  // Individual: lo de cada jugador en los juegos del playoff (la tabla de la temporada no los suma).
  const note = 'Solo los juegos del playoff que ya cuentan.';
  const individual = isBasketball(league.sport)
    ? [leadersTable('Anotadores del playoff', basketballTotals(basketballLines(games, now)), names, note)]
    : [scorersTable('Goleadores del playoff', scorersOf(footballLines(games, now)), names, `${note} TA y TR: tarjetas amarillas y rojas.`)];

  const dates = games.map((m) => dayKey(m.scheduledAt, tz)).filter((d): d is string => !!d);
  return {
    ...reportHeader(league, { title: playoff.name.trim() || 'Playoffs', dates, facts }),
    final,
    notes: final ? [] : ['El playoff todavía no termina: el podio puede cambiar.'],
    podiums: podiumsFrom({ kind: 'playoff' }, playoffProvider(playoff, matches, who)),
    prizes: [],
    highlights: [
      { label: 'Equipos', value: num(playoff.seeds.length) },
      { label: 'Series', value: num(shown.length) },
      { label: 'Juegos jugados', value: num(games.filter((m) => isFinal(m, now)).length) },
    ],
    general,
    individual,
    sheets: [],
  };
}
