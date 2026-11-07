import { useId, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react-native';
import type { BowlingNumbersState } from '@mm/components/bowlingNumbers';
import { SPARK_GAMES, sparkline, trendBadge, type TrendBadge } from '@mm/components/stats/yoTrend';
import type { StatGame } from '@mm/lib/bowlingStats';
import { Card, LoadError, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font, type as typeScale } from '@/theme/tokens';

/**
 * Yo › Lite: la tarjeta «Tu promedio» (AverageCard de la web, src/components/stats/YoStats.tsx) o, sin juegos todavía,
 * cómo empezar (NoBowlingNumbers de GlobalStats.tsx). Los números los suma la lógica de la web (bowlingNumbers.ts) y
 * cómo vas y la gráfica corta salen de yoTrend.ts.
 */

/** Cómo vas este mes («+9 en octubre»): en verde si subió; si no, apagado. */
function TrendLine({ badge }: { badge: TrendBadge }) {
  const c = useColors();
  const Icon = badge.dir === 'up' ? TrendingUp : badge.dir === 'down' ? TrendingDown : Minus;
  const color = badge.dir === 'up' ? c.ok : c.muted;
  return (
    <View accessible accessibilityLabel={badge.full} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 }}>
      <Icon size={16} color={color} strokeWidth={2.2} />
      <Txt style={{ color, fontSize: 14, lineHeight: 19, fontFamily: font.semibold }}>{badge.text}</Txt>
    </View>
  );
}

/** La gráfica corta de la tarjeta del promedio (sin ejes): los últimos juegos, el último con un punto. */
function Sparkline({ scores }: { scores: readonly number[] }) {
  const c = useColors();
  const id = `mm-spark-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const s = sparkline(scores);
  if (!s) return null;
  return (
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ marginBottom: 4 }}>
      <Svg width={132} height={76} viewBox="0 0 132 76" fill="none">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={c.accent} stopOpacity={0.18} />
            <Stop offset="1" stopColor={c.accent} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Path d={s.area} fill={`url(#${id})`} />
        <Path d={s.line} stroke={c.accent} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        <Circle cx={s.last.x} cy={s.last.y} r={4.5} fill={c.accent} stroke={c.surface} strokeWidth={2} />
      </Svg>
    </View>
  );
}

/**
 * «Tu promedio» grande con la gráfica corta de los últimos juegos y cómo vas este mes; abajo, Mejor juego · Mejor serie ·
 * Juegos. `history`: todos los juegos que cuentan, con su fecha, del más viejo al más nuevo.
 */
export function AverageCard({
  average,
  history,
  high,
  series,
  games,
}: {
  average: number | null;
  history: readonly Pick<StatGame, 'date' | 'score'>[];
  high: number;
  series: number;
  games: number;
}) {
  const c = useColors();
  const { width } = useWindowDimensions();
  const badge = trendBadge(history);
  const scores = history.map((g) => g.score);
  const trio: [string, ReactNode][] = [
    ['Mejor juego', high || '—'],
    ['Mejor serie', series || '—'],
    ['Juegos', games],
  ];
  return (
    <Card padded={false}>
      <View accessibilityLabel="Tu promedio" style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, paddingTop: 18, paddingRight: 20, paddingLeft: 22 }}>
        <View style={{ flexShrink: 1, minWidth: 0 }}>
          <Txt variant="meta" tone="muted" style={{ fontFamily: font.medium }}>
            Tu promedio
          </Txt>
          <Txt style={[typeScale.hero, { marginTop: 8, fontVariant: ['tabular-nums'] }]}>{average ?? '—'}</Txt>
          {badge && <TrendLine badge={badge} />}
        </View>
        {/* En pantallas muy angostas (menos de 360) la gráfica no cabe al lado del número, como en la web. */}
        {width >= 360 && <Sparkline scores={scores.slice(-SPARK_GAMES)} />}
      </View>
      <View style={{ flexDirection: 'row', marginTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line, paddingTop: 14, paddingBottom: 16 }}>
        {trio.map(([label, value], i) => (
          <View
            key={label}
            accessible
            accessibilityLabel={`${label}: ${String(value)}`}
            style={{ flex: 1, minWidth: 0, alignItems: 'center', paddingHorizontal: 4, borderLeftWidth: i > 0 ? StyleSheet.hairlineWidth : 0, borderLeftColor: c.line }}
          >
            <Txt style={{ fontSize: 24, lineHeight: 27, fontFamily: font.bold, fontVariant: ['tabular-nums'] }}>{value}</Txt>
            <Txt tone="muted" numberOfLines={1} style={{ fontSize: 13, lineHeight: 17 }}>
              {label}
            </Txt>
          </View>
        ))}
      </View>
    </Card>
  );
}

/** Sin números todavía: su jugador se está creando, o cómo empezar (unirse, crear o un juego suelto). */
export function NoBowlingNumbers({ preparing }: { preparing: string | null }) {
  const c = useColors();
  const link = { fontFamily: font.medium, color: c.accent };
  return (
    <Card>
      {preparing ? (
        <Txt variant="meta" tone="muted">
          Estamos preparando tu jugador. Si no aparece en unos segundos, ábrelo en{' '}
          <Txt accessibilityRole="link" variant="meta" style={link} onPress={() => router.push({ pathname: '/l/[lid]/perfil', params: { lid: preparing } })}>
            Mis juegos
          </Txt>
          .
        </Txt>
      ) : (
        <Txt variant="meta" tone="muted">
          Únete a una liga, crea la tuya o{' '}
          <Txt accessibilityRole="link" variant="meta" style={link} onPress={() => router.push('/juegos-sueltos')}>
            anota un juego suelto
          </Txt>
          : aquí verás tus números de todo junto.
        </Txt>
      )}
    </Card>
  );
}

/** Lite: la tarjeta «Tu promedio» (o, sin juegos todavía, cómo empezar). */
export function LiteNumbers({ state }: { state: BowlingNumbersState }) {
  const c = useColors();
  if (state.status === 'loading') return <View accessibilityLabel="Cargando tus números" style={{ height: 230, borderRadius: 24, backgroundColor: c.surface2 }} />;
  if (state.status === 'error') return <LoadError error={state.error} />;
  if (state.status === 'none') return <NoBowlingNumbers preparing={state.preparing} />;
  const { all, games } = state.data;
  return <AverageCard average={all.autoAverage} history={games} high={all.high} series={all.highSeries} games={all.games} />;
}
