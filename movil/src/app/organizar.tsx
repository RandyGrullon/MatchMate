import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { Crown, Plus } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { LeagueContext } from '@mm/lib/league';
import { organizedLeagueIds } from '@mm/lib/organize';
import type { League } from '@mm/lib/types';
import { queryClient } from '@mm/lib/data/client';
import { useMyLeagues } from '@mm/components/home/activity';
import { useOrganizerCtx } from '@mm/components/organizer/hubData';
import { pickOrganizeLeague, rememberedOrganizeLeague, rememberOrganizeLeague } from '@mm/components/organizer/hubLogic';
import { LeaguePickerChip, LeaguePickerSheet, OrganizeHub } from '@/components/organizer/Organize';
import { BackBar, Button, Card, ListRow, LoadError, Loading, RowIcon, Screen, Txt } from '@/components/ui';
import { openOnWeb } from '@/lib/web';
import { useColors } from '@/theme/theme';

/**
 * Organizar (`/organizar`, desde Yo › Configuración; `?liga=` elige la liga), como src/pages/OrganizePage.tsx de la
 * web: «‹ Configuración», el título, la ficha de la liga (toca para elegir otra de las que organizas), «Por hacer» y
 * «La liga». Sin ligas que organizar, cómo crear una; el dueño de la app, además, su consola (en la web).
 */
export default function OrganizeScreen() {
  const auth = useAuth();
  const c = useColors();
  const params = useLocalSearchParams<{ liga?: string }>();
  const mine = useMyLeagues(null);
  const uid = auth.user?.uid;

  const organized = organizedLeagueIds(mine.memberships.data);
  const requested = typeof params.liga === 'string' && params.liga ? params.liga : null;
  // La pedida se abre de una (sus permisos se miran al cargarla); si no, se espera a saber cuáles organizas.
  const lid = requested && auth.isSuper ? requested : mine.memberships.loading ? null : pickOrganizeLeague(organized, requested, rememberedOrganizeLeague(uid), auth.isSuper);
  useEffect(() => {
    if (uid && lid) rememberOrganizeLeague(uid, lid);
  }, [uid, lid]);

  if (auth.loading) return <Loading />;
  if (!auth.user) return <Redirect href="/login" />;

  const byId = new Map(mine.all.map((l) => [l.id, l]));
  const leagues = organized.map((id) => byId.get(id)).filter((l): l is League => !!l);
  const create = () => router.push('/crear');

  return (
    <Screen onRefresh={() => queryClient.onReconnect()}>
      {/* Se llega desde Configuración: «‹ Configuración» vuelve ahí. */}
      <BackBar label="Configuración" fallback="/cuenta" />
      <Txt variant="title">Organizar</Txt>

      {lid ? (
        <OrganizeLeague key={lid} lid={lid} leagues={leagues} onCreate={create} />
      ) : mine.error ? (
        <LoadError error={mine.error} />
      ) : mine.memberships.loading ? (
        <Loading label="Cargando tus ligas" />
      ) : (
        <Card style={{ gap: 16, alignItems: 'flex-start' }}>
          <View style={{ gap: 4 }}>
            <Txt variant="bodyStrong">Todavía no organizas ninguna liga</Txt>
            <Txt tone="muted" style={{ fontSize: 14 }}>
              Crea una liga o un torneo y aquí verás lo que espera por ti.
            </Txt>
          </View>
          <Button variant="soft" size="lg" icon={<Plus size={18} color={c.accent} strokeWidth={2.4} />} onPress={create}>
            Crear o unirme
          </Button>
        </Card>
      )}

      {auth.isSuper && (
        <Card padded={false} style={{ overflow: 'hidden' }}>
          <ListRow
            icon={
              <RowIcon>
                <Crown size={20} color={c.accent} />
              </RowIcon>
            }
            title="Panel del superadmin"
            subtitle="Toda la app: cuentas, ligas y errores"
            onPress={() => openOnWeb('/superadmin')}
          />
        </Card>
      )}
    </Screen>
  );
}

/** Lo de una liga: su ficha (con la hoja para cambiar), «Por hacer» y «La liga». */
function OrganizeLeague({ lid, leagues, onCreate }: { lid: string; leagues: readonly League[]; onCreate: () => void }) {
  const { ctx, loading, error } = useOrganizerCtx(lid);
  const [picking, setPicking] = useState(false);
  const league = ctx?.league ?? leagues.find((l) => l.id === lid) ?? null;

  return (
    <View style={{ gap: 20 }}>
      <LeaguePickerChip league={league} onOpen={() => setPicking(true)} />
      {error && !ctx ? (
        <LoadError error={error} />
      ) : !ctx ? (
        loading ? (
          <Loading label="Cargando la liga" />
        ) : (
          <LoadError error={new Error('not-found')} />
        )
      ) : !ctx.isAdmin ? (
        <LoadError error={new Error('permission-denied')} />
      ) : (
        <LeagueContext.Provider value={ctx}>
          <OrganizeHub />
        </LeagueContext.Provider>
      )}
      <LeaguePickerSheet
        open={picking}
        onClose={() => setPicking(false)}
        leagues={leagues}
        current={lid}
        onPick={(id) => router.setParams({ liga: id })}
        onCreate={onCreate}
      />
    </View>
  );
}
