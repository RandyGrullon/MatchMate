import { router } from 'expo-router';
import { Shield } from 'lucide-react-native';
import { ListRow, RowIcon } from '@/components/ui';
import { useColors } from '@/theme/theme';

/**
 * La pestaña «Equipos» del torneo de la web (EventPage: solo quien lo organiza, y solo en un torneo) como una fila del
 * evento en la app: abre Torneo › Equipos (`/l/<liga>/e/<evento>/equipos`). Quien la pone revisa que sea admin y torneo.
 */
export function EventTeamsRow({ lid, eventId }: { lid: string; eventId: string }) {
  const c = useColors();
  return (
    <ListRow
      icon={
        <RowIcon>
          <Shield size={20} color={c.accent} />
        </RowIcon>
      }
      title="Equipos"
      onPress={() => router.push({ pathname: '/l/[lid]/e/[eventId]/equipos', params: { lid, eventId } })}
    />
  );
}
