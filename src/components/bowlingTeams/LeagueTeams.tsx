import { Link } from 'react-router';
import type { RankingRow } from '../../lib/bowlingSeason';
import { colorOf, teamAverageSum, useBowlingTeams } from '../../lib/data/bowlingTeams';
import { useLeagueCtx } from '../../lib/league';
import type { Player } from '../../lib/types';
import { MeTag } from '../league/home/LeagueSections';
import { Card, ListRow, SectionHeader, sectionLinkClass } from '../ui';
import { TeamMark } from './parts';

/**
 * El promedio de cada jugador en el inicio de la liga: el de la tabla de la temporada (ya está leída) y, si todavía no
 * tiene juegos, el fijo del admin. Sin nada, no sale.
 */
export function homeAverages(rows: readonly Pick<RankingRow, 'playerId' | 'average'>[], players: readonly Pick<Player, 'id' | 'averageOverride'>[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of players) if (p.averageOverride) out.set(p.id, p.averageOverride);
  for (const r of rows) if (r.average > 0) out.set(r.playerId, r.average);
  return out;
}

/** «Ana · Luis · Pedro» (los nombres de pila). */
const firstNames = (names: readonly string[]) => names.map((n) => n.trim().split(/\s+/)[0] || n).join(' · ');

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
