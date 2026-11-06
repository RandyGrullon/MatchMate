import { useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { inkOn, teamInitials } from '@mm/components/bowlingTeams/logic';
import { Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font, size } from '@/theme/tokens';

/**
 * Piezas de los equipos del boliche en el teléfono (las de src/components/bowlingTeams/parts.tsx de la web): la marca
 * del equipo, el punto de color, la fila de la lista (la ListRow `dense` de la web), el botón rojo suave y la espera de
 * una acción a la vez (useBusy de la web).
 */

/** El escudo del equipo en las filas: un cuadrado de 40 px en su color, con el número o las iniciales. */
export function TeamMark({ name, color }: { name: string; color: string }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.mark, { backgroundColor: color }]}>
      <Txt style={{ color: inkOn(color), fontFamily: font.bold, fontSize: 14 }}>{teamInitials(name)}</Txt>
    </View>
  );
}

/** El punto de color del equipo (12 px). */
export function TeamDot({ color }: { color: string }) {
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.dot, { backgroundColor: color }]} />;
}

/**
 * Una fila de la lista (la ListRow `dense` de la web): lo de adelante, el título, la línea de abajo, el número y lo de
 * atrás. La flecha sale si se toca y no hay nada atrás (como en la web), salvo `chevron`.
 */
export function DenseRow({
  leading,
  title,
  subtitle,
  value,
  trailing,
  chevron,
  onPress,
  accessibilityLabel,
}: {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: string | null;
  value?: string | number | null;
  trailing?: ReactNode;
  chevron?: boolean;
  onPress?: () => unknown;
  accessibilityLabel?: string;
}) {
  const c = useColors();
  const showChevron = chevron ?? (!!onPress && trailing == null);
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      disabled={!onPress}
      onPress={() => void onPress?.()}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.surface2 : 'transparent' }]}
    >
      {leading}
      <View style={{ flex: 1, minWidth: 0 }}>
        {typeof title === 'string' ? (
          <Txt numberOfLines={1} style={{ fontSize: 15, fontFamily: font.semibold }}>
            {title}
          </Txt>
        ) : (
          title
        )}
        {!!subtitle && (
          <Txt tone="muted" numberOfLines={2} style={{ fontSize: 13, marginTop: 2 }}>
            {subtitle}
          </Txt>
        )}
      </View>
      {value != null && value !== '' && <Txt style={styles.value}>{String(value)}</Txt>}
      {trailing}
      {showChevron && <ChevronRight size={20} color={c.faint} />}
    </Pressable>
  );
}

/** Botón rojo suave (borrar, sacar): solo el ícono (con `label` para el lector de pantalla) o con texto. */
export function DangerButton({
  icon,
  label,
  children,
  loading,
  disabled,
  onPress,
  full,
}: {
  icon: ReactNode;
  label: string;
  children?: string;
  loading?: boolean;
  disabled?: boolean;
  onPress: () => unknown;
  full?: boolean;
}) {
  const c = useColors();
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      onPress={() => void onPress()}
      style={({ pressed }) => [
        styles.danger,
        { backgroundColor: c.dangerSoft, opacity: off ? 0.5 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] },
        children ? { paddingHorizontal: 16 } : { width: 48 },
        full && { width: '100%' },
      ]}
    >
      {loading ? <ActivityIndicator color={c.danger} /> : icon}
      {!!children && (
        <Txt numberOfLines={1} style={{ flexShrink: 1, color: c.danger, fontFamily: font.semibold, fontSize: 16 }}>
          {children}
        </Txt>
      )}
    </Pressable>
  );
}

/** El link de la derecha de un título de sección (sectionLinkClass de la web): «Nuevo equipo», «Cambiar»… */
export function SectionLink({ icon, children, onPress, accessibilityLabel, expanded }: { icon?: ReactNode; children: string; onPress: () => unknown; accessibilityLabel?: string; expanded?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={expanded === undefined ? undefined : { expanded }}
      hitSlop={8}
      onPress={() => void onPress()}
      style={({ pressed }) => [styles.link, { opacity: pressed ? 0.6 : 1 }]}
    >
      {icon}
      <Txt variant="meta" tone="accent" style={{ fontFamily: font.semibold }}>
        {children}
      </Txt>
    </Pressable>
  );
}

/** La ruedita de una fila que espera (el BusyIcon de la web). */
export function RowSpinner() {
  const c = useColors();
  return <ActivityIndicator size="small" color={c.faint} />;
}

/**
 * Qué acción está esperando (useBusy de la web): una sola a la vez; mientras una corre, las demás no hacen nada. La
 * clave es la acción ('guardar') o el id de la fila, para que solo esa muestre la ruedita.
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

const styles = StyleSheet.create({
  mark: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: size.row, paddingLeft: 20, paddingRight: 18, paddingVertical: 8 },
  value: { fontSize: 19, lineHeight: 21, letterSpacing: -0.4, fontFamily: font.semibold },
  link: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 2 },
  danger: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 15 },
});
