import { Users } from 'lucide-react';
import type { SportId } from '../../sports/types';
import { FollowingFeed } from '../social/FollowingFeed';
import { Section } from './Section';

/**
 * «Siguiendo»: lo último de la gente que sigues (sus juegos, para darles like), en el Home general (todos los
 * deportes) y en el Home de cada deporte (solo ese). Solo con cuenta (sin cuenta el feed no dibuja nada).
 *
 * El feed (con su carga, error y vacío que explica cómo seguir a alguien) es src/components/social/FollowingFeed.tsx;
 * el título de la sección va aquí, así que el feed va sin el suyo.
 */
export function FollowingSlot({ sport }: { sport: SportId | null }) {
  return (
    <Section title="Siguiendo" icon={<Users className="size-4" aria-hidden="true" />} tour="siguiendo">
      <FollowingFeed sport={sport} title={null} />
    </Section>
  );
}
