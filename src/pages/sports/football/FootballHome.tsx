import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { CalendarPlus, Download, Medal, Plus, Radio, ShieldAlert, Shirt, Trophy } from 'lucide-react';
import { isOpen } from '../../../lib/data/matches';
import { useNow } from '../../../lib/useNow';
import { ScheduleList } from '../../../components/match';
import { useAction } from '../../../components/feedback';
import { Button, Card, Empty, ListSkeleton, LoadError, Position } from '../../../components/ui';
import { Convocatoria } from '../team/Convocatoria';
import { currentRound, upcomingFor } from '../team/logic';
import { ScheduleBuilder, SingleMatchModal } from '../team/ScheduleBuilder';
import { SectionHead, TeamName } from '../team/TeamBits';
import { TournamentAdvance, TournamentBuilder } from '../team/TournamentBuilder';
import { useTeamLeague, type TeamLeague } from '../team/useTeamLeague';
import { REASON_TEXT, SuspendedNotice } from './bits';
import { exportFootballExcel } from './excel';
import FootballEvent from './FootballEvent';
import { FootballMatchCard } from './FootballGames';
import { disciplineFrom, footballConfigFrom, footballTeamRules, formatOf, knockoutRules, matchMinutes, templateOf, variantOf } from './rules';
import { groupRanking, suspendedIn, useFootballSeason, type FootballSeason } from './season';

/**
 * Inicio de la liga de fútbol o sala (Calendario): lo que está en vivo, mi próximo partido con su convocatoria (y
 * si hay suspendidos), los suspendidos para la próxima jornada, la jornada que toca y las que siguen, y lo primero
 * de la tabla. El admin arma el calendario (liga) o el torneo relámpago desde aquí.
 */
