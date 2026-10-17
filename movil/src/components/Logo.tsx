import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useSharedValue, withDelay, withRepeat, withTiming, ReduceMotion } from 'react-native-reanimated';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { DUO_HEAD_R, DUO_HEADS, DUO_M, DUO_RX, DUO_STROKE } from '@mm/components/splash/brand';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/**
 * Logo de MatchMate («Dúo»), el mismo dibujo de la web (src/components/splash/brand.ts): dos compañeros tomados de la
 * mano forman la M; las cabezas son los puntos. Toma el color de la app (el del deporte activo).
 */
export function Logo({ size = 28 }: { size?: number }) {
  const c = useColors();
  // Decorativo: lo de accesibilidad va en el View (el <svg> de la web no conoce esas props).
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} viewBox="0 0 512 512">
        <Rect width={512} height={512} rx={DUO_RX} fill={c.accent} />
        <Path d={DUO_M} fill="none" stroke={c.accentFg} strokeWidth={DUO_STROKE} strokeLinecap="round" strokeLinejoin="round" />
        {DUO_HEADS.map(([x, y]) => (
          <Circle key={x} cx={x} cy={y} r={DUO_HEAD_R} fill={c.accentFg} />
        ))}
      </Svg>
    </View>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Una cabeza que salta (la segunda, un poco después): la carga de la web (LogoSpinner). Quieta con movimiento reducido. */
function Head({ x, y, delay, fill }: { x: number; y: number; delay: number; fill: string }) {
  const hop = useSharedValue(0);
  useEffect(() => {
    hop.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 550, easing: Easing.bezier(0.33, 0.66, 0.66, 1), reduceMotion: ReduceMotion.System }), -1, true),
    );
  }, [delay, hop]);
  const props = useAnimatedProps(() => ({ cy: y - hop.value * DUO_HEAD_R * 1.16 }));
  return <AnimatedCircle cx={x} r={DUO_HEAD_R} fill={fill} animatedProps={props} />;
}

export function LogoSpinner({ size = 40, label = 'Cargando' }: { size?: number; label?: string }) {
  const c = useColors();
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label}>
      <Svg width={size} height={size} viewBox="0 0 512 512">
        <Rect width={512} height={512} rx={DUO_RX} fill={c.accent} />
        <Path d={DUO_M} fill="none" stroke={c.accentFg} strokeWidth={DUO_STROKE} strokeLinecap="round" strokeLinejoin="round" />
        {DUO_HEADS.map(([x, y], i) => (
          <Head key={x} x={x} y={y} delay={i * 180} fill={c.accentFg} />
        ))}
      </Svg>
    </View>
  );
}

/** «Match» en el color del texto y «Mate» en el de la app. */
export function Wordmark({ size = 20 }: { size?: number }) {
  const c = useColors();
  return (
    <Text accessibilityRole="header" style={{ fontFamily: font.heavy, fontSize: size, letterSpacing: -0.4, color: c.fg }}>
      Match<Text style={{ color: c.accent }}>Mate</Text>
    </Text>
  );
}

export function LogoLockup({ size = 28 }: { size?: number }) {
  return (
    <View accessible accessibilityLabel="MatchMate" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Logo size={size} />
      <Wordmark size={size * 0.72} />
    </View>
  );
}
