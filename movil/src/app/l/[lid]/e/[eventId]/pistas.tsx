import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEvent, useEventEntries, usePlayers } from '@mm/lib/data';
import { invalidate } from '@mm/lib/data/client';
import { tags } from '@mm/lib/data/keys';
import { laneTags } from '@mm/lib/data/lanes';
import { eventLabel } from '@mm/lib/format';
import { canScoreEvent, useLeagueCtx } from '@mm/lib/league';
import { leagueSport } from '@mm/sports/registry';
import { LanesPanel } from '@/components/lanes/LanesPanel';
import { LeagueScope } from '@/components/league/LeagueScope';
import { BackBar, Button, Empty, LoadError, Loading, Screen, Txt } from '@/components/ui';

/**
 * Evento › Pistas (`/l/<liga>/e/<evento>?tab=pistas` en la web): armar, mover, copiar y publicar las pistas (quien
 * organiza o anota ese evento: LanesPanel). Quien no anota ese evento (o un evento que no es de boliche) va al evento.
 */
export default function EventLanesScreen() {
  const { lid, eventId } = useLocalSearchParams<{ lid: string; eventId: string }>();
  return (
    <LeagueScope lid={lid}>
      <EventLanesBody eventId={eventId} />
    </LeagueScope>
  );
}

function EventLanesBody({ eventId }: { eventId: string }) {
  const ctx = useLeagueCtx();
  const { lid, league } = ctx;
  const event = useEvent(lid, eventId);
  const entries = useEventEntries(lid, eventId);
  const players = usePlayers(lid);
  const loadError = event.error ?? entries.error ?? players.error;
  const ev = event.data;
  // Un evento que no es de boliche, o quien no anota este (un link de la web con ?tab=): el evento, como la web.
  if (!loadError && ev && (leagueSport(league) !== 'bowling' || !canScoreEvent(ctx, ev.type))) return <Redirect href={{ pathname: '/l/[lid]/e/[eventId]', params: { lid, eventId } }} />;
  if (event.loading && !ev && !loadError) return <Loading label="Cargando el evento" />;
  return (
    <Screen onRefresh={() => invalidate(tags.event(eventId), tags.eventEntries(eventId), tags.players(lid), laneTags.event(eventId))}>
      <BackBar label={ev ? eventLabel(ev) : league.name} fallback={`/l/${lid}/e/${eventId}`} />
      {loadError ? (
        <LoadError error={loadError} />
      ) : !ev ? (
        <Empty title="Este evento no existe" action={<Button onPress={() => router.navigate({ pathname: '/l/[lid]', params: { lid } })}>Volver a la liga</Button>} />
      ) : (
        <>
          <Txt variant="title">Pistas</Txt>
          {(entries.loading && !entries.data.length) || (players.loading && !players.data.length) ? <Loading /> : <LanesPanel event={ev} entries={entries.data} players={players.data} />}
        </>
      )}
    </Screen>
  );
}
