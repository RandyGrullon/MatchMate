import { useContext, useState } from 'react';
import { Share2 } from 'lucide-react';
import { LeagueContext } from '../../lib/league';
import { leagueSport, sportMeta } from '../../sports/registry';
import { Button } from '../ui';
import { shareFileName } from './actions';
import type { CardFrame, ShareCard } from './cards';
import { sportColor } from './palette';
import { ShareImageModal } from './ShareImageModal';

/** «27 sep 2026» en la zona de la liga. */
export function shareDate(date: Date, tz?: string): string {
  try {
    return new Intl.DateTimeFormat('es-DO', { day: 'numeric', month: 'short', year: 'numeric', ...(tz ? { timeZone: tz } : {}) })
      .format(date)
      .replace(/\./g, '')
      .replace(/\bde\b\s*/g, '');
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/** Deporte, color y fecha de la imagen (de la liga en la que se está, o del deporte que se pase). */
export function shareFrame(sport: string | null | undefined, link: string | undefined, tz?: string, now: Date = new Date()): CardFrame {
  const meta = sportMeta(sport);
  return { sportLabel: meta?.short ?? 'MatchMate', color: sportColor(sport), date: shareDate(now, tz), link };
}

interface Open {
  card: ShareCard;
  frame: CardFrame;
  url?: string;
  filename: string;
}

/**
 * Botón «Compartir» de las tablas y resultados: hace una imagen para WhatsApp con la marca de MatchMate y el
 * color del deporte, y la comparte con el link (o la descarga). `card` se arma al tocar (no en cada render);
 * null = nada que compartir.
 */
export function ShareButton({
  card,
  url,
  path,
  sport,
  label = 'Compartir',
  iconOnly,
  size = 'sm',
  variant = 'secondary',
  className,
  disabled,
}: {
  card: () => ShareCard | null;
  /** Link que va con la imagen. Por defecto, la página que se está viendo. */
  url?: string;
  /** O la ruta dentro de la app («/l/x/e/y?ver=puntos»): el dominio se le pone al tocar. */
  path?: string;
  /** Deporte (color y nombre). Por defecto, el de la liga. */
  sport?: string;
  label?: string;
  iconOnly?: boolean;
  size?: 'sm' | 'md';
  variant?: 'primary' | 'secondary' | 'ghost';
  className?: string;
  disabled?: boolean;
}) {
  const ctx = useContext(LeagueContext);
  const [open, setOpen] = useState<Open | null>(null);

  const start = () => {
    const c = card();
    if (!c) return;
    const here = typeof location !== 'undefined' ? location : undefined;
    const link = url ?? (path && here ? `${here.origin}${path}` : here?.href);
    const kind = c.kind === 'result' ? 'resultado' : c.kind === 'badge' ? 'insignia' : 'tabla';
    setOpen({
      card: c,
      frame: shareFrame(sport ?? (ctx ? leagueSport(ctx.league) : null), link, ctx?.league.tz),
      url: link,
      filename: shareFileName([kind, c.title, c.subtitle]),
    });
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        disabled={disabled}
        onClick={start}
        icon={<Share2 className={size === 'md' && iconOnly ? 'size-5' : 'size-4'} />}
        aria-label={iconOnly ? label : undefined}
        title={iconOnly ? label : undefined}
      >
        {iconOnly ? null : label}
      </Button>
      {open && <ShareImageModal open onClose={() => setOpen(null)} card={open.card} frame={open.frame} url={open.url} filename={open.filename} />}
    </>
  );
}
