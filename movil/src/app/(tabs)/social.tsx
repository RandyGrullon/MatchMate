import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Compass, Newspaper, Search, Trophy, Users } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { useFollowingGames } from '@mm/lib/data/profileGames';
import { socialErrorText, useSocialFeed } from '@mm/lib/data/posts';
import { ComposerCard } from '@/components/social/Composer';
import { GameRow } from '@/components/social/People';
import { PostList } from '@/components/social/PostList';
import { Button, Card, Divider, Empty, ErrorNote, Loading, Screen, Segmented, Txt } from '@/components/ui';
import { LogoSpinner } from '@/components/Logo';
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

function FollowingGames() {
  const c = useColors();
  const games = useFollowingGames(null);
  if (games.loading && !games.data.length) {
    return (
      <View style={{ paddingVertical: 32, alignItems: 'center' }}>
        <LogoSpinner size={36} label="Cargando juegos" />
      </View>
    );
  }
  if (games.error && !games.data.length) {
    return (
      <View style={{ gap: 10 }}>
        <ErrorNote>{socialErrorText(games.error, 'No se pudieron cargar los juegos.')}</ErrorNote>
        <Button onPress={games.refresh}>Reintentar</Button>
      </View>
    );
  }
  if (!games.data.length) {
    return (
      <Empty
        icon={<Trophy size={28} color={c.accent} />}
        title="Todavía no hay juegos"
        text="Cuando alguien que sigues juegue, sus juegos salen aquí para darles me gusta."
        action={
          <Button variant="soft" icon={<Search size={18} color={c.accent} />} onPress={() => router.push('/buscar')}>
            Buscar personas
          </Button>
        }
      />
    );
  }
  return (
    <View style={{ gap: 12 }}>
      <Card padded={false}>
        {games.data.map((g, i) => (
          <View key={g.key}>
            {i > 0 && <Divider inset={68} />}
            <GameRow game={g} showUser />
          </View>
        ))}
      </Card>
      {games.hasMore && (
        <Button full loading={games.loadingMore} onPress={games.loadMore}>
          Ver más
        </Button>
      )}
    </View>
  );
}
