import { StyleSheet, View } from 'react-native';
import { scoreGame } from '@mm/lib/bowling';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { Txt } from '../ui';

/**
 * La hoja de un juego de boliche: 10 cuadros en dos filas de 5 (como la web en el teléfono), con las marcas de cada tiro
 * (X, /, -, el número) y el acumulado de cada cuadro. Marca el cuadro donde va el próximo tiro.
 */
export function FramesSheet({ rolls, current }: { rolls: readonly number[]; current: number | null }) {
  const c = useColors();
  const game = scoreGame(rolls);
  const frames = Array.from({ length: 10 }, (_, i) => game.frames[i] ?? null);
  const row = (from: number) => (
    <View style={styles.row}>
      {frames.slice(from, from + 5).map((f, k) => {
        const i = from + k;
        const slots = i === 9 ? 3 : 2;
        const marks = Array.from({ length: slots }, (_, j) => f?.marks[j] ?? '');
        const on = current === i;
        return (
          <View
            key={i}
            accessible
            accessibilityLabel={`Cuadro ${i + 1}${f?.marks.length ? `: ${f.marks.join(' ')}` : ': vacío'}${f?.total != null ? `, lleva ${f.total}` : ''}`}
            style={[styles.frame, { borderColor: on ? c.accent : c.line, backgroundColor: on ? c.accentSoft : c.surface }, i === 9 && { flex: 1.35 }]}
          >
            <View style={styles.head}>
              <Txt variant="small" tone="faint">
                {i + 1}
              </Txt>
              <View style={styles.marks}>
                {marks.map((m, j) => (
                  <View key={j} style={[styles.mark, { borderLeftColor: c.line }]}>
                    <Txt style={{ fontFamily: font.bold, fontSize: 13, color: m === 'X' || m === '/' ? c.accent : c.fg }}>{m}</Txt>
                  </View>
                ))}
              </View>
            </View>
            <Txt style={{ fontFamily: font.bold, fontSize: 16, color: c.fg, textAlign: 'center', minHeight: 20 }}>{f?.total ?? ''}</Txt>
          </View>
        );
      })}
    </View>
  );
  return (
    <View style={{ gap: 6 }}>
      {row(0)}
      {row(5)}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  frame: { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingBottom: 6, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  marks: { flexDirection: 'row' },
  mark: { width: 18, height: 22, alignItems: 'center', justifyContent: 'center', borderLeftWidth: StyleSheet.hairlineWidth },
});
