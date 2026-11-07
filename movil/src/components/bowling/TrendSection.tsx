/**
 * La tendencia de un jugador en su página de la liga (TrendSection y ScoreChart de la web, con su misma lógica:
 * src/components/stats/trendLogic.ts y src/lib/bowlingStats.ts): los últimos 30 juegos que cuentan con la media móvil de
 * 5 y el promedio como referencia, o el promedio de cada mes; y en palabras si va subiendo o bajando. La gráfica se
 * dibuja con react-native-svg al ancho de la tarjeta; tocarla (y deslizar el dedo) dice de qué juego es cada punto.
 */
import { useState } from 'react';
import { Pressable, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react-native';
import { TREND_STEP, monthlyAverages, movingAverage, recentTrend, trendText, type StatGame } from '@mm/lib/bowlingStats';
import {
  CHART_DEFAULT_WIDTH,
  CHART_H,
  CHART_PAD,
  CHART_PAD_BOTTOM_LABELS,
  MONTHS_SHOWN,
  TREND_LAST,
  TREND_WINDOW,
  chartRange,
  labelStep,
  monthLabels,
  monthName,
} from '@mm/components/stats/trendLogic';
import { Card, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

export interface ChartPoint {
  score: number;
  /** Texto del aviso al tocarlo: evento y juego. */
  label: string;
}

/**
 * Línea de los últimos juegos verificados con el promedio como referencia (ScoreChart de la web). `trend` (alineada con
 * los puntos) dibuja encima la media móvil; `unit` dice qué es cada punto («pinos» o «de promedio»), `name` qué muestra la
 * gráfica para el lector de pantalla y `xLabels` lo que va debajo de cada punto (el mes; la del último siempre).
 */
export function ScoreChart({
  points,
  average,
  trend,
  unit = 'pinos',
  name,
  xLabels,
}: {
  points: readonly ChartPoint[];
  average: number | null;
  trend?: readonly number[];
  unit?: string;
  name?: string;
  xLabels?: readonly string[];
}) {
  const c = useColors();
  const [W, setW] = useState(CHART_DEFAULT_WIDTH);
  const [hover, setHover] = useState<number | null>(null);
  // El ancho del aviso (para que quede encima del punto sin salirse de la tarjeta).
  const [tipW, setTipW] = useState(140);
  if (points.length < 2) return null;

  const H = CHART_H;
  const PAD = CHART_PAD;
  const scores = points.map((p) => p.score);
  const line = trend && trend.length === points.length ? trend : null;
  const labels = xLabels && xLabels.length === points.length ? xLabels : null;
  const bottom = labels ? CHART_PAD_BOTTOM_LABELS : PAD.bottom;
  const { lo, hi } = chartRange(scores, line, average);
  const x = (i: number) => PAD.left + (i * (W - PAD.left - PAD.right)) / (points.length - 1);
  const y = (v: number) => PAD.top + ((hi - v) * (H - PAD.top - bottom)) / (hi - lo);
  const ticks: number[] = [];
  for (let t = lo; t <= hi; t += 50) ticks.push(t);
  const step = labelStep(points.length, W);

  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(' ');
  const area = `${path} L${x(points.length - 1).toFixed(1)},${y(lo)} L${x(0).toFixed(1)},${y(lo)} Z`;
  const trendPath = line?.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const bestIdx = scores.lastIndexOf(Math.max(...scores));
  const lastIdx = points.length - 1;

  const onMove = (e: GestureResponderEvent) => {
    const i = Math.round(((e.nativeEvent.locationX - PAD.left) / (W - PAD.left - PAD.right)) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  };
  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0 && w !== W) setW(w);
  };
  const h = hover != null ? points[hover] : null;
  const tipLeft = hover != null ? Math.max(0, Math.min(x(hover) - tipW / 2, W - tipW)) : 0;

  return (
    <View
      onLayout={onLayout}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${name ?? `Últimos ${points.length} juegos`}: de ${Math.min(...scores)} a ${Math.max(...scores)} ${unit}`}
      onStartShouldSetResponder={() => true}
      onResponderTerminationRequest={() => true}
      onResponderGrant={onMove}
      onResponderMove={onMove}
      onResponderRelease={() => setHover(null)}
      onResponderTerminate={() => setHover(null)}
    >
      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {ticks.map((t) => (
          <G key={t}>
            <Line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke={c.line} strokeWidth={1} />
            <SvgText x={PAD.left - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill={c.muted} fontFamily={font.regular}>
              {t}
            </SvgText>
          </G>
        ))}
        {labels?.map((l, i) =>
          (lastIdx - i) % step === 0 ? (
            <SvgText key={i} x={x(i)} y={H - 12} textAnchor="middle" fontSize={11} fill={c.muted} fontFamily={font.regular}>
              {l}
            </SvgText>
          ) : null,
        )}
        {average != null && average > lo && average < hi && <Line x1={PAD.left} x2={W - PAD.right} y1={y(average)} y2={y(average)} stroke={c.muted} strokeWidth={1} />}
        <Path d={area} fill={c.accent} opacity={0.1} />
        <Path d={path} fill="none" stroke={c.accent} strokeWidth={line ? 1.5 : 2} strokeLinejoin="round" strokeLinecap="round" />
        {trendPath && <Path d={trendPath} fill="none" stroke={c.fg} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        {hover != null && <Line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={H - bottom} stroke={c.muted} strokeWidth={1} />}
        {[bestIdx, lastIdx, ...(hover != null ? [hover] : [])].map((i, k) => (
          <Circle key={`${i}-${k}`} cx={x(i)} cy={y(points[i].score)} r={4} fill={c.accent} stroke={c.surface} strokeWidth={2} />
        ))}
        <SvgText x={x(bestIdx)} y={y(points[bestIdx].score) - 10} textAnchor="middle" fontSize={11} fill={c.fg} fontFamily={font.semibold}>
          {points[bestIdx].score}
        </SvgText>
        {lastIdx !== bestIdx && (
          <SvgText x={x(lastIdx) - 8} y={y(points[lastIdx].score) - 10} textAnchor="end" fontSize={11} fill={c.fg} fontFamily={font.regular}>
            {points[lastIdx].score}
          </SvgText>
        )}
      </Svg>
      {h && hover != null && (
        <View
          pointerEvents="none"
          onLayout={(e) => setTipW(Math.round(e.nativeEvent.layout.width))}
          style={{
            position: 'absolute',
            top: 0,
            left: tipLeft,
            maxWidth: W,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: c.line,
            backgroundColor: c.surface,
            paddingHorizontal: 10,
            paddingVertical: 6,
            shadowColor: '#000',
            shadowOpacity: 0.12,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 4 },
            elevation: 4,
          }}
        >
          <Txt style={{ fontSize: 14, fontFamily: font.semibold, fontVariant: ['tabular-nums'] }}>{`${h.score} ${unit}`}</Txt>
          {line && (
            <Txt tone="muted" style={{ fontSize: 12, fontVariant: ['tabular-nums'] }}>
              {`Media ${line[hover].toLocaleString('es-DO')}`}
            </Txt>
          )}
          <Txt tone="muted" numberOfLines={1} style={{ fontSize: 12 }}>
            {h.label}
          </Txt>
        </View>
      )}
    </View>
  );
}

type TrendView = 'juegos' | 'meses';

/** Una muestra de la leyenda: la rayita del color y su nombre. */
function Key({ color, thin, children }: { color: string; thin?: boolean; children: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 16, height: thin ? 1 : 2, borderRadius: 1, backgroundColor: color }} />
      <Txt tone="muted" style={{ fontSize: 12 }}>
        {children}
      </Txt>
    </View>
  );
}

/**
 * La tendencia de los juegos que cuentan (del más viejo al más nuevo): los últimos 30 con la media móvil de 5 y el
 * promedio como referencia, o el promedio de cada mes; y en palabras si va subiendo o bajando. Con menos de 2 juegos no
 * sale. `mine`: los juegos son de quien mira («vas subiendo»; si no, «va subiendo»).
 */
export function TrendSection({ games, average, mine = true }: { games: readonly Pick<StatGame, 'date' | 'score' | 'label'>[]; average: number | null; mine?: boolean }) {
  const c = useColors();
  const [view, setView] = useState<TrendView>('juegos');
  if (games.length < 2) return null;

  const scores = games.map((g) => g.score);
  const moving = movingAverage(scores, TREND_WINDOW);
  const shown = games.slice(-TREND_LAST);
  const points: ChartPoint[] = shown.map((g) => ({ score: g.score, label: g.label ?? '' }));
  const trend = moving.slice(-TREND_LAST);
  const months = monthlyAverages(games).slice(-MONTHS_SHOWN);
  const monthPoints: ChartPoint[] = months.map((m) => ({
    score: m.average,
    label: `${monthName(m.month)} · ${m.games} ${m.games === 1 ? 'juego' : 'juegos'} · mejor ${m.high}`,
  }));
  const byMonth = view === 'meses' && monthPoints.length >= 2;
  const t = recentTrend(scores);
  const TrendIcon = !t ? null : t.delta >= TREND_STEP ? TrendingUp : t.delta <= -TREND_STEP ? TrendingDown : Minus;
  const iconColor = !t ? c.muted : t.delta >= TREND_STEP ? c.ok : t.delta <= -TREND_STEP ? c.warn : c.muted;

  return (
    <View accessibilityLabel="Tendencia" style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 12, rowGap: 4 }}>
        <Txt variant="meta" tone="muted" accessibilityRole="header" style={{ fontFamily: font.semibold }}>
          {byMonth ? `Promedio por mes (${monthPoints.length})` : `Últimos ${points.length} juegos`}
        </Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 4 }}>
          {!byMonth && (
            <>
              <Key color={c.accent}>juegos</Key>
              <Key color={c.fg}>{`media de ${TREND_WINDOW}`}</Key>
            </>
          )}
          {average != null && (
            <Key color={c.muted} thin>
              {`promedio ${average}`}
            </Key>
          )}
        </View>
      </View>
      {monthPoints.length >= 2 && (
        <View accessibilityRole="radiogroup" accessibilityLabel="Ver la tendencia" style={{ flexDirection: 'row', gap: 4, borderRadius: 12, padding: 4, backgroundColor: c.surface2 }}>
          {(
            [
              ['juegos', 'Juego por juego'],
              ['meses', 'Por mes'],
            ] as const
          ).map(([key, label]) => {
            const on = (key === 'meses') === byMonth;
            return (
              <Pressable
                key={key}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => setView(key)}
                style={{ flex: 1, minHeight: 44, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.surface : 'transparent' }}
              >
                <Txt tone={on ? 'fg' : 'muted'} style={{ fontSize: 14, fontFamily: font.medium }}>
                  {label}
                </Txt>
              </Pressable>
            );
          })}
        </View>
      )}
      <Card padded={false} style={{ paddingHorizontal: 8, paddingTop: 12, paddingBottom: 4 }}>
        {byMonth ? (
          <ScoreChart
            points={monthPoints}
            average={average}
            unit="de promedio"
            name={`Promedio de los últimos ${monthPoints.length} meses`}
            xLabels={monthLabels(months.map((m) => m.month))}
          />
        ) : (
          <ScoreChart points={points} average={average} trend={trend} />
        )}
      </Card>
      {t && TrendIcon && (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <TrendIcon size={16} color={iconColor} style={{ marginTop: 2 }} />
          <Txt variant="meta" style={{ flex: 1 }}>
            {trendText(t, mine)}
          </Txt>
        </View>
      )}
    </View>
  );
}
