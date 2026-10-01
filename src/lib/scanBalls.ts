/**
 * La bola de los juegos propios al verificar con foto (ScanModal): el admin o el anotador que también juega anota con qué
 * bola tiró cada juego de su fila. Sin React ni base (se prueba solo); cada juego se cuenta igual que en la hoja del
 * evento (eventGameBall y eventBallUpdate, src/lib/balls.ts).
 */
import { eventBallUpdate, eventGameBall } from './balls';

/**
 * La bola que se ve en un juego del evento (`game` desde 0): la que eligió en esta foto (`picked`, por juego del evento;
 * null = sin bola) o, si no eligió, la que ya tenía ese juego y, en uno sin puntaje (`scored`), `auto` (la última que
 * usó). Uno con puntaje y sin bola sale sin bola (ver eventGameBall).
 */
export function scanGameBall(
  had: Readonly<Record<number, string>>,
  picked: Readonly<Record<number, string | null>>,
  game: number,
  scored: boolean,
  auto: string | null,
): string | null {
  return game in picked ? picked[game] : eventGameBall(had, game, scored, auto);
}

/**
 * Las bolas de sus juegos al guardarlos ({"<juego>": bola | null} para la cola), con la que se ve en cada uno
 * (`ballOf`); null si no cambia ninguna. Solo los que se guardan (`values`: juego del evento → pinos) y caben en el
 * evento (`games`): set_game_balls no acepta un juego que el evento no tiene.
 */
export function scanBallUpdate(
  had: Readonly<Record<number, string>>,
  values: Readonly<Record<number, number>>,
  games: number,
  ballOf: (game: number) => string | null,
): Record<string, string | null> | null {
  const out: Record<string, string | null> = {};
  for (const [k, score] of Object.entries(values)) {
    const game = Number(k);
    if (game < games) Object.assign(out, eventBallUpdate(had, game, score, ballOf(game)));
  }
  return Object.keys(out).length ? out : null;
}
