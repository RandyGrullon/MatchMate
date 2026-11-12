import { useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { WebView } from 'react-native-webview';
import { CreditCard, Lock } from 'lucide-react-native';
import { goToPaymentReturn } from '@/lib/azul';
import { azulBody, azulFormFrom, azulReturnQuery } from '@/lib/azulForm';
import { BackBar, Empty, Loading, Screen, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';

const hostOf = (url: string) => url.replace(/^[a-z]+:\/\//i, '').split(/[/?#]/)[0];

/**
 * La Página de Pagos de Azul dentro de la app (movil/src/lib/azul.ts): la WebView le manda el formulario firmado con
 * un POST, como el navegador en la web, y la persona paga ahí. Arriba, la dirección de la página (lo que en la web
 * enseña la barra del navegador). Cuando Azul manda a la vuelta (`/empresa/pago` de la web), esa página no se carga:
 * su respuesta va a la pantalla de la app que la confirma. Salir antes deja el pago «Sin terminar», como cerrar el
 * navegador en la web.
 */
export default function AzulPayScreen() {
  const { form: raw } = useLocalSearchParams<{ form?: string }>();
  const form = azulFormFrom(raw);
  const c = useColors();
  const [host, setHost] = useState(() => (form ? hostOf(form.url) : ''));
  const left = useRef(false);

  // Sin formulario (o en la vista previa web, donde no hay WebView: allá se paga como en la web).
  if (!form || Platform.OS === 'web') {
    return (
      <Screen>
        <BackBar label="Mi empresa" fallback="/empresa" />
        <Empty icon={<CreditCard size={28} color={c.muted} />} title="No hay ningún pago aquí" text="Para destacar un espacio, ábrelo en Mi empresa." />
      </Screen>
    );
  }

  /** ¿Es la vuelta de Azul? Entonces va (una sola vez) a confirmarla en la app y la WebView no la carga. */
  const isReturn = (url: string) => {
    const query = azulReturnQuery(url, form.fields);
    if (query === null) return false;
    if (!left.current) {
      left.current = true;
      goToPaymentReturn(query);
    }
    return true;
  };

  return (
    <Screen scroll={false}>
      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        <BackBar label="Mi empresa" fallback="/empresa" />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Lock size={14} color={c.muted} />
          <Txt variant="meta" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
            {host}
          </Txt>
        </View>
      </View>
      <WebView
        source={{ uri: form.url, method: 'POST', body: azulBody(form.fields), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }}
        originWhitelist={['https://*']}
        setSupportMultipleWindows={false}
        startInLoadingState
        renderLoading={() => <Loading />}
        onShouldStartLoadWithRequest={(req) => req.isTopFrame === false || !isReturn(req.url)}
        onNavigationStateChange={(s) => {
          if (!isReturn(s.url)) setHost(hostOf(s.url));
        }}
        style={{ flex: 1, backgroundColor: c.bg }}
      />
    </Screen>
  );
}
