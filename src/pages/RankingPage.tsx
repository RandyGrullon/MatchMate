import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Medal } from 'lucide-react';
import { useEntriesOfEvents, useEvents, usePlayers } from '../lib/data';
import { useLeagueSeasons } from '../lib/data/seasons';
import { mostImproved, rankingRows, readBowlingSnapshot, seasonEvents, totalsByPlayer } from '../lib/bowlingSeason';
import { useLeagueCtx } from '../lib/league';
import { previousSeason } from '../lib/seasons';
import { MIN_RANK_GAMES, rank } from '../lib/stats';
import { Card, ListSkeleton, LoadError, RowIcon, Segmented, Skeleton, cx } from '../components/ui';
import { LeagueExcelButton } from '../components/LeagueExcelButton';
import { useIsPro } from '../components/mode';
import { SeasonAwardsCard, useSeasonParam } from '../components/season/SeasonSelect';
import { ShareButton, type ShareTableSpec } from '../components/share';
import { TitleMark, useCurrentTitle } from '../components/badges/LeagueBadges';
import { LeagueBackBar } from '../components/league/home/LeagueTopBar';
import {
  METRICS,
  cellText,
  eligibleFor,
  hcpFormula,
  leagueHcp,
  metricDef,
  metricOf,
  myPlace,
  placeCopy,
  playedEvents,
  seasonRangeLabel,
  seasonRecords,
  sortOf,
  standingsTable,
  withSnapshot,
  type Metric,
  type SortKey,
} from '../components/ranking/logic';
import { MyPlaceCard } from '../components/ranking/MyPlaceCard';
import { PillSelect } from '../components/ranking/parts';
import { RankList } from '../components/ranking/RankList';
import { MostImprovedCard, SeasonRecordsCard } from '../components/ranking/SeasonExtras';
import { StandingsTable } from '../components/ranking/StandingsTable';

/** Las columnas que van en la imagen para compartir la tabla de Pro (las que no caben se quitan, menos la ordenada). */
const SHARE_COLUMNS: readonly { key: SortKey; label: string }[] = [
  { key: 'juegos', label: 'J' },
  { key: 'promedio', label: 'Prom.' },
  { key: 'hcp', label: 'Hcp' },
  { key: 'juego', label: 'Alto' },
  { key: 'serie', label: 'Serie' },
  { key: 'asistencia', label: 'Asist.' },
];

/** La última opción de «Temporada 2026 ▾»: lleva al historial de temporadas (campeones y tablas guardadas). */
const ALL_SEASONS = 'todas';

/**
 * Tabla de la liga (`/l/:lid/ranking`) por temporada: la elegida en la dirección (`?temporada=`; por defecto la de
 * ahora). Solo cuentan los juegos aprobados. Rediseño «Calma y foco»:
 * - Lite: «‹ Liga», «Tabla» con «Promedio ▾» (Mejor juego, Mejor serie y Asistencia en el menú), las fechas de la
 *   temporada, tu lugar («Vas 2.º de 6, con 195 · Pedro te lleva 24 pinos», con su barra; o cuántos juegos te faltan)
 *   y la lista con «Tú». Una línea con la regla: «Cuentan los juegos aprobados · mínimo 6 para salir».
 * - Pro: «Excel» y compartir arriba, «Temporada ▾» y Scratch | Con hcp, la tabla completa con columnas que se ordenan
 *   tocándolas (se desliza de lado), la fórmula del handicap en una línea, los récords y el más mejorado.
 * Una temporada cerrada muestra sus premios y, si la guardó, su tabla tal como quedó.
 */
