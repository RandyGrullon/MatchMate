/**
 * Las piezas de los espacios deportivos en el teléfono (como src/components/venues/VenueBits.tsx de la web): la foto
 * (bucket público 'venues'), la marca de destacada y la tarjeta de «Dónde jugar».
 */
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { MapPin, Sparkles } from 'lucide-react-native';
import { isFeatured, priceText, type Venue, type VenuePhoto } from '@mm/lib/data/business';
import { usePublicImage, VENUE_BUCKET } from '@mm/lib/publicImages';
import { venueLine } from '@mm/lib/venues/text';
import { sportMeta } from '@mm/sports/registry';
import { Txt } from '../ui';
import { colorsFor, useColors, useTheme } from '@/theme/theme';
import { font, radius } from '@/theme/tokens';

/** Una foto del espacio con su hueco reservado (16:10); sin foto, el ícono del deporte en su color. */
export function VenuePhotoImg({ photo, sport, alt, style }: { photo: VenuePhoto | null | undefined; sport: string; alt?: string; style?: StyleProp<ViewStyle> }) {
  const { isDark } = useTheme();
  const tint = colorsFor(isDark, sport);
  const { url } = usePublicImage(VENUE_BUCKET, photo?.path ?? null);
  const Icon = sportMeta(sport)?.icon;
  return (
    <View style={[styles.photo, { backgroundColor: url ? tint.surface2 : tint.accentSoft }, style]}>
      {url ? (
        <Image source={{ uri: url }} accessibilityLabel={alt} accessibilityIgnoresInvertColors contentFit="cover" style={StyleSheet.absoluteFill} />
      ) : Icon ? (
        <Icon size={40} color={tint.accent} style={{ opacity: 0.8 }} />
      ) : null}
    </View>
  );
}

/** «Destacada» (la promoción activa). */
export function FeaturedBadge() {
  const c = useColors();
  return (
    <View style={[styles.badge, { backgroundColor: c.warnSoft }]}>
      <Sparkles size={13} color={c.warn} />
      <Txt style={{ color: c.warn, fontFamily: font.semibold, fontSize: 12 }}>Destacada</Txt>
    </View>
  );
}

/** La tarjeta de un espacio: portada, nombre, deporte y lo llenado, ciudad, precio y si está destacada. Abre su ficha. */
export function VenueCard({ venue }: { venue: Venue }) {
  const c = useColors();
  const price = priceText(venue.priceHour);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={venue.name}
      onPress={() => router.push({ pathname: '/canchas/[venueId]', params: { venueId: venue.id } })}
      style={({ pressed }) => [styles.card, { backgroundColor: c.surface, opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] }]}
    >
      <View>
        <VenuePhotoImg photo={venue.photos[0]} sport={venue.sport} />
        {isFeatured(venue) && (
          <View style={{ position: 'absolute', top: 10, left: 10 }}>
            <FeaturedBadge />
          </View>
        )}
      </View>
      <View style={{ gap: 3, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 }}>
        <Txt variant="bodyStrong" numberOfLines={1}>
          {venue.name}
        </Txt>
        <Txt variant="meta" tone="muted" numberOfLines={1}>
          {venueLine(venue)}
        </Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <MapPin size={15} color={c.muted} />
          <Txt variant="meta" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
            {[venue.city, venue.business.name].join(' · ')}
          </Txt>
        </View>
        {!!price && <Txt variant="meta" style={{ fontFamily: font.semibold }}>{price}</Txt>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  photo: { width: '100%', aspectRatio: 16 / 10, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  card: { borderRadius: radius.card, overflow: 'hidden' },
});
