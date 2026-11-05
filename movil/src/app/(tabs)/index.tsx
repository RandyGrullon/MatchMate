import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { Plus, Search, Ticket } from 'lucide-react-native';
import { displayName, useAuth } from '@mm/lib/auth';
import { useLeaguesByIds, useMyMemberships } from '@mm/lib/data';
import { codeReady, normalizeCode } from '@mm/components/scanner/logic';
import { LeagueCard } from '@/components/LeagueCard';
import { LogoLockup } from '@/components/Logo';
import { Button, Card, Empty, Input, ListRow, Loading, RowIcon, Screen, SectionHeader, Txt } from '@/components/ui';
import { openOnWeb } from '@/lib/web';
import { useColors } from '@/theme/theme';

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
    </Card>
  );
}

export default function HoyScreen() {
  const auth = useAuth();
  const uid = auth.user?.uid;
  const memberships = useMyMemberships(uid);
  const ids = useMemo(() => memberships.data.map((m) => m.leagueId), [memberships.data]);
  const leagues = useLeaguesByIds(ids);
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
      <View style={{ gap: 2 }}>
        <Txt variant="meta" tone="muted">
          {today()}
        </Txt>
        <Txt variant="title">Hola, {name}</Txt>
      </View>
      {loading && !leagues.data.length ? (
        <Loading label="Cargando tus ligas" />
      ) : leagues.data.length ? (
        <>
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
  ticket: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
