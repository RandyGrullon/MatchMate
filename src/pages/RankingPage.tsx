import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { CalendarCheck, Flame, Layers, Medal, Target } from 'lucide-react';
import { useEntriesOfEvents, useEvents, usePlayers } from '../lib/data';
import { useLeagueCtx } from '../lib/league';
import { MIN_RANK_GAMES as MIN_GAMES, playerStats, rank } from '../lib/stats';
import type { Entry } from '../lib/types';
import { AnimatedNumber, Card, Empty, ListSkeleton, LoadError, Position, Tabs, cx } from '../components/ui';
import { Avatar } from '../components/Avatar';
import { LeagueExcelButton } from '../components/LeagueExcelButton';

type Metric = 'promedio' | 'juego' | 'serie' | 'asistencia';

interface Row {
  playerId: string;
  name: string;
  average: number;
  games: number;
  high: number;
  series: number;
  events: number;
}

const metrics: { key: Metric; label: string; icon: ReactNode; value: (r: Row) => number }[] = [
  { key: 'promedio', label: 'Promedio', icon: <Target className="size-4" />, value: (r) => r.average },
  { key: 'juego', label: 'Mejor juego', icon: <Flame className="size-4" />, value: (r) => r.high },
  { key: 'serie', label: 'Mejor serie', icon: <Layers className="size-4" />, value: (r) => r.series },
  { key: 'asistencia', label: 'Asistencia', icon: <CalendarCheck className="size-4" />, value: (r) => r.events },
];

/** Ranking de la liga por temporada (año), para motivar a ir a las prácticas. */
export default function RankingPage() {
  const { lid, base, myPlayerId, member } = useLeagueCtx();
  const [params, setParams] = useSearchParams();
  const events = useEvents(lid);
  const players = usePlayers(lid);

  const years = useMemo(() => [...new Set(events.data.map((e) => e.date.slice(0, 4)))].sort().reverse(), [events.data]);
  const year = params.get('anio') && years.includes(params.get('anio')!) ? params.get('anio')! : years[0];
  const metric = (metrics.find((m) => m.key === params.get('ver'))?.key ?? 'promedio') as Metric;
  const yearEventIds = useMemo(() => events.data.filter((e) => e.date.startsWith(year ?? '')).map((e) => e.id), [events.data, year]);
  const entries = useEntriesOfEvents(lid, yearEventIds);

  const rows = useMemo(() => {
    const byPlayer = new Map<string, Entry[]>();
    entries.data.forEach((e) => byPlayer.set(e.playerId, [...(byPlayer.get(e.playerId) ?? []), e]));
    const names = new Map(players.data.map((p) => [p.id, p.name]));
    return [...byPlayer.entries()]
      .filter(([id]) => names.has(id))
      .map(([id, list]): Row => {
        const s = playerStats(list);
        return {
          playerId: id,
          name: names.get(id)!,
          average: s.autoAverage ?? 0,
          games: s.games,
          high: s.high,
          series: s.highSeries,
          // Eventos a los que fue (con al menos un juego verificado).
          events: list.filter((e) => e.scores?.some((sc, i) => sc != null && e.photos?.[i])).length,
        };
      })
      .filter((r) => r.games > 0);
  }, [entries.data, players.data]);

  const current = metrics.find((m) => m.key === metric)!;
  const eligible = rows.filter((r) => (metric === 'promedio' ? r.games >= MIN_GAMES : current.value(r) > 0));
  const ranked = rank(eligible, current.value);
  const podium = ranked.slice(0, 3);

  const set = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    p.set(k, v);
    setParams(p, { replace: true });
  };
  const error = events.error ?? players.error ?? entries.error;

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
          {years.length > 1 && (
            <select
              value={year}
              onChange={(e) => set('anio', e.target.value)}
              aria-label="Temporada"
              className="h-9 rounded-xl border border-line bg-surface px-2 text-sm font-medium"
            >
              {years.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          )}
          {member && events.data.length > 0 && <LeagueExcelButton year={year} events={events.data} players={players.data} />}
        </div>

        <Tabs items={metrics.map(({ key, label, icon }) => ({ key, label, icon }))} active={metric} onChange={(k) => set('ver', k)} />

        {error ? (
          <LoadError error={error} />
        ) : events.loading || players.loading || (entries.loading && !entries.data.length) ? (
          <ListSkeleton rows={6} />
        ) : ranked.length === 0 ? (
          <Empty icon={<Medal className="size-8" />} title="Todavía no hay ranking">
            {metric === 'promedio' ? `Hace falta tener al menos ${MIN_GAMES} juegos verificados en ${year ?? 'la temporada'}.` : 'Aún no hay juegos verificados.'}
          </Empty>
        ) : (
          <div key={`${metric}-${year}`} className="flex flex-col gap-4">
            <div className="stagger grid grid-cols-3 items-end gap-2">
              {[podium[1], podium[0], podium[2]].map((p, i) =>
                p ? (
                  <Link
                    key={p.row.playerId}
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
                    key={row.playerId}
                    to={`${base}/j/${row.playerId}`}
                    style={{ '--i': i } as CSSProperties}
                    className={cx('flex items-center gap-3 px-4 py-2.5 transition hover:bg-surface-2', row.playerId === myPlayerId && 'bg-accent-soft/50')}
                  >
                    <Position pos={pos} />
                    <Avatar name={row.name} className="size-8 text-xs" />
                    <span className="min-w-0 flex-1 truncate font-medium">{row.name}</span>
                    <span className="text-xs text-muted">{row.games} juegos</span>
                    <span className="w-12 text-right text-base font-bold tabular-nums">{current.value(row)}</span>
                  </Link>
                ))}
              </Card>
            )}
            {metric === 'promedio' && <p className="text-xs text-muted">Mínimo {MIN_GAMES} juegos verificados en la temporada para aparecer.</p>}
          </div>
        )}
      </div>
    </>
  );
}
