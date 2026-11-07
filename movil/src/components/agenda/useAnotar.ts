import type { LeagueFeed } from '@mm/lib/data';
import type { League } from '@mm/lib/types';
import { recentEvents, resumeElsewhere, startedGames, useMemoryTick, type RecentEvent } from '@mm/lib/useNextGame';
import { anotarLinkOf, type AnotarLink } from '@mm/components/home/where';

/** Los juegos a medias, leídos otra vez cada vez que la memoria de la hoja de anotar pudo cambiar (`tick`). */
const startedAt = (uid: string | undefined, tick: number) => (tick >= 0 ? startedGames(uid) : []);

/**
 * Anotar sin un juego de hoy (Hoy de la web, src/pages/HomePage.tsx): los eventos de boliche de ayer y de hoy donde la
 * cuenta juega (`recent`, para «¿Dónde jugaste?») y el link discreto de la tarjeta (`link`: «Seguir mi juego 2» o
 * «Anotar un juego»; null si no hay). `skip`: el evento que ya sale en la tarjeta de hoy (`act.games[0]?.event.id`).
 */
export function useAnotar({
  feeds,
  leagues,
  today,
  uid,
  skip,
}: {
  feeds: readonly LeagueFeed[];
  leagues: readonly League[];
  today: string;
  uid: string | undefined;
  skip?: string | null;
}): { recent: RecentEvent[]; link: AnotarLink | null } {
  const tick = useMemoryTick();
  const recent = recentEvents(feeds, leagues, today);
  const resume = resumeElsewhere(startedAt(uid, tick), recent, skip);
  return { recent, link: anotarLinkOf(resume, recent, today) };
}
