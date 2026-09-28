import { useState } from 'react';
import { StandingsTable, defaultColumns } from '../../../components/match';
import { ShareButton, leadersShare, standingsShare } from '../../../components/share';
import { Card, Tabs } from '../../../components/ui';
import { LeadersTable, type LeaderColumn } from '../team/LeadersTable';
import { TeamName } from '../team/TeamBits';
import { useTeamLeague } from '../team/useTeamLeague';
import type { BasketballTotals } from '../../../sports/team/stats';
import { ExcelButton } from './BasketballHome';
import { basketballTableFrom } from './rules';
import { useBasketballSeason } from './season';

/** Columnas de la tabla de anotadores. */
export const SCORER_COLUMNS: LeaderColumn<BasketballTotals>[] = [
  { key: 'points', label: 'PTS', title: 'Puntos', value: (r) => r.points },
  { key: 'avg', label: 'Prom', title: 'Promedio de puntos por partido', value: (r) => r.avg, show: (r) => r.avg.toLocaleString('es-DO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) },
  { key: 'games', label: 'PJ', title: 'Partidos jugados (presentes)', value: (r) => r.games },
  { key: 'high', label: 'Máx', title: 'Máximo en un partido', value: (r) => r.high, wide: true },
  { key: 'threes', label: '3P', title: 'Triples anotados', value: (r) => r.threes },
  { key: 'ftm', label: 'TL', title: 'Tiros libres anotados', value: (r) => r.ftm, wide: true },
  { key: 'fouls', label: 'F', title: 'Faltas', value: (r) => r.fouls, wide: true },
];

/** Tabla FIBA de la temporada y tabla de anotadores (/l/:lid/ranking). */
export default function BasketballStandings() {
  const tl = useTeamLeague();
  const season = useBasketballSeason(tl);
  const [tab, setTab] = useState<'tabla' | 'anotadores'>('tabla');
  const table = basketballTableFrom(tl.rules.data);
  const mine = tl.myTeams.map((x) => x.team.id);
  const columns = defaultColumns({ forLabel: 'PF', againstLabel: 'PC' });
  const team = (id: string) => tl.teamOf(id);
  // Imagen de la pestaña que se ve (tabla o anotadores) para mandar al grupo.
  const shareCard = () =>
    tab === 'tabla'
      ? standingsShare({
          title: tl.league.name,
          subtitle: 'Tabla de posiciones',
          sections: [{ rows: season.standings }],
          columns,
          nameOf: (id) => team(id)?.name ?? '(equipo borrado)',
          rowExtra: (id) => ({ dot: team(id)?.color ?? null }),
          nameLabel: 'Equipo',
        })
      : leadersShare({ title: tl.league.name, subtitle: 'Anotadores', rows: season.leaders, columns: SCORER_COLUMNS, nameOf: tl.nameOf, teamOf: team, limit: 20 });
  const canShare = tab === 'tabla' ? season.standings.length > 0 : season.leaders.length > 0;
  return (
    <div className="flex flex-col gap-4">
      <Tabs
        items={[
          { key: 'tabla', label: 'Tabla' },
          { key: 'anotadores', label: 'Anotadores' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {canShare && (
        <div className="flex justify-end">
          <ShareButton card={shareCard} />
        </div>
      )}
      {tab === 'tabla' ? (
        <>
          <StandingsTable
            rows={season.standings}
            nameOf={(id) => <TeamName team={tl.teamOf(id)} label="(equipo borrado)" />}
            columns={columns}
            highlight={mine}
            empty="Cuando haya partidos confirmados, la tabla sale aquí."
          />
          <Card className="px-4 py-3 text-xs text-muted">
            Ganar {table.win}, perder {table.loss}, perder por forfeit (no se presentó) {table.forfeitLoss} y el forfeit se anota {table.forfeitScore}-0. Perder por default (se
            quedó sin jugadores) da {table.defaultLoss}. Desempate FIBA: puntos entre los empatados, diferencia entre ellos, puntos a favor entre ellos, diferencia
            general y puntos a favor. Un resultado por confirmar cuenta a las 48 horas.
          </Card>
        </>
      ) : (
        <LeadersTable
          rows={season.leaders}
          columns={SCORER_COLUMNS}
          nameOf={tl.nameOf}
          teamOf={(key) => tl.teamOf(key)?.name ?? ''}
          linkOf={(id) => `${tl.base}/j/${id}`}
          highlight={tl.myPlayerId}
        />
      )}
      {tl.matches.data.length > 0 && <ExcelButton tl={tl} season={season} />}
    </div>
  );
}
