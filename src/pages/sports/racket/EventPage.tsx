import { Link, useParams } from 'react-router';
import { useRacketEvent } from '../../../lib/data/racket';
import { useLeagueCtx } from '../../../lib/league';
import { Empty, LoadError, PageSkeleton } from '../../../components/ui';
import { LeaguePage } from './league/LeaguePage';
import { isNightType } from './logic/night';
import { NightPage } from './night/NightPage';
import { TourneyPage } from './tourney/TourneyPage';
import { useRacket } from './sport';

/**
 * Un evento de raqueta (/l/:lid/e/:eventId): la noche de americano o mexicano, la liga de parejas o el torneo; o
 * lo que el deporte agrega (`ext.eventPage`: liga por cajas, escalera, round robin social).
 */
export default function RacketEventPage({ eventId: fixed }: { eventId?: string }) {
  const params = useParams();
  const eventId = fixed ?? params.eventId;
  const { lid, base } = useLeagueCtx();
  const { ext } = useRacket();
  const ev = useRacketEvent(lid, eventId);
  if (ev.error) return <LoadError error={ev.error} />;
  if (ev.loading && !ev.data) return <PageSkeleton />;
  if (!ev.data) {
    return (
      <Empty title="Este evento no existe">
        <Link to={base} className="text-accent">
          Volver
        </Link>
      </Empty>
    );
  }
  const e = ev.data;
  const Custom = ext.eventPage?.(e);
  if (Custom) return <Custom event={e} />;
  if (isNightType(e.type)) return <NightPage event={e} />;
  if (e.type === 'torneo') return <TourneyPage event={e} />;
  return <LeaguePage event={e} />;
}
