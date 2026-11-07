import { View } from 'react-native';
import { displayName, useAuth } from '@mm/lib/auth';
import { useLeaguesByIds, useMyMemberships } from '@mm/lib/data';
import { badgeTags } from '@mm/lib/data/badges';
import { ballTags } from '@mm/lib/data/balls';
import { invalidate } from '@mm/lib/data/client';
import { peopleTags, usePublicProfile } from '@mm/lib/data/follows';
import { tags } from '@mm/lib/data/keys';
import { soloTags, useMySoloSessions } from '@mm/lib/data/solo';
import { squadTags } from '@mm/lib/data/squads';
import { splitBySport, useBowlingNumbers, type BowlingNumbersState } from '@mm/components/bowlingNumbers';
import { knownSports } from '@mm/components/social/socialFormat';
import { identityLine, mainLeagueId, showsBowling } from '@mm/pages/yoParts';
import { MyBallsSection } from '@/components/balls/MyBalls';
import { Loading, Screen } from '@/components/ui';
import { BadgesPreview } from '@/components/yo/BadgesPreview';
import { LiteNumbers } from '@/components/yo/LiteNumbers';
import { PlayerPlaces } from '@/components/yo/PlayerPlaces';
import { StatsTab } from '@/components/yo/SportStats';
import { Identity, YoTop } from '@/components/yo/YoHeader';
import { YoRows } from '@/components/yo/YoRows';
import { YoProBody } from '@/components/yo/YoPro';
import { useIsPro } from '@mm/lib/useMode';
import { toIsoDate } from '@mm/lib/format';
import { useNow } from '@mm/lib/useNow';
import { YoSignedOut } from '@/components/yo/YoSignedOut';

/**
 * Yo (ProfilePage de la web, `/perfil`): arriba «Lite | Pro», la lupa y el engranaje (la cuenta, `/cuenta`); tu foto (tocarla
 * lleva a cambiarla en `/cuenta?foto=1`), tu nombre, «@usuario · tu liga» y tu biografía; tu promedio (o cómo empezar),
 * Mis bolas, Insignias, Dónde juego y las filas Mis juegos, Anotar un juego suelto, Mis publicaciones, Mis equipos y
 * Amigos y seguidores. Los números del boliche (y Mis bolas y el juego suelto) salen si juegas boliche, tienes juegos
 * sueltos o todavía no tienes ligas de otro deporte. En Pro, lo de Pro (YoProBody). Las partes se abren en
 * `/yo/<parte>` con «‹ Yo». La apariencia, los avisos, tus datos, Mi empresa y salir están en Configuración, como en la web.
 */
export default function YoScreen() {
  const auth = useAuth();
  if (auth.loading) return <Loading />;
  if (!auth.user) {
    return (
      <Screen>
        <YoSignedOut next="/yo" />
      </Screen>
    );
  }
  return <Yo uid={auth.user.uid} />;
}

const LOADING: BowlingNumbersState = { status: 'loading' };

function Yo({ uid }: { uid: string }) {
  const auth = useAuth();
  const profile = usePublicProfile(uid);
  const memberships = useMyMemberships(uid);
  const leagues = useLeaguesByIds(memberships.data.map((m) => m.leagueId));
  const { bowling, others } = splitBySport(memberships.data, leagues.data);
  const solo = useMySoloSessions();
  const numbers = useBowlingNumbers(bowling, leagues.data, solo.data, solo.loading);

  const pro = useIsPro();
  const today = toIsoDate(useNow());

  const p = profile.data;
  const name = p?.name || displayName(auth);
  const sports = knownSports(p?.sports);
  const showBowling = showsBowling(bowling.length, others.length, solo.data.length);
  const state = memberships.loading || leagues.loading ? LOADING : numbers;
  const line = identityLine(p?.username ?? auth.profile?.username, leagues.data, mainLeagueId(state));

  const refresh = () =>
    invalidate(
      peopleTags.user(uid),
      tags.leagues,
      tags.members,
      ...memberships.data.flatMap((m) => [tags.entries(m.leagueId), tags.events(m.leagueId)]),
      soloTags.user(uid),
      ballTags.all,
      badgeTags.user(uid),
      badgeTags.mine,
      squadTags.mine,
    );

  return (
    <Screen onRefresh={refresh} contentStyle={{ gap: 22 }}>
      <YoTop />
      <Identity name={name} line={line} bio={p?.bio} photo={p?.avatar} pro={pro} />
      {pro ? (
        // En Pro (como la web): los 6 números, Tendencia, Tus tiros, Por bola, Dónde juego y las filas.
        <YoProBody uid={uid} profile={p} sports={sports} state={state} showBowling={showBowling} othersAlone={others.length > 0 && !showBowling} today={today} />
      ) : (
        <>
          {showBowling && <LiteNumbers state={state} />}
          {showBowling && <MyBallsSection />}
          <BadgesPreview userId={uid} sports={sports} />
          {/* «Dónde juego» y, si no juegas boliche, tu resumen de los otros deportes. */}
          <View style={{ gap: 14 }}>
            <PlayerPlaces uid={uid} isMe />
            {others.length > 0 && !showBowling && <StatsTab userId={uid} skipBowling isMe />}
          </View>
          <YoRows uid={uid} profile={p} showBowling={showBowling} />
        </>
      )}
    </Screen>
  );
}
