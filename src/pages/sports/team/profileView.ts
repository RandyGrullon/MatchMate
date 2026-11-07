import { compareMatches, type Match } from '../../../lib/data/matches';
import { flipScoreText } from '../../../components/match/format';
import type { BasketballSeason } from '../basketball/season';
import type { FootballSeason } from '../football/season';
import { matchDayLabel } from './view';

/**
 * Lo que no es pantalla de «Mi equipo» y de la página de un jugador de equipos (BasketballProfile.tsx y
 * FootballProfile.tsx de la web, y las mismas pantallas de la app): el rol, la línea de su equipo, sus partidos de la
 * temporada con el rival, cuándo y el marcador, y los números de Lite.
 */

export const ROLE: Record<string, string> = { captain: 'Capitán', delegate: 'Delegado', player: 'Jugador' };

/** «Capitán · #8 · Base» de un jugador en un equipo. */
export const rosterLine = (r: { role: string; jersey: number | null; position: string | null }) =>
  [r.role !== 'player' ? ROLE[r.role] : null, r.jersey != null ? `#${r.jersey}` : null, r.position].filter(Boolean).join(' · ');

/** El rival de un lado en un partido (el nombre de ahora del equipo o el que quedó en el partido). */
export function rivalName(m: Pick<Match, 'sides'>, side: 1 | 2, teamName: (teamId: string | null) => string | null | undefined): string {
  const r = m.sides[side === 1 ? 1 : 0];
  return teamName(r.teamId) ?? r.label;
}

/** Un número con un decimal («25,5»). */
const oneDecimal = (n: number) => n.toLocaleString('es-DO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// ---------- Baloncesto ----------

export type BasketballGame = { l: BasketballSeason['lines'][number]; m: Match };

/** Los partidos de un jugador en la temporada (de las listas de presentes), del más nuevo al más viejo. */
export function basketballGames(season: Pick<BasketballSeason, 'lines'>, matches: readonly Match[], playerId: string): BasketballGame[] {
  const byId = new Map(matches.map((m) => [m.id, m] as const));
  return season.lines
    .filter((l) => l.player === playerId)
    .map((l) => ({ l, m: byId.get(l.matchId)! }))
    .filter((x) => x.m)
    .sort((a, b) => compareMatches(b.m, a.m));
}

/** «Jornada 3 · Hoy» de un partido del baloncesto. */
export const basketballWhen = (m: Pick<Match, 'round' | 'stage' | 'scheduledAt'>, tz: string, today: string) =>
  [m.round != null ? `Jornada ${m.round}` : m.stage, matchDayLabel(m.scheduledAt, tz, today)].filter(Boolean).join(' · ');

/** Lo que se ve de los números en Lite: partidos, puntos, por partido y máximo. */
export function basketballStatItems(t: { games: number; points: number; avg: number; high: number }): { label: string; value: string | number }[] {
  return [
    { label: 'Partidos', value: t.games },
    { label: 'Puntos', value: t.points },
    { label: 'Por partido', value: oneDecimal(t.avg) },
    { label: 'Máximo', value: t.high },
  ];
}

// ---------- Fútbol y sala ----------

export type FootballGame = { l: FootballSeason['lines'][number]; m: Match };

/** Los partidos de un jugador en la temporada (jugó o tuvo tarjeta), del más nuevo al más viejo. */
export function footballGames(season: Pick<FootballSeason, 'lines'>, matches: readonly Match[], playerId: string): FootballGame[] {
  const byId = new Map(matches.map((m) => [m.id, m] as const));
  return season.lines
    .filter((l) => l.playerId === playerId && (l.played || l.yellows || l.red))
    .map((l) => ({ l, m: byId.get(l.matchId)! }))
    .filter((x) => x.m)
    .sort((a, b) => compareMatches(b.m, a.m));
}

/** El marcador visto desde su lado («2-1» si ganó su equipo de local; al revés si jugó de visitante). */
export const footballScore = (g: FootballGame) => (typeof g.m.score?.text === 'string' ? (g.l.side === 1 ? g.m.score.text : flipScoreText(g.m.score.text)) : '');

/** «Jornada 3 · Hoy · portero, valla invicta» (o «· no jugó»). */
export const footballWhen = (g: FootballGame, tz: string, today: string) =>
  [g.m.stage || (g.m.round != null ? `Jornada ${g.m.round}` : ''), matchDayLabel(g.m.scheduledAt, tz, today)].filter(Boolean).join(' · ') +
  (g.l.keeper && g.l.played ? ` · portero${g.l.cleanSheet ? ', valla invicta' : ''}` : '') +
  (!g.l.played ? ' · no jugó' : '');

/** Lo que se ve de los números en Lite: partidos, goles, asistencias y tarjetas (o, si atajó, vallas invictas). */
export function footballStatItems(
  totals: { games: number; goals: number; assists: number; keeperGames: number; cleanSheets: number } | undefined,
  cards: { yellows: number; reds: number; secondYellows: number } | undefined,
): { label: string; value: number }[] {
  const keeper = !!totals && totals.keeperGames > 0;
  return [
    { label: 'Partidos', value: totals?.games ?? 0 },
    { label: 'Goles', value: totals?.goals ?? 0 },
    { label: 'Asistencias', value: totals?.assists ?? 0 },
    ...(!keeper ? [{ label: 'Tarjetas', value: (cards?.yellows ?? 0) + (cards?.reds ?? 0) + (cards?.secondYellows ?? 0) }] : []),
    ...(keeper ? [{ label: 'Vallas invictas', value: totals.cleanSheets }] : []),
  ];
}
