import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEvent, useEventEntries, useEventLive, useEventSubmissions, usePlayers } from '@mm/lib/data';
import { invalidate } from '@mm/lib/data/client';
import { tags } from '@mm/lib/data/keys';
import { eventLabel } from '@mm/lib/format';
import { canScoreEvent, useLeagueCtx } from '@mm/lib/league';
import { leagueSport } from '@mm/sports/registry';
import { ApprovalCard } from '@/components/bowling/ApprovalCard';
import { EventSheet } from '@/components/event/EventSheet';
import { LeagueScope } from '@/components/league/LeagueScope';
import { BackBar, Button, Empty, LoadError, Loading, Screen, Txt } from '@/components/ui';

/**
 * Evento › Planilla (`/l/<liga>/e/<evento>?tab=juegos` en la web): la tabla en vivo donde quien organiza (o anota el
 * torneo) le anota a cualquiera, con «Por aprobar» arriba para los admins (como la pestaña de la web). Quien no anota
 * ese evento (o un evento que no es de boliche) va al evento.
 */
export default function EventSheetScreen() {
  const { lid, eventId } = useLocalSearchParams<{ lid: string; eventId: string }>();
  return (
    <LeagueScope lid={lid}>
      <EventSheetBody eventId={eventId} />
    </LeagueScope>
  );
}

function EventSheetBody({ eventId }: { eventId: string }) {
  const ctx = useLeagueCtx();
  const { lid, league, isAdmin } = ctx;
  const event = useEvent(lid, eventId);
  const entries = useEventEntries(lid, eventId);
  const players = usePlayers(lid);
  const subs = useEventSubmissions(lid, eventId);
  const live = useEventLive(lid, eventId);
  const loadError = event.error ?? entries.error ?? players.error;
  const ev = event.data;
  // Un evento que no es de boliche, o quien no anota este (un link de la web con ?tab=): el evento, como la web.
  if (!loadError && ev && (leagueSport(league) !== 'bowling' || !canScoreEvent(ctx, ev.type))) return <Redirect href={{ pathname: '/l/[lid]/e/[eventId]', params: { lid, eventId } }} />;
  if (event.loading && !ev && !loadError) return <Loading label="Cargando el evento" />;
  return (
    <Screen onRefresh={() => invalidate(tags.event(eventId), tags.eventEntries(eventId), tags.players(lid), tags.subs(lid))}>
      <BackBar label={ev ? eventLabel(ev) : league.name} fallback={`/l/${lid}/e/${eventId}`} />
      {loadError ? (
        <LoadError error={loadError} />
      ) : !ev ? (
        <Empty title="Este evento no existe" action={<Button onPress={() => router.navigate({ pathname: '/l/[lid]', params: { lid } })}>Volver a la liga</Button>} />
      ) : (
        <>
          <Txt variant="title">Planilla</Txt>
          {(entries.loading && !entries.data.length) || (players.loading && !players.data.length) ? (
            <Loading />
          ) : (
            <>
              {isAdmin && <ApprovalCard league={league} event={ev} subs={subs.data.filter((s) => s.status === 'pendiente')} entries={entries.data} players={players.data} />}
              <EventSheet event={ev} entries={entries.data} players={players.data} subs={subs.data} live={live.data} />
            </>
          )}
        </>
      )}
    </Screen>
  );
}
