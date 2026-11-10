import { View } from 'react-native';
import { Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/** El puesto: oro, plata y bronce en los 3 primeros (Position de la web). La clasificación y el detalle de un juego. */
export function Position({ pos }: { pos: number }) {
  const c = useColors();
  const color = pos === 1 ? c.gold : pos === 2 ? c.silver : pos === 3 ? c.bronze : null;
  return color ? (
    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <Txt style={{ fontSize: 12, fontFamily: font.bold, color: c.bg }}>{String(pos)}</Txt>
    </View>
  ) : (
    <View style={{ width: 24, alignItems: 'center' }}>
      <Txt tone="muted" style={{ fontSize: 14, fontFamily: font.medium }}>
        {String(pos)}
      </Txt>
    </View>
  );
}
