import { Link, useParams } from 'react-router';
import { CalendarDays, Shirt, UserRound } from 'lucide-react';
import { compareMatches } from '../../../lib/data/matches';
import { useNow } from '../../../lib/useNow';
import { whenText } from '../../../components/match/format';
import { Badge, Card, Empty, Loading } from '../../../components/ui';
import { Convocatoria } from '../team/Convocatoria';
import { upcomingFor } from '../team/logic';
import { SectionHead, TeamName } from '../team/TeamBits';
import { RosterEditor } from '../team/TeamsManager';
import { useTeamLeague, type TeamLeague } from '../team/useTeamLeague';
import { BasketballMatchCard, matchLink } from './BasketballGames';
import { BASKETBALL_POSITIONS } from './bits';
import { basketballTeamRules } from './rules';
import { useBasketballSeason, type BasketballSeason } from './season';

const ROLE: Record<string, string> = { captain: 'Capitán', delegate: 'Delegado', player: 'Jugador' };

/** Mi equipo y mis números (/l/:lid/perfil): plantilla (el capitán o delegado la maneja), próximos partidos con su convocatoria y mis estadísticas. */
export function BasketballMyProfile() {
  const tl = useTeamLeague();
  const season = useBasketballSeason(tl);
  const now = useNow(60_000).getTime();
  const rules = basketballTeamRules(tl.rules.data);
  if (!tl.myPlayerId) {
    return (
      <Empty icon={<UserRound className="size-8" />} title="Todavía no tienes jugador en esta liga">
        Únete a la liga (o pide al admin que te vincule con tu nombre) para ver tu equipo y tus números.
      </Empty>
    );
  }
  const upcoming = upcomingFor(
    tl.matches.data,
    tl.myTeams.map((x) => x.team.id),
    now,
  ).slice(0, 3);
  return (
    <div className="flex flex-col gap-5">
      {!tl.myTeams.length && (
        <Card className="flex items-start gap-3 px-4 py-4 text-sm">
          <Shirt className="mt-0.5 size-6 shrink-0 text-accent" />
          <p>Todavía no estás en la plantilla de ningún equipo. El admin o el capitán de tu equipo te agrega.</p>
        </Card>
      )}
      {tl.myTeams.map(({ team, role }) => (
        <section key={team.id} className="flex flex-col gap-2">
          <SectionHead
            title={
              <span className="flex items-center gap-2">
                <TeamName team={team} className="text-base text-fg" /> <Badge tone="accent">{ROLE[role]}</Badge>
              </span>
            }
          />
          <Card className="px-4 py-3">
            {role !== 'player' || tl.isAdmin ? (
              <RosterEditor tl={tl} team={team} canRoles={tl.isAdmin} positions={BASKETBALL_POSITIONS} />
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {team.roster.map((r) => (
                  <li key={r.playerId} className="flex items-center gap-2 py-2 text-sm">
                    <span className="w-8 font-bold tabular-nums">{r.jersey ?? '–'}</span>
                    <span className="flex-1 truncate">{tl.nameOf(r.playerId)}</span>
                    {r.role !== 'player' && <Badge>{ROLE[r.role]}</Badge>}
                    {r.position && <span className="text-xs text-muted">{r.position}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      ))}
      {upcoming.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionHead title="Mis próximos partidos" />
          {upcoming.map((m) => (
            <div key={m.id} className="flex flex-col gap-2">
              <BasketballMatchCard tl={tl} match={m} now={now} />
              {(m.status === 'scheduled' || m.status === 'postponed') && <Convocatoria tl={tl} match={m} minPlayers={rules.minPlayers} compact />}
            </div>
          ))}
        </section>
      )}
      <PlayerStats tl={tl} playerId={tl.myPlayerId} season={season} />
    </div>
  );
}

/** Perfil de un jugador (/l/:lid/j/:playerId): su equipo y sus números de la temporada. */
export function BasketballPlayer() {
  const { playerId } = useParams();
  const tl = useTeamLeague();
  const season = useBasketballSeason(tl);
  if (!playerId) return null;
  const player = tl.players.data.find((p) => p.id === playerId);
  if (!player) return tl.players.loading ? <Loading /> : <Empty title="Este jugador ya no está en la liga" />;
  const teams = tl.teams.data.filter((t) => t.roster.some((r) => r.playerId === playerId));
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold">{player.name}</h1>
        <div className="flex flex-wrap gap-2 text-sm text-muted">
          {teams.map((t) => {
            const r = t.roster.find((x) => x.playerId === playerId)!;
            return (
              <span key={t.id} className="flex items-center gap-1.5">
                <TeamName team={t} />
                {r.jersey != null && <b className="tabular-nums">#{r.jersey}</b>}
                {r.position && <span>· {r.position}</span>}
                {r.role !== 'player' && <Badge>{ROLE[r.role]}</Badge>}
              </span>
            );
          })}
        </div>
      </div>
      <PlayerStats tl={tl} playerId={playerId} season={season} />
    </div>
  );
}

/** Puntos por partido, triples, tiros libres, faltas y partidos jugados (de las listas de presentes). */
export function PlayerStats({ tl, playerId, season }: { tl: TeamLeague; playerId: string; season: BasketballSeason }) {
  const totals = season.leaders.find((l) => l.player === playerId);
  const byId = new Map(tl.matches.data.map((m) => [m.id, m] as const));
  const games = season.lines
    .filter((l) => l.player === playerId)
    .map((l) => ({ l, m: byId.get(l.matchId)! }))
    .filter((x) => x.m)
    .sort((a, b) => compareMatches(b.m, a.m));
  const rank = totals ? season.leaders.indexOf(totals) + 1 : null;
  const stat = (label: string, value: string | number) => (
    <Card className="flex flex-col gap-0.5 px-4 py-3">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-2xl font-bold tabular-nums">{value}</span>
    </Card>
  );
  return (
    <section className="flex flex-col gap-3">
      <SectionHead title="Temporada" action={rank ? <Badge tone="accent">#{rank} en anotadores</Badge> : undefined} />
      {!totals ? (
        <Empty icon={<CalendarDays className="size-8" />} title="Todavía sin partidos">
          Los números salen de los partidos confirmados donde la mesa marcó los presentes.
        </Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stat('Partidos', totals.games)}
            {stat('Puntos', totals.points)}
            {stat('Por partido', totals.avg.toLocaleString('es-DO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }))}
            {stat('Máximo', totals.high)}
            {stat('Triples', totals.threes)}
            {stat('Tiros libres', totals.ftm)}
            {stat('Faltas', totals.fouls)}
            {stat('Faltas por partido', (Math.round((totals.fouls / totals.games) * 10) / 10).toLocaleString('es-DO'))}
          </div>
          <Card className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="px-3 py-2 text-left font-medium">Partido</th>
                  <th className="px-2 py-2 text-right font-medium">PTS</th>
                  <th className="px-2 py-2 text-right font-medium">3P</th>
                  <th className="px-2 py-2 text-right font-medium">TL</th>
                  <th className="px-2 py-2 text-right font-medium">F</th>
                </tr>
              </thead>
              <tbody>
                {games.map(({ l, m }) => {
                  const rival = m.sides[l.side === 1 ? 1 : 0];
                  return (
                    <tr key={l.matchId} className="border-b border-line last:border-0">
                      <td className="max-w-48 px-3 py-2">
                        <Link to={matchLink(tl.base, m.id)} className="block truncate font-medium hover:text-accent">
                          vs. {tl.teamOf(rival.teamId)?.name ?? rival.label}
                        </Link>
                        <span className="block truncate text-xs text-muted">
                          {[m.round != null ? `Jornada ${m.round}` : m.stage, whenText(m.scheduledAt, tl.tz)].filter(Boolean).join(' · ')}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right font-bold">{l.points}</td>
                      <td className="px-2 py-2 text-right">{l.threes}</td>
                      <td className="px-2 py-2 text-right">{l.ones}</td>
                      <td className="px-2 py-2 text-right">{l.fouls}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </section>
  );
}
