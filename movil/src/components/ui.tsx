/**
 * Las piezas de la app, con las medidas del rediseño «Calma y foco» de la web (src/components/ui.tsx y cuenta/kit.tsx):
 * textos, botones, tarjetas, filas, campos, selector segmentado, vacío, error y carga.
 */
import { forwardRef, type ComponentRef, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets, type Edge } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/theme/theme';
import { font, radius, size, type } from '@/theme/tokens';
import type { Colors } from '@/theme/tokens';
import { LogoSpinner } from './Logo';

type Tone = 'fg' | 'fg2' | 'muted' | 'faint' | 'accent' | 'danger' | 'ok' | 'warn' | 'accentFg';
type Variant = keyof typeof type;

/** Texto con las medidas de la web (hero, title, cardTitle, section, body, meta, small) y un color del tema. */
export function Txt({ variant = 'body', tone = 'fg', style, ...rest }: TextProps & { variant?: Variant; tone?: Tone }) {
  const c = useColors();
  return <Text {...rest} style={[type[variant], { color: c[tone] }, style]} />;
}

// ---------- Botones ----------

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'soft' | 'danger' | 'ghost';
export type ButtonSize = 'md' | 'lg' | 'xl';

const HEIGHT: Record<ButtonSize, number> = { md: 44, lg: size.btnPro, xl: size.btn };

function buttonColors(c: Colors, v: ButtonVariant): { bg: string; fg: string; border?: string } {
  switch (v) {
    case 'primary':
      return { bg: c.accent, fg: c.accentFg };
    case 'secondary':
      return { bg: c.surface, fg: c.fg, border: c.line };
    case 'soft':
      return { bg: c.accentSoft, fg: c.accent };
    case 'danger':
      return { bg: c.danger, fg: c.onDanger };
    case 'ghost':
      return { bg: 'transparent', fg: c.fg };
    default:
      return { bg: c.surface2, fg: c.fg };
  }
}

export function Button({
  children,
  onPress,
  variant = 'quiet',
  size: s = 'md',
  icon,
  loading,
  disabled,
  full,
  accessibilityLabel,
  style,
}: {
  children?: ReactNode;
  onPress?: () => unknown;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  full?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const col = buttonColors(c, variant);
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      onPress={() => {
        if (variant === 'primary') void Haptics.selectionAsync().catch(() => undefined);
        void onPress?.();
      }}
      style={({ pressed }) => [
        styles.button,
        {
          height: HEIGHT[s],
          borderRadius: s === 'xl' ? radius.btn : 14,
          backgroundColor: col.bg,
          borderWidth: col.border ? StyleSheet.hairlineWidth : 0,
          borderColor: col.border,
          opacity: off ? 0.5 : pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
          paddingHorizontal: children ? (s === 'xl' ? 18 : 14) : 0,
          width: children ? (full ? '100%' : undefined) : HEIGHT[s],
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={col.fg} /> : icon}
      {children != null && (
        // En una fila angosta, la letra se achica un poco antes de cortarse («Guardar y salir»).
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ flexShrink: 1, color: col.fg, fontFamily: s === 'md' ? font.semibold : font.bold, fontSize: s === 'xl' ? 17 : s === 'lg' ? 16 : 15 }}>
          {children}
        </Text>
      )}
    </Pressable>
  );
}

// ---------- Contenedores ----------

export function Card({ children, style, padded = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  const c = useColors();
  return <View style={[{ backgroundColor: c.surface, borderRadius: radius.card, padding: padded ? 20 : 0, overflow: 'hidden' }, style]}>{children}</View>;
}

/**
 * Pantalla con el fondo de la app, márgenes seguros y desplazamiento. Con `onRefresh`, deslizar hacia abajo recarga
 * (como en la web, src/components/PullToRefresh.tsx).
 */
export function Screen({
  children,
  onRefresh,
  refreshing = false,
  scroll = true,
  edges = ['top'],
  contentStyle,
}: {
  children: ReactNode;
  onRefresh?: () => unknown;
  refreshing?: boolean;
  scroll?: boolean;
  edges?: Edge[];
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: c.bg }}>
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.content, contentStyle]}
          refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={c.accent} colors={[c.accent]} /> : undefined}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.section}>
      <Txt variant="section" accessibilityRole="header">
        {title}
      </Txt>
      {action}
    </View>
  );
}

