/**
 * El botón «Compartir» de las tablas y resultados (ShareButton de la web; lo usan natación, la Tabla de equipos y el
 * leaderboard y el orden de mérito del golf): arma la imagen al tocar (con la marca de MatchMate y el color del deporte:
 * share/cards.ts, la misma de la web) y abre la hoja para compartirla con el link (ShareImageSheet de la app, la de los
 * partidos).
 */
import { useContext, useState } from 'react';
import { Pressable } from 'react-native';
import { Share2 } from 'lucide-react-native';
import { LeagueContext } from '@mm/lib/league';
import { shareOrigin } from '@mm/lib/origin';
import { useNow } from '@mm/lib/useNow';
import { leagueSport } from '@mm/sports/registry';
import type { ShareCard } from '@mm/components/share/cards';
import { shareImageOf } from '@mm/components/share/frame';
import { ShareImageSheet } from '@/components/match/ShareResult';
import { useColors } from '@/theme/theme';

interface Open {
  card: ShareCard;
  image: ReturnType<typeof shareImageOf>;
  url: string;
}

/**
 * El ícono de compartir (redondo, a la derecha del título de una sección). `card` se arma al tocar (null = nada que
 * compartir); `path`: la pantalla de la web que va con la imagen («/l/x/e/y?ver=puntos»). `round`: en su círculo gris
 * (el de arriba de Puntos).
 */
export function ShareIconButton({ label, card, path, round }: { label: string; card: () => ShareCard | null; path: string; round?: boolean }) {
  const c = useColors();
  const ctx = useContext(LeagueContext);
  const now = useNow();
  const [open, setOpen] = useState<Open | null>(null);
  const start = () => {
    const built = card();
    if (!built) return;
    const url = `${shareOrigin()}${path}`;
    setOpen({ card: built, url, image: shareImageOf(built, { sport: ctx ? leagueSport(ctx.league) : null, url, tz: ctx?.league.tz, now }) });
  };
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        hitSlop={6}
        onPress={start}
        style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: round ? c.surface2 : 'transparent', opacity: pressed ? 0.6 : 1, marginVertical: -8 })}
      >
        <Share2 size={20} color={c.fg2} />
      </Pressable>
      {open && <ShareImageSheet onClose={() => setOpen(null)} card={open.card} frame={open.image.frame} url={open.url} filename={open.image.filename} caption={open.image.caption} />}
    </>
  );
}
