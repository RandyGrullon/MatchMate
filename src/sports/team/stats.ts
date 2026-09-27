/**
 * Estadísticas de la temporada por jugador, sumando las líneas de cada partido (basketballLines y
 * footballLines). Una línea = un partido jugado (sale de la lista de presentes). Sala y campo no se mezclan:
 * quien llama pasa solo los partidos de una liga o de un deporte.
 */

import type { BasketballLine } from './basketball';
import type { FootballLine } from './football';

export interface BasketballTotals {
  player: string;
  /** Equipo del último partido. */
  team: string;
  games: number;
  points: number;
  /** Promedio de puntos por partido, con 1 decimal. */
  avg: number;
  /** Máximo de puntos en un partido. */
  high: number;
  threes: number;
  /** Tiros libres anotados (canastas de 1 en 5x5). */
  ftm: number;
  fouls: number;
}

/** Tabla de anotadores: más puntos primero, luego mejor promedio. */
export function basketballTotals(lines: readonly BasketballLine[]): BasketballTotals[] {
  const by = new Map<string, BasketballTotals>();
  for (const l of lines) {
    const t = by.get(l.player) ?? { player: l.player, team: l.team, games: 0, points: 0, avg: 0, high: 0, threes: 0, ftm: 0, fouls: 0 };
    t.team = l.team;
    t.games++;
    t.points += l.points;
    t.high = Math.max(t.high, l.points);
    t.threes += l.threes;
    t.ftm += l.ones;
    t.fouls += l.fouls;
    t.avg = Math.round((t.points / t.games) * 10) / 10;
    by.set(l.player, t);
  }
  return [...by.values()].sort((a, b) => b.points - a.points || b.avg - a.avg || a.player.localeCompare(b.player));
}

export interface FootballTotals {
  player: string;
  team: string;
  games: number;
  goals: number;
  assists: number;
  ownGoals: number;
  yellows: number;
  reds: number;
  /** Partidos de portero, vallas invictas y goles recibidos de portero. */
  keeperGames: number;
  cleanSheets: number;
  conceded: number;
}

/** Tabla de goleadores: más goles, luego más asistencias, luego menos partidos. */
export function footballTotals(lines: readonly FootballLine[]): FootballTotals[] {
  const by = new Map<string, FootballTotals>();
  for (const l of lines) {
    const t = by.get(l.player) ?? { player: l.player, team: l.team, games: 0, goals: 0, assists: 0, ownGoals: 0, yellows: 0, reds: 0, keeperGames: 0, cleanSheets: 0, conceded: 0 };
    t.team = l.team;
    t.games++;
    t.goals += l.goals;
    t.assists += l.assists;
    t.ownGoals += l.ownGoals;
    t.yellows += l.yellows;
    if (l.red) t.reds++;
    if (l.keeper) {
      t.keeperGames++;
      t.conceded += l.conceded;
      if (l.cleanSheet) t.cleanSheets++;
    }
    by.set(l.player, t);
  }
  return [...by.values()].sort((a, b) => b.goals - a.goals || b.assists - a.assists || a.games - b.games || a.player.localeCompare(b.player));
}
