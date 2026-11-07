/**
 * La transmisión dentro de la app en la vista previa web: el mismo iframe de LiveStreamPage de la web (con el dominio
 * donde corre, como allá). En el teléfono va StreamPlayer.tsx.
 */
import { View } from 'react-native';

export const playerHost = (): string => (typeof location === 'undefined' ? 'matchmate.grullonb.com' : location.hostname);

export function StreamPlayer({ src, title }: { src: string; title: string }) {
  return (
    <View style={{ aspectRatio: 16 / 9, width: '100%', borderRadius: 24, overflow: 'hidden', backgroundColor: '#000000' }}>
      <iframe
        src={src}
        title={title}
        style={{ display: 'block', width: '100%', height: '100%', border: 0 }}
        loading="lazy"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </View>
  );
}