/** El cuadrito del ícono de una fila (fondo suave del color de la app). */
export function RowIcon({ children }: { children: ReactNode }) {
  const c = useColors();
  return <View style={[styles.rowIcon, { backgroundColor: c.accentSoft }]}>{children}</View>;
}

/** Fila tocable: ícono, título, línea de abajo y flecha (src/components/ui.tsx ListRow). */
export function ListRow({
  title,
  subtitle,
  icon,
  right,
  onPress,
  chevron = true,
  accessibilityLabel,
}: {
  title: string;
  subtitle?: string | null;
  icon?: ReactNode;
  right?: ReactNode;
  onPress?: () => unknown;
  chevron?: boolean;
  accessibilityLabel?: string;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}. ${subtitle}` : title)}
      disabled={!onPress}
      onPress={() => void onPress?.()}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.surface2 : 'transparent' }]}
    >
      {icon}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="bodyStrong" numberOfLines={1}>
          {title}
        </Txt>
        {!!subtitle && (
          <Txt variant="meta" tone="muted" numberOfLines={2}>
            {subtitle}
          </Txt>
        )}
      </View>
      {right}
      {onPress && chevron && <ChevronRight size={18} color={c.faint} />}
    </Pressable>
  );
}

export function Divider({ inset = 0 }: { inset?: number }) {
  const c = useColors();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.line, marginLeft: inset }} />;
}

// ---------- Campos ----------

export function Field({ label, hint, error, children }: { label: string; hint?: string | null; error?: boolean; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Txt variant="bodyStrong" tone="fg2">
        {label}
      </Txt>
      {children}
      {!!hint && (
        <Txt variant="meta" tone={error ? 'danger' : 'muted'} accessibilityLiveRegion={error ? 'polite' : undefined}>
          {hint}
        </Txt>
      )}
    </View>
  );
}

export const Input = forwardRef<ComponentRef<typeof TextInput>, TextInputProps & { invalid?: boolean }>(function Input({ style, invalid, ...rest }, ref) {
  const c = useColors();
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={c.faint}
      {...rest}
      style={[
        styles.input,
        { backgroundColor: c.surface2, color: c.fg, borderColor: invalid ? c.danger : 'transparent' },
        style as StyleProp<TextStyle>,
      ]}
    />
  );
});

/** Selector de dos o tres opciones (Entrar / Crear cuenta, Lite / Pro…). */
export function Segmented<K extends string>({ options, value, onChange, label }: { options: { key: K; label: string }[]; value: K; onChange: (k: K) => void; label: string }) {
  const c = useColors();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[styles.segmented, { backgroundColor: c.surface2 }]}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.key)}
            style={[styles.segment, on && { backgroundColor: c.segOn, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } }]}
          >
            <Txt variant="bodyStrong" tone={on ? 'fg' : 'muted'}>
              {o.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------- Estados ----------

export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  const c = useColors();
  return (
    <View style={[styles.empty, { borderColor: c.line }]}>
      {icon && <View style={[styles.emptyIcon, { backgroundColor: c.accentSoft }]}>{icon}</View>}
      <Txt variant="bodyStrong" style={{ textAlign: 'center' }}>
        {title}
      </Txt>
      {!!text && (
        <Txt variant="meta" tone="muted" style={{ textAlign: 'center', maxWidth: 320 }}>
          {text}
        </Txt>
      )}
      {action && <View style={{ marginTop: 12 }}>{action}</View>}
    </View>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  const c = useColors();
  return (
    <View accessibilityRole="alert" style={[styles.note, { backgroundColor: c.dangerSoft }]}>
      <Txt variant="meta" tone="danger">
        {children}
      </Txt>
    </View>
  );
}

export function Loading({ label = 'Cargando' }: { label?: string }) {
  const c = useColors();
  return (
    <View style={[styles.loading, { backgroundColor: c.bg }]}>
      <LogoSpinner size={44} label={label} />
    </View>
  );
}

/** «‹ Atrás» arriba de una pantalla que se abrió encima de otra (sin historial, va a `fallback`). */
export function BackBar({ label, fallback = '/', right }: { label: string; fallback?: string; right?: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Atrás: ${label}`}
        hitSlop={8}
        onPress={() => (router.canGoBack() ? router.back() : router.navigate(fallback as never))}
        style={{ flexDirection: 'row', alignItems: 'center', height: 44, marginLeft: -6, flexShrink: 1 }}
      >
        <ChevronLeft size={24} color={c.accent} />
        <Txt tone="accent" variant="bodyStrong" numberOfLines={1}>
          {label}
        </Txt>
      </Pressable>
      {right}
    </View>
  );
}

