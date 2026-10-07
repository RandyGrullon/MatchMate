import { Link } from 'react-router';
import { useFollowingGames } from '../../lib/data/profileGames';
import type { SportId } from '../../sports/types';
import { GameList } from '../social/GameList';
import { SectionHeader, sectionLinkClass } from '../ui';

/** Juegos de quienes sigues que se ven en Hoy (los demás, con «Ver más»). */
const FOLLOWING_SHOWN = 3;

/**
 * «Siguiendo»: lo último de la gente que sigues (sus juegos, para darles me gusta). Solo si sigues a alguien que ya
 * jugó: vacía no sale (antes ocupaba media pantalla explicando cómo seguir; se sigue desde el perfil de cada jugador).
 * Sin cuenta no sale nada. `sport` = solo los de ese deporte (null: todos).
 */
export function FollowingSlot({ sport, className }: { sport: SportId | null; className?: string }) {
  const games = useFollowingGames(sport);
  if (!games.data.length) return null;
  return (
    <section aria-labelledby="siguiendo" className={className} data-tour="siguiendo">
      <SectionHeader
        id="siguiendo"
        title="Siguiendo"
        action={
          <Link to="/buscar" className={sectionLinkClass}>
            Buscar personas
          </Link>
        }
      />
      <GameList key={sport ?? '*'} games={games} showUser limit={FOLLOWING_SHOWN} empty={null} />
    </section>
  );
}
