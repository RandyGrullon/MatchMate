import { useEffect, useId, useState, type ComponentType, type ReactNode } from 'react';
import { AppState, View, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Line, LinearGradient, Path, Polygon, Polyline, Rect, Stop, Text as SvgText } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import type { BadgeLook, BadgeSize, BadgeState } from '@mm/badges/visual/types';
import { paintBadge, type PaintColors, type PaintedElement } from '@mm/components/badges/paint';
import { VIBRATE_AT_MS, unlockDuration, unlockFrame, type Frame } from '@mm/components/badges/motion';
import { useTheme } from '@/theme/theme';
import { font } from '@/theme/tokens';

/**
 * Una insignia dibujada con react-native-svg (Insignia y UnlockInsignia de la web, src/badges/visual): la misma escena
 * de la web (badgeModel) con los colores del tema de la app ya puestos (paint.ts de src/components/badges), y la
 * animación de desbloqueo con los mismos @keyframes de index.css cuadro por cuadro (motion.ts).
 */

type SvgComponent = ComponentType<Record<string, unknown> & { children?: ReactNode }>;

/** Las etiquetas que salen de la escena (también las de los íconos lucide). */
const TAGS = {
  path: Path,
  circle: Circle,
  ellipse: Ellipse,
  rect: Rect,
  line: Line,
  polyline: Polyline,
  polygon: Polygon,
  g: G,
  text: SvgText,
  linearGradient: LinearGradient,
  stop: Stop,
  clipPath: ClipPath,
} as unknown as Record<string, SvgComponent>;

/** El texto de la cinta con la letra de la app: centrado en su línea con `dy` (como la bola), sin `dominantBaseline`. */
function textProps(attrs: Record<string, string | number>): Record<string, string | number> {
  const { dominantBaseline: _baseline, fontWeight: _weight, fontFamily: _family, ...rest } = attrs;
  return { ...rest, fontFamily: font.heavy, dy: Number(attrs.fontSize ?? 0) * 0.35 };
}

function renderEl(el: PaintedElement, key: number, frame?: (el: PaintedElement) => Frame | null): ReactNode {
  const Comp = TAGS[el.tag];
  if (!Comp) return null;
  let props: Record<string, unknown> = el.tag === 'text' ? textProps(el.attrs) : { ...el.attrs };
  const f = frame && el.cls ? frame(el) : null;
  if (f) {
    if (f.opacity != null) props = { ...props, opacity: f.opacity * (typeof props.opacity === 'number' ? props.opacity : 1) };
    if (f.transform) props = { ...props, transform: f.transform };
  }
  return (
    <Comp key={key} {...props}>
      {el.text != null ? el.text : el.children?.map((c, i) => renderEl(c, i, frame))}
    </Comp>
  );
}

/** Los colores de la pantalla que usan las bloqueadas, el progreso y «Nueva». */
function usePaint(): { dark: boolean; colors: PaintColors } {
  const { colors: c, isDark } = useTheme();
  return { dark: isDark, colors: { surface: c.surface, surface2: c.surface2, muted: c.muted, line: c.line, accent: c.accent } };
}

const safeId = (raw: string) => raw.replace(/[^a-zA-Z0-9_-]/g, '');

/** El nombre (o que es decorativa) va en la caja: en la vista previa web el <svg> no entiende esas propiedades. */
const a11y = (label?: string) => (label ? { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel: label } : { 'aria-hidden': true });

export interface InsigniaProps {
  /** Cómo se ve: forma, metal, campo, emblema, cinta, puntos (sale de `lookOf` o del creador). */
  badge: BadgeLook;
  /** 24, 40, 64 o 128: cada uno con su nivel de detalle (§4.6). */
  size: BadgeSize;
  /** Por defecto `unlocked`. `locked`, `progress`, `review` y `hidden` solo los ve el dueño (§4.7). */
  state?: BadgeState;
  /** De 0 a 1, con `state="progress"`: el arco de afuera. */
  progress?: number;
  /** Puntos reales si no son `size`. */
  px?: number;
  /** Aire alrededor para que los anillos de `progress` y `new` queden dentro. */
  pad?: boolean;
  /** Nombre accesible («Constancia, oro, octubre 2026»); sin él es decorativa (el nombre va al lado). */
  label?: string;
  style?: StyleProp<ViewStyle>;
}

/** Una insignia quieta. */
export function Insignia({ badge, size, state = 'unlocked', progress, px, pad, label, style }: InsigniaProps) {
  const { dark, colors } = usePaint();
  const suffix = safeId(useId());
  const painted = paintBadge(badge, { size, state, progress, px, pad, dark, colors, suffix });
  const w = px ?? size;
  return (
    <View style={[{ width: w, height: w }, style]} {...a11y(label)}>
      <Svg viewBox={painted.viewBox} width={w} height={w}>
        {painted.defs.length > 0 && <Defs>{painted.defs.map((d, i) => renderEl(d, i))}</Defs>}
        {painted.nodes.map((n, i) => renderEl(n, i))}
      </Svg>
    </View>
  );
}

/** Los milisegundos desde que se montó, cuadro por cuadro, hasta `duration`. */
function useElapsed(duration: number): number {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    const start = Date.now();
    let raf = 0;
    const tick = () => {
      const t = Math.min(duration, Date.now() - start);
      setMs(t);
      if (t < duration) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [duration]);
  return ms;
}

export interface UnlockInsigniaProps {
  badge: BadgeLook;
  /** Puntos del cuadro (por defecto 240). La insignia ocupa 128/200; el resto es para las partículas. */
  px?: number;
  label?: string;
  /** Solo el fundido (como con movimiento reducido). */
  still?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * La animación de desbloqueo (§4.8): de la silueta a la insignia con un brinco, la banda de brillo, la cinta que se
 * despliega y las partículas del metal; el teléfono vibra a los 650 ms. Con movimiento reducido (o la app en segundo
 * plano): solo un fundido de 200 ms, sin vibrar. Para repetirla, cambiar su `key`.
 */
export function UnlockInsignia({ badge, px = 240, label, still, style }: UnlockInsigniaProps) {
  const { dark, colors } = usePaint();
  const reduced = useReducedMotion();
  const [calm] = useState(() => !!still || reduced || AppState.currentState !== 'active');
  const ms = useElapsed(unlockDuration(calm));
  const suffix = safeId(useId());

  useEffect(() => {
    if (calm) return;
    const t = setTimeout(() => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined), VIBRATE_AT_MS);
    return () => clearTimeout(t);
  }, [calm]);

  const painted = paintBadge(badge, { size: 128, px, animate: true, dark, colors, suffix });
  const frame = (el: PaintedElement) => unlockFrame(el, ms, calm);
  return (
    <View style={[{ width: px, height: px }, style]} {...a11y(label)}>
      <Svg viewBox={painted.viewBox} width={px} height={px}>
        {painted.defs.length > 0 && <Defs>{painted.defs.map((d, i) => renderEl(d, i))}</Defs>}
        {painted.nodes.map((n, i) => renderEl(n, i, frame))}
      </Svg>
    </View>
  );
}
