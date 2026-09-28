import { Link } from 'react-router';
import { Lock } from 'lucide-react';
import { relativeTime, type Notice, type NoticeGroup } from '../../lib/notifications';
import { sportMeta } from '../../sports/registry';
import { SportIcon } from '../../pages/sports/SportBits';
import { Card, Skeleton, cx } from '../ui';
import { NoticeIcon } from './NoticeIcon';

/**
 * La lista de la página de avisos, por grupos (Hoy, Esta semana, Antes). Tocar un aviso lleva a lo suyo y lo
 * marca leído (`onOpen`). `showSport`: la cuenta tiene ligas de varios deportes (con uno solo no hace falta).
 */
export function NoticeList({
  groups,
  now,
  isUnread,
  showSport,
  onOpen,
}: {
  groups: readonly NoticeGroup[];
  now: number;
  isUnread: (n: Notice) => boolean;
  showSport: boolean;
  onOpen: (n: Notice) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <section key={g.id} aria-labelledby={`avisos-${g.id}`} className="animate-fade-up">
          <h2 id={`avisos-${g.id}`} className="mb-2 px-1 text-xs font-semibold tracking-wide text-muted uppercase">
            {g.label}
          </h2>
          <Card className="overflow-hidden">
            <ul className="divide-y divide-line">
              {g.items.map((n) => (
                <li key={n.id}>
                  <NoticeRow notice={n} now={now} unread={isUnread(n)} showSport={showSport} onOpen={onOpen} />
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ))}
    </div>
  );
}

/** Un aviso: ícono, qué pasó, el detalle, cuándo, la liga (y su deporte) y el punto si está sin leer. */
export function NoticeRow({
  notice: n,
  now,
  unread,
  showSport,
  onOpen,
}: {
  notice: Notice;
  now: number;
  unread: boolean;
  showSport: boolean;
  onOpen: (n: Notice) => void;
}) {
  const sport = showSport && n.sport ? n.sport : null;
  // Sin liga (p. ej. «X te empezó a seguir») y con deporte: el nombre del deporte.
  const place = n.leagueName || (sport ? (sportMeta(sport)?.short ?? '') : '');
  return (
    <Link
      to={n.to}
      onClick={() => onOpen(n)}
      className={cx(
        'flex min-h-11 items-start gap-3 px-4 py-3.5 transition outline-none select-none',
        'hover:bg-surface-2 focus-visible:bg-surface-2 active:bg-surface-2',
        unread && 'bg-accent-soft/35',
      )}
    >
      <NoticeIcon kind={n.kind} icon={n.icon} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className={cx('min-w-0 flex-1 leading-snug break-words text-fg', unread ? 'font-semibold' : 'font-medium')}>
            {unread && <span className="sr-only">Sin leer: </span>}
            {n.title}
          </p>
          <span className="flex shrink-0 items-center gap-1.5 pt-0.5 text-xs text-muted">
            <time dateTime={new Date(n.time).toISOString()}>{relativeTime(n.time, now)}</time>
            {unread && <span className="size-2 rounded-full bg-accent" aria-hidden="true" data-unread="" />}
          </span>
        </div>
        {n.body && <p className="mt-0.5 line-clamp-2 text-sm break-words text-muted">{n.body}</p>}
        {place && (
          <span className="mt-1.5 inline-flex max-w-full items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted">
            {sport && <SportIcon sport={sport} className="size-3 shrink-0" />}
            {n.lid && n.private && <Lock className="size-3 shrink-0" aria-label="Privada" />}
            <span className="truncate">{place}</span>
          </span>
        )}
      </div>
    </Link>
  );
}

/** La forma de la lista mientras llegan los avisos. */
export function NoticeListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="Cargando avisos" role="status">
      <Skeleton className="ml-1 h-3 w-12" />
      <Card className="divide-y divide-line overflow-hidden">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-start gap-3 px-4 py-3.5">
            <Skeleton className="size-10 shrink-0 rounded-xl" />
            <div className="flex flex-1 flex-col gap-2 pt-0.5">
              <div className="flex items-center gap-3">
                <Skeleton className="h-3.5" style={{ width: `${70 - (i % 3) * 12}%` }} />
                <Skeleton className="ml-auto h-3 w-10" />
              </div>
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-4 w-24 rounded-full" />
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
