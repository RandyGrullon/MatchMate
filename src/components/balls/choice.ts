import { useRef } from 'react';
import { defaultBall, type Ball } from '../../lib/balls';
import { ballAddedHere, storedBall, useMyBalls } from '../../lib/data/balls';
import { getUserId } from '../../lib/data/client';

/*
 * La bola del juego al anotar, sin nada de la pantalla: lo usan BallPicker.tsx de la web (que lo reexporta) y la hoja de
 * anotar de la app del teléfono (movil/src/components/bowling/ScoreEditor.tsx).
 */

/** Las bolas para elegir al anotar (useBallChoice). */
export interface BallChoice {
  /** Todas las de la cuenta, también las retiradas (en el orden de my_balls). */
  balls: Ball[];
  /**
   * Se puede anotar la bola: hay sesión y la lista se leyó (del servidor o de la copia del teléfono), aunque no tenga
   * ninguna (sale «Agregar bola»). Sin señal y sin copia: false (no se sabe qué tiene).
   */
  canPick: boolean;
  /** La que se pone sola en un juego nuevo (la última que usó; null si ninguna). */
  auto: string | null;
  /** La lista se leyó (del servidor o de la copia del teléfono). Ojo: sin sesión también es true (no hay nada que leer). */
  loaded: boolean;
  /**
   * La cuenta no tenía ninguna bola (ni retirada) la primera vez que se supo la lista en esta pantalla, y sigue así
   * aunque agregue una aquí mismo: los juegos que ya estaban no tenían bola (no hace falta esperar a leer sus bolas, que
   * al agregar la primera pasan a «leyendo» y la bola elegida se perdería). Deja de valer si llega una que no se agregó
   * en este teléfono: la lista que se vio al abrir era la copia vieja del teléfono.
   */
  noBallsAtStart: boolean;
}

/**
 * Las bolas para elegir al anotar: todas las de la cuenta, si se puede elegir (con sesión y la lista leída, aunque no
 * tenga ninguna: sale «Agregar bola») y la que se pone sola en un juego nuevo.
 */
export function useBallChoice(): BallChoice {
  const mine = useMyBalls();
  const balls = mine.data.balls;
  const loaded = !mine.loading && !mine.error;
  const uid = getUserId();
  const canPick = !!uid && loaded;
  // Se anota una sola vez (por cuenta): la primera vez que se sabe la lista.
  const start = useRef<{ uid: string; none: boolean } | null>(null);
  if (canPick && start.current?.uid !== uid) start.current = { uid, none: balls.length === 0 };
  return {
    balls,
    canPick,
    auto: defaultBall(balls, storedBall(), mine.data.lastUsed),
    loaded,
    noBallsAtStart: !!uid && start.current?.uid === uid && start.current.none && balls.every((b) => ballAddedHere(b.id)),
  };
}
