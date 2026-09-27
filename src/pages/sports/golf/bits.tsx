import type { ReactNode } from 'react';
import { handicapFor, roundWhs, strokesReceived, type GolfCourse, type Nine } from '../../../sports/golf/course';
import { scoreRound, type GolfCompetition } from '../../../sports/golf/scoring';
import type { GolfCardDoc, GolfRoundFull } from '../../../lib/data/golf';
import { Badge, Modal, cx } from '../../../components/ui';
import { cardHoles, formatLabel, golfRoundOf, hcpText, holeTone, indexText, toParText } from './logic';

/** Golpes contra el par con color: bajo par verde, sobre par normal. */
export function ToPar({ value, className }: { value: number | null | undefined; className?: string }) {
  return (
    <span className={cx('tabular-nums', value != null && value < 0 && 'text-ok', value === 0 && 'text-accent', className)}>{toParText(value)}</span>
  );
}

// Eagle: texto sobre el dorado con el color del tema (--on-gold); si el tema no lo trae, tinta oscura, que se
// lee sobre el dorado claro y el oscuro (el blanco fijo no se lee en modo oscuro).
const TONE: Record<string, string> = {
  eagle: 'rounded-full bg-gold text-[color:var(--on-gold,#0d0f15)]',
  birdie: 'rounded-full ring-2 ring-ok text-ok',
  par: '',
  bogey: 'rounded-sm ring-1 ring-line',
  double: 'rounded-sm ring-2 ring-muted/60',
};

/** Golpes de un hoyo con el círculo (birdie), doble círculo (eagle) o cuadro (bogey) de las tarjetas. */
export function HoleScore({ strokes, par, pickedUp }: { strokes: number | null; par: number; pickedUp?: boolean }) {
  if (pickedUp) return <span className="text-xs font-semibold text-warn" title="Recogió">R</span>;
  if (strokes == null) return <span className="text-muted">·</span>;
  const tone = holeTone(strokes, par);
  return <span className={cx('inline-flex size-6 items-center justify-center text-sm font-semibold tabular-nums', tone && TONE[tone])}>{strokes}</span>;
}

/**
 * Tarjeta hoyo por hoyo (ida y vuelta, con par, SI, golpes, putts y totales). En el teléfono se desliza de lado.
 */
