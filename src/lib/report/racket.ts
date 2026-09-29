import { isFinal, type Match } from '../data/matchCore';
import type { RacketEvent } from '../data/racket';
import { countLabel, num } from '../format';
import { competitionSheets, nightSheets } from '../../pages/sports/racket/excel';
import { REST_LABELS, pointsLabel, type NightConfig, type NightRound } from '../../pages/sports/racket/logic/night';
import { entrantKey, forLabel, seasonPlayerTable, setsLabel, winPct } from '../../pages/sports/racket/logic/results';
import { pointsText } from '../../pages/sports/racket/logic/tiebreaks';
import { groupMatches, groupStage, groupTables, parseTourneyConfig, type TourneyCategory } from '../../pages/sports/racket/logic/tourney';
import { gameText, type SocialConfig } from '../../pages/sports/pickleball/social/logic';
import { nightProvider, racketPrizeDoubles, racketTourneyComp, racketTourneyFinished, racketTourneyProvider } from '../../prizes/sports';
import type { RacketSport } from '../../sports/racket';
import type { StandingRow } from '../../sports/types';
import { matchesTable, numCol, pendingCount, pendingNote, playedCount, standingHead, type MatchGroup } from './matches';
import { podiumsFrom, reportHeader, type ReportColumn, type ReportFact, type ReportLeague, type ReportRow, type ReportTable, type TournamentReport } from './model';

/**
 * El reporte de la raqueta (pádel, tenis y pickleball), con las tablas y los podios de la app:
 * - torneo por categorías (TourneyPage): campeones de cada categoría (el cuadro, `racketTourneyProvider`), las tablas
 *   de los grupos (`groupTables`) y los partidos por fase; en «Individual», cada jugador de cada categoría
 *   (`seasonPlayerTable`). Detalle del Excel: el de siempre (partidos, grupos y jugadores);
 * - noche de americano o mexicano (NightPage) y round robin social del pickleball (SocialPage): el podio de la noche
 *   (`nightProvider`), las rondas con sus canchas y, en «Individual», la tabla de la noche (`nightTable` o
 *   `socialTable`, la que ya calculó la pantalla). Detalle del Excel: las rondas.
 */

/** Los nombres de la liga (los de `useNames`). */
export interface RacketNames {
  nameOf: (playerId: string) => string;
  /** Pareja, jugador o `p:a+b` → nombre. */
  entrantName: (id: string) => string;
  rosterOf: (teamId: string) => readonly string[];
}

// ---------- Torneo por categorías ----------

export interface RacketTourneyReportInput {
  lid: string;
  league: ReportLeague;
  event: Pick<RacketEvent, 'id' | 'name' | 'date' | 'config'>;
  /** El nombre de la pantalla («Torneo» si no tiene). */
  title: string;
  sport: RacketSport;
  leagueRules: unknown;
  matches: readonly Match[];
  names: RacketNames;
  now: number;
}

/** Los partidos de la categoría (sin los anulados), como los ve su pestaña «Partidos». */
const categoryMatches = (cat: TourneyCategory, matches: readonly Match[]) => matches.filter((m) => m.status !== 'void' && m.stage.startsWith(`${cat.name} ·`));

/** La categoría ya arrancó (grupos o cuadro armados). */
const started = (cat: TourneyCategory) => !!cat.groupsOf?.length || (cat.seeds?.length ?? 0) >= 2;

