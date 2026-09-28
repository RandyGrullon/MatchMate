import { Link } from 'react-router';
import { Heart, Users } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useFollowingGames } from '../../lib/data/profileGames';
import { sportMeta } from '../../sports/registry';
import type { SportId } from '../../sports/types';
import { Empty } from '../ui';
import { GameList } from './GameList';

/**
 * Juegos recientes de las cuentas que sigues, con su me gusta (para el Home). Con `sport`, solo de ese deporte;
 * sin deporte (null), de todos. Sin cuenta no sale nada.
 */
export function FollowingFeed({ sport = null, limit = 5, title = 'De quienes sigues' }: { sport?: SportId | null; limit?: number; title?: string | null }) {
  const { user } = useAuth();
  const games = useFollowingGames(sport);
  if (!user) return null;
  const meta = sportMeta(sport);
  return (
    <section className="flex flex-col gap-3" aria-label={title ?? 'Juegos de quienes sigues'}>
      {title && (
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <Heart className="size-5 text-accent" aria-hidden="true" /> {title}
          </h2>
          {meta && <span className="text-xs font-medium text-muted">Solo {meta.lower}</span>}
        </div>
      )}
      <GameList
        key={sport ?? '*'}
        games={games}
        showUser
        limit={limit}
        empty={
          <Empty icon={<Users className="size-7" aria-hidden="true" />} title={meta ? `Nada de ${meta.lower} todavía` : 'Aquí salen los juegos de quienes sigues'}>
            Entra al perfil de otros jugadores (toca su nombre en una liga) y dale a «Seguir» para ver sus juegos aquí y darles me gusta.
            <div className="mt-3 flex justify-center">
              <Link to="/ligas" className="inline-flex h-11 items-center rounded-xl px-4 text-sm font-semibold text-accent hover:bg-accent-soft">
                Ver eventos
              </Link>
            </div>
          </Empty>
        }
      />
    </section>
  );
}
