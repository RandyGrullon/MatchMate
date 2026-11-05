import type { Venue } from '../data/business';
import { sportMeta } from '../../sports/registry';
import { venueDetailsLines } from './fields';

/**
 * Un espacio en palabras, para las tarjetas y la ficha (la web: VenueBits.tsx y VenuePage.tsx; el teléfono:
 * movil/src/components/venues/). Sin React.
 */

/** «Pádel · 6 canchas · Cristal» (el deporte y lo más importante de lo llenado). */
export function venueLine(v: Pick<Venue, 'sport' | 'details'>, max = 3): string {
  return [sportMeta(v.sport)?.label, ...venueDetailsLines(v.sport, v.details).slice(0, max)].filter(Boolean).join(' · ');
}

/** Dónde queda, en Google Maps (busca por el nombre, la dirección y la ciudad). */
export const venueMapUrl = (v: Pick<Venue, 'name' | 'address' | 'city'>): string =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([v.name, v.address, v.city].filter(Boolean).join(', '))}`;

/** El texto con que se abre WhatsApp desde la ficha. */
export const venueWhatsappText = (v: Pick<Venue, 'name'>): string => `Hola, vi ${v.name} en MatchMate.`;
