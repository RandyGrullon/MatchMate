import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { Bell, Plus, QrCode, Search, Ticket } from 'lucide-react-native';
import { displayName, useAuth } from '@mm/lib/auth';
import { codeReady, normalizeCode } from '@mm/components/scanner/logic';
import { useNotifications } from '@mm/components/notifications/provider';
import { useActivity, useMyLeagues } from '@mm/components/home/activity';
import { IdleCard, LiveMatchesCard, NextMatchCard, NextUpCard, TodayGameCard, UpNext } from '@/components/home/Activity';
import { LeagueCard } from '@/components/LeagueCard';
import { LogoLockup } from '@/components/Logo';
import { Button, Card, Empty, Input, ListRow, Loading, RowIcon, Screen, SectionHeader, Txt } from '@/components/ui';
import { openOnWeb } from '@/lib/web';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

const today = () => {
  const s = new Date().toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Sin cuenta: lo que es MatchMate y entrar (la portada de la web, src/components/cuenta/Landing.tsx). */
function Landing() {
  return (
    <Screen>
      <View style={{ paddingTop: 8 }}>
        <LogoLockup />
      </View>
      <View style={{ gap: 10, marginTop: 12 }}>
        <Txt variant="title">Tu liga, en el celular</Txt>
        <Txt tone="fg2">Boliche, pádel, tenis y 8 deportes más. La tabla, los resultados en vivo y tus números. Gratis.</Txt>
      </View>
      <View style={{ gap: 10 }}>
        <Button variant="primary" size="xl" full onPress={() => router.push({ pathname: '/login', params: { modo: 'registro' } })}>
          Crear mi cuenta
        </Button>
        <Button size="xl" full onPress={() => router.push('/login')}>
          Ya tengo cuenta
        </Button>
      </View>
      <SectionHeader title="Qué hace por ti" />
      <Card padded={false}>
        <ListRow chevron={false} title="La tabla se hace sola" subtitle="Con cada resultado que se anota" />
        <ListRow chevron={false} title="Resultados en vivo" subtitle="Anotas en la cancha y todos lo ven" />
        <ListRow chevron={false} title="Avisos en tu teléfono" subtitle="Tu próximo juego y lo que falta" />
      </Card>
    </Screen>
  );
}

/** La campana de Hoy (como HomeHeader de la web): lleva a Avisos, con el número de lo nuevo. */
function NoticesBell() {
  const c = useColors();
  const { unread, openNotifications } = useNotifications();
  const label = unread ? `Avisos: ${unread} ${unread === 1 ? 'nuevo' : 'nuevos'}` : 'Avisos';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={openNotifications}
      style={({ pressed }) => [styles.bell, { backgroundColor: pressed ? c.surface2 : 'transparent' }]}
    >
      <Bell size={22} color={c.fg} />
      {unread > 0 && (
        <View style={[styles.badge, { backgroundColor: c.danger, borderColor: c.bg }]}>
          <Text style={{ color: '#fff', fontFamily: font.bold, fontSize: 10, lineHeight: 14 }}>{unread > 9 ? '9+' : unread}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** «Únete a tu liga» con el código que te mandó quien organiza (8 letras y números). */
function JoinCard() {
  const c = useColors();
  const [code, setCode] = useState('');
  const ready = codeReady(code);
  const go = () => {
    if (ready) router.push({ pathname: '/unirse/[code]', params: { code: normalizeCode(code) } });
  };
  return (
    <Card style={{ gap: 12 }}>
      <View style={[styles.ticket, { backgroundColor: c.accentSoft }]}>
        <Ticket size={26} color={c.accent} />
      </View>
      <Txt variant="cardTitle">Únete a tu liga</Txt>
      <Txt tone="fg2">
        Pon el código que te mandó quien organiza. Son 8 letras y números, como <Txt variant="bodyStrong">ABCD2345</Txt>.
      </Txt>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Input
          accessibilityLabel="Código de invitación"
          placeholder="CÓDIGO"
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          returnKeyType="go"
          value={code}
          onChangeText={(t) => setCode(normalizeCode(t).slice(0, 12))}
          onSubmitEditing={go}
          style={{ flex: 1, letterSpacing: 2, fontWeight: '700' }}
        />
        <Button variant="primary" size="xl" disabled={!ready} onPress={go}>
          Unirme
        </Button>
      </View>
      {/* «o escanea el QR» (JoinLeagueCard de la web): abre el lector. */}
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/escanear')}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44 }}
      >
        <QrCode size={18} color={c.accent} />
        <Txt tone="accent" variant="bodyStrong">
          o escanea el QR
        </Txt>
      </Pressable>
    </Card>
  );
}

/**
 * Lo de hoy, una sola vez (como Hoy de la web, src/pages/HomePage.tsx): el juego de boliche en juego (o los partidos en
 * vivo); si no, tu próximo partido o lo próximo; si no hay nada, «Nada programado». La práctica de anoche va arriba.
 * Después «Lo que viene» sin lo que ya salió arriba.
 */
function TodaySection({ leagues, uid, loading }: { leagues: ReturnType<typeof useMyLeagues>['leagues']; uid: string; loading: boolean }) {
  const act = useActivity(leagues, uid);
  const notices = useNotifications();
  const nextEvent = act.next?.kind === 'event' ? act.next.event : null;
  const nextMatch = act.next?.kind === 'match' ? act.next.match : null;
  const late = act.games.filter((g) => g.late);
  const live = act.games.length > late.length || act.liveItems.length > 0;
  let today: ReactNode;
  if (live) {
    today = (
      <>
        {act.games.map((g) => (
          <TodayGameCard key={`${g.feed.lid}:${g.event.id}`} game={g} today={act.today} />
        ))}
        <LiveMatchesCard items={act.liveItems} />
      </>
    );
  } else if (nextMatch) today = <NextMatchCard next={nextMatch} />;
  else if (nextEvent) today = <NextUpCard item={nextEvent} today={act.today} />;
  else if (loading || notices.loading) today = <Loading label="Cargando lo de hoy" />;
  else today = <IdleCard />;
  if (!live && late.length) {
    today = (
      <>
        {late.map((g) => (
          <TodayGameCard key={`${g.feed.lid}:${g.event.id}`} game={g} today={act.today} />
        ))}
        {today}
      </>
    );
  }
  // «Lo que viene» sin lo que ya sale arriba.
  const shownKeys = new Set([...act.games.map((g) => `${g.feed.lid}:${g.event.id}`), ...(nextEvent && !live ? [nextEvent.key] : [])]);
  const upcoming = act.upcoming.filter((it) => !shownKeys.has(it.key) && !(nextMatch && !live && it.matchId === nextMatch.match.id));
  return (
    <>
      <View style={{ gap: 14 }}>{today}</View>
      <UpNext items={upcoming} today={act.today} showLeague={leagues.length > 1} />
    </>
  );
}

export default function HoyScreen() {
  const auth = useAuth();
  const uid = auth.user?.uid;
  const mine = useMyLeagues();
  const leagues = { data: mine.all, loading: mine.loading, error: mine.error };
  const memberships = mine.memberships;
  const [refreshing, setRefreshing] = useState(false);
  const c = useColors();

  if (auth.loading) return <Loading />;
  if (!auth.user) return <Landing />;
  // En modo empresa el inicio es su panel (Hoy es de los jugadores), como GlobalHomeRoute de la web.
  if (auth.profile?.accountMode === 'business') return <Redirect href="/empresa" />;

  const name = displayName(auth).split(' ')[0];
  const loading = memberships.loading || leagues.loading;
  return (
    <Screen
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        const { queryClient } = await import('@mm/lib/data/client');
        queryClient.onReconnect();
        setTimeout(() => setRefreshing(false), 700);
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="meta" tone="muted">
            {today()}
          </Txt>
          <Txt variant="title">Hola, {name}</Txt>
        </View>
        <NoticesBell />
      </View>
      {loading && !leagues.data.length ? (
        <Loading label="Cargando tus ligas" />
      ) : leagues.data.length ? (
        <>
          <TodaySection leagues={mine.all} uid={uid!} loading={loading} />
          <SectionHeader title="Tus ligas" />
          <View style={{ gap: 10 }}>
            {leagues.data.map((l) => (
              <LeagueCard key={l.id} league={l} />
            ))}
          </View>
          <JoinCard />
        </>
      ) : (
        <>
          <JoinCard />
          <Card padded={false}>
            <ListRow
              icon={
                <RowIcon>
                  <Plus size={20} color={c.accent} />
                </RowIcon>
              }
              title="Crear mi liga"
              subtitle="Tú organizas; toma 1 minuto"
              onPress={() => openOnWeb('/?crear=liga')}
            />
            <ListRow
              icon={
                <RowIcon>
                  <Search size={20} color={c.accent} />
                </RowIcon>
              }
              title="Buscar ligas abiertas"
              subtitle="Públicas, para unirte"
              onPress={() => router.push('/ligas')}
            />
          </Card>
        </>
      )}
      {(memberships.error || leagues.error) && !leagues.data.length && (
        <Empty title="No se pudieron cargar tus ligas" text="Revisa tu conexión y desliza hacia abajo para intentar otra vez." />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  bell: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 4, right: 4, minWidth: 18, height: 18, borderRadius: 9, borderWidth: 2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  ticket: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
