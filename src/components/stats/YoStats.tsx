import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import {
  LEFT_CUTS,
  frameRates,
  hasPins,
  heatLevel,
  monthlyAverages,
  pinReport,
  type FrameRates,
  type PinReport,
  type StatGame,
} from '../../lib/bowlingStats';
import { parseDate } from '../../lib/format';
import type { GameFrames } from '../../lib/types';
import { PIN_ROWS } from '../frames/PinDeck';
import { heatStyle } from '../frames/PinHeatDeck';
import { Card, Segmented, cx } from '../ui';
import { FrameStatsPanel } from './FrameStatsPanel';
import { TREND_LAST } from './TrendSection';

/**
 * Los números de Yo (rediseño «Calma y foco», final/6-perfil.png y p6-perfil.png), solo para mostrar (los calcula
 * GlobalStats.tsx › useBowlingNumbers):
 * - Lite: la tarjeta «Tu promedio» con la gráfica corta, «+9 en octubre» y Mejor juego · Mejor serie · Juegos.
 * - Pro: los 6 números, «Tendencia» (Por juego | Por mes, con fechas y etiquetas) y «Tus tiros» con «Pinos que te
 *   quedan» (y, al tocar «Ver todo», el detalle por cuadros de siempre).
 */

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTHS_LONG = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/** Un número con un decimal a lo más («198.2», «189»), hacia abajo como los promedios del boliche. */
export const oneDecimal = (n: number): string => String(Math.floor(n * 10 + 1e-9) / 10);

/**
 * Cómo va (Lite): «+9 en octubre», «−4 en octubre» o «Parejo en octubre». Es la misma cuenta que la «Tendencia» de
 * Pro (monthCompare: el promedio de este mes contra el del anterior, «Septiembre 189 · Octubre 198.2 · +9.2»), en
 * números enteros. Sin mes anterior con juegos, nada.
 */
export interface TrendBadge {
  dir: 'up' | 'down' | 'flat';
  text: string;
  /** La frase entera, para el lector de pantalla y el `title`. */
  full: string;
}

export function trendBadge(games: readonly Pick<StatGame, 'date' | 'score'>[]): TrendBadge | null {
  const cmp = monthCompare(games);
  if (!cmp?.prev || cmp.delta == null) return null;
  const month = cmp.last.name.toLowerCase();
  const exact = cmp.delta > 0 ? `+${cmp.delta}` : cmp.delta < 0 ? `−${-cmp.delta}` : '0';
  const full = `Tu promedio en ${month}: ${cmp.last.average}; en ${cmp.prev.name.toLowerCase()}: ${cmp.prev.average} (${exact}).`;
  const r = Math.round(cmp.delta);
  if (r >= 1) return { dir: 'up', text: `+${r} en ${month}`, full };
  if (r <= -1) return { dir: 'down', text: `−${-r} en ${month}`, full };
  return { dir: 'flat', text: `Parejo en ${month}`, full };
}

function TrendLine({ badge }: { badge: TrendBadge }) {
  const Icon = badge.dir === 'up' ? TrendingUp : badge.dir === 'down' ? TrendingDown : Minus;
  return (
    <p className={cx('mt-2.5 inline-flex items-center gap-1 text-sm font-semibold', badge.dir === 'up' ? 'text-ok' : 'text-muted')} title={badge.full}>
      <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={2.2} />
      <span aria-hidden="true">{badge.text}</span>
      <span className="sr-only">{badge.full}</span>
    </p>
  );
}

/** Las líneas de la gráfica corta (132 × 76): la de los juegos, el área de abajo y dónde va el último punto. */
export function sparkline(scores: readonly number[], w = 132, h = 76): { line: string; area: string; last: { x: number; y: number } } | null {
  if (scores.length < 2) return null;
  const top = 8.4;
  const bottom = h - 14.4;
  const lo = Math.min(...scores);
  const hi = Math.max(...scores);
  const x = (i: number) => 4 + (i * (w - 8)) / (scores.length - 1);
  const y = (v: number) => (hi === lo ? (top + bottom) / 2 : top + ((hi - v) * (bottom - top)) / (hi - lo));
  const pts = scores.map((s, i) => `${x(i).toFixed(1)} ${y(s).toFixed(1)}`);
  const line = `M${pts.join(' L')}`;
  return { line, area: `${line} L${x(scores.length - 1).toFixed(1)} ${h} L4 ${h} Z`, last: { x: x(scores.length - 1), y: y(scores[scores.length - 1]) } };
}

