/**
 * La tabla completa de Pro (StandingsTable de la web, src/components/ranking/StandingsTable.tsx): # · Jugador · J ·
 * Prom · Hcp · Alto · Serie · Asist. Tocar una columna la ordena (la ordenada va en el color del deporte, subrayada con
 * su flecha, y sus números más grandes). En el teléfono no cabe entera: se desliza de lado, con un desvanecido a la
 * derecha y «Desliza ›» debajo. Cada nombre abre la página del jugador; tu fila, en acento suave con «Tú». Lo que dice
 * cada celda es cellText de la web.
 */
import { useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import { cellText, type SortKey, type TableRow } from '@mm/components/ranking/logic';
import { Card, Txt } from '@/components/ui';
import { useColors, useTheme } from '@/theme/theme';
import { font } from '@/theme/tokens';

/** Las columnas: lo que se ve arriba y lo que dice el lector de pantalla. */
const COLUMNS: readonly { key: SortKey | 'pos'; label: string; name: string; align: 'left' | 'center' | 'right' }[] = [
  { key: 'pos', label: '#', name: 'Puesto', align: 'left' },
  { key: 'nombre', label: 'Jugador', name: 'Jugador', align: 'left' },
  { key: 'juegos', label: 'J', name: 'Juegos', align: 'center' },
  { key: 'promedio', label: 'Prom', name: 'Promedio', align: 'right' },
  { key: 'hcp', label: 'Hcp', name: 'Handicap', align: 'right' },
  { key: 'juego', label: 'Alto', name: 'Juego más alto', align: 'right' },
  { key: 'serie', label: 'Serie', name: 'Mejor serie', align: 'right' },
  { key: 'asistencia', label: 'Asist.', name: 'Asistencia', align: 'right' },
];

/** Cada columna de números mide 44 (el ancho de un toque: su encabezado ordena); el # 22 y el nombre lo que sobre. */
const POS_W = 22;
const NUM_W = 44;
const PAD_L = 10;
const PAD_R = 4;
/** 384: en el teléfono se ve hasta «Serie» y «Asist.» queda detrás del desvanecido (se desliza). */
const TABLE_MIN = 384;
/** Lo de la derecha deja 5 hasta la columna siguiente. */
const RIGHT_PAD = 5;
const FADE_W = 42;

/** La etiqueta «Tú» de tu fila: blanca sobre el acento suave en claro; de acento translúcido en oscuro. */
export function TuTag({ small }: { small?: boolean }) {
  const c = useColors();
  const { isDark } = useTheme();
  return (
    <View
      style={{
        height: small ? 18 : 22,
        paddingHorizontal: small ? 6 : 8,
        borderRadius: 11,
        justifyContent: 'center',
        backgroundColor: isDark ? `${c.accent}2e` : c.surface,
      }}
    >
      <Txt style={{ color: c.accent, fontFamily: font.semibold, fontSize: small ? 11 : 12, lineHeight: small ? 14 : 16 }}>Tú</Txt>
    </View>
  );
}

export function StandingsTable({
  lid,
  rows,
  sort,
  onSort,
  me,
  totalEvents,
}: {
  lid: string;
  rows: readonly TableRow[];
  sort: SortKey;
  onSort: (key: SortKey) => void;
  me: string | null | undefined;
  totalEvents: number;
}) {
  const c = useColors();
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  // Sin medir (el primer dibujo) se supone el teléfono: hay más a la derecha.
  const [box, setBox] = useState(0);
  const [left, setLeft] = useState(0);
  const width = Math.max(TABLE_MIN, box);
  const nameW = width - PAD_L - PAD_R - POS_W - NUM_W * 6;
  const more = !box || left + box < width - 2;
  // La columna resaltada: la ordenada (por nombre, el promedio).
  const strong: SortKey = sort === 'nombre' ? 'promedio' : sort;
  const colWidth = (key: SortKey | 'pos') => (key === 'pos' ? POS_W : key === 'nombre' ? nameW : NUM_W);
  const justify = (align: 'left' | 'center' | 'right') => (align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start');

  return (
    <View>
      <Card padded={false}>
        <View onLayout={(e) => setBox(Math.round(e.nativeEvent.layout.width))}>
          <ScrollView
            ref={scroller}
            horizontal
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={(e) => setLeft(e.nativeEvent.contentOffset.x)}
            accessibilityLabel="Tabla de la temporada"
          >
            <View style={{ width, paddingTop: 4, paddingBottom: 6 }}>
              <View style={[styles.grid, { minHeight: 44 }]}>
                {COLUMNS.map((col) => {
                  const on = col.key === sort;
                  if (col.key === 'pos') {
                    return (
                      <View key={col.key} style={{ width: POS_W }}>
                        <Txt style={[styles.head, { color: c.muted }]}>{col.label}</Txt>
                      </View>
                    );
                  }
                  const key = col.key;
                  return (
                    <Pressable
                      key={key}
                      accessibilityRole="button"
                      accessibilityLabel={`Ordenar por ${col.name}`}
                      accessibilityState={{ selected: on }}
                      onPress={() => onSort(key)}
                      style={{ width: colWidth(key), height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: justify(col.align), paddingRight: col.align === 'right' ? RIGHT_PAD : 0 }}
                    >
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 1,
                          marginRight: on && col.align !== 'left' ? -6 : 0,
                          ...(on ? { borderBottomWidth: 2, borderBottomColor: c.accent, paddingBottom: 3 } : null),
                        }}
                      >
                        <Txt style={[styles.head, { color: on ? c.accent : c.muted }]}>{col.label}</Txt>
                        {on && <ChevronDown size={10} strokeWidth={3} color={c.accent} />}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
              {rows.map((t, i) => {
                const isMe = !!me && t.row.playerId === me;
                const prevMe = i > 0 && !!me && rows[i - 1].row.playerId === me;
                const line = i > 0 && !isMe && !prevMe;
                const open = t.row.playerId ? () => router.push({ pathname: '/l/[lid]/j/[playerId]', params: { lid, playerId: t.row.playerId } }) : undefined;
                return (
                  <Pressable
                    key={t.row.playerId || t.row.name}
                    accessibilityRole={open ? 'button' : undefined}
                    accessibilityLabel={`${t.pos}. ${t.row.name}${isMe ? ' (tú)' : ''}: ${COLUMNS.slice(2)
                      .map((col) => `${col.name} ${cellText(t, col.key as SortKey, totalEvents)}`)
                      .join(', ')}`}
                    disabled={!open}
                    onPress={open}
                    style={({ pressed }) => [styles.grid, { minHeight: 52, backgroundColor: pressed ? c.surface2 : isMe ? c.accentSoft : 'transparent' }]}
                  >
                    {line && <View style={[styles.line, { backgroundColor: c.line }]} />}
                    <Txt style={{ width: POS_W, textAlign: 'center', fontSize: 14, fontFamily: font.semibold, color: c.muted, fontVariant: ['tabular-nums'] }}>{t.pos}</Txt>
                    <View style={{ width: nameW, flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 4 }}>
                      <Txt numberOfLines={1} style={{ flexShrink: 1, fontSize: 15, fontFamily: font.semibold }}>
                        {t.short}
                      </Txt>
                      {isMe && <TuTag small />}
                    </View>
                    {COLUMNS.slice(2).map((col) => {
                      const on = col.key === strong;
                      return (
                        <Txt
                          key={col.key}
                          numberOfLines={1}
                          style={{
                            width: NUM_W,
                            textAlign: col.align === 'center' ? 'center' : 'right',
                            paddingRight: col.align === 'center' ? 0 : RIGHT_PAD,
                            fontVariant: ['tabular-nums'],
                            ...(on ? { fontSize: 18, fontFamily: font.bold, letterSpacing: -0.36, color: c.fg } : { fontSize: 15, fontFamily: font.medium, color: c.fg2 }),
                          }}
                        >
                          {String(cellText(t, col.key as SortKey, totalEvents))}
                        </Txt>
                      );
                    })}
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
          {/* El desvanecido de la derecha (mientras haya más columnas que ver). */}
          {more && (
            <View pointerEvents="none" style={styles.fade}>
              <Svg width={FADE_W} height="100%">
                <Defs>
                  <LinearGradient id="mm-tabla-fade" x1="0" y1="0" x2="1" y2="0">
                    <Stop offset="0" stopColor={c.surface} stopOpacity={0} />
                    <Stop offset="1" stopColor={c.surface} stopOpacity={1} />
                  </LinearGradient>
                </Defs>
                <Rect x={0} y={0} width={FADE_W} height="100%" fill="url(#mm-tabla-fade)" />
              </Svg>
            </View>
          )}
        </View>
      </Card>
      <View style={styles.below}>
        <Txt tone="muted" style={{ fontSize: 12.5, lineHeight: 17, flexShrink: 1 }}>
          Toca una columna para ordenar
        </Txt>
        {more && (
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => scroller.current?.scrollToEnd({ animated: true })} style={styles.slide}>
            <Txt tone="accent" style={{ fontSize: 12.5, lineHeight: 17, fontFamily: font.semibold }}>
              Desliza
            </Txt>
            <ChevronRight size={14} color={c.accent} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', alignItems: 'center', paddingLeft: PAD_L, paddingRight: PAD_R },
  head: { fontSize: 11, lineHeight: 14, fontFamily: font.bold, letterSpacing: 0.55, textTransform: 'uppercase' },
  line: { position: 'absolute', top: 0, right: 0, left: 14, height: StyleSheet.hairlineWidth },
  fade: { position: 'absolute', top: 0, bottom: 0, right: 0, width: FADE_W },
  below: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 20, marginTop: 10, marginHorizontal: 4 },
  slide: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44, marginVertical: -12 },
});
