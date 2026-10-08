import { useSearchParams } from 'react-router';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { compareMatches } from '../../../lib/data/matches';
import { StandingsTable, defaultColumns, type StandingsColumn } from '../../../components/match';
import { leadersShare, standingsShare, type ShareTableSpec } from '../../../components/share';
import { LeagueBackBar } from '../../../components/league/home/LeagueTopBar';
import { useIsPro } from '../../../components/mode';
import { PillSelect } from '../../../components/ranking/parts';
import { Card, ListRow, ListSkeleton, LoadError, RowIcon, Segmented } from '../../../components/ui';
import { ClosedSeasonView, SeasonBar, useStandingsSeason } from '../../../components/season/SeasonView';
import type { FootballTotals } from '../../../sports/team/stats';
import { LeadersTable, type LeaderColumn } from '../team/LeadersTable';
import { SectionHead, TeamName } from '../team/TeamBits';
import { HowItCounts, ScreenTitle, ShareIcon } from '../team/TeamUi';
import { isPlayoffMatch } from '../team/playoffs';
import { useTeamLeague, type TeamLeague } from '../team/useTeamLeague';
import { CardIcon } from './bits';
import { FootballMatchCard, matchLink } from './FootballGames';
import { ExcelButton, SuspendedCard } from './FootballHome';
import { REASON_TEXT, TIEBREAK_LABEL, describeDiscipline, disciplineFrom, footballTableFrom } from './rules';
import { useFootballSeason, type CardRow, type FootballSeason } from './season';

type Tab = 'tabla' | 'goleadores' | 'tarjetas' | 'vallas' | 'disciplina';

/** Columnas de la tabla de goleadores. */
export const SCORER_COLUMNS: LeaderColumn<FootballTotals>[] = [
  { key: 'goals', label: 'G', title: 'Goles', value: (r) => r.goals },
  { key: 'assists', label: 'A', title: 'Asistencias', value: (r) => r.assists },
  { key: 'games', label: 'PJ', title: 'Partidos jugados', value: (r) => r.games },
  {
    key: 'avg',
    label: 'Prom',
    title: 'Goles por partido',
    value: (r) => (r.games ? r.goals / r.games : 0),
    show: (r) => (r.games ? (r.goals / r.games).toLocaleString('es-DO', { maximumFractionDigits: 2 }) : '0'),
    wide: true,
  },
  { key: 'ownGoals', label: 'AG', title: 'Autogoles', value: (r) => r.ownGoals, wide: true },
];

const CARD_COLUMNS: LeaderColumn<CardRow>[] = [
  { key: 'yellows', label: 'TA', title: 'Amarillas', value: (r) => r.yellows },
  { key: 'secondYellows', label: '2A', title: 'Rojas por doble amarilla', value: (r) => r.secondYellows },
  { key: 'reds', label: 'TR', title: 'Rojas directas', value: (r) => r.reds },
  { key: 'fairPlay', label: 'JL', title: 'Juego limpio (más negativo = más tarjetas)', value: (r) => -r.fairPlay, show: (r) => r.fairPlay },
];

const KEEPER_COLUMNS: LeaderColumn<FootballTotals>[] = [
  { key: 'cleanSheets', label: 'VI', title: 'Vallas invictas', value: (r) => r.cleanSheets },
  { key: 'keeperGames', label: 'PJ', title: 'Partidos de portero', value: (r) => r.keeperGames },
  { key: 'conceded', label: 'GR', title: 'Goles recibidos', value: (r) => -r.conceded, show: (r) => r.conceded },
  {
    key: 'avg',
    label: 'Prom',
    title: 'Goles recibidos por partido',
    value: (r) => (r.keeperGames ? -r.conceded / r.keeperGames : 0),
    show: (r) => (r.keeperGames ? (r.conceded / r.keeperGames).toLocaleString('es-DO', { maximumFractionDigits: 2 }) : '0'),
  },
];

/** Columnas de la tabla de fútbol: PJ G E P GF GC Dif. (y el juego limpio en la computadora). */
export const TABLE_COLUMNS: StandingsColumn[] = [
  ...defaultColumns({ draws: true, forLabel: 'GF', againstLabel: 'GC' }),
  { key: 'fair', label: 'JL', title: 'Juego limpio (tarjetas)', value: (r) => r.extra.fairPlay ?? 0, wide: true },
];

