/**
 * Piezas chicas del creador de insignias en la app (parts.tsx de la web, src/components/badges/maker): el ícono tal
 * cual, el contorno de una forma, los chips, el puntito de color, el contador de letras, la etiqueta de un campo con
 * su aviso, y la vista previa en claro y en oscuro.
 */
import { useId, type ComponentType, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Line, LinearGradient, Path, Polygon, Polyline, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { iconNode } from '@mm/badges/visual/icons';
import { SHAPES } from '@mm/badges/visual/geometry';
import { badgeLabel } from '@mm/badges/visual/period';
import type { BadgeLook, BadgeShape, BadgeSize } from '@mm/badges/visual/types';
import { paintBadge, type PaintedElement } from '@mm/components/badges/paint';
import { Txt } from '@/components/ui';
import { Insignia } from '@/components/badges/Insignia';
import { useColors } from '@/theme/theme';
import { dark as darkColors, font, light as lightColors } from '@/theme/tokens';

type SvgComponent = ComponentType<Record<string, unknown> & { children?: ReactNode }>;

/** Las etiquetas de los íconos de la grilla de 24 (las de lucide). */
const ICON_TAGS = { path: Path, circle: Circle, ellipse: Ellipse, rect: Rect, line: Line, polyline: Polyline, polygon: Polygon } as unknown as Record<string, SvgComponent>;

/** Un ícono de la grilla de 24 con el trazo del color que se le pasa (los botones del selector). */
export function IconGlyph({ icon, size = 24, color }: { icon: string; size?: number; color: string }) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <G fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {iconNode(icon).map(([tag, attrs], i) => {
          const Comp = ICON_TAGS[tag];
          return Comp ? <Comp key={i} {...attrs} /> : null;
        })}
      </G>
    </Svg>
  );
}

/** El contorno de una forma (los chips de «Forma»). */
export function ShapeOutline({ shape, size = 18, color }: { shape: BadgeShape; size?: number; color: string }) {
  return (
    <Svg viewBox="-4 -4 136 136" width={size} height={size} aria-hidden>
      <Path d={SHAPES[shape].outer} fill="none" stroke={color} strokeWidth={10} strokeLinejoin="round" />
    </Svg>
  );
}

/** Un chip que se prende (44 de alto para el dedo): un ícono o un puntito, el texto y, si hay, el texto chico. */
export function Chip({
  on,
  onPress,
  text,
  sub,
  left,
  disabled,
  accessibilityLabel,
}: {
  on: boolean;
  onPress: () => void;
  text: string;
  sub?: string | null;
  left?: ReactNode;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on, disabled: !!disabled }}
      accessibilityLabel={accessibilityLabel ?? (sub ? `${text} ${sub}` : text)}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          borderColor: on ? c.accent : c.line,
          backgroundColor: on ? c.accentSoft : pressed ? c.surface2 : 'transparent',
          opacity: disabled ? 0.5 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
      ]}
    >
      {left}
      <Txt variant="meta" style={{ fontFamily: font.medium, color: on ? c.accent : c.fg }}>
        {text}
      </Txt>
      {!!sub && (
        <Txt variant="small" tone="muted" style={{ fontFamily: font.regular }}>
          {sub}
        </Txt>
      )}
    </Pressable>
  );
}

/** Los chips en filas que se doblan (`center`: centrados, como en «Todavía no hay insignias de la liga»). */
export function Chips({ children, label, center }: { children: ReactNode; label?: string; center?: boolean }) {
  return (
    <View accessibilityLabel={label} style={[styles.chips, center && { justifyContent: 'center' }]}>
      {children}
    </View>
  );
}

/** Un puntito de color (las opciones de «Color»). */
export const Dot = ({ color }: { color: string }) => <View aria-hidden style={[styles.dot, { backgroundColor: color }]} />;

/** «12/28» al lado de la etiqueta; en rojo si se pasa. */
export function Counter({ value, max }: { value: number; max: number }) {
  return (
    <Txt variant="small" tone={value > max ? 'danger' : 'muted'} style={{ fontFamily: font.regular, fontVariant: ['tabular-nums'] }}>
      {`${value}/${max}`}
    </Txt>
  );
}

/** La etiqueta chica de un grupo o un campo, con el contador a la derecha. */
export function FieldLabel({ label, count }: { label: string; count?: ReactNode }) {
  return (
    <View style={styles.label}>
      <Txt variant="small" tone="muted" style={{ flexShrink: 1 }}>
        {label}
      </Txt>
      {count}
    </View>
  );
}

/** El aviso de un campo (lo lee el lector de pantalla al aparecer). */
export function FieldError({ text }: { text?: string | null }) {
  if (!text) return null;
  return (
    <Txt variant="small" tone="danger" accessibilityLiveRegion="polite" style={{ fontFamily: font.medium }}>
      {text}
    </Txt>
  );
}

