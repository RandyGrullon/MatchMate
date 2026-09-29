import { useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router';
import { CalendarClock, ChevronRight, Globe, Lock, MapPin, Repeat, Trophy } from 'lucide-react';
import type { CalendarItem } from '../../lib/calendar';
import { roleLabel } from '../../lib/league';
import { useLogo } from '../../lib/logos';
import type { League, Member } from '../../lib/types';
import { leagueSport, sportMeta } from '../../sports/registry';
import { SportBadge, SportIcon } from '../../pages/sports/SportBits';
import { Badge, Card, cx } from '../ui';
import { whenLabel } from './logic';
import { SportTint } from './SportTint';

/** Dónde y cuándo juegan: «Club Naco · Martes · 7:00 pm». */
export function LeagueMeta({ league, className }: { league: Pick<League, 'venue' | 'schedule'>; className?: string }) {
  const bits = [league.venue, league.schedule].filter(Boolean);
  if (!bits.length) return null;
  return (
    <span className={cx('flex min-w-0 items-center gap-1 text-xs text-muted', className)}>
      <MapPin className="size-3 shrink-0" />
      <span className="truncate">{bits.join(' · ')}</span>
    </span>
  );
}

/**
 * El logo de la liga (imagen pública, src/lib/logos.ts) con el tamaño y las esquinas de `className`; mientras llega
 * su URL, un cuadro vacío de ese mismo tamaño (la pantalla no salta cuando aparece); sin logo o si no carga,
 * `children` (el ícono de siempre).
 */
export function LeagueLogo({ path, className, children }: { path?: string | null; className: string; children?: ReactNode }) {
  const { url, pending } = useLogo(path);
  const [broken, setBroken] = useState<string | null>(null);
  if (pending) return <span aria-hidden="true" className={cx('block shrink-0 border border-line bg-surface-2', className)} />;
  if (!url || broken === url) return <>{children}</>;
  return (
    <img
      src={url}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setBroken(url)}
      className={cx('shrink-0 border border-line bg-surface-2 object-cover', className)}
    />
  );
}

const ICON_BOX = {
  sm: 'size-7 rounded-lg',
  md: 'size-10 rounded-xl',
  lg: 'size-12 rounded-2xl',
  xl: 'size-16 rounded-2xl',
} as const;
const ICON_GLYPH = { sm: 'size-4', md: 'size-5', lg: 'size-5', xl: 'size-8' } as const;

/**
 * El cuadrito de la liga: su logo si tiene; si no, en el color de su deporte, el trofeo si es torneo o el ícono
 * del deporte.
 */
export function LeagueIcon({
  league,
  size = 'md',
}: {
  league: Pick<League, 'id' | 'sport' | 'kind' | 'logoPath'>;
  size?: keyof typeof ICON_BOX;
}) {
  const sport = leagueSport(league);
  return (
    <LeagueLogo path={league.logoPath} className={ICON_BOX[size]}>
      <SportTint sport={sport} className="shrink-0">
        <span className={cx('flex items-center justify-center bg-accent-soft text-accent', ICON_BOX[size])} aria-hidden="true">
          {league.kind === 'torneo' ? <Trophy className={ICON_GLYPH[size]} /> : <SportIcon sport={sport} className={ICON_GLYPH[size]} />}
        </span>
      </SportTint>
    </LeagueLogo>
  );
}

/** «Próximo: Hoy · 7:00 pm · Práctica», o dónde juegan si no hay nada en el calendario. */
function NextLine({ next, today, league }: { next?: CalendarItem | null; today: string; league: League }) {
  if (!next) return <LeagueMeta league={league} />;
  const what = next.kind === 'match' ? next.name : league.kind === 'torneo' && next.type === 'torneo' ? '' : next.name;
  return (
    <span className="flex min-w-0 items-center gap-1 text-xs font-medium text-accent">
      {next.eventId || next.kind === 'match' ? <CalendarClock className="size-3.5 shrink-0" /> : <Repeat className="size-3.5 shrink-0" />}
      <span className="truncate">{[whenLabel(next, today), what].filter(Boolean).join(' · ')}</span>
    </span>
  );
}

/**
 * Una liga o torneo en una lista (Home, Home del deporte y Eventos): su cuadrito del color del deporte, el nombre,
 * si es privada o pública, mi papel, el deporte (si hay de varios) y lo próximo que tiene. Toda la fila abre la liga;
 * `action` (p. ej. «Unirme») va a la derecha, fuera del link.
 */
export function LeagueRow({
  league,
  role,
  next,
  today,
  showSport,
  action,
  index = 0,
}: {
  league: League;
  role?: Member['role'];
  next?: CalendarItem | null;
  today: string;
  showSport?: boolean;
  action?: ReactNode;
  index?: number;
}) {
  const torneo = league.kind === 'torneo';
  const isPrivate = league.visibility === 'private';
  const sport = leagueSport(league);
  return (
    <div style={{ '--i': index } as CSSProperties} className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface-2">
      <Link
        to={`/l/${league.id}`}
        className="flex min-w-0 flex-1 items-center gap-3"
        aria-label={`${league.name}${showSport ? `, ${sportMeta(sport)?.label ?? 'otro deporte'}` : ''}`}
      >
        <LeagueIcon league={league} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-semibold">{league.name}</span>
          <span className="flex flex-wrap items-center gap-1">
            {torneo ? (
              <Badge tone="warn">
                <Trophy className="size-3" /> Torneo
              </Badge>
            ) : (
              <Badge tone="neutral">
                {isPrivate ? <Lock className="size-3" /> : <Globe className="size-3" />}
                {isPrivate ? 'Privada' : 'Pública'}
              </Badge>
            )}
            {role && role !== 'member' && <Badge tone="accent">{roleLabel(role)}</Badge>}
            {showSport && <SportBadge sport={sport} />}
          </span>
          <NextLine next={next} today={today} league={league} />
        </span>
      </Link>
      {action ?? <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden="true" />}
    </div>
  );
}

/** Varias ligas en una tarjeta, una debajo de la otra. */
export function LeagueList({ children }: { children: ReactNode }) {
  return <Card className="stagger divide-y divide-line overflow-hidden">{children}</Card>;
}
