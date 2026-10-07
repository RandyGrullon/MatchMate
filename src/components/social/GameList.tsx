import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { gameMarks } from '../../lib/bowlingSeason';
import { useBowlingGameContext } from '../../lib/data/bowlingContext';
import type { Paged } from '../../lib/data/follows';
import type { ProfileGame } from '../../lib/data/profileGames';
import { toIsoDate } from '../../lib/format';
import { useNow } from '../../lib/useNow';
import { Button, Card, LoadError, Skeleton } from '../ui';
import { GameCard } from './GameCard';

/** Tarjetas de juego vacías mientras llegan. */
export function GameCardsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Cargando juegos">
      {Array.from({ length: rows }, (_, i) => (
        <Card key={i} className="flex flex-col gap-3 px-4 py-3.5">
          <div className="flex items-center gap-3">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-3.5" style={{ width: `${60 - (i % 3) * 12}%` }} />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-8 w-24" />
        </Card>
      ))}
    </div>
  );
}

/**
 * Lista de juegos por páginas (perfil o inicio): cargando, error (con reintentar), vacía (`empty`) y «Ver más».
 * `limit`: cuántos se ven como máximo antes de «Ver más» (el inicio muestra pocos).
 */
export function GameList({
  games,
  showUser,
  empty,
  limit,
  hideSport,
}: {
  games: Paged<ProfileGame>;
  showUser?: boolean;
  empty: ReactNode;
  limit?: number;
  /** Sin el chip del deporte en cada tarjeta (quien juega uno solo, en Yo). */
  hideSport?: boolean;
}) {
  const now = useNow();
  const today = toIsoDate(now);
  const [max, setMax] = useState(limit ?? Number.POSITIVE_INFINITY);
  const { user } = useAuth();
  // Boliche: lo jugado antes de cada juego que se ve, para marcar «Récord personal» y «+15 sobre tu promedio».
  const bowlingIds = useMemo(
    () =>
      games.data
        .slice(0, max)
        .filter((g) => g.kind === 'bowling')
        .map((g) => g.id)
        .slice(0, 100),
    [games.data, max],
  );
  const context = useBowlingGameContext(bowlingIds);
  if (games.loading && !games.data.length) return <GameCardsSkeleton />;
  if (games.error && !games.data.length) return <LoadError error={games.error} onRetry={games.refresh} />;
  if (!games.data.length) return <>{empty}</>;
  const shown = games.data.slice(0, max);
  const canMore = games.data.length > shown.length || games.hasMore;

  async function more() {
    const step = limit ?? 0;
    // Primero los que ya llegaron; si no quedan, la página siguiente.
    if (games.data.length < max + step || !step) await games.loadMore();
    if (step) setMax((m) => m + step);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="stagger flex flex-col gap-3">
        {shown.map((g, i) => (
          <GameCard
            key={g.key}
            game={g}
            showUser={showUser}
            hideSport={hideSport}
            i={i}
            today={today}
            marks={
              g.kind === 'bowling' && context.data[g.id]
                ? gameMarks(g.detail.scores, g.detail.verified, context.data[g.id], { frozen: context.data[g.id].average })
                : null
            }
            mine={!!user && g.userId === user.uid}
          />
        ))}
      </div>
      {games.moreError && (
        <p className="flex items-center justify-center gap-1.5 text-sm text-danger" role="alert">
          <AlertTriangle className="size-4" aria-hidden="true" /> No se pudieron cargar más. Intenta de nuevo.
        </p>
      )}
      {canMore && (
        <Button className="h-11 self-center" loading={games.loadingMore} onClick={() => void more()}>
          Ver más
        </Button>
      )}
    </div>
  );
}
