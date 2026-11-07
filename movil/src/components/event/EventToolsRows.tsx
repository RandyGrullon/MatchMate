import { View } from 'react-native';
import { router } from 'expo-router';
import { Rows3, Table2 } from 'lucide-react-native';
import { Divider, ListRow, RowIcon } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { EventTeamsRow } from './EventTeamsRow';

/**
 * Las pestañas de quien organiza o anota un evento de boliche en la web (EventPage: Equipos, Pistas y Planilla) como
 * filas del evento en la app, en el orden de la web: en un torneo, Equipos (solo el admin) · Pistas · Planilla; en una
 * práctica, Planilla · Pistas. Abren `/l/<liga>/e/<evento>/equipos`, `…/pistas` y `…/planilla`. Quien la pone revisa
 * que pueda anotar el evento (canScoreEvent). Va dentro de una Card sin relleno.
 */
export function EventToolsRows({ lid, eventId, torneo, admin }: { lid: string; eventId: string; torneo: boolean; admin: boolean }) {
  const c = useColors();
  const planilla = (
    <ListRow
      key="planilla"
      icon={
        <RowIcon>
          <Table2 size={20} color={c.accent} />
        </RowIcon>
      }
      title="Planilla"
      onPress={() => router.push({ pathname: '/l/[lid]/e/[eventId]/planilla', params: { lid, eventId } })}
    />
  );
  const pistas = (
    <ListRow
      key="pistas"
      icon={
        <RowIcon>
          <Rows3 size={20} color={c.accent} />
        </RowIcon>
      }
      title="Pistas"
      onPress={() => router.push({ pathname: '/l/[lid]/e/[eventId]/pistas', params: { lid, eventId } })}
    />
  );
  const rows = torneo ? [...(admin ? [<EventTeamsRow key="equipos" lid={lid} eventId={eventId} />] : []), pistas, planilla] : [planilla, pistas];
  return (
    <>
      {rows.map((r, i) => (
        <View key={r.key}>
          {i > 0 && <Divider inset={68} />}
          {r}
        </View>
      ))}
    </>
  );
}
