import { useLocalSearchParams } from 'expo-router';
import { ScoreEditor } from '@/components/bowling/ScoreEditor';
import { Loading } from '@/components/ui';
import { useMyGames } from '@/lib/useMyGames';

/** Anotar el juego N de «Tus juegos» (src/components/bowling/ScoreEditor.tsx). */
export default function ScoreScreen() {
  const { lid, eventId, juego } = useLocalSearchParams<{ lid: string; eventId: string; juego: string }>();
  const g = useMyGames(lid, eventId);
  const index = Math.max(0, (Number(juego) || 1) - 1);
  if (!g.event.data || !g.playerId || !g.place) return <Loading label="Abriendo el juego" />;
  return <ScoreEditor lid={lid} eventId={eventId} index={index} playerId={g.playerId} place={g.place} />;
}
