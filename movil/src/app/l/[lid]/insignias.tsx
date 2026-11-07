import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Globe } from 'lucide-react-native';
import { invalidate } from '@mm/lib/data/client';
import { tags } from '@mm/lib/data/keys';
import { badgeTags } from '@mm/lib/data/badges';
import { canMakeBadges } from '@mm/lib/data/leagueBadges';
import { useLeagueCtx } from '@mm/lib/league';
import { adminScreenTitle } from '@mm/components/organizer/hubLogic';
import { BadgeMakersCard, BadgesSettingsCard } from '@/components/badges/BadgesSettings';
import { LeagueScope } from '@/components/league/LeagueScope';
import { BackBar, Card, ListRow, LoadError, RowIcon, Screen, Txt } from '@/components/ui';
import { openOnWeb } from '@/lib/web';
import { useColors } from '@/theme/theme';

/**
 * Organizar › Insignias (`/l/<liga>/admin?tab=insignias` en la web, BadgesScreen de AdminPage): las automáticas (cuáles
 * da la app), quién diseña y da las de la liga y, para quien las diseña, el creador («Insignias de la liga»), que
 * todavía es en la web. Dueño, admins y superadmin; quien no lo es ve «No tienes permiso», como en la web.
 */
export default function BadgesScreen() {
  const { lid } = useLocalSearchParams<{ lid: string }>();
  return (
    <LeagueScope lid={lid}>
      <BadgesScreenBody />
    </LeagueScope>
  );
}

function BadgesScreenBody() {
  const c = useColors();
  const ctx = useLeagueCtx();
  const { lid, league, isAdmin } = ctx;
  // Insignias de la liga (el creador): solo para quien las diseña y las da.
  const makers = canMakeBadges(ctx);
  return (
    <Screen onRefresh={() => invalidate(tags.league(lid), tags.leagues, badgeTags.league(lid))}>
      <BackBar label={league.name} fallback={`/l/${lid}`} />
      {!isAdmin ? (
        <LoadError error={new Error('permission-denied')} />
      ) : (
        <>
          <Txt variant="title">{adminScreenTitle('insignias', league.kind) ?? ''}</Txt>
          <View style={{ gap: 20 }}>
            <BadgesSettingsCard />
            <BadgeMakersCard />
            {makers && (
              <Card padded={false}>
                <ListRow
                  icon={
                    <RowIcon>
                      <Globe size={20} color={c.accent} />
                    </RowIcon>
                  }
                  title="Insignias de la liga"
                  subtitle="En la web, por ahora"
                  onPress={() => openOnWeb(`/l/${lid}/admin?tab=insignias`)}
                />
              </Card>
            )}
          </View>
        </>
      )}
    </Screen>
  );
}
