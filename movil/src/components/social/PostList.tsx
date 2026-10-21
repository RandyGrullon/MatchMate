import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Paged } from '@mm/lib/data/follows';
import type { Post } from '@mm/lib/data/posts';
import { socialErrorText } from '@mm/lib/data/posts';
import { PostCard } from './PostCard';
import { Button, ErrorNote, Txt } from '../ui';
import { LogoSpinner } from '../Logo';

/**
 * Publicaciones por páginas (feed, perfil o muro de la liga), como PostList de la web: cargando, error con
 * «Reintentar», vacía (`empty`), las tarjetas y «Ver más».
 */
export function PostList({ list, empty, hideLeague }: { list: Paged<Post>; empty?: ReactNode; hideLeague?: boolean }) {
  if (list.loading && !list.data.length) {
    return (
      <View style={{ paddingVertical: 32, alignItems: 'center' }}>
        <LogoSpinner size={36} label="Cargando publicaciones" />
      </View>
    );
  }
  if (list.error && !list.data.length) {
    return (
      <View style={{ gap: 10 }}>
        <ErrorNote>{socialErrorText(list.error, 'No se pudieron cargar las publicaciones.')}</ErrorNote>
        <Button onPress={list.refresh}>Reintentar</Button>
      </View>
    );
  }
  if (!list.data.length) return <>{empty ?? null}</>;
  return (
    <View style={{ gap: 14 }}>
      {list.data.map((p) => (
        <PostCard key={p.id} post={p} hideLeague={hideLeague} />
      ))}
      {list.moreError && (
        <Txt variant="meta" tone="danger" style={{ textAlign: 'center' }}>
          No se pudieron cargar más. Intenta de nuevo.
        </Txt>
      )}
      {list.hasMore && (
        <Button full loading={list.loadingMore} onPress={list.loadMore}>
          Ver más
        </Button>
      )}
    </View>
  );
}