export default function FootballHome() {
  const tl = useTeamLeague();
  const season = useFootballSeason(tl);
  const now = useNow(30_000).getTime();
  const [building, setBuilding] = useState<'liga' | 'relampago' | null>(null);
  const [single, setSingle] = useState(false);
  const variant = variantOf(tl.league.sport);
  const config = footballConfigFrom(tl.rules.data, variant);
  const teamRules = footballTeamRules(tl.rules.data, variant);
  const format = formatOf(tl.rules.data);
  const template = templateOf(tl.rules.data, variant);
  const discipline = disciplineFrom(tl.rules.data);

  const matches = tl.matches.data;
  const live = matches.filter((m) => m.status === 'live' || m.status === 'suspended');
  const myTeamIds = tl.myTeams.map((x) => x.team.id);
  const next = upcomingFor(matches, myTeamIds, now).find((m) => m.status === 'scheduled' || m.status === 'postponed');
  const nextSuspended = useMemo(() => (next ? suspendedIn(season.disciplineMatches, next.id, discipline, season.adjustments) : []), [next, season, discipline]);
  const round = currentRound(matches);
  const open = useMemo(() => matches.filter((m) => isOpen(m) || m.status === 'postponed'), [matches]);
  const thisRound = round == null ? [] : matches.filter((m) => m.round === round && m.status !== 'live' && m.status !== 'suspended');
  const later = open.filter((m) => m.round !== round && m.status !== 'live' && m.status !== 'suspended');

  // Torneo sin liga (el relámpago): su inicio es el del torneo, no el calendario de una liga.
  if (tl.league.kind === 'torneo') return <FootballEvent />;
  if (tl.matches.error) return <LoadError error={tl.matches.error} />;

  return (
    <div className="flex flex-col gap-5">
      {tl.isAdmin && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            icon={format === 'relampago' ? <Trophy className="size-4" /> : <CalendarPlus className="size-4" />}
            disabled={tl.teams.data.length < 2}
            onClick={() => setBuilding(format)}
          >
            {format === 'relampago' ? 'Armar el torneo' : 'Armar calendario'}
          </Button>
          <Button icon={<Plus className="size-4" />} disabled={tl.teams.data.length < 2} onClick={() => setSingle(true)}>
            Partido suelto
          </Button>
          <Link to={`${tl.base}/admin?tab=equipos`} className="text-sm font-medium text-accent">
            Equipos y reglas
          </Link>
        </div>
      )}

      <TournamentAdvance tl={tl} rankGroup={(stage) => groupRanking(season, matches, stage, now)} />

      {tl.isAdmin && !tl.teams.loading && tl.teams.data.length < 2 && (
        <Card className="flex items-start gap-3 px-4 py-4">
          <Shirt className="mt-0.5 size-6 shrink-0 text-accent" />
          <div className="text-sm">
            <p className="font-semibold">Primero, los equipos</p>
            <p className="text-muted">Crea los equipos de la temporada (nombre, color y plantilla con dorsales). Después armas el calendario o el torneo.</p>
            <Link to={`${tl.base}/admin?tab=equipos`} className="mt-2 inline-block font-medium text-accent">
              Crear los equipos →
            </Link>
          </div>
        </Card>
      )}

      {live.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionHead
            title={
              <span className="flex items-center gap-1.5 text-ok">
                <Radio className="size-4" /> En vivo
              </span>
            }
          />
          <div className="grid gap-2 sm:grid-cols-2">
            {live.map((m) => (
              <FootballMatchCard key={m.id} tl={tl} match={m} now={now} />
            ))}
          </div>
        </section>
      )}

      {next && (
        <section className="flex flex-col gap-2">
          <SectionHead title="Tu próximo partido" />
          <FootballMatchCard tl={tl} match={next} now={now} />
          <SuspendedNotice tl={tl} list={nextSuspended.filter((s) => myTeamIds.includes(s.team))} title="Suspendidos de tu equipo para este partido" />
          <Convocatoria tl={tl} match={next} minPlayers={teamRules.minPlayers} compact flags={new Map(nextSuspended.map((s) => [s.player, 'Suspendido'] as const))} />
        </section>
      )}

      <SuspendedCard tl={tl} season={season} />

      <section className="flex flex-col gap-2">
        <SectionHead title={round != null ? `Jornada ${round}` : 'Calendario'} />
        {tl.matches.loading && !matches.length ? (
          <ListSkeleton rows={3} />
        ) : !matches.length ? (
          <Empty icon={<CalendarPlus className="size-8" />} title="Todavía no hay calendario">
            {tl.isAdmin
              ? format === 'relampago'
                ? 'Arma el torneo con el botón de arriba: grupos de todos contra todos y después la final.'
                : 'Arma el calendario con el botón de arriba: todos contra todos, de ida o de ida y vuelta.'
              : 'Cuando el admin arme el calendario, los partidos salen aquí.'}
          </Empty>
        ) : thisRound.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {thisRound.map((m) => (
              <FootballMatchCard key={m.id} tl={tl} match={m} now={now} />
            ))}
          </div>
        ) : (
          !live.length && <p className="text-sm text-muted">No hay partidos pendientes en esta jornada.</p>
        )}
      </section>

      {later.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionHead
            title="Lo que sigue"
            action={
              <Link to={`${tl.base}/juegos`} className="text-sm font-medium text-accent">
                Todos los partidos
              </Link>
            }
          />
          <ScheduleList matches={later.slice(0, 12)} groupBy="round" roundWord="Jornada" tz={tl.tz} now={now} renderMatch={(m) => <FootballMatchCard tl={tl} match={m} now={now} />} />
        </section>
      )}

      <TablePreview tl={tl} season={season} />

      {matches.length > 0 && <ExcelButton tl={tl} season={season} />}

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
      <SingleMatchModal tl={tl} open={single} onClose={() => setSingle(false)} format={variant} minutes={matchMinutes(config)} />
    </div>
  );
}

