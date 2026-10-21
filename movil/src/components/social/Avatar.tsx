import { View } from 'react-native';
import { Image } from 'expo-image';
import { AVATAR_BUCKET, usePublicImage } from '@mm/lib/publicImages';
import { Txt } from '../ui';
import { useColors } from '@/theme/theme';

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

/** La cara de una cuenta (como Avatar de la web): su foto de perfil o, sin foto o mientras llega, sus iniciales. */
export function Avatar({ name, photo, size = 40 }: { name: string; photo?: string | null; size?: number }) {
  const c = useColors();
  const { url } = usePublicImage(AVATAR_BUCKET, photo);
  if (url) {
    return <Image source={{ uri: url }} accessibilityIgnoresInvertColors style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.surface2 }} contentFit="cover" />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
      <Txt tone="accent" style={{ fontSize: Math.round(size * 0.36), fontWeight: '600' }}>
        {initials(name) || '?'}
      </Txt>
    </View>
  );
}
