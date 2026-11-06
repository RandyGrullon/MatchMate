import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEvent, useEventEntries, usePlayers } from '@mm/lib/data';
import { invalidate } from '@mm/lib/data/client';
import { tags } from '@mm/lib/data/keys';
import { eventLabel } from '@mm/lib/format';
import { useLeagueCtx } from '@mm/lib/league';
import { leagueSport } from '@mm/sports/registry';
import { EventTeams } from '@/components/event/EventTeams';
import { LeagueScope } from '@/components/league/LeagueScope';
import { BackBar, Button, Empty, LoadError, Loading, Screen, Txt } from '@/components/ui';

/**
 * Torneo › Equipos (`/l/<liga>/e/<evento>?tab=equipos` en la web): la pestaña que solo ve quien organiza un torneo de
 * boliche (TeamsTab de la web: equipos fijos de la liga, crear, armar automáticamente, mover jugadores). Quien no es
 * admin ve «No tienes permiso»; en una práctica (la web no tiene la pestaña) va al evento.
 */
export default function EventTeamsScreen() {
  const { lid, eventId } = useLocalSearchParams<{ lid: string; eventId: string }>();
  return (
    <LeagueScope lid={lid}>
      <EventTeamsBody eventId={eventId} />
    </LeagueScope>
  );
}

function EventTeamsBody({ eventId }: { eventId: string }) {
  const { lid, league, isAdmin } = useLeagueCtx();
  const event = useEvent(lid, eventId);
  const entries = useEventEntries(lid, eventId);
  const players = usePlayers(lid);
  const loadError = event.error ?? entries.error ?? players.error;
  const ev = event.data;
  if (!loadError && ev && isAdmin && (ev.type !== 'torneo' || leagueSport(league) !== 'bowling')) {
    return <Redirect href={{ pathname: '/l/[lid]/e/[eventId]', params: { lid, eventId } }} />;
  }
  if (event.loading && !ev && !loadError) return <Loading label="Cargando el evento" />;
  return (
    <Screen onRefresh={() => invalidate(tags.event(eventId), tags.eventEntries(eventId), tags.players(lid))}>
      <BackBar label={ev ? eventLabel(ev) : league.name} fallback={`/l/${lid}/e/${eventId}`} />
      {loadError ? (
        <LoadError error={loadError} />
      ) : !ev ? (
        <Empty title="Este evento no existe" action={<Button onPress={() => router.navigate({ pathname: '/l/[lid]', params: { lid } })}>Volver a la liga</Button>} />
      ) : !isAdmin ? (
        <LoadError error={new Error('permission-denied')} />
      ) : (
        <>
          <Txt variant="title">Equipos</Txt>
          {(entries.loading && !entries.data.length) || (players.loading && !players.data.length) ? <Loading /> : <EventTeams event={ev} entries={entries.data} players={players.data} />}
        </>
      )}
    </Screen>
  );
}
