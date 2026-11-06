import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { useBusy } from '@/components/bowlingTeams/parts';
import { ChoiceRow, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/**
 * El Select que guarda al elegir (BusySelect de la web: equipo, pista). En el teléfono, la elegida en una caja y, al
 * tocarla, las opciones debajo (como PickField de Jugadores). Mientras guarda, la ruedita va donde la flecha y no deja
 * elegir otra vez; cada uno lleva su propia espera (los de las otras filas se siguen usando).
 */
export function BusySelect({
  label,
  options,
  value,
  onPick,
}: {
  /** Para el lector de pantalla (el aria-label de la web). */
  label: string;
  options: readonly { key: string; label: string }[];
  value: string;
  onPick: (value: string) => Promise<unknown> | void;
}) {
  const c = useColors();
  const { isBusy, run } = useBusy();
  const [open, setOpen] = useState(false);
  const busy = isBusy();
  const current = options.find((o) => o.key === value) ?? options[0];
  const Icon = open ? ChevronUp : ChevronDown;
  return (
    <View style={{ gap: 6 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open, disabled: busy, busy }}
        disabled={busy}
        onPress={() => setOpen(!open)}
        style={[styles.box, { backgroundColor: c.surface2 }]}
      >
        <Txt numberOfLines={1} style={{ flex: 1, fontSize: 15, fontFamily: font.medium }}>
          {current?.label ?? ''}
        </Txt>
        {busy ? <ActivityIndicator size="small" color={c.muted} /> : <Icon size={18} color={c.muted} />}
      </Pressable>
      {open && !busy && (
        <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ gap: 6 }}>
          {options.map((o) => (
            <ChoiceRow
              key={o.key || '-'}
              title={o.label}
              selected={o.key === value}
              onPress={() => {
                setOpen(false);
                void run('elegir', async () => onPick(o.key));
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { minHeight: 44, borderRadius: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
});
