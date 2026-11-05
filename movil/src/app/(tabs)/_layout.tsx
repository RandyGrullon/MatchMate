import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Building2, House, MessagesSquare, Trophy, UserRound } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/**
 * La barra de abajo, como la web con cuenta (src/components/Shell.tsx · navSections): Hoy · Social · Ligas · Yo. En
 * modo empresa (profiles.account_mode, docs/empresas.md): Mi empresa · Social · Yo; Hoy y Ligas siguen abriendo por
 * su link, pero no salen en la barra.
 */
export default function TabsLayout() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const business = !!user && profile?.accountMode === 'business';
  // Sin su botón en la barra, pero la pantalla se sigue abriendo por su link (con `href: null`, expo-router 58 la
  // redirige: Mi empresa no abriría en modo jugador, ni Hoy en modo empresa para redirigir al panel).
  const only = (show: boolean) => (show ? {} : { tabBarButton: () => null, tabBarItemStyle: { display: 'none' as const } });
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.muted,
        // Alto con la zona segura de abajo (la barra del iPhone) y aire para las etiquetas.
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.line, height: 58 + insets.bottom, paddingTop: 6, paddingBottom: insets.bottom + 6 },
        tabBarLabelStyle: { fontFamily: font.semibold, fontSize: 11.5 },
        sceneStyle: { backgroundColor: c.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Hoy', tabBarIcon: ({ color, size }) => <House color={color} size={size} />, ...only(!business) }} />
      <Tabs.Screen name="empresa" options={{ title: 'Mi empresa', tabBarIcon: ({ color, size }) => <Building2 color={color} size={size} />, ...only(business) }} />
      <Tabs.Screen name="social" options={{ title: 'Social', tabBarIcon: ({ color, size }) => <MessagesSquare color={color} size={size} /> }} />
      <Tabs.Screen name="ligas" options={{ title: 'Ligas', tabBarIcon: ({ color, size }) => <Trophy color={color} size={size} />, ...only(!business) }} />
      <Tabs.Screen name="yo" options={{ title: 'Yo', tabBarIcon: ({ color, size }) => <UserRound color={color} size={size} /> }} />
    </Tabs>
  );
}
