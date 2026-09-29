import { useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { Award, ChevronDown, Trophy } from 'lucide-react';
import { formatDate } from '../../lib/format';
import { pickSeason, type Season, type SeasonAward } from '../../lib/seasons';
import { Card, cx } from '../ui';

/** Parámetro de la dirección con la temporada elegida (se comparte el link y se ve la misma). */
export const SEASON_PARAM = 'temporada';

/** La temporada elegida en ?temporada= (o la de ahora) y cómo cambiarla. */
export function useSeasonParam(seasons: readonly Season[]): [Season | null, (id: string) => void] {
  const [params, setParams] = useSearchParams();
  const season = pickSeason(seasons, params.get(SEASON_PARAM));
  const set = useCallback(
    (id: string) => {
      const p = new URLSearchParams(params);
      p.set(SEASON_PARAM, id);
      setParams(p, { replace: true });
    },
    [params, setParams],
  );
  return [season, set];
}

/**
 * Selector de temporada de las tablas y rankings: «Temporada 2026 ▾». Con una sola temporada se ve solo el
 * nombre (no hay nada que elegir).
 */
export function SeasonSelect({
  seasons,
  value,
  onChange,
  className,
}: {
  seasons: readonly Season[];
  value: Season | null;
  onChange: (id: string) => void;
  className?: string;
}) {
  if (!value) return null;
  if (seasons.length < 2) {
    return <span className={cx('inline-flex h-11 items-center text-sm font-medium text-muted', className)}>{value.name}</span>;
  }
  return (
    <label className={cx('relative inline-flex h-11 min-w-0 items-center', className)}>
      <span className="sr-only">Temporada</span>
      <select
        value={value.id}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 max-w-[12rem] appearance-none truncate rounded-xl border border-line bg-surface pl-3 pr-8 text-sm font-medium text-fg focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
      >
        {seasons.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
            {s.status === 'active' ? ' (en curso)' : ''}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 size-4 text-muted" aria-hidden />
    </label>
  );
}

const awardOrder: Record<SeasonAward['kind'], number> = {
  campeon: 0,
  subcampeon: 1,
  tercero: 2,
  mvp: 3,
  mas_mejorado: 4,
  fair_play: 5,
  otro: 6,
};

/** Premios de una temporada cerrada (campeón arriba) con la fecha del cierre. */
export function SeasonAwardsCard({ season }: { season: Season }) {
  if (season.status !== 'closed') return null;
  const awards = [...season.awards].sort((a, b) => awardOrder[a.kind] - awardOrder[b.kind]);
  const champion = awards.find((a) => a.kind === 'campeon');
  const rest = awards.filter((a) => a !== champion);
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <Trophy className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted">
            {season.name} · terminó{season.endsOn ? ` el ${formatDate(season.endsOn)}` : ''}
          </p>
          <p className="truncate font-semibold">{champion ? `Campeón: ${champion.name}` : 'Temporada cerrada'}</p>
        </div>
      </div>
      {rest.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-sm">
          {rest.map((a) => (
            <li key={a.id} className="flex items-start gap-2">
              <Award className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0">
                <span className="text-muted">{a.label}:</span> <span className="font-medium">{a.name}</span>
                {a.note && <span className="block text-xs text-muted">{a.note}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
