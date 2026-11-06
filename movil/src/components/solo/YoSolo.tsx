import { useMemo } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Target } from 'lucide-react-native';
import { useLeaguesByIds, useMyMemberships } from '@mm/lib/data';
import { useMySoloSessions } from '@mm/lib/data/solo';
import { leagueSport, sportMeta } from '@mm/sports/registry';
import { MyBallsSection } from '@/components/balls/MyBalls';
import { Card, Divider, ListRow, RowIcon } from '@/components/ui';
import { useColors } from '@/theme/theme';

/**
 * ¿Salen las cosas del boliche en Yo? Como la web (ProfilePage): si juega boliche, tiene juegos sueltos o (todavía)
 * ninguna liga de otro deporte.
 */
export function useShowsBowling(uid: string): boolean {
  const memberships = useMyMemberships(uid);
  const ids = useMemo(() => memberships.data.map((m) => m.leagueId), [memberships.data]);
  const leagues = useLeaguesByIds(ids);
  const solo = useMySoloSessions();
  const sports = leagues.data.map((l) => leagueSport(l));
  const bowling = sports.filter((s) => s === 'bowling').length;
  const others = sports.length - bowling;
  return bowling > 0 || others === 0 || solo.data.length > 0;
}

/**
 * Los juegos sueltos en Yo: «Anotar un juego suelto · Solo para ti, sin liga» (abre la hoja) y «Juegos sueltos» (la
 * lista; en la web va dentro de «Mis juegos»).
 */
export function YoSoloRows() {
  const c = useColors();
  const Icon = sportMeta('bowling')?.icon;
  return (
    <Card padded={false}>
      <ListRow
        icon={
          <RowIcon>
            <Target size={20} color={c.accent} />
          </RowIcon>
        }
        title="Anotar un juego suelto"
        subtitle="Solo para ti, sin liga"
        onPress={() => router.push({ pathname: '/juegos-sueltos', params: { nuevo: '1' } })}
      />
      <View>
        <Divider inset={68} />
        <ListRow
          icon={<RowIcon>{Icon ? <Icon size={20} color={c.accent} /> : null}</RowIcon>}
          title="Juegos sueltos"
          subtitle="Boliche sin liga ni torneo: anota los tuyos"
          onPress={() => router.push('/juegos-sueltos')}
        />
      </View>
    </Card>
  );
}

/** Lo del boliche en Yo (si juega boliche), como Yo › Lite de la web: Mis bolas y los juegos sueltos. */
export function YoBowling({ uid }: { uid: string }) {
  const show = useShowsBowling(uid);
  if (!show) return null;
  return (
    <>
      <MyBallsSection />
      <YoSoloRows />
    </>
  );
}
