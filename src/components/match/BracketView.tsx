import type { ReactNode } from 'react';
import { Trophy } from 'lucide-react';
import type { Match } from '../../lib/data/matches';
import { champion, roundName, type Bracket, type BracketMatch } from '../../sports/formats/knockout';
import { cx } from '../ui';
import { scoreColumns } from './format';

/**
 * Cuadro de eliminación (src/sports/formats/knockout): una columna por ronda (Cuartos, Semifinal, Final) con
 * desplazamiento horizontal en el teléfono, el partido por el 3.er lugar aparte y el campeón. `matchOf` une cada
 * partido del cuadro con el partido de la base (por `bracket_key`) para mostrar el marcador.
 */
export function BracketView({
  bracket,
  nameOf,
  matchOf,
  onMatch,
  highlight = [],
  className,
}: {
  bracket: Bracket;
  nameOf: (id: string) => ReactNode;
  matchOf?: (key: string) => Match | undefined;
  onMatch?: (bm: BracketMatch) => void;
  /** Ids resaltados (mi pareja o equipo). */
  highlight?: readonly string[];
  className?: string;
}) {
  const rounds = Array.from({ length: bracket.rounds }, (_, i) => i + 1);
  const third = bracket.matches.find((m) => m.thirdPlace);
  const champ = champion(bracket);
  return (
    <div className={cx('flex flex-col gap-4', className)}>
      <div className="no-scrollbar -mx-4 overflow-x-auto px-4">
        <div className="flex min-w-max gap-4">
          {rounds.map((r) => (
            <div key={r} className="flex w-56 flex-col">
              <h3 className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-muted">{roundName(r, bracket.rounds)}</h3>
              <div className="flex flex-1 flex-col justify-around gap-3">
                {bracket.matches
                  .filter((m) => m.round === r && !m.thirdPlace)
                  .sort((a, b) => a.index - b.index)
                  .map((m) => (
                    <BracketCell key={m.key} bm={m} nameOf={nameOf} match={matchOf?.(m.key)} onMatch={onMatch} highlight={highlight} />
                  ))}
              </div>
            </div>
          ))}
          <div className="flex w-40 flex-col items-center justify-center gap-2 text-center">
            <Trophy className={cx('size-8', champ ? 'text-gold' : 'text-muted')} />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Campeón</span>
            <span className="font-semibold">{champ ? nameOf(champ) : 'Por definir'}</span>
          </div>
        </div>
      </div>
      {third && (
        <div className="w-56">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">3.er lugar</h3>
          <BracketCell bm={third} nameOf={nameOf} match={matchOf?.(third.key)} onMatch={onMatch} highlight={highlight} />
        </div>
      )}
    </div>
  );
}

function BracketCell({
  bm,
  nameOf,
  match,
  onMatch,
  highlight,
}: {
  bm: BracketMatch;
  nameOf: (id: string) => ReactNode;
  match?: Match;
  onMatch?: (bm: BracketMatch) => void;
  highlight: readonly string[];
}) {
  const cols = scoreColumns(match?.score);
  const line = (id: string | null, seed: number | null, idx: 0 | 1) => {
    const won = !!id && bm.winner === id;
    return (
      <div className={cx('flex items-center gap-2 px-3 py-1.5', id && highlight.includes(id) && 'bg-accent-soft/60', idx === 0 && 'border-b border-line')}>
        {seed != null && <span className="w-4 text-right text-[11px] text-muted tabular-nums">{seed}</span>}
        <span className={cx('min-w-0 flex-1 truncate text-sm', won ? 'font-semibold' : bm.winner ? 'text-muted' : '', !id && 'italic text-muted')}>
          {id ? nameOf(id) : bm.bye && idx === 1 ? 'Pase directo' : 'Por definir'}
        </span>
        <span className="flex gap-1.5 tabular-nums">
          {cols.map((c, j) => (
            <span key={j} className="w-4 text-right text-sm">
              {idx === 0 ? c.a : c.b}
            </span>
          ))}
        </span>
      </div>
    );
  };
  const body = (
    <>
      {line(bm.side1, bm.seed1, 0)}
      {line(bm.side2, bm.seed2, 1)}
    </>
  );
  const cls = cx('overflow-hidden rounded-xl border border-line bg-surface text-left', bm.bye && 'opacity-60');
  return onMatch && !bm.bye ? (
    <button type="button" onClick={() => onMatch(bm)} className={cx(cls, 'w-full transition hover:border-accent/50')}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}