/** «8 parejas · 2 grupos, pasan 2 de cada uno · con 3.er lugar». */
function categoryLine(cat: TourneyCategory, unit: readonly [string, string]): string {
  const n = cat.seeds?.length && !cat.groupsOf?.length ? cat.seeds.length : cat.pairs.length;
  const groups = cat.groupsOf?.length ?? cat.groups;
  return [
    `${num(n)} ${n === 1 ? unit[0] : unit[1]}`,
    groups > 0 ? `${groups} ${groups === 1 ? 'grupo' : 'grupos'}, ${cat.perGroup === 1 ? 'pasa 1' : `pasan ${cat.perGroup}`} de cada uno` : 'cuadro directo',
    cat.thirdPlace ? 'con 3.er lugar' : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Los partidos de la categoría por fase: primero los grupos (A, B…) y después el cuadro por ronda (el 3.er lugar antes
 * de la final), como se juegan.
 */
function categoryPhases(cat: TourneyCategory, list: readonly Match[]): MatchGroup[] {
  const prefix = `${cat.name} · `;
  const phase = (m: Match) => (m.stage.startsWith(prefix) ? m.stage.slice(prefix.length) : m.stage) || 'Partidos';
  const key = new RegExp(`^${cat.id}-(?:R(\\d+)-(\\d+)|(P3))$`);
  const last = Math.max(0, ...list.map((x) => Number(key.exec(x.bracketKey ?? '')?.[1] ?? 0)));
  const order = (m: Match): [number, number] => {
    const k = key.exec(m.bracketKey ?? '');
    if (!k) return [0, 0];
    // El 3.er lugar va justo antes de la final (su ronda es la de la final).
    return k[3] ? [last - 0.5, 0] : [Number(k[1]), Number(k[2])];
  };
  const groups = (cat.groupsOf ?? []).map((_, g) => ({ title: groupStage(cat, g).slice(prefix.length), matches: groupMatches(cat, g, list) }));
  const inGroups = new Set(groups.flatMap((g) => g.matches.map((m) => m.id)));
  const bracket = list
    .filter((m) => !inGroups.has(m.id))
    .sort((a, b) => order(a)[0] - order(b)[0] || order(a)[1] - order(b)[1] || a.id.localeCompare(b.id));
  const byPhase = new Map<string, Match[]>();
  for (const m of bracket) byPhase.set(phase(m), [...(byPhase.get(phase(m)) ?? []), m]);
  return [...groups, ...[...byPhase].map(([title, matches]) => ({ title, matches }))];
}

export function racketTourneyReport(input: RacketTourneyReportInput): TournamentReport {
  const { lid, league, event, sport, matches, names, now } = input;
  const cfg = parseTourneyConfig(event.config);
  const doubles = racketPrizeDoubles(sport, input.leagueRules);
  const unit = doubles ? (['pareja', 'parejas'] as const) : (['jugador', 'jugadores'] as const);
  const who = { nameOf: names.nameOf, rosterOf: names.rosterOf };
  const live = matches.filter((m) => m.status !== 'void');
  const cats = cfg.categories;
  // Terminado: todas las categorías tienen su podio (1.º, 2.º y 3.º) con los partidos que ya cuentan.
  const final = racketTourneyFinished(cats, matches, who, now);
  const pending = pendingCount(live, now);
  const notes = final ? [] : [pendingNote(pending) ?? (cats.some(started) ? 'Faltan partidos del cuadro: el podio puede cambiar.' : 'El torneo todavía no empieza.')];

  const facts: ReportFact[] = [
    {
      label: 'Formato',
      value: [`${num(cats.length)} ${cats.length === 1 ? 'categoría' : 'categorías'}`, doubles ? 'Dobles' : 'Individual', `Tabla: ${pointsText(sport, cfg.points)}`].join(' · '),
    },
  ];

  const players = new Set(live.flatMap((m) => m.sides.flatMap((s) => (s.players.length ? s.players.map((p) => p.playerId) : s.teamId ? [...names.rosterOf(s.teamId)] : []))));
  const highlights: ReportFact[] = [
    { label: 'Categorías', value: num(cats.length) },
    { label: doubles ? 'Parejas' : 'Jugadores', value: num(cats.reduce((n, c) => n + c.pairs.length, 0)) },
    ...(doubles && players.size ? [{ label: 'Jugadores', value: num(players.size) }] : []),
    { label: 'Partidos jugados', value: num(playedCount(live, now)) },
    ...(pending ? [{ label: 'Por jugar o confirmar', value: num(pending) }] : []),
  ];

  // General: cada categoría con sus grupos (tabla) y sus partidos por fase; sin arrancar, sus inscritos.
  const entrant = doubles ? 'Pareja' : 'Jugador';
  const tableColumns: ReportColumn[] = [
    ...standingHead(entrant),
    numCol('PJ'),
    numCol('G'),
    numCol('P'),
    numCol(`${setsLabel(sport)} +`, { width: 9 }),
    numCol(`${setsLabel(sport)} −`, { width: 9 }),
    numCol(`${forLabel(sport)} +`, { width: 10 }),
    numCol(`${forLabel(sport)} −`, { width: 10 }),
    numCol('Pts', { strong: true }),
  ];
  const tableRow = (r: StandingRow): ReportRow => [
    r.rank,
    names.entrantName(r.id),
    r.played,
    r.won,
    r.lost,
    r.extra.setsFor ?? r.extra.gamesFor ?? 0,
    r.extra.setsAgainst ?? r.extra.gamesAgainst ?? 0,
    r.for,
    r.against,
    r.points,
  ];
  const general: ReportTable[] = [];
  for (const cat of cats) {
    const line = categoryLine(cat, unit);
    if (!started(cat)) {
      general.push({
        title: `${cat.name} · Inscritos`,
        note: line,
        columns: [{ label: '#', align: 'center', width: 6 }, { label: entrant, width: 34 }],
        rows: cat.pairs.map((id, i) => [i + 1, names.entrantName(id)]),
        empty: `Todavía no hay ${unit[1]}.`,
      });
      continue;
    }
    const tables = cat.groupsOf?.length ? groupTables(sport, cat, matches, { scheme: cfg.points, now }) : [];
    tables.forEach((rows, g) =>
      general.push({
        title: groupStage(cat, g),
        ...(g === 0 ? { note: line } : {}),
        columns: tableColumns,
        rows: rows.map(tableRow),
        empty: 'Todavía no hay resultados.',
      }),
    );
    general.push(
      matchesTable({
        title: `${cat.name} · Partidos`,
        ...(tables.length ? {} : { note: line }),
        sides: ['Lado 1', 'Lado 2'],
        groups: categoryPhases(cat, categoryMatches(cat, matches)),
        now,
        tz: league.tz,
        winner: true,
        empty: 'Todavía no hay partidos.',
      }),
    );
  }

  // Individual: cada jugador de cada categoría con lo de su lado (grupos y cuadro), la cuenta del ranking de la liga.
  const sets = setsLabel(sport);
  const games = forLabel(sport);
  const individualColumns: ReportColumn[] = [
    { label: '#', align: 'center', place: true, width: 6 },
    { label: 'Jugador', width: 28 },
    ...(doubles ? [{ label: 'Pareja', width: 30 }] : []),
    numCol('PJ'),
    numCol('G'),
    numCol('P'),
    numCol('% G', { width: 7 }),
    numCol(`${sets} +`, { width: 9, only: 'excel' }),
    numCol(`${sets} −`, { width: 9, only: 'excel' }),
    numCol(`Dif. ${sets.toLowerCase()}`, { width: 10 }),
    numCol(`${games} +`, { width: 10, only: 'excel' }),
    numCol(`${games} −`, { width: 10, only: 'excel' }),
    numCol(`Dif. ${games.toLowerCase()}`, { width: 10 }),
    numCol('Pts', { strong: true }),
  ];
  const individual: ReportTable[] = [];
  for (const cat of cats.filter(started)) {
    const list = categoryMatches(cat, matches);
    const rows = seasonPlayerTable(list, { sport, scheme: cfg.points, rosterOf: names.rosterOf, now, lotSeed: cat.id });
    // La pareja de cada jugador: el lado donde jugó en la categoría.
    const pairOf = new Map<string, string>();
    for (const m of list) {
      for (const s of m.sides) {
        const ids = s.players.length ? s.players.map((p) => p.playerId) : s.teamId ? names.rosterOf(s.teamId) : [];
        for (const id of ids) if (!pairOf.has(id)) pairOf.set(id, names.entrantName(entrantKey(s)));
      }
    }
    individual.push({
      title: cat.name,
      note: `Cada jugador suma lo de su lado en los partidos que ya cuentan (grupos y cuadro). Tabla: ${pointsText(sport, cfg.points)}.`,
      columns: individualColumns,
      rows: rows.map((r) => [
        r.rank,
        names.nameOf(r.id),
        ...(doubles ? [pairOf.get(r.id) ?? null] : []),
        r.played,
        r.won,
        r.lost,
        winPct(r.won, r.played),
        r.extra.setsFor ?? 0,
        r.extra.setsAgainst ?? 0,
        r.extra.setsDiff ?? 0,
        r.for,
        r.against,
        r.diff,
        r.points,
      ]),
      empty: 'Todavía no hay partidos que cuenten.',
    });
  }

  return {
    ...reportHeader(league, { title: input.title, dates: event.date, facts }),
    final,
    notes,
    // Una pareja sin nombre propio se llama como sus jugadores («Luis / Ana»): `podiumsFrom` no los repite debajo.
    podiums: podiumsFrom(racketTourneyComp(lid, event, { sport, leagueRules: input.leagueRules, categories: cats }), racketTourneyProvider(cats, matches, who, now)),
    prizes: [],
    highlights,
    general,
    individual,
    // El detalle de siempre: partidos, la tabla de cada grupo y los jugadores de todo el torneo.
    sheets: competitionSheets({
      title: input.title,
      date: event.date,
      matches: live,
      tables: cats.flatMap((c) => groupTables(sport, c, matches, { scheme: cfg.points, now }).map((rows, g) => ({ name: groupStage(c, g), rows }))),
      // Con la tabla del torneo (la de «Individual» y los grupos): en «2-0» los mismos puntos en todo el libro.
      players: seasonPlayerTable(matches, { sport, scheme: cfg.points, rosterOf: names.rosterOf, now }),
      entrantName: names.entrantName,
      nameOf: names.nameOf,
      tz: league.tz,
      forLabel: games,
      setsLabel: sets,
    }),
  };
}

// ---------- Noches (americano, mexicano) y round robin social ----------

interface NightBase {
  lid: string;
  league: ReportLeague;
  event: Pick<RacketEvent, 'id' | 'name' | 'date'>;
  /** El nombre de la pantalla. */
  title: string;
  /** Rondas y tabla como las calcula la pantalla (`nightRounds` y `nightTable` o `socialTable`). */
  rounds: readonly NightRound[];
  table: readonly StandingRow[];
  nameOf: (playerId: string) => string;
  /** La noche terminó (la cerró el admin o se jugó la última ronda). */
  finished: boolean;
  now: number;
}

export interface RacketNightReportInput extends NightBase {
  cfg: NightConfig;
}

export interface SocialReportInput extends NightBase {
  cfg: SocialConfig;
}

/** Lo común de las noches: podio, rondas y la tabla individual (las columnas las pone cada una). */
function nightReport(
  input: NightBase & { cfg: NightConfig },
  o: { facts: ReportFact[]; columns: ReportColumn[]; row: (r: StandingRow) => ReportRow; rows: readonly StandingRow[]; note: string },
): TournamentReport {
  const { league, event, rounds, nameOf, cfg, now } = input;
  const pair = (ids: readonly string[]) => ids.map(nameOf).join(' / ');
  const counted = rounds.flatMap((r) => r.matches).filter((m) => m.score1 != null);
  const general: ReportTable[] = [
    {
      title: 'Rondas',
      columns: [
        { label: 'Cancha', width: 14 },
        { label: 'Pareja 1', width: 30 },
        { label: 'Marcador', align: 'center', width: 12 },
        { label: 'Pareja 2', width: 30 },
      ],
      rows: rounds.flatMap((r): ReportRow[] => [
        { group: [`Ronda ${r.round}`, r.rests.length ? `Descansan: ${r.rests.map(nameOf).join(', ')}` : null].filter(Boolean).join(' · ') },
        ...r.matches.map((m): ReportRow => [
          m.court || null,
          pair(m.side1),
          m.score1 != null ? `${m.score1}-${m.score2}` : isFinal(m.match, now) ? null : pendingLabel(m.match, now),
          pair(m.side2),
        ]),
      ]),
      empty: 'Todavía no hay rondas.',
    },
  ];
  return {
    ...reportHeader(league, { title: input.title, dates: event.date, facts: o.facts }),
    final: input.finished,
    notes: input.finished ? [] : ['Todavía no termina: la tabla puede cambiar.'],
    // El podio de los premios de la noche (los que jugaron, con el puesto recontado entre ellos).
    podiums: podiumsFrom({ kind: 'racket_night' }, nightProvider(input.table, nameOf)),
    prizes: [],
    highlights: [
      { label: 'Jugadores', value: num(input.table.filter((r) => r.played > 0).length) },
      { label: 'Rondas', value: `${num(rounds.length)} de ${num(cfg.rounds)}` },
      { label: 'Partidos jugados', value: num(counted.length) },
      { label: 'Canchas', value: num(cfg.courts.length) },
    ],
    general,
    individual: [{ title: 'Tabla de la noche', note: o.note, columns: o.columns, rows: o.rows.map(o.row), empty: 'Cuando termine el primer partido, sale la tabla.' }],
    // El detalle de siempre: las rondas (la tabla ya va entera en «Individual»).
    sheets: nightSheets({ rounds, table: input.table, nameOf }).filter((s) => s.sheet !== 'Tabla'),
  };
}

const pendingLabel = (m: Match, now: number) => (m.status === 'scheduled' ? 'Por jugar' : isFinal(m, now) ? null : m.status === 'live' ? 'En juego' : 'Por confirmar');

/** La noche de americano o mexicano: la tabla por puntos (con lo que suma quien descansa). */
export function racketNightReport(input: RacketNightReportInput): TournamentReport {
  const { cfg } = input;
  const facts: ReportFact[] = [
    {
      label: 'Formato',
      value: [cfg.format === 'mexicano' ? 'Mexicano' : 'Americano', pointsLabel(cfg.points), countLabel(cfg.rounds, ['ronda', 'rondas']), countLabel(cfg.courts.length, ['cancha', 'canchas'])].join(' · '),
    },
    { label: 'Descansos', value: REST_LABELS[cfg.rest] },
  ];
  return nightReport(input, {
    facts,
    columns: [
      { label: '#', align: 'center', place: true, width: 6 },
      { label: 'Jugador', width: 28 },
      numCol('PJ'),
      numCol('G'),
      numCol('E'),
      numCol('P'),
      numCol('A favor', { width: 9 }),
      numCol('En contra', { width: 10 }),
      numCol('Dif.'),
      numCol('Desc.', { width: 10 }),
      numCol('Prom.', { width: 9 }),
      numCol('Pts', { strong: true }),
    ],
    rows: input.table.filter((r) => r.played > 0 || r.points > 0),
    row: (r) => [r.rank, input.nameOf(r.id), r.played, r.won, r.drawn, r.lost, r.for, r.against, r.diff, r.extra.rests ?? 0, round2(r.extra.avg ?? 0), round2(r.points)],
    note: `Orden: puntos, luego partidos ganados y luego diferencia de puntos.${cfg.rest !== 'none' ? ' Quien descansa suma según las reglas de la noche.' : ''}`,
  });
}

/** El round robin social del pickleball: la tabla por partidos ganados (los descansos solo se cuentan). */
export function pickleballSocialReport(input: SocialReportInput): TournamentReport {
  const { cfg } = input;
  const facts: ReportFact[] = [
    {
      label: 'Formato',
      value: [cfg.mixed ? 'Round robin mixto' : 'Round robin', gameText(cfg.game), countLabel(cfg.rounds, ['ronda', 'rondas']), countLabel(cfg.courts.length, ['cancha', 'canchas'])].join(' · '),
    },
  ];
  return nightReport(input, {
    facts,
    columns: [
      { label: '#', align: 'center', place: true, width: 6 },
      { label: 'Jugador', width: 28 },
      numCol('PJ'),
      numCol('G', { strong: true }),
      numCol('P'),
      numCol('PF', { width: 9 }),
      numCol('PC', { width: 9 }),
      numCol('Dif.'),
      numCol('Desc.', { width: 10 }),
    ],
    rows: input.table.filter((r) => r.played > 0),
    row: (r) => [r.rank, input.nameOf(r.id), r.played, r.won, r.lost, r.for, r.against, r.diff, r.extra.rests ?? 0],
    note: 'Orden: partidos ganados, luego diferencia de puntos y luego puntos a favor. PF y PC: puntos a favor y en contra.',
  });
}

const round2 = (n: number) => Math.round(n * 100) / 100;
