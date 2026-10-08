import { Link, useParams } from 'react-router';
import { Plus, Trophy } from 'lucide-react';
import { useLeagueTournaments, type EsportsTournament } from '../../../lib/data/esports';
import { useLeagueRules } from '../../../lib/data/teamSports';
import { useLeagueCtx } from '../../../lib/league';
import { isGameId } from '../../../sports/esports';
import { linkButton } from '../../../components/screens/ScreenBits';
import { Card, Empty, ListSkeleton, LoadError, PageSkeleton, SectionHeader } from '../../../components/ui';
import { OrganizerOnly, useOrganizer } from './parts';
import { TournamentRow, TournamentView } from './TournamentPage';

/**
 * El inicio de una liga de esports (§12.8 `Home`): un torneo suelto (`kind 'torneo'`) es la página de su único torneo;
 * una liga de esports, sus torneos («Inscripción abierta», «En curso», «Terminados») y, para quien organiza en Pro,
 * «Crear torneo» (el asistente con `?liga=`).
 */
export default function EsportsLeagueHome() {
  const { lid, league } = useLeagueCtx();
  const list = useLeagueTournaments(lid);
  if (list.error) return <LoadError error={list.error} />;
  if (list.loading && !list.data.length) return league.kind === 'torneo' ? <PageSkeleton /> : <ListSkeleton rows={3} />;
  if (league.kind === 'torneo') {
    const t = list.data[0];
    if (!t) {
      return (
        <Empty icon={<Trophy className="size-8" />} title="Este torneo todavía no está listo">
          Vuelve en un momento.
        </Empty>
      );
    }
    return <TournamentView key={t.eventId} eventId={t.eventId} embedded />;
  }
  return <LeagueTournaments list={list.data} />;
}

/** La página de un torneo dentro de la liga (`/l/:lid/e/:eventId`, §12.8 `Event`). */
export function EsportsEventPage() {
  const { eventId } = useParams();
  if (!eventId) return null;
  return <TournamentView key={eventId} eventId={eventId} />;
}

function LeagueTournaments({ list }: { list: readonly EsportsTournament[] }) {
  const { lid, base } = useLeagueCtx();
  const rules = useLeagueRules(lid);
  const organizer = useOrganizer();
  const game = isGameId(rules.data.game) ? rules.data.game : (list[0]?.game ?? null);
  const live = list.filter((t) => t.status !== 'cancelled');
  const open = live.filter((t) => t.status === 'registration');
  const playing = live.filter((t) => t.status === 'live');
  const done = live.filter((t) => t.status === 'finished').reverse();
  const create = game ? `/esports/${game}/nuevo-torneo?liga=${lid}` : null;
  const row = (t: EsportsTournament) => <TournamentRow key={t.eventId} t={t} to={`${base}/e/${t.eventId}`} dense={organizer} />;
  if (!live.length) {
    return (
      <Empty icon={<Trophy className="size-8" />} title="Todavía no hay torneos">
        {organizer && create ? (
          <Link to={create} className={linkButton('primary', 'mt-3')}>
            <Plus aria-hidden="true" className="size-5" />
            <span className="min-w-0 truncate">Crear torneo</span>
          </Link>
        ) : (
          'Cuando el organizador cree uno, sale aquí.'
        )}
      </Empty>
    );
  }
  return (
    <div className="flex flex-col gap-[30px]">
      <OrganizerOnly>
        {create && (
          <Link to={create} className={linkButton('primary', 'w-full')}>
            <Plus aria-hidden="true" className="size-5" />
            <span className="min-w-0 truncate">Crear torneo</span>
          </Link>
        )}
      </OrganizerOnly>
      {open.length > 0 && (
        <section aria-labelledby="esp-abiertos">
          <SectionHeader id="esp-abiertos" title="Inscripción abierta" />
          <Card className="overflow-hidden">{open.map(row)}</Card>
        </section>
      )}
      {playing.length > 0 && (
        <section aria-labelledby="esp-curso">
          <SectionHeader id="esp-curso" title="En curso" />
          <Card className="overflow-hidden">{playing.map(row)}</Card>
        </section>
      )}
      {done.length > 0 && (
        <section aria-labelledby="esp-terminados">
          <SectionHeader id="esp-terminados" title="Terminados" />
          <Card className="overflow-hidden">{done.map(row)}</Card>
        </section>
      )}
    </div>
  );
}
