import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { leagueSport, sportMeta } from '@mm/sports/registry';
import type { League } from '@mm/lib/types';
import { colorsFor, useTheme } from '@/theme/theme';
import { radius } from '@/theme/tokens';
import { Txt } from './ui';

/**
 * Tarjeta de una liga en el color de su deporte (como «Ligas» en la web): el ícono del deporte, el nombre y una línea
 * (lo próximo, el lugar o el horario). Lleva a la liga.
 */
export function LeagueCard({ league, line }: { league: League; line?: string | null }) {
  const { isDark } = useTheme();
  const sport = leagueSport(league);
  const meta = sportMeta(sport);
  const c = colorsFor(isDark, sport);
  const Icon = meta?.icon;
  const sub = line ?? ([meta?.label, league.venue || league.schedule].filter(Boolean).join(' · ') || null);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${league.name}${sub ? `. ${sub}` : ''}`}
      onPress={() => router.push({ pathname: '/l/[lid]', params: { lid: league.id } })}
      style={({ pressed }) => [styles.card, { backgroundColor: c.surface, opacity: pressed ? 0.85 : 1 }]}
    >
      <View style={[styles.mark, { backgroundColor: c.accentSoft }]}>{Icon ? <Icon size={24} color={c.accent} /> : null}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="bodyStrong" numberOfLines={1}>
          {league.name}
        </Txt>
        {!!sub && (
          <Txt variant="meta" tone="muted" numberOfLines={1}>
            {sub}
          </Txt>
        )}
      </View>
      <View style={[styles.dot, { backgroundColor: c.accent }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: radius.card, padding: 16 },
  mark: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
