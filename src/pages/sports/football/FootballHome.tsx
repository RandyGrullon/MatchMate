import { useMemo, useState } from 'react';
import { useNow } from '../../../lib/useNow';
import { useAction } from '../../../components/feedback';
import { ExcelButton as ExcelPill } from '../../../components/event/EventHeader';
import { Card, ListRow, SectionHeader } from '../../../components/ui';
import { ScheduleBuilder } from '../team/ScheduleBuilder';
import { TeamHomeView } from '../team/TeamHome';
import { SectionLink, TeamCrest } from '../team/TeamUi';
import { TournamentAdvance, TournamentBuilder } from '../team/TournamentBuilder';
import { useTeamLeague, type TeamLeague } from '../team/useTeamLeague';
import { recordLine } from '../team/view';
import { upcomingFor } from '../team/logic';
import { REASON_TEXT } from './bits';
import { exportFootballExcel } from './excel';
import FootballEvent from './FootballEvent';
import { FootballMatchCard } from './FootballGames';
import { disciplineFrom, footballConfigFrom, footballTeamRules, formatOf, knockoutRules, matchMinutes, templateOf, variantOf } from './rules';
import { groupRanking, suspendedIn, useFootballSeason, type FootballSeason } from './season';

/**
 * Inicio de la liga de fútbol o sala (rediseño «Calma y foco», ../team/TeamHome): lo que está en vivo, tu próximo
 * partido con tu convocatoria en un toque (y si hay suspendidos de tu equipo), los suspendidos para la próxima jornada,
 * los próximos partidos y los últimos resultados como filas, y los primeros de la tabla (o los punteros de los grupos)
 * con el goleador. Sin partidos, quien organiza arma el calendario o el torneo relámpago desde aquí.
 */
export default function FootballHome() {
  const tl = useTeamLeague();
  const season = useFootballSeason(tl);
  const now = useNow(30_000).getTime();
  const [building, setBuilding] = useState<'liga' | 'relampago' | null>(null);
  const variant = variantOf(tl.league.sport);
  const config = footballConfigFrom(tl.rules.data, variant);
  const teamRules = footballTeamRules(tl.rules.data, variant);
  const format = formatOf(tl.rules.data);
  const template = templateOf(tl.rules.data, variant);
  const discipline = disciplineFrom(tl.rules.data);
  const matches = tl.matches.data;
  const myTeamIds = tl.myTeams.map((x) => x.team.id);
  const next = upcomingFor(matches, myTeamIds, now).find((m) => m.status === 'scheduled' || m.status === 'postponed');
  const nextSuspended = useMemo(() => (next ? suspendedIn(season.disciplineMatches, next.id, discipline, season.adjustments) : []), [next, season, discipline]);

  // Torneo sin liga (el relámpago): su inicio es el del torneo, no el calendario de una liga.
  if (tl.league.kind === 'torneo') return <FootballEvent />;

  const played = season.standings.some((r) => r.played > 0);
  const rows = season.groups.length ? season.groups.flatMap((g) => g.rows.slice(0, 2)) : season.standings.slice(0, 4);
  const scorer = season.scorers[0]?.goals > 0 ? season.scorers[0] : null;
  const mineSusp = nextSuspended.filter((s) => myTeamIds.includes(s.team));
  const meSusp = mineSusp.some((s) => s.player === tl.myPlayerId);

  return (
    <>
      <TeamHomeView
        tl={tl}
        now={now}
        minPlayers={teamRules.minPlayers}
        renderLive={(m) => <FootballMatchCard tl={tl} match={m} now={now} />}
        nextAlert={() =>
          meSusp ? 'Estás suspendido para este partido' : mineSusp.length ? `Suspendidos: ${mineSusp.map((s) => tl.nameOf(s.player)).join(', ')}` : null
        }
        extra={
          <>
            {tl.isAdmin && <TournamentAdvance tl={tl} rankGroup={(stage) => groupRanking(season, matches, stage, now)} />}
            <SuspendedCard tl={tl} season={season} />
          </>
        }
        table={{
          title: season.groups.length ? 'Punteros de los grupos' : 'Tabla',
          rows: played ? rows.map((r) => ({ id: r.id, rank: r.rank, points: r.points, line: recordLine(r, true) })) : [],
          footer: scorer ? `Goleador: ${tl.nameOf(scorer.player)} · ${scorer.goals} ${scorer.goals === 1 ? 'gol' : 'goles'}` : null,
        }}
        build={{ label: format === 'relampago' ? 'Armar el torneo' : 'Armar calendario', relampago: format === 'relampago', onClick: () => setBuilding(format) }}
      />
      {tl.isAdmin && (
        <>
          <ScheduleBuilder
            tl={tl}
            open={building === 'liga'}
            onClose={() => setBuilding(null)}
            format={variant}
            minutes={matchMinutes(config)}
            defaultDouble={template?.double ?? variant === 'football'}
          />
          <TournamentBuilder
            tl={tl}
            open={building === 'relampago'}
            onClose={() => setBuilding(null)}
            format={variant}
            slotMinutes={matchMinutes(config) - 5}
            knockoutRules={knockoutRules(tl.rules.data, variant)}
          />
        </>
      )}
    </>
  );
}

/**
 * «Suspendidos para la próxima jornada · Disciplina»: cada uno como fila con su equipo y por qué (la app avisa; el admin
 * decide). Sin suspendidos, no sale.
 */
export function SuspendedCard({ tl, season, link = true }: { tl: TeamLeague; season: FootballSeason; link?: boolean }) {
  if (!season.suspendedNext.length) return null;
  return (
    <section aria-labelledby="fb-suspendidos">
      <SectionHeader id="fb-suspendidos" title="Suspendidos" action={link ? <SectionLink to={`${tl.base}/ranking?ver=disciplina`}>Disciplina</SectionLink> : undefined} />
      <Card className="overflow-hidden">
        {season.suspendedNext.map((s) => {
          const team = tl.teamOf(s.team);
          return (
            <ListRow
              key={`${s.team}:${s.player}`}
              leading={<TeamCrest team={team} label="Equipo" />}
              title={tl.nameOf(s.player)}
              subtitle={`${team?.name ?? 'Su equipo'} · ${REASON_TEXT[s.reason] ?? s.reason}`}
              trailing={s.remaining > 1 ? <span className="text-sm font-semibold text-danger">{s.remaining} partidos</span> : <span className="text-sm text-muted">1 partido</span>}
              to={`${tl.base}/j/${s.player}`}
            />
          );
        })}
      </Card>
    </section>
  );
}

/**
 * «Excel» (píldora de la barra de arriba de la Tabla, en Pro): la temporada con el calendario, la tabla, los goleadores,
 * las tarjetas y la disciplina. `label` = la temporada (va en el nombre del archivo).
 */
export function ExcelButton({ tl, season, label }: { tl: TeamLeague; season: FootballSeason; label?: string | null }) {
  const run = useAction();
  const [busy, setBusy] = useState(false);
  const teamName = (key: string) => tl.teamOf(key)?.name ?? '(equipo borrado)';
  return (
    <ExcelPill
      busy={busy}
      onClick={async () => {
        setBusy(true);
        const leagueName = label ? `${tl.league.name} - ${label}` : tl.league.name;
        await run(() => exportFootballExcel({ leagueName, matches: season.matches, season, teamName, playerName: tl.nameOf, tz: tl.tz }));
        setBusy(false);
      }}
    />
  );
}
