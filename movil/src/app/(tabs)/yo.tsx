import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Settings, UserRound } from 'lucide-react-native';
import { displayName, useAuth } from '@mm/lib/auth';
import { usePublicProfile } from '@mm/lib/data/follows';
import { Avatar } from '@/components/social/Avatar';
import { Button, Card, ListRow, Loading, RowIcon, Screen, Txt } from '@/components/ui';
import { YoBowling } from '@/components/solo/YoSolo';
import { useColors } from '@/theme/theme';

/**
 * Yo (ProfilePage de la web, en Lite): arriba el engranaje (la cuenta, `/cuenta`); tu foto (tocarla lleva a cambiarla en
 * `/cuenta?foto=1`), tu nombre, «@usuario · correo» y tu biografía; «Ver mi perfil» y lo tuyo del boliche. La
 * apariencia, los avisos, tus datos, Mi empresa y salir están en Configuración, como en la web.
 */
export default function YoScreen() {
  const auth = useAuth();
  const c = useColors();
  const me = usePublicProfile(auth.user?.uid);
  if (auth.loading) return <Loading />;
  if (!auth.user) {
    return (
      <Screen>
        <Txt variant="title">Yo</Txt>
        <Card style={{ gap: 12 }}>
          <Txt variant="cardTitle">Entra a MatchMate</Txt>
          <Txt tone="fg2">Con tu cuenta ves tus ligas, anotas tus juegos y recibes los avisos.</Txt>
          <Button variant="primary" size="xl" full onPress={() => router.push('/login')}>
            Entrar
          </Button>
        </Card>
      </Screen>
    );
  }
  const uid = auth.user.uid;
  const name = displayName(auth);
  const username = auth.profile?.username;
  const photo = me.data?.avatar ?? null;
  const bio = me.data?.bio?.trim();
  return (
    <Screen>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Configuración de la cuenta"
          onPress={() => router.push('/cuenta' as never)}
          style={({ pressed }) => [
            { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Settings size={21} color={c.fg2} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={photo ? 'Cambiar tu foto de perfil' : 'Ponerle una foto a tu perfil'}
          onPress={() => router.push('/cuenta?foto=1' as never)}
          style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
        >
          <Avatar name={name} photo={photo} size={60} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="cardTitle" numberOfLines={1}>
            {name}
          </Txt>
          <Txt variant="meta" tone="muted" numberOfLines={1}>
            {[username ? `@${username}` : null, auth.user.email].filter(Boolean).join(' · ')}
          </Txt>
          {!!bio && (
            <Txt variant="meta" tone="fg2" numberOfLines={2} style={{ marginTop: 4 }}>
              {bio}
            </Txt>
          )}
        </View>
      </View>

      <Card padded={false}>
        <ListRow
          icon={
            <RowIcon>
              <UserRound size={20} color={c.accent} />
            </RowIcon>
          }
          title="Ver mi perfil"
          subtitle="Como lo ven los demás"
          onPress={() => router.push({ pathname: '/u/[userId]', params: { userId: uid } })}
        />
      </Card>

      <YoBowling uid={uid} />
    </Screen>
  );
}
