import { View } from 'react-native';
import { router } from 'expo-router';
import { LogIn, UserPlus } from 'lucide-react-native';
import { Button, Empty } from '@/components/ui';
import { useColors } from '@/theme/theme';

/**
 * Yo sin cuenta (ProfilePage de la web): «Tu perfil de jugador» con Entrar y Crear cuenta; al entrar vuelve a `next`
 * (Yo o la parte que se abrió).
 */
export function YoSignedOut({ next }: { next: string }) {
  const c = useColors();
  return (
    <Empty
      icon={<UserPlus size={32} color={c.accent} />}
      title="Tu perfil de jugador"
      text="Entra para ver tus juegos, tus seguidores y tus estadísticas de todas tus ligas juntas."
      action={
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 8 }}>
          <Button variant="secondary" icon={<LogIn size={16} color={c.fg} />} onPress={() => router.push({ pathname: '/login', params: { next } })}>
            Entrar
          </Button>
          <Button variant="primary" icon={<UserPlus size={16} color={c.accentFg} />} onPress={() => router.push({ pathname: '/login', params: { modo: 'registro', next } })}>
            Crear cuenta
          </Button>
        </View>
      }
    />
  );
}