const safeId = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '');

/** La gráfica corta de la tarjeta del promedio (sin ejes): los últimos juegos, el último con un punto. */
export function Sparkline({ scores, className }: { scores: readonly number[]; className?: string }) {
  const id = `mm-spark-${safeId(useId())}`;
  const s = sparkline(scores);
  if (!s) return null;
  return (
    <svg width="132" height="76" viewBox="0 0 132 76" fill="none" aria-hidden="true" className={cx('shrink-0', className)}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity=".18" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={s.area} fill={`url(#${id})`} />
      <path d={s.line} stroke="var(--accent)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={s.last.x} cy={s.last.y} r={4.5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
    </svg>
  );
}

/** Juegos que se ven en la gráfica corta. */
export const SPARK_GAMES = 8;

/**
 * Lite: «Tu promedio» grande con la gráfica corta de los últimos juegos y cómo vas este mes («+9 en octubre», como la
 * Tendencia de Pro); abajo, Mejor juego · Mejor serie · Juegos. `history`: todos los juegos que cuentan, con su fecha,
 * del más viejo al más nuevo.
 */
export function AverageCard({
  average,
  history,
  high,
  series,
  games,
  className,
}: {
  average: number | null;
  history: readonly Pick<StatGame, 'date' | 'score'>[];
  high: number;
  series: number;
  games: number;
  className?: string;
}) {
  const badge = trendBadge(history);
  const scores = history.map((g) => g.score);
  const trio: [string, ReactNode][] = [
    ['Mejor juego', high || '—'],
    ['Mejor serie', series || '—'],
    ['Juegos', games],
  ];
  return (
    <Card className={cx('overflow-hidden pt-[18px] pr-5 pl-[22px]', className)}>
      <section aria-label="Tu promedio" className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-meta font-medium text-muted">Tu promedio</p>
          <p className="num mt-2 text-hero">{average ?? '—'}</p>
          {badge && <TrendLine badge={badge} />}
        </div>
        <Sparkline scores={scores.slice(-SPARK_GAMES)} className="mb-1 max-[359px]:hidden" />
      </section>
      <dl className="-mr-5 -ml-[22px] mt-4 flex divide-x divide-line border-t border-line pt-3.5 pb-4">
        {trio.map(([label, value]) => (
          <div key={label} className="flex min-w-0 flex-1 flex-col-reverse items-center px-1 text-center">
            <dt className="truncate text-[13px] text-muted">{label}</dt>
            <dd className="num text-2xl leading-[1.1] font-[650]">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

/** Un número de la grilla de Pro. */
export interface NumberItem {
  label: string;
  value: ReactNode;
  /** El promedio va en el color del deporte. */
  accent?: boolean;
}

/** Pro: los 6 números (Promedio, Mejor juego, Mejor serie / Juegos, Hcp, Asistencia) en una tarjeta de 3 × 2. */
export function NumbersGrid({ items, className }: { items: readonly NumberItem[]; className?: string }) {
  return (
    <Card className={cx('overflow-hidden', className)}>
      <dl className="grid grid-cols-3">
        {items.map((it, i) => (
          <div
            key={it.label}
            className={cx(
              'relative flex min-w-0 flex-col-reverse justify-end px-4 py-[13px] max-[389px]:px-3',
              i >= 3 && 'border-t border-line',
              i % 3 !== 0 && "before:absolute before:inset-y-[13px] before:left-0 before:w-px before:bg-line before:content-['']",
            )}
          >
            <dd className={cx('num mt-[3px] text-[25px] leading-[1.15] font-[650]', it.accent && 'text-accent')}>{it.value}</dd>
            <dt className="truncate text-xs font-[550] text-muted">{it.label}</dt>
          </div>
        ))}
      </dl>
    </Card>
  );
}

// ---------- Tendencia (Pro) ----------

/** «Hoy», «Ayer» o «6 oct» (el día de un grupo de juegos en la gráfica). */
export function dayLabel(date: string, today: string): string {
  if (date === today) return 'Hoy';
  const d = parseDate(date);
  const t = parseDate(today);
  if (Math.round((t.getTime() - d.getTime()) / 86_400_000) === 1) return 'Ayer';
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** El mes de un 'YYYY-MM' para debajo de la gráfica: «sep», o «ene 26» si los meses son de dos años. */
const monthShort = (month: string, withYear: boolean) => {
  const m = MONTHS_SHORT[Number(month.slice(5, 7)) - 1] ?? month;
  return withYear ? `${m} ${month.slice(2, 4)}` : m;
};

/** Un punto de la gráfica: el número, su grupo (el día o el mes) y lo que dice al tocarlo. */
export interface TrendPoint {
  score: number;
  group: string;
  label: string;
  tip: string;
}

/** Los puntos «Por juego»: los últimos juegos, en grupos por día («29 sep», «6 oct», «Hoy»). */
export function gamePoints(games: readonly Pick<StatGame, 'date' | 'score' | 'label'>[], today: string, last = TREND_LAST): TrendPoint[] {
  return games.slice(-last).map((g) => ({ score: g.score, group: g.date, label: dayLabel(g.date, today), tip: g.label ?? dayLabel(g.date, today) }));
}

/** Los puntos «Por mes»: el promedio de cada mes (los últimos 12). */
export function monthPoints(games: readonly Pick<StatGame, 'date' | 'score'>[]): TrendPoint[] {
  const months = monthlyAverages(games).slice(-12);
  const years = new Set(months.map((m) => m.month.slice(0, 4)));
  return months.map((m, i) => ({
    score: m.average,
    group: m.month,
    label: monthShort(m.month, years.size > 1 && (i === 0 || m.month.endsWith('-01'))),
    tip: `${MONTHS_LONG[Number(m.month.slice(5, 7)) - 1]} ${m.month.slice(0, 4)} · ${m.games} ${m.games === 1 ? 'juego' : 'juegos'} · mejor ${m.high}`,
  }));
}

/**
 * El eje: el promedio en el medio y la misma distancia arriba y abajo (de 5 en 5, 25 como mínimo), con aire para que
 * el punto más alejado no quede pegado a la línea.
 */
export function trendScale(scores: readonly number[], average: number | null): { mid: number; half: number } {
  const mid = average ?? Math.floor(scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length));
  const dev = Math.max(0, ...scores.map((s) => Math.abs(s - mid)));
  return { mid, half: Math.max(25, Math.ceil((dev + 4) / 5) * 5) };
}

const PLOT_TOP = 10;
const PLOT_BOTTOM = 114;
const CHART_H = 146;
const FIRST_X = 38;
/** Lo mínimo entre dos fechas de abajo (px). */
const LABEL_GAP = 46;

/** Dónde va cada cosa de la gráfica a ese ancho (sin dibujar: sirve para probarla). */
export function trendLayout(points: readonly TrendPoint[], average: number | null, width: number) {
  const { mid, half } = trendScale(
    points.map((p) => p.score),
    average,
  );
  const lastX = width - 8;
  const x = (i: number) => (points.length < 2 ? (FIRST_X + lastX) / 2 : FIRST_X + (i * (lastX - FIRST_X)) / (points.length - 1));
  const y = (v: number) => PLOT_TOP + ((mid + half - v) * (PLOT_BOTTOM - PLOT_TOP)) / (2 * half);
  // Los grupos (días o meses): su nombre debajo, al centro de sus puntos, y una línea punteada entre uno y otro.
  const groups: { label: string; x: number; from: number; to: number }[] = [];
  points.forEach((p, i) => {
    const g = groups[groups.length - 1];
    if (g && points[g.from].group === p.group) g.to = i;
    else groups.push({ label: p.label, x: 0, from: i, to: i });
  });
  groups.forEach((g) => (g.x = (x(g.from) + x(g.to)) / 2));
  const separators = groups.slice(1).map((g) => (x(g.from - 1) + x(g.from)) / 2);
  // De la última hacia atrás: la de hoy siempre; las que se pisan con la de su derecha, no.
  const labels: { label: string; x: number }[] = [];
  for (let k = groups.length - 1; k >= 0; k--) {
    const g = groups[k];
    const right = labels[0];
    if (right && right.x - g.x < LABEL_GAP) continue;
    labels.unshift({ label: g.label, x: Math.min(Math.max(g.x, FIRST_X + 4), width - 16) });
  }
  const scores = points.map((p) => p.score);
  const best = scores.lastIndexOf(Math.max(...scores));
  const last = points.length - 1;
  return { mid, half, x, y, separators, labels, best, last, ticks: [mid + half, mid, mid - half] as const };
}

/** El ancho de la gráfica antes de medir la tarjeta (la de un teléfono de 390 px). */
export const TREND_DEFAULT_WIDTH = 302;

function TrendChart({ points, average, name }: { points: readonly TrendPoint[]; average: number | null; name: string }) {
  const box = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const gradient = `mm-trend-${safeId(useId())}`;
  const [W, setW] = useState(TREND_DEFAULT_WIDTH);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const w = Math.round(el.getBoundingClientRect().width);
      if (w > 0) setW(w);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  if (points.length < 2) return null;
  const L = trendLayout(points, average, W);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${L.x(i).toFixed(1)} ${L.y(p.score).toFixed(1)}`).join(' ');
  const area = `${path} L${L.x(L.last).toFixed(1)} ${PLOT_BOTTOM} L${L.x(0).toFixed(1)} ${PLOT_BOTTOM} Z`;
  const gap = (W - 8 - FIRST_X) / Math.max(1, points.length - 1);
  const dots = gap >= 12;
  const bestScore = points[L.best].score;
  const lastScore = points[L.last].score;
  const close = L.best !== L.last && L.x(L.last) - L.x(L.best) < 64;
  const scores = points.map((p) => p.score);

  function onMove(clientX: number) {
    const rect = svg.current!.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - FIRST_X) / (W - 8 - FIRST_X)) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  }
  const h = hover != null ? points[hover] : null;

  return (
    <div ref={box} className="relative">
      <svg
        ref={svg}
        width={W}
        height={CHART_H}
        viewBox={`0 0 ${W} ${CHART_H}`}
        fill="none"
        className="block w-full touch-pan-y overflow-visible select-none"
        role="img"
        aria-label={`${name}: de ${Math.min(...scores)} a ${Math.max(...scores)}${average != null ? `; tu promedio, ${average}` : ''}`}
        onPointerMove={(e) => onMove(e.clientX)}
        onPointerDown={(e) => onMove(e.clientX)}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity=".16" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g fontSize={11} fill="var(--muted)" className="tabular-nums">
          <text x={0} y={PLOT_TOP + 4}>
            {L.ticks[0]}
          </text>
          <text x={0} y={(PLOT_TOP + PLOT_BOTTOM) / 2 + 4}>
            {L.ticks[1]}
          </text>
          <text x={0} y={PLOT_BOTTOM + 4}>
            {L.ticks[2]}
          </text>
        </g>
        <line x1={30} y1={PLOT_TOP} x2={W} y2={PLOT_TOP} stroke="var(--line)" />
        <line x1={30} y1={PLOT_BOTTOM} x2={W} y2={PLOT_BOTTOM} stroke="var(--line)" />
        {L.separators.map((sx) => (
          <line key={sx} x1={sx} y1={PLOT_TOP} x2={sx} y2={PLOT_BOTTOM} stroke="var(--line)" strokeDasharray="2 3" data-separador="" />
        ))}
        <line x1={30} y1={(PLOT_TOP + PLOT_BOTTOM) / 2} x2={W} y2={(PLOT_TOP + PLOT_BOTTOM) / 2} stroke="var(--muted)" strokeDasharray="3 4" opacity={0.6} />
        <path d={area} fill={`url(#${gradient})`} />
        <path d={path} stroke="var(--accent)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {hover != null && <line x1={L.x(hover)} x2={L.x(hover)} y1={PLOT_TOP} y2={PLOT_BOTTOM} stroke="var(--muted)" strokeWidth={1} />}
        {dots && (
          <g fill="var(--surface)" stroke="var(--accent)" strokeWidth={2}>
            {points.map((p, i) => (i === L.best || i === L.last ? null : <circle key={i} cx={L.x(i)} cy={L.y(p.score)} r={3.5} />))}
          </g>
        )}
        {[L.best, L.last, ...(hover != null && hover !== L.best && hover !== L.last ? [hover] : [])].map((i, k) => (
          <circle key={`${i}-${k}`} cx={L.x(i)} cy={L.y(points[i].score)} r={5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
        ))}
        <g fontSize={11.5} fontWeight={700} fill="var(--fg)">
          {L.best === L.last ? (
            <text x={W - 2} y={L.y(lastScore) - 10.3} textAnchor="end">
              {`${lastScore} mejor`}
            </text>
          ) : (
            <>
              {/* Pegado al último: a la izquierda de su punto, para que no se pisen los dos números. */}
              <text
                x={close ? L.x(L.best) - 9 : Math.min(Math.max(L.x(L.best), FIRST_X + 20), W - 34)}
                y={close ? L.y(bestScore) + 4 : L.y(bestScore) - 10.5}
                textAnchor={close ? 'end' : 'middle'}
                data-mejor=""
              >
                {close ? bestScore : `${bestScore} mejor`}
              </text>
              <text x={W - 2} y={L.y(lastScore) - 10.3} textAnchor="end">
                {lastScore}
              </text>
            </>
          )}
        </g>
        <g fontSize={11.5} fontWeight={600} fill="var(--muted)" textAnchor="middle">
          {L.labels.map((l) => (
            <text key={`${l.label}-${l.x}`} x={l.x} y={CHART_H - 10} data-x-label="">
              {l.label}
            </text>
          ))}
        </g>
      </svg>
      {h && hover != null && (
        <div
          className="pointer-events-none absolute -top-2 z-10 max-w-[85%] -translate-x-1/2 -translate-y-full rounded-lg bg-fg px-2.5 py-1.5 text-xs whitespace-nowrap text-bg shadow-lg"
          style={{ left: `${Math.min(80, Math.max(20, (L.x(hover) / W) * 100))}%` }}
          role="status"
        >
          <b className="tabular-nums">{h.score}</b> <span className="opacity-80">{h.tip}</span>
        </div>
      )}
    </div>
  );
}

/** Abajo de la tendencia: el mes anterior y este, con la diferencia («Septiembre 189 · Octubre 198.2 · +9.2»). */
export interface MonthCompare {
  prev: { name: string; average: string } | null;
  last: { name: string; average: string; games: number };
  /** La diferencia con un decimal (null sin mes anterior). */
  delta: number | null;
}

export function monthCompare(games: readonly Pick<StatGame, 'date' | 'score'>[]): MonthCompare | null {
  const by = new Map<string, { pins: number; games: number }>();
  for (const g of games) {
    const m = g.date.slice(0, 7);
    const v = by.get(m) ?? { pins: 0, games: 0 };
    v.pins += g.score;
    v.games++;
    by.set(m, v);
  }
  const months = [...by.keys()].sort();
  if (!months.length) return null;
  const lastKey = months[months.length - 1];
  const prevKey = months.length > 1 ? months[months.length - 2] : null;
  const avg = (k: string) => by.get(k)!.pins / by.get(k)!.games;
  const name = (k: string) => {
    const n = MONTHS_LONG[Number(k.slice(5, 7)) - 1] ?? k;
    return k.slice(0, 4) === lastKey.slice(0, 4) ? n : `${n} ${k.slice(0, 4)}`;
  };
  const lastAvg = Math.floor(avg(lastKey) * 10 + 1e-9) / 10;
  const prevAvg = prevKey ? Math.floor(avg(prevKey) * 10 + 1e-9) / 10 : null;
  return {
    prev: prevKey ? { name: name(prevKey), average: oneDecimal(avg(prevKey)) } : null,
    last: { name: name(lastKey), average: oneDecimal(avg(lastKey)), games: by.get(lastKey)!.games },
    delta: prevAvg == null ? null : Math.round((lastAvg - prevAvg) * 10) / 10,
  };
}

type TrendView = 'juego' | 'mes';

/**
 * Pro › «Tendencia»: Por juego (los últimos 30, por día: «29 sep», «6 oct», «Hoy»; el mejor y el último con su número)
 * o Por mes (el promedio de cada mes), con tu promedio punteado en el medio. Tocar un punto dice de qué juego es.
 * Abajo, el mes anterior contra este. `games`: los que cuentan, del más viejo al más nuevo.
 */
export function TrendCard({
  games,
  average,
  today,
  className,
}: {
  games: readonly Pick<StatGame, 'date' | 'score' | 'label'>[];
  average: number | null;
  today: string;
  className?: string;
}) {
  const [view, setView] = useState<TrendView>('juego');
  if (games.length < 2) return null;
  const byGame = gamePoints(games, today);
  const byMonth = monthPoints(games);
  const months = byMonth.length >= 2;
  const showMonths = view === 'mes' && months;
  const cmp = monthCompare(games);
  return (
    <Card className={cx('px-5 pt-5 pb-4', className)}>
      <section aria-label="Tendencia">
        <div className="mb-2 flex min-h-9 items-center justify-between gap-3">
          <h3 className="text-base font-[650] tracking-[-0.01em]">Tendencia</h3>
          {months && (
            <Segmented<TrendView>
              label="Ver la tendencia"
              options={[
                { key: 'juego', label: 'Por juego' },
                { key: 'mes', label: 'Por mes' },
              ]}
              value={showMonths ? 'mes' : 'juego'}
              onChange={setView}
              className="rounded-[11px] p-[3px] [&>button]:h-7 [&>button]:rounded-lg [&>button]:px-2.5 [&>button]:text-[13px]"
            />
          )}
        </div>
        {showMonths ? (
          <TrendChart key="mes" points={byMonth} average={average} name={`Tu promedio de los últimos ${byMonth.length} meses`} />
        ) : (
          <TrendChart key="juego" points={byGame} average={average} name={`Tus últimos ${byGame.length} juegos`} />
        )}
        {cmp && (
          <p className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-line pt-3 text-sm text-fg-2">
            {cmp.prev && (
              <span>
                {cmp.prev.name} <b className="num font-semibold text-fg">{cmp.prev.average}</b>
              </span>
            )}
            <span>
              {cmp.last.name} <b className="num font-semibold text-fg">{cmp.last.average}</b>
            </span>
            {cmp.delta != null ? (
              <span className={cx('num font-semibold', cmp.delta > 0 ? 'text-ok' : 'text-muted')}>
                {cmp.delta > 0 ? `+${cmp.delta}` : cmp.delta < 0 ? `−${-cmp.delta}` : '='}
              </span>
            ) : (
              <span className="text-muted">
                {cmp.last.games} {cmp.last.games === 1 ? 'juego' : 'juegos'}
              </span>
            )}
          </p>
        )}
      </section>
    </Card>
  );
}

// ---------- Tus tiros (Pro) ----------

/**
 * De cada 100 cuadros, cuántos fueron strike, spare y abiertos (suman 100: es la barra). El cuadro 10 cuenta por cómo
 * empezó, como los demás.
 */
export function frameShares(rates: Pick<FrameRates, 'frames' | 'spares' | 'opens'>): { strikes: number; spares: number; opens: number } | null {
  if (!rates.frames) return null;
  const strikeFrames = Math.max(0, rates.frames - rates.spares - rates.opens);
  const strikes = Math.round((strikeFrames * 100) / rates.frames);
  const opens = Math.round((rates.opens * 100) / rates.frames);
  return { strikes, spares: Math.max(0, 100 - strikes - opens), opens };
}

/** «El 10 se te queda 7 veces y lo conviertes el 43%.»: el pino que más se queda parado (null sin pinos anotados). */
export function pinLine(report: PinReport): { pin: number; left: number; converted: number | null } | null {
  if (!report.racks) return null;
  const top = [...report.pins].sort((a, b) => b.left - a.left || b.pin - a.pin)[0];
  if (!top || !top.left) return null;
  return { pin: top.pin, left: top.left, converted: top.convertedPct };
}

/** Los 10 pinos chiquitos con su color (más color = se queda parado más veces). Solo para ver. */
export function MiniPinDeck({ report }: { report: PinReport }) {
  const byPin = new Map(report.pins.map((p) => [p.pin, p]));
  return (
    <div aria-hidden="true" className="flex shrink-0 flex-col items-center gap-0.5">
      {PIN_ROWS.map((row) => (
        <div key={row[0]} className="flex gap-1.5">
          {row.map((pin) => {
            const p = byPin.get(pin);
            const level = heatLevel(p?.leftPct ?? null, LEFT_CUTS);
            return (
              <span
                key={pin}
                className="grid size-[22px] place-items-center rounded-full text-[11px] leading-none font-bold tabular-nums"
                style={p?.left ? heatStyle(level) : { background: 'var(--surface-2)', color: 'var(--muted)' }}
              >
                {pin}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/**
 * Pro › «Tus tiros»: de tus cuadros, cuántos strikes, spares y abiertos (barra y números), la primera bola y «Pinos que
 * te quedan». «Ver todo por cuadros» abre debajo el detalle de siempre (rachas, juegos limpios, el mapa de los pinos,
 * tus fuertes y débiles y los spares según lo que quedó). Sin juegos por cuadros, cómo anotarlos.
 */
export function ShotsCard({ frames, games, className }: { frames: readonly GameFrames[]; games: number; className?: string }) {
  const [more, setMore] = useState(false);
  if (!frames.length) {
    if (!games) return null;
    return (
      <Card className={cx('p-5', className)}>
        <section aria-label="Tus tiros">
          <h3 className="text-base font-[650] tracking-[-0.01em]">Tus tiros</h3>
          <p className="mt-1.5 text-sm leading-[1.45] text-muted">
            Anota tus juegos con Teclado (por cuadros) o con Pines (pino por pino) y aquí verás tus strikes, tus spares y qué pinos te quedan.
          </p>
        </section>
      </Card>
    );
  }
  const rates = frameRates(frames);
  const shares = frameShares(rates)!;
  const pinGames = frames.filter(hasPins);
  const report = pinReport(pinGames);
  const line = pinLine(report);
  const legend: [string, number, string][] = [
    ['Strikes', shares.strikes, 'bg-accent'],
    ['Spares', shares.spares, 'bg-accent/45'],
    ['Abiertos', shares.opens, 'bg-faint'],
  ];
  return (
    <>
      <Card className={cx('px-5 pt-5 pb-2', className)}>
        <section aria-label="Tus tiros">
          <div className="mb-2 flex min-h-7 items-baseline justify-between gap-3">
            <h3 className="text-base font-[650] tracking-[-0.01em]">Tus tiros</h3>
            <span className="truncate text-[13px] text-muted">{pinGames.length ? 'Con Teclado y Pines' : 'Con Teclado'}</span>
          </div>
          <div aria-hidden="true" className="mt-1 flex h-3 gap-[3px] overflow-hidden rounded-md">
            {shares.strikes > 0 && <i className="block h-full rounded-[3px] bg-accent" style={{ width: `${shares.strikes}%` }} />}
            {shares.spares > 0 && <i className="block h-full rounded-[3px] bg-accent/45" style={{ width: `${shares.spares}%` }} />}
            {shares.opens > 0 && <i className="block h-full rounded-[3px] bg-surface-2" style={{ width: `${shares.opens}%` }} />}
          </div>
          <dl className="mt-2.5 grid grid-cols-3" aria-label={`De tus ${rates.frames} cuadros`}>
            {legend.map(([label, value, dot]) => (
              <div key={label} className="flex flex-col-reverse gap-0.5">
                <dt className="text-xs font-[550] text-muted">{label}</dt>
                <dd className="num flex items-center gap-1.5 text-[19px] font-[650] tracking-[-0.02em] text-fg">
                  <i aria-hidden="true" className={cx('inline-block size-2 rounded-full', dot)} />
                  {value}%
                </dd>
              </div>
            ))}
          </dl>
          {rates.firstBall != null && (
            <p className="mt-3 flex justify-between gap-3 border-t border-line pt-3 text-sm text-fg-2">
              <span>Primera bola, promedio</span>
              <b className="num font-semibold text-fg">{rates.firstBall.toLocaleString('es-DO')} pinos</b>
            </p>
          )}
          {line && (
            <div className="mt-3.5 flex items-center gap-[18px] border-t border-line pt-3.5">
              <MiniPinDeck report={report} />
              <div className="min-w-0">
                <h4 className="mb-1 text-[15px] font-[650]">Pinos que te quedan</h4>
                <p className="text-[14.5px] leading-[1.45] text-fg-2">
                  El <b className="text-fg">{line.pin}</b> se te queda {line.left} {line.left === 1 ? 'vez' : 'veces'}
                  {line.converted != null ? (
                    <>
                      {' '}
                      y lo conviertes el <b className="text-fg">{line.converted}%</b>.
                    </>
                  ) : (
                    '.'
                  )}
                </p>
              </div>
            </div>
          )}
          <button
            type="button"
            aria-expanded={more}
            onClick={() => setMore((m) => !m)}
            className="mt-2 flex h-11 w-full items-center justify-center gap-1.5 border-t border-line text-meta font-[550] text-fg-2 transition active:opacity-70 focus-visible:outline-2 focus-visible:outline-accent"
          >
            {more ? 'Ver menos' : 'Ver todo por cuadros'}
            <ChevronDown aria-hidden="true" className={cx('size-4 transition-transform', more && 'rotate-180')} />
          </button>
        </section>
      </Card>
      {more && (
        <div className="mt-3.5">
          <FrameStatsPanel frames={frames} games={games} />
        </div>
      )}
    </>
  );
}
