import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Lock } from 'lucide-react-native';
import { relativeTime, type Notice, type NoticeGroup, type NoticeKind, type SocialIcon } from '@mm/lib/notifications';
import { noticeLook } from '@mm/components/notifications/noticeLook';
import { sportMeta } from '@mm/sports/registry';
import { Card, Txt } from '@/components/ui';
import { openLink } from '@/lib/links';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/** El cuadrito de color con el ícono del aviso (el mismo mapa de la web: noticeLook). */
export function NoticeIcon({ kind, icon }: { kind: NoticeKind; icon?: SocialIcon }) {
  const c = useColors();
  const look = noticeLook(kind, icon);
  const Icon = look.icon;
  const bg = { accent: c.accentSoft, warn: c.warnSoft, ok: c.okSoft, danger: c.dangerSoft }[look.tone];
  return (
    <View style={[styles.icon, { backgroundColor: bg }]}>
      <Icon size={20} color={c[look.tone]} />
    </View>
  );
}

/**
 * Un aviso (NoticeRow de la web): ícono, qué pasó, el detalle, cuándo, la liga (y su deporte) y el punto si está sin
 * leer. Tocarlo lo marca leído y abre lo suyo (en la app si la tiene, si no en la web).
 */
export function NoticeRow({
  notice: n,
  now,
  unread,
  showSport,
  onOpen,
}: {
  notice: Notice;
  now: number;
  unread: boolean;
  showSport: boolean;
  onOpen: (n: Notice) => void;
}) {
  const c = useColors();
  const sport = showSport && n.sport ? n.sport : null;
  const SportIcon = sport ? sportMeta(sport)?.icon : null;
  // Sin liga (p. ej. «X te empezó a seguir») y con deporte: el nombre del deporte.
  const place = n.leagueName || (sport ? (sportMeta(sport)?.short ?? '') : '');
  const when = relativeTime(n.time, now);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[unread ? 'Sin leer' : null, n.title, n.body, place, when].filter(Boolean).join('. ')}
      onPress={() => {
        onOpen(n);
        openLink(n.to);
      }}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.surface2 : unread ? `${c.accentSoft}88` : 'transparent' }]}
    >
      <NoticeIcon kind={n.kind} icon={n.icon} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <Txt variant={unread ? 'bodyStrong' : 'body'} style={{ flex: 1 }}>
            {n.title}
          </Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 3 }}>
            <Txt variant="meta" tone="muted" style={{ fontSize: 12 }}>
              {when}
            </Txt>
            {unread && <View style={[styles.dot, { backgroundColor: c.accent }]} />}
          </View>
        </View>
        {!!n.body && (
          <Txt variant="meta" tone="muted" numberOfLines={2}>
            {n.body}
          </Txt>
        )}
        {!!place && (
          <View style={[styles.place, { backgroundColor: c.surface2 }]}>
            {SportIcon && <SportIcon size={12} color={c.muted} />}
            {!!n.lid && n.private && <Lock size={12} color={c.muted} />}
            <Txt tone="muted" numberOfLines={1} style={{ fontSize: 11, fontFamily: font.medium }}>
              {place}
            </Txt>
          </View>
        )}
      </View>
    </Pressable>
  );
}

/** Los avisos por grupos (Hoy, Esta semana, Antes), cada grupo en su tarjeta. */
export function NoticeGroups({
  groups,
  now,
  isUnread,
  showSport,
  onOpen,
}: {
  groups: readonly NoticeGroup[];
  now: number;
  isUnread: (n: Notice) => boolean;
  showSport: boolean;
  onOpen: (n: Notice) => void;
}) {
  const c = useColors();
  return (
    <View style={{ gap: 24 }}>
      {groups.map((g) => (
        <View key={g.id} style={{ gap: 10 }}>
          <Txt variant="section" accessibilityRole="header" style={{ marginHorizontal: 4 }}>
            {g.label}
          </Txt>
          <Card padded={false} style={{ overflow: 'hidden' }}>
            {g.items.map((n, i) => (
              <View key={n.id} style={i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null}>
                <NoticeRow notice={n} now={now} unread={isUnread(n)} showSport={showSport} onOpen={onOpen} />
              </View>
            ))}
          </Card>
        </View>
      ))}
    </View>
  );
}

export interface ChipItem<K extends string> {
  key: K;
  label: string;
  count?: number | null;
  icon?: ReactNode;
}

/** Filtros en píldoras que se deslizan de lado (FilterChips de la web), con cuántos sin leer tiene cada uno. */
export function Chips<K extends string>({ label, items, value, onChange }: { label: string; items: readonly ChipItem<K>[]; value: K; onChange: (k: K) => void }) {
  const c = useColors();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel={label} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
      {items.map((it) => {
        const on = it.key === value;
        return (
          <Pressable
            key={it.key}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={it.count ? `${it.label}, ${it.count} sin leer` : it.label}
            onPress={() => onChange(it.key)}
            style={[styles.chip, { backgroundColor: on ? c.accent : c.surface2 }]}
          >
            {it.icon}
            <Txt style={{ color: on ? c.accentFg : c.fg, fontFamily: font.semibold, fontSize: 14 }}>{it.label}</Txt>
            {!!it.count && (
              <View style={[styles.count, { backgroundColor: on ? c.accentFg : c.accent }]}>
                <Txt style={{ color: on ? c.accent : c.accentFg, fontFamily: font.bold, fontSize: 11 }}>{it.count > 9 ? '9+' : it.count}</Txt>
              </View>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 14, paddingLeft: 18, paddingRight: 16 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  place: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4, maxWidth: '100%' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, borderRadius: 18, paddingHorizontal: 14 },
  count: { minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
});
