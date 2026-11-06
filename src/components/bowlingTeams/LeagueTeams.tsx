import { Link } from 'react-router';
import { colorOf, teamAverageSum, useBowlingTeams } from '../../lib/data/bowlingTeams';
import { useLeagueCtx } from '../../lib/league';
import { MeTag } from '../league/home/LeagueSections';
import { Card, ListRow, SectionHeader, sectionLinkClass } from '../ui';
import { firstNames } from './logic';
import { TeamMark } from './parts';

// El promedio de cada jugador en el inicio de la liga (logic.ts: también lo usa la app del teléfono).
export { homeAverages } from './logic';

/**
 * Inicio de la liga › «Equipos»: cada equipo fijo en una fila (su color, su nombre, sus jugadores y la suma de sus
 * promedios), tu equipo con «Tú». Quien organiza tiene «Editar» (Organizar › Equipos). Sin equipos fijos no sale.
 */
export function LeagueTeamsSection({ averages, className }: { averages: ReadonlyMap<string, number>; className?: string }) {
  const { lid, league, isAdmin, base, myPlayerId } = useLeagueCtx();
  const teams = useBowlingTeams(league.kind === 'torneo' ? null : lid);
  if (!teams.data.length) return null;
  const anySum = teams.data.some((t) => teamAverageSum(t.players.map((p) => p.playerId), averages) > 0);
  return (
    <section aria-labelledby="liga-equipos" className={className}>
      <SectionHeader
        id="liga-equipos"
        title="Equipos"
        action={
          isAdmin ? (
            <Link to={`${base}/admin?tab=equipos`} className={sectionLinkClass}>
              Editar
            </Link>
          ) : undefined
        }
      />
      <Card className="overflow-hidden">
        {teams.data.map((t, i) => {
          const me = !!myPlayerId && t.players.some((p) => p.playerId === myPlayerId);
          const sum = teamAverageSum(
            t.players.map((p) => p.playerId),
            averages,
          );
          return (
            <ListRow
              key={t.id}
              me={me}
              leading={<TeamMark name={t.name} color={colorOf(t, i)} />}
              title={
                <>
                  {t.name}
                  {me && <MeTag />}
                </>
              }
              subtitle={t.players.length ? firstNames(t.players.map((p) => p.name)) : 'Sin jugadores'}
              value={sum || undefined}
            />
          );
        })}
      </Card>
      {anySum && <p className="mx-1 mt-2 text-[13px] text-muted">Al lado de cada equipo, la suma de los promedios de sus jugadores.</p>}
    </section>
  );
}
