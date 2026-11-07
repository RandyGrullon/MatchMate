/**
 * Lo de abajo de la Tabla de Pro (SeasonExtras.tsx y SeasonAwardsCard de SeasonSelect.tsx de la web): los premios de
 * una temporada cerrada, «Récords de la temporada» (mejor juego, mejor serie y asistencia, con quién los tiene) y «Más
 * mejorado» (promedio de esta temporada contra la anterior). La lógica es la de la web (ranking/logic.ts,
 * season/awardOrder.ts).
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Award, Trophy } from 'lucide-react-native';
import type { Improvement } from '@mm/lib/bowlingSeason';
import { formatDate } from '@mm/lib/format';
import type { Season } from '@mm/lib/seasons';
import { MIN_RANK_GAMES, rank } from '@mm/lib/stats';
import type { SeasonRecords } from '@mm/components/ranking/logic';
import { sortedAwards } from '@mm/components/season/awardOrder';
import { initials } from '@/components/social/Avatar';
import { Card, SectionHeader, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/** Premios de una temporada cerrada (campeón arriba) con la fecha del cierre. */
export function SeasonAwardsCard({ season }: { season: Season }) {
  const c = useColors();
  if (season.status !== 'closed') return null;
  const { champion, rest } = sortedAwards(season.awards);
  return (
    <Card padded={false} style={{ padding: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={[styles.trophy, { backgroundColor: c.accentSoft }]}>
          <Trophy size={20} color={c.accent} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt tone="muted" style={{ fontSize: 12 }}>{`${season.name} · terminó${season.endsOn ? ` el ${formatDate(season.endsOn)}` : ''}`}</Txt>
          <Txt variant="bodyStrong" numberOfLines={1}>
            {champion ? `Campeón: ${champion.name}` : 'Temporada cerrada'}
          </Txt>
        </View>
      </View>
      {rest.length > 0 && (
        <View style={{ gap: 6 }}>
          {rest.map((a) => (
            <View key={a.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <Award size={16} color={c.muted} style={{ marginTop: 2 }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt style={{ fontSize: 14 }}>
                  <Txt tone="muted" style={{ fontSize: 14 }}>{`${a.label}: `}</Txt>
                  <Txt style={{ fontSize: 14, fontFamily: font.medium }}>{a.name}</Txt>
                </Txt>
                {!!a.note && (
                  <Txt tone="muted" style={{ fontSize: 12 }}>
                    {a.note}
                  </Txt>
                )}
              </View>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

/** «Récords de la temporada»: mejor juego, mejor serie y asistencia, con quién los tiene. */
export function SeasonRecordsCard({ records }: { records: SeasonRecords }) {
  const c = useColors();
  const items = [
    { label: 'Mejor juego', rec: records.game },
    { label: 'Mejor serie', rec: records.series },
    { label: 'Asistencia', rec: records.attendance },
  ];
  if (!items.some((i) => i.rec)) return null;
  return (
    <View>
      <SectionHeader title="Récords de la temporada" />
      <Card padded={false} style={{ flexDirection: 'row', paddingVertical: 14 }}>
        {items.map(({ label, rec }, i) => (
          <View
            key={label}
            accessible
            accessibilityLabel={`${label}: ${rec ? `${rec.value}, ${rec.who}` : 'sin récord'}`}
            style={[{ flex: 1, minWidth: 0, paddingHorizontal: 14 }, i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: c.line }]}
          >
            <Txt tone="muted" style={{ fontSize: 12, lineHeight: 17, fontFamily: font.medium }}>
              {label}
            </Txt>
            <Txt style={{ marginTop: 4, fontSize: 24, lineHeight: 28, fontFamily: font.semibold, fontVariant: ['tabular-nums'] }}>{rec?.value ?? '–'}</Txt>
            <Txt tone="fg2" numberOfLines={1} style={{ fontSize: 13, lineHeight: 18 }}>
              {rec?.who ?? ''}
            </Txt>
          </View>
        ))}
      </Card>
    </View>
  );
}

/** Cuántos se ven en «Más mejorado». */
const IMPROVED_SHOWN = 5;

/** «Más mejorado»: promedio de esta temporada contra el de la anterior (con el mínimo de juegos en las dos). */
export function MostImprovedCard({
  lid,
  list,
  season,
  previous,
  myPlayerId,
}: {
  lid: string;
  list: readonly (Improvement & { name: string })[];
  season: Pick<Season, 'name'>;
  previous: Pick<Season, 'name'>;
  myPlayerId?: string | null;
}) {
  const c = useColors();
  const ranked = rank(list.slice(0, IMPROVED_SHOWN), (r) => r.delta);
  return (
    <View>
      <SectionHeader title="Más mejorado" />
      <Card padded={false}>
        {ranked.map(({ row, pos }, i) => {
          const isMe = !!myPlayerId && row.playerId === myPlayerId;
          return (
            <Pressable
              key={row.playerId}
              accessibilityRole="button"
              accessibilityLabel={`${pos}. ${row.name}${isMe ? ' (tú)' : ''}: de ${row.previous} a ${row.current}, más ${row.delta}`}
              onPress={() => router.push({ pathname: '/l/[lid]/j/[playerId]', params: { lid, playerId: row.playerId } })}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: pressed ? c.surface2 : isMe ? c.accentSoft : 'transparent' },
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
              ]}
            >
              <Txt style={{ width: 18, textAlign: 'center', fontSize: 15, fontFamily: font.semibold, color: c.muted, fontVariant: ['tabular-nums'] }}>{pos}</Txt>
              <View style={[styles.initials, { backgroundColor: isMe ? c.accent : c.surface2 }]}>
                <Txt style={{ fontSize: 14, fontFamily: font.semibold, color: isMe ? c.accentFg : c.fg2 }}>{initials(row.name)}</Txt>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt variant="bodyStrong" numberOfLines={1}>
                  {row.name}
                </Txt>
                <Txt variant="meta" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>{`${row.previous} → ${row.current}`}</Txt>
              </View>
              <Txt style={{ fontSize: 20, fontFamily: font.bold, color: c.ok, fontVariant: ['tabular-nums'] }}>{`+${row.delta}`}</Txt>
            </Pressable>
          );
        })}
      </Card>
      <Txt tone="muted" style={{ fontSize: 12.5, lineHeight: 17, marginTop: 10, marginHorizontal: 4 }}>
        {`Promedio de ${season.name} contra ${previous.name}, con al menos ${MIN_RANK_GAMES} juegos aprobados en las dos.`}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  trophy: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 16, paddingVertical: 8 },
  initials: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
