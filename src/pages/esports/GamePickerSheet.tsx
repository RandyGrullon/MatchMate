import type { ReactNode } from 'react';
import { GAME_IDS, GAMES, type GameId } from '../../sports/esports';
import { GameMark } from '../../components/esports/bits';
import { Sheet, cx } from '../../components/ui';

/**
 * «¿De qué juego?»: los 15 juegos en una grilla de 3 (el monograma en su color y el nombre). La usan Esports
 * (`?crear=torneo` / `?crear=liga`) y Mi ID de juego («Agregar un ID»). `marked`: los que ya tienen algo (un ID), con
 * una marca. `children`: lo que va arriba de la grilla (p. ej. la tarjeta para entrar sin cuenta, en lugar de ella).
 */
export function GamePickerSheet({
  open,
  onClose,
  onPick,
  title = '¿De qué juego?',
  subtitle,
  marked,
  markLabel = 'Ya lo tienes',
  games = GAME_IDS,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (game: GameId) => void;
  title?: string;
  subtitle?: string;
  marked?: ReadonlySet<GameId>;
  markLabel?: string;
  games?: readonly GameId[];
  children?: ReactNode;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title} subtitle={subtitle}>
      {children ?? (
        <ul className="grid grid-cols-3 gap-2 pb-1" aria-label="Juegos">
          {games.map((g) => {
            const meta = GAMES[g];
            const on = marked?.has(g) ?? false;
            return (
              <li key={g} className="min-w-0">
                <button
                  type="button"
                  onClick={() => onPick(g)}
                  aria-label={on ? `${meta.name} · ${markLabel}` : meta.name}
                  className={cx(
                    'flex min-h-[92px] w-full flex-col items-center justify-center gap-2 rounded-2xl px-1.5 py-2.5 text-center transition',
                    'bg-surface-2 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                    on && 'shadow-[inset_0_0_0_1.5px_var(--accent)]',
                  )}
                >
                  <GameMark game={g} size="md" />
                  <span className="line-clamp-2 text-[12.5px] leading-tight font-semibold break-words">{meta.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}
