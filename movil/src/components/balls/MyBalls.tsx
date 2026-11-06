import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { router } from 'expo-router';
import { ChevronRight, Plus } from 'lucide-react-native';
import { useBallSection } from '@mm/components/balls/stats';
import { useColors } from '@/theme/theme';
import { font, radius } from '@/theme/tokens';
import { SectionHeader, Txt } from '../ui';
import { BallArt } from './BallArt';
import { BallIcon } from './bits';

/** Abre «Mis bolas» con esa bola o una nueva (`/bolas?bola=<id>`, `/bolas?nueva=1`). */
const openBalls = (params: { bola: string } | { nueva: '1' }) => router.push({ pathname: '/bolas' as never, params } as never);

/**
 * Yo › «Mis bolas» (MyBallsSection de la web, la de Lite): cada bola en su tarjeta (dibujada, con su nombre y cuántos
 * juegos lleva) y «Agregar»; tocar una la abre en Mis bolas. Sin bolas, una tarjeta para agregar la primera. En la web
 * sale en Yo cuando se muestra el boliche (ProfilePage: `showBowling`).
 */
export function MyBallsSection({ style }: { style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  const { stats, loading } = useBallSection();
  const active = stats.filter((s) => !s.ball.retired);
  return (
    <View style={[{ gap: 12 }, style]}>
      <SectionHeader
        title="Mis bolas"
        action={
          <Pressable accessibilityRole="button" onPress={() => openBalls({ nueva: '1' })} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 }}>
            <Plus size={16} color={c.accent} strokeWidth={2.4} />
            <Txt style={{ fontSize: 15, fontFamily: font.semibold, color: c.accent }}>Agregar</Txt>
          </Pressable>
        }
      />
      {loading ? (
        <View style={{ height: 66, borderRadius: 24, backgroundColor: c.surface2 }} />
      ) : active.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {active.map((s) => (
            <Pressable
              key={s.ball.id}
              accessibilityRole="button"
              accessibilityLabel={`${s.ball.name}, ${s.games} ${s.games === 1 ? 'juego' : 'juegos'}`}
              onPress={() => openBalls({ bola: s.ball.id })}
              style={({ pressed }) => ({
                flexBasis: '47%',
                flexGrow: 1,
                minWidth: 0,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                borderRadius: 24,
                padding: 14,
                backgroundColor: c.surface,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              })}
            >
              <BallArt ball={s.ball} size={38} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt numberOfLines={1} style={{ fontSize: 15, fontFamily: font.bold, color: c.fg }}>
                  {s.ball.name}
                </Txt>
                <Txt numberOfLines={1} tone="muted" style={{ fontSize: 13 }}>
                  {`${s.games} ${s.games === 1 ? 'juego' : 'juegos'}`}
                </Txt>
              </View>
            </Pressable>
          ))}
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => openBalls({ nueva: '1' })}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            minHeight: 56,
            borderRadius: radius.card,
            paddingVertical: 10,
            paddingLeft: 20,
            paddingRight: 18,
            backgroundColor: c.surface,
            transform: [{ scale: pressed ? 0.98 : 1 }],
          })}
        >
          <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accentSoft }}>
            <BallIcon size={20} color={c.accent} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt variant="bodyStrong">Agrega tu bola</Txt>
            <Txt tone="muted" style={{ fontSize: 14, marginTop: 2 }}>
              Y mira con cuál tiras mejor
            </Txt>
          </View>
          <ChevronRight size={20} color={c.faint} />
        </Pressable>
      )}
    </View>
  );
}
