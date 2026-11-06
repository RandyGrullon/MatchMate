import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { longDay } from '@mm/components/create/logic';
import { parseDate, toIsoDate } from '@mm/lib/format';
import { useColors } from '@/theme/theme';
import { Txt } from './ui';

const addDays = (iso: string, n: number) => {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return toIsoDate(d);
};

/**
 * Una fecha con «‹ ›» (un día) y «−7 / +7» (una semana), sin el calendario del sistema (sirve igual en la vista previa).
 * `min` y `max` (YYYY-MM-DD) la dejan dentro de esas fechas.
 */
export function DateStepper({ value, onChange, min, max }: { value: string; onChange: (v: string) => void; min?: string; max?: string }) {
  const c = useColors();
  const move = (n: number) => {
    const next = addDays(value, n);
    onChange(min && next < min ? min : max && next > max ? max : next);
  };
  const btn = (labelText: string, n: number, child: ReactNode, off: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={labelText}
      accessibilityState={{ disabled: off }}
      disabled={off}
      onPress={() => move(n)}
      style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface2, opacity: off ? 0.4 : 1 }}
    >
      {child}
    </Pressable>
  );
  const atMin = !!min && value <= min;
  const atMax = !!max && value >= max;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 16, padding: 6, borderWidth: 1.5, borderColor: c.line, backgroundColor: c.surface }}>
      {btn('Una semana antes', -7, <Txt variant="small">−7</Txt>, atMin)}
      {btn('Un día antes', -1, <ChevronLeft size={20} color={c.fg} />, atMin)}
      <Txt variant="bodyStrong" style={{ flex: 1, textAlign: 'center' }} numberOfLines={1}>
        {longDay(value) || value}
      </Txt>
      {btn('Un día después', 1, <ChevronRight size={20} color={c.fg} />, atMax)}
      {btn('Una semana después', 7, <Txt variant="small">+7</Txt>, atMax)}
    </View>
  );
}
