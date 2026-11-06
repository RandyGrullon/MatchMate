import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { X } from 'lucide-react-native';
import { DateStepper } from '@/components/DateStepper';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { Txt } from '../ui';

/**
 * Las listas para elegir de la hoja de una bola, en vez de los <select> de la web (peso, cubierta, pulgadas): las
 * opciones en líneas (todas a la vista), con la elegida marcada.
 */
export function ChoiceChips<K extends string | number>({
  label,
  options,
  value,
  onChange,
  invalid,
  trailing,
}: {
  /** Nombre del grupo para el lector de pantalla. */
  label: string;
  options: readonly { key: K; label: string; disabled?: boolean }[];
  value: K;
  onChange: (k: K) => void;
  invalid?: boolean;
  /** Algo al final de la fila (la marca de pulgadas). */
  trailing?: ReactNode;
}) {
  const c = useColors();
  const chips = options.map((o) => {
    const on = o.key === value;
    return (
      <Pressable
        key={String(o.key)}
        accessibilityRole="radio"
        accessibilityState={{ checked: on, disabled: !!o.disabled }}
        accessibilityLabel={o.label}
        disabled={o.disabled}
        onPress={() => onChange(o.key)}
        style={({ pressed }) => ({
          minWidth: 44,
          height: 40,
          borderRadius: 20,
          paddingHorizontal: 14,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: on ? c.accent : c.surface2,
          borderWidth: invalid && on ? 1.5 : 0,
          borderColor: c.danger,
          opacity: o.disabled ? 0.4 : pressed ? 0.85 : 1,
        })}
      >
        <Txt style={{ color: on ? c.accentFg : c.fg, fontFamily: font.semibold, fontSize: 14 }}>{o.label}</Txt>
      </Pressable>
    );
  });
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      {chips}
      {trailing}
    </View>
  );
}

/**
 * Una fecha que se puede dejar sin poner (el <input type="date"> de la web): sin fecha, «—» y tocarla pone hoy; con
 * fecha, «‹ ›» y «−7 / +7» (hasta `max`) y la X para quitarla.
 */
export function DayField({ label, value, max, onChange }: { label: string; value: string | null; max: string; onChange: (v: string | null) => void }) {
  const c = useColors();
  if (!value) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => onChange(max)}
        style={({ pressed }) => ({ height: 58, borderRadius: 16, borderWidth: 1.5, borderColor: c.line, backgroundColor: pressed ? c.surface2 : c.surface, alignItems: 'center', justifyContent: 'center' })}
      >
        <Txt variant="bodyStrong" tone="muted">
          —
        </Txt>
      </Pressable>
    );
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <DateStepper value={value} max={max} onChange={onChange} />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Borrar"
        hitSlop={4}
        onPress={() => onChange(null)}
        style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface2 }}
      >
        <X size={18} color={c.muted} />
      </Pressable>
    </View>
  );
}
