/**
 * Piezas chicas de «Premios del torneo» en la app: el interruptor con su texto (Toggle de src/components/badges/maker/
 * parts.tsx de la web), la casilla de un jugador y el lugar vacío de una insignia.
 */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';

/** Un interruptor con su texto y, si hay, la ayuda de abajo (toda la fila se toca). */
export function SwitchRow({ on, onChange, label, hint, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: ReactNode; disabled?: boolean }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: on, disabled: !!disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => onChange(!on)}
      style={[styles.switchRow, { borderColor: c.line, opacity: disabled ? 0.6 : 1 }]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="meta" style={{ fontWeight: '500', color: c.fg }}>
          {label}
        </Txt>
        {!!hint && (
          <Txt variant="small" tone="muted" style={{ fontWeight: '400' }}>
            {hint}
          </Txt>
        )}
      </View>
      <Switch
        value={on}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ true: c.accent, false: c.line }}
        thumbColor="#ffffff"
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
    </Pressable>
  );
}

/** Una casilla con el nombre de un jugador (44 de alto). */
export function CheckRow({ checked, label, disabled, onPress }: { checked: boolean; label: string; disabled?: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: !!disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={[styles.check, { opacity: disabled ? 0.6 : 1 }]}
    >
      <View style={[styles.box, { borderColor: checked ? c.accent : c.faint, backgroundColor: checked ? c.accent : 'transparent' }]}>
        {checked && <Check size={13} color={c.accentFg} strokeWidth={3} />}
      </View>
      <Txt variant="meta">{label}</Txt>
    </Pressable>
  );
}

/** El lugar de una insignia que no se ve (escondida o borrada): un círculo gris. */
export function NoBadge({ size, dashed }: { size: number; dashed?: boolean }) {
  const c = useColors();
  return (
    <View
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: dashed ? 'transparent' : c.surface2,
        borderWidth: dashed ? 1 : 0,
        borderStyle: 'dashed',
        borderColor: c.line,
      }}
    />
  );
}

const styles = StyleSheet.create({
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, borderRadius: 12, borderWidth: 1, padding: 12 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingRight: 8 },
  box: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
