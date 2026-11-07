import type { ReactNode } from 'react';
import { View } from 'react-native';
import { CircleHelp, Trophy } from 'lucide-react-native';
import { isGameId } from '@mm/sports/esports/catalog';
import { DEFAULT_SPORT, sportMeta } from '@mm/sports/registry';
import { GameMark } from '@/components/esports/bits';
import { SportColors, useColors } from '@/theme/theme';

/** 24 (la esquina de la fecha) y 36 (las filas de la semana): las medidas de SportMark de la web. */
const BOX = { xs: { side: 24, radius: 8, glyph: 14 }, sm: { side: 36, radius: 12, glyph: 16 } } as const;

/**
 * El deporte de una fecha en su cuadro y en su color (SportMark de la web, src/components/SportMark.tsx): el ícono en el
 * acento suave o, en esports con juego, el monograma del juego. Un torneo lleva el trofeo chico en la esquina. Es
 * adorno: lo que dice la fila ya lo nombra.
 */
export function SportMark({ sport, game, size = 'sm', torneo }: { sport: string | null | undefined; game?: string | null; size?: keyof typeof BOX; torneo?: boolean }) {
  const id = sport || DEFAULT_SPORT;
  return (
    <SportColors sport={id}>
      <Mark sport={id} game={game} size={size} torneo={torneo} />
    </SportColors>
  );
}

function Mark({ sport, game, size, torneo }: { sport: string; game?: string | null; size: keyof typeof BOX; torneo?: boolean }) {
  const c = useColors();
  const box = BOX[size];
  const Icon = sportMeta(sport)?.icon ?? CircleHelp;
  const shown = sport === 'esports' && isGameId(game) ? game : null;
  return (
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ width: box.side, height: box.side }}>
      {shown ? (
        <GameMark game={shown} side={box.side} decorative />
      ) : (
        <View style={{ width: box.side, height: box.side, borderRadius: box.radius, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={box.glyph} color={c.accent} />
        </View>
      )}
      {torneo && size !== 'xs' && (
        <View style={{ position: 'absolute', right: -4, bottom: -4, width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: c.surface, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
          <Trophy size={10} color={c.fg2} strokeWidth={2.4} />
        </View>
      )}
    </View>
  );
}

/**
 * Algo con el deporte en su esquina de abajo a la derecha (SportCorner de la web): el bloque de la fecha (OCT / 13) de
 * las fechas abiertas. Lo de adentro también toma el color del deporte (el mes de la fecha).
 */
export function SportCorner({ sport, game, children }: { sport: string | null | undefined; game?: string | null; children: ReactNode }) {
  const id = sport || DEFAULT_SPORT;
  return (
    <SportColors sport={id}>
      <Corner sport={id} game={game}>
        {children}
      </Corner>
    </SportColors>
  );
}

function Corner({ sport, game, children }: { sport: string; game?: string | null; children: ReactNode }) {
  const c = useColors();
  return (
    <View>
      {children}
      <View style={{ position: 'absolute', right: -5, bottom: -5, borderRadius: 10, borderWidth: 2, borderColor: c.surface }}>
        <Mark sport={sport} game={game} size="xs" />
      </View>
    </View>
  );
}
