import { Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/theme/theme';
import { font, radius } from '@/theme/tokens';
import { Txt } from '../ui';

/**
 * Teclado de tiros, como el de la web (src/components/frames/FrameEditor.tsx · Keypad): 1–9 y a la derecha X Strike,
 * / Spare y 0 Fallo. Solo se encienden las teclas que valen según los pinos que quedan parados (en el segundo tiro, el
 * número igual a los que quedan es el spare «/»). `standing` < 0: el juego terminó.
 */
export function Keypad({ standing, fresh, onRoll }: { standing: number; fresh: boolean; onRoll: (pins: number) => void }) {
  const over = standing < 0;
  const digit = (d: number) => <Key key={d} big={String(d)} enabled={!over && (fresh ? d <= 9 : d < standing)} onPress={() => onRoll(d)} label={`${d} ${d === 1 ? 'pino' : 'pinos'}`} />;
  return (
    <View style={styles.grid}>
      <View style={styles.row}>
        {digit(1)}
        {digit(2)}
        {digit(3)}
        <Key big="X" small="Strike" accent enabled={!over && fresh} onPress={() => onRoll(10)} label="Strike" />
      </View>
      <View style={styles.row}>
        {digit(4)}
        {digit(5)}
        {digit(6)}
        <Key big="/" small="Spare" accent enabled={!over && !fresh && standing > 0} onPress={() => onRoll(standing)} label="Spare" />
      </View>
      <View style={styles.row}>
        {digit(7)}
        {digit(8)}
        {digit(9)}
        <Key big="0" small="Fallo" enabled={!over} onPress={() => onRoll(0)} label="Fallo, ningún pino" />
      </View>
    </View>
  );
}

function Key({ big, small, enabled, accent, onPress, label }: { big: string; small?: string; enabled: boolean; accent?: boolean; onPress: () => void; label: string }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
        onPress();
      }}
      style={({ pressed }) => [
        styles.key,
        enabled
          ? { backgroundColor: accent ? c.accent : c.surface2, transform: [{ scale: pressed ? 0.95 : 1 }] }
          : { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: c.line },
      ]}
    >
      <Txt style={{ fontFamily: font.bold, fontSize: 26, color: !enabled ? c.faint : accent ? c.accentFg : c.fg }}>{big}</Txt>
      {small && <Txt style={{ fontFamily: font.semibold, fontSize: 11, color: !enabled ? c.faint : accent ? c.accentFg : c.muted }}>{small}</Txt>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  key: { flex: 1, height: 64, borderRadius: radius.key, alignItems: 'center', justifyContent: 'center' },
});
