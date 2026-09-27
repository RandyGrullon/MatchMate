import { racketScreens } from '../racket';
import type { RacketExtensions } from '../racket/sport';
import { withFormats } from '../racket-formats';

/**
 * Tenis (fase 3): individual y dobles, con ventaja o sin ventaja, sets a 6 con tie-break a 7, sets cortos,
 * Fast4, match tie-break en el decisivo y al mejor de 3 o 5 (plantillas de src/sports/racket/rules.ts, se eligen
 * en Admin › Jugadores y niveles o antes de cada partido). Plantillas de «Nuevo»: liga por cajas mensual,
 * escalera, liga y torneo con cuadro. Nivel NTRP manual. La cancha es la de sets de raqueta (15/30/40, AD,
 * punto decisivo, tie-break con su rotación de saque y cambios de lado).
 */
export const TENNIS_EXT: RacketExtensions = withFormats('tennis', {
  hideTemplates: ['americano', 'mexicano'],
  templateTitles: (doubles) => ({
    liga: { title: doubles ? 'Liga de dobles' : 'Liga', text: 'Todos contra todos por jornadas, de ida o de ida y vuelta, con canchas, horas y tabla.' },
    torneo: { title: 'Torneo con cuadro', text: 'Categorías por nivel: grupos o cuadro directo con siembra por NTRP, cruces y 3.er lugar.' },
  }),
});

export default racketScreens('tennis', TENNIS_EXT);
