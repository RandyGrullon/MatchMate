import { useMemo } from 'react';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { eyeRing, QR_INK, qrModel } from '@mm/components/QrCode';
import { DUO_HEAD_R, DUO_HEADS, DUO_M, DUO_RX, DUO_STROKE } from '@mm/components/splash/brand';
import { useColors, useTheme } from '@/theme/theme';

/**
 * El QR de la invitación con el estilo de la web (src/components/QrCode.tsx: el mismo modelo, qrModel): módulos
 * redondeados, los ojos del color de la app y el logo al centro, siempre sobre blanco. En modo oscuro los ojos van con
 * la tinta (el color claro de la app se lee poco sobre blanco).
 */
export function QrCode({ value, size = 168 }: { value: string; size?: number }) {
  const c = useColors();
  const { isDark } = useTheme();
  const m = useMemo(() => qrModel(value), [value]);
  const plate = '#ffffff';
  const eye = isDark ? QR_INK : c.accent;
  const tile = m.logo ? m.logo.size - 1.2 : 0;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${m.size} ${m.size}`} accessibilityLabel="Código QR de la invitación">
      <Rect width={m.size} height={m.size} rx={1.5} fill={plate} />
      <Path d={m.d} fill={QR_INK} />
      {m.eyes.map((o) => (
        <G key={`${o.x}-${o.y}`} fill={eye}>
          <Path fillRule="evenodd" d={eyeRing(o.x, o.y)} />
          <Rect x={o.x + 2} y={o.y + 2} width={3} height={3} rx={1} />
        </G>
      ))}
      {m.logo && (
        <>
          <Rect x={m.logo.x} y={m.logo.y} width={m.logo.size} height={m.logo.size} rx={m.logo.size * 0.24} fill={plate} />
          <Svg x={m.logo.x + 0.6} y={m.logo.y + 0.6} width={tile} height={tile} viewBox="0 0 512 512">
            <Rect width={512} height={512} rx={DUO_RX} fill={eye} />
            <Path d={DUO_M} fill="none" stroke={plate} strokeWidth={DUO_STROKE} strokeLinecap="round" strokeLinejoin="round" />
            {DUO_HEADS.map(([x, y]) => (
              <Circle key={x} cx={x} cy={y} r={DUO_HEAD_R} fill={plate} />
            ))}
          </Svg>
        </>
      )}
    </Svg>
  );
}
