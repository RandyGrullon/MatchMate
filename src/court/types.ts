import type { MatchScore } from '../lib/data/matches';
import type { MatchEngine, Side } from '../sports/types';

/**
 * Cómo se enchufa un motor de deporte al modo cancha. Lo arma cada deporte (raqueta, baloncesto, fútbol…):
 * el motor puro de src/sports/<familia> más tres datos para publicar.
 */
export interface CourtAdapter<C, S, E> {
  engine: MatchEngine<C, S, E>;
  /** Marcador resumido que ven las tarjetas y la pantalla «En vivo» (matches.score): `{text, sides, …}`. */
  score(state: S): MatchScore;
  /** Ganador para terminar (null = empate). Por defecto `engine.result(state).winner`. */
  winner?(state: S): Side | null;
  /**
   * Publicar ya: fin de juego o de set, gol, fin de periodo, roja… Si no, se publica como mucho cada 60 s
   * (nunca por punto). El final del partido siempre publica.
   */
  milestone?(prev: S, next: S, ev: E): boolean;
}

/**
 * Lo que guarda el teléfono (IndexedDB) y lo que se publica en matches.state para retomar en otro teléfono:
 * la configuración, un estado base (tras compactar) y la lista de jugadas desde ahí. El marcador se recalcula
 * siempre con `replay`: deshacer = quitar la última jugada.
 */
export interface CourtSnapshot<C = unknown, S = unknown, E = unknown> {
  v: 1;
  /** Acciones hechas (jugadas y deshacer): sube siempre. Es el `p_seq` de publish_match. */
  seq: number;
  /** Configuración de `engine.init` (sorteo, reglas…). */
  config: C;
  /** Estado desde donde se reproduce la lista (después de compactar); null = `engine.init(config)`. */
  base: S | null;
  /** Jugadas desde `base`. */
  log: E[];
  /** Hora del teléfono (ms) de la última acción. */
  at: number;
  /**
   * Teléfono que sigue esta lista (id al azar guardado en el teléfono). Al retomar, un teléfono reconoce lo que
   * él mismo publicó (respuesta perdida, deshacer) y no lo toma como de otro.
   */
  origin?: string;
}
