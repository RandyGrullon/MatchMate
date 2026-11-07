import { useId, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { BALL_COLORS } from '@mm/lib/balls';
import { cleanColor, readableOn } from '@mm/lib/ballDesign';
import { BOARD_EDGE, BOARD_HUES, boardColor, colorSpot, grayColor, sliderFraction, sliderNudge, sliderValue, snapToStep } from '@mm/components/balls/controls';
import { AUTO_COLOR_LABEL, hexHint, isOwnColor } from '@mm/components/balls/designer';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { Input, Txt } from '../ui';
import { useScrollLock } from './DesignerSheet';

/**
 * Los controles del creador de bolas (BallDesigner.tsx) que en la web son del navegador: el deslizable (<input
 * type="range">), los círculos de color de la paleta, el código del color y «Otro color» (<input type="color">: en el
 * teléfono no hay un selector del sistema, así que es un tablero de tono y brillo y una tira de grises para tocar o
 * arrastrar). Las cuentas están en src/components/balls/controls.ts.
 */

/** Lo que sigue a un dedo sobre un control: dónde empezó (en el control) y dónde va en la pantalla. */
function useDrag(onPoint: (x: number, y: number) => void) {
  const lock = useScrollLock();
  const start = useRef({ x: 0, y: 0, pageX: 0, pageY: 0 });
  const point = (e: GestureResponderEvent) => {
    const s = start.current;
    onPoint(s.x + e.nativeEvent.pageX - s.pageX, s.y + e.nativeEvent.pageY - s.pageY);
  };
  const end = () => lock(false);
  return {
    onStartShouldSetResponder: () => true,
    // Mientras se arrastra, la hoja no se lo quita (ni se desplaza: useScrollLock).
    onResponderTerminationRequest: () => false,
    onResponderGrant: (e: GestureResponderEvent) => {
      const { locationX, locationY, pageX, pageY } = e.nativeEvent;
      start.current = { x: locationX, y: locationY, pageX, pageY };
      lock(true);
      onPoint(locationX, locationY);
    },
    onResponderMove: point,
    onResponderRelease: end,
    onResponderTerminate: end,
  };
}

// ---------- El deslizable ----------

const THUMB = 26;

/** Un control deslizable con su nombre y su valor (44 de alto para el dedo; el Slider de la web). */
export function DesignSlider({
  label,
  value,
  min,
  max,
  step,
  text,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  text: string;
  onChange: (v: number) => void;
}) {
  const c = useColors();
  const [width, setWidth] = useState(0);
  const frac = sliderFraction(value, min, max);
  const set = (v: number) => {
    if (v !== value) onChange(v);
  };
  // El centro de la bolita va de THUMB / 2 a width - THUMB / 2.
  const drag = useDrag((x) => set(sliderValue(x - THUMB / 2, width - THUMB, min, max, step)));
  const nudge = sliderNudge(min, max, step);
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <Txt variant="small" tone="muted">
          {label}
        </Txt>
        <Txt variant="small" tone="muted" style={{ fontFamily: font.regular, fontVariant: ['tabular-nums'] }}>
          {text}
        </Txt>
      </View>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(frac * 100), text }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => set(snapToStep(value + (e.nativeEvent.actionName === 'increment' ? nudge : -nudge), min, max, step))}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        {...drag}
        style={{ height: 44, justifyContent: 'center' }}
      >
        <View style={{ pointerEvents: 'none', height: 6, borderRadius: 3, marginHorizontal: THUMB / 2, backgroundColor: c.line, overflow: 'hidden' }}>
          <View style={{ height: 6, width: `${frac * 100}%`, backgroundColor: c.accent }} />
        </View>
        {width > 0 && (
          <View
            style={{
              pointerEvents: 'none',
              position: 'absolute',
              left: frac * (width - THUMB),
              width: THUMB,
              height: THUMB,
              borderRadius: THUMB / 2,
              backgroundColor: c.accent,
              borderWidth: 3,
              borderColor: c.surface,
              shadowColor: '#000',
              shadowOpacity: 0.2,
              shadowRadius: 3,
              shadowOffset: { width: 0, height: 1 },
              elevation: 2,
            }}
          />
        )}
      </View>
    </View>
  );
}

// ---------- Los colores ----------