/** Suspendidos para el próximo partido de cada equipo (la app avisa; el admin decide). */
export function SuspendedCard({ tl, season }: { tl: TeamLeague; season: FootballSeason }) {
  if (!season.suspendedNext.length) return null;
  return (
    <section className="flex flex-col gap-2">
      <SectionHead
        title={
          <span className="flex items-center gap-1.5 text-danger">
            <ShieldAlert className="size-4" /> Suspendidos para la próxima jornada
          </span>
        }
        action={
          <Link to={`${tl.base}/ranking?ver=disciplina`} className="text-sm font-medium text-accent">
            Disciplina
          </Link>
        }
      />
      <Card className="divide-y divide-line overflow-hidden">
        {season.suspendedNext.map((s) => (
          <div key={`${s.team}:${s.player}`} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <span className="min-w-0 flex-1">
              <Link to={`${tl.base}/j/${s.player}`} className="block truncate font-medium hover:text-accent">
                {tl.nameOf(s.player)}
              </Link>
              <TeamName team={tl.teamOf(s.team)} className="text-xs text-muted" />
            </span>
            <span className="shrink-0 text-right text-xs text-muted">
              {REASON_TEXT[s.reason] ?? s.reason}
              {s.remaining > 1 && <span className="block font-semibold text-danger">{s.remaining} partidos</span>}
            </span>
          </div>
        ))}
      </Card>
    </section>
  );
}

function TablePreview({ tl, season }: { tl: TeamLeague; season: FootballSeason }) {
  const played = season.standings.filter((r) => r.played > 0);
  // Sin la temporada (todavía no llega o no se pudo leer) la tabla mezclaría todas: no sale.
  if (!tl.season || !played.length) return null;
  const rows = season.groups.length ? season.groups.flatMap((g) => g.rows.slice(0, 2)) : season.standings.slice(0, 5);
  return (
    <section className="flex flex-col gap-2">
      <SectionHead
        title={season.groups.length ? 'Punteros de los grupos' : 'Tabla'}
        action={
          <Link to={`${tl.base}/ranking`} className="flex items-center gap-1 text-sm font-medium text-accent">
            <Medal className="size-4" /> Ver todo
          </Link>
        }
      />
      <Card className="divide-y divide-line overflow-hidden">
        {rows.map((r, i) => (
          <div key={`${r.id}:${i}`} className="flex items-center gap-3 px-4 py-2.5">
            <Position pos={r.rank} />
            <TeamName team={tl.teamOf(r.id)} label="Equipo" className="flex-1 font-medium" />
            <span className="text-xs text-muted tabular-nums">
              {r.won}-{r.drawn}-{r.lost} · {r.diff > 0 ? `+${r.diff}` : r.diff}
            </span>
            <span className="w-8 text-right font-bold tabular-nums">{r.points}</span>
          </div>
        ))}
      </Card>
      {season.scorers[0]?.goals > 0 && (
        <p className="flex items-center gap-1.5 text-sm text-muted">
          <Trophy className="size-4 text-gold" />
          Goleador: <b className="text-fg">{tl.nameOf(season.scorers[0].player)}</b> ({season.scorers[0].goals} {season.scorers[0].goals === 1 ? 'gol' : 'goles'})
        </p>
      )}
    </section>
  );
}

/** Descargar la temporada en Excel: calendario, tabla, goleadores, tarjetas y disciplina. `label` = la temporada (va en el nombre del archivo). */
export function ExcelButton({ tl, season, label }: { tl: TeamLeague; season: FootballSeason; label?: string | null }) {
  const run = useAction();
  const [busy, setBusy] = useState(false);
  const teamName = (key: string) => tl.teamOf(key)?.name ?? '(equipo borrado)';
  return (
    <Button
      className="self-start"
      icon={<Download className="size-4" />}
      loading={busy}
      onClick={async () => {
        setBusy(true);
        const leagueName = label ? `${tl.league.name} - ${label}` : tl.league.name;
        await run(() => exportFootballExcel({ leagueName, matches: season.matches, season, teamName, playerName: tl.nameOf, tz: tl.tz }));
        setBusy(false);
      }}
    >
      Descargar Excel
    </Button>
  );
}
