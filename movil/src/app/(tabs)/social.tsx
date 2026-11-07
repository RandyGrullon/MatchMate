import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Compass, Newspaper, Search, Users } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { useSocialFeed } from '@mm/lib/data/posts';
import { ComposerCard } from '@/components/social/Composer';
import { FollowingGames } from '@/components/social/GameCard';
import { PostList } from '@/components/social/PostList';
import { Button, Card, Empty, Loading, Screen, Segmented, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';

type SocialTab = 'siguiendo' | 'descubrir' | 'juegos';

const TABS: { key: SocialTab; label: string }[] = [
  { key: 'siguiendo', label: 'Siguiendo' },
  { key: 'descubrir', label: 'Descubrir' },
  { key: 'juegos', label: 'Juegos' },
];

/**
 * Social (como /social de la web): el título con la lupa, «¿Qué jugaste hoy?» para publicar y «Siguiendo · Descubrir
 * · Juegos»: lo de quien sigues y tus ligas; lo público de todos; y los juegos de quien sigues. Sin cuenta: entrar.
 */
export default function SocialScreen() {
  const c = useColors();
  const auth = useAuth();
  const [tab, setTab] = useState<SocialTab>('siguiendo');
  if (auth.loading) return <Loading />;
  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Txt variant="title">Social</Txt>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Buscar personas y ligas"
          hitSlop={6}
          onPress={() => router.push('/buscar')}
          style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface }}
        >
          <Search size={22} color={c.fg} />
        </Pressable>
      </View>
      {auth.user ? (
        <>
          <ComposerCard onPosted={() => tab === 'juegos' && setTab('siguiendo')} />
          <Segmented<SocialTab> label="Qué ver" value={tab} onChange={setTab} options={TABS} />
          {tab === 'siguiendo' ? <FollowingPosts onDiscover={() => setTab('descubrir')} /> : tab === 'descubrir' ? <DiscoverPosts /> : <FollowingGames />}
        </>
      ) : (
        <Card style={{ gap: 12 }}>
          <Users size={28} color={c.accent} />
          <Txt variant="cardTitle">Entra para ver Social</Txt>
          <Txt tone="fg2">Lo que publican tus amigos y tus ligas, sus juegos y lo que cuentas tú.</Txt>
          <Button variant="primary" size="xl" full onPress={() => router.push('/login')}>
            Entrar
          </Button>
        </Card>
      )}
    </Screen>
  );
}

function FollowingPosts({ onDiscover }: { onDiscover: () => void }) {
  const c = useColors();
  const list = useSocialFeed('following');
  return (
    <PostList
      list={list}
      empty={
        <Empty
          icon={<Users size={28} color={c.accent} />}
          title="Aquí sale lo de tu gente"
          text="Sigue a personas y ligas para ver lo que publican. O cuenta tú qué jugaste hoy."
          action={
            <View style={{ gap: 10, alignSelf: 'stretch' }}>
              <Button variant="soft" full icon={<Search size={18} color={c.accent} />} onPress={() => router.push('/buscar')}>
                Buscar personas
              </Button>
              <Button full icon={<Compass size={18} color={c.fg} />} onPress={onDiscover}>
                Ver Descubrir
              </Button>
            </View>
          }
        />
      }
    />
  );
}

function DiscoverPosts() {
  const c = useColors();
  const list = useSocialFeed('discover');
  return <PostList list={list} empty={<Empty icon={<Newspaper size={28} color={c.accent} />} title="Todavía no hay publicaciones" text="Sé el primero en contar qué jugaste." />} />;
}