const TABS: readonly Tab[] = ['tabla', 'goleadores', 'tarjetas', 'vallas', 'disciplina'];

/** Imagen de la pestaña que se ve para mandar al grupo (la disciplina no se comparte). */
function shareCard(tl: TeamLeague, season: FootballSeason, tab: Tab): ShareTableSpec | null {
  const title = tl.league.name;
  const team = (id: string) => tl.teamOf(id);
  const leaders = { title, nameOf: tl.nameOf, teamOf: team, limit: 20 };
  switch (tab) {
    case 'tabla': {
      const sections = season.groups.length ? season.groups.map((g) => ({ heading: g.stage, rows: g.rows })) : [{ rows: season.standings }];
      if (!sections.some((x) => x.rows.length)) return null;
      return standingsShare({
        title,
        subtitle: 'Tabla de posiciones',
        sections,
        columns: TABLE_COLUMNS,
        nameOf: (id) => team(id)?.name ?? '(equipo borrado)',
        rowExtra: (id) => ({ dot: team(id)?.color ?? null }),
        nameLabel: 'Equipo',
      });
    }
    case 'goleadores': {
      const rows = season.scorers.filter((s) => s.goals > 0 || s.assists > 0);
      return rows.length ? leadersShare({ ...leaders, subtitle: 'Goleadores', rows, columns: SCORER_COLUMNS }) : null;
    }
    case 'tarjetas':
      return season.cards.length ? leadersShare({ ...leaders, subtitle: 'Tarjetas', rows: season.cards, columns: CARD_COLUMNS }) : null;
    case 'vallas':
      return season.keepers.length ? leadersShare({ ...leaders, subtitle: 'Vallas invictas', rows: season.keepers, columns: KEEPER_COLUMNS, nameLabel: 'Portero' }) : null;
    default:
      return null;
  }
}

/** Lo de los jugadores (en «Jugadores»): goleadores, tarjetas o vallas invictas. */
const PLAYER_VIEWS: readonly { key: Tab; label: string }[] = [
  { key: 'goleadores', label: 'Goleadores' },
  { key: 'tarjetas', label: 'Tarjetas' },
  { key: 'vallas', label: 'Vallas invictas' },
];

/**
 * Tabla, goleadores, tarjetas, vallas invictas y disciplina de la temporada (/l/:lid/ranking; `?ver=`), rediseño «Calma
 * y foco» como la Tabla del boliche: «‹ Liga» arriba (en Pro con «Excel» y compartir), el título «Tabla», la temporada
 * (?temporada=) y un segmentado Tabla | Jugadores | Disciplina; en Jugadores, «Goleadores ▾» elige entre goleadores,
 * tarjetas y vallas invictas (en Lite como lista; en Pro con todas las columnas). La regla va en una línea y «Cómo se
 * cuenta» abre el resto. La activa se calcula con sus equipos y sus partidos (sin los del playoff en la tabla); una
 * cerrada muestra sus premios y la tabla que se guardó al cerrarla (sin tabla guardada, se calcula como la activa).
 */
