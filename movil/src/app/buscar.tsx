import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { CircleHelp, Search, SearchX, Trophy, Users, X } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { usePublicLeagues } from '@mm/lib/data';
import { useFollowedLeagues, useLeagueSearch } from '@mm/lib/data/leagueSocial';
import { PEOPLE_QUERY_MAX, PEOPLE_QUERY_MIN, usePeople } from '@mm/lib/data/people';
import { socialErrorText } from '@mm/lib/data/posts';
import { sportMeta } from '@mm/sports/registry';
import { fromPublicLeague, leagueResultLine, type LeagueResult } from '@mm/components/search/searchFormat';
import { LeagueFollowButton, PersonRow } from '@/components/social/People';
import { BackBar, Badge, Button, Card, Divider, Empty, ErrorNote, Screen, Segmented, SectionHeader, Txt } from '@/components/ui';
import { LogoSpinner } from '@/components/Logo';
import { useColors } from '@/theme/theme';

type View_ = 'todo' | 'personas' | 'ligas';
/** En «Todo», cuántas de cada una (las demás con «Ver todas»). */
const TODO_MAX = 5;
const PUBLIC_LIMIT = 20;

function useDebounced(value: string, ms: number): string {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * La lupa (/buscar de la web): personas por nombre o @usuario y ligas por nombre o lugar, «Todo · Personas · Ligas».
 * Sin escribir: a quién sigues y las ligas que sigues. Sin cuenta: las ligas públicas. Los equipos, por ahora en la web.
 */
export default function SearchScreen() {
  const c = useColors();
  const auth = useAuth();
  const signedIn = !!auth.user;
  const [query, setQuery] = useState('');
  const [view, setView] = useState<View_>('todo');
  const q = query.trim();
  const quoted = `«${q}»`;
  const todo = view === 'todo';
  const max = todo ? TODO_MAX : Infinity;
  const short = q.length > 0 && q.length < PEOPLE_QUERY_MIN;

  const people = usePeople(signedIn ? query : '');
  const leagueSearch = useLeagueSearch(query, signedIn && view !== 'personas');
  const followed = useFollowedLeagues();
  const publicText = useDebounced(q, 250);
  const publics = usePublicLeagues({ query: publicText, limit: PUBLIC_LIMIT, enabled: !signedIn && (publicText === '' || publicText.length >= PEOPLE_QUERY_MIN) });
  const publicRows = useMemo(() => publics.data.map(fromPublicLeague), [publics.data]);
  const leagues = !signedIn
    ? { data: publicRows, loading: publics.loading, error: publics.error }
    : q
      ? { data: leagueSearch.data as LeagueResult[], loading: leagueSearch.loading || !leagueSearch.settled, error: leagueSearch.error }
      : { data: followed.data as LeagueResult[], loading: followed.loading, error: followed.error };

  const seeAll = (to: View_, label: string) => (
    <Txt variant="meta" tone="accent" style={{ fontWeight: '600' }} onPress={() => setView(to)}>
      {label}
    </Txt>
  );

  const peopleSection = !signedIn ? (
    <Card style={{ gap: 12 }}>
      <Search size={28} color={c.accent} />
      <Txt variant="cardTitle">Entra para buscar personas</Txt>
      <Txt tone="fg2">Encuentra a otros jugadores por su nombre o @usuario y síguelos.</Txt>
      <Button variant="primary" size="xl" full onPress={() => router.push('/login')}>
        Entrar
      </Button>
    </Card>
  ) : (
    <View style={{ gap: 10 }}>
      {(todo || !q) && <SectionHeader title={q ? 'Personas' : 'Personas que sigues'} action={todo && people.data.length > TODO_MAX ? seeAll('personas', 'Ver todas') : undefined} />}
      <Part
        loading={people.loading || !people.settled}
        error={people.error ? socialErrorText(people.error, 'No se pudo buscar.') : null}
        count={people.data.length}
        empty={
          !q ? (
            <Empty icon={<Users size={28} color={c.accent} />} title="Aún no sigues a nadie" text="Búscalos por su nombre o @usuario arriba." />
          ) : todo ? (
            <Txt variant="meta" tone="muted">{`Ninguna persona con ${quoted}.`}</Txt>
          ) : (
            <Empty icon={<SearchX size={28} color={c.accent} />} title={`No encontramos a nadie con ${quoted}`} text="Revisa cómo se escribe o busca por su @usuario." />
          )
        }
      >
        <Card padded={false}>
          {people.data.slice(0, max).map((p, i) => (
            <View key={p.id}>
              {i > 0 && <Divider inset={72} />}
              <PersonRow person={p} />
            </View>
          ))}
        </Card>
      </Part>
    </View>
  );

  const leaguesSection = (
    <View style={{ gap: 10 }}>
      {(todo || !q) && (
        <SectionHeader title={q ? 'Ligas' : signedIn ? 'Ligas que sigues' : 'Ligas públicas'} action={todo && leagues.data.length > TODO_MAX ? seeAll('ligas', 'Ver todas') : undefined} />
      )}
      <Part
        loading={leagues.loading}
        error={leagues.error ? socialErrorText(leagues.error, 'No se pudo buscar.') : null}
        count={leagues.data.length}
        empty={
          !q ? (
            signedIn ? (
              <Empty icon={<Trophy size={28} color={c.accent} />} title="Aún no sigues ninguna liga" text="Sigue una liga pública y sus publicaciones salen en Social." />
            ) : (
              <Txt variant="meta" tone="muted">
                Todavía no hay ligas públicas.
              </Txt>
            )
          ) : todo && signedIn ? (
            <Txt variant="meta" tone="muted">{`Ninguna liga con ${quoted}.`}</Txt>
          ) : (
            <Empty
              icon={<SearchX size={28} color={c.accent} />}
              title={`No encontramos ligas con ${quoted}`}
              text={signedIn ? 'Busca por el nombre de la liga o el lugar donde juegan.' : 'Sin cuenta se ven las públicas. Busca por el nombre o el lugar donde juegan.'}
            />
          )
        }
      >
        <Card padded={false}>
          {leagues.data.slice(0, max).map((l, i) => (
            <View key={l.id}>
              {i > 0 && <Divider inset={72} />}
              <LeagueRow league={l} canFollow={signedIn} />
            </View>
          ))}
        </Card>
      </Part>
    </View>
  );

  return (
    <Screen>
      <BackBar label="Social" fallback="/social" />
      <Txt variant="title">Buscar</Txt>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 52, borderRadius: 16, paddingHorizontal: 14, backgroundColor: c.surface, borderWidth: 1.5, borderColor: c.line }}>
        <Search size={20} color={c.muted} />
        <TextInput
          accessibilityLabel="Buscar personas o ligas"
          placeholder="Personas o ligas"
          placeholderTextColor={c.faint}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          value={query}
          onChangeText={(t) => setQuery(t.slice(0, PEOPLE_QUERY_MAX))}
          style={{ flex: 1, fontSize: 17, color: c.fg }}
        />
        {!!query && (
          <Pressable accessibilityRole="button" accessibilityLabel="Borrar búsqueda" hitSlop={8} onPress={() => setQuery('')}>
            <X size={20} color={c.muted} />
          </Pressable>
        )}
      </View>
      <Segmented<View_>
        label="Qué buscar"
        value={view}
        onChange={setView}
        options={[
          { key: 'todo', label: 'Todo' },
          { key: 'personas', label: 'Personas' },
          { key: 'ligas', label: 'Ligas' },
        ]}
      />
      {short ? (
        <Txt variant="meta" tone="muted">
          Escribe al menos {PEOPLE_QUERY_MIN} letras.
        </Txt>
      ) : (
        <>
          {view !== 'ligas' && peopleSection}
          {view !== 'personas' && leaguesSection}
        </>
      )}
    </Screen>
  );
}

