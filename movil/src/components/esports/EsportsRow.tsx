import { router } from 'expo-router';
import { Gamepad2 } from 'lucide-react-native';
import { useEsportsPresence } from '@mm/components/home/esportsPresence';
import { useActiveSport } from '@mm/lib/sportContext';
import type { GameId } from '@mm/sports/esports';
import { Card, ListRow, RowIcon } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { GameMark } from './bits';

/**
 * La fila que lleva a Esports (`/esports`, EsportsRowCard de la web): el monograma del juego si todo lo tuyo es de uno
 * solo; si no, el control.
 */
export function EsportsRowCard({ title, subtitle, game }: { title: string; subtitle: string; game?: GameId | null }) {
  const c = useColors();
  return (
    <Card padded={false}>
      <ListRow
        icon={
          game ? (
            <GameMark game={game} decorative />
          ) : (
            <RowIcon>
              <Gamepad2 size={20} color={c.accent} />
            </RowIcon>
          )
        }
        title={title}
        subtitle={subtitle}
        onPress={() => router.push('/esports' as never)}
      />
    </Card>
  );
}

/** «Esports · Tus equipos y torneos» en Hoy: con el deporte activo en esports, o si la cuenta tiene equipos o inscripciones. */
export function EsportsHomeRow({ uid }: { uid: string | null | undefined }) {
  const active = useActiveSport();
  const esports = useEsportsPresence(uid, active);
  if (!esports.show) return null;
  return <EsportsRowCard title="Esports" subtitle="Tus equipos y torneos" game={esports.game} />;
}

/** «Torneos de esports» en Ligas: sin filtro, si la cuenta juega esports (sus ligas, el deporte activo, sus equipos). */
export function EsportsLeaguesRow({ uid, mySports }: { uid: string | null | undefined; mySports: readonly string[] }) {
  const active = useActiveSport();
  const esports = useEsportsPresence(uid, active);
  if (!uid || !(mySports.includes('esports') || esports.show)) return null;
  return <EsportsRowCard title="Torneos de esports" subtitle="Torneos y equipos por juego" game={esports.game} />;
}
