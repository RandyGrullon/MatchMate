import { router, usePathname } from 'expo-router';
import { SearchX } from 'lucide-react-native';
import { Button, Empty, Screen } from '@/components/ui';
import { useColors } from '@/theme/theme';

/** Una dirección que la app no tiene (un link viejo o mal copiado): lo dice y lleva a Hoy, como la web. */
export default function NotFound() {
  const c = useColors();
  const path = usePathname();
  return (
    <Screen>
      <Empty
        icon={<SearchX size={28} color={c.accent} />}
        title="Esta página no existe"
        text={`No encontramos ${path}. Puede que el link esté incompleto o que la página se haya movido.`}
        action={
          <Button variant="primary" onPress={() => router.replace('/')}>
            Ir a Hoy
          </Button>
        }
      />
    </Screen>
  );
}