/**
 * Hoja que sube desde abajo (como Sheet de la web): título, lo de adentro con desplazamiento y, si hay, el botón de
 * abajo fijo. Tocar afuera o la X la cierra.
 */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string | null;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    // El fondo aparece con un fundido y solo la hoja sube (con «slide» del Modal subiría también el fondo oscuro).
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable accessibilityLabel="Cerrar" onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} />
        <Animated.View entering={SlideInDown.duration(240)} style={[styles.sheet, { backgroundColor: c.bg, paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt variant="cardTitle" accessibilityRole="header">
                {title}
              </Txt>
              {!!subtitle && (
                <Txt variant="meta" tone="muted" numberOfLines={1}>
                  {subtitle}
                </Txt>
              )}
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" hitSlop={8} onPress={onClose} style={[styles.sheetClose, { backgroundColor: c.surface2 }]}>
              <X size={20} color={c.fg} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 12, paddingVertical: 16 }}>
            {children}
          </ScrollView>
          {footer}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Una opción para elegir (como un radio de la web): título, línea de abajo y la marca si está elegida. */
export function ChoiceRow({ title, subtitle, selected, onPress, icon }: { title: string; subtitle?: string | null; selected: boolean; onPress: () => void; icon?: ReactNode }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.choice, { backgroundColor: selected ? c.accentSoft : c.surface2, borderColor: selected ? c.accent : 'transparent' }]}
    >
      {icon}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="bodyStrong" tone={selected ? 'accent' : 'fg'}>
          {title}
        </Txt>
        {!!subtitle && (
          <Txt variant="meta" tone="muted">
            {subtitle}
          </Txt>
        )}
      </View>
      {selected && <Check size={20} color={c.accent} />}
    </Pressable>
  );
}

export function Badge({ children, tone = 'accent' }: { children: ReactNode; tone?: 'accent' | 'ok' | 'warn' | 'danger' | 'muted' }) {
  const c = useColors();
  const bg = tone === 'accent' ? c.accentSoft : tone === 'ok' ? c.okSoft : tone === 'warn' ? c.warnSoft : tone === 'danger' ? c.dangerSoft : c.surface2;
  const fg = tone === 'muted' ? c.muted : c[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontFamily: font.semibold, fontSize: 12 }}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  content: { padding: 16, paddingBottom: 32, gap: 16 },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  rowIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: size.row, paddingHorizontal: 16, paddingVertical: 10 },
  input: { height: 56, borderRadius: radius.btn, paddingHorizontal: 16, fontSize: 17, fontFamily: font.medium, borderWidth: 1.5 },
  segmented: { flexDirection: 'row', borderRadius: 14, padding: 4, gap: 4 },
  segment: { flex: 1, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: 8, borderWidth: 1, borderStyle: 'dashed', borderRadius: radius.card, paddingHorizontal: 24, paddingVertical: 40 },
  emptyIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  note: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  badge: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 20, maxHeight: '90%' },
  sheetClose: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, borderRadius: 16, borderWidth: 1.5, paddingHorizontal: 16, paddingVertical: 10 },
});
