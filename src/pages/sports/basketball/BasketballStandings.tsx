import { useSearchParams } from 'react-router';
import { StandingsTable, defaultColumns } from '../../../components/match';
import { leadersShare, standingsShare } from '../../../components/share';
import { LeagueBackBar } from '../../../components/league/home/LeagueTopBar';
import { useIsPro } from '../../../components/mode';
import { ListSkeleton, LoadError, Segmented } from '../../../components/ui';
import { ClosedSeasonView, SeasonBar, useStandingsSeason } from '../../../components/season/SeasonView';
import { LeadersTable } from '../team/LeadersTable';
import { TeamName } from '../team/TeamBits';
import { HowItCounts, ScreenTitle, ShareIcon } from '../team/TeamUi';
import { useTeamLeague } from '../team/useTeamLeague';
import { ExcelButton } from './BasketballHome';
import { basketballTableFrom } from './rules';
import { useBasketballSeason } from './season';
import { SCORER_COLUMNS, basketballRuleLine, basketballRuleText, basketballView, scorerLine } from './standingsView';

// Las columnas, qué se ve y la línea de cada anotador están en standingsView.ts (los usa también la app del teléfono).
export { SCORER_COLUMNS };

/**
 * Tabla FIBA de la temporada y anotadores (/l/:lid/ranking), rediseño «Calma y foco» como la Tabla del boliche: «‹
 * Liga» arriba (en Pro con «Excel» y compartir), el título «Tabla», la temporada (?temporada=) y Tabla | Anotadores
 * (`?ver=`). La regla va en una línea y «Cómo se cuenta» abre el resto. Los anotadores, en Lite como lista y en Pro con
 * todas las columnas para ordenar. La activa se calcula con sus equipos y sus partidos (sin los del playoff); una
 * cerrada muestra sus premios y la tabla que se guardó al cerrarla (sin tabla guardada, se calcula como la activa).
 */
export default function BasketballStandings() {
  const tl = useTeamLeague();
  const pro = useIsPro();
  const picked = useStandingsSeason();
  const season = useBasketballSeason(tl, picked.selected ?? tl.season);
  const [params, setParams] = useSearchParams();
  const view = basketballView(params.get('ver'));
  const table = basketballTableFrom(tl.rules.data);
  const mine = tl.myTeams.map((x) => x.team.id);
  const columns = defaultColumns({ forLabel: 'PF', againstLabel: 'PC' });
  const team = (id: string) => tl.teamOf(id);
  // Imagen de lo que se ve (tabla o anotadores) para mandar al grupo.
  const shareCard = () =>
    view === 'tabla'
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
  const canShare = view === 'tabla' ? season.standings.length > 0 : season.leaders.length > 0;
  const label = picked.seasons.length > 1 ? picked.selected?.name : null;
  const bar = (excelLabel: string | null | undefined) => (
    <LeagueBackBar
      actions={
        pro && (
          <>
            {season.matches.length > 0 && <ExcelButton tl={tl} season={season} label={excelLabel} />}
            {canShare && !picked.closed && <ShareIcon card={shareCard} label="Compartir la tabla" />}
          </>
        )
      }
    />
  );
  const head = (
    <>
      <ScreenTitle title="Tabla" pro={pro} />
      <SeasonBar seasons={picked.seasons} selected={picked.selected} onChange={picked.setSelected} className="mt-3" />
    </>
  );

  // Sin las temporadas no se sabe qué partidos son de cuál: nada de una tabla con todas mezcladas.
  if (picked.error) return <LoadError error={picked.error} />;
  if (picked.loading) return <ListSkeleton rows={6} />;
  if (picked.closed) {
    // Mis equipos de esa temporada (y yo) salen resaltados en la tabla guardada.
    const mineThen = [...tl.allTeams.data.filter((t) => t.roster.some((r) => r.playerId === tl.myPlayerId)).map((t) => t.id), ...(tl.myPlayerId ? [tl.myPlayerId] : [])];
    return (
      <>
        {bar(picked.closed.name)}
        <div className="flex flex-col px-2">
          {head}
          <div className="mt-5">
            <ClosedSeasonView season={picked.closed} highlight={mineThen} />
          </div>
        </div>
      </>
    );
  }
  return (
    <>
      {bar(label)}
      <div className="flex flex-col px-2">
        {head}
        <Segmented
          full
          label="Qué ver"
          className="mt-4"
          options={[
            { key: 'tabla', label: 'Tabla' },
            { key: 'anotadores', label: 'Anotadores' },
          ]}
          value={view}
          onChange={(k) =>
            setParams(
              (p) => {
                const next = new URLSearchParams(p);
                next.set('ver', k);
                return next;
              },
              { replace: true },
            )
          }
        />
        <div className="mt-[22px] flex flex-col gap-3">
          {view === 'tabla' ? (
            <>
              <StandingsTable
                rows={season.standings}
                nameOf={(id) => <TeamName team={tl.teamOf(id)} label="(equipo borrado)" />}
                columns={columns}
                highlight={mine}
                empty="Cuando haya partidos confirmados, la tabla sale aquí."
              />
              <HowItCounts line={basketballRuleLine(table)}>
                {basketballRuleText(table).map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </HowItCounts>
            </>
          ) : (
            <LeadersTable
              rows={season.leaders}
              columns={SCORER_COLUMNS}
              nameOf={tl.nameOf}
              teamOf={(key) => tl.teamOf(key)?.name ?? ''}
              linkOf={(id) => `${tl.base}/j/${id}`}
              highlight={tl.myPlayerId}
              full={pro}
              line={scorerLine}
            />
          )}
        </div>
      </div>
    </>
  );
}
