import { View } from 'react-native';
import { monthShort, toLocalDate } from '@mm/lib/dateBlock';
import { Txt } from './ui';
import { useColors } from '@/theme/theme';

/** El bloque de fecha de las listas (DateBlock de la web): el mes arriba («OCT», en el color del deporte) y el día grande. */
export function DateBlock({ date }: { date: string }) {
  const c = useColors();
  const d = toLocalDate(date);
  if (!d) return null;
  return (
    <View style={{ width: 50, height: 54, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface2 }}>
      <Txt variant="small" tone="accent" style={{ fontWeight: '700', letterSpacing: 0.5 }}>
        {monthShort(d)}
      </Txt>
      <Txt style={{ fontSize: 21, lineHeight: 24, fontWeight: '700' }}>{d.getDate()}</Txt>
    </View>
  );
}
