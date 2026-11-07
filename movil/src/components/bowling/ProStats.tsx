/**
 * Los números de Pro de Yo y de Juegos sueltos (NumbersGrid, TrendCard y ShotsCard de src/components/stats/YoStats.tsx,
 * con su misma lógica: yoCharts.ts y yoTrend.ts): los 6 números en una tarjeta de 3 × 2, «Tendencia» (Por juego | Por
 * mes, con fechas, el mejor y el último con su número, y el mes anterior contra este) y «Tus tiros» (strikes, spares y
 * abiertos, la primera bola, «Pinos que te quedan» y «Ver todo por cuadros» con el análisis de siempre). La gráfica se
 * dibuja con react-native-svg; tocarla (y deslizar el dedo) dice de qué juego es cada punto.
 */
import { useId, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import { ChevronDown } from 'lucide-react-native';
import { LEFT_CUTS, frameRates, hasPins, heatLevel, pinReport, type PinReport, type StatGame } from '@mm/lib/bowlingStats';
import type { GameFrames } from '@mm/lib/types';
import { PIN_ROWS } from '@mm/components/frames/editorLogic';
import {
  TREND_CHART_H,
  TREND_DEFAULT_WIDTH,
  TREND_FIRST_X,
  TREND_PLOT_BOTTOM,
  TREND_PLOT_TOP,
  frameShares,
  gamePoints,
  monthPoints,
  pinLine,
  trendIndexAt,
  trendLayout,
  type TrendPoint,
} from '@mm/components/stats/yoCharts';
import { monthCompare } from '@mm/components/stats/yoTrend';
import { Card, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { FrameStatsPanel, heatColors } from './FrameStats';

/** Un número de la grilla de Pro. */
export interface NumberItem {
  label: string;
  value: ReactNode;
  /** El promedio va en el color del deporte. */
  accent?: boolean;
}

/** Pro: los 6 números (Promedio, Mejor juego, Mejor serie / Juegos, Hcp, Asistencia) en una tarjeta de 3 × 2. */
export function NumbersGrid({ items }: { items: readonly NumberItem[] }) {
  const c = useColors();
  return (
    <Card padded={false}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {items.map((it, i) => (
          <View
            key={it.label}
            accessible
            accessibilityLabel={`${it.label}: ${typeof it.value === 'string' || typeof it.value === 'number' ? it.value : ''}`}
            style={[styles.cell, i >= 3 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}
          >
            {i % 3 !== 0 && <View style={[styles.cellLine, { backgroundColor: c.line }]} />}
            <Txt tone="muted" numberOfLines={1} style={{ fontSize: 12, fontFamily: font.semibold }}>
              {it.label}
            </Txt>
            <Txt style={{ marginTop: 3, fontSize: 25, lineHeight: 29, fontFamily: font.semibold, letterSpacing: -0.4, fontVariant: ['tabular-nums'], color: it.accent ? c.accent : c.fg }}>
              {it.value}
            </Txt>
          </View>
        ))}
      </View>
    </Card>
  );
}

// ---------- Tendencia ----------

function TrendChart({ points, average, name }: { points: readonly TrendPoint[]; average: number | null; name: string }) {
  const c = useColors();
  const gradient = `mm-trend-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [W, setW] = useState(TREND_DEFAULT_WIDTH);
  const [hover, setHover] = useState<number | null>(null);
  const [tipW, setTipW] = useState(160);
  if (points.length < 2) return null;
  const L = trendLayout(points, average, W);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${L.x(i).toFixed(1)} ${L.y(p.score).toFixed(1)}`).join(' ');
  const area = `${path} L${L.x(L.last).toFixed(1)} ${TREND_PLOT_BOTTOM} L${L.x(0).toFixed(1)} ${TREND_PLOT_BOTTOM} Z`;
  const gap = (W - 8 - TREND_FIRST_X) / Math.max(1, points.length - 1);
  const dots = gap >= 12;
  const bestScore = points[L.best].score;
  const lastScore = points[L.last].score;
  const close = L.best !== L.last && L.x(L.last) - L.x(L.best) < 64;
  const scores = points.map((p) => p.score);
  const mid = (TREND_PLOT_TOP + TREND_PLOT_BOTTOM) / 2;

  const onMove = (e: GestureResponderEvent) => setHover(trendIndexAt(e.nativeEvent.locationX, W, points.length));
  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0 && w !== W) setW(w);
  };
  const h = hover != null ? points[hover] : null;
  const tipLeft = hover != null ? Math.max(0, Math.min(L.x(hover) - tipW / 2, W - tipW)) : 0;

  return (
    <View
      onLayout={onLayout}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${name}: de ${Math.min(...scores)} a ${Math.max(...scores)}${average != null ? `; tu promedio, ${average}` : ''}`}
      onStartShouldSetResponder={() => true}
      onResponderTerminationRequest={() => true}
      onResponderGrant={onMove}
      onResponderMove={onMove}
      onResponderRelease={() => setHover(null)}
      onResponderTerminate={() => setHover(null)}
    >
      <Svg width={W} height={TREND_CHART_H} viewBox={`0 0 ${W} ${TREND_CHART_H}`} fill="none">
        <Defs>
          <LinearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={c.accent} stopOpacity={0.16} />
            <Stop offset="1" stopColor={c.accent} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <G fill={c.muted}>
          <SvgText x={0} y={TREND_PLOT_TOP + 4} fontSize={11} fill={c.muted} fontFamily={font.regular}>
            {L.ticks[0]}
          </SvgText>
          <SvgText x={0} y={mid + 4} fontSize={11} fill={c.muted} fontFamily={font.regular}>
            {L.ticks[1]}
          </SvgText>
          <SvgText x={0} y={TREND_PLOT_BOTTOM + 4} fontSize={11} fill={c.muted} fontFamily={font.regular}>
            {L.ticks[2]}
          </SvgText>
        </G>
        <Line x1={30} y1={TREND_PLOT_TOP} x2={W} y2={TREND_PLOT_TOP} stroke={c.line} />
        <Line x1={30} y1={TREND_PLOT_BOTTOM} x2={W} y2={TREND_PLOT_BOTTOM} stroke={c.line} />
        {L.separators.map((sx) => (
          <Line key={sx} x1={sx} y1={TREND_PLOT_TOP} x2={sx} y2={TREND_PLOT_BOTTOM} stroke={c.line} strokeDasharray="2 3" />
        ))}
        <Line x1={30} y1={mid} x2={W} y2={mid} stroke={c.muted} strokeDasharray="3 4" opacity={0.6} />
        <Path d={area} fill={`url(#${gradient})`} />
        <Path d={path} stroke={c.accent} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {hover != null && <Line x1={L.x(hover)} x2={L.x(hover)} y1={TREND_PLOT_TOP} y2={TREND_PLOT_BOTTOM} stroke={c.muted} strokeWidth={1} />}
        {dots && (
          <G>
            {points.map((p, i) => (i === L.best || i === L.last ? null : <Circle key={i} cx={L.x(i)} cy={L.y(p.score)} r={3.5} fill={c.surface} stroke={c.accent} strokeWidth={2} />))}
          </G>
        )}
        {[L.best, L.last, ...(hover != null && hover !== L.best && hover !== L.last ? [hover] : [])].map((i, k) => (
          <Circle key={`${i}-${k}`} cx={L.x(i)} cy={L.y(points[i].score)} r={5} fill={c.accent} stroke={c.surface} strokeWidth={2} />
        ))}
        {L.best === L.last ? (
          <SvgText x={W - 2} y={L.y(lastScore) - 10.3} textAnchor="end" fontSize={11.5} fill={c.fg} fontFamily={font.bold}>
            {`${lastScore} mejor`}
          </SvgText>
        ) : (
          <>
            {/* Pegado al último: a la izquierda de su punto, para que no se pisen los dos números. */}
            <SvgText
              x={close ? L.x(L.best) - 9 : Math.min(Math.max(L.x(L.best), TREND_FIRST_X + 20), W - 34)}
              y={close ? L.y(bestScore) + 4 : L.y(bestScore) - 10.5}
              textAnchor={close ? 'end' : 'middle'}
              fontSize={11.5}
              fill={c.fg}
              fontFamily={font.bold}
            >
              {close ? String(bestScore) : `${bestScore} mejor`}
            </SvgText>
            <SvgText x={W - 2} y={L.y(lastScore) - 10.3} textAnchor="end" fontSize={11.5} fill={c.fg} fontFamily={font.bold}>
              {String(lastScore)}
            </SvgText>
          </>
        )}
        {L.labels.map((l) => (
          <SvgText key={`${l.label}-${l.x}`} x={l.x} y={TREND_CHART_H - 10} textAnchor="middle" fontSize={11.5} fill={c.muted} fontFamily={font.semibold}>
            {l.label}
          </SvgText>
        ))}
      </Svg>
      {h && hover != null && (
        <View
          pointerEvents="none"
          onLayout={(e) => setTipW(Math.round(e.nativeEvent.layout.width))}
          accessibilityLiveRegion="polite"
          style={[styles.tip, { left: tipLeft, maxWidth: W, backgroundColor: c.fg }]}
        >
          <Txt numberOfLines={1} style={{ fontSize: 12, color: c.bg }}>
            <Txt style={{ fontSize: 12, color: c.bg, fontFamily: font.bold, fontVariant: ['tabular-nums'] }}>{h.score}</Txt>
            {` ${h.tip}`}
          </Txt>
        </View>
      )}
    </View>
  );
}

type TrendView = 'juego' | 'mes';

/** El segmentado chico de la tarjeta («Por juego | Por mes»). */
function SmallSegmented<K extends string>({ options, value, onChange, label }: { options: { key: K; label: string }[]; value: K; onChange: (k: K) => void; label: string }) {
  const c = useColors();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', borderRadius: 11, padding: 3, backgroundColor: c.surface2 }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            hitSlop={{ top: 8, bottom: 8 }}
            onPress={() => onChange(o.key)}
            style={[{ height: 28, borderRadius: 8, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' }, on && { backgroundColor: c.segOn, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } }]}
          >
            <Txt tone={on ? 'fg' : 'muted'} style={{ fontSize: 13, fontFamily: font.semibold }}>
              {o.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/** El título de las tarjetas de Pro («Tendencia», «Tus tiros»). */
function CardTitle({ children }: { children: string }) {
  return (
    <Txt accessibilityRole="header" style={{ fontSize: 16, lineHeight: 22, fontFamily: font.semibold, letterSpacing: -0.16 }}>
      {children}
    </Txt>
  );
}

/**
 * Pro › «Tendencia»: Por juego (los últimos 30, por día) o Por mes (el promedio de cada mes), con tu promedio punteado en
 * el medio; abajo, el mes anterior contra este. `games`: los que cuentan, del más viejo al más nuevo (menos de 2: nada).
 */
export function TrendCard({ games, average, today, style }: { games: readonly Pick<StatGame, 'date' | 'score' | 'label'>[]; average: number | null; today: string; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  const [view, setView] = useState<TrendView>('juego');
  if (games.length < 2) return null;
  const byGame = gamePoints(games, today);
  const byMonth = monthPoints(games);
  const months = byMonth.length >= 2;
  const showMonths = view === 'mes' && months;
  const cmp = monthCompare(games);
  return (
    <Card padded={false} style={[{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 }, style]}>
      <View accessibilityLabel="Tendencia">
        <View style={{ marginBottom: 8, minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <CardTitle>Tendencia</CardTitle>
          {months && (
            <SmallSegmented<TrendView>
              label="Ver la tendencia"
              options={[
                { key: 'juego', label: 'Por juego' },
                { key: 'mes', label: 'Por mes' },
              ]}
              value={showMonths ? 'mes' : 'juego'}
              onChange={setView}
            />
          )}
        </View>
        {showMonths ? (
          <TrendChart key="mes" points={byMonth} average={average} name={`Tu promedio de los últimos ${byMonth.length} meses`} />
        ) : (
          <TrendChart key="juego" points={byGame} average={average} name={`Tus últimos ${byGame.length} juegos`} />
        )}
        {cmp && (
          <View style={[styles.compare, { borderTopColor: c.line }]}>
            {cmp.prev && (
              <Txt tone="fg2" style={{ fontSize: 14 }}>
                {`${cmp.prev.name} `}
                <Txt style={{ fontSize: 14, fontFamily: font.semibold, fontVariant: ['tabular-nums'] }}>{cmp.prev.average}</Txt>
              </Txt>
            )}
            <Txt tone="fg2" style={{ fontSize: 14 }}>
              {`${cmp.last.name} `}
              <Txt style={{ fontSize: 14, fontFamily: font.semibold, fontVariant: ['tabular-nums'] }}>{cmp.last.average}</Txt>
            </Txt>
            {cmp.delta != null ? (
              <Txt style={{ fontSize: 14, fontFamily: font.semibold, fontVariant: ['tabular-nums'], color: cmp.delta > 0 ? c.ok : c.muted }}>
                {cmp.delta > 0 ? `+${cmp.delta}` : cmp.delta < 0 ? `−${-cmp.delta}` : '='}
              </Txt>
            ) : (
              <Txt tone="muted" style={{ fontSize: 14 }}>
                {`${cmp.last.games} ${cmp.last.games === 1 ? 'juego' : 'juegos'}`}
              </Txt>
            )}
          </View>
        )}
      </View>
    </Card>
  );
}

// ---------- Tus tiros ----------

/** Los 10 pinos chiquitos con su color (más color = se queda parado más veces). Solo para ver. */
export function MiniPinDeck({ report }: { report: PinReport }) {
  const c = useColors();
  const byPin = new Map(report.pins.map((p) => [p.pin, p]));
  return (
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ alignItems: 'center', gap: 2 }}>
      {PIN_ROWS.map((row) => (
        <View key={row[0]} style={{ flexDirection: 'row', gap: 6 }}>
          {row.map((pin) => {
            const p = byPin.get(pin);
            const col = p?.left ? heatColors(c, heatLevel(p.leftPct ?? null, LEFT_CUTS)) : { bg: c.surface2, fg: c.muted };
            return (
              <View key={pin} style={[styles.miniPin, { backgroundColor: col.bg }]}>
                <Txt style={{ fontSize: 11, lineHeight: 13, fontFamily: font.bold, fontVariant: ['tabular-nums'], color: col.fg }}>{pin}</Txt>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/**
 * Pro › «Tus tiros»: de tus cuadros, cuántos strikes, spares y abiertos (barra y números), la primera bola y «Pinos que
 * te quedan». «Ver todo por cuadros» abre debajo el detalle de siempre. Sin juegos por cuadros, cómo anotarlos.
 */
export function ShotsCard({ frames, games, style }: { frames: readonly GameFrames[]; games: number; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  const [more, setMore] = useState(false);
  if (!frames.length) {
    if (!games) return null;
    return (
      <Card style={style}>
        <View accessibilityLabel="Tus tiros">
          <CardTitle>Tus tiros</CardTitle>
          <Txt tone="muted" style={{ marginTop: 6, fontSize: 14, lineHeight: 20 }}>
            Anota tus juegos con Teclado (por cuadros) o con Pines (pino por pino) y aquí verás tus strikes, tus spares y qué pinos te quedan.
          </Txt>
        </View>
      </Card>
    );
  }
  const rates = frameRates(frames);
  const shares = frameShares(rates)!;
  const pinGames = frames.filter(hasPins);
  const report = pinReport(pinGames);
  const line = pinLine(report);
  const soft = `${c.accent}73`;
  const legend: [string, number, string][] = [
    ['Strikes', shares.strikes, c.accent],
    ['Spares', shares.spares, soft],
    ['Abiertos', shares.opens, c.faint],
  ];
  return (
    <>
      <Card padded={false} style={[{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 }, style]}>
        <View accessibilityLabel="Tus tiros">
          <View style={{ marginBottom: 8, minHeight: 28, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
            <CardTitle>Tus tiros</CardTitle>
            <Txt tone="muted" numberOfLines={1} style={{ fontSize: 13, flexShrink: 1 }}>
              {pinGames.length ? 'Con Teclado y Pines' : 'Con Teclado'}
            </Txt>
          </View>
          <View importantForAccessibility="no-hide-descendants" style={styles.bar}>
            {shares.strikes > 0 && <View style={{ width: `${shares.strikes}%`, borderRadius: 3, backgroundColor: c.accent }} />}
            {shares.spares > 0 && <View style={{ width: `${shares.spares}%`, borderRadius: 3, backgroundColor: soft }} />}
            {shares.opens > 0 && <View style={{ flex: 1, borderRadius: 3, backgroundColor: c.surface2 }} />}
          </View>
          <View accessibilityLabel={`De tus ${rates.frames} cuadros`} style={{ marginTop: 10, flexDirection: 'row' }}>
            {legend.map(([label, value, dot]) => (
              <View key={label} accessible accessibilityLabel={`${label}: ${value}%`} style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
                  <Txt style={{ fontSize: 19, lineHeight: 24, fontFamily: font.semibold, letterSpacing: -0.4, fontVariant: ['tabular-nums'] }}>{`${value}%`}</Txt>
                </View>
                <Txt tone="muted" style={{ fontSize: 12, fontFamily: font.semibold }}>
                  {label}
                </Txt>
              </View>
            ))}
          </View>
          {rates.firstBall != null && (
            <View style={[styles.lineRow, { borderTopColor: c.line }]}>
              <Txt tone="fg2" style={{ fontSize: 14 }}>
                Primera bola, promedio
              </Txt>
              <Txt style={{ fontSize: 14, fontFamily: font.semibold, fontVariant: ['tabular-nums'] }}>{`${rates.firstBall.toLocaleString('es-DO')} pinos`}</Txt>
            </View>
          )}
          {line && (
            <View style={[styles.pinsRow, { borderTopColor: c.line }]}>
              <MiniPinDeck report={report} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt style={{ marginBottom: 4, fontSize: 15, fontFamily: font.semibold }}>Pinos que te quedan</Txt>
                <Txt tone="fg2" style={{ fontSize: 14.5, lineHeight: 21 }}>
                  {'El '}
                  <Txt style={{ fontSize: 14.5, fontFamily: font.bold }}>{String(line.pin)}</Txt>
                  {` se te queda ${line.left} ${line.left === 1 ? 'vez' : 'veces'}`}
                  {line.converted != null ? (
                    <>
                      {' y lo conviertes el '}
                      <Txt style={{ fontSize: 14.5, fontFamily: font.bold }}>{`${line.converted}%`}</Txt>
                      {'.'}
                    </>
                  ) : (
                    '.'
                  )}
                </Txt>
              </View>
            </View>
          )}
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: more }} onPress={() => setMore((m) => !m)} style={[styles.moreBtn, { borderTopColor: c.line }]}>
            <Txt tone="fg2" style={{ fontSize: 14, fontFamily: font.semibold }}>
              {more ? 'Ver menos' : 'Ver todo por cuadros'}
            </Txt>
            <ChevronDown size={16} color={c.fg2} style={more ? { transform: [{ rotate: '180deg' }] } : undefined} />
          </Pressable>
        </View>
      </Card>
      {more && <FrameStatsPanel frames={frames} games={games} />}
    </>
  );
}

const styles = StyleSheet.create({
  cell: { width: '33.333%', paddingHorizontal: 14, paddingVertical: 13 },
  cellLine: { position: 'absolute', left: 0, top: 13, bottom: 13, width: StyleSheet.hairlineWidth },
  tip: {
    position: 'absolute',
    top: -36,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  compare: { marginTop: 6, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: 12, rowGap: 4, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
  miniPin: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  bar: { marginTop: 4, height: 12, flexDirection: 'row', gap: 3, overflow: 'hidden', borderRadius: 6 },
  lineRow: { marginTop: 12, flexDirection: 'row', justifyContent: 'space-between', gap: 12, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
  pinsRow: { marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 18, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14 },
  moreBtn: { marginTop: 8, height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderTopWidth: StyleSheet.hairlineWidth },
});
