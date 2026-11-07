import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@mm/lib/auth';
import { useLeagueCtx } from '@mm/lib/league';
import { usePendingClaimCount } from '@mm/components/claims/data';
import { peopleInOwnTab } from '@mm/components/players/list';
import { leagueSport } from '@mm/sports/registry';
import { Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/** Las pantallas de la gente de la liga en Organizar (`?tab=` de la web y la ruta de la app: /l/<liga>/<pestaña>). */
export type PeopleTab = 'jugadores' | 'miembros' | 'reclamos';

/**
 * Arriba de Jugadores y miembros (el segmentado «Gente de la liga» de AdminPage en la web): Jugadores · Miembros ·
 * Reclamos, con el número de reclamos por revisar. Cada una es su pantalla en la app (`active` es la de la pantalla en
 * la que está) y tocar otra la cambia sin apilarla. Donde el deporte lleva a su gente en su propia pestaña (natación,
 * raqueta) no va «Jugadores», como en la web.
 */
export function PeopleTabs({ active }: { active: PeopleTab }) {
  const c = useColors();
  const { lid, league, isAdmin } = useLeagueCtx();
  const uid = useAuth().user?.uid;
  const claims = usePendingClaimCount(isAdmin ? lid : null, uid);
  const merged = peopleInOwnTab(leagueSport(league));
  const options: { key: PeopleTab; label: string; count?: number; ariaLabel?: string }[] = [
    ...(merged ? [] : [{ key: 'jugadores' as const, label: 'Jugadores' }]),
    { key: 'miembros', label: 'Miembros' },
    { key: 'reclamos', label: 'Reclamos', count: claims, ariaLabel: claims ? `Reclamos: ${claims} por revisar` : 'Reclamos' },
  ];
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Gente de la liga" style={[styles.wrap, { backgroundColor: c.surface2 }]}>
      {options.map((o) => {
        const on = o.key === active;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.ariaLabel ?? o.label}
            onPress={() => {
              // Las rutas nuevas llegan a los tipos de expo-router al arrancar la vista previa.
              if (!on) router.replace(`/l/${lid}/${o.key}` as never);
            }}
            style={[styles.segment, on && { backgroundColor: c.segOn, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } }]}
          >
            <Txt variant="bodyStrong" tone={on ? 'fg' : 'muted'} numberOfLines={1}>
              {o.label}
            </Txt>
            {!!o.count && (
              <View style={[styles.count, { backgroundColor: c.accent }]}>
                <Txt style={{ color: c.accentFg, fontFamily: font.bold, fontSize: 11 }}>{o.count}</Txt>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', borderRadius: 14, padding: 4, gap: 4 },
  segment: { flex: 1, height: 40, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  count: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
});
