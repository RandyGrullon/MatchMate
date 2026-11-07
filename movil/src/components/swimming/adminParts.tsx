/**
 * Piezas de las pantallas del organizador de natación (los campos de MeetFormModal, SwimmersAdmin y ClubsAdmin de la
 * web, con React Native): «+ Nuevo» del título de una sección, una acción a la vez (useBusy de la web), elegir de una
 * lista sin abrir otra hoja (el <select> de la web), la casilla con su texto, la hora opcional, el color del club, el
 * pie de Cancelar y Guardar y el «Sin color».
 */
import { useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Check, ChevronDown, Plus, X } from 'lucide-react-native';
import { ColorBoard } from '@/components/balls/DesignControls';
import { TimeStepper } from '@/components/esports/fields';
import { Button, ChoiceRow, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/** «+ Nuevo» (o «+ Registrar», «+ Agregar») a la derecha del título de una sección (SectionAdd de la web). */
export function SectionAdd({ label = 'Nuevo', onPress, disabled }: { label?: string; onPress: () => void; disabled?: boolean }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.link, { opacity: disabled ? 0.5 : pressed ? 0.6 : 1 }]}
    >
      <Plus size={18} color={c.accent} strokeWidth={2.4} />
      <Txt variant="meta" tone="accent" style={{ fontFamily: font.semibold }}>
        {label}
      </Txt>
    </Pressable>
  );
}

/**
 * Qué acción está esperando (useBusy de la web): una sola a la vez; mientras una corre, las demás no hacen nada. La clave
 * es la acción ('final', 'borrar') o el id de la fila, para que solo esa muestre la ruedita.
 */
export function useBusy<K extends string = string>() {
  const [busy, setBusy] = useState<K | null>(null);
  const running = useRef(false);
  async function run<T>(key: K, fn: () => Promise<T>): Promise<T | undefined> {
    if (running.current) return undefined;
    running.current = true;
    setBusy(key);
    try {
      return await fn();
    } finally {
      running.current = false;
      setBusy(null);
    }
  }
  const isBusy = (key?: K) => (key === undefined ? busy !== null : busy === key);
  return { busy, isBusy, run };
}

export interface SelectOption<K extends string> {
  value: K;
  label: string;
}

/**
 * Elegir una opción de una lista (el <select> de la web) dentro de una hoja: se ve la elegida con «⌄»; al tocarla se
 * abren las opciones ahí mismo (sin otra hoja encima) y al elegir se cierran.
 */
