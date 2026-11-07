import { Users } from 'lucide-react';
import type { Match } from '../../../lib/data/matches';
import { racketScreens } from '../racket';
import { PICKLEBALL_BASE, SOCIAL_TEMPLATE_INFO } from '../racket/extensions';
import { isPointsMatch } from '../racket/logic/results';
import type { RacketExtensions, ResultEntrySpec } from '../racket/sport';
import { withFormats } from '../racket-formats';
import { PickleballCourt, pickleRules } from './court/PickleballCourt';
import { SocialForm } from './social/SocialForm';
import { SocialPage } from './social/SocialPage';
import { gameParser, gameText, isSocialEvent, type GameRules } from './social/logic';

/** «Solo el resultado» del juego del round robin: «11-7» (final posible a 11 ganando por 2). */
function gameEntry(m: Match): ResultEntrySpec | null {
  if (!isPointsMatch(m)) return null;
  const r = pickleRules(m);
  const game: GameRules = { to: r.gameTo, winBy: r.winBy, scoring: r.scoring };
  return {
    parser: gameParser(game),
    placeholder: `${game.to}-7`,
    hint: `Los puntos de cada lado. ${gameText(game)}.`,
    examples: [`${game.to}-9`, `${game.to}-5`],
    points: true,
  };
}

/**
 * Pickleball (fase 3): individual, dobles y mixto; juegos a 11, 15 o 21 ganando por 2, a un juego o al mejor de 3;
 * conteo tradicional (solo puntúa el que saca, canto «5-3-2», sacador 1 y 2, 0-0-2 al empezar) o por rally.
 * Plantillas de «Nuevo»: round robin social (compañeros que rotan, juegos a 11), liga de dobles, torneo grupos +
 * eliminatoria, liga por cajas y escalera. Tabla con el orden del round robin de USA Pickleball. Nivel DUPR manual.
 * Lo que no trae pantallas (plantillas que esconde y sus nombres, la línea del round robin, las palabras) está en
 * racket/extensions.ts (lo usa también la app del teléfono).
 */
export const PICKLEBALL_EXT: RacketExtensions = withFormats('pickleball', {
  ...PICKLEBALL_BASE,
  templates: [{ ...SOCIAL_TEMPLATE_INFO, icon: Users, Form: SocialForm }],
  eventPage: (e) => (isSocialEvent(e) ? SocialPage : null),
  court: () => PickleballCourt,
  resultEntry: gameEntry,
});

export default racketScreens('pickleball', PICKLEBALL_EXT);
