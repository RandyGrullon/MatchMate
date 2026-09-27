import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { CalendarPlus, Download, Medal, Plus, Radio, Shirt, Trophy } from 'lucide-react';
import { isOpen } from '../../../lib/data/matches';
import { useNow } from '../../../lib/useNow';
import { ScheduleList } from '../../../components/match';
import { useAction } from '../../../components/feedback';
import { Button, Card, Empty, ListSkeleton, LoadError, Position } from '../../../components/ui';
import { Convocatoria } from '../team/Convocatoria';
import { currentRound, upcomingFor } from '../team/logic';
import { ScheduleBuilder, SingleMatchModal } from '../team/ScheduleBuilder';
import { SectionHead, TeamName } from '../team/TeamBits';
import { useTeamLeague, type TeamLeague } from '../team/useTeamLeague';
import { BasketballMatchCard } from './BasketballGames';
import { exportBasketballExcel } from './excel';
import { basketballConfigFrom, basketballTeamRules } from './rules';
import { useBasketballSeason, type BasketballSeason } from './season';

/**
 * Inicio de la liga de baloncesto (Calendario): lo que está en vivo, mi próximo partido con su convocatoria, la
 * jornada que toca y las que siguen, y lo primero de la tabla. El admin arma el calendario desde aquí.
 */
export default function BasketballHome() {
  const tl = useTeamLeague();
  const season = useBasketballSeason(tl);
  const now = useNow(30_000).getTime();
  const [building, setBuilding] = useState(false);
  const [single, setSingle] = useState(false);
  const config = basketballConfigFrom(tl.rules.data);
  const teamRules = basketballTeamRules(tl.rules.data);
  const format = config.variant === '3x3' ? '3x3' : 'fiba';

  const matches = tl.matches.data;
  const live = matches.filter((m) => m.status === 'live' || m.status === 'suspended');
  const myTeamIds = tl.myTeams.map((x) => x.team.id);
  const next = upcomingFor(matches, myTeamIds, now).find((m) => m.status === 'scheduled' || m.status === 'postponed');
  const round = currentRound(matches);
  const open = useMemo(() => matches.filter((m) => isOpen(m) || m.status === 'postponed'), [matches]);
  const thisRound = round == null ? [] : matches.filter((m) => m.round === round && m.status !== 'live' && m.status !== 'suspended');
  const later = open.filter((m) => m.round !== round && m.status !== 'live' && m.status !== 'suspended');

  if (tl.matches.error) return <LoadError error={tl.matches.error} />;

  return (
    <div className="flex flex-col gap-5">
      {tl.isAdmin && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" icon={<CalendarPlus className="size-4" />} disabled={tl.teams.data.length < 2} onClick={() => setBuilding(true)}>
            Armar calendario
          </Button>
          <Button icon={<Plus className="size-4" />} disabled={tl.teams.data.length < 2} onClick={() => setSingle(true)}>
            Partido suelto
          </Button>
          <Link to={`${tl.base}/admin?tab=equipos`} className="text-sm font-medium text-accent">
            Equipos y reglas
          </Link>
        </div>
      )}

      {tl.isAdmin && !tl.teams.loading && tl.teams.data.length < 2 && (
        <Card className="flex items-start gap-3 px-4 py-4">
          <Shirt className="mt-0.5 size-6 shrink-0 text-accent" />
          <div className="text-sm">
            <p className="font-semibold">Primero, los equipos</p>
            <p className="text-muted">Crea los equipos de la temporada (nombre, color y plantilla con dorsales). Después armas el calendario.</p>
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
              <BasketballMatchCard key={m.id} tl={tl} match={m} now={now} />
            ))}
          </div>
        </section>
      )}

      {next && (
        <section className="flex flex-col gap-2">
          <SectionHead title="Tu próximo partido" />
          <BasketballMatchCard tl={tl} match={next} now={now} />
          <Convocatoria tl={tl} match={next} minPlayers={teamRules.minPlayers} compact />
        </section>
      )}

      <section className="flex flex-col gap-2">
        <SectionHead title={round != null ? `Jornada ${round}` : 'Calendario'} />
        {tl.matches.loading && !matches.length ? (
          <ListSkeleton rows={3} />
        ) : !matches.length ? (
          <Empty icon={<CalendarPlus className="size-8" />} title="Todavía no hay calendario">
            {tl.isAdmin ? 'Arma el calendario con el botón de arriba: todos contra todos, de ida o de ida y vuelta.' : 'Cuando el admin arme el calendario, los partidos salen aquí.'}
          </Empty>
        ) : thisRound.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {thisRound.map((m) => (
              <BasketballMatchCard key={m.id} tl={tl} match={m} now={now} />
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
          <ScheduleList matches={later.slice(0, 12)} groupBy="round" roundWord="Jornada" tz={tl.tz} now={now} renderMatch={(m) => <BasketballMatchCard tl={tl} match={m} now={now} />} />
        </section>
      )}

      <TablePreview tl={tl} season={season} />

      {matches.length > 0 && <ExcelButton tl={tl} season={season} />}

      <ScheduleBuilder tl={tl} open={building} onClose={() => setBuilding(false)} format={format} />
      <SingleMatchModal tl={tl} open={single} onClose={() => setSingle(false)} format={format} />
    </div>
  );
}

function TablePreview({ tl, season }: { tl: TeamLeague; season: BasketballSeason }) {
  const rows = season.standings.filter((r) => r.played > 0);
  if (!rows.length) return null;
  return (
    <section className="flex flex-col gap-2">
      <SectionHead
        title="Tabla"
        action={
          <Link to={`${tl.base}/ranking`} className="flex items-center gap-1 text-sm font-medium text-accent">
            <Medal className="size-4" /> Ver todo
          </Link>
        }
      />
      <Card className="divide-y divide-line overflow-hidden">
        {season.standings.slice(0, 5).map((r) => (
          <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
            <Position pos={r.rank} />
            <TeamName team={tl.teamOf(r.id)} label="Equipo" className="flex-1 font-medium" />
            <span className="text-xs text-muted tabular-nums">
              {r.won}-{r.lost}
            </span>
            <span className="w-8 text-right font-bold tabular-nums">{r.points}</span>
          </div>
        ))}
      </Card>
      {season.leaders[0] && (
        <p className="flex items-center gap-1.5 text-sm text-muted">
          <Trophy className="size-4 text-gold" />
          Máximo anotador: <b className="text-fg">{tl.nameOf(season.leaders[0].player)}</b> ({season.leaders[0].points} pts, {season.leaders[0].avg} por partido)
        </p>
      )}
    </section>
  );
}

/** Descargar la liga en Excel: calendario, tabla, resultados y anotadores. */
export function ExcelButton({ tl, season }: { tl: TeamLeague; season: BasketballSeason }) {
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
        await run(() => exportBasketballExcel({ leagueName: tl.league.name, matches: tl.matches.data, season, teamName, playerName: tl.nameOf, tz: tl.tz }));
        setBusy(false);
      }}
    >
      Descargar Excel
    </Button>
  );
}
