import type { ReactNode } from 'react';
import { BarChart3 } from 'lucide-react';
import type { ProfileStats } from '../../lib/data/profileGames';
import { STROKE_LABEL } from '../../sports/swimming/events';
import { formatSwimTime } from '../../sports/swimming/time';
import { Card, Empty, LoadError, StatsSkeleton } from '../ui';
import { SportBadge } from './SportBadge';
import { bowlingSummary, hasStats, winRate } from './socialFormat';

function Num({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl bg-surface-2 px-3 py-2">
      <span className="truncate text-[11px] font-medium text-muted">{label}</span>
      <span className="text-lg leading-tight font-bold tabular-nums">{value}</span>
    </div>
  );
}

function SportCard({ sport, note, children }: { sport: string; note?: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <SportBadge sport={sport} className="text-sm" />
        {note && <span className="text-xs text-muted">{note}</span>}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{children}</div>
    </Card>
  );
}

const dash = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? '—' : n);
const strokeText = (s: string) => (STROKE_LABEL as Record<string, string>)[s] ?? s;

/**
 * Resumen por deporte del perfil (lo que ve quien mira: solo ligas que puede ver y nunca las de menores).
 * `skipBowling`: el boliche ya sale arriba con más detalle (tu propio perfil).
 */
export function SportStats({
  stats,
  loading,
  error,
  onRetry,
  skipBowling,
  emptyText = 'Cuando juegue en alguna liga, aquí salen sus números de cada deporte.',
}: {
  stats: ProfileStats | null;
  loading: boolean;
  error: Error | null;
  onRetry?: () => unknown;
  skipBowling?: boolean;
  emptyText?: string | null;
}) {
  if (loading && !stats) return <StatsSkeleton />;
  if (error && !stats) return <LoadError error={error} onRetry={onRetry} />;
  if (!stats || !hasStats(stats, { skipBowling })) {
    return emptyText ? (
      <Empty icon={<BarChart3 className="size-7" aria-hidden="true" />} title="Sin números todavía">
        {emptyText}
      </Empty>
    ) : null;
  }
  const b = !skipBowling && stats.bowling ? bowlingSummary(stats.bowling.series) : null;
  return (
    <div className="stagger flex flex-col gap-3">
      {b && b.sessions > 0 && (
        <SportCard sport="bowling" note={`${b.sessions} ${b.sessions === 1 ? 'evento' : 'eventos'}`}>
          <Num label="Promedio" value={b.avg} />
          <Num label="Juego más alto" value={b.high} />
          <Num label="Mejor serie" value={b.bestSeries} />
          <Num label="Juegos" value={b.games} />
        </SportCard>
      )}
      {stats.matches
        .filter((m) => m.played > 0)
        .map((m) => (
          <SportCard key={m.sport} sport={m.sport} note={`${m.played} ${m.played === 1 ? 'partido' : 'partidos'}`}>
            <Num label="Ganados" value={m.won} />
            <Num label="Perdidos" value={m.lost} />
            <Num label="Empates" value={m.drawn} />
            <Num label="% ganados" value={`${winRate(m.played, m.won)}%`} />
          </SportCard>
        ))}
      {stats.golf && stats.golf.rounds > 0 && (
        <SportCard sport="golf" note={`${stats.golf.rounds} ${stats.golf.rounds === 1 ? 'ronda' : 'rondas'}`}>
          <Num label="Mejor (18 hoyos)" value={dash(stats.golf.best18)} />
          <Num label="Promedio (18)" value={stats.golf.avg18 == null ? '—' : Math.round(stats.golf.avg18 * 10) / 10} />
          <Num label="Mejor (9 hoyos)" value={dash(stats.golf.best9)} />
          <Num label="Rondas" value={stats.golf.rounds} />
        </SportCard>
      )}
      {stats.swim && stats.swim.results > 0 && (
        <Card className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <SportBadge sport="swimming" className="text-sm" />
            <span className="text-xs text-muted">
              {stats.swim.results} {stats.swim.results === 1 ? 'prueba' : 'pruebas'}
            </span>
          </div>
          {stats.swim.bests.length ? (
            <ul className="flex flex-col divide-y divide-line">
              {stats.swim.bests.map((x) => (
                <li key={`${x.distance}-${x.stroke}-${x.pool}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 truncate">
                    {x.distance} m {strokeText(x.stroke).toLowerCase()} <span className="text-xs text-muted">· piscina {x.pool} m</span>
                  </span>
                  <span className="font-bold tabular-nums">{formatSwimTime(x.timeCs)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Todavía sin tiempos válidos.</p>
          )}
        </Card>
      )}
    </div>
  );
}
