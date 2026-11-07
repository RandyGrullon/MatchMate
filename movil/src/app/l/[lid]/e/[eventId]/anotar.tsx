import { useLocalSearchParams } from 'expo-router';
import { RowScoreEditor } from '@/components/bowling/RowScoreEditor';
import { ScoreEditor } from '@/components/bowling/ScoreEditor';
import { LeagueScope } from '@/components/league/LeagueScope';
import { Loading } from '@/components/ui';
import { useMyGames } from '@/lib/useMyGames';

/**
 * Anotar el juego N: el tuyo de «Tus juegos» (src/components/bowling/ScoreEditor.tsx) o, con `fila=<participación>`, el
 * de otro desde la Planilla (quien organiza o anota: RowScoreEditor).
 */
export default function ScoreScreen() {
  const { lid, eventId, juego, fila } = useLocalSearchParams<{ lid: string; eventId: string; juego: string; fila?: string }>();
  const index = Math.max(0, (Number(juego) || 1) - 1);
  if (fila) {
    return (
      <LeagueScope lid={lid}>
        <RowScoreEditor eventId={eventId} entryId={fila} game={index} />
      </LeagueScope>
    );
  }
  return <MyScore lid={lid} eventId={eventId} index={index} />;
}

function MyScore({ lid, eventId, index }: { lid: string; eventId: string; index: number }) {
  const g = useMyGames(lid, eventId);
  if (!g.event.data || !g.playerId || !g.place) return <Loading label="Abriendo el juego" />;
  return <ScoreEditor lid={lid} eventId={eventId} index={index} playerId={g.playerId} place={g.place} />;
}
