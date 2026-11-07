/**
 * El modo piscina (FieldScreen y FieldModeButton de la web, con las piezas del modo cancha: src/court/device.ts): el
 * cronometraje a pantalla completa, con la pantalla siempre encendida (TimingPanel ya la mantiene) y el modo sol (alto
 * contraste: blanco y negro puro, los mismos colores de courtVars de la web; se recuerda en el teléfono).
 * - `PoolModeButton`: la fila que lo abre («Modo piscina»).
 * - `PoolModal`: la pantalla completa (un Modal) con el modo sol para todo lo de adentro; el «atrás» de Android sale.
 * - `PoolLayout`: lo de adentro: arriba salir (✕), el título, la línea de abajo y el sol; `top` fijo arriba (la prueba y
 *   la serie), lo que se desplaza (los carriles) y `footer` siempre a la vista abajo (Deshacer y «Publicar serie»).
 */
import { createContext, useContext, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Maximize, Sun, X } from 'lucide-react-native';
import { useSunMode } from '@mm/court/device';
import { Card, ListRow, RowIcon, Txt } from '@/components/ui';
import { ColorsOverride, useColors, useTheme } from '@/theme/theme';
import type { Colors } from '@/theme/tokens';

/** El modo sol: los colores de courtVars(true) de la web (todo en blanco y negro puro). */
const SUN_COLORS: Partial<Colors> = {
  bg: '#ffffff',
  surface: '#ffffff',
  surface2: '#eeeeee',
  fg: '#000000',
  muted: '#1a1a1a',
  line: '#000000',
  accent: '#000000',
  accentFg: '#ffffff',
  accentSoft: '#e6e6e6',
  danger: '#b00000',
  onDanger: '#ffffff',
  dangerSoft: '#ffe5e5',
  warn: '#7a3d00',
  warnSoft: '#fff0cc',
  ok: '#005c2a',
  okSoft: '#dcf5e6',
};

interface PoolState {
  sun: boolean;
  setSun: (on: boolean) => void;
  onExit: () => void;
}

const PoolCtx = createContext<PoolState | null>(null);

/** La fila que abre la pantalla completa: tranquila, con lo que hace en chiquito. */
export function PoolModeButton({ onPress }: { onPress: () => void }) {
  const c = useColors();
  return (
    <Card padded={false}>
      <ListRow
        icon={
          <RowIcon>
            <Maximize size={20} color={c.accent} />
          </RowIcon>
        }
        title="Modo piscina"
        subtitle="Pantalla completa, siempre encendida y con modo sol"
        onPress={onPress}
      />
    </Card>
  );
}

/** La pantalla completa del modo piscina, con el modo sol (se recuerda en el teléfono) para todo lo de adentro. */
export function PoolModal({ onExit, children }: { onExit: () => void; children: ReactNode }) {
  const [sun, setSun] = useSunMode();
  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onExit} statusBarTranslucent>
      <ColorsOverride dark={sun ? false : undefined} colors={sun ? SUN_COLORS : undefined}>
        <PoolCtx.Provider value={{ sun, setSun, onExit }}>{children}</PoolCtx.Provider>
      </ColorsOverride>
    </Modal>
  );
}

/** Un botón redondo de la barra de arriba (44 px); el modo sol prendido, en el acento. */
function RoundButton({ label, on, selected, onPress, children }: { label: string; on?: boolean; selected?: boolean; onPress: () => void; children: ReactNode }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selected === undefined ? undefined : { selected }}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [styles.round, { backgroundColor: on ? c.accent : c.surface2, transform: [{ scale: pressed ? 0.95 : 1 }] }]}
    >
      {children}
    </Pressable>
  );
}

/** Lo de adentro del modo piscina (va dentro de PoolModal). */
export function PoolLayout({ title, subtitle, top, footer, children }: { title: string; subtitle?: string; top?: ReactNode; footer?: ReactNode; children: ReactNode }) {
  const c = useColors();
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const pool = useContext(PoolCtx);
  const sun = pool?.sun ?? false;
  return (
    <View accessibilityViewIsModal style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={[styles.head, { borderBottomColor: c.line }]}>
        <RoundButton label="Salir del modo piscina" onPress={() => pool?.onExit()}>
          <X size={20} color={c.fg2} />
        </RoundButton>
        <View style={{ flex: 1, minWidth: 0, paddingHorizontal: 4 }}>
          <Txt variant="bodyStrong" numberOfLines={1}>
            {title}
          </Txt>
          {!!subtitle && (
            <Txt tone="muted" numberOfLines={1} style={{ fontSize: 13 }}>
              {subtitle}
            </Txt>
          )}
        </View>
        <RoundButton label={sun ? 'Quitar modo sol' : 'Modo sol (alto contraste)'} on={sun} selected={sun} onPress={() => pool?.setSun(!sun)}>
          <Sun size={20} color={sun ? c.accentFg : c.fg2} />
        </RoundButton>
      </View>

      {top && <View style={{ gap: 10, paddingHorizontal: 12, paddingTop: 12 }}>{top}</View>}

      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12, padding: 12 }}>
        {children}
      </ScrollView>

      {footer && <View style={[styles.foot, { borderTopColor: c.line, backgroundColor: c.bg, paddingBottom: Math.max(insets.bottom, 8) }]}>{footer}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  foot: { gap: 8, paddingHorizontal: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
