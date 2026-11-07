/**
 * El análisis por cuadros de un jugador (FrameStatsPanel y PinHeatDeck de la web, con su misma lógica:
 * src/lib/bowlingStats.ts y src/components/stats/trendLogic.ts): strikes, spares, abiertos, primera bola, racha y juegos
 * limpios; y, con los juegos anotados pino por pino, el mapa de calor de los pinos, los fuertes y débiles en palabras
 * (solo a quien son sus juegos) y los spares según lo que quedó. Lo usan la página del jugador y «Tus tiros» de Pro.
 */
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { AlertTriangle, CircleDashed, Flame, Slash, Sparkles, Target, ThumbsUp, Zap } from 'lucide-react-native';
import { CONVERT_CUTS, LEFT_CUTS, MIN_PIN_RACKS, frameRates, hasPins, leaveName, leaveStats, pinInsights, pinReport, spareSummary } from '@mm/lib/bowlingStats';
import type { GameFrames } from '@mm/lib/types';
import { PIN_ROWS } from '@mm/components/frames/editorLogic';
import { HEAT_MIX, LEAVES_SHOWN, heatIndex, heatLegendLabels, heatPins, ofText, pct, type HeatPin, type PinView } from '@mm/components/stats/trendLogic';
import { Card, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import type { Colors } from '@/theme/tokens';
import { font } from '@/theme/tokens';

/** `#rrggbb` → [r, g, b] (null si no es un color así). */
function rgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** `pct` % del primer color sobre el segundo (el color-mix de la web). */
export function mixColors(a: string, b: string, pctA: number): string {
  const x = rgb(a);
  const y = rgb(b);
  if (!x || !y) return a;
  const t = pctA / 100;
  const ch = (i: number) => Math.round(x[i] * t + y[i] * (1 - t));
  return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`;
}

/**
 * El color de un nivel del mapa de calor (heatStyle de la web): un solo tono, de claro a oscuro, mezclado con la
 * superficie; los dos últimos llevan el texto sobre el acento.
 */
export function heatColors(c: Colors, level: number): { bg: string; fg: string } {
  const l = heatIndex(level);
  return { bg: mixColors(c.accent, c.surface, HEAT_MIX[l]), fg: l >= 3 ? c.accentFg : c.fg };
}

/** Un número en su tarjeta (Stat de la web): el ícono y el nombre, el número grande y una línea debajo. */
export function StatTile({ label, value, sub, icon, style }: { label: string; value: number | string; sub?: string; icon?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Card padded={false} style={[{ flexBasis: '47%', flexGrow: 1, minWidth: 0, paddingHorizontal: 16, paddingVertical: 12 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {icon}
        <Txt tone="muted" numberOfLines={1} style={{ fontSize: 12, flexShrink: 1 }}>
          {label}
        </Txt>
      </View>
      <Txt style={{ fontSize: 24, lineHeight: 30, fontFamily: font.bold, letterSpacing: -0.4, fontVariant: ['tabular-nums'] }}>{value}</Txt>
      {!!sub && (
        <Txt tone="muted" numberOfLines={1} style={{ fontSize: 12 }}>
          {sub}
        </Txt>
      )}
    </Card>
  );
}

/** Los 10 pinos como mapa de calor (solo para ver): más color = más veces. Sin datos va punteado. */
export function PinHeatDeck({ pins, label }: { pins: readonly HeatPin[]; label: string }) {
  const c = useColors();
  const byPin = new Map(pins.map((p) => [p.pin, p]));
  return (
    <View accessibilityLabel={label} style={{ alignItems: 'center', gap: 8, paddingVertical: 4 }}>
      {PIN_ROWS.map((row) => (
        <View key={row[0]} style={{ flexDirection: 'row', gap: 10 }}>
          {row.map((pin) => {
            const p = byPin.get(pin);
            const empty = !p || p.value == null;
            const col = empty ? null : heatColors(c, p.level);
            return (
              <View
                key={pin}
                accessible
                accessibilityRole="image"
                accessibilityLabel={p?.label ?? `Pino ${pin}: sin datos`}
                style={[
                  styles.heatPin,
                  empty
                    ? { borderColor: c.line, borderStyle: 'dashed' }
                    : { backgroundColor: col!.bg, borderColor: heatIndex(p.level) >= 3 ? 'transparent' : c.line },
                ]}
              >
                <Txt style={{ fontSize: 10, lineHeight: 12, fontFamily: font.medium, color: col ? col.fg : c.muted }}>{pin}</Txt>
                <Txt style={{ fontSize: 12, lineHeight: 15, fontFamily: font.bold, fontVariant: ['tabular-nums'], color: col ? col.fg : c.muted }}>{empty ? '—' : p.value}</Txt>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** La leyenda del mapa: los 5 niveles con sus cortes («<5%», «5–15%»…). */
export function HeatLegend({ cuts, caption }: { cuts: readonly [number, number, number, number]; caption: string }) {
  const c = useColors();
  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      <Txt tone="muted" style={{ fontSize: 11, textAlign: 'center' }}>
        {caption}
      </Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 10, rowGap: 4 }}>
        {heatLegendLabels(cuts).map((t, i) => (
          <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: i >= 3 ? 'transparent' : c.line, backgroundColor: heatColors(c, i).bg }} />
            <Txt tone="muted" style={{ fontSize: 11, fontVariant: ['tabular-nums'] }}>
              {t}
            </Txt>
          </View>
        ))}
      </View>
    </View>
  );
}

function Insights({ title, items, tone }: { title: string; items: readonly string[]; tone: 'ok' | 'warn' }) {
  const c = useColors();
  const Icon = tone === 'ok' ? ThumbsUp : AlertTriangle;
  const color = tone === 'ok' ? c.ok : c.warn;
  return (
    <View style={{ gap: 6, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: tone === 'ok' ? c.okSoft : c.warnSoft }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon size={14} color={color} />
        <Txt style={{ fontSize: 12, fontFamily: font.semibold, color }}>{title}</Txt>
      </View>
      {items.map((t) => (
        <Txt key={t} variant="meta">
          {t}
        </Txt>
      ))}
    </View>
  );
}

/** El título chico de cada parte (h2/h3 text-sm text-muted de la web). */
function Heading({ children }: { children: string }) {
  return (
    <Txt variant="meta" tone="muted" accessibilityRole="header" style={{ fontFamily: font.semibold }}>
      {children}
    </Txt>
  );
}

/** Una nota en gris claro (cómo anotar para ver más). */
function Hint({ children }: { children: string }) {
  const c = useColors();
  return (
    <Txt variant="meta" tone="muted" style={{ borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: c.surface2 }}>
      {children}
    </Txt>
  );
}

/**
 * Lo que sale de los cuadros (FrameStatsPanel de la web). `frames`: los cuadros que cuentan (countedFrames); `games`:
 * todos los juegos que cuentan (para decir cuántos se anotaron por cuadros). `mine`: los juegos son de quien mira (sus
 * fuertes y débiles en palabras y cómo anotar para ver más).
 */
export function FrameStatsPanel({ frames, games, mine = true }: { frames: readonly GameFrames[]; games: number; mine?: boolean }) {
  const c = useColors();
  const [view, setView] = useState<PinView>('quedan');
  const [allLeaves, setAllLeaves] = useState(false);

  if (!frames.length) {
    if (!mine || !games) return null;
    return (
      <Hint>
        Anota tus juegos por cuadros (Teclado) o pino por pino (Pines) para ver tu % de strikes y spares, qué pinos te quedan y cuánto conviertes cada spare.
      </Hint>
    );
  }

  const rates = frameRates(frames);
  const pinGames = frames.filter(hasPins);
  const report = pinReport(pinGames);
  const leaves = leaveStats(pinGames);
  const spares = spareSummary(leaves);
  const insights = mine ? pinInsights(report, spares) : null;
  const shownLeaves = allLeaves ? leaves : leaves.slice(0, LEAVES_SHOWN);
  const n = rates.games;
  const ic = (Icon: typeof Zap) => <Icon size={16} color={c.accent} />;

  return (
    <View style={{ gap: 16 }}>
      <View accessibilityLabel="Por cuadros" style={{ gap: 8 }}>
        <View>
          <Heading>Por cuadros</Heading>
          <Txt tone="muted" style={{ fontSize: 12 }}>
            {`Con ${n} ${n === 1 ? 'juego anotado' : 'juegos anotados'} por cuadros${games > n ? ` (de ${games})` : ''}. Los que tienen solo el total no cuentan aquí.`}
          </Txt>
        </View>
        <View style={styles.grid}>
          <StatTile icon={ic(Zap)} label="Strikes" value={pct(rates.strikePct)} sub={`${rates.strikes} de ${rates.strikeChances}`} />
          <StatTile icon={ic(Slash)} label="Spares" value={pct(rates.sparePct)} sub={`${rates.spares} de ${rates.spareChances}`} />
          <StatTile icon={ic(CircleDashed)} label="Cuadros abiertos" value={pct(rates.openPct)} sub={`${rates.opens} de ${rates.frames}`} />
          <StatTile icon={ic(Target)} label="Primera bola" value={rates.firstBall == null ? '—' : rates.firstBall.toLocaleString('es-DO')} sub="pinos por cuadro" />
          <StatTile icon={ic(Flame)} label="Racha de strikes" value={String(rates.bestStrikeRun)} sub="seguidos en un juego" />
          <StatTile icon={ic(Sparkles)} label="Juegos limpios" value={String(rates.cleanGames)} sub={`sin abiertos (de ${n})`} />
        </View>
      </View>

      {report.racks > 0 ? (
        <View accessibilityLabel="Pino por pino" style={{ gap: 12 }}>
          <View>
            <Heading>Pino por pino</Heading>
            <Txt tone="muted" style={{ fontSize: 12 }}>
              {`Con ${report.games} ${report.games === 1 ? 'juego anotado' : 'juegos anotados'} pino por pino (${report.racks} primeras bolas).`}
            </Txt>
          </View>

          {insights && (insights.strengths.length > 0 || insights.weaknesses.length > 0) ? (
            <View style={{ gap: 8 }}>
              {insights.strengths.length > 0 && <Insights title="Tus fuertes" items={insights.strengths} tone="ok" />}
              {insights.weaknesses.length > 0 && <Insights title="A mejorar" items={insights.weaknesses} tone="warn" />}
            </View>
          ) : (
            mine &&
            report.racks < MIN_PIN_RACKS && (
              <Txt variant="meta" tone="muted">
                Anota unos juegos más pino por pino y aquí te decimos tus fuertes y débiles.
              </Txt>
            )
          )}

          <Card padded={false} style={{ padding: 12, gap: 12 }}>
            <View accessibilityRole="radiogroup" accessibilityLabel="Qué ver en los pinos" style={[styles.seg, { backgroundColor: c.surface2 }]}>
              {(
                [
                  ['quedan', 'Se queda parado'],
                  ['spare', 'Spare cuando queda'],
                ] as const
              ).map(([key, label]) => {
                const on = view === key;
                return (
                  <Pressable
                    key={key}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    onPress={() => setView(key)}
                    style={[styles.segItem, { backgroundColor: on ? c.surface : 'transparent' }]}
                  >
                    <Txt tone={on ? 'fg' : 'muted'} style={{ fontSize: 14, fontFamily: font.medium }}>
                      {label}
                    </Txt>
                  </Pressable>
                );
              })}
            </View>
            <PinHeatDeck
              pins={heatPins(report, view)}
              label={view === 'quedan' ? 'Cuánto se queda parado cada pino tras la primera bola' : 'Cuánto spare se hace cuando queda cada pino'}
            />
            <HeatLegend
              cuts={view === 'quedan' ? LEFT_CUTS : CONVERT_CUTS}
              caption={view === 'quedan' ? 'Más color: se queda parado más veces tras la primera bola' : 'Más color: más spares cuando queda ese pino'}
            />
          </Card>

          {leaves.length > 0 && (
            <View style={{ gap: 8 }}>
              <Heading>Spares según lo que quedó</Heading>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <StatTile style={styles.third} label="Un pino" value={pct(spares.single.pct)} sub={ofText(spares.single)} />
                <StatTile style={styles.third} label="Sin splits" value={pct(spares.noSplits.pct)} sub={ofText(spares.noSplits)} />
                <StatTile style={styles.third} label="Splits" value={pct(spares.splits.pct)} sub={ofText(spares.splits)} />
              </View>
              <Card padded={false}>
                <View style={[styles.tr, { borderBottomColor: c.line }]}>
                  <Txt tone="muted" style={[styles.th, { flex: 1 }]}>
                    Quedó
                  </Txt>
                  <Txt tone="muted" style={[styles.th, { width: 76, textAlign: 'right' }]}>
                    Spares
                  </Txt>
                  <Txt tone="muted" style={[styles.th, { width: 52, textAlign: 'right' }]}>
                    %
                  </Txt>
                </View>
                {shownLeaves.map((l, i) => (
                  <View key={l.leave} style={[styles.tr, i < shownLeaves.length - 1 && { borderBottomColor: c.line }]}>
                    <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Txt style={{ fontSize: 14, fontFamily: font.medium, flexShrink: 1 }}>{leaveName(l.leave)}</Txt>
                      {l.split && (
                        <View style={[styles.split, { borderColor: c.muted }]}>
                          <Txt tone="muted" style={{ fontSize: 10 }}>
                            split
                          </Txt>
                        </View>
                      )}
                    </View>
                    <Txt style={{ width: 76, textAlign: 'right', fontSize: 14, fontVariant: ['tabular-nums'] }}>{`${l.converted} de ${l.faced}`}</Txt>
                    <Txt style={{ width: 52, textAlign: 'right', fontSize: 14, fontFamily: font.semibold, fontVariant: ['tabular-nums'] }}>{`${Math.round((l.converted * 100) / l.faced)}%`}</Txt>
                  </View>
                ))}
                {leaves.length > LEAVES_SHOWN && (
                  <Pressable accessibilityRole="button" onPress={() => setAllLeaves((v) => !v)} style={[styles.more, { borderTopColor: c.line }]}>
                    <Txt tone="accent" style={{ fontSize: 14, fontFamily: font.medium }}>
                      {allLeaves ? 'Ver menos' : `Ver todos (${leaves.length})`}
                    </Txt>
                  </Pressable>
                )}
              </Card>
            </View>
          )}
        </View>
      ) : (
        mine && <Hint>Anota pino por pino (Pines) para ver qué pinos te quedan, cuánto conviertes cada spare y tus fuertes y débiles.</Hint>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  third: { flexBasis: 0, paddingHorizontal: 12 },
  heatPin: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  seg: { flexDirection: 'row', gap: 4, borderRadius: 12, padding: 4 },
  segItem: { flex: 1, minHeight: 44, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  tr: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'transparent' },
  th: { fontSize: 12, fontFamily: font.medium },
  split: { height: 20, borderRadius: 10, borderWidth: 1, paddingHorizontal: 6, justifyContent: 'center' },
  more: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderTopWidth: StyleSheet.hairlineWidth },
});
