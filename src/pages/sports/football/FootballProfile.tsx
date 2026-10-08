import { Link, useParams } from 'react-router';
import { CalendarDays, ShieldAlert, UserRound } from 'lucide-react';
import { compareMatches } from '../../../lib/data/matches';
import { useNow } from '../../../lib/useNow';
import { flipScoreText } from '../../../components/match/format';
import { useIsPro } from '../../../components/mode';
import { Card, Empty, ListRow, Loading, SectionHeader, cx } from '../../../components/ui';
import { upcomingFor } from '../team/logic';
import { RosterEditor } from '../team/TeamsManager';
import { HistoryBackBar, MatchRows, NextMatchCard, ScreenTitle, StatTiles, TeamCrest, matchLink } from '../team/TeamUi';
import { useTeamLeague, type TeamLeague } from '../team/useTeamLeague';
import { matchDayLabel, todayIn } from '../team/view';
import { CardIcon, FOOTBALL_POSITIONS } from './bits';
import { REASON_TEXT, disciplineFrom, footballTeamRules, variantOf } from './rules';
import { suspendedIn, useFootballSeason, type FootballSeason } from './season';

const ROLE: Record<string, string> = { captain: 'Capitán', delegate: 'Delegado', player: 'Jugador' };

/** «Capitán · #8 · Medio» de un jugador en un equipo. */
const rosterLine = (r: { role: string; jersey: number | null; position: string | null }) =>
  [r.role !== 'player' ? ROLE[r.role] : null, r.jersey != null ? `#${r.jersey}` : null, r.position].filter(Boolean).join(' · ');

/**
 * Mi equipo y mis números (/l/:lid/perfil), rediseño «Calma y foco»: «‹ Liga» arriba (la barra de la liga), el título
 * con tu equipo y tu rol, si estás suspendido, «Tu próximo partido» con tu convocatoria en un toque (y si hay
 * suspendidos de tu equipo), tus números de esta liga (campo o sala: nunca se mezclan; en Pro, todos y partido por
 * partido), la plantilla como filas (el capitán o delegado la maneja) y los partidos que siguen.
 */
export function FootballMyProfile() {
  const tl = useTeamLeague();
  const pro = useIsPro();
  const season = useFootballSeason(tl);
  const now = useNow(60_000).getTime();
  const variant = variantOf(tl.league.sport);
  const rules = footballTeamRules(tl.rules.data, variant);
  const discipline = disciplineFrom(tl.rules.data);
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
  const myTeamIds = tl.myTeams.map((x) => x.team.id);
  const upcoming = upcomingFor(tl.matches.data, myTeamIds, now).slice(0, 3);
  const [next, ...later] = upcoming;
  const first = tl.myTeams[0];
  const mine = first?.team.roster.find((r) => r.playerId === tl.myPlayerId);
  const nextSusp = next && (next.status === 'scheduled' || next.status === 'postponed') ? suspendedIn(season.disciplineMatches, next.id, discipline, season.adjustments) : [];
  const teamSusp = nextSusp.filter((s) => myTeamIds.includes(s.team) && s.player !== tl.myPlayerId);
  return (
    <div className="flex flex-col px-2">
      <ScreenTitle title={first ? first.team.name : 'Mi equipo'} sub={first ? (mine ? rosterLine(mine) : ROLE[first.role]) || 'Jugador' : null} pro={pro} />
      <SuspensionBanner tl={tl} playerId={tl.myPlayerId} season={season} mine className="mt-5" />
      {!tl.myTeams.length && (
        <Card className="mt-5 px-5 py-[18px]">
          <p className="font-semibold">Todavía no estás en un equipo</p>
          <p className="mt-0.5 text-meta text-muted">El admin o el capitán de tu equipo te agrega a la plantilla.</p>
        </Card>
      )}
      {next && (next.status === 'scheduled' || next.status === 'postponed') && (
        <NextMatchCard
          tl={tl}
          match={next}
          minPlayers={rules.minPlayers}
          alert={teamSusp.length ? `Suspendidos: ${teamSusp.map((s) => tl.nameOf(s.player)).join(', ')}` : undefined}
          className="mt-5"
        />
      )}
      <PlayerStats tl={tl} playerId={tl.myPlayerId} season={season} title="Mis números" className="mt-[30px]" />
      {tl.myTeams.map(({ team, role }) => (
        <section key={team.id} aria-label={`Plantilla de ${team.name}`} className="mt-[30px]">
          <SectionHeader
            title={tl.myTeams.length > 1 ? team.name : 'Plantilla'}
            action={<span className="text-meta text-muted">{`${team.roster.length} ${team.roster.length === 1 ? 'jugador' : 'jugadores'}`}</span>}
          />
          <RosterEditor tl={tl} team={team} canRoles={tl.isAdmin} positions={FOOTBALL_POSITIONS} readOnly={role === 'player' && !tl.isAdmin} />
        </section>
      ))}
      {later.length > 0 && (
        <section aria-labelledby="fb-mis-proximos" className="mt-[30px]">
          <SectionHeader id="fb-mis-proximos" title="Después" />
          <MatchRows tl={tl} matches={later} now={now} highlight={false} />
        </section>
      )}
    </div>
  );
}

