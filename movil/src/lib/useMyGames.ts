/**
 * Los juegos del jugador en un evento de boliche, como «Tus juegos» de la web (src/components/event/MyGamesPanel.tsx y
 * src/lib/useNextGame.ts): cada juego (en la tabla, en el teléfono, enviado, a medias o vacío), la serie, el botón que
 * sigue y si la práctica ya cerró. Todo sale de la lógica compartida; aquí solo se junta.
 */
import { useMemo } from 'react';
import { getUserId } from '@mm/lib/data/client';
import { useEvent, useEventEntries, useLeague, useMembership } from '@mm/lib/data';
import { usePlayerSubmissions } from '@mm/lib/data/submissions';
import { useDraft } from '@mm/lib/draft';
import { gameCells, nextGame, partialGame, seriesOf, useMemoryTick } from '@mm/lib/useNextGame';
import { gameKey, myGamesPlace, readGameDraft } from '@mm/components/frames/draftMemory';
import { practiceClosed } from '@mm/lib/live';
import { todayIn } from '@mm/pages/sports/racket/logic/time';
import { useAuth } from '@mm/lib/auth';

export function useMyGames(lid: string, eventId: string) {
  const auth = useAuth();
  const league = useLeague(lid);
  const event = useEvent(lid, eventId);
  const member = useMembership(lid, auth.user?.uid);
  const playerId = member.data?.playerId ?? null;
  const entries = useEventEntries(lid, eventId);
  const subs = usePlayerSubmissions(lid, playerId ?? undefined);
  const draft = useDraft(lid, playerId, eventId);
  // Un juego a medias se guarda en el teléfono con cada tiro: la tarjeta se entera por 'mm:borrador' y al volver.
  const tick = useMemoryTick();

  const today = todayIn(league.data?.tz ?? null);
  const staff = member.data?.role === 'owner' || member.data?.role === 'admin' || !!member.data?.scorer;
  const ev = event.data;
  const mine = entries.data.find((e) => e.playerId === playerId) ?? null;
  const eventSubs = useMemo(() => subs.data.filter((s) => s.eventId === eventId), [subs.data, eventId]);

  const place = playerId ? myGamesPlace(getUserId(), lid, playerId, eventId) : null;
  const cells = useMemo(
    () =>
      ev
        ? gameCells({
            games: ev.games,
            entry: mine,
            draft,
            subs: eventSubs,
            partial: (i) => (place ? partialGame(readGameDraft(gameKey(place, i))) : null),
          })
        : [],
    // tick: lo que va a medias se relee cuando el teléfono guarda un tiro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ev, mine, draft, eventSubs, place, tick],
  );
  const next = ev ? nextGame({ lid, event: ev, playerId, staff, cells, hasSubs: eventSubs.length > 0, today }) : null;
  const closed = !!ev && ev.type === 'practica' && !staff && practiceClosed(ev.date, today);

  return {
    league,
    event,
    member,
    playerId,
    staff,
    today,
    entry: mine,
    subs: eventSubs,
    draft,
    cells,
    series: seriesOf(cells),
    next,
    closed,
    place,
    loading: league.loading || event.loading || member.loading,
  };
}
