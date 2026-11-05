import { Globe } from 'lucide-react-native';
import { Button, Empty } from '../ui';
import { openOnWeb } from '@/lib/web';
import { useColors } from '@/theme/theme';

/** Un partido de un deporte que la app todavía no tiene: «Abrir en la web». */
export function OnWeb({ lid, matchId }: { lid: string; matchId: string }) {
  const c = useColors();
  return (
    <Empty
      title="Partido"
      action={
        <Button icon={<Globe size={18} color={c.fg} />} onPress={() => openOnWeb(`/l/${lid}/juegos?partido=${matchId}`)}>
          Abrir en la web
        </Button>
      }
    />
  );
}
