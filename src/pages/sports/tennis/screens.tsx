import { racketScreens } from '../racket';
import { TENNIS_BASE } from '../racket/extensions';
import type { RacketExtensions } from '../racket/sport';
import { withFormats } from '../racket-formats';

/**
 * Tenis (fase 3): individual y dobles, con ventaja o sin ventaja, sets a 6 con tie-break a 7, sets cortos,
 * Fast4, match tie-break en el decisivo y al mejor de 3 o 5 (plantillas de src/sports/racket/rules.ts, se eligen
 * en Admin › Jugadores y niveles o antes de cada partido). Plantillas de «Nuevo»: liga por cajas mensual,
 * escalera, liga y torneo con cuadro. Nivel NTRP manual. La cancha es la de sets de raqueta (15/30/40, AD,
 * punto decisivo, tie-break con su rotación de saque y cambios de lado). Lo que esconde y cómo llama a sus plantillas
 * está en racket/extensions.ts (lo usa también la app del teléfono).
 */
export const TENNIS_EXT: RacketExtensions = withFormats('tennis', { ...TENNIS_BASE });

export default racketScreens('tennis', TENNIS_EXT);
