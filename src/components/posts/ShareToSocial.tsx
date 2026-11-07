import { lazy, Suspense, useState, type ReactNode } from 'react';
import { Newspaper, Share } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import type { SharedGame } from '../../lib/data/posts';
import type { ProfileGame } from '../../lib/data/profileGames';
import { Button, cx } from '../ui';
import { useGameShare } from './gameShareTarget';
import type { ComposerTarget } from './postFormat';

// Si quien mira puede compartir un juego (sin React de pantallas: también lo usa el teléfono).
export { useGameShare };

/**
 * «Publicar en Social»: abre la hoja para publicar (src/components/posts/Composer.tsx) con el partido o el juego
 * pegado, su liga fija y un texto sugerido. La hoja se baja al tocar (las pantallas de liga no cargan el editor).
 * Si quien mira no puede publicarlo (no es miembro, liga con menores, juego de otro sin liga), no sale nada.
 */

const ComposerForm = lazy(() => import('./Composer').then((m) => ({ default: m.ComposerForm })));
const NO_LEAGUES: readonly ComposerTarget[] = [];

/** La hoja para publicar un juego (nada si no está abierta o no hay cuenta). */
export function PublishGameSheet({
  open,
  onClose,
  league,
  game,
  text,
  preview,
}: {
  open: boolean;
  onClose: () => void;
  /** La liga del juego (null: un juego suelto, va al perfil). */
  league: ComposerTarget | null;
  game: SharedGame;
  text: string;
  /** Cómo se ve el juego en la hoja. */
  preview?: ReactNode;
}) {
  const uid = useAuth().user?.uid;
  if (!open || !uid) return null;
  return (
    <Suspense fallback={null}>
      <ComposerForm uid={uid} fixedLeague={league} leagues={NO_LEAGUES} game={game} attachment={preview} suggestedText={text} onClose={onClose} />
    </Suspense>
  );
}

/**
 * El botón ancho «Publicar en Social» (debajo de compartir el resultado) con su hoja. `league` null = no se puede: no
 * sale.
 */
export function PublishButton({
  league,
  game,
  text,
  preview,
  className,
}: {
  league: ComposerTarget | null;
  game: SharedGame | null;
  text: string;
  preview?: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!league || !game) return null;
  return (
    <>
      <Button variant="quiet" size="lg" className={cx('w-full', className)} icon={<Newspaper className="size-5" />} onClick={() => setOpen(true)} aria-haspopup="dialog">
        Publicar en Social
      </Button>
      <PublishGameSheet open={open} onClose={() => setOpen(false)} league={league} game={game} text={text} preview={preview} />
    </>
  );
}

/** El ícono «Compartir en Social» del pie de la tarjeta de un juego (no sale si no se puede). */
export function GameShareButton({ game, preview, className }: { game: ProfileGame; preview?: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const share = useGameShare(game);
  if (!share) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label="Compartir en Social"
        title="Compartir en Social"
        className={cx(
          'inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-fg active:scale-95',
          'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
          className,
        )}
      >
        <Share className="size-[18px]" aria-hidden="true" />
      </button>
      <PublishGameSheet open={open} onClose={() => setOpen(false)} league={share.league} game={share.game} text={share.text} preview={preview} />
    </>
  );
}