export function ScoreTable({ round, card, competition }: { round: { course: GolfCourse; nine: Nine }; card: GolfCardDoc; competition: GolfCompetition }) {
  const holes = cardHoles(round, card.teeId);
  const received = strokesReceived(card.playingHcp, holes.map((h) => h.si));
  const score = scoreRound(golfRoundOf(round, card), competition);
  const halves = holes.length === 18 ? [holes.slice(0, 9), holes.slice(9)] : [holes];
  const showPts = competition.format === 'stableford';
  const anyPutts = card.putts.some((p) => p != null);
  const sum = (xs: (number | null)[]) => (xs.every((x) => x == null) ? null : xs.reduce<number>((a, b) => a + (b ?? 0), 0));
  return (
    <div className="flex flex-col gap-3">
      {halves.map((part, h) => {
        const offset = h * 9;
        const idx = part.map((_, k) => offset + k);
        return (
          <div key={h} className="no-scrollbar -mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[34rem] border-separate border-spacing-0 text-center text-sm">
              <thead>
                <tr className="text-xs text-muted">
                  <th className="w-16 py-1 text-left font-medium">Hoyo</th>
                  {part.map((x) => (
                    <th key={x.number} className="py-1 font-medium">
                      {x.number}
                    </th>
                  ))}
                  <th className="py-1 font-semibold">{halves.length === 2 ? (h === 0 ? 'Ida' : 'Vuelta') : 'Total'}</th>
                </tr>
              </thead>
              <tbody>
                <tr className="text-xs text-muted">
                  <td className="text-left">Par</td>
                  {part.map((x) => (
                    <td key={x.number}>{x.par}</td>
                  ))}
                  <td className="font-semibold">{part.reduce((a, x) => a + x.par, 0)}</td>
                </tr>
                <tr className="text-xs text-muted">
                  <td className="text-left">SI</td>
                  {part.map((x, k) => (
                    <td key={x.number}>
                      {x.si}
                      {received[offset + k] > 0 && <span className="text-accent">{'•'.repeat(Math.min(received[offset + k], 3))}</span>}
                    </td>
                  ))}
                  <td />
                </tr>
                <tr>
                  <td className="py-1 text-left text-xs font-medium">Golpes</td>
                  {part.map((x, k) => (
                    <td key={x.number} className="py-1">
                      <HoleScore strokes={card.strokes[offset + k]} par={x.par} pickedUp={card.pickedUp[offset + k]} />
                    </td>
                  ))}
                  <td className="py-1 font-bold tabular-nums">{sum(idx.map((i) => card.strokes[i])) ?? '–'}</td>
                </tr>
                {anyPutts && (
                  <tr className="text-xs text-muted">
                    <td className="text-left">Putts</td>
                    {idx.map((i) => (
                      <td key={i}>{card.putts[i] ?? '·'}</td>
                    ))}
                    <td className="font-semibold">{sum(idx.map((i) => card.putts[i])) ?? '–'}</td>
                  </tr>
                )}
                {showPts && (
                  <tr className="text-xs text-muted">
                    <td className="text-left">Puntos</td>
                    {idx.map((i) => (
                      <td key={i}>{score.holes[i]?.points ?? '·'}</td>
                    ))}
                    <td className="font-semibold">{sum(idx.map((i) => score.holes[i]?.points ?? null)) ?? '–'}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        );
      })}
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Bruto" value={score.gross ?? '–'} sub={<ToPar value={score.toPar} />} />
        <Stat label={`Neto (hcp ${hcpText(card.playingHcp)})`} value={score.net ?? '–'} sub={<ToPar value={score.netToPar} />} />
        <Stat label="Stableford" value={scoreRound(golfRoundOf(round, card), { format: 'stableford', basis: 'net' }).points} sub="puntos" />
      </div>
      {score.dq && competition.format === 'stroke' && (
        <p className="text-xs text-warn">Recogió en un hoyo: en stroke play la ronda no tiene total (Regla 3.3c).</p>
      )}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-xl bg-surface-2 px-2 py-2">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
      {sub != null && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

/** De dónde sale el handicap: Index → handicap de campo → handicap de juego (con el % de la competencia). */
export function HcpExplain({ round, teeId, index, className }: { round: { course: GolfCourse; nine: Nine; competition: GolfCompetition }; teeId: string; index: number | null; className?: string }) {
  if (index == null) return <p className={cx('text-xs text-muted', className)}>Sin Index: juega con handicap 0 (en neto cuenta como bruto).</p>;
  let info: ReturnType<typeof handicapFor> | null = null;
  try {
    info = handicapFor(index, round.course, teeId, { nine: round.nine, allowance: round.competition.allowance });
  } catch {
    info = null;
  }
  if (!info) return null;
  return (
    <p className={cx('text-xs text-muted', className)}>
      Index {indexText(index)} (no oficial) → handicap de campo {hcpText(info.courseHcpRounded)} → handicap de juego{' '}
      <b className="text-fg">{hcpText(info.playingHcp)}</b> ({info.allowance} %){info.holes === 9 ? ', a 9 hoyos' : ''}
      {info.estimated ? '. Rating de 9 hoyos estimado.' : '.'}
    </p>
  );
}

/** Detalle de la tarjeta de un jugador en la ronda. */
export function CardModal({
  open,
  onClose,
  name,
  round,
  card,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  round: GolfRoundFull;
  card: GolfCardDoc | null;
  footer?: ReactNode;
}) {
  const tee = card ? round.course.tees.find((t) => t.id === card.teeId) : null;
  return (
    <Modal open={open && !!card} onClose={onClose} title={name} wide footer={footer}>
      {card && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <Badge>{tee?.name ?? card.teeId}</Badge>
            <Badge>Index {indexText(card.hcpIndex)}</Badge>
            <Badge>Hcp de campo {hcpText(roundWhs(card.courseHcp))}</Badge>
            <Badge tone="accent">Hcp de juego {hcpText(card.playingHcp)}</Badge>
            {card.signed ? <Badge tone="ok">Firmada</Badge> : <Badge tone="warn">Sin firmar</Badge>}
            {card.dq && <Badge tone="danger">Descalificado</Badge>}
          </div>
          <ScoreTable round={round} card={card} competition={round.competition} />
          <p className="text-xs text-muted">{formatLabel(round.competition)} · los puntos (•) son golpes de ventaja en ese hoyo.</p>
        </div>
      )}
    </Modal>
  );
}
