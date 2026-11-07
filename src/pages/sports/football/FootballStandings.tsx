import { useSearchParams } from 'react-router';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { StandingsTable } from '../../../components/match';
import { leadersShare, standingsShare, type ShareTableSpec } from '../../../components/share';
import { LeagueBackBar } from '../../../components/league/home/LeagueTopBar';
import { useIsPro } from '../../../components/mode';
import { PillSelect } from '../../../components/ranking/parts';
import { Card, ListRow, ListSkeleton, LoadError, RowIcon, Segmented } from '../../../components/ui';
import { ClosedSeasonView, SeasonBar, useStandingsSeason } from '../../../components/season/SeasonView';
import { LeadersTable } from '../team/LeadersTable';
import { SectionHead, TeamName } from '../team/TeamBits';
import { HowItCounts, ScreenTitle, ShareIcon } from '../team/TeamUi';
import { useTeamLeague, type TeamLeague } from '../team/useTeamLeague';
import { CardIcon } from './bits';
import { FootballMatchCard, matchLink } from './FootballGames';
import { ExcelButton, SuspendedCard } from './FootballHome';
import { REASON_TEXT, describeDiscipline, disciplineFrom, footballTableFrom } from './rules';
import { useFootballSeason, type FootballSeason } from './season';
import {
  CARD_COLUMNS,
  EMPTY_TEXT,
  KEEPER_COLUMNS,
  PLAYER_VIEWS,
  SCORER_COLUMNS,
  TABLE_COLUMNS,
  cardLine,
  disciplineMatchText,
  footballRuleLine,
  footballRuleText,
  footballSegment,
  footballTab,
  keeperLine,
  knockoutMatches,
  nearSuspension,
  scorerLine,
  scorerRows,
  sortedSanctions,
  type FootballTab,
} from './standingsView';

type Tab = FootballTab;

// Las columnas, qué se ve, las líneas de cada lista y lo de la disciplina están en standingsView.ts (los usa también la
// app del teléfono).
export { SCORER_COLUMNS, TABLE_COLUMNS };

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
      const rows = scorerRows(season);
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
  const tab: Tab = footballTab(params.get('ver'));
  const setTab = (k: Tab) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.set('ver', k);
        return next;
      },
      { replace: true },
    );
  const segment = footballSegment(tab);
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
              rows={scorerRows(season)}
              columns={SCORER_COLUMNS}
              line={scorerLine}
              empty={EMPTY_TEXT.goleadores}
            />
          )}
          {tab === 'tarjetas' && (
            <LeadersTable
              {...leaders}
              rows={season.cards}
              columns={CARD_COLUMNS}
              line={cardLine}
              empty={EMPTY_TEXT.tarjetas}
            />
          )}
          {tab === 'vallas' && (
            <LeadersTable
              {...leaders}
              rows={season.keepers}
              columns={KEEPER_COLUMNS}
              line={keeperLine}
              empty={EMPTY_TEXT.vallas}
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
  const knockout = knockoutMatches(season);
  const name = (id: string) => <TeamName team={tl.teamOf(id)} label="(equipo borrado)" />;
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
      <HowItCounts line={footballRuleLine(table)}>
        {footballRuleText(table).map((p) => (
          <p key={p}>{p}</p>
        ))}
      </HowItCounts>
    </>
  );
}

/** Suspendidos, amarillas que van para la próxima suspensión, sanciones y quien jugó suspendido. */
function DisciplineTab({ tl, season }: { tl: TeamLeague; season: FootballSeason }) {
  const cfg = disciplineFrom(tl.rules.data);
  const matchText = disciplineMatchText(season.matches, (id) => tl.teamOf(id)?.name);
  const close = nearSuspension(season.discipline, cfg);
  const sanctions = sortedSanctions(season.discipline);
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
