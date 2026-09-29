import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { CalendarCheck, Flame, Layers, Medal, Target, TrendingUp, UserRound } from 'lucide-react';
import { useEntriesOfEvents, useEvents, usePlayers } from '../lib/data';
import { useLeagueSeasons } from '../lib/data/seasons';
import { mostImproved, rankGap, rankGapLabel, rankingRows, readBowlingSnapshot, seasonEvents, totalsByPlayer, type Improvement, type RankingRow } from '../lib/bowlingSeason';
import { formatDate } from '../lib/format';
import { useLeagueCtx } from '../lib/league';
import { previousSeason, type Season } from '../lib/seasons';
import { MIN_RANK_GAMES, rank } from '../lib/stats';
import { AnimatedNumber, Card, Empty, ListSkeleton, LoadError, Position, Tabs, cx } from '../components/ui';
import { Avatar } from '../components/Avatar';
import { LeagueExcelButton } from '../components/LeagueExcelButton';
import { SeasonAwardsCard, SeasonSelect, useSeasonParam } from '../components/season/SeasonSelect';
import { ShareButton, type ShareTableSpec } from '../components/share';
import { TitleMark, useCurrentTitle } from '../components/badges/LeagueBadges';

type Metric = 'promedio' | 'juego' | 'serie' | 'asistencia';

const metrics: { key: Metric; label: string; short: string; icon: ReactNode; value: (r: RankingRow) => number }[] = [
  { key: 'promedio', label: 'Promedio', short: 'Prom.', icon: <Target className="size-4" />, value: (r) => r.average },
  { key: 'juego', label: 'Mejor juego', short: 'Juego', icon: <Flame className="size-4" />, value: (r) => r.high },
  { key: 'serie', label: 'Mejor serie', short: 'Serie', icon: <Layers className="size-4" />, value: (r) => r.series },
  { key: 'asistencia', label: 'Asistencia', short: 'Eventos', icon: <CalendarCheck className="size-4" />, value: (r) => r.events },
];

/** «1 ene 2026 – en curso», «1 ene 2026 – hasta el 20 dic 2026» o, cerrada, «1 ene 2026 – 20 dic 2026». */
export function seasonRangeLabel(season: Pick<Season, 'startsOn' | 'endsOn' | 'status'>): string {
  const end = season.status === 'active' ? (season.endsOn ? `hasta el ${formatDate(season.endsOn)}` : 'en curso') : season.endsOn ? formatDate(season.endsOn) : '';
  return `${formatDate(season.startsOn)} – ${end}`;
}

/**
 * Ranking de la liga por temporada (la elegida en «Temporada 2026 ▾»; por defecto la de ahora), para motivar a ir a
 * las prácticas. Una temporada cerrada muestra su tabla guardada (si la tiene) y sus premios. Con el promedio: el
 * más mejorado contra la temporada anterior y, a quien todavía no tiene el mínimo, cuántos juegos le faltan.
 */
