/**
 * Las piezas chicas de los deportes de equipo en la app (TeamBits.tsx y TeamUi.tsx de la web): el punto con el color
 * del equipo, el escudo con la inicial, el dorsal en su cuadrito, el nombre con su punto, «Voy / Tal vez / No voy» como
 * insignia y el botón suave en rojo (Sacar del equipo, Borrar, «No vino»).
 */
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import type { SeasonTeam } from '@mm/lib/data/seasonTeams';
import { RSVP_LABEL, type RsvpStatus } from '@mm/lib/data/teamSports';
import { teamColor, textOn } from '@mm/pages/sports/team/logic';
import { Badge, Txt } from '../ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

type TeamLook = Pick<SeasonTeam, 'color' | 'order'> | null | undefined;

/** Punto con el color del equipo (12 px). */
export function TeamDot({ team, color, size = 12 }: { team?: TeamLook; color?: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color ?? teamColor(team), borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.12)' }} />;
}

/** Nombre del equipo con su punto (el del partido si el equipo ya no existe). */
export function TeamName({ team, label, strong }: { team?: (Pick<SeasonTeam, 'color' | 'order' | 'name'> | null) | undefined; label?: string; strong?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0, flexShrink: 1 }}>
      <TeamDot team={team} />
      <Txt variant={strong ? 'bodyStrong' : 'body'} numberOfLines={1} style={{ flexShrink: 1 }}>
        {team?.name ?? label ?? 'Por definir'}
      </Txt>
    </View>
  );
}

/** El escudo de un equipo: su color con la inicial (40 px). */
export function TeamCrest({ team, label, size = 40 }: { team?: (Pick<SeasonTeam, 'color' | 'order' | 'name'> | null) | undefined; label?: string; size?: number }) {
  const c = useColors();
  const color = teamColor(team);
  const name = team?.name ?? label ?? '';
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.line }}
    >
      <Txt style={{ color: textOn(color), fontFamily: font.bold, fontSize: Math.round(size * 0.4), lineHeight: Math.round(size * 0.5) }}>{initial}</Txt>
    </View>
  );
}

/** Dorsal en un cuadrito con el color del equipo (`lg`: 40 px, al principio de una fila de la plantilla). */
export function Jersey({ n, color, size = 'sm' }: { n: number | null | undefined; color?: string; size?: 'sm' | 'lg' }) {
  const c = useColors();
  const big = size === 'lg';
  return (
    <View
      style={{
        minWidth: big ? 40 : 28,
        height: big ? 40 : 28,
        borderRadius: big ? 12 : 8,
        paddingHorizontal: 4,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: color ?? c.surface2,
      }}
    >
      <Txt style={{ fontFamily: font.bold, fontSize: big ? 15 : 12, color: color ? textOn(color) : c.fg }}>{n ?? '–'}</Txt>
    </View>
  );
}

const RSVP_TONE: Record<RsvpStatus, 'ok' | 'warn' | 'danger'> = { yes: 'ok', maybe: 'warn', no: 'danger' };

/** Insignia de la convocatoria de un jugador («Voy», «Tal vez», «No voy» o «Sin responder»). */
export function RsvpBadge({ status, pending }: { status: RsvpStatus | null | undefined; pending?: boolean }) {
  if (!status) return <Badge tone="muted">Sin responder</Badge>;
  return <Badge tone={RSVP_TONE[status]}>{`${RSVP_LABEL[status]}${pending ? ' ·' : ''}`}</Badge>;
}

/**
 * Botón suave en rojo (Sacar del equipo, Borrar, «No vino»): el fondo rojo suave con la letra roja, 48 px; con ícono
 * solo, cuadrado.
 */
export function DangerButton({
  children,
  icon,
  loading,
  disabled,
  onPress,
  accessibilityLabel,
  full,
}: {
  children?: ReactNode;
  icon?: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  onPress: () => unknown;
  accessibilityLabel?: string;
  full?: boolean;
}) {
  const c = useColors();
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      onPress={() => void onPress()}
      style={({ pressed }) => ({
        height: 48,
        minWidth: 48,
        width: full ? '100%' : children ? undefined : 48,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingHorizontal: children ? 16 : 0,
        borderRadius: 15,
        backgroundColor: c.dangerSoft,
        opacity: off ? 0.5 : pressed ? 0.85 : 1,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}
    >
      {loading ? <ActivityIndicator size="small" color={c.danger} /> : icon}
      {children != null && (
        <Txt numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ flexShrink: 1, color: c.danger, fontFamily: font.semibold, fontSize: 16 }}>
          {children}
        </Txt>
      )}
    </Pressable>
  );
}
