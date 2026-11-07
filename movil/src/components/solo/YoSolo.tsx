import { router } from 'expo-router';
import { Target } from 'lucide-react-native';
import { sportMeta } from '@mm/sports/registry';
import { Card, ListRow, RowIcon } from '@/components/ui';
import { useColors } from '@/theme/theme';

/**
 * Los juegos sueltos en Yo, como ProfilePage de la web: «Anotar un juego suelto · Solo para ti, sin liga» en las filas de
 * Yo (abre la hoja en /juegos-sueltos) y «Juegos sueltos» arriba de Yo › Mis juegos (la lista).
 */

/** Yo › «Anotar un juego suelto» (sale a quien ve los números del boliche; va dentro de la tarjeta de las filas). */
export function SoloEntryRow() {
  const c = useColors();
  return (
    <ListRow
      icon={
        <RowIcon>
          <Target size={20} color={c.accent} />
        </RowIcon>
      }
      title="Anotar un juego suelto"
      subtitle="Solo para ti, sin liga"
      onPress={() => router.push({ pathname: '/juegos-sueltos', params: { nuevo: '1' } })}
    />
  );
}

/** Yo › Mis juegos: arriba, los juegos sueltos (los de fuera de una liga, y anotar uno). */
export function SoloGamesRow() {
  const c = useColors();
  const Icon = sportMeta('bowling')?.icon;
  return (
    <Card padded={false}>
      <ListRow
        icon={<RowIcon>{Icon ? <Icon size={20} color={c.accent} /> : null}</RowIcon>}
        title="Juegos sueltos"
        subtitle="Boliche sin liga ni torneo: anota los tuyos"
        onPress={() => router.push('/juegos-sueltos')}
      />
    </Card>
  );
}
