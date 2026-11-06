/**
 * Los controles de anotar una serie y de las hojas de esports (parts.tsx y racket/bits.tsx de la web): el número con
 * − y + que se puede escribir, la fila «Tigres ……… [−] 13 [+]», «¿Quién ganó?» con dos botones, las fichas de un valor
 * corto («2-0», «Sin detalle»), una casilla con su línea (ToggleRow) y la fila de una opción de menú.
 */
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { Check, ChevronDown, ChevronRight, Minus, Plus } from 'lucide-react-native';
import { Txt } from '../ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/** Un número con − y + de 44 px y el número en medio (se puede escribir). Vacío = sin dato (`undefined`), si `optional`. */
export function ScoreStepper({
  value,
  onChange,
  min = 0,
  max = 99,
  label,
  optional,
}: {
  value: number | undefined;
  onChange: (n: number | undefined) => void;
  min?: number;
  max?: number;
  label: string;
  optional?: boolean;
}) {
  const c = useColors();
  const set = (n: number) => onChange(Math.max(min, Math.min(max, n)));
  const round = (disabled: boolean) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: c.surface2, alignItems: 'center' as const, justifyContent: 'center' as const, opacity: disabled ? 0.4 : 1 });
  const lessOff = value == null || value <= min;
  const moreOff = value != null && value >= max;
  return (
    <View accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Menos: ${label}`} disabled={lessOff} onPress={() => set((value ?? min) - 1)} style={round(lessOff)}>
        <Minus size={20} color={c.fg} />
      </Pressable>
      <TextInput
        accessibilityLabel={label}
        keyboardType="number-pad"
        value={value == null ? '' : String(value)}
        placeholder={optional ? '–' : String(min)}
        placeholderTextColor={c.faint}
        onChangeText={(t) => {
          const raw = t.replace(/\D/g, '');
          if (!raw) return onChange(optional ? undefined : min);
          set(Number(raw));
        }}
        style={{ width: 56, height: 44, borderRadius: 12, backgroundColor: c.surface2, textAlign: 'center', fontSize: 22, fontFamily: font.bold, color: c.fg }}
      />
      <Pressable accessibilityRole="button" accessibilityLabel={`Más: ${label}`} disabled={moreOff} onPress={() => set(value == null ? (optional ? min : min + 1) : value + 1)} style={round(moreOff)}>
        <Plus size={20} color={c.fg} />
      </Pressable>
    </View>
  );
}

/** Una fila «Tigres ……… [−] 13 [+]»: el nombre se corta antes que los botones. */
export function SideStepRow({ name, children, top }: { name: string; children: ReactNode; top?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, borderTopWidth: top ? 1 : 0, borderTopColor: c.line }}>
      <Txt numberOfLines={1} style={{ flex: 1, minWidth: 0, fontSize: 15, fontFamily: font.semibold }}>
        {name}
      </Txt>
      {children}
    </View>
  );
}

/** «¿Quién ganó?»: dos botones grandes con los nombres (el elegido en acento). */
export function WinnerPick({ value, names, onChange, label = '¿Quién ganó?' }: { value: 1 | 2 | null | undefined; names: readonly [string, string]; onChange: (w: 1 | 2) => void; label?: string }) {
  const c = useColors();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', gap: 8 }}>
      {([1, 2] as const).map((s) => {
        const on = value === s;
        return (
          <Pressable
            key={s}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(s)}
            style={({ pressed }) => ({ flex: 1, minHeight: 48, borderRadius: 16, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.accent : c.surface2, opacity: pressed ? 0.85 : 1 })}
          >
            <Txt numberOfLines={1} style={{ fontSize: 15, fontFamily: font.semibold, color: on ? c.accentFg : c.fg }}>
              {names[s - 1]}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Fichas para elegir un valor corto («2-0», «2-1», «Sin detalle») o un torneo (Chips de la web). */
export function ChoiceChips<K extends string>({ items, value, onChange, label, scroll }: { items: readonly { key: K; label: string }[]; value: K | null; onChange: (k: K) => void; label: string; scroll?: boolean }) {
  const c = useColors();
  const chips = items.map((it) => {
    const on = it.key === value;
    return (
      <Pressable
        key={it.key}
        accessibilityRole="radio"
        accessibilityState={{ selected: on }}
        onPress={() => onChange(it.key)}
        style={({ pressed }) => ({ height: 44, minWidth: 56, borderRadius: 22, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.accentSoft : c.surface2, opacity: pressed ? 0.85 : 1 })}
      >
        <Txt numberOfLines={1} style={{ fontSize: 15, fontFamily: font.semibold, color: on ? c.accent : c.fg2 }}>
          {it.label}
        </Txt>
      </Pressable>
    );
  });
  if (scroll) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="radiogroup" accessibilityLabel={label} contentContainerStyle={{ gap: 8 }}>
        {chips}
      </ScrollView>
    );
  }
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {chips}
    </View>
  );
}

/** Una casilla con su línea (ToggleRow de la web): «Prórroga (gol de oro)», «Empate (sin penales)». */
export function ToggleRow({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={() => onChange(!checked)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: checked ? c.accentSoft : c.surface2 }}
    >
      <View style={{ width: 24, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: checked ? c.accent : c.surface, borderWidth: checked ? 0 : 1.5, borderColor: c.faint }}>
        {checked && <Check size={16} color={c.accentFg} strokeWidth={3} />}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt style={{ fontSize: 15, fontFamily: font.semibold, color: checked ? c.accent : c.fg }}>{label}</Txt>
        {!!hint && (
          <Txt tone="muted" style={{ fontSize: 13 }}>
            {hint}
          </Txt>
        )}
      </View>
    </Pressable>
  );
}

/** Una opción de una hoja de opciones (EventMenu de la web): el ícono en su caja, qué hace y, debajo, una línea. */
export function MenuRow({ icon, label, hint, onPress, danger, disabled }: { icon: ReactNode; label: string; hint?: string; onPress: () => void; danger?: boolean; disabled?: boolean }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, borderRadius: 16, paddingHorizontal: 8, paddingVertical: 8, backgroundColor: pressed ? c.surface2 : 'transparent', opacity: disabled ? 0.7 : 1 })}
    >
      <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: danger ? c.dangerSoft : c.surface2 }}>{icon}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="bodyStrong" tone={danger ? 'danger' : 'fg'}>
          {label}
        </Txt>
        {!!hint && (
          <Txt tone="muted" style={{ fontSize: 13 }}>
            {hint}
          </Txt>
        )}
      </View>
      {!danger && <ChevronRight size={20} color={c.faint} />}
    </Pressable>
  );
}

/** La letra chica que se abre al tocarla (FinePrint de la web): «Cómo se desempata». */
export function FinePrint({ summary = 'Cómo se desempata', children }: { summary?: string; children: string }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ marginHorizontal: 4 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 }}>
        <ChevronDown size={14} color={c.fg2} style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} />
        <Txt tone="fg2" style={{ fontSize: 12.5, fontFamily: font.semibold }}>
          {summary}
        </Txt>
      </Pressable>
      {open && (
        <Txt tone="muted" style={{ fontSize: 12.5, lineHeight: 18 }}>
          {children}
        </Txt>
      )}
    </View>
  );
}

/**
 * Una fila tocable con lo de abajo hecho de piezas (el texto y sus fichas: «VALORANT · Los Tigres» + «En curso»), como
 * ListRow de la web con `subtitle` de varias partes. `me`: la fila propia, en acento suave.
 */
export function RichRow({
  icon,
  title,
  subtitle,
  right,
  onPress,
  me,
  accessibilityLabel,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  me?: boolean;
  accessibilityLabel?: string;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: pressed ? c.surface2 : me ? c.accentSoft : 'transparent' })}
    >
      {icon}
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Txt variant="bodyStrong" numberOfLines={1}>
          {title}
        </Txt>
        {subtitle != null && <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 6, rowGap: 4 }}>{subtitle}</View>}
      </View>
      {right}
      {onPress && <ChevronRight size={18} color={c.faint} />}
    </Pressable>
  );
}

/** El texto de la línea de abajo de una fila (para RichRow). */
export function RowText({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'warn' }) {
  return (
    <Txt variant="meta" tone={tone} style={tone === 'warn' ? { fontFamily: font.semibold } : undefined}>
      {children}
    </Txt>
  );
}