export default function RankingPage() {
  const { lid, base, myPlayerId, member, league } = useLeagueCtx();
  const [params, setParams] = useSearchParams();
  const events = useEvents(lid);
  const players = usePlayers(lid);
  const seasons = useLeagueSeasons(lid);
  const [season, setSeason] = useSeasonParam(seasons.data);
  const prev = previousSeason(seasons.data, season);
  // El campeón de la última temporada cerrada lleva el escudo «Título vigente» (§6.2 de docs/insignias.md).
  const title = useCurrentTitle();

  const metric = (metrics.find((m) => m.key === params.get('ver'))?.key ?? 'promedio') as Metric;
  // Sin temporadas (no se pudieron leer): toda la liga.
  const seasonIds = useMemo(() => seasonEvents(events.data, season).map((e) => e.id), [events.data, season]);
  const prevIds = useMemo(() => (prev ? seasonEvents(events.data, prev).map((e) => e.id) : []), [events.data, prev]);
  const entries = useEntriesOfEvents(lid, useMemo(() => [...seasonIds, ...prevIds], [seasonIds, prevIds]));

  const { rows, improved } = useMemo(() => {
    const inSeason = new Set(seasonIds);
    const inPrev = new Set(prevIds);
    const current = entries.data.filter((e) => inSeason.has(e.eventId));
    const names = new Map(players.data.map((p) => [p.id, p.name]));
    const up = prev ? mostImproved(totalsByPlayer(current), totalsByPlayer(entries.data.filter((e) => inPrev.has(e.eventId)))) : [];
    return { rows: rankingRows(current, players.data), improved: up.filter((u) => names.has(u.playerId)).map((u) => ({ ...u, name: names.get(u.playerId)! })) };
  }, [entries.data, players.data, seasonIds, prevIds, prev]);

  // Temporada cerrada con su tabla guardada: el promedio y el mejor juego se ven tal como quedaron al cerrarla (la
  // serie y la asistencia no se guardan: salen de los juegos).
  const snapshot = season?.status === 'closed' ? readBowlingSnapshot(season.standings) : null;
  const shown = snapshot && (snapshot.covers as string[]).includes(metric) ? snapshot.rows : rows;
  const minGames = MIN_RANK_GAMES;
  const current = metrics.find((m) => m.key === metric)!;
  const eligible = shown.filter((r) => (metric === 'promedio' ? r.games >= minGames : current.value(r) > 0));
  const ranked = rank(eligible, current.value);
  const podium = ranked.slice(0, 3);
  // «Tú: 14.º · te faltan 2 juegos para entrar» (solo mientras la temporada sigue).
  const gap = metric === 'promedio' && season?.status !== 'closed' ? rankGap(shown, myPlayerId, minGames) : null;
  const seasonName = season?.name ?? 'la temporada';

  const set = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    p.set(k, v);
    setParams(p, { replace: true });
  };
  const error = events.error ?? players.error ?? entries.error;
  const loading = events.loading || players.loading || (seasons.loading && !seasons.data.length) || (entries.loading && !entries.data.length);

  // Imagen del ranking que se ve (temporada y métrica) para mandar al grupo.
  const shareCard = (): ShareTableSpec => ({
    kind: 'table',
    title: league.name,
    subtitle: `Ranking${season ? ` · ${season.name}` : ''} · ${current.label}`,
    nameLabel: 'Jugador',
    columns: [{ label: 'Juegos' }, { label: current.short, strong: true }],
    sections: [{ rows: ranked.map(({ row, pos }) => ({ rank: pos, name: row.name, values: [row.games, current.value(row)] })) }],
    note: metric === 'promedio' ? `Solo juegos verificados. Mínimo ${minGames} juegos en la temporada.` : 'Solo juegos verificados.',
  });

  return (
    <>
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
            <Medal className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold tracking-tight">Ranking de la liga</h1>
            <p className="text-sm text-muted">Prácticas y torneos de la temporada, solo juegos verificados.</p>
          </div>
          {ranked.length > 0 && <ShareButton variant="ghost" size="md" iconOnly label="Compartir el ranking" card={shareCard} />}
          {member && events.data.length > 0 && <LeagueExcelButton season={season} events={events.data} players={players.data} />}
        </div>

        {season && (
          <div className="-mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <SeasonSelect seasons={seasons.data} value={season} onChange={setSeason} />
            <span className="text-xs text-muted">{seasonRangeLabel(season)}</span>
          </div>
        )}

        {season?.status === 'closed' && <SeasonAwardsCard season={season} />}

        <Tabs items={metrics.map(({ key, label, icon }) => ({ key, label, icon }))} active={metric} onChange={(k) => set('ver', k)} />

        {gap && !loading && !error && (
          <p className="flex min-h-11 items-center gap-2 rounded-xl bg-accent-soft/60 px-3 py-2 text-sm font-medium">
            <UserRound className="size-4 shrink-0 text-accent" aria-hidden="true" />
            {rankGapLabel(gap)}
          </p>
        )}

        {error ? (
          <LoadError error={error} />
        ) : loading ? (
          <ListSkeleton rows={6} />
        ) : ranked.length === 0 ? (
          <Empty icon={<Medal className="size-8" />} title="Todavía no hay ranking">
            {metric === 'promedio' ? `Hace falta tener al menos ${minGames} juegos verificados en ${seasonName}.` : 'Aún no hay juegos verificados.'}
          </Empty>
        ) : (
          <div key={`${metric}-${season?.id ?? 'todo'}`} className="flex flex-col gap-4">
            <div className="stagger grid grid-cols-3 items-end gap-2">
              {[podium[1], podium[0], podium[2]].map((p, i) =>
                p ? (
                  <Link
                    key={p.row.playerId || p.row.name}
                    to={`${base}/j/${p.row.playerId}`}
                    style={{ '--i': i } as CSSProperties}
                    className={cx(
                      'flex flex-col items-center gap-1.5 rounded-2xl border border-line bg-surface p-3 text-center transition hover:-translate-y-0.5',
                      p.pos === 1 ? 'pb-6 pt-4' : 'pb-3',
                    )}
                  >
                    <Position pos={p.pos} />
                    <Avatar name={p.row.name} className={p.pos === 1 ? 'size-14 text-lg' : 'size-11 text-sm'} />
                    <span className="line-clamp-2 text-xs font-medium">{p.row.name}</span>
                    <TitleMark title={title} playerId={p.row.playerId} />
                    <span className="text-xl font-bold">
                      <AnimatedNumber value={current.value(p.row)} />
                    </span>
                  </Link>
                ) : (
                  <div key={i} />
                ),
              )}
            </div>

            {ranked.length > 3 && (
              <Card className="stagger divide-y divide-line overflow-hidden">
                {ranked.slice(3).map(({ row, pos }, i) => (
                  <Link
                    key={row.playerId || row.name}
                    to={`${base}/j/${row.playerId}`}
                    style={{ '--i': i } as CSSProperties}
                    className={cx('flex items-center gap-3 px-4 py-2.5 transition hover:bg-surface-2', row.playerId === myPlayerId && 'bg-accent-soft/50')}
                  >
                    <Position pos={pos} />
                    <Avatar name={row.name} className="size-8 text-xs" />
                    <span className="flex min-w-0 flex-1 items-center gap-1.5">
                      <span className="truncate font-medium">{row.name}</span>
                      <TitleMark title={title} playerId={row.playerId} />
                    </span>
                    <span className="text-xs text-muted">{row.games} juegos</span>
                    <span className="w-12 text-right text-base font-bold tabular-nums">{current.value(row)}</span>
                  </Link>
                ))}
              </Card>
            )}
            {metric === 'promedio' && <p className="text-xs text-muted">Mínimo {minGames} juegos verificados en la temporada para aparecer.</p>}
          </div>
        )}

        {metric === 'promedio' && !loading && !error && season && prev && improved.length > 0 && (
          <MostImprovedCard list={improved} season={season} previous={prev} base={base} myPlayerId={myPlayerId} />
        )}
      </div>
    </>
  );
}

