import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { compareMatches } from '../../../lib/data/matches';
import { StandingsTable, defaultColumns, type StandingsColumn } from '../../../components/match';
import { ShareButton, leadersShare, standingsShare, type ShareTableSpec } from '../../../components/share';
import { Badge, Card, Empty, ListSkeleton, LoadError, Tabs } from '../../../components/ui';
import { ClosedSeasonView, SeasonBar, useStandingsSeason } from '../../../components/season/SeasonView';
import type { FootballTotals } from '../../../sports/team/stats';
import { LeadersTable, type LeaderColumn } from '../team/LeadersTable';
import { SectionHead, TeamName } from '../team/TeamBits';
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

/**
 * Tabla, goleadores, tarjetas, vallas invictas y disciplina de la temporada (/l/:lid/ranking; `?ver=disciplina`).
 * Arriba, la temporada (?temporada=): la activa se calcula con sus equipos y sus partidos (sin los del playoff en la
 * tabla); una cerrada muestra sus premios y la tabla que se guardó al cerrarla (sin tabla guardada, se calcula como
 * la activa).
 */
export default function FootballStandings() {
  const tl = useTeamLeague();
  const picked = useStandingsSeason();
  const season = useFootballSeason(tl, picked.selected ?? tl.season);
  const [params] = useSearchParams();
  const initial = params.get('ver') as Tab | null;
  const [tab, setTab] = useState<Tab>(initial && TABS.includes(initial) ? initial : 'tabla');
  const canShare = !!shareCard(tl, season, tab);
  const label = picked.seasons.length > 1 ? picked.selected?.name : null;
  // Sin las temporadas no se sabe qué partidos son de cuál: nada de una tabla con todas mezcladas.
  if (picked.error) return <LoadError error={picked.error} />;
  if (picked.loading) return <ListSkeleton rows={6} />;
  if (picked.closed) {
    // Mis equipos de esa temporada (y yo) salen resaltados en la tabla guardada.
    const mineThen = [...tl.allTeams.data.filter((t) => t.roster.some((r) => r.playerId === tl.myPlayerId)).map((t) => t.id), ...(tl.myPlayerId ? [tl.myPlayerId] : [])];
    return (
      <div className="flex flex-col gap-4">
        <SeasonBar seasons={picked.seasons} selected={picked.selected} onChange={picked.setSelected} />
        <ClosedSeasonView
          season={picked.closed}
          highlight={mineThen}
          footer={season.matches.length > 0 && <ExcelButton tl={tl} season={season} label={picked.closed.name} />}
        />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <SeasonBar seasons={picked.seasons} selected={picked.selected} onChange={picked.setSelected} />
      <Tabs
        items={[
          { key: 'tabla', label: 'Tabla' },
          { key: 'goleadores', label: 'Goleadores' },
          { key: 'tarjetas', label: 'Tarjetas' },
          { key: 'vallas', label: 'Vallas' },
          { key: 'disciplina', label: 'Disciplina', count: season.suspendedNext.length },
        ]}
        active={tab}
        onChange={setTab}
      />
      {canShare && (
        <div className="flex justify-end">
          <ShareButton card={() => shareCard(tl, season, tab)} />
        </div>
      )}
      {tab === 'tabla' && <TableTab tl={tl} season={season} />}
      {tab === 'goleadores' && (
        <LeadersTable
          rows={season.scorers.filter((s) => s.goals > 0 || s.assists > 0)}
          columns={SCORER_COLUMNS}
          nameOf={tl.nameOf}
          teamOf={(key) => tl.teamOf(key)?.name ?? ''}
          linkOf={(id) => `${tl.base}/j/${id}`}
          highlight={tl.myPlayerId}
          empty="Los goles salen del acta de cada partido (quién marcó)."
        />
      )}
      {tab === 'tarjetas' && (
        <LeadersTable
          rows={season.cards}
          columns={CARD_COLUMNS}
          nameOf={tl.nameOf}
          teamOf={(key) => tl.teamOf(key)?.name ?? ''}
          linkOf={(id) => `${tl.base}/j/${id}`}
          highlight={tl.myPlayerId}
          empty="Nadie tiene tarjetas todavía."
        />
      )}
      {tab === 'vallas' && (
        <LeadersTable
          rows={season.keepers}
          columns={KEEPER_COLUMNS}
          nameOf={tl.nameOf}
          teamOf={(key) => tl.teamOf(key)?.name ?? ''}
          linkOf={(id) => `${tl.base}/j/${id}`}
          highlight={tl.myPlayerId}
          empty="Las vallas invictas salen del portero que marca el anotador en cada partido."
        />
      )}
      {tab === 'disciplina' && <DisciplineTab tl={tl} season={season} />}
      {season.matches.length > 0 && <ExcelButton tl={tl} season={season} label={label} />}
    </div>
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
        <section className="flex flex-col gap-2">
          <SectionHead title="Fase final" />
          <div className="grid gap-2 sm:grid-cols-2">
            {knockout.map((m) => (
              <FootballMatchCard key={m.id} tl={tl} match={m} />
            ))}
          </div>
        </section>
      )}
      {season.groups.length > 0 ? (
        season.groups.map((g) => (
          <section key={g.stage} className="flex flex-col gap-2">
            <SectionHead title={g.stage} />
            <StandingsTable rows={g.rows} nameOf={name} columns={TABLE_COLUMNS} highlight={mine} empty="Sin partidos confirmados en este grupo." />
          </section>
        ))
      ) : (
        <StandingsTable rows={season.standings} nameOf={name} columns={TABLE_COLUMNS} highlight={mine} empty="Cuando haya partidos confirmados, la tabla sale aquí." />
      )}
      <Card className="px-4 py-3 text-xs text-muted">
        Ganar {table.win}, empatar {table.draw}, perder {table.loss}. W.O.: {table.walkoverScore}-0 y {table.walkoverLoss} puntos para el que no vino.
        {table.shootout ? ` Empate con penales: ${table.shootout.win} al que gana la tanda y ${table.shootout.loss} al otro.` : ' Los penales no cuentan en los goles ni en la tabla.'}{' '}
        Desempate: {order.join(' → ')}. La «i» junto al puesto dice qué regla lo decidió. Un resultado por confirmar cuenta a las 48 horas.
      </Card>
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
    <div className="flex flex-col gap-5">
      <Card className="px-4 py-3 text-xs text-muted">
        {describeDiscipline(cfg)}. La suspensión se cumple en el siguiente partido que el equipo juegue de verdad (los aplazados y los descansos no cuentan). La
        app avisa, no bloquea: el admin decide.
      </Card>
      {season.suspendedNext.length ? <SuspendedCard tl={tl} season={season} /> : <Empty icon={<ShieldAlert className="size-8" />} title="Nadie suspendido para la próxima jornada" />}

      {season.discipline.violations.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionHead
            title={
              <span className="flex items-center gap-1.5 text-danger">
                <AlertTriangle className="size-4" /> Jugaron estando suspendidos
              </span>
            }
          />
          <Card className="divide-y divide-line overflow-hidden">
            {season.discipline.violations.map((v, i) => (
              <Link key={i} to={matchLink(tl.base, v.matchId)} className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-surface-2">
                <span className="min-w-0 flex-1 truncate font-medium">{tl.nameOf(v.player)}</span>
                <span className="truncate text-xs text-muted">{matchText(v.matchId)}</span>
              </Link>
            ))}
          </Card>
        </section>
      )}

      {close.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionHead title={`A una amarilla de la suspensión`} />
          <Card className="divide-y divide-line overflow-hidden">
            {close.map((y) => (
              <div key={`${y.team}:${y.player}`} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                <CardIcon kind="yellow" />
                <span className="min-w-0 flex-1 truncate font-medium">{tl.nameOf(y.player)}</span>
                <TeamName team={tl.teamOf(y.team)} className="text-xs text-muted" />
                <span className="tabular-nums text-muted">
                  {y.pending}/{cfg.yellowsForSuspension}
                </span>
              </div>
            ))}
          </Card>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <SectionHead title="Sanciones de la temporada" />
        {!sanctions.length ? (
          <p className="text-sm text-muted">Todavía no hay sanciones.</p>
        ) : (
          <Card className="divide-y divide-line overflow-hidden">
            {sanctions.map((s, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <Link to={`${tl.base}/j/${s.player}`} className="block truncate font-medium hover:text-accent">
                    {tl.nameOf(s.player)}
                  </Link>
                  <span className="block truncate text-xs text-muted">
                    {REASON_TEXT[s.reason] ?? s.reason} · {matchText(s.matchId)}
                    {s.note ? ` · ${s.note}` : ''}
                  </span>
                </span>
                {s.remaining > 0 ? (
                  <Badge tone="danger">
                    Le faltan {s.remaining} de {s.matches}
                  </Badge>
                ) : (
                  <Badge tone="ok">Cumplida</Badge>
                )}
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
