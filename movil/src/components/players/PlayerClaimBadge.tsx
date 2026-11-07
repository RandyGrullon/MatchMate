import { router } from 'expo-router';
import { Pressable } from 'react-native';
import { Clock } from 'lucide-react-native';
import { useLeagueClaims } from '@mm/lib/data/claims';
import { useLeagueCtx } from '@mm/lib/league';
import { pendingFor } from '@mm/components/claims/logic';
import { Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font, radius } from '@/theme/tokens';

/**
 * Marca «Reclamo pendiente» en la lista de jugadores del admin (PlayerClaimBadge de la web): alguien con cuenta dice
 * que es este jugador. Lleva a Organizar › Reclamos (en la web: la app todavía no lo tiene). Nada si no hay pedido
 * pendiente o quien mira no es admin.
 */
export function PlayerClaimBadge({ playerId }: { playerId: string }) {
  const c = useColors();
  const { lid, isAdmin } = useLeagueCtx();
  const claims = useLeagueClaims(isAdmin ? lid : null);
  const claim = pendingFor(claims.data, playerId);
  if (!claim) return null;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel="Reclamo pendiente"
      accessibilityHint={`${claim.claimantName} dice que es ${claim.playerName}`}
      hitSlop={6}
      onPress={() => router.push(`/l/${lid}/reclamos` as never)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        borderRadius: radius.pill,
        paddingHorizontal: 10,
        paddingVertical: 3,
        backgroundColor: c.warnSoft,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Clock size={12} color={c.warn} />
      <Txt style={{ color: c.warn, fontFamily: font.semibold, fontSize: 12 }}>Reclamo pendiente</Txt>
    </Pressable>
  );
}
