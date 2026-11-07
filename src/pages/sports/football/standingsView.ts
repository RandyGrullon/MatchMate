import { compareMatches, type Match } from '../../../lib/data/matches';
import { defaultColumns, type StandingsColumn } from '../../../components/match/standings';
import type { DisciplineConfig, DisciplineReport, Sanction } from '../../../sports/team/discipline';
import type { FootballTableConfig } from '../../../sports/team/standings';
import type { FootballTotals } from '../../../sports/team/stats';
import type { LeaderColumn } from '../team/leaders';
import { isPlayoffMatch } from '../team/playoffs';
import { TIEBREAK_LABEL } from './rules';
import type { CardRow, FootballSeason } from './season';

/**
 * Lo que no es pantalla de la Tabla del fútbol y la sala (FootballStandings.tsx de la web y la tabla de la app): las
 * columnas de cada lista, qué se ve (`?ver=`), la línea de cada uno en Lite, la regla de la tabla y lo de la disciplina
 * (a una amarilla de la suspensión, las sanciones en orden y el nombre de cada partido).
 */

export type FootballTab = 'tabla' | 'goleadores' | 'tarjetas' | 'vallas' | 'disciplina';
export type FootballSegment = 'tabla' | 'jugadores' | 'disciplina';

export const FOOTBALL_TABS: readonly FootballTab[] = ['tabla', 'goleadores', 'tarjetas', 'vallas', 'disciplina'];

/** La pestaña que se ve (`?ver=`): la tabla si no dice o no existe. */
export const footballTab = (ver: string | null | undefined): FootballTab => (ver && (FOOTBALL_TABS as readonly string[]).includes(ver) ? (ver as FootballTab) : 'tabla');

/** El segmentado de arriba: Tabla | Jugadores (goleadores, tarjetas o vallas) | Disciplina. */
export const footballSegment = (tab: FootballTab): FootballSegment => (tab === 'tabla' || tab === 'disciplina' ? tab : 'jugadores');

/** Lo de los jugadores (en «Jugadores»): goleadores, tarjetas o vallas invictas. */
export const PLAYER_VIEWS: readonly { key: FootballTab; label: string }[] = [
  { key: 'goleadores', label: 'Goleadores' },
  { key: 'tarjetas', label: 'Tarjetas' },
  { key: 'vallas', label: 'Vallas invictas' },
];

/** Columnas de la tabla de goleadores. */
export const SCORER_COLUMNS: LeaderColumn<FootballTotals>[] = [
  { key: 'goals', label: 'G', title: 'Goles', value: (r) => r.goals },
  { key: 'assists', label: 'A', title: 'Asistencias', value: (r) => r.assists },
  { key: 'games', label: 'PJ', title: 'Partidos jugados', value: (r) => r.games },
  {
    key: 'avg',
    label: 'Prom',
    title: 'Goles por partido',
    value: (r) => (r.games ? r.goals / r.games : 0),
    show: (r) => (r.games ? (r.goals / r.games).toLocaleString('es-DO', { maximumFractionDigits: 2 }) : '0'),
    wide: true,
  },
  { key: 'ownGoals', label: 'AG', title: 'Autogoles', value: (r) => r.ownGoals, wide: true },
];

export const CARD_COLUMNS: LeaderColumn<CardRow>[] = [
  { key: 'yellows', label: 'TA', title: 'Amarillas', value: (r) => r.yellows },
  { key: 'secondYellows', label: '2A', title: 'Rojas por doble amarilla', value: (r) => r.secondYellows },
  { key: 'reds', label: 'TR', title: 'Rojas directas', value: (r) => r.reds },
  { key: 'fairPlay', label: 'JL', title: 'Juego limpio (más negativo = más tarjetas)', value: (r) => -r.fairPlay, show: (r) => r.fairPlay },
];

export const KEEPER_COLUMNS: LeaderColumn<FootballTotals>[] = [
  { key: 'cleanSheets', label: 'VI', title: 'Vallas invictas', value: (r) => r.cleanSheets },
  { key: 'keeperGames', label: 'PJ', title: 'Partidos de portero', value: (r) => r.keeperGames },
  { key: 'conceded', label: 'GR', title: 'Goles recibidos', value: (r) => -r.conceded, show: (r) => r.conceded },
  {
    key: 'avg',
    label: 'Prom',
    title: 'Goles recibidos por partido',
    value: (r) => (r.keeperGames ? -r.conceded / r.keeperGames : 0),
    show: (r) => (r.keeperGames ? (r.conceded / r.keeperGames).toLocaleString('es-DO', { maximumFractionDigits: 2 }) : '0'),
  },
];

