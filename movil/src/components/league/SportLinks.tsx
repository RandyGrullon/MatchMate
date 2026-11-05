import { View } from 'react-native';
import { router } from 'expo-router';
import { ListOrdered, Swords, UserRound } from 'lucide-react-native';
import { Card, Divider, ListRow, RowIcon } from '../ui';
import { useColors } from '@/theme/theme';

/** Las pestañas de la liga de la web (Partidos, Tabla, Mis partidos) como filas, arriba del inicio de la liga. */
export function SportLinks({ lid, mine, mineLabel = 'Mis partidos' }: { lid: string; mine: boolean; mineLabel?: string }) {
  const c = useColors();
  const rows = [
    { key: 'partidos', title: 'Partidos', icon: Swords, go: () => router.push({ pathname: '/l/[lid]/partidos', params: { lid } }) },
    { key: 'tabla', title: 'Tabla', icon: ListOrdered, go: () => router.push({ pathname: '/l/[lid]/tabla', params: { lid } }) },
    ...(mine ? [{ key: 'mios', title: mineLabel, icon: UserRound, go: () => router.push({ pathname: '/l/[lid]/partidos', params: { lid, ver: 'mios' } }) }] : []),
  ];
  return (
    <Card padded={false} style={{ marginBottom: 24 }}>
      {rows.map((r, i) => {
        const Icon = r.icon;
        return (
          <View key={r.key}>
            {i > 0 && <Divider inset={68} />}
            <ListRow
              icon={
                <RowIcon>
                  <Icon size={20} color={c.accent} />
                </RowIcon>
              }
              title={r.title}
              onPress={r.go}
            />
          </View>
        );
      })}
    </Card>
  );
}
