import { Link, useParams } from 'react-router';
import { CalendarDays, ShieldAlert, Shirt, UserRound } from 'lucide-react';
import { compareMatches } from '../../../lib/data/matches';
import { useNow } from '../../../lib/useNow';
import { flipScoreText, whenText } from '../../../components/match/format';
import { Badge, Card, Empty, Loading } from '../../../components/ui';
import { Convocatoria } from '../team/Convocatoria';
import { upcomingFor } from '../team/logic';
import { SectionHead, TeamName } from '../team/TeamBits';
import { RosterEditor } from '../team/TeamsManager';
import { useTeamLeague, type TeamLeague } from '../team/useTeamLeague';
import { CardIcon, FOOTBALL_POSITIONS } from './bits';
import { FootballMatchCard, matchLink } from './FootballGames';
import { REASON_TEXT, disciplineFrom, footballTeamRules, variantOf } from './rules';
import { suspendedIn, useFootballSeason, type FootballSeason } from './season';

const ROLE: Record<string, string> = { captain: 'Capitán', delegate: 'Delegado', player: 'Jugador' };

/**
 * Mi equipo y mis números (/l/:lid/perfil): plantilla (el capitán o delegado la maneja), próximos partidos con su
 * convocatoria (y si estoy suspendido) y mis estadísticas de esta liga (campo o sala: nunca se mezclan).
 */
export function FootballMyProfile() {
  const tl = useTeamLeague();
  const season = useFootballSeason(tl);
  const now = useNow(60_000).getTime();
  const variant = variantOf(tl.league.sport);
  const rules = footballTeamRules(tl.rules.data, variant);
  const discipline = disciplineFrom(tl.rules.data);
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
      <SuspensionBanner tl={tl} playerId={tl.myPlayerId} season={season} mine />
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
              <RosterEditor tl={tl} team={team} canRoles={tl.isAdmin} positions={FOOTBALL_POSITIONS} />
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
          {upcoming.map((m) => {
            const susp = m.status === 'scheduled' || m.status === 'postponed' ? suspendedIn(season.disciplineMatches, m.id, discipline, season.adjustments) : [];
            return (
              <div key={m.id} className="flex flex-col gap-2">
                <FootballMatchCard tl={tl} match={m} now={now} />
                {(m.status === 'scheduled' || m.status === 'postponed') && (
                  <Convocatoria tl={tl} match={m} minPlayers={rules.minPlayers} compact flags={new Map(susp.map((s) => [s.player, 'Suspendido'] as const))} />
                )}
              </div>
            );
          })}
        </section>
      )}
      <PlayerStats tl={tl} playerId={tl.myPlayerId} season={season} />
    </div>
  );
}

/** Perfil de un jugador (/l/:lid/j/:playerId): su equipo y sus números de la temporada. */
export function FootballPlayer() {
  const { playerId } = useParams();
  const tl = useTeamLeague();
  const season = useFootballSeason(tl);
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
      <SuspensionBanner tl={tl} playerId={playerId} season={season} />
      <PlayerStats tl={tl} playerId={playerId} season={season} />
    </div>
  );
}

/** «Suspendido para el próximo partido» (de la disciplina de la temporada). */
function SuspensionBanner({ tl, playerId, season, mine }: { tl: TeamLeague; playerId: string; season: FootballSeason; mine?: boolean }) {
  const list = season.suspendedNext.filter((s) => s.player === playerId);
  if (!list.length) return null;
  return (
    <Card className="flex items-start gap-3 border-danger px-4 py-3 text-sm">
      <ShieldAlert className="mt-0.5 size-6 shrink-0 text-danger" />
      <div>
        <p className="font-semibold text-danger">{mine ? 'Estás suspendido para el próximo partido' : 'Suspendido para el próximo partido'}</p>
        {list.map((s) => (
          <p key={s.team} className="text-muted">
            {tl.teamOf(s.team)?.name ?? 'Su equipo'}: {REASON_TEXT[s.reason] ?? s.reason}
            {s.remaining > 1 ? ` · le faltan ${s.remaining} partidos` : ''}.
          </p>
        ))}
      </div>
    </Card>
  );
}

/** Partidos, goles, asistencias, tarjetas y, si atajó, vallas invictas y goles recibidos. */
export function PlayerStats({ tl, playerId, season }: { tl: TeamLeague; playerId: string; season: FootballSeason }) {
  const totals = season.scorers.find((l) => l.player === playerId);
  const cards = season.cards.find((c) => c.player === playerId);
  const byId = new Map(tl.matches.data.map((m) => [m.id, m] as const));
  const games = season.lines
    .filter((l) => l.playerId === playerId && (l.played || l.yellows || l.red))
    .map((l) => ({ l, m: byId.get(l.matchId)! }))
    .filter((x) => x.m)
    .sort((a, b) => compareMatches(b.m, a.m));
  const rank = totals && totals.goals > 0 ? season.scorers.indexOf(totals) + 1 : null;
  const stat = (label: string, value: string | number) => (
    <Card className="flex flex-col gap-0.5 px-4 py-3">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-2xl font-bold tabular-nums">{value}</span>
    </Card>
  );
  return (
    <section className="flex flex-col gap-3">
      <SectionHead title="Temporada" action={rank ? <Badge tone="accent">#{rank} en goleadores</Badge> : undefined} />
      {!totals && !games.length ? (
        <Empty icon={<CalendarDays className="size-8" />} title="Todavía sin partidos">
          Los números salen de los partidos confirmados donde el anotador marcó la alineación.
        </Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stat('Partidos', totals?.games ?? 0)}
            {stat('Goles', totals?.goals ?? 0)}
            {stat('Asistencias', totals?.assists ?? 0)}
            {stat('Amarillas', cards?.yellows ?? 0)}
            {stat('Rojas', (cards?.reds ?? 0) + (cards?.secondYellows ?? 0))}
            {totals && totals.keeperGames > 0 && stat('Vallas invictas', totals.cleanSheets)}
            {totals && totals.keeperGames > 0 && stat('Goles recibidos', totals.conceded)}
            {totals && totals.ownGoals > 0 && stat('Autogoles', totals.ownGoals)}
          </div>
          <Card className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="px-3 py-2 text-left font-medium">Partido</th>
                  <th className="px-2 py-2 text-right font-medium">G</th>
                  <th className="px-2 py-2 text-right font-medium">A</th>
                  <th className="px-2 py-2 text-right font-medium">T</th>
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
                          {typeof m.score?.text === 'string' && <span className="ml-1 text-muted">{l.side === 1 ? m.score.text : flipScoreText(m.score.text)}</span>}
                        </Link>
                        <span className="block truncate text-xs text-muted">
                          {[m.stage || (m.round != null ? `Jornada ${m.round}` : ''), whenText(m.scheduledAt, tl.tz)].filter(Boolean).join(' · ')}
                          {l.keeper && l.played ? ` · portero${l.cleanSheet ? ', valla invicta' : ''}` : ''}
                          {!l.played ? ' · no jugó' : ''}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right font-bold">{l.goals || ''}</td>
                      <td className="px-2 py-2 text-right">{l.assists || ''}</td>
                      <td className="px-2 py-2 text-right">
                        <span className="inline-flex items-center gap-0.5">
                          {l.red === 'second_yellow' ? (
                            <CardIcon kind="second_yellow" />
                          ) : (
                            <>
                              {Array.from({ length: l.yellows }, (_, k) => (
                                <CardIcon key={k} kind="yellow" />
                              ))}
                              {l.red === 'direct' && <CardIcon kind="red" />}
                            </>
                          )}
                        </span>
                      </td>
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