export default function FootballStandings() {
  const tl = useTeamLeague();
  const pro = useIsPro();
  const picked = useStandingsSeason();
  const season = useFootballSeason(tl, picked.selected ?? tl.season);
  const [params, setParams] = useSearchParams();
  const asked = params.get('ver') as Tab | null;
  const tab: Tab = asked && TABS.includes(asked) ? asked : 'tabla';
  const setTab = (k: Tab) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.set('ver', k);
        return next;
      },
      { replace: true },
    );
  const segment: 'tabla' | 'jugadores' | 'disciplina' = tab === 'tabla' || tab === 'disciplina' ? tab : 'jugadores';
  const canShare = !!shareCard(tl, season, tab);
  const label = picked.seasons.length > 1 ? picked.selected?.name : null;
  const leaders = { nameOf: tl.nameOf, teamOf: (key: string) => tl.teamOf(key)?.name ?? '', linkOf: (id: string) => `${tl.base}/j/${id}`, highlight: tl.myPlayerId, full: pro };
  const bar = (excelLabel: string | null | undefined) => (
    <LeagueBackBar
      actions={
        pro && (
          <>
            {season.matches.length > 0 && <ExcelButton tl={tl} season={season} label={excelLabel} />}
            {canShare && !picked.closed && <ShareIcon card={() => shareCard(tl, season, tab)} label="Compartir la tabla" />}
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
            { key: 'jugadores', label: 'Jugadores' },
            {
              key: 'disciplina',
              ariaLabel: season.suspendedNext.length ? `Disciplina: ${season.suspendedNext.length} suspendidos` : 'Disciplina',
              label: (
                <>
                  Disciplina
                  {season.suspendedNext.length > 0 && (
                    <span className="num grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1.5 text-[11px] font-bold tracking-normal text-on-danger">{season.suspendedNext.length}</span>
                  )}
                </>
              ),
            },
          ]}
          value={segment}
          onChange={(k) => setTab(k === 'jugadores' ? 'goleadores' : k)}
        />
        {segment === 'jugadores' && (
          <div className="mt-3.5">
            <PillSelect label="Qué números ver" options={PLAYER_VIEWS} value={tab} onChange={setTab} />
          </div>
        )}
        <div className="mt-[22px] flex flex-col gap-3">
          {tab === 'tabla' && <TableTab tl={tl} season={season} />}
          {tab === 'goleadores' && (
            <LeadersTable
              {...leaders}
              rows={season.scorers.filter((s) => s.goals > 0 || s.assists > 0)}
              columns={SCORER_COLUMNS}
              line={(r) => (r.assists ? `${r.assists} ${r.assists === 1 ? 'asistencia' : 'asistencias'}` : null)}
              empty="Los goles salen del acta de cada partido (quién marcó)."
            />
          )}
          {tab === 'tarjetas' && (
            <LeadersTable
              {...leaders}
              rows={season.cards}
              columns={CARD_COLUMNS}
              line={(r) => [r.secondYellows ? `${r.secondYellows} doble amarilla` : null, r.reds ? `${r.reds} ${r.reds === 1 ? 'roja' : 'rojas'}` : null].filter(Boolean).join(' · ') || null}
              empty="Nadie tiene tarjetas todavía."
            />
          )}
          {tab === 'vallas' && (
            <LeadersTable
              {...leaders}
              rows={season.keepers}
              columns={KEEPER_COLUMNS}
              line={(r) => `${r.keeperGames} ${r.keeperGames === 1 ? 'partido' : 'partidos'} · ${r.conceded} recibidos`}
              empty="Las vallas invictas salen del portero que marca el anotador en cada partido."
            />
          )}
          {tab === 'disciplina' && <DisciplineTab tl={tl} season={season} />}
        </div>
      </div>
    </>
  );
}

function TableTab({ tl, season }: { tl: TeamLeague; season: FootballSeason }) {
  const table = footballTableFrom(tl.rules.data);
  const mine = tl.myTeams.map((x) => x.team.id);
  // El cuadro del torneo relámpago de la temporada (los juegos del playoff tienen su pestaña).
  const knockout = season.matches.filter((m) => m.bracketKey && !isPlayoffMatch(m)).sort(compareMatches);
  const name = (id: string) => <TeamName team={tl.teamOf(id)} label="(equipo borrado)" />;
  const order = table.tiebreak.map((k) => TIEBREAK_LABEL[k].toLowerCase());
  return (
    <>
      {knockout.length > 0 && (
        <section aria-labelledby="fb-fase-final" className="mb-3">
          <SectionHead title="Fase final" className="mb-3" />
          <div className="grid gap-2.5 sm:grid-cols-2">
            {knockout.map((m) => (
              <div key={m.id} className="min-w-0">
                <FootballMatchCard tl={tl} match={m} />
              </div>
            ))}
          </div>
        </section>
      )}
      {season.groups.length > 0 ? (
        season.groups.map((g) => (
          <section key={g.stage} className="mb-3">
            <SectionHead title={g.stage} className="mb-3" />
            <StandingsTable rows={g.rows} nameOf={name} columns={TABLE_COLUMNS} highlight={mine} empty="Sin partidos confirmados en este grupo." />
          </section>
        ))
      ) : (
        <StandingsTable rows={season.standings} nameOf={name} columns={TABLE_COLUMNS} highlight={mine} empty="Cuando haya partidos confirmados, la tabla sale aquí." />
      )}
      <HowItCounts line={`Ganar ${table.win} · empatar ${table.draw} · perder ${table.loss}`}>
        <p>
          Ganar da {table.win} puntos, empatar {table.draw} y perder {table.loss}. W.O.: {table.walkoverScore}-0 y {table.walkoverLoss} puntos para el que no vino.
        </p>
        <p>{table.shootout ? `Empate con penales: ${table.shootout.win} al que gana la tanda y ${table.shootout.loss} al otro.` : 'Los penales no cuentan en los goles ni en la tabla.'}</p>
        <p>Desempate: {order.join(' → ')}. La «i» junto al puesto dice qué regla lo decidió.</p>
        <p>Un resultado por confirmar cuenta a las 48 horas.</p>
      </HowItCounts>
    </>
  );
}

