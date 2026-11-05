import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Building2, MapPin, Search, SearchX } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { useVenueSearch } from '@mm/lib/data/business';
import { SPORT_IDS, isSportId, sportMeta } from '@mm/sports/registry';
import type { SportId } from '@mm/sports/types';
import { VenueCard } from '@/components/venues/VenueBits';
import { BackBar, Button, Card, Empty, Input, Loading, Screen, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';

/** El valor, pero solo después de `ms` sin cambios (para no buscar con cada letra). */
function useDebounced(value: string, ms = 300): string {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Dónde jugar (`/canchas`, de Ligas; como VenuesPage de la web): las canchas y espacios de las empresas aprobadas, por
 * deporte (`?deporte=`), ciudad y nombre. Las destacadas salen primero. También sin cuenta. Abajo, para quien tiene
 * canchas: registrar su empresa.
 */
export default function VenuesScreen() {
  const c = useColors();
  const auth = useAuth();
  const params = useLocalSearchParams<{ deporte?: string }>();
  const [sport, setSport] = useState<SportId | null>(() => (params.deporte && isSportId(params.deporte) ? params.deporte : null));
  const [city, setCity] = useState('');
  const [query, setQuery] = useState('');
  const venues = useVenueSearch({ sport, city: useDebounced(city), query: useDebounced(query) });

  const pickSport = (s: SportId | null) => {
    setSport(s);
    router.setParams({ deporte: s ?? 'todos' });
  };

  return (
    <Screen>
      <BackBar label="Ligas" fallback="/ligas" />
      <View style={{ gap: 2 }}>
        <Txt variant="title">Dónde jugar</Txt>
        <Txt variant="meta" tone="muted">
          Canchas y espacios deportivos
        </Txt>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }} accessibilityLabel="Deporte">
        {[null, ...SPORT_IDS].map((id) => {
          const on = id === sport;
          const m = id ? sportMeta(id) : null;
          const Icon = m?.icon;
          return (
            <Pressable
              key={id ?? 'todos'}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => pickSport(id)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, borderRadius: 20, paddingHorizontal: 14, borderWidth: on ? 0 : 1, borderColor: c.line, backgroundColor: on ? c.accent : c.surface }}
            >
              {Icon && <Icon size={16} color={on ? c.accentFg : (m?.color ?? c.fg)} />}
              <Txt variant="meta" style={{ color: on ? c.accentFg : c.fg, fontWeight: '600' }}>
                {m ? m.short : 'Todos'}
              </Txt>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <MapPin size={17} color={c.muted} style={{ position: 'absolute', left: 14, zIndex: 1 }} />
          <Input accessibilityLabel="Ciudad" placeholder="Ciudad" value={city} maxLength={60} onChangeText={setCity} style={{ paddingLeft: 40 }} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Search size={17} color={c.muted} style={{ position: 'absolute', left: 14, zIndex: 1 }} />
          <Input accessibilityLabel="Nombre" placeholder="Nombre" value={query} maxLength={60} onChangeText={setQuery} returnKeyType="search" style={{ paddingLeft: 40 }} />
        </View>
      </View>

      {venues.loading && !venues.data.length ? (
        <Loading label="Buscando canchas" />
      ) : venues.error && !venues.data.length ? (
        <Empty title="No se pudieron cargar las canchas" text="Revisa tu conexión y vuelve a intentar." />
      ) : venues.data.length ? (
        <View style={{ gap: 14 }}>
          {venues.data.map((v) => (
            <VenueCard key={v.id} venue={v} />
          ))}
        </View>
      ) : (
        <Empty
          icon={<SearchX size={28} color={c.accent} />}
          title={sport ? `Todavía no hay espacios de ${sportMeta(sport)?.lower ?? 'ese deporte'}` : 'Todavía no hay espacios'}
          text={city || query ? 'Prueba con otra ciudad u otro nombre.' : 'Cuando los clubes y canchas se registren, salen aquí.'}
        />
      )}

      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }}>
        <Building2 size={24} color={c.accent} />
        <Txt variant="meta" style={{ flex: 1 }}>
          ¿Tienes canchas o un espacio deportivo? Publícalo gratis.
        </Txt>
        <Button variant="soft" onPress={() => router.push(auth.user ? '/empresa' : '/login')}>
          Registrar
        </Button>
      </Card>
    </Screen>
  );
}
