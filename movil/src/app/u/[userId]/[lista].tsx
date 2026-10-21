import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Users } from 'lucide-react-native';
import { useFollowList, usePublicProfile, type FollowKind } from '@mm/lib/data/follows';
import { socialErrorText } from '@mm/lib/data/posts';
import { compactCount } from '@mm/components/social/socialFormat';
import { PersonRow } from '@/components/social/People';
import { BackBar, Button, Card, Divider, Empty, ErrorNote, Screen, Segmented, Txt } from '@/components/ui';
import { LogoSpinner } from '@/components/Logo';
import { useColors } from '@/theme/theme';

type Lista = 'seguidores' | 'siguiendo';
const KIND: Record<Lista, FollowKind> = { seguidores: 'followers', siguiendo: 'following' };

/** Seguidores y seguidos de una cuenta (la hoja FollowersSheet de la web, como pantalla): cada persona a su perfil. */
export default function FollowListScreen() {
  const { userId, lista: raw } = useLocalSearchParams<{ userId: string; lista: string }>();
  const lista: Lista = raw === 'siguiendo' ? 'siguiendo' : 'seguidores';
  const profile = usePublicProfile(userId);
  const p = profile.data;
  return (
    <Screen>
      <BackBar label={p?.name ?? 'Perfil'} fallback={`/u/${userId}`} />
      {p && (
        <Segmented<Lista>
          label="Qué lista"
          value={lista}
          onChange={(next) => router.setParams({ lista: next })}
          options={[
            { key: 'seguidores', label: `${compactCount(p.followers)} Seguidores` },
            { key: 'siguiendo', label: `${compactCount(p.following)} Siguiendo` },
          ]}
        />
      )}
      <FollowPeople key={lista} userId={userId} kind={KIND[lista]} />
    </Screen>
  );
}

function FollowPeople({ userId, kind }: { userId: string; kind: FollowKind }) {
  const c = useColors();
  const list = useFollowList(userId, kind);
  if (list.loading && !list.data.length) {
    return (
      <View style={{ paddingVertical: 32, alignItems: 'center' }}>
        <LogoSpinner size={36} label="Cargando" />
      </View>
    );
  }
  if (list.error && !list.data.length) {
    return (
      <View style={{ gap: 10 }}>
        <ErrorNote>{socialErrorText(list.error, 'No se pudo cargar la lista.')}</ErrorNote>
        <Button onPress={list.refresh}>Reintentar</Button>
      </View>
    );
  }
  if (!list.data.length) {
    return (
      <Empty
        icon={<Users size={28} color={c.accent} />}
        title={kind === 'followers' ? 'Todavía nadie lo sigue' : 'Todavía no sigue a nadie'}
        text={kind === 'followers' ? 'Cuando alguien lo siga, sale aquí.' : 'Cuando siga a alguien, sale aquí.'}
      />
    );
  }
  return (
    <View style={{ gap: 12 }}>
      <Card padded={false}>
        {list.data.map((person, i) => (
          <View key={person.id}>
            {i > 0 && <Divider inset={72} />}
            <PersonRow person={person} />
          </View>
        ))}
      </Card>
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
