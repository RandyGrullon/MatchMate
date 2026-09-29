/**
 * Solo pruebas: un torneo del boliche para el reporte: 2 equipos de 2, 3 juegos, handicap 80 % de 220 (individual con
 * handicap, equipos por scratch) y una jugadora con un juego sin verificar.
 *
 * Hcp por juego: Ana 16, Beto 32, Carla 48, Dani 56. Individual (total): Ana 648, Carla 624, Beto 621, Dani 618.
 * Equipos (scratch): Strikers 1125 (Ana y Beto), Spares 930 (Carla y Dani).
 */
import type { BowlingEvent, Entry, League, Player } from '../types';

export const LEAGUE: Pick<League, 'name' | 'kind' | 'sport' | 'venue' | 'logoPath' | 'tz'> = {
  name: 'Liga Norte',
  kind: 'liga',
  sport: 'bowling',
  venue: 'Bowling Center',
  logoPath: null,
  tz: 'America/Santo_Domingo',
};

export const bowlingEvent = (over: Partial<BowlingEvent> = {}): BowlingEvent => ({
  id: 'E1',
  type: 'torneo',
  name: 'Copa Aniversario',
  date: '2026-10-12',
  games: 3,
  hcpBase: 220,
  hcpPercent: 80,
  teams: { T1: { name: 'Strikers', order: 1 }, T2: { name: 'Spares', order: 2 } },
  playerCount: 5,
  teamSize: 2,
  ...over,
});

export const PLAYERS: Player[] = [
  { id: 'a', name: 'Ana', averageOverride: null },
  { id: 'b', name: 'Beto', averageOverride: null },
  { id: 'c', name: 'Carla', averageOverride: null },
  { id: 'd', name: 'Dani', averageOverride: null },
  { id: 'e', name: 'Eva', averageOverride: null },
];

export const entry = (playerId: string, teamId: string | null, average: number, scores: (number | null)[], photos?: (string | null)[]): Entry => ({
  id: `E1_${playerId}`,
  eventId: 'E1',
  playerId,
  teamId,
  average,
  handicapOverride: null,
  scores,
  photos: photos ?? scores.map((s) => (s == null ? null : 'sin-foto')),
});

export const ENTRIES: Entry[] = [
  entry('a', 'T1', 200, [210, 190, 200]),
  entry('b', 'T1', 180, [180, 170, 175]),
  entry('c', 'T2', 160, [150, 160, 170]),
  entry('d', 'T2', 150, [140, 150, 160]),
  // Anotado sin verificar: no cuenta todavía.
  entry('e', null, 170, [190, null, null], [null, null, null]),
];