/**
 * Un círculo de color (Swatch de la web). El borde oscuro se ve sobre el fondo claro (una blanca) y el aro claro sobre
 * el oscuro (una negra): así se ven todos en los dos temas.
 */
export function Swatch({ color, size, children }: { color: string; size: number; children?: ReactNode }) {
  return (
    <View
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {/* La sombrita de adentro (abajo a la derecha) que la hace verse redonda. */}
      <View style={{ position: 'absolute', right: -size * 0.1, bottom: -size * 0.1, width: size * 0.75, height: size * 0.75, borderRadius: size, backgroundColor: 'rgba(0,0,0,0.16)' }} />
      {children != null && <Txt style={{ fontSize: 11, lineHeight: 13, fontFamily: font.bold, color: readableOn(color) }}>{children}</Txt>}
    </View>
  );
}

/** Un círculo de la paleta para elegir (44 de lado; el elegido, con su aro). */
function ColorChoice({ on, name, color, mark, onPress }: { on: boolean; name: string; color: string; mark?: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      accessibilityLabel={name}
      onPress={onPress}
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: on ? c.accentSoft : 'transparent',
        borderWidth: on ? 2 : 0,
        borderColor: c.accent,
      }}
    >
      <Swatch color={color} size={on ? 32 : 28}>
        {mark}
      </Swatch>
    </Pressable>
  );
}

/**
 * Elegir un color (ColorPicker de la web): la paleta de las bolas (y el automático, si hay), «Otro color» y el código
 * #rrggbb. `value` null = el automático (`auto` es cómo se ve).
 */
export function ColorPicker({ label, value, auto, onChange }: { label: string; value: string | null; auto?: string; onChange: (hex: string | null) => void }) {
  const shown = value ?? auto ?? '#000000';
  return (
    <View style={{ gap: 6 }}>
      <Txt variant="small" tone="muted">
        {label}
      </Txt>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
        {!!auto && <ColorChoice on={value == null} name={AUTO_COLOR_LABEL} color={auto} mark="A" onPress={() => onChange(null)} />}
        {BALL_COLORS.map((col) => (
          <ColorChoice key={col.hex} on={value === col.hex} name={col.label} color={col.hex} onPress={() => onChange(col.hex)} />
        ))}
      </View>
      <HexField value={shown} own={isOwnColor(value)} onChange={onChange} />
    </View>
  );
}

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

/**
 * Un color propio (HexField de la web): el botón de «Otro color» (con el color de ahora; abre y cierra el tablero) y el
 * código (#rrggbb o #rgb; se aplica cuando está completo).
 */
