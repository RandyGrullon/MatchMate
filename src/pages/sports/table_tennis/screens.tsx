import type { Match } from '../../../lib/data/matches';
import { racketResultParser } from '../../../components/match';
import { needed } from '../../../sports/racket';
import { racketScreens } from '../racket';
import { isPointsMatch } from '../racket/logic/results';
import type { RacketExtensions, ResultEntrySpec } from '../racket/sport';
import { withFormats } from '../racket-formats';
import { TableTennisCourt, ttRules } from './court/TableTennisCourt';

/** Marcadores de muestra que terminan el partido con cada largo: el del campo y los que se tocan para llenarlo. */
const SAMPLES: Record<3 | 5 | 7, { placeholder: string; examples: string[] }> = {
  3: { placeholder: '11-7 9-11 11-5', examples: ['11-7 11-9', '11-9 8-11 11-6', '9-11 12-10 11-7'] },
  5: { placeholder: '11-7 9-11 11-5 11-8', examples: ['11-7 11-9 11-5', '11-9 8-11 11-6 11-4', '11-8 9-11 12-10 6-11 11-7'] },
  7: {
    placeholder: '11-7 9-11 11-5 11-8 11-6',
    examples: ['11-7 11-9 11-5 11-8', '11-9 8-11 11-6 9-11 11-4 11-7', '11-8 9-11 12-10 6-11 11-7 8-11 11-9'],
  },
};

/** «Solo el resultado» de un partido de ping pong: juego por juego, a 11 ganando por 2, con el largo del partido. */
export function tableTennisEntry(m: Match): ResultEntrySpec {
  const rules = ttRules(m);
  const { placeholder, examples } = SAMPLES[rules.bestOf];
  return {
    parser: racketResultParser(rules),
    placeholder,
    examples,
    hint: `Juego por juego, separados por espacio: al mejor de ${rules.bestOf}, gana quien llega a ${needed(rules.bestOf)} juegos. En 10-10 se sigue hasta sacar 2 de ventaja (12-10).`,
    points: false,
  };
}

/**
 * Ping pong (tenis de mesa): individual y dobles, juegos a 11 ganando por 2, al mejor de 3, 5 o 7, saque cada 2
 * puntos (uno cada uno desde 10-10), cambio de lado en cada juego y a los 5 del decisivo, y la rotación de saque de
 * dobles. Plantillas de «Nuevo»: liga, torneo grupos + eliminatoria, liga por cajas y escalera (sin americano ni
 * mexicano: las parejas que rotan no son de ping pong). Tabla de grupos de la ITTF (ganar 2, perder 1). Nivel de
 * club de 1 a 10. Donde se juega se llama «mesa».
 */
export const TABLE_TENNIS_EXT: RacketExtensions = withFormats('table_tennis', {
  hideTemplates: ['americano', 'mexicano'],
  templateTitles: (doubles) => ({
    liga: { title: doubles ? 'Liga de dobles' : 'Liga', text: 'Todos contra todos por jornadas, con mesas, horas y la tabla de la ITTF (ganar 2, perder 1).' },
    torneo: { title: 'Torneo grupos + eliminatoria', text: 'Categorías por nivel: grupos de 3 o 4 que pasan al cuadro, con 3.er lugar, como en la ITTF.' },
  }),
  court: (m) => (isPointsMatch(m) ? null : TableTennisCourt),
  resultEntry: tableTennisEntry,
  words: { court: ['mesa', 'mesas'] },
});

export default racketScreens('table_tennis', TABLE_TENNIS_EXT);