/** Suspendidos, amarillas que van para la próxima suspensión, sanciones y quien jugó suspendido. */
function DisciplineTab({ tl, season }: { tl: TeamLeague; season: FootballSeason }) {
  const cfg = disciplineFrom(tl.rules.data);
  const byId = new Map(season.matches.map((m) => [m.id, m] as const));
  const matchText = (id: string) => {
    const m = byId.get(id);
    if (!m) return 'partido borrado';
    const nm = (i: 0 | 1) => tl.teamOf(m.sides[i].teamId)?.name ?? m.sides[i].label;
    return `${m.round != null ? `J${m.round} · ` : ''}${nm(0)} vs. ${nm(1)}`;
  };
  const close = cfg.yellowsForSuspension > 0 ? season.discipline.yellows.filter((y) => y.pending === cfg.yellowsForSuspension - 1 && y.pending > 0) : [];
  const sanctions = [...season.discipline.sanctions].sort((a, b) => b.remaining - a.remaining);
  return (
    <div className="flex flex-col gap-[30px]">
      <p className="mx-1 text-meta text-muted">{describeDiscipline(cfg)}. La app avisa; el admin decide.</p>
      {season.suspendedNext.length ? (
        <SuspendedCard tl={tl} season={season} link={false} />
      ) : (
        <Card className="flex items-center gap-3.5 px-5 py-[18px]">
          <RowIcon>
            <ShieldAlert className="size-5" />
          </RowIcon>
          <p className="font-semibold">Nadie suspendido para la próxima jornada</p>
        </Card>
      )}

      {season.discipline.violations.length > 0 && (
        <section aria-labelledby="fb-violaciones">
          <SectionHead title={<span className="text-danger">Jugaron estando suspendidos</span>} className="mb-3" />
          <Card className="overflow-hidden">
            {season.discipline.violations.map((v, i) => (
              <ListRow
                key={i}
                leading={
                  <RowIcon className="bg-danger-soft text-danger">
                    <AlertTriangle className="size-5" />
                  </RowIcon>
                }
                title={tl.nameOf(v.player)}
                subtitle={matchText(v.matchId)}
                to={matchLink(tl.base, v.matchId)}
              />
            ))}
          </Card>
        </section>
      )}

      {close.length > 0 && (
        <section aria-labelledby="fb-cerca">
          <SectionHead title="A una amarilla de la suspensión" className="mb-3" />
          <Card className="overflow-hidden">
            {close.map((y) => (
              <ListRow
                key={`${y.team}:${y.player}`}
                leading={
                  <RowIcon>
                    <CardIcon kind="yellow" />
                  </RowIcon>
                }
                title={tl.nameOf(y.player)}
                subtitle={tl.teamOf(y.team)?.name ?? 'Su equipo'}
                value={`${y.pending}/${cfg.yellowsForSuspension}`}
                to={`${tl.base}/j/${y.player}`}
                chevron={false}
              />
            ))}
          </Card>
        </section>
      )}

      <section aria-labelledby="fb-sanciones">
        <SectionHead title="Sanciones de la temporada" className="mb-3" />
        {!sanctions.length ? (
          <p className="mx-1 text-meta text-muted">Todavía no hay sanciones.</p>
        ) : (
          <Card className="overflow-hidden">
            {sanctions.map((s, i) => (
              <ListRow
                key={i}
                title={tl.nameOf(s.player)}
                subtitle={`${REASON_TEXT[s.reason] ?? s.reason} · ${matchText(s.matchId)}${s.note ? ` · ${s.note}` : ''}`}
                to={`${tl.base}/j/${s.player}`}
                trailing={
                  s.remaining > 0 ? (
                    <span className="text-sm font-semibold text-danger">
                      {s.remaining} de {s.matches}
                    </span>
                  ) : (
                    <span className="text-sm text-muted">Cumplida</span>
                  )
                }
              />
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
