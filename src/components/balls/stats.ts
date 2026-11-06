import { useMemo } from 'react';
import { ballStats, pctText, type Ball, type BallGame, type BallStats } from '../../lib/balls';
import { useMyBallGames, useMyBalls } from '../../lib/data/balls';

/*
 * Los números de las bolas para las listas, sin la pantalla: lo usan BallStats.tsx de la web (que lo reexporta) y la
 * app del teléfono (movil/src/components/balls/).
 */

/** «Morada 14 lb»: el nombre con el peso, como en las filas de «Por bola». */
export const ballTitle = (b: Pick<Ball, 'name' | 'weight'>) => (b.weight ? `${b.name} ${b.weight} lb` : b.name);

/** Debajo del nombre en «Por bola»: «5 juegos · 41% strikes» (y «toca pulirla» cuando ya le toca). */
export function ballRowLine(s: Pick<BallStats, 'games' | 'strikePct' | 'needsResurface'>): string {
  return [`${s.games} ${s.games === 1 ? 'juego' : 'juegos'}`, s.strikePct != null && `${s.strikePct}% strikes`, s.needsResurface && 'toca pulirla']
    .filter(Boolean)
    .join(' · ');
}

/**
 * Debajo de los números de una bola: los strikes y spares de los juegos anotados por cuadros y los que todavía no
 * cuentan («2 juegos cuentan cuando se verifiquen.»); null si no hay ni unos ni otros.
 */
export function ballGamesNote(s: Pick<BallStats, 'framed' | 'pending' | 'strikePct' | 'sparePct'>): string | null {
  const framed =
    s.framed > 0 && `Strikes ${pctText(s.strikePct)} y spares ${pctText(s.sparePct)} con ${s.framed} ${s.framed === 1 ? 'juego anotado' : 'juegos anotados'} por cuadros.`;
  const pending = s.pending > 0 && `${s.pending} ${s.pending === 1 ? 'juego cuenta' : 'juegos cuentan'} cuando se ${s.pending === 1 ? 'verifique' : 'verifiquen'}.`;
  return [framed, pending].filter(Boolean).join(' ') || null;
}

/** Los números por bola para «Por bola» (las que no están retiradas o ya tienen juegos). */
export function statsForSection(balls: readonly Ball[], games: readonly BallGame[]): BallStats[] {
  return ballStats(balls, games).filter((s) => !s.ball.retired || s.games > 0);
}

/** Las bolas de la cuenta con sus números (las de «Por bola»), si tiene alguna y si todavía se están leyendo. */
export function useBallSection(): { stats: BallStats[]; has: boolean; loading: boolean } {
  const mine = useMyBalls();
  const has = mine.data.balls.length > 0;
  const games = useMyBallGames(null, has);
  const stats = useMemo(() => statsForSection(mine.data.balls, games.data), [mine.data.balls, games.data]);
  return { stats, has, loading: mine.loading && !has };
}
