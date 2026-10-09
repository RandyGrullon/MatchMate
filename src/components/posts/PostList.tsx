import { useEffect, useRef, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { Paged } from '../../lib/data/follows';
import type { Post } from '../../lib/data/posts';
import { Button, Card, LoadError, Skeleton } from '../ui';
import { PostCard } from './PostCard';

/** Tarjetas de publicación vacías mientras llegan. */
export function PostCardsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3.5" aria-busy="true" aria-label="Cargando publicaciones">
      {Array.from({ length: rows }, (_, i) => (
        <Card key={i} className="flex flex-col gap-3 px-4 pt-3.5 pb-4">
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-3.5" style={{ width: `${48 - (i % 3) * 8}%` }} />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5" style={{ width: `${80 - (i % 2) * 25}%` }} />
          {i === 0 && <Skeleton className="aspect-[4/3] w-full rounded-2xl" />}
        </Card>
      ))}
    </div>
  );
}

/**
 * Publicaciones por páginas (feed, perfil o muro de la liga): cargando (formas grises), error con «Reintentar», vacía
 * (`empty`) y las tarjetas. Al llegar cerca del final pide la página siguiente sola (y queda «Ver más» por si acaso);
 * si esa falla, lo dice y se puede volver a tocar. `hideLeague`: en el muro de una liga no se repite la liga.
 */
export function PostList({ list, empty, hideLeague }: { list: Paged<Post>; empty?: ReactNode; hideLeague?: boolean }) {
  const end = useRef<HTMLDivElement>(null);
  const { hasMore, loadingMore, moreError, loadMore } = list;
  const auto = hasMore && !loadingMore && !moreError;

  // Cerca del final, la página siguiente (una sola vez por página; si falla, ya no insiste sola).
  useEffect(() => {
    const el = end.current;
    if (!auto || !el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) void loadMore();
    }, { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [auto, loadMore, list.data.length]);

  if (list.loading && !list.data.length) return <PostCardsSkeleton />;
  if (list.error && !list.data.length) return <LoadError error={list.error} onRetry={list.refresh} />;
  if (!list.data.length) return <>{empty ?? null}</>;

  return (
    <div className="flex flex-col gap-3.5">
      {list.data.map((p) => (
        <PostCard key={p.id} post={p} hideLeague={hideLeague} />
      ))}
      <div ref={end} aria-hidden="true" />
      {moreError && (
        <p className="flex items-center justify-center gap-1.5 text-sm text-danger" role="alert">
          <AlertTriangle className="size-4" aria-hidden="true" /> No se pudieron cargar más. Intenta de nuevo.
        </p>
      )}
      {hasMore && (
        <Button className="h-11 self-center" loading={loadingMore} onClick={() => void loadMore()}>
          Ver más
        </Button>
      )}
    </div>
  );
}
