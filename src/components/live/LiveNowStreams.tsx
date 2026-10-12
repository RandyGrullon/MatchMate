import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { useLiveNow, type LiveStream } from '../../lib/data/streams';
import { PLATFORM_LABEL } from '../../lib/streams';
import { SportIcon } from '../../pages/sports/SportBits';
import { Card, cx } from '../ui';
import { LiveDot, PlatformMark, liveHref, streamLine, streamTitle } from './LiveParts';

/** Transmisiones que se ven de una (las demás se cuentan abajo). */
export const LIVE_STREAM_ROWS = 4;

/**
 * «En vivo ahora» en Hoy: las transmisiones de tus ligas y de las ligas y equipos que sigues (live_now). Cada fila, con
 * el punto rojo y el deporte, el título (o el partido), la liga y la plataforma, abre la página En vivo de esa liga.
 * Sin transmisiones no sale.
 */
export function LiveNowStreams({ className }: { className?: string }) {
  const streams = useLiveNow().data;
  return <LiveStreamsCard streams={streams} className={className} />;
}

/** La tarjeta (sin datos propios, para probarla sola). */
export function LiveStreamsCard({ streams, className }: { streams: readonly LiveStream[]; className?: string }) {
  if (!streams.length) return null;
  const shown = streams.slice(0, LIVE_STREAM_ROWS);
  const rest = streams.length - shown.length;
  return (
    <Card className={cx('animate-fade-up overflow-hidden border-danger/40', className)}>
      <div className="flex items-center gap-2 bg-danger-soft/70 px-4 py-2 text-xs font-semibold text-danger">
        <LiveDot />
        En vivo ahora
        <span className="ml-auto font-normal text-muted">{streams.length === 1 ? '1 transmisión' : `${streams.length} transmisiones`}</span>
      </div>
      <ul className="divide-y divide-line">
        {shown.map((s) => {
          const title = streamTitle(s);
          return (
            <li key={s.id}>
              <Link
                to={liveHref(s.leagueId, s.id)}
                aria-label={`En vivo: ${title}, ${s.leagueName}, en ${PLATFORM_LABEL[s.platform]}`}
                className="flex min-h-14 items-center gap-3 px-4 py-2.5 transition hover:bg-surface-2 active:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-danger"
              >
                <span aria-hidden="true" className="relative flex size-9 shrink-0 items-center justify-center rounded-xl bg-danger-soft text-danger">
                  <SportIcon sport={s.sport} className="size-4" />
                  <LiveDot className="absolute -top-0.5 -right-0.5 ring-2 ring-surface" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{title}</span>
                  <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
                    <PlatformMark platform={s.platform} className="size-3.5" />
                    <span className="truncate">{streamLine(s, s.leagueName)}</span>
                  </span>
                </span>
                <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-faint" />
              </Link>
            </li>
          );
        })}
      </ul>
      {rest > 0 && (
        <p className="border-t border-line px-4 py-2 text-xs text-muted">
          Y {rest} {rest === 1 ? 'transmisión más' : 'transmisiones más'} en vivo.
        </p>
      )}
    </Card>
  );
}
