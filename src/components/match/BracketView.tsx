import type { ReactNode } from 'react';
import { Trophy } from 'lucide-react';
import type { Match } from '../../lib/data/matches';
import { champion, roundName, type Bracket, type BracketMatch } from '../../sports/formats/knockout';
import { cx } from '../ui';
import { scoreColumns } from './format';

/**
 * Cuadro de eliminación (src/sports/formats/knockout): una columna por ronda (Cuartos, Semifinal, Final) con
 * desplazamiento horizontal en el teléfono, el partido por el 3.er lugar aparte y el campeón. `matchOf` une cada
 * partido del cuadro con el partido de la base (por `bracket_key`) para mostrar el marcador; `scoreOf` pone otro
 * marcador por lado (los playoffs: las victorias de cada equipo en la serie).
 */
export function BracketView({
  bracket,
  nameOf,
  matchOf,
  scoreOf,
  onMatch,
  highlight = [],
  className,
}: {
  bracket: Bracket;
  nameOf: (id: string) => ReactNode;
  matchOf?: (key: string) => Match | undefined;
  scoreOf?: (bm: BracketMatch) => readonly [ReactNode, ReactNode] | null;
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
              <h3 className="mb-2.5 text-center text-[11px] font-bold tracking-[0.06em] text-muted uppercase">{roundName(r, bracket.rounds)}</h3>
              <div className="flex flex-1 flex-col justify-around gap-3">
                {bracket.matches
                  .filter((m) => m.round === r && !m.thirdPlace)
                  .sort((a, b) => a.index - b.index)
                  .map((m) => (
                    <BracketCell key={m.key} bm={m} nameOf={nameOf} match={matchOf?.(m.key)} score={scoreOf?.(m)} onMatch={onMatch} highlight={highlight} />
                  ))}
              </div>
            </div>
          ))}
          <div className="flex w-40 flex-col items-center justify-center gap-2 text-center">
            <span aria-hidden="true" className={cx('grid size-14 place-items-center rounded-2xl', champ ? 'bg-accent-soft text-gold' : 'bg-surface-2 text-faint')}>
              <Trophy className="size-7" />
            </span>
            <span className="text-[11px] font-bold tracking-[0.06em] text-muted uppercase">Campeón</span>
            <span className={cx('text-[15px] font-semibold', !champ && 'text-muted')}>{champ ? nameOf(champ) : 'Por definir'}</span>
          </div>
        </div>
      </div>
      {third && (
        <div className="w-56">
          <h3 className="mb-2.5 text-[11px] font-bold tracking-[0.06em] text-muted uppercase">3.er lugar</h3>
          <BracketCell bm={third} nameOf={nameOf} match={matchOf?.(third.key)} score={scoreOf?.(third)} onMatch={onMatch} highlight={highlight} />
        </div>
      )}
    </div>
  );
}

function BracketCell({
  bm,
  nameOf,
  match,
  score,
  onMatch,
  highlight,
}: {
  bm: BracketMatch;
  nameOf: (id: string) => ReactNode;
  match?: Match;
  score?: readonly [ReactNode, ReactNode] | null;
  onMatch?: (bm: BracketMatch) => void;
  highlight: readonly string[];
}) {
  const cols: { a: ReactNode; b: ReactNode }[] = score ? [{ a: score[0], b: score[1] }] : scoreColumns(match?.score);
  const line = (id: string | null, seed: number | null, idx: 0 | 1) => {
    const won = !!id && bm.winner === id;
    return (
      <div className={cx('flex min-h-10 items-center gap-2 px-3.5 py-1.5', id && highlight.includes(id) && 'bg-accent-soft', idx === 0 && 'border-b border-line')}>
        {seed != null && <span className="w-4 text-right text-[11px] font-semibold text-faint tabular-nums">{seed}</span>}
        <span className={cx('min-w-0 flex-1 truncate text-[14.5px]', won ? 'font-bold' : bm.winner ? 'font-medium text-muted' : 'font-semibold', !id && 'font-medium text-muted')}>
          {id ? nameOf(id) : bm.bye && idx === 1 ? 'Pase directo' : 'Por definir'}
        </span>
        <span className="flex gap-1.5 tabular-nums">
          {cols.map((c, j) => (
            <span key={j} className="num w-4 text-right text-[15px] font-semibold">
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
  const cls = cx('card-shadow overflow-hidden rounded-[18px] bg-surface text-left', bm.bye && 'opacity-60');
  return onMatch && !bm.bye ? (
    <button type="button" onClick={() => onMatch(bm)} className={cx(cls, 'w-full transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-accent')}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}