function HexField({ value, own, onChange }: { value: string; own: boolean; onChange: (hex: string) => void }) {
  const c = useColors();
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  const [board, setBoard] = useState(false);
  // Cambió desde afuera (la paleta, el tablero): el código lo muestra, salvo que sea lo que se está escribiendo.
  if (seen !== value) {
    setSeen(value);
    if (cleanColor(text) !== value) setText(value);
  }
  const bad = cleanColor(text) == null;
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Elegir otro color"
          accessibilityState={{ expanded: board }}
          onPress={() => setBoard((b) => !b)}
          style={({ pressed }) => ({
            width: 44,
            height: 44,
            borderRadius: 12,
            padding: 4,
            borderWidth: own || board ? 2 : 1,
            borderColor: own || board ? c.accent : c.line,
            backgroundColor: c.surface,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <View style={{ flex: 1, borderRadius: 8, backgroundColor: value, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.2)' }} />
        </Pressable>
        <Input
          value={text}
          maxLength={7}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          accessibilityLabel="Código del color (#rrggbb)"
          placeholder="#1d4ed8"
          invalid={bad}
          onChangeText={(t) => {
            setText(t);
            const col = cleanColor(t);
            if (col) onChange(col);
          }}
          onBlur={() => {
            if (bad) setText(value);
          }}
          style={{ height: 44, width: 128, borderRadius: 12, paddingHorizontal: 12, fontSize: 15, fontFamily: MONO }}
        />
        <Txt variant="small" tone={bad ? 'danger' : 'muted'} style={{ flexShrink: 1, fontFamily: font.regular }}>
          {hexHint(bad)}
        </Txt>
      </View>
      {board && <ColorBoard value={value} onChange={onChange} />}
    </View>
  );
}

const BOARD_HEIGHT = 150;
const GRAYS_HEIGHT = 32;
const MARK = 22;

/** La marca del color de ahora (un aro blanco con borde oscuro, se ve sobre cualquier color). */
function Mark({ left, top }: { left: number; top: number }) {
  return (
    <View
      style={{
        pointerEvents: 'none',
        position: 'absolute',
        left: left - MARK / 2,
        top: top - MARK / 2,
        width: MARK,
        height: MARK,
        borderRadius: MARK / 2,
        borderWidth: 3,
        borderColor: '#ffffff',
        shadowColor: '#000',
        shadowOpacity: 0.6,
        shadowRadius: 1.5,
        shadowOffset: { width: 0, height: 0 },
        elevation: 2,
      }}
    />
  );
}

/**
 * «Otro color» en el teléfono (el selector del navegador de la web): el tablero de tono (de izquierda a derecha) y
 * brillo (claro arriba, oscuro abajo) y la tira de grises; tocar o arrastrar pone ese color enseguida, y el aro marca el
 * de ahora. Es lo que pinta controls.ts (boardColor y grayColor): lo que se toca es lo que se ve. Para el lector de
 * pantalla está el código del color, al lado. Fuera de DesignerSheet no traba el desplazamiento al arrastrar.
 */
export function ColorBoard({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const [width, setWidth] = useState(0);
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const spot = colorSpot(value);
  const pick = (hex: string) => {
    if (hex !== value) onChange(hex);
  };
  const clampX = (x: number) => (width > 0 ? Math.min(1, Math.max(0, x / width)) : 0);
  const boardDrag = useDrag((x, y) => pick(boardColor(clampX(x), Math.min(1, Math.max(0, y / BOARD_HEIGHT)))));
  const grayDrag = useDrag((x) => pick(grayColor(clampX(x))));
  const hue = `mm-hue-${id}`;
  const shade = `mm-shade-${id}`;
  const gray = `mm-gray-${id}`;
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ gap: 8 }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View {...boardDrag} style={{ height: BOARD_HEIGHT, borderRadius: 12, overflow: 'hidden' }}>
        {width > 0 && (
          <Svg width={width} height={BOARD_HEIGHT} style={{ pointerEvents: 'none' }}>
            <Defs>
              <LinearGradient id={hue} x1="0" y1="0" x2="1" y2="0">
                {BOARD_HUES.map((h, i) => (
                  <Stop key={i} offset={i / (BOARD_HUES.length - 1)} stopColor={h} />
                ))}
              </LinearGradient>
              <LinearGradient id={shade} x1="0" y1="0" x2="0" y2="1">
                <Stop offset={0} stopColor="#ffffff" stopOpacity={BOARD_EDGE} />
                <Stop offset={0.5} stopColor="#ffffff" stopOpacity={0} />
                <Stop offset={0.5} stopColor="#000000" stopOpacity={0} />
                <Stop offset={1} stopColor="#000000" stopOpacity={BOARD_EDGE} />
              </LinearGradient>
            </Defs>
            <Rect width={width} height={BOARD_HEIGHT} fill={`url(#${hue})`} />
            <Rect width={width} height={BOARD_HEIGHT} fill={`url(#${shade})`} />
          </Svg>
        )}
        {spot?.on === 'board' && width > 0 && <Mark left={spot.x * width} top={spot.y * BOARD_HEIGHT} />}
      </View>
      <View {...grayDrag} style={{ height: GRAYS_HEIGHT, borderRadius: 10, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.2)' }}>
        {width > 0 && (
          <Svg width={width} height={GRAYS_HEIGHT} style={{ pointerEvents: 'none' }}>
            <Defs>
              <LinearGradient id={gray} x1="0" y1="0" x2="1" y2="0">
                <Stop offset={0} stopColor="#ffffff" />
                <Stop offset={1} stopColor="#000000" />
              </LinearGradient>
            </Defs>
            <Rect width={width} height={GRAYS_HEIGHT} fill={`url(#${gray})`} />
          </Svg>
        )}
        {spot?.on === 'gray' && width > 0 && <Mark left={spot.x * width} top={GRAYS_HEIGHT / 2} />}
      </View>
    </View>
  );
}