/**
 * Perfil de un jugador (/l/:lid/j/:playerId): «‹ Liga» (vuelve a donde estaba), su nombre con su equipo, dorsal y
 * posición, si está suspendido y sus números de la temporada. Debajo, sus insignias (las pone LeagueShell).
 */
export function FootballPlayer() {
  const { playerId } = useParams();
  const tl = useTeamLeague();
  const pro = useIsPro();
  const season = useFootballSeason(tl);
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
      <SuspensionBanner tl={tl} playerId={playerId} season={season} className="mt-5" />
      <PlayerStats tl={tl} playerId={playerId} season={season} title="Temporada" className="mt-[26px]" />
    </div>
  );
}

/** «Suspendido para el próximo partido» (de la disciplina de la temporada), en rojo suave. */
function SuspensionBanner({ tl, playerId, season, mine, className }: { tl: TeamLeague; playerId: string; season: FootballSeason; mine?: boolean; className?: string }) {
  const list = season.suspendedNext.filter((s) => s.player === playerId);
  if (!list.length) return null;
  return (
    <div role="status" className={cx('flex items-start gap-3 rounded-[20px] bg-danger-soft px-[18px] py-3.5 text-sm text-danger', className)}>
      <ShieldAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold">{mine ? 'Estás suspendido para el próximo partido' : 'Suspendido para el próximo partido'}</p>
        {list.map((s) => (
          <p key={s.team}>
            {tl.teamOf(s.team)?.name ?? 'Su equipo'}: {REASON_TEXT[s.reason] ?? s.reason}
            {s.remaining > 1 ? ` · le faltan ${s.remaining} partidos` : ''}.
          </p>
        ))}
      </div>
    </div>
  );
}

/** Las tarjetas de un partido (la doble amarilla, amarilla sobre roja). */
function Cards({ yellows, red }: { yellows: number; red: 'direct' | 'second_yellow' | null }) {
  if (red === 'second_yellow') return <CardIcon kind="second_yellow" />;
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: yellows }, (_, k) => (
        <CardIcon key={k} kind="yellow" />
      ))}
      {red === 'direct' && <CardIcon kind="red" />}
    </span>
  );
}

/**
 * Partidos, goles, asistencias, tarjetas y, si atajó, vallas invictas y goles recibidos: en Lite los cuatro de siempre y
 * los últimos partidos como filas; en Pro todos y la tabla partido por partido.
 */