/** Cuántos se ven en «Más mejorado». */
const IMPROVED_SHOWN = 5;

/** Más mejorado: promedio de esta temporada contra el de la anterior (con el mínimo de juegos en las dos). */
export function MostImprovedCard({
  list,
  season,
  previous,
  base,
  myPlayerId,
}: {
  list: readonly (Improvement & { name: string })[];
  season: Pick<Season, 'name'>;
  previous: Pick<Season, 'name'>;
  base: string;
  myPlayerId?: string | null;
}) {
  const ranked = rank(list.slice(0, IMPROVED_SHOWN), (r) => r.delta);
  return (
    <section className="flex flex-col gap-2" aria-label="Más mejorado">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-muted">
        <TrendingUp className="size-4" aria-hidden="true" /> Más mejorado
      </h2>
      <Card className="divide-y divide-line overflow-hidden">
        {ranked.map(({ row, pos }) => (
          <Link
            key={row.playerId}
            to={`${base}/j/${row.playerId}`}
            className={cx('flex min-h-12 items-center gap-3 px-4 py-2.5 transition hover:bg-surface-2', row.playerId === myPlayerId && 'bg-accent-soft/50')}
          >
            <Position pos={pos} />
            <Avatar name={row.name} className="size-8 text-xs" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{row.name}</span>
              <span className="block text-xs text-muted tabular-nums">{`${row.previous} → ${row.current}`}</span>
            </span>
            <span className="text-base font-bold text-ok tabular-nums">{`+${row.delta}`}</span>
          </Link>
        ))}
      </Card>
      <p className="text-xs text-muted">{`Promedio de ${season.name} contra ${previous.name}, con al menos ${MIN_RANK_GAMES} juegos verificados en las dos.`}</p>
    </section>
  );
}
