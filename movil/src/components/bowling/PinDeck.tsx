import { Pressable, StyleSheet, View } from 'react-native';
import { PIN_ROWS } from '@mm/components/frames/editorLogic';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { Txt } from '../ui';

/**
 * Los pinos para tocar los que cayeron en el tiro (PinDeck de la web). `standing` = los parados antes del tiro (bits);
 * `knocked` = los que se marcaron como caídos. El que ya había caído sale punteado y no se toca.
 */
export function PinDeck({ standing, knocked, onToggle, disabled }: { standing: number; knocked: number; onToggle: (bit: number) => void; disabled?: boolean }) {
  const c = useColors();
  return (
    <View accessibilityRole="none" accessibilityLabel="Pines" style={{ alignItems: 'center', gap: 8, paddingVertical: 4 }}>
      {PIN_ROWS.map((row) => (
        <View key={row[0]} style={{ flexDirection: 'row', gap: 12 }}>
          {row.map((pin) => {
            const bit = 1 << (pin - 1);
            const up = (standing & bit) !== 0;
            const down = (knocked & bit) !== 0;
            return (
              <Pressable
                key={pin}
                accessibilityRole="button"
                accessibilityState={{ selected: down, disabled: disabled || !up }}
                accessibilityLabel={`Pin ${pin}${!up ? ' (ya había caído)' : down ? ' caído' : ' parado'}`}
                disabled={disabled || !up}
                onPress={() => onToggle(bit)}
                style={({ pressed }) => [
                  styles.pin,
                  !up
                    ? { borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.line, backgroundColor: 'transparent' }
                    : { backgroundColor: down ? c.accent : c.surface2 },
                  pressed && up && { transform: [{ scale: 0.9 }] },
                ]}
              >
                <Txt style={{ fontFamily: font.semibold, fontSize: 15, color: !up ? c.faint : down ? c.accentFg : c.fg }}>{pin}</Txt>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pin: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
});
