import { Linking, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Clock, MapPin, MessageCircle, PencilLine, Phone, SearchX, Trophy } from 'lucide-react-native';
import { isFeatured, priceText, useVenue, whatsappLink } from '@mm/lib/data/business';
import { venueDetailsLines } from '@mm/lib/venues/fields';
import { venueMapUrl, venueWhatsappText } from '@mm/lib/venues/text';
import { sportMeta } from '@mm/sports/registry';
import { FeaturedBadge, VenuePhotoImg } from '@/components/venues/VenueBits';
import { toast } from '@/components/feedback';
import { BackBar, Badge, Button, Card, Divider, Empty, ListRow, Loading, RowIcon, Screen, SectionHeader, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';

/** Abre WhatsApp, el teléfono o el mapa (si el teléfono no puede, lo dice). */
const open = (url: string) => Linking.openURL(url).catch(() => toast('No se pudo abrir. Inténtalo otra vez.', 'error'));

/**
 * La ficha de un espacio (`/canchas/<id>`, como VenuePage de la web): sus fotos, deporte y lo que tiene, precio,
 * horario, dónde queda, la empresa, escribirle por WhatsApp o llamar, y los torneos y ligas públicas que se juegan
 * ahí. La dueña ve «Cambiar en mi panel».
 */
export default function VenueScreen() {
  const { venueId } = useLocalSearchParams<{ venueId: string }>();
  const c = useColors();
  const { width } = useWindowDimensions();
  const venue = useVenue(venueId);
  const v = venue.data;

  if (venue.loading && !v) return <Loading />;
  if (!v) {
    return (
      <Screen>
        <BackBar label="Dónde jugar" fallback="/canchas" />
        {venue.error ? (
          <Empty title="No se pudo cargar este espacio" text="Revisa tu conexión y vuelve a intentar." />
        ) : (
          <Empty icon={<SearchX size={28} color={c.accent} />} title="Este espacio no está disponible" text="Puede que lo hayan quitado o que todavía no esté publicado." />
        )}
      </Screen>
    );
  }

  const meta = sportMeta(v.sport);
  const lines = venueDetailsLines(v.sport, v.details);
  const price = priceText(v.priceHour);
  const wa = whatsappLink(v.phone, venueWhatsappText(v));
  const many = v.photos.length > 1;
  const photoWidth = Math.min(width, 640) - 32;
  const slide = many ? Math.round(photoWidth * 0.85) : photoWidth;

  return (
    <Screen>
      <BackBar label="Dónde jugar" fallback="/canchas" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={many ? slide + 8 : undefined}
        decelerationRate="fast"
        style={{ marginHorizontal: -16 }}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
      >
        {(v.photos.length ? v.photos : [null]).map((p, i) => (
          <View key={p?.id ?? 'sin-foto'} style={{ width: slide, borderRadius: 22, overflow: 'hidden' }}>
            <VenuePhotoImg photo={p} sport={v.sport} alt={p ? `Foto ${i + 1} de ${v.name}` : undefined} />
          </View>
        ))}
      </ScrollView>

      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <Badge>{meta?.label ?? v.sport}</Badge>
          {isFeatured(v) && <FeaturedBadge />}
        </View>
        <Txt variant="title">{v.name}</Txt>
        <Txt variant="meta" tone="muted">
          {v.business.name}
        </Txt>
        {!!price && <Txt variant="bodyStrong">{price}</Txt>}
      </View>

      {(wa || v.phone) && (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {wa && (
            <View style={{ flex: 1 }}>
              <Button variant="primary" size="xl" full icon={<MessageCircle size={20} color={c.accentFg} />} onPress={() => void open(wa)}>
                WhatsApp
              </Button>
            </View>
          )}
          {!!v.phone && (
            <View style={{ flex: 1 }}>
              <Button size="xl" full icon={<Phone size={20} color={c.fg} />} onPress={() => void open(`tel:${v.phone}`)}>
                Llamar
              </Button>
            </View>
          )}
        </View>
      )}

      {lines.length > 0 && (
        <Card style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 16 }}>
          {lines.map((l) => (
            <Badge key={l} tone="muted">
              {l}
            </Badge>
          ))}
        </Card>
      )}

      <Card padded={false}>
        <ListRow
          icon={
            <RowIcon>
              <MapPin size={20} color={c.accent} />
            </RowIcon>
          }
          title={v.address || v.city}
          subtitle={v.address ? v.city : undefined}
          accessibilityLabel={`Ver en el mapa: ${[v.address, v.city].filter(Boolean).join(', ')}`}
          onPress={() => void open(venueMapUrl(v))}
        />
        {!!v.hours && (
          <>
            <Divider inset={68} />
            <ListRow
              icon={
                <RowIcon>
                  <Clock size={20} color={c.accent} />
                </RowIcon>
              }
              title={v.hours}
              subtitle="Horario"
            />
          </>
        )}
        {v.mine && (
          <>
            <Divider inset={68} />
            <ListRow
              icon={
                <RowIcon>
                  <PencilLine size={20} color={c.accent} />
                </RowIcon>
              }
              title="Cambiar en mi panel"
              onPress={() => router.push({ pathname: '/espacio/[venueId]', params: { venueId: v.id } })}
            />
          </>
        )}
      </Card>

      {!!v.business.description && (
        <>
          <SectionHeader title={v.business.name} />
          <Txt tone="fg2">{v.business.description}</Txt>
        </>
      )}

      {v.leagues.length > 0 && (
        <>
          <SectionHeader title="Torneos y ligas aquí" />
          <Card padded={false}>
            {v.leagues.map((l, i) => (
              <View key={l.id}>
                {i > 0 && <Divider inset={68} />}
                <ListRow
                  icon={
                    <RowIcon>
                      <Trophy size={20} color={c.accent} />
                    </RowIcon>
                  }
                  title={l.name}
                  subtitle={[l.kind === 'torneo' ? 'Torneo' : 'Liga', sportMeta(l.sport)?.short].filter(Boolean).join(' · ')}
                  onPress={() => router.push({ pathname: '/l/[lid]', params: { lid: l.id } })}
                />
              </View>
            ))}
          </Card>
        </>
      )}

      <Pressable accessibilityRole="link" onPress={() => router.push('/empresa')} style={{ alignSelf: 'center', minHeight: 44, justifyContent: 'center' }}>
        <Txt variant="meta" tone="muted">
          ¿Tienes canchas? <Txt variant="meta" tone="accent" style={{ fontWeight: '600' }}>Publícalas en MatchMate</Txt>
        </Txt>
      </Pressable>
    </Screen>
  );
}