/** Columnas de la tabla de fútbol: PJ G E P GF GC Dif. (y el juego limpio en la computadora). */
export const TABLE_COLUMNS: StandingsColumn[] = [
  ...defaultColumns({ draws: true, forLabel: 'GF', againstLabel: 'GC' }),
  { key: 'fair', label: 'JL', title: 'Juego limpio (tarjetas)', value: (r) => r.extra.fairPlay ?? 0, wide: true },
];

/** Los goleadores que salen en la lista: los que tienen un gol o una asistencia. */
export const scorerRows = (season: Pick<FootballSeason, 'scorers'>) => season.scorers.filter((s) => s.goals > 0 || s.assists > 0);

/** La línea de un goleador en Lite: «2 asistencias» (nada sin asistencias). */
export const scorerLine = (r: Pick<FootballTotals, 'assists'>): string | null => (r.assists ? `${r.assists} ${r.assists === 1 ? 'asistencia' : 'asistencias'}` : null);

/** La línea de las tarjetas de un jugador en Lite: «1 doble amarilla · 2 rojas». */
export const cardLine = (r: Pick<CardRow, 'secondYellows' | 'reds'>): string | null =>
  [r.secondYellows ? `${r.secondYellows} doble amarilla` : null, r.reds ? `${r.reds} ${r.reds === 1 ? 'roja' : 'rojas'}` : null].filter(Boolean).join(' · ') || null;

/** La línea de un portero en Lite: «3 partidos · 2 recibidos». */
export const keeperLine = (r: Pick<FootballTotals, 'keeperGames' | 'conceded'>) => `${r.keeperGames} ${r.keeperGames === 1 ? 'partido' : 'partidos'} · ${r.conceded} recibidos`;

/** Lo que dice cada lista cuando está vacía. */
export const EMPTY_TEXT = {
  goleadores: 'Los goles salen del acta de cada partido (quién marcó).',
  tarjetas: 'Nadie tiene tarjetas todavía.',
  vallas: 'Las vallas invictas salen del portero que marca el anotador en cada partido.',
} as const;

/** El cuadro del torneo relámpago de la temporada (los juegos del playoff tienen su pestaña), en orden. */
export const knockoutMatches = (season: Pick<FootballSeason, 'matches'>): Match[] => season.matches.filter((m) => m.bracketKey && !isPlayoffMatch(m)).sort(compareMatches);

/** La regla de la tabla en una línea: «Ganar 3 · empatar 1 · perder 0». */
export const footballRuleLine = (t: Pick<FootballTableConfig, 'win' | 'draw' | 'loss'>) => `Ganar ${t.win} · empatar ${t.draw} · perder ${t.loss}`;

/** «Cómo se cuenta»: los párrafos de la hoja (puntos, W.O., penales y el orden de los desempates). */
export function footballRuleText(t: FootballTableConfig): string[] {
  const order = t.tiebreak.map((k) => TIEBREAK_LABEL[k].toLowerCase());
  return [
    `Ganar da ${t.win} puntos, empatar ${t.draw} y perder ${t.loss}. W.O.: ${t.walkoverScore}-0 y ${t.walkoverLoss} puntos para el que no vino.`,
    t.shootout ? `Empate con penales: ${t.shootout.win} al que gana la tanda y ${t.shootout.loss} al otro.` : 'Los penales no cuentan en los goles ni en la tabla.',
    `Desempate: ${order.join(' → ')}. La «i» junto al puesto dice qué regla lo decidió.`,
    'Un resultado por confirmar cuenta a las 48 horas.',
  ];
}

/** Los que están a una amarilla de la suspensión (si las amarillas se acumulan). */
export function nearSuspension(report: Pick<DisciplineReport, 'yellows'>, cfg: Pick<DisciplineConfig, 'yellowsForSuspension'>): DisciplineReport['yellows'] {
  return cfg.yellowsForSuspension > 0 ? report.yellows.filter((y) => y.pending === cfg.yellowsForSuspension - 1 && y.pending > 0) : [];
}

/** Las sanciones de la temporada: las que más les falta primero. */
export const sortedSanctions = (report: Pick<DisciplineReport, 'sanctions'>): Sanction[] => [...report.sanctions].sort((a, b) => b.remaining - a.remaining);

/** «J3 · Tigres vs. Leones» de un partido de la temporada (o «partido borrado»). */
export function disciplineMatchText(matches: readonly Match[], teamName: (teamId: string | null) => string | null | undefined): (id: string) => string {
  const byId = new Map(matches.map((m) => [m.id, m] as const));
  return (id) => {
    const m = byId.get(id);
    if (!m) return 'partido borrado';
    const nm = (i: 0 | 1) => teamName(m.sides[i].teamId) ?? m.sides[i].label;
    return `${m.round != null ? `J${m.round} · ` : ''}${nm(0)} vs. ${nm(1)}`;
  };
}
