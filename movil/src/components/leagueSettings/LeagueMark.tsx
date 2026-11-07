import { View } from 'react-native';
import { Image } from 'expo-image';
import { useLogo } from '@mm/lib/logos';
import type { League } from '@mm/lib/types';
import { leagueSport, sportMeta } from '@mm/sports/registry';
import { useColors } from '@/theme/theme';

/**
 * El logo de la liga (LeagueIcon de la web, src/components/home/LeagueCard.tsx): su imagen pública del bucket `logos`
 * o, sin logo (o mientras llega), el ícono del deporte en su cuadro.
 */
export function LeagueMark({ league, size = 64 }: { league: Pick<League, 'id' | 'sport' | 'logoPath'>; size?: number }) {
  const c = useColors();
  const { url, pending } = useLogo(league.logoPath);
  const box = { width: size, height: size, borderRadius: Math.round(size * 0.3) };
  if (url) {
    return <Image source={{ uri: url }} accessibilityIgnoresInvertColors contentFit="cover" style={[box, { backgroundColor: c.surface2 }]} />;
  }
  const Icon = sportMeta(leagueSport(league))?.icon;
  return (
    <View importantForAccessibility="no-hide-descendants" style={[box, { backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }]}>
      {!pending && Icon && <Icon size={Math.round(size * 0.5)} color={c.accent} />}
    </View>
  );
}
