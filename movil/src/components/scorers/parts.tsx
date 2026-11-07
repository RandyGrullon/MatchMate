/**
 * Piezas chicas de la hoja «Anotadores» y de Reportes (las de la web: los botones de 44 px de cada fila, la fila de una
 * persona, el buscador con «Borrar búsqueda» y los botones redondos para mandar un link: Copiar enlace, WhatsApp y Más).
 */
import type { ReactNode } from 'react';
import { ActivityIndicator, Linking, Pressable, Share, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ellipsis, Link2, MessageCircle, Search, X } from 'lucide-react-native';
import { whatsappShareUrl } from '@mm/components/match/format';
import { toast } from '@/components/feedback';
import { LogoSpinner } from '@/components/Logo';
import { Avatar } from '@/components/social/Avatar';
import { Input, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font, radius } from '@/theme/tokens';

export type PillVariant = 'primary' | 'soft' | 'quiet' | 'ghost';

/**
 * Un botón de 44 px de alto (los `h-11` de la web): principal, suave (el color de la app), gris o sin fondo; `danger`
 * pone la letra en rojo (Quitar, Quitar link, Borrar comentario). Con `loading` gira en vez del ícono.
 */
export function PillButton({
  children,
  icon,
  variant = 'quiet',
  danger,
  loading,
  disabled,
  onPress,
  accessibilityLabel,
  flex,
}: {
  children: ReactNode;
  icon?: (color: string) => ReactNode;
  variant?: PillVariant;
  danger?: boolean;
  loading?: boolean;
  disabled?: boolean;
  onPress?: () => unknown;
  accessibilityLabel?: string;
  /** Ocupa lo que quede de la fila (los dos botones del link). */
  flex?: boolean;
}) {
  const c = useColors();
  const bg = variant === 'primary' ? c.accent : variant === 'soft' ? c.accentSoft : variant === 'quiet' ? c.surface2 : 'transparent';
  const fg = danger ? c.danger : variant === 'primary' ? c.accentFg : variant === 'soft' ? c.accent : c.fg;
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      onPress={() => void onPress?.()}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: bg, opacity: disabled && !loading ? 0.5 : pressed ? 0.85 : 1, borderRadius: variant === 'soft' || variant === 'primary' ? radius.pill : 14 },
        flex && { flex: 1 },
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={fg} /> : icon?.(fg)}
      <Txt numberOfLines={1} style={{ color: fg, fontFamily: font.semibold, fontSize: 15, flexShrink: 1 }}>
        {children}
      </Txt>
    </Pressable>
  );
}

/** Una persona en una lista de la hoja: sus iniciales, su nombre, la línea de abajo (su @usuario y las marcas) y sus botones. */
export function PersonRow({ name, sub, marks, action }: { name: string; sub?: string | null; marks?: ReactNode; action: ReactNode }) {
  return (
    <View style={styles.person}>
      <Avatar name={name} size={36} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Txt numberOfLines={1} style={{ fontSize: 15, fontFamily: font.semibold, letterSpacing: -0.15 }}>
          {name}
        </Txt>
        {(!!sub || !!marks) && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
            {!!sub && (
              <Txt variant="small" tone="muted" numberOfLines={1}>
                {sub}
              </Txt>
            )}
            {marks}
          </View>
        )}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 }}>{action}</View>
    </View>
  );
}

/** La caja de una lista (las filas con una línea entre cada una). */
export function ListBox({ children, dim }: { children: ReactNode; dim?: boolean }) {
  const c = useColors();
  return <View style={[styles.box, { backgroundColor: c.surface, opacity: dim ? 0.7 : 1 }]}>{children}</View>;
}

/** Una línea en gris dentro de una caja (la lista vacía, el link con menores). */
export function NoteBox({ children, center }: { children: ReactNode; center?: boolean }) {
  const c = useColors();
  return (
    <View style={[styles.note, { backgroundColor: c.surface }]}>
      <Txt variant="meta" tone="muted" style={center ? { textAlign: 'center' } : undefined}>
        {children}
      </Txt>
    </View>
  );
}

/** Mientras carga una lista dentro de la hoja. */
export function ListLoading({ label = 'Cargando' }: { label?: string }) {
  return (
    <View style={{ paddingVertical: 24, alignItems: 'center' }}>
      <LogoSpinner size={32} label={label} />
    </View>
  );
}

/** El buscador de la hoja: la lupa, lo escrito y la X para borrarlo. */
export function SearchBox({ value, onChange, label, placeholder }: { value: string; onChange: (v: string) => void; label: string; placeholder: string }) {
  const c = useColors();
  return (
    <View style={{ justifyContent: 'center' }}>
      <Search size={18} color={c.muted} style={{ position: 'absolute', left: 14, zIndex: 1 }} />
      <Input
        value={value}
        onChangeText={(t) => onChange(t.slice(0, 60))}
        placeholder={placeholder}
        accessibilityLabel={label}
        returnKeyType="search"
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={60}
        style={{ height: 48, fontSize: 16, paddingLeft: 42, paddingRight: 48 }}
      />
      {!!value && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Borrar búsqueda"
          onPress={() => onChange('')}
          style={{ position: 'absolute', right: 2, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <X size={18} color={c.muted} />
        </Pressable>
      )}
    </View>
  );
}

function RoundButton({ label, icon, bg, onPress }: { label: string; icon: ReactNode; bg: string; onPress: () => unknown }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => void onPress()} style={({ pressed }) => [styles.round, { opacity: pressed ? 0.85 : 1 }]}>
      <View style={[styles.roundIcon, { backgroundColor: bg }]}>{icon}</View>
      <Txt variant="small" tone="fg2">
        {label}
      </Txt>
    </Pressable>
  );
}

/**
 * Mandar un link (ShareRow de la web): la línea de arriba y «Copiar enlace», «WhatsApp» (con el texto y el link) y
 * «Más» (la hoja de compartir del teléfono).
 */
export function ShareLinkRow({ url, title, text, hint }: { url: string; title: string; text: string; hint?: string | null }) {
  const c = useColors();
  async function copy() {
    try {
      await Clipboard.setStringAsync(url);
      toast('Link copiado');
    } catch {
      toast('No se pudo copiar el link', 'error');
    }
  }
  async function more() {
    try {
      await Share.share({ title: `${title} · MatchMate`, message: `${text}: ${url}` });
    } catch {
      // cancelado
    }
  }
  return (
    <View style={{ gap: 8 }}>
      {!!hint && (
        <Txt variant="small" tone="muted" style={{ textAlign: 'center' }}>
          {hint}
        </Txt>
      )}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16 }}>
        <RoundButton label="Copiar enlace" icon={<Link2 size={20} color={c.fg} />} bg={c.surface2} onPress={copy} />
        <RoundButton
          label="WhatsApp"
          icon={<MessageCircle size={20} color={c.bg} />}
          bg={c.ok}
          onPress={() => Linking.openURL(whatsappShareUrl(`${text}: ${url}`)).catch(() => undefined)}
        />
        <RoundButton label="Más" icon={<Ellipsis size={20} color={c.fg} />} bg={c.surface2} onPress={more} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 14 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 8, paddingLeft: 16, paddingRight: 10 },
  box: { borderRadius: 18, overflow: 'hidden' },
  note: { borderRadius: 18, paddingHorizontal: 16, paddingVertical: 14 },
  round: { alignItems: 'center', gap: 6, minWidth: 72 },
  roundIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
});