/** Un grupo del editor: la etiqueta, el contenido y su aviso. */
export function FieldBox({ label, count, error, hint, children }: { label: string; count?: ReactNode; error?: string | null; hint?: string | null; children: ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <FieldLabel label={label} count={count} />
      {children}
      {!!hint && (
        <Txt variant="small" tone="muted" style={{ fontFamily: font.regular }}>
          {hint}
        </Txt>
      )}
      <FieldError text={error} />
    </View>
  );
}

// ---------- Vista previa en claro y en oscuro ----------

const SVG_TAGS = {
  ...ICON_TAGS,
  g: G,
  text: SvgText,
  linearGradient: LinearGradient,
  stop: Stop,
  clipPath: ClipPath,
} as unknown as Record<string, SvgComponent>;

/** El texto de la cinta con la letra de la app (como Insignia.tsx). */
function textProps(attrs: Record<string, string | number>): Record<string, string | number> {
  const { dominantBaseline: _baseline, fontWeight: _weight, fontFamily: _family, ...rest } = attrs;
  return { ...rest, fontFamily: font.heavy, dy: Number(attrs.fontSize ?? 0) * 0.35 };
}

function renderEl(el: PaintedElement, key: number): ReactNode {
  const Comp = SVG_TAGS[el.tag];
  if (!Comp) return null;
  const props = el.tag === 'text' ? textProps(el.attrs) : el.attrs;
  return (
    <Comp key={key} {...props}>
      {el.text != null ? el.text : el.children?.map((c, i) => renderEl(c, i))}
    </Comp>
  );
}

/**
 * Una insignia siempre en el tema que se le pide (claro u oscuro), sin importar el de la pantalla: la vista previa del
 * editor (en la web, `badgeThemeVars` en cada tarjeta). Insignia.tsx sigue el tema de la app.
 */
export function ThemedInsignia({ look, size, dark, label }: { look: BadgeLook; size: BadgeSize; dark: boolean; label?: string }) {
  const suffix = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const t = dark ? darkColors : lightColors;
  const painted = paintBadge(look, { size, dark, colors: { surface: t.surface, surface2: t.surface2, muted: t.muted, line: t.line, accent: t.accent }, suffix });
  return (
    <View style={{ width: size, height: size }} {...(label ? { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel: label } : { 'aria-hidden': true })}>
      <Svg viewBox={painted.viewBox} width={size} height={size}>
        {painted.defs.length > 0 && <Defs>{painted.defs.map((d, i) => renderEl(d, i))}</Defs>}
        {painted.nodes.map((n, i) => renderEl(n, i))}
      </Svg>
    </View>
  );
}

/**
 * La vista previa del editor (§5.4): la insignia a 128 sobre una tarjeta clara y una oscura lado a lado (siempre en
 * esos temas), y abajo la fila a 24, 40 y 64. No es una región viva: cambia con cada letra.
 */
export function PreviewPair({ look, name, sub }: { look: BadgeLook; name: string; sub: string }) {
  const c = useColors();
  const sizes: BadgeSize[] = [24, 40, 64];
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {([false, true] as const).map((isDark) => {
          const t = isDark ? darkColors : lightColors;
          const mode = isDark ? 'oscuro' : 'claro';
          return (
            <View key={mode} style={[styles.previewCard, { backgroundColor: t.surface, borderColor: c.line }]}>
              <Txt style={[styles.previewMode, { color: t.muted }]}>{isDark ? 'Oscuro' : 'Claro'}</Txt>
              <ThemedInsignia look={look} size={128} dark={isDark} label={`${badgeLabel(name, look)}, vista previa en modo ${mode}`} />
              <View style={{ alignSelf: 'stretch', alignItems: 'center' }}>
                <Txt numberOfLines={1} style={{ color: t.fg, fontFamily: font.bold, fontSize: 14, lineHeight: 19 }}>
                  {name}
                </Txt>
                <Txt numberOfLines={1} style={{ color: t.muted, fontFamily: font.regular, fontSize: 12, lineHeight: 16 }}>
                  {sub}
                </Txt>
              </View>
            </View>
          );
        })}
      </View>
      <View accessibilityLabel="Tamaños" style={styles.sizes}>
        {sizes.map((s) => (
          <View key={s} style={{ alignItems: 'center', gap: 4 }}>
            <Insignia badge={look} size={s} />
            <Txt tone="muted" style={{ fontSize: 11, lineHeight: 14, fontVariant: ['tabular-nums'] }}>{`${s} px`}</Txt>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.1)' },
  label: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  previewCard: { flex: 1, minWidth: 0, alignItems: 'center', gap: 6, borderRadius: 16, borderWidth: 1, paddingHorizontal: 6, paddingTop: 8, paddingBottom: 10 },
  previewMode: { alignSelf: 'flex-start', paddingHorizontal: 4, fontSize: 11, lineHeight: 14, letterSpacing: 0.6, fontFamily: font.semibold, textTransform: 'uppercase' },
  sizes: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 20 },
});
