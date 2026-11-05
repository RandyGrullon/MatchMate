import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { MapPin, Sparkles } from 'lucide-react';
import { isFeatured, priceText, type Venue, type VenuePhoto } from '../../lib/data/business';
import { usePublicImage, VENUE_BUCKET } from '../../lib/publicImages';
import { venueDetailsLines } from '../../lib/venues/fields';
import { sportMeta } from '../../sports/registry';
import { SportIcon } from '../../pages/sports/SportBits';
import { Badge, cx } from '../ui';

/**
 * Las piezas de los espacios deportivos (src/lib/data/business.ts): la foto (bucket público 'venues'), la tarjeta de
 * «Dónde jugar» y del panel de la empresa y la marca de destacado.
 */

/** Una foto del espacio con su hueco reservado (16:10); sin foto, el ícono del deporte en su color. */
export function VenuePhotoImg({ photo, sport, alt, className }: { photo: VenuePhoto | null | undefined; sport: string; alt: string; className?: string }) {
  const { url } = usePublicImage(VENUE_BUCKET, photo?.path ?? null);
  const color = sportMeta(sport)?.color;
  return (
    <div
      className={cx('relative grid aspect-[16/10] w-full place-items-center overflow-hidden bg-surface-2', className)}
      style={!url && color ? { backgroundColor: `color-mix(in oklab, ${color} 16%, var(--color-surface-2))`, color } : undefined}
    >
      {url ? <img src={url} alt={alt} loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" /> : <SportIcon sport={sport} className="size-10 opacity-80" />}
    </div>
  );
}

/** «Destacada» (la promoción activa). */
export function FeaturedBadge({ className }: { className?: string }) {
  return (
    <Badge tone="warn" className={cx('inline-flex items-center gap-1', className)}>
      <Sparkles className="size-3.5" aria-hidden="true" />
      Destacada
    </Badge>
  );
}

/** «Pádel · 6 canchas · Cristal» (el deporte y lo más importante de lo llenado). */
export function venueLine(v: Pick<Venue, 'sport' | 'details'>, max = 3): string {
  return [sportMeta(v.sport)?.label, ...venueDetailsLines(v.sport, v.details).slice(0, max)].filter(Boolean).join(' · ');
}

/** La tarjeta de un espacio: portada, nombre, deporte y lo llenado, ciudad, precio y si está destacada. */
export function VenueCard({ venue, to, badge }: { venue: Venue; to: string; badge?: ReactNode }) {
  const featured = isFeatured(venue);
  const price = priceText(venue.priceHour);
  return (
    <Link to={to} className="card-shadow flex flex-col overflow-hidden rounded-3xl bg-surface transition active:scale-[0.99]" aria-label={venue.name}>
      <div className="relative">
        <VenuePhotoImg photo={venue.photos[0]} sport={venue.sport} alt="" />
        <div className="absolute top-2.5 left-2.5 flex gap-1.5">
          {featured && <FeaturedBadge className="shadow-sm" />}
          {badge}
        </div>
      </div>
      <div className="flex flex-col gap-1 px-4 pt-3 pb-4">
        <p className="truncate text-body font-semibold">{venue.name}</p>
        <p className="line-clamp-1 text-meta text-muted">{venueLine(venue)}</p>
        <p className="flex items-center gap-1 text-meta text-muted">
          <MapPin className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{[venue.city, venue.business.name].join(' · ')}</span>
        </p>
        {price && <p className="text-meta font-semibold text-fg">{price}</p>}
      </div>
    </Link>
  );
}
