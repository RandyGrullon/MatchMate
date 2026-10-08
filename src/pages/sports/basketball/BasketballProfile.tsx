import { Link, useParams } from 'react-router';
import { CalendarDays, UserRound } from 'lucide-react';
import { compareMatches } from '../../../lib/data/matches';
import { useNow } from '../../../lib/useNow';
import { useIsPro } from '../../../components/mode';
import { Card, Empty, ListRow, Loading, SectionHeader, cx } from '../../../components/ui';
import { upcomingFor } from '../team/logic';
import { RosterEditor } from '../team/TeamsManager';
import { HistoryBackBar, MatchRows, NextMatchCard, ScreenTitle, StatTiles, TeamCrest, matchLink } from '../team/TeamUi';
import { useTeamLeague, type TeamLeague } from '../team/useTeamLeague';
import { matchDayLabel, todayIn } from '../team/view';
import { BASKETBALL_POSITIONS } from './bits';
import { basketballTeamRules } from './rules';
import { useBasketballSeason, type BasketballSeason } from './season';

const ROLE: Record<string, string> = { captain: 'Capitán', delegate: 'Delegado', player: 'Jugador' };

/** «Capitán · #8 · Base» de un jugador en un equipo. */
const rosterLine = (r: { role: string; jersey: number | null; position: string | null }) =>
  [r.role !== 'player' ? ROLE[r.role] : null, r.jersey != null ? `#${r.jersey}` : null, r.position].filter(Boolean).join(' · ');

/**
 * Mi equipo y mis números (/l/:lid/perfil), rediseño «Calma y foco»: «‹ Liga» arriba (la barra de la liga), el título
 * con tu equipo y tu rol, «Tu próximo partido» con tu convocatoria en un toque, tus números de la temporada (en Pro,
 * todos y partido por partido), la plantilla como filas (el capitán o delegado la maneja: toca un jugador o «Agregar
 * jugador») y los partidos que siguen.
 */
export function BasketballMyProfile() {
  const tl = useTeamLeague();
  const pro = useIsPro();
  const season = useBasketballSeason(tl);
  const now = useNow(60_000).getTime();
  const rules = basketballTeamRules(tl.rules.data);
  if (!tl.myPlayerId) {
    return (
      <div className="flex flex-col px-2">
        <ScreenTitle title="Mi equipo" pro={pro} />
        <div className="mt-5">
          <Empty icon={<UserRound className="size-8" />} title="Todavía no tienes jugador en esta liga">
            Únete a la liga (o pide al admin que te vincule con tu nombre) para ver tu equipo y tus números.
          </Empty>
        </div>
      </div>
    );
  }
  const upcoming = upcomingFor(
    tl.matches.data,
    tl.myTeams.map((x) => x.team.id),
    now,
  ).slice(0, 3);
  const [next, ...later] = upcoming;
  const first = tl.myTeams[0];
  const mine = first?.team.roster.find((r) => r.playerId === tl.myPlayerId);
  return (
    <div className="flex flex-col px-2">
      <ScreenTitle title={first ? first.team.name : 'Mi equipo'} sub={first ? (mine ? rosterLine(mine) : ROLE[first.role]) || 'Jugador' : null} pro={pro} />
      {!tl.myTeams.length && (
        <Card className="mt-5 px-5 py-[18px]">
          <p className="font-semibold">Todavía no estás en un equipo</p>
          <p className="mt-0.5 text-meta text-muted">El admin o el capitán de tu equipo te agrega a la plantilla.</p>
        </Card>
      )}
      {next && (next.status === 'scheduled' || next.status === 'postponed') && <NextMatchCard tl={tl} match={next} minPlayers={rules.minPlayers} className="mt-5" />}
      <PlayerStats tl={tl} playerId={tl.myPlayerId} season={season} title="Mis números" className="mt-[30px]" />
      {tl.myTeams.map(({ team, role }) => (
        <section key={team.id} aria-label={`Plantilla de ${team.name}`} className="mt-[30px]">
          <SectionHeader
            title={tl.myTeams.length > 1 ? team.name : 'Plantilla'}
            action={<span className="text-meta text-muted">{`${team.roster.length} ${team.roster.length === 1 ? 'jugador' : 'jugadores'}`}</span>}
          />
          <RosterEditor tl={tl} team={team} canRoles={tl.isAdmin} positions={BASKETBALL_POSITIONS} readOnly={role === 'player' && !tl.isAdmin} />
        </section>
      ))}
      {later.length > 0 && (
        <section aria-labelledby="bb-mis-proximos" className="mt-[30px]">
          <SectionHeader id="bb-mis-proximos" title="Después" />
          <MatchRows tl={tl} matches={later} now={now} highlight={false} />
        </section>
      )}
    </div>
  );
}

/**
 * Perfil de un jugador (/l/:lid/j/:playerId): «‹ Liga» (vuelve a donde estaba), su nombre con su equipo, dorsal y
 * posición, y sus números de la temporada. Debajo, sus insignias (las pone LeagueShell).
 */
