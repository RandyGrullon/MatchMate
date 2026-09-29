/**
 * Cuándo se prende «Entregar premios» en la tarjeta (docs/premios-torneo.md §5, la columna «Cuándo se entrega»). Es
 * solo para la pantalla: la base lo vuelve a revisar lugar por lugar (private.prize_finished) y la hoja muestra lo suyo.
 */
import { entryLine } from '../lib/stats';
import type { BowlingEvent, Entry } from '../lib/types';

/** Lo que dice la tarjeta con el botón apagado. */
export interface PrizeReadiness {
  ready: boolean;
  /** Por qué todavía no («Se entregan cuando termine el torneo»). */
  waitText: string;
}

/**
 * Boliche: desde el día del torneo (`today` en la zona de la liga) y con al menos un juego verificado. Se puede
 * entregar el mismo día, en la premiación.
 */
export function bowlingReady(event: BowlingEvent, entries: readonly Entry[], today: string): PrizeReadiness {
  if (event.date > today) return { ready: false, waitText: 'Se entregan cuando termine el torneo' };
  const played = entries.some((e) => e.eventId === event.id && entryLine(e, event).games > 0);
  return played ? { ready: true, waitText: '' } : { ready: false, waitText: 'Se entregan cuando haya juegos verificados' };
}
