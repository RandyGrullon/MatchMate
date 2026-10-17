import { MessagesSquare } from 'lucide-react-native';
import { Button, Empty, Screen, Txt } from '@/components/ui';
import { openOnWeb } from '@/lib/web';
import { useColors } from '@/theme/theme';

/** Social (publicaciones, seguir, comentarios): llega a la app en su fase; mientras, la de la web. */
export default function SocialScreen() {
  const c = useColors();
  return (
    <Screen>
      <Txt variant="title">Social</Txt>
      <Empty
        icon={<MessagesSquare size={28} color={c.accent} />}
        title="Lo social llega pronto a la app"
        text="Publicaciones, seguir a tus compañeros y comentar sus juegos. Mientras, está en la web."
        action={
          <Button variant="primary" onPress={() => openOnWeb('/social')}>
            Abrir Social en la web
          </Button>
        }
      />
    </Screen>
  );
}
