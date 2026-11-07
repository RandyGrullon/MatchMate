import { Redirect, useLocalSearchParams } from 'expo-router';
import { displayName, useAuth } from '@mm/lib/auth';
import { badgeTags } from '@mm/lib/data/badges';
import { invalidate } from '@mm/lib/data/client';
import { peopleTags, usePublicProfile } from '@mm/lib/data/follows';
import { postTags } from '@mm/lib/data/posts';
import { soloTags } from '@mm/lib/data/solo';
import { knownSports } from '@mm/components/social/socialFormat';
import { YO_PARTS, yoPart, type YoPart } from '@mm/pages/yoParts';
import { BackBar, Loading, Screen, Txt } from '@/components/ui';
import { MyBadges, MyGames, MyPosts } from '@/components/yo/YoParts';
import { YoSignedOut } from '@/components/yo/YoSignedOut';

/**
 * Una parte de Yo (`/perfil?tab=…` de la web): «‹ Yo», su título y lo de adentro: Mis juegos (`/yo/juegos`), Mis
 * publicaciones (`/yo/publicaciones`) o Insignias (`/yo/insignias`, `?insignia=<id>` abre una y `&quieta=1` sin repetir
 * la animación). «‹ Yo» vuelve atrás si viniste de Yo; si entraste directo (un aviso, un link), abre Yo. «Por liga y
 * temporada» es de Pro (la app es Lite): esa y una parte que no existe llevan a Yo.
 */
export default function YoPartScreen() {
  const params = useLocalSearchParams<{ parte: string; insignia?: string; quieta?: string }>();
  const auth = useAuth();
  const part = yoPart(params.parte);
  if (auth.loading) return <Loading />;
  if (!part || part === 'estadisticas') return <Redirect href="/yo" />;
  if (!auth.user) {
    return (
      <Screen>
        <BackBar label="Yo" fallback="/yo" />
        <YoSignedOut next={`/yo/${part}`} />
      </Screen>
    );
  }
  return <Part key={part} uid={auth.user.uid} part={part} insignia={params.insignia ?? null} still={params.quieta === '1'} />;
}

function Part({ uid, part, insignia, still }: { uid: string; part: YoPart; insignia: string | null; still: boolean }) {
  const auth = useAuth();
  const profile = usePublicProfile(uid);
  const p = profile.data;
  const name = p?.name || displayName(auth);
  const sports = knownSports(p?.sports);
  const refresh = () =>
    part === 'publicaciones'
      ? invalidate(postTags.user(uid), peopleTags.user(uid))
      : part === 'insignias'
        ? invalidate(badgeTags.user(uid), badgeTags.mine)
        : invalidate(peopleTags.user(uid), soloTags.user(uid));
  return (
    <Screen onRefresh={refresh}>
      <BackBar label="Yo" fallback="/yo" />
      <Txt variant="title" accessibilityRole="header">
        {YO_PARTS[part]}
      </Txt>
      {part === 'juegos' ? (
        <MyGames uid={uid} sports={sports} />
      ) : part === 'publicaciones' ? (
        <MyPosts uid={uid} />
      ) : (
        <MyBadges uid={uid} name={name} sports={sports} insignia={insignia} still={still} />
      )}
    </Screen>
  );
}