export function BasketballPlayer() {
  const { playerId } = useParams();
  const tl = useTeamLeague();
  const pro = useIsPro();
  const season = useBasketballSeason(tl);
  if (!playerId) return null;
  const player = tl.players.data.find((p) => p.id === playerId);
  const bar = <HistoryBackBar label={tl.league.name} fallback={`${tl.base}/ranking`} />;
  if (!player)
    return tl.players.loading ? (
      <Loading />
    ) : (
      <div className="flex flex-col px-2">
        {bar}
        <Empty title="Este jugador ya no está en la liga" />
      </div>
    );
  const teams = tl.teams.data.filter((t) => t.roster.some((r) => r.playerId === playerId));
  return (
    <div className="flex flex-col px-2">
      {bar}
      <ScreenTitle title={player.name} pro={pro} />
      {teams.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5">
          {teams.map((t) => {
            const r = t.roster.find((x) => x.playerId === playerId)!;
            return (
              <p key={t.id} className="flex min-w-0 items-center gap-2 text-meta text-muted">
                <TeamCrest team={t} size={24} />
                <span className="truncate">
                  <b className="font-semibold text-fg-2">{t.name}</b>
                  {rosterLine(r) ? ` · ${rosterLine(r)}` : ''}
                </span>
              </p>
            );
          })}
        </div>
      )}
      <PlayerStats tl={tl} playerId={playerId} season={season} title="Temporada" className="mt-[26px]" />
    </div>
  );
}

/**
 * Los números de la temporada (de las listas de presentes): en Lite, partidos, puntos, por partido y máximo, y los
 * últimos partidos como filas con sus puntos; en Pro, también triples, tiros libres y faltas, y la tabla partido por
 * partido.
 */
export function PlayerStats({ tl, playerId, season, title = 'Temporada', className }: { tl: TeamLeague; playerId: string; season: BasketballSeason; title?: string; className?: string }) {
  const pro = useIsPro();
  const totals = season.leaders.find((l) => l.player === playerId);
  const byId = new Map(tl.matches.data.map((m) => [m.id, m] as const));
  const games = season.lines
    .filter((l) => l.player === playerId)
    .map((l) => ({ l, m: byId.get(l.matchId)! }))
    .filter((x) => x.m)
    .sort((a, b) => compareMatches(b.m, a.m));
  const rank = totals ? season.leaders.indexOf(totals) + 1 : null;
  const today = todayIn(tl.tz);
  const one = (n: number) => n.toLocaleString('es-DO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const rival = (l: (typeof games)[number]['l'], m: (typeof games)[number]['m']) => {
    const r = m.sides[l.side === 1 ? 1 : 0];
    return tl.teamOf(r.teamId)?.name ?? r.label;
  };
  const when = (m: (typeof games)[number]['m']) => [m.round != null ? `Jornada ${m.round}` : m.stage, matchDayLabel(m.scheduledAt, tl.tz, today)].filter(Boolean).join(' · ');
  return (
    <section aria-labelledby={`bb-numeros-${playerId}`} className={className}>
      <SectionHeader id={`bb-numeros-${playerId}`} title={title} action={rank ? <span className="text-meta font-semibold text-accent">#{rank} en anotadores</span> : undefined} />
      {!totals ? (
        <Empty icon={<CalendarDays className="size-8" />} title="Todavía sin partidos">
          Salen de los partidos confirmados donde la mesa marcó los presentes.
        </Empty>
      ) : (
        <div className="flex flex-col gap-3.5">
          <StatTiles
            dense={pro}
            items={[
              { label: 'Partidos', value: totals.games },
              { label: 'Puntos', value: totals.points },
              { label: 'Por partido', value: one(totals.avg) },
              { label: 'Máximo', value: totals.high },
              ...(pro
                ? [
                    { label: 'Triples', value: totals.threes },
                    { label: 'Tiros libres', value: totals.ftm },
                    { label: 'Faltas', value: totals.fouls },
                    { label: 'Faltas/partido', value: (Math.round((totals.fouls / totals.games) * 10) / 10).toLocaleString('es-DO') },
                  ]
                : []),
            ]}
          />
          {pro ? (
            <Card className="overflow-hidden">
              <div className="no-scrollbar overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="text-[11px] font-bold tracking-[0.05em] text-muted uppercase">
                      <th className="py-3 pl-4 text-left font-bold">Partido</th>
                      <th className="px-1.5 py-3 text-right font-bold">PTS</th>
                      <th className="px-1.5 py-3 text-right font-bold">3P</th>
                      <th className="px-1.5 py-3 text-right font-bold">TL</th>
                      <th className="py-3 pr-4 pl-1.5 text-right font-bold">F</th>
                    </tr>
                  </thead>
                  <tbody>
                    {games.map(({ l, m }) => (
                      <tr key={l.matchId} className="border-t border-line">
                        <td className="w-full max-w-0 py-2.5 pr-2 pl-4">
                          <Link to={matchLink(tl.base, m.id)} className="block truncate text-[15px] font-semibold">
                            vs. {rival(l, m)}
                          </Link>
                          <span className="block truncate text-[13px] text-muted">{when(m)}</span>
                        </td>
                        <td className="num px-1.5 py-2.5 text-right text-[17px] font-bold">{l.points}</td>
                        <td className="num px-1.5 py-2.5 text-right text-[15px] text-muted">{l.threes}</td>
                        <td className="num px-1.5 py-2.5 text-right text-[15px] text-muted">{l.ones}</td>
                        <td className={cx('num py-2.5 pr-4 pl-1.5 text-right text-[15px]', l.fouls >= 5 ? 'font-bold text-danger' : 'text-muted')}>{l.fouls}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              {games.slice(0, 5).map(({ l, m }) => (
                <ListRow key={l.matchId} title={`vs. ${rival(l, m)}`} subtitle={when(m)} value={l.points} to={matchLink(tl.base, m.id)} ariaLabel={`vs. ${rival(l, m)}: ${l.points} puntos`} chevron={false} />
              ))}
            </Card>
          )}
        </div>
      )}
    </section>
  );
}