export default function RankingPage() {
  const { lid, base, myPlayerId, member, league } = useLeagueCtx();
  const isPro = useIsPro();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const events = useEvents(lid);
  const players = usePlayers(lid);
  const seasons = useLeagueSeasons(lid);
  const [season, setSeason] = useSeasonParam(seasons.data);
  const prev = previousSeason(seasons.data, season);
  // El campeón de la última temporada cerrada lleva el escudo «Título vigente» (§6.2 de docs/insignias.md).
  const title = useCurrentTitle();

  // Sin temporadas (no se pudieron leer): toda la liga.
  const seasonIds = useMemo(() => seasonEvents(events.data, season).map((e) => e.id), [events.data, season]);
  const prevIds = useMemo(() => (prev ? seasonEvents(events.data, prev).map((e) => e.id) : []), [events.data, prev]);
  const entries = useEntriesOfEvents(lid, useMemo(() => [...seasonIds, ...prevIds], [seasonIds, prevIds]));

  const { rows, improved, played } = useMemo(() => {
    const inSeason = new Set(seasonIds);
    const inPrev = new Set(prevIds);
    const current = entries.data.filter((e) => inSeason.has(e.eventId));
    const names = new Map(players.data.map((p) => [p.id, p.name]));
    const up = prev ? mostImproved(totalsByPlayer(current), totalsByPlayer(entries.data.filter((e) => inPrev.has(e.eventId)))) : [];
    return {
      rows: rankingRows(current, players.data),
      improved: up.filter((u) => names.has(u.playerId)).map((u) => ({ ...u, name: names.get(u.playerId)! })),
      played: playedEvents(current),
    };
  }, [entries.data, players.data, seasonIds, prevIds, prev]);
  // El handicap de la tabla de Pro: el del último torneo con handicap de la temporada (o de la liga; o 80 % de 230).
  const hcp = useMemo(() => leagueHcp(events.data, new Set(seasonIds)), [events.data, seasonIds]);

  // Temporada cerrada con su tabla guardada: el promedio y el mejor juego se ven tal como quedaron al cerrarla (la
  // serie y la asistencia no se guardan: salen de los juegos).
  const closed = season?.status === 'closed';
  const snapshot = closed ? readBowlingSnapshot(season.standings) : null;

  // Lite: una métrica (?ver=promedio|juego|serie|asistencia).
  const metric: Metric = metricOf(params.get('ver'));
  const def = metricDef(metric);
  const liteRows = snapshot && (snapshot.covers as string[]).includes(metric) ? snapshot.rows : rows;
  const ranked = rank(eligibleFor(liteRows, metric), def.value);
  const place = myPlace(liteRows, myPlayerId, metric, { closed });

  // Pro: la columna ordenada (?ver=, las 4 de Lite y además juegos, hcp y nombre) y «Con hcp» (?hcp=1).
  const sort = sortOf(params.get('ver'));
  const withHcp = params.get('hcp') === '1';
  const proRows = withSnapshot(rows, snapshot);
  const table = standingsTable(proRows, { sort, withHcp, hcp });

  const set = (k: string, v: string | null) => {
    const p = new URLSearchParams(params);
    if (v == null) p.delete(k);
    else p.set(k, v);
    setParams(p, { replace: true });
  };
  const error = events.error ?? players.error ?? entries.error;
  const loading = events.loading || players.loading || (seasons.loading && !seasons.data.length) || (entries.loading && !entries.data.length);
  const seasonName = season?.name ?? 'la temporada';

  // Imagen de la tabla que se ve (temporada, columna ordenada y con o sin hcp) para mandar al grupo.
  const shareCard = (): ShareTableSpec => {
    const strong: SortKey = sort === 'nombre' ? 'promedio' : sort;
    const byAverage = strong === 'promedio' || strong === 'hcp';
    return {
      kind: 'table',
      title: league.name,
      subtitle: `Tabla${season ? ` · ${season.name}` : ''}${withHcp ? ' · Con hcp' : ''}`,
      nameLabel: 'Jugador',
      columns: SHARE_COLUMNS.map((c) => ({ label: c.label, strong: c.key === strong, optional: c.key !== strong && c.key !== 'juegos' })),
      sections: [{ rows: table.map((t) => ({ rank: t.pos, name: t.row.name, values: SHARE_COLUMNS.map((c) => cellText(t, c.key, played)) })) }],
      note: ['Solo juegos aprobados.', byAverage ? `Mínimo ${MIN_RANK_GAMES} juegos en la temporada.` : null, withHcp ? `${hcpFormula(hcp)}.` : null]
        .filter(Boolean)
        .join(' '),
    };
  };

  const byMinimum = isPro ? sort === 'promedio' || sort === 'hcp' || sort === 'nombre' : metric === 'promedio';
  const empty = (className: string) => (
    <Card className={cx('flex items-center gap-3.5 px-5 py-[18px]', className)}>
      <RowIcon>
        <Medal className="size-5" />
      </RowIcon>
      <div className="min-w-0">
        <p className="font-semibold">Todavía no sale nadie</p>
        <p className="mt-0.5 text-sm text-muted">
          {byMinimum ? `Hace falta tener al menos ${MIN_RANK_GAMES} juegos aprobados en ${seasonName}.` : 'Aún no hay juegos aprobados.'}
        </p>
      </div>
    </Card>
  );

  return (
    <>
      {/* «‹ Liga de los martes» (la de la liga, en lugar de la que pone LeagueShell) con «Excel» y compartir en Pro. */}
      <LeagueBackBar
        actions={
          isPro && (
            <>
              {member && events.data.length > 0 && <LeagueExcelButton season={season} events={events.data} players={players.data} />}
              {table.length > 0 && (
                <ShareButton
                  variant="ghost"
                  size="md"
                  iconOnly
                  label="Compartir la tabla"
                  card={shareCard}
                  className="relative rounded-full! bg-surface-2 text-fg-2 after:absolute after:-inset-0.5 after:content-['']"
                />
              )}
            </>
          )
        }
      />
      <div className="flex flex-col px-2">
        {isPro ? (
          <>
            <h1 className="mt-0.5 text-title-pro">Tabla</h1>
            <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2">
              {season && (
                <PillSelect
                  label="Temporada"
                  className="max-w-full"
                  options={[
                    ...seasons.data.map((s) => ({ key: s.id, label: s.name, option: `${s.name}${s.status === 'active' ? ' (en curso)' : ''}` })),
                    { key: ALL_SEASONS, label: 'Temporadas', option: 'Ver todas las temporadas…' },
                  ]}
                  value={season.id}
                  onChange={(id) => (id === ALL_SEASONS ? navigate(`${base}/temporadas`) : setSeason(id))}
                />
              )}
              <Segmented
                label="Cómo se cuentan los pinos"
                className="[&>button]:px-3 [&>button]:text-sm"
                options={[
                  { key: 'scratch', label: 'Scratch' },
                  { key: 'hcp', label: 'Con hcp' },
                ]}
                value={withHcp ? 'hcp' : 'scratch'}
                onChange={(k) => set('hcp', k === 'hcp' ? '1' : null)}
              />
            </div>
          </>
        ) : (
          <>
            <div className="mt-1 flex items-center justify-between gap-3">
              <h1 className="text-title">Tabla</h1>
              <PillSelect label="Ordenar la tabla por" options={METRICS.map((m) => ({ key: m.key, label: m.label }))} value={metric} onChange={(k) => set('ver', k)} />
            </div>
            {season && <p className="mt-1.5 text-meta text-muted">{`${season.name} · ${seasonRangeLabel(season)}`}</p>}
          </>
        )}

        {closed && season && (
          <div className="mt-5">
            <SeasonAwardsCard season={season} />
          </div>
        )}

        {error ? (
          <div className="mt-5">
            <LoadError error={error} />
          </div>
        ) : loading ? (
          isPro ? (
            <Skeleton className="mt-3.5 h-[362px] rounded-3xl" />
          ) : (
            <>
              <Skeleton className="mt-5 h-[142px] rounded-3xl" />
              <div className="mt-3.5">
                <ListSkeleton rows={6} />
              </div>
            </>
          )
        ) : isPro ? (
          <>
            {table.length > 0 ? (
              <StandingsTable rows={table} sort={sort} onSort={(k) => set('ver', k)} me={myPlayerId} base={base} totalEvents={played} />
            ) : (
              empty('mt-3.5')
            )}
            <p className="mx-1 mt-1.5 text-[12.5px] leading-[1.4] text-muted">{hcpFormula(hcp)}</p>
            <SeasonRecordsCard className="mt-6" records={seasonRecords(proRows, played, myPlayerId)} />
            {sort === 'promedio' && season && prev && improved.length > 0 && (
              <MostImprovedCard className="mt-[30px]" list={improved} season={season} previous={prev} base={base} myPlayerId={myPlayerId} />
            )}
          </>
        ) : (
          <>
            {place && <MyPlaceCard className="mt-5" copy={placeCopy(place, metric, closed)} />}
            {ranked.length > 0 ? (
              <RankList
                className={place ? 'mt-3.5' : 'mt-5'}
                ranked={ranked}
                value={def.value}
                me={myPlayerId}
                base={base}
                mark={(id) => <TitleMark title={title} playerId={id} />}
              />
            ) : (
              empty(place ? 'mt-3.5' : 'mt-5')
            )}
            <p className="mt-3.5 text-center text-[13px] leading-[1.4] text-muted">
              {metric === 'promedio' ? `Cuentan los juegos aprobados · mínimo ${MIN_RANK_GAMES} para salir` : 'Cuentan los juegos aprobados'}
            </p>
          </>
        )}
      </div>
    </>
  );
}
