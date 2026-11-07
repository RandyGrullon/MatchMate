/**
 * La transmisión dentro de la app (el iframe de LiveStreamPage en la web), en el teléfono: una página con el mismo
 * iframe servida como si fuera del dominio de la app (Twitch pide que su `parent` sea el dominio de la página, y YouTube
 * quiere un origen). Un link que se toque adentro y salga del video se abre afuera. En la vista previa web de la app,
 * StreamPlayer.web.tsx pone el iframe directo.
 */
import { Linking, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { APP_ORIGIN } from '@mm/lib/origin';

/** El dominio que se le dice a la plataforma (el `parent` de Twitch): el de la app. */
export const playerHost = (): string => APP_ORIGIN.replace(/^https?:\/\//, '');

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function StreamPlayer({ src, title }: { src: string; title: string }) {
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:#000}iframe{display:block;border:0;width:100%;height:100%}</style></head><body><iframe src="${escapeAttr(src)}" title="${escapeAttr(title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></body></html>`;
  return (
    <View style={{ aspectRatio: 16 / 9, width: '100%', borderRadius: 24, overflow: 'hidden', backgroundColor: '#000000' }}>
      <WebView
        source={{ html, baseUrl: `${APP_ORIGIN}/` }}
        originWhitelist={['*']}
        allowsInlineMediaPlayback
        allowsFullscreenVideo
        mediaPlaybackRequiresUserAction={false}
        style={{ backgroundColor: '#000000' }}
        onShouldStartLoadWithRequest={(req) => {
          // La página del video y lo de adentro del iframe, sí; lo que la cambie entera (un link), afuera.
          if (req.isTopFrame === false || req.url === 'about:blank' || req.url.startsWith(APP_ORIGIN)) return true;
          void Linking.openURL(req.url).catch(() => undefined);
          return false;
        }}
      />
    </View>
  );
}
