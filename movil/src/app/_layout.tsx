import { useEffect, useState } from 'react';
import { Pressable, Text, View, useColorScheme } from 'react-native';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold, useFonts } from '@expo-google-fonts/inter';
import { AuthProvider, useAuth } from '@mm/lib/auth';
import { subscribePush } from '@mm/lib/push';
import { installNetwork } from '@/platform/network';
import { installNotifications, refreshNotifyState } from '@/platform/notifications';
import { hydrateStorage } from '@/platform/storage';
import { AccountGates } from '@/components/account/Gates';
import { ToastHost } from '@/components/feedback';
import { openLink } from '@/lib/links';
import { ThemeProvider, useTheme } from '@/theme/theme';
import { dark, light } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

// Volvió la señal o la app volvió a la vista: la caché y la cola sin conexión lo oyen por `window` ('online', 'focus'),
// como en la web (src/platform/network.ts y events.ts).
installNetwork();

/** Si falla la raíz: sin tema ni navegación, con los colores del sistema y «Reintentar». */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const c = useColorScheme() === 'dark' ? dark : light;
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, backgroundColor: c.bg }}>
      <Text style={{ color: c.fg, fontSize: 20, fontWeight: '700', textAlign: 'center' }}>Algo falló al abrir MatchMate</Text>
      {__DEV__ && <Text style={{ color: c.muted, textAlign: 'center' }}>{error.message}</Text>}
      <Pressable accessibilityRole="button" onPress={retry} style={{ backgroundColor: c.accent, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 12 }}>
        <Text style={{ color: c.accentFg, fontWeight: '700' }}>Reintentar</Text>
      </Pressable>
    </View>
  );
}

function Navigator() {
  const { colors, isDark } = useTheme();
  const { loading, user } = useAuth();
  const uid = user?.uid ?? null;
  // El splash se va cuando ya se sabe si hay sesión (así no se ve «Entrar» un instante con la sesión guardada).
  useEffect(() => {
    if (!loading) SplashScreen.hideAsync().catch(() => undefined);
  }, [loading]);
  // Tocar un aviso abre su pantalla (en la app si la tiene, si no en la web).
  useEffect(() => installNotifications(openLink), []);
  // Con permiso, el teléfono se vuelve a guardar para la cuenta al abrir la app (como Notifications.tsx en la web).
  useEffect(() => {
    if (!uid) return;
    void refreshNotifyState()
      .then((s) => (s === 'granted' ? subscribePush(uid) : false))
      .catch(() => undefined);
  }, [uid]);
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="login" options={{ presentation: 'modal' }} />
        <Stack.Screen name="l/[lid]/e/[eventId]/anotar" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
        <Stack.Screen name="cuenta/borrar" options={{ presentation: 'modal' }} />
      </Stack>
      {/* «¿Tienes 18 años o más?» y aceptar los Términos vigentes, sobre todo lo demás (como la web). */}
      <AccountGates />
      <ToastHost />
    </>
  );
}

export default function RootLayout() {
  const [hydrated, setHydrated] = useState(false);
  const [fonts, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold });
  // Si las letras no llegan en 3 s (teléfono lento, vista previa en segundo plano), se pinta igual con las del sistema.
  const [fontWait, setFontWait] = useState(true);
  useEffect(() => {
    void hydrateStorage().then(() => setHydrated(true));
    const t = setTimeout(() => setFontWait(false), 3000);
    return () => clearTimeout(t);
  }, []);
  // Hasta tener lo guardado en el teléfono (la sesión) y las letras, queda el splash.
  if (!hydrated || (!fonts && !fontError && fontWait)) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <Navigator />
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
