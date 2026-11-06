import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useColors } from '@/theme/theme';

/**
 * El color de la bola (BallDot de la web): con borde para que una blanca o una negra se vea en el tema claro y en el
 * oscuro; sin color, un círculo punteado.
 */
export function BallDot({ color, size = 16 }: { color: string | null | undefined; size?: number }) {
  const c = useColors();
  return (
    <View
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderStyle: color ? 'solid' : 'dashed',
        borderColor: color ? c.line : c.muted,
        backgroundColor: color ?? 'transparent',
        overflow: 'hidden',
      }}
    >
      {/* La sombrita de adentro (abajo a la derecha) que la hace verse redonda. */}
      {!!color && <View style={{ position: 'absolute', right: -size * 0.08, bottom: -size * 0.08, width: size * 0.7, height: size * 0.7, borderRadius: size, backgroundColor: 'rgba(0,0,0,0.18)' }} />}
    </View>
  );
}

/** El ícono de una bola (BallIcon de la web): el círculo con sus tres huecos, del color que se le dé. */
export function BallIcon({ size = 20, color }: { size?: number; color: string }) {
  return (
    <View aria-hidden>
      <Svg viewBox="0 0 24 24" width={size} height={size} fill="none">
        <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} strokeLinecap="round" />
        <Circle cx={10} cy={8.5} r={1} fill={color} />
        <Circle cx={14} cy={8.5} r={1} fill={color} />
        <Circle cx={12} cy={12.5} r={1.1} fill={color} />
      </Svg>
    </View>
  );
}
