import { Link } from 'react-router';
import { useLeagueStreams } from '../../lib/data/streams';
import { PLATFORM_LABEL } from '../../lib/streams';
import { Card, cx } from '../ui';
import { LiveTag, PlatformMark, liveHref, streamLine, streamTitle } from './LiveParts';

/**
 * Arriba en el inicio de la liga (todos los deportes), solo cuando hay algo en vivo: una tarjeta chica por transmisión
 * activa con «● EN VIVO», el título (o el partido), la plataforma y «Ver», que abre la página En vivo de la liga con
 * esa transmisión. Sin transmisiones no sale nada (tampoco a quien puede transmitir: el inicio queda tranquilo).
 */
export function LiveBanner({ lid, className }: { lid: string; className?: string }) {
  const streams = useLeagueStreams(lid).data;
  if (!streams.length) return null;
  return (
    <div className={cx('flex flex-col gap-2.5', className)}>
      {streams.map((s) => {
        const title = streamTitle(s);
        return (
          <Card key={s.id} className="border-danger/40 animate-fade-up">
            <Link
              to={liveHref(lid, s.id)}
              aria-label={`En vivo: ${title}, en ${PLATFORM_LABEL[s.platform]}. Ver`}
              className="flex min-h-[72px] items-center gap-3 rounded-3xl px-4 py-3 transition active:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-danger"
            >
              <span className="min-w-0 flex-1">
                <LiveTag />
                <span className="mt-0.5 block truncate text-[16px] font-semibold tracking-[-0.01em]">{title}</span>
                <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[13px] text-muted">
                  <PlatformMark platform={s.platform} className="size-4" />
                  <span className="truncate">{streamLine(s)}</span>
                </span>
              </span>
              <span aria-hidden="true" className="inline-flex h-9 shrink-0 items-center rounded-full bg-danger px-4 text-[14px] font-bold text-on-danger">
                Ver
              </span>
            </Link>
          </Card>
        );
      })}
    </div>
  );
}