function Part({ loading, error, count, empty, children }: { loading: boolean; error: string | null; count: number; empty: ReactNode; children: ReactNode }) {
  if (loading && !count) {
    return (
      <View style={{ paddingVertical: 20, alignItems: 'center' }}>
        <LogoSpinner size={32} label="Buscando" />
      </View>
    );
  }
  if (error && !count) return <ErrorNote>{error}</ErrorNote>;
  if (!count) return <>{empty}</>;
  return <>{children}</>;
}

/** Una liga: el ícono del deporte en su color, el nombre y su línea; «Tu liga» si es miembro o, si es pública, Seguir. */
function LeagueRow({ league: l, canFollow }: { league: LeagueResult; canFollow: boolean }) {
  const c = useColors();
  const meta = sportMeta(l.sport);
  const Icon = meta?.icon ?? CircleHelp;
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push({ pathname: '/l/[lid]', params: { lid: l.id } })}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: pressed ? c.surface2 : 'transparent' })}
    >
      <View style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: `${meta?.color ?? c.accent}22` }}>
        <Icon size={22} color={meta?.color ?? c.accent} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="bodyStrong" numberOfLines={1}>
          {l.name}
        </Txt>
        <Txt variant="meta" tone="muted" numberOfLines={1}>
          {leagueResultLine(l)}
        </Txt>
      </View>
      {l.isMember ? <Badge>{l.kind === 'torneo' ? 'Tu torneo' : 'Tu liga'}</Badge> : canFollow && l.visibility === 'public' ? <LeagueFollowButton leagueId={l.id} name={l.name} following={l.isFollowing} /> : null}
    </Pressable>
  );
}
