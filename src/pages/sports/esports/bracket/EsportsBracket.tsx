import type { ReactNode } from 'react';
import { Trophy } from 'lucide-react';
import type { Match } from '../../../../lib/data/matches';
import { parseSeriesScore, partTitle, type BracketPart, type ResolvedMatch } from '../../../../sports/esports';
import { MatchStatus } from '../../../../components/match/MatchCard';
import { cellScores } from '../logic';
import { statusInfo } from '../../../../components/match';
import { cx } from '../../../../components/ui';

/**
 * El cuadro de un torneo de esports (§12.8): columnas por ronda con desplazamiento horizontal **dentro de su caja** (la
 * pantalla no se mueve de lado a 360 px), ganadores arriba y perdedores abajo con su título, la gran final y el reinicio
 * al final (o el 3.er lugar en la simple) y el campeón. Cada partido es una tarjeta chica con los dos lados (el nombre
 * o de dónde viene: «Ganador W1-2»), la serie («2-1») y su estado; se toca para abrir la hoja del partido.
 *
 * Lo que se ve sale de `resolvePlan` del motor (el plan recién armado en la vista previa, o el que se arma desde la base
 * con los enlaces) y de los partidos de la base (`matchOf`, por la llave).
 */
export function EsportsBracket({
  matches,
  nameOf,
  seedOf,
  matchOf,
  champion,
  onOpen,
  highlight,
  className,
}: {
  matches: readonly ResolvedMatch[];
  nameOf: (entryId: string) => string;
  seedOf?: (entryId: string) => number | null;
  matchOf?: (key: string) => Match | undefined;
  champion?: string | null;
  onOpen?: (m: Match) => void;
  /** Inscritos resaltados (el mío). */
  highlight?: ReadonlySet<string>;
  className?: string;
}) {
  const parts = sections(matches);
  if (!parts.length) return null;
  return (
    <div className={cx('flex flex-col gap-6', className)}>
      {parts.map((p) => (
        <section key={p.key} aria-label={p.title}>
          {parts.length > 1 && <h3 className="mx-1 mb-2.5 text-[13px] font-bold tracking-[0.06em] text-muted uppercase">{p.title}</h3>}
          <div className="no-scrollbar -mx-4 overflow-x-auto overscroll-x-contain px-4 pb-1" tabIndex={0} aria-label={`${p.title}: se desliza de lado`}>
            <div className="flex min-w-max gap-3">
              {p.columns.map((c) => (
                <div key={c.key} className="flex w-52 flex-col">
                  <h4 className="mb-2 truncate text-center text-[11px] font-bold tracking-[0.06em] text-muted uppercase">{c.title}</h4>
                  <div className="flex flex-1 flex-col justify-around gap-3">
                    {c.matches.map((m) => (
                      <Cell key={m.key} m={m} nameOf={nameOf} seedOf={seedOf} match={matchOf?.(m.key)} onOpen={onOpen} highlight={highlight} />
                    ))}
                  </div>
                </div>
              ))}
              {p.final && <ChampionCell name={champion ? nameOf(champion) : null} />}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}

interface Column {
  key: string;
  title: string;
  matches: ResolvedMatch[];
}

interface Part {
  key: string;
  title: string;
  columns: Column[];
  /** Lleva el campeón al final. */
  final: boolean;
}

/** Ganadores (o el cuadro simple), perdedores y la gran final: cada parte con sus columnas por ronda. */
export function sections(list: readonly ResolvedMatch[]): Part[] {
  const of = (part: BracketPart) => list.filter((m) => m.part === part);
  const w = of('W');
  const l = of('L');
  const gf = [...of('GF'), ...of('GF2')];
  const p3 = of('P3');
  const double = l.length > 0 || gf.length > 0;
  const byRound = (ms: readonly ResolvedMatch[], part: BracketPart): Column[] => {
    const rounds = [...new Set(ms.map((m) => m.round))].sort((a, b) => a - b);
    const last = rounds.at(-1) ?? 1;
    return rounds.map((r) => ({
      key: `${part}${r}`,
      // En la doble, la última de ganadores es «Final de ganadores» (la final es la gran final).
      title: double && part === 'W' && r === last ? 'Final de ganadores' : partTitle(part, r, last),
      matches: ms.filter((m) => m.round === r).sort((a, b) => a.index - b.index),
    }));
  };
  const out: Part[] = [];
  if (w.length) out.push({ key: 'W', title: double ? 'Ganadores' : 'Cuadro', columns: byRound(w, 'W'), final: !double && !p3.length });
  if (l.length) out.push({ key: 'L', title: 'Perdedores', columns: byRound(l, 'L'), final: false });
  if (gf.length)
    out.push({
      key: 'GF',
      title: 'Gran final',
      columns: gf.map((m) => ({ key: m.key, title: partTitle(m.part, 1, 1), matches: [m] })),
      final: true,
    });
  if (p3.length) {
    // Simple con 3.er lugar: el campeón va después de la final (en la primera parte) y el 3.er lugar aparte.
    if (out[0]) out[0].final = true;
    out.push({ key: 'P3', title: '3.er lugar', columns: [{ key: 'P3', title: partTitle('P3', 1, 1), matches: p3 }], final: false });
  }
  return out;
}

function Cell({
  m,
  nameOf,
  seedOf,
  match,
  onOpen,
  highlight,
}: {
  m: ResolvedMatch;
  nameOf: (id: string) => string;
  seedOf?: (id: string) => number | null;
  match?: Match;
  onOpen?: (m: Match) => void;
  highlight?: ReadonlySet<string>;
}) {
  const score = parseSeriesScore(match?.score);
  const nums = cellScores(score);
  const voided = match?.status === 'void';
  const winnerSide = match?.status === 'walkover' ? (match.walkoverSide === 1 ? 2 : match.walkoverSide === 2 ? 1 : null) : (match?.winner ?? null);
  const line = (i: 0 | 1): ReactNode => {
    const id = m.known[i];
    const won = winnerSide === i + 1;
    const lost = winnerSide !== null && !won;
    const seed = id && seedOf ? seedOf(id) : null;
    const label = id ? nameOf(id) : m.labels[i] || 'Por definir';
    return (
      <div className={cx('flex min-h-10 items-center gap-2 px-3 py-1.5', i === 0 && 'border-b border-line', id && highlight?.has(id) && 'bg-accent-soft')}>
        {seed != null && <span className="w-4 shrink-0 text-right text-[11px] font-semibold text-faint tabular-nums">{seed}</span>}
        <span className={cx('min-w-0 flex-1 truncate text-[14.5px]', !id ? 'font-medium text-muted' : won ? 'font-bold' : lost ? 'font-medium text-muted' : 'font-semibold')}>{label}</span>
        {nums && <span className={cx('num w-6 shrink-0 text-right text-[15px]', won ? 'font-bold' : 'font-medium text-muted')}>{nums[i]}</span>}
      </div>
    );
  };
  const status = match ? statusInfo(match) : null;
  // «Final» ya se ve en el marcador y el ganador en negrita: solo se dice lo que espera o cambia algo.
  const showStatus = !!match && match.status !== 'scheduled' && status?.label !== 'Final';
  const body = (
    <>
      {line(0)}
      {line(1)}
      {(voided || showStatus) && (
        <div className="flex items-center gap-2 border-t border-line px-3 py-1">
          {voided ? <span className="text-[12px] text-muted">{match?.note || 'No hizo falta'}</span> : status && <MatchStatus label={status.label} tone={status.tone} live={status.live} className="text-[12px]" />}
        </div>
      )}
    </>
  );
  const cls = cx('card-shadow block w-full overflow-hidden rounded-[18px] bg-surface text-left', voided && 'opacity-60');
  return match && onOpen ? (
    <button
      type="button"
      onClick={() => onOpen(match)}
      aria-label={`${m.stage || m.key}: ${m.known[0] ? nameOf(m.known[0]) : m.labels[0] || 'Por definir'} contra ${m.known[1] ? nameOf(m.known[1]) : m.labels[1] || 'Por definir'}`}
      className={cx(cls, 'transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-accent')}
    >
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function ChampionCell({ name }: { name: string | null }) {
  return (
    <div className="flex w-36 flex-col items-center justify-center gap-2 text-center">
      <span aria-hidden="true" className={cx('grid size-14 place-items-center rounded-2xl', name ? 'bg-accent-soft text-gold' : 'bg-surface-2 text-faint')}>
        <Trophy className="size-7" />
      </span>
      <span className="text-[11px] font-bold tracking-[0.06em] text-muted uppercase">Campeón</span>
      <span className={cx('max-w-full truncate text-[15px] font-semibold', !name && 'text-muted')}>{name ?? 'Por definir'}</span>
    </div>
  );
}
