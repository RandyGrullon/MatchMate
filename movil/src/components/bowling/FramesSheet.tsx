import { Pressable, StyleSheet, View } from 'react-native';
import { scoreGame } from '@mm/lib/bowling';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { Txt } from '../ui';

/**
 * La hoja de un juego de boliche: 10 cuadros en dos filas de 5 (como la web en el teléfono), con las marcas de cada tiro
 * (X, /, -, el número) y el acumulado de cada cuadro. Marca el cuadro donde va el próximo tiro. Con `onSelect`, tocar un
 * tiro lo elige para corregirlo (`selected` se ve marcado; `blank` vacío esperando el valor) y dejarlo presionado lo
 * borra (`onLongPress`), como FramesSheet de la web.
 */
export function FramesSheet({
  rolls,
  current,
  selected = null,
  blank = null,
  onSelect,
  onLongPress,
}: {
  rolls: readonly number[];
  current: number | null;
  selected?: number | null;
  blank?: number | null;
  onSelect?: (roll: number | null) => void;
  onLongPress?: (roll: number) => void;
}) {
  const c = useColors();
  const game = scoreGame(rolls);
  const frames = Array.from({ length: 10 }, (_, i) => game.frames[i] ?? null);
  const editingFrame = selected != null ? game.frames.findIndex((f) => selected >= f.start && selected < f.start + f.rolls.length) : -1;
  const row = (from: number) => (
    <View style={styles.row}>
      {frames.slice(from, from + 5).map((f, k) => {
        const i = from + k;
        const slots = i === 9 ? 3 : 2;
        const on = editingFrame >= 0 ? editingFrame === i : current === i;
        return (
          <View
            key={i}
            accessible={!onSelect}
            accessibilityLabel={`Cuadro ${i + 1}${f?.marks.length ? `: ${f.marks.join(' ')}` : ': vacío'}${f?.total != null ? `, lleva ${f.total}` : ''}`}
            style={[styles.frame, { borderColor: on ? c.accent : c.line, backgroundColor: on ? c.accentSoft : c.surface }, i === 9 && { flex: 1.35 }]}
          >
            <View style={styles.head}>
              <Txt variant="small" tone="faint">
                {i + 1}
              </Txt>
              <View style={styles.marks}>
                {Array.from({ length: slots }, (_, j) => {
                  const roll = f && j < f.rolls.length ? f.start + j : null;
                  const m = roll != null && roll === blank ? '' : (f?.marks[j] ?? '');
                  const picked = roll != null && roll === selected;
                  const content = (
                    <Txt style={{ fontFamily: font.bold, fontSize: 13, color: picked ? c.accentFg : m === 'X' || m === '/' ? c.accent : c.fg }}>{m}</Txt>
                  );
                  if (!onSelect || roll == null) {
                    return (
                      <View key={j} style={[styles.mark, { borderLeftColor: c.line }]}>
                        {content}
                      </View>
                    );
                  }
                  return (
                    <Pressable
                      key={j}
                      accessibilityRole="button"
                      accessibilityLabel={`Cuadro ${i + 1}, tiro ${j + 1}: ${f?.marks[j] ?? ''}. Toca para corregirlo; déjalo presionado para borrarlo`}
                      accessibilityState={{ selected: picked }}
                      hitSlop={4}
                      onPress={() => onSelect(roll)}
                      onLongPress={() => onLongPress?.(roll)}
                      style={[styles.mark, { borderLeftColor: c.line, backgroundColor: picked ? c.accent : 'transparent' }]}
                    >
                      {content}
                    </Pressable>
                  );
                })}
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