export function InlineSelect<K extends string>({ label, value, options, onChange, disabled }: { label: string; value: K; options: readonly SelectOption<K>[]; onChange: (v: K) => void; disabled?: boolean }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value) ?? options[0];
  return (
    <View style={{ gap: 8 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label ?? ''}`}
        accessibilityState={{ expanded: open, disabled: !!disabled }}
        disabled={disabled}
        onPress={() => setOpen((v) => !v)}
        style={({ pressed }) => [styles.select, { backgroundColor: pressed ? c.line : c.surface2, opacity: disabled ? 0.5 : 1 }]}
      >
        <Txt numberOfLines={1} style={{ flex: 1, minWidth: 0, fontFamily: font.medium, fontSize: 16 }}>
          {current?.label ?? ''}
        </Txt>
        <ChevronDown size={20} color={c.muted} style={open ? { transform: [{ rotate: '180deg' }] } : undefined} />
      </Pressable>
      {open && (
        <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ gap: 6 }}>
          {options.map((o) => (
            <ChoiceRow
              key={o.value}
              title={o.label}
              selected={o.value === value}
              onPress={() => {
                onChange(o.value);
                setOpen(false);
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}

/** Una casilla con su texto y, debajo, una línea más chica (el <input type="checkbox"> con <label> de la web). */
export function CheckRow({
  checked,
  onChange,
  label,
  hint,
  disabled,
  busy,
  boxed,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string | null;
  disabled?: boolean;
  busy?: boolean;
  /** En su recuadro gris (el permiso del tutor). */
  boxed?: boolean;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
      accessibilityState={{ checked, disabled: !!disabled, busy: !!busy }}
      disabled={disabled || busy}
      onPress={() => onChange(!checked)}
      style={[styles.check, boxed && { backgroundColor: c.surface2, borderRadius: 14, padding: 12 }]}
    >
      <View style={{ width: 22, height: 22, marginTop: 1, alignItems: 'center', justifyContent: 'center' }}>
        {busy ? (
          <ActivityIndicator size="small" color={c.muted} />
        ) : (
          <View style={[styles.box, { opacity: disabled ? 0.5 : 1 }, checked ? { backgroundColor: c.accent, borderColor: c.accent } : { borderColor: c.faint }]}>
            {checked && <Check size={14} color={c.accentFg} strokeWidth={3} />}
          </View>
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt style={{ fontSize: 14 }}>{label}</Txt>
        {!!hint && (
          <Txt tone="muted" style={{ fontSize: 12 }}>
            {hint}
          </Txt>
        )}
      </View>
    </Pressable>
  );
}

/** La hora opcional («Hora (opcional)» de la web): sin hora, «—» (tocarlo pone una); con hora, «−1 h ‹ › +1 h» y ✕. */
export function OptionalTime({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const c = useColors();
  if (!value) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => onChange('08:00')}
        style={({ pressed }) => [styles.empty, { borderColor: c.line, backgroundColor: pressed ? c.surface2 : c.surface }]}
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
        <TimeStepper value={value} onChange={onChange} label={label} />
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Borrar" hitSlop={4} onPress={() => onChange('')} style={[styles.clear, { backgroundColor: c.surface2 }]}>
        <X size={18} color={c.muted} />
      </Pressable>
    </View>
  );
}

/**
 * El color del club (el <input type="color"> de la web): el color de ahora (tocarlo abre el tablero para elegir otro,
 * como el selector del navegador) y «Sin color».
 */
export function ColorField({ value, onChange }: { value: string | null; onChange: (hex: string | null) => void }) {
  const c = useColors();
  const [board, setBoard] = useState(false);
  const shown = value ?? '#3b82f6';
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Color del club"
          accessibilityState={{ expanded: board }}
          onPress={() => setBoard((b) => !b)}
          style={({ pressed }) => [styles.swatch, { borderColor: board ? c.accent : c.line, borderWidth: board ? 2 : 1, backgroundColor: c.surface, opacity: pressed ? 0.85 : 1 }]}
        >
          <View style={{ flex: 1, borderRadius: 8, backgroundColor: shown, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.2)' }} />
        </Pressable>
        {value != null && (
          <Button variant="ghost" onPress={() => onChange(null)}>
            Sin color
          </Button>
        )}
      </View>
      {board && <ColorBoard value={shown} onChange={onChange} />}
    </View>
  );
}

/** El pie de una hoja: «Cancelar» y el botón de guardar (a la izquierda, lo que haga falta: «Borrar»). */
export function SheetFooter({ onCancel, children, left }: { onCancel: () => void; children: ReactNode; left?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {left}
      <Button variant="ghost" onPress={onCancel}>
        Cancelar
      </Button>
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

/** Dos campos lado a lado (la grilla de dos columnas de la web). */
export function TwoCols({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', gap: 12 }}>{children}</View>;
}

/** Una columna de TwoCols. */
export function Col({ children }: { children: ReactNode }) {
  return <View style={{ flex: 1, minWidth: 0 }}>{children}</View>;
}

const styles = StyleSheet.create({
  link: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 },
  select: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 52, borderRadius: 16, paddingHorizontal: 16 },
  check: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, minHeight: 44 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  empty: { height: 58, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  clear: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 56, height: 44, borderRadius: 12, padding: 4 },
});
