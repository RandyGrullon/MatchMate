/**
 * «Publicar en Social» (ShareToSocial.tsx de la web): la hoja para publicar (Composer.tsx) con el partido o el juego
 * pegado, su liga fija y un texto sugerido. Si quien mira no puede publicarlo (no es miembro, liga con menores, juego de
 * otro sin liga), no sale nada. Quién puede y el texto: la misma lógica de la web (gameShareTarget.ts, shareGame.ts).
 */
import { useState, type ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Newspaper, Share } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import type { SharedGame } from '@mm/lib/data/posts';
import type { ProfileGame } from '@mm/lib/data/profileGames';
import { useGameShare } from '@mm/components/posts/gameShareTarget';
import type { ComposerTarget } from '@mm/components/posts/postFormat';
import { ComposerSheet } from './Composer';
import { Button } from '../ui';
import { useColors } from '@/theme/theme';

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
  return <ComposerSheet uid={uid} fixedLeague={league} game={game} attachment={preview} suggestedText={text} onClose={onClose} />;
}

/**
 * El botón ancho «Publicar en Social» (debajo de compartir el resultado). `onPress`: qué hace (la hoja de compartir lo
 * abre encima de sí misma). `league` o `game` null = no se puede: no sale.
 */
export function PublishButton({ league, game, onPress }: { league: ComposerTarget | null; game: SharedGame | null; onPress: () => void }) {
  const c = useColors();
  if (!league || !game) return null;
  return (
    <Button size="lg" full icon={<Newspaper size={20} color={c.fg} />} onPress={onPress}>
      Publicar en Social
    </Button>
  );
}

/** El ícono «Compartir en Social» del pie de la tarjeta de un juego (no sale si no se puede). */
export function GameShareButton({ game, preview }: { game: ProfileGame; preview?: ReactNode }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const share = useGameShare(game);
  if (!share) return null;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Compartir en Social"
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? c.surface2 : 'transparent' })}
      >
        <Share size={18} color={c.muted} />
      </Pressable>
      <PublishGameSheet open={open} onClose={() => setOpen(false)} league={share.league} game={share.game} text={share.text} preview={preview} />
    </>
  );
}
