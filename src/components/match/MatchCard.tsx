import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Trophy } from 'lucide-react';
import type { Match, MatchSide } from '../../lib/data/matches';
import type { Side } from '../../sports/types';
import { Card, cx } from '../ui';
import { autoConfirmText, roundLabel, scoreColumns, sideName, statusInfo, whenText, type Tone } from './format';

/**
 * Cómo se ve el estado del partido (rediseño «Calma y foco»: un solo color): «● En vivo» en el del deporte, «● Por
 * confirmar» en ámbar (lo único que espera por alguien), «En disputa» en rojo y lo demás («Final», «Programado»,
 * «Aplazado») en gris, sin fondo.
 */
export function MatchStatus({ label, tone, live, className }: { label: string; tone: Tone; live?: boolean; className?: string }) {
  const dot = live || tone === 'warn';
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center gap-1.5 text-[13px] font-semibold whitespace-nowrap',
        live ? 'text-accent' : tone === 'warn' ? 'text-warn' : tone === 'danger' ? 'text-danger' : 'text-muted',
        className,
      )}
    >
      {dot && <span aria-hidden="true" className={cx('size-2 shrink-0 rounded-full', live ? 'bg-accent shadow-[0_0_0_3px_var(--accent-soft)]' : 'bg-warn')} />}
      {label}
    </span>
  );
}

/**
 * Tarjeta de un partido: arriba la ronda, la cancha y la hora con el estado («● En vivo», «● Por confirmar», «Final»);
 * debajo los dos lados con el marcador por set (o el total) en números grandes. El ganador va en negrita con copa; el
 * lado propio, en acento suave. Toda la tarjeta se toca (`to` u `onClick`); `footer` va abajo (botones, avisos).
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
  const meta = [m.stage || roundLabel(m.round, roundWord), m.court, when].filter(Boolean);
  const pendingText = autoConfirmText(m, now);
  const walkover = m.status === 'walkover';
  const notes = pendingText || (m.note && m.status !== 'live') || (m.status === 'disputed' && m.disputeNote);

  const body = (
    <>
      <div className="flex items-center gap-2 px-[18px] pt-3.5">
        <span className="min-w-0 flex-1 truncate text-[13px] text-muted">{meta.join(' · ')}</span>
        {m.pending && <MatchStatus label="Por enviar" tone="neutral" />}
        {/* «Programado» es lo de siempre: no se dice (sí en vivo, por confirmar, final, aplazado…). */}
        {m.status === 'scheduled' ? <span className="sr-only">{status.label}</span> : <MatchStatus label={status.label} tone={status.tone} live={status.live} />}
      </div>
      <div className={cx('flex flex-col gap-0.5 px-[18px] pt-2', notes ? 'pb-1' : 'pb-3.5')}>
        {m.sides.map((s, i) => {
          const won = m.winner === s.side;
          const absent = walkover && (m.walkoverSide === s.side || m.walkoverSide === 0);
          const mine = mySide === s.side;
          return (
            <div key={s.side} className={cx('-mx-2.5 flex min-h-9 items-center gap-2 rounded-xl px-2.5', mine && 'bg-accent-soft')}>
              <span className={cx('min-w-0 flex-1 truncate text-[15.5px]', won ? 'font-bold' : m.winner ? 'font-medium text-muted' : 'font-semibold')}>
                {renderSide ? renderSide(s) : sideName(s)}
                {absent && <span className="ml-1 text-[13px] font-normal text-muted">(no vino)</span>}
              </span>
              {won && <Trophy className="size-4 shrink-0 text-gold" aria-label="Ganó" />}
              <span className="flex shrink-0 gap-2.5">
                {cols.map((c, j) => {
                  const v = i === 0 ? c.a : c.b;
                  const other = i === 0 ? c.b : c.a;
                  return (
                    <span key={j} className={cx('num w-6 text-right text-[19px] leading-none', v > other ? 'font-bold text-fg' : 'font-medium text-muted')}>
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
      {notes && (
        <div className="flex flex-col gap-0.5 px-[18px] pt-1 pb-3.5 text-[13px] text-muted">
          {pendingText && <span>{pendingText}</span>}
          {m.status === 'disputed' && m.disputeNote && <span className="text-danger">Reclamo: {m.disputeNote}</span>}
          {m.note && m.status !== 'live' && <span>{m.note}</span>}
        </div>
      )}
    </>
  );

  const pressable = 'block w-full rounded-3xl text-left transition active:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent';
  return (
    <Card className={cx('min-w-0 overflow-hidden', className)}>
      {to ? (
        <Link to={to} className={pressable}>
          {body}
        </Link>
      ) : onClick ? (
        <button type="button" onClick={onClick} className={pressable}>
          {body}
        </button>
      ) : (
        body
      )}
      {footer && <div className="px-[18px] pb-4">{footer}</div>}
    </Card>
  );
}
