import { View } from 'react-native';
import { Columns3 } from 'lucide-react-native';
import { usePlayers } from '@mm/lib/data';
import { useEventLanes } from '@mm/lib/data/lanes';
import { laneOf, lanesPublished, myLaneText } from '@mm/lib/lanes';
import { Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/** «Tu pista: 7 · con Ana y Luis» (LaneChip de la web), cuando el admin ya publicó las pistas. */
export function LaneChip({ lid, eventId, playerId }: { lid: string; eventId: string; playerId: string | null }) {
  const c = useColors();
  const lanes = useEventLanes(playerId ? lid : null, eventId);
  const players = usePlayers(lanes.data.length ? lid : undefined);
  const info = myLaneText(lanes.data, playerId, (id) => players.data.find((p) => p.id === id)?.name);
  if (!info) return null;
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`Tu pista: ${info.lane}${info.mates ? `, ${info.mates}` : ''}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', height: 32, borderRadius: 16, paddingHorizontal: 13, backgroundColor: c.surface, maxWidth: '100%' }}
    >
      <Columns3 size={16} color={c.accent} />
      <Txt style={{ fontFamily: font.semibold, fontSize: 14 }}>{`Tu pista: ${info.lane}`}</Txt>
      {!!info.mates && (
        <Txt tone="muted" numberOfLines={1} style={{ fontSize: 14, flexShrink: 1 }}>
          {`· ${info.mates}`}
        </Txt>
      )}
    </View>
  );
}

/** La pista del jugador en ese evento (publicada), o null (useMyLaneNumber de la web). */
export function useMyLane(lid: string, eventId: string | null, playerId: string | null): number | null {
  const lanes = useEventLanes(playerId && eventId ? lid : null, eventId);
  const mine = laneOf(lanes.data, playerId);
  return eventId && mine && lanesPublished(lanes.data) ? mine.lane : null;
}