export function PlayerStats({ tl, playerId, season, title = 'Temporada', className }: { tl: TeamLeague; playerId: string; season: FootballSeason; title?: string; className?: string }) {
  const pro = useIsPro();
  const totals = season.scorers.find((l) => l.player === playerId);
  const cards = season.cards.find((c) => c.player === playerId);
  const byId = new Map(tl.matches.data.map((m) => [m.id, m] as const));
  const games = season.lines
    .filter((l) => l.playerId === playerId && (l.played || l.yellows || l.red))
    .map((l) => ({ l, m: byId.get(l.matchId)! }))
    .filter((x) => x.m)
    .sort((a, b) => compareMatches(b.m, a.m));
  const rank = totals && totals.goals > 0 ? season.scorers.indexOf(totals) + 1 : null;
  const today = todayIn(tl.tz);
  const keeper = !!totals && totals.keeperGames > 0;
  const rival = (g: (typeof games)[number]) => {
    const r = g.m.sides[g.l.side === 1 ? 1 : 0];
    return tl.teamOf(r.teamId)?.name ?? r.label;
  };
  const score = (g: (typeof games)[number]) => (typeof g.m.score?.text === 'string' ? (g.l.side === 1 ? g.m.score.text : flipScoreText(g.m.score.text)) : '');
  const when = (g: (typeof games)[number]) =>
    [g.m.stage || (g.m.round != null ? `Jornada ${g.m.round}` : ''), matchDayLabel(g.m.scheduledAt, tl.tz, today)].filter(Boolean).join(' · ') +
    (g.l.keeper && g.l.played ? ` · portero${g.l.cleanSheet ? ', valla invicta' : ''}` : '') +
    (!g.l.played ? ' · no jugó' : '');
  return (
    <section aria-labelledby={`fb-numeros-${playerId}`} className={className}>
      <SectionHeader id={`fb-numeros-${playerId}`} title={title} action={rank ? <span className="text-meta font-semibold text-accent">#{rank} en goleadores</span> : undefined} />
      {!totals && !games.length ? (
        <Empty icon={<CalendarDays className="size-8" />} title="Todavía sin partidos">
          Salen de los partidos confirmados donde el anotador marcó la alineación.
        </Empty>
      ) : (
        <div className="flex flex-col gap-3.5">
          <StatTiles
            dense={pro}
            items={[
              { label: 'Partidos', value: totals?.games ?? 0 },
              { label: 'Goles', value: totals?.goals ?? 0 },
              { label: 'Asistencias', value: totals?.assists ?? 0 },
              ...(pro || !keeper ? [{ label: 'Tarjetas', value: (cards?.yellows ?? 0) + (cards?.reds ?? 0) + (cards?.secondYellows ?? 0) }] : []),
              ...(keeper && !pro ? [{ label: 'Vallas invictas', value: totals.cleanSheets }] : []),
              ...(pro
                ? [
                    { label: 'Amarillas', value: cards?.yellows ?? 0 },
                    { label: 'Rojas', value: (cards?.reds ?? 0) + (cards?.secondYellows ?? 0) },
                    ...(keeper ? [{ label: 'Vallas invictas', value: totals.cleanSheets }] : []),
                    ...(keeper ? [{ label: 'Recibidos', value: totals.conceded }] : []),
                    ...(totals && totals.ownGoals > 0 ? [{ label: 'Autogoles', value: totals.ownGoals }] : []),
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
                      <th className="px-1.5 py-3 text-right font-bold">G</th>
                      <th className="px-1.5 py-3 text-right font-bold">A</th>
                      <th className="py-3 pr-4 pl-1.5 text-right font-bold">T</th>
                    </tr>
                  </thead>
                  <tbody>
                    {games.map((g) => (
                      <tr key={g.l.matchId} className="border-t border-line">
                        <td className="w-full max-w-0 py-2.5 pr-2 pl-4">
                          <Link to={matchLink(tl.base, g.m.id)} className="block truncate text-[15px] font-semibold">
                            vs. {rival(g)}
                            {score(g) && <span className="ml-1 font-normal text-muted">{score(g)}</span>}
                          </Link>
                          <span className="block truncate text-[13px] text-muted">{when(g)}</span>
                        </td>
                        <td className="num px-1.5 py-2.5 text-right text-[17px] font-bold">{g.l.goals || ''}</td>
                        <td className="num px-1.5 py-2.5 text-right text-[15px] text-muted">{g.l.assists || ''}</td>
                        <td className="py-2.5 pr-4 pl-1.5 text-right">
                          <Cards yellows={g.l.yellows} red={g.l.red} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              {games.slice(0, 5).map((g) => (
                <ListRow
                  key={g.l.matchId}
                  title={`vs. ${rival(g)}${score(g) ? ` · ${score(g)}` : ''}`}
                  subtitle={when(g)}
                  value={g.l.goals ? g.l.goals : undefined}
                  trailing={g.l.yellows || g.l.red ? <Cards yellows={g.l.yellows} red={g.l.red} /> : undefined}
                  to={matchLink(tl.base, g.m.id)}
                  ariaLabel={`vs. ${rival(g)}: ${g.l.goals} ${g.l.goals === 1 ? 'gol' : 'goles'}`}
                  chevron={false}
                />
              ))}
            </Card>
          )}
        </div>
      )}
    </section>
  );
}
