import { Redirect } from 'expo-router';
import type { Post } from '@mm/lib/data/posts';
import { QrCode } from '@/components/invite/QrCode';
import { PostCard } from '@/components/social/PostCard';
import { Screen, SectionHeader } from '@/components/ui';

const POST: Post = {
  id: '00000000-0000-7000-8000-000000000001',
  author: { id: '00000000-0000-7000-8000-000000000002', name: 'Ana Pérez', username: 'anaperez', avatar: null },
  text: 'Hoy hicimos 3 strikes seguidos en la práctica 🎳\nMiren el resumen: https://matchmate.grullonb.com/l/abc y el reglamento en https://example.com/reglas.',
  photo: null,
  league: { id: '00000000-0000-7000-8000-000000000003', name: 'Liga de los martes', sport: 'bowling' },
  sport: 'bowling',
  visibility: 'followers',
  at: new Date(Date.now() - 2 * 3600_000).toISOString(),
  likes: 12,
  likedByMe: true,
  comments: 3,
  isMine: false,
  canDelete: false,
};

/**
 * Solo en desarrollo: una publicación y el QR de una invitación sin cuenta (para probarlos en la vista previa web). En
 * la app publicada (__DEV__ falso) lleva a Hoy.
 */
export default function DevSocial() {
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <Screen>
      <SectionHeader title="Publicación" />
      <PostCard post={POST} />
      <SectionHeader title="QR de invitación" />
      <QrCode value="https://matchmate.grullonb.com/unirse/ZZZZ2345" />
    </Screen>
  );
}
