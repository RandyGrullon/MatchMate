import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { MapPin, Plus, Search, Trophy } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { useLeaguesByIds, useMyMemberships, usePublicLeagues } from '@mm/lib/data';
import { formatDate } from '@mm/lib/format';
import { leagueSport } from '@mm/sports/registry';
import { LeagueCard } from '@/components/LeagueCard';
import { EsportsLeaguesRow } from '@/components/esports/EsportsRow';
import { Button, Card, Empty, Input, ListRow, Loading, RowIcon, Screen, SectionHeader, Txt } from '@/components/ui';
import { SquadsLeaguesSection } from '@/components/squads/SquadEntries';
import { useColors } from '@/theme/theme';

/** Ligas: las tuyas, Dónde jugar y las públicas para unirte (la pantalla Eventos y «Ligas abiertas» de la web). */
export default function LigasScreen() {
  const auth = useAuth();
  const c = useColors();
  const uid = auth.user?.uid;
  const memberships = useMyMemberships(uid);
  const ids = useMemo(() => memberships.data.map((m) => m.leagueId), [memberships.data]);
  const mine = useLeaguesByIds(ids);
  const [query, setQuery] = useState('');
  const open = usePublicLeagues({ query: query.trim().length >= 2 ? query.trim() : undefined, limit: 30 });
  const mineIds = new Set(ids);
  const others = open.data.filter((l) => !mineIds.has(l.id));
  const mySports = useMemo(() => mine.data.map((l) => leagueSport(l)), [mine.data]);

  return (
    <Screen>
      <Txt variant="title">Ligas</Txt>
      {!!uid && (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Button variant="primary" full icon={<Plus size={18} color={c.accentFg} />} onPress={() => router.push({ pathname: '/crear', params: { kind: 'liga' } })}>
              Crear liga
            </Button>
          </View>
          <View style={{ flex: 1 }}>
            <Button full icon={<Trophy size={18} color={c.fg} />} onPress={() => router.push({ pathname: '/crear', params: { kind: 'torneo' } })}>
              Crear torneo
            </Button>
          </View>
        </View>
      )}
      {!!uid && mine.data.length > 0 && (
        <>
          <SectionHeader title="Las tuyas" />
          <View style={{ gap: 10 }}>
            {mine.data.map((l) => (
              <LeagueCard key={l.id} league={l} />
            ))}
          </View>
        </>
      )}
      {/* Tus equipos (o «Equipos · Crea tu equipo competitivo»), como Ligas de la web. */}
      <SquadsLeaguesSection />
      {/* Dónde jugar: las canchas y espacios de las empresas (docs/empresas.md). */}
      <Card padded={false}>
        <ListRow
          icon={
            <RowIcon>
              <MapPin size={20} color={c.accent} />
            </RowIcon>
          }
          title="Dónde jugar"
          subtitle="Canchas y espacios deportivos cerca de ti"
          onPress={() => router.push('/canchas')}
        />
      </Card>
      <EsportsLeaguesRow uid={uid} mySports={mySports} />
      <SectionHeader title="Ligas abiertas" />
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Search size={18} color={c.muted} style={{ position: 'absolute', left: 16, zIndex: 1 }} />
        <Input
          accessibilityLabel="Buscar ligas por nombre o lugar"
          placeholder="Buscar por nombre o lugar"
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          style={{ flex: 1, paddingLeft: 44 }}
        />
      </View>
      {open.loading && !open.data.length ? (
        <Loading label="Buscando ligas" />
      ) : others.length ? (
        <View style={{ gap: 10 }}>
          {others.map((l) => (
            <LeagueCard
              key={l.id}
              league={l}
              line={
                [l.venue, l.nextEventDate ? `Próximo: ${formatDate(l.nextEventDate)}` : null, `${l.players} ${l.players === 1 ? 'jugador' : 'jugadores'}`]
                  .filter(Boolean)
                  .join(' · ') || null
              }
            />
          ))}
        </View>
      ) : (
        <Empty
          title={query.trim() ? 'No hay ligas con ese nombre' : 'Todavía no hay ligas abiertas'}
          text={query.trim() ? 'Prueba con otra palabra o con el lugar.' : 'Crea tu cuenta y arma la primera.'}
        />
      )}
      {open.error && <Empty title="No se pudieron cargar las ligas" text="Revisa tu conexión y vuelve a intentar." />}
    </Screen>
  );
}
