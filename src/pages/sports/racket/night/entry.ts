import type { Match } from '../../../../lib/data/matches';
import { pointsResultParser, type ResultParser } from '../../../../components/match/parsers';
import { parsePoints, type NightConfig } from '../logic/night';

/**
 * Lo puro de la pantalla de la noche (NightPage.tsx; la app del teléfono lo usa igual): cómo se pone el marcador de un
 * partido de la ronda y el resumen de «Todo listo para la ronda 1».
 */

/** Cómo se pone el marcador de un partido de la ronda («14-10», «11-7»). */
export interface PointsEntry {
  parser: ResultParser;
  placeholder: string;
  hint?: string;
  examples?: string[];
}

/** El marcador de un partido de la noche: los puntos de cada lado (con lo que suman, si es a un total). */
export function nightPointsEntry(m: Pick<Match, 'rules'>): PointsEntry {
  const pts = parsePoints((m.rules as Record<string, unknown> | undefined)?.points);
  return { parser: pointsResultParser(pts), placeholder: '14-10', hint: pts.mode === 'total' ? `suman ${pts.target}` : undefined };
}

/** «8 jugadores en 2 canchas · 7 rondas · sin repetir compañero» (lo de «Todo listo para la ronda 1»). */
export function nightFirstSummary(cfg: Pick<NightConfig, 'players' | 'courts' | 'rounds' | 'format' | 'firstRound'>): string {
  const how = cfg.format === 'mexicano' ? (cfg.firstRound === 'level' ? 'la 1 por nivel' : 'la 1 al azar') : 'sin repetir compañero';
  return `${cfg.players.length} jugadores en ${cfg.courts.length} ${cfg.courts.length === 1 ? 'cancha' : 'canchas'} · ${cfg.rounds} rondas · ${how}`;
}
