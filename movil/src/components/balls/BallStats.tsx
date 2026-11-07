import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { router } from 'expo-router';
import type { BallStats } from '@mm/lib/balls';
import { ballRowLine, ballTitle, useBallSection } from '@mm/components/balls/stats';
import { Card, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { BallArt } from './BallArt';

/** Abre «Mis bolas» (`/bolas`) o una bola ahí (`/bolas?bola=<id>`). */
const openBalls = (bola?: string) => router.push({ pathname: '/bolas' as never, params: bola ? { bola } : {} } as never);

/** Una fila de «Por bola»: la bola dibujada (30 px), nombre y peso, juegos y strikes, y el promedio grande. Abre esa bola. */
function BallRow({ stats: s }: { stats: BallStats }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${ballTitle(s.ball)}: promedio ${s.average ?? 'sin juegos'}, ${ballRowLine(s)}`}
      onPress={() => openBalls(s.ball.id)}
      style={({ pressed }) => [styles.row, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line, backgroundColor: pressed ? c.surface2 : 'transparent' }]}
    >
      <BallArt ball={s.ball} size={30} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="bodyStrong" numberOfLines={1}>
          {ballTitle(s.ball)}
        </Txt>
        <Txt variant="meta" tone="muted" numberOfLines={1}>
          {ballRowLine(s)}
        </Txt>
      </View>
      <Txt style={{ fontSize: 20, fontFamily: font.bold, fontVariant: ['tabular-nums'], color: s.average != null ? c.fg : c.faint }}>{s.average ?? '—'}</Txt>
    </Pressable>
  );
}

/**
 * Yo › Pro › «Por bola» (BallStatsSection de src/components/balls/BallStats.tsx, con su misma lógica: stats.ts): los
 * números de cada bola (el promedio grande, juegos y strikes; tocarla la abre en Mis bolas), con el link a «Mis bolas»
 * (ahí está con cuál tiras mejor y cuándo pulirlas). Solo si la cuenta tiene bolas.
 */
export function BallStatsSection({ style }: { style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  const { stats, has } = useBallSection();
  if (!has || !stats.length) return null;
  return (
    <Card padded={false} style={style}>
      <View accessibilityLabel="Por bola">
        <View style={styles.head}>
          <Txt accessibilityRole="header" style={{ fontSize: 16, lineHeight: 22, fontFamily: font.semibold, letterSpacing: -0.16 }}>
            Por bola
          </Txt>
          <Pressable accessibilityRole="link" hitSlop={6} onPress={() => openBalls()} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Txt style={{ fontSize: 14, fontFamily: font.semibold, color: c.accent }}>Mis bolas</Txt>
          </Pressable>
        </View>
        {stats.map((s) => (
          <BallRow key={s.ball.id} stats={s} />
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingLeft: 20, paddingRight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64, paddingHorizontal: 16, paddingVertical: 10 },
});
