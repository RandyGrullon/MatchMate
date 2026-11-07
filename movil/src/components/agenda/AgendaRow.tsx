import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Check } from 'lucide-react-native';
import type { AgendaItem } from '@mm/lib/data/agenda';
import { agendaLine, agendaTitle, mineLabel } from '@mm/components/agenda/logic';
import { DateBlock } from '@/components/DateBlock';
import { Txt } from '@/components/ui';
import { openLink } from '@/lib/links';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { SportCorner } from './SportMark';

/**
 * Una fecha abierta (AgendaRow de src/pages/AgendaPage.tsx): el bloque de la fecha (OCT / 13) con el deporte en su
 * esquina, qué es (en dos líneas si no cabe), «Sábado · 7:00 pm · la liga · cuántos lugares» y «Me apunto» al lado (o
 * cómo quedó: «Vas», «En espera»…). Toda la fila abre el evento.
 */
export function AgendaRow({
  item,
  today,
  busy,
  joined,
  onJoin,
  first,
  dense,
}: {
  item: AgendaItem;
  today: string;
  busy?: boolean;
  /** Se acaba de apuntar aquí: cómo quedó («Vas», «En espera»…). */
  joined?: string | null;
  onJoin: () => void;
  /** La primera de la tarjeta (sin la raya de arriba). */
  first?: boolean;
  /** Pro: la fila más baja (min-h-row-pro de la web). */
  dense?: boolean;
}) {
  const c = useColors();
  const mine = joined ?? (item.mine ? mineLabel(item) : null);
  const title = agendaTitle(item);
  const line = agendaLine(item, today);
  return (
    <View style={[styles.row, dense && styles.dense, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${item.leagueName}`}
        accessibilityHint={line}
        onPress={() => openLink(item.url)}
        style={({ pressed }) => [{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.7 : 1 }]}
      >
        <SportCorner sport={item.sport}>
          <DateBlock date={item.date} />
        </SportCorner>
        <View style={{ flex: 1, minWidth: 0 }}>
          {/* En 360 px el botón deja poco ancho: el nombre baja a dos líneas en vez de cortarse. */}
          <Txt variant="bodyStrong" numberOfLines={2}>
            {title}
          </Txt>
          <Txt variant="meta" tone="muted" numberOfLines={3}>
            {line}
          </Txt>
        </View>
      </Pressable>
      {mine ? (
        <View style={[styles.pill, { backgroundColor: c.accentSoft }]}>
          <Check size={16} color={c.accent} strokeWidth={2.6} />
          <Txt style={{ fontSize: 14, fontFamily: font.semibold, color: c.accent }}>{mine}</Txt>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Me apunto a ${title}`}
          accessibilityState={{ busy: !!busy, disabled: !!busy }}
          disabled={busy}
          hitSlop={6}
          onPress={onJoin}
          style={({ pressed }) => [styles.join, { backgroundColor: c.accent, opacity: busy ? 0.8 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] }]}
        >
          <Txt style={{ fontSize: 14, fontFamily: font.semibold, color: busy ? 'transparent' : c.accentFg }}>Me apunto</Txt>
          {busy && <ActivityIndicator size="small" color={c.accentFg} style={StyleSheet.absoluteFill} />}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72, paddingHorizontal: 16, paddingVertical: 12 },
  dense: { minHeight: 64, paddingVertical: 9 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 36, borderRadius: 18, paddingHorizontal: 12 },
  join: { height: 36, borderRadius: 18, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
});
