import { useState } from 'react';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { monthlyAverages, movingAverage, recentTrend, trendText, TREND_STEP, type StatGame } from '../../lib/bowlingStats';
import { parseDate } from '../../lib/format';
import { ScoreChart, type ChartPoint } from '../ScoreChart';
import { Card, cx } from '../ui';

/** Juegos que se ven en la gráfica y de cuántos es la media móvil. */
export const TREND_LAST = 30;
export const TREND_WINDOW = 5;
/** Meses que se ven en «Por mes». */
const MONTHS_SHOWN = 12;

type View = 'juegos' | 'meses';

const monthName = (month: string) => parseDate(`${month}-01`).toLocaleDateString('es-DO', { month: 'long', year: 'numeric' });

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/**
 * Lo que va debajo de cada mes en la gráfica: «sep»; enero (o el primero, si los meses son de dos años) con el año
 * corto, «ene 26», para saber de qué año es cada uno.
 */
export function monthLabels(months: readonly string[]): string[] {
  const years = new Set(months.map((m) => m.slice(0, 4)));
  return months.map((m, i) => {
    const short = MONTHS_SHORT[Number(m.slice(5, 7)) - 1] ?? m;
    return years.size > 1 && (i === 0 || m.endsWith('-01')) ? `${short} ${m.slice(2, 4)}` : short;
  });
}

/**
 * La tendencia de los juegos que cuentan (del más viejo al más nuevo): los últimos 30 con la media móvil de 5 y el
 * promedio como referencia, o el promedio de cada mes; y en palabras si vas subiendo o bajando.
 */
export function TrendSection({
  games,
  average,
  heading: Heading = 'h3',
  mine = true,
}: {
  games: readonly Pick<StatGame, 'date' | 'score' | 'label'>[];
  average: number | null;
  heading?: 'h2' | 'h3';
  /** Los juegos son de quien mira («vas subiendo»; si no, «va subiendo»). */
  mine?: boolean;
}) {
  const [view, setView] = useState<View>('juegos');
  if (games.length < 2) return null;

  const scores = games.map((g) => g.score);
  const moving = movingAverage(scores, TREND_WINDOW);
  const shown = games.slice(-TREND_LAST);
  const points: ChartPoint[] = shown.map((g) => ({ score: g.score, label: g.label ?? '' }));
  const trend = moving.slice(-TREND_LAST);
  const months = monthlyAverages(games).slice(-MONTHS_SHOWN);
  const monthPoints: ChartPoint[] = months.map((m) => ({
    score: m.average,
    label: `${monthName(m.month)} · ${m.games} ${m.games === 1 ? 'juego' : 'juegos'} · mejor ${m.high}`,
  }));
  const byMonth = view === 'meses' && monthPoints.length >= 2;
  const t = recentTrend(scores);
  const TrendIcon = !t ? null : t.delta >= TREND_STEP ? TrendingUp : t.delta <= -TREND_STEP ? TrendingDown : Minus;

  return (
    <section className="flex flex-col gap-2" aria-label="Tendencia">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <Heading className="text-sm font-semibold text-muted">{byMonth ? `Promedio por mes (${monthPoints.length})` : `Últimos ${points.length} juegos`}</Heading>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          {!byMonth && (
            <>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4 rounded bg-accent" /> juegos
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4 rounded bg-fg" /> media de {TREND_WINDOW}
              </span>
            </>
          )}
          {average != null && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-px w-4 bg-muted" /> promedio {average}
            </span>
          )}
        </span>
      </div>
      {monthPoints.length >= 2 && (
        <div role="radiogroup" aria-label="Ver la tendencia" className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1 text-sm">
          {(
            [
              ['juegos', 'Juego por juego'],
              ['meses', 'Por mes'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={(key === 'meses') === byMonth}
              onClick={() => setView(key)}
              className={cx(
                'min-h-11 rounded-lg font-medium transition',
                (key === 'meses') === byMonth ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <Card className="px-2 pt-3 pb-1 sm:px-4">
        {byMonth ? (
          <ScoreChart
            points={monthPoints}
            average={average}
            unit="de promedio"
            name={`Promedio de los últimos ${monthPoints.length} meses`}
            xLabels={monthLabels(months.map((m) => m.month))}
          />
        ) : (
          <ScoreChart points={points} average={average} trend={trend} />
        )}
      </Card>
      {t && TrendIcon && (
        <p className="flex items-start gap-2 text-sm">
          <TrendIcon className={cx('mt-0.5 size-4 shrink-0', t.delta >= TREND_STEP ? 'text-ok' : t.delta <= -TREND_STEP ? 'text-warn' : 'text-muted')} aria-hidden="true" />
          <span>{trendText(t, mine)}</span>
        </p>
      )}
    </section>
  );
}
