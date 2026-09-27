import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Clock, Trophy } from 'lucide-react';
import type { Match, MatchSide } from '../../lib/data/matches';
import type { Side } from '../../sports/types';
import { Badge, Card, cx } from '../ui';
import { autoConfirmText, roundLabel, scoreColumns, sideName, statusInfo, whenText } from './format';

/**
 * Tarjeta de un partido: los dos lados, el marcador por set o total, el estado («En vivo», «Por confirmar»,
 * «W.O.»…), la ronda, la cancha y la hora. El lado ganador va en negrita con copa; el mío, marcado.
 */
export function MatchCard({
  match: m,
  to,
  onClick,
  mySide,
  roundWord = 'Ronda',
  tz,
  now = Date.now(),
  renderSide,
  footer,
  className,
}: {
  match: Match;
  /** Link al partido (o `onClick`). */
  to?: string;
  onClick?: () => void;
  /** Mi lado: se resalta. */
  mySide?: Side | null;
  /** «Jornada» / «Ronda». */
  roundWord?: string;
  /** Zona de la liga (por defecto Santo Domingo). */
  tz?: string;
  now?: number;
  /** Nombre del lado a medida (p. ej. con los nombres de los jugadores). */
  renderSide?: (side: MatchSide) => ReactNode;
  /** Algo más abajo (botones, avisos). */
  footer?: ReactNode;
  className?: string;
}) {
  const status = statusInfo(m, now);
  const cols = scoreColumns(m.score);
  const when = whenText(m.scheduledAt, tz, true);
  const meta = [m.stage || roundLabel(m.round, roundWord), m.court].filter(Boolean);
  const pendingText = autoConfirmText(m, now);
  const walkover = m.status === 'walkover';

  const body = (
    <>
      <div className="flex items-center gap-2 px-4 pt-3 text-xs text-muted">
        <span className="min-w-0 flex-1 truncate">
          {meta.join(' · ')}
          {when && (
            <span className="whitespace-nowrap">
              {meta.length ? ' · ' : ''}
              <Clock className="mr-0.5 inline size-3 align-[-2px]" />
              {when}
            </span>
          )}
        </span>
        {m.pending && <Badge tone="neutral">Por enviar</Badge>}
        <Badge tone={status.tone}>
          {status.live && <span className="live-dot" />}
          {status.label}
        </Badge>
      </div>
      <div className="flex flex-col gap-1 px-4 py-2.5">
        {m.sides.map((s, i) => {
          const won = m.winner === s.side;
          const absent = walkover && (m.walkoverSide === s.side || m.walkoverSide === 0);
          return (
            <div key={s.side} className={cx('flex items-center gap-2 rounded-lg', mySide === s.side && '-mx-2 bg-accent-soft/60 px-2')}>
              <span className={cx('min-w-0 flex-1 truncate', won ? 'font-semibold' : m.winner ? 'text-muted' : '')}>
                {renderSide ? renderSide(s) : sideName(s)}
                {absent && <span className="ml-1 text-xs text-muted">(no vino)</span>}
              </span>
              {won && <Trophy className="size-4 shrink-0 text-gold" aria-label="Ganó" />}
              <span className="flex shrink-0 gap-2 tabular-nums">
                {cols.map((c, j) => {
                  const v = i === 0 ? c.a : c.b;
                  const other = i === 0 ? c.b : c.a;
                  return (
                    <span key={j} className={cx('w-6 text-right text-base', v > other ? 'font-bold' : 'text-muted')}>
                      {v}
                      {c.tb && v < other && <sup className="text-[10px]">{c.tb}</sup>}
                    </span>
                  );
                })}
              </span>
            </div>
          );
        })}
      </div>
      {(pendingText || m.note || (m.status === 'disputed' && m.disputeNote)) && (
        <div className="flex flex-col gap-0.5 border-t border-line px-4 py-2 text-xs text-muted">
          {pendingText && <span className="text-warn">{pendingText}</span>}
          {m.status === 'disputed' && m.disputeNote && <span className="text-danger">Reclamo: {m.disputeNote}</span>}
          {m.note && m.status !== 'live' && <span>{m.note}</span>}
        </div>
      )}
    </>
  );

  const interactive = to || onClick;
  return (
    <Card className={cx('overflow-hidden', interactive && 'transition hover:border-accent/50', status.live && 'border-ok/50', className)}>
      {to ? (
        <Link to={to} className="block">
          {body}
        </Link>
      ) : onClick ? (
        <button type="button" onClick={onClick} className="block w-full text-left">
          {body}
        </button>
      ) : (
        body
      )}
      {footer && <div className="border-t border-line px-4 py-2.5">{footer}</div>}
    </Card>
  );
}
