import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Medal } from 'lucide-react-native';
import { useEntriesOfEvents, useEvents, usePlayers } from '@mm/lib/data';
import { useLeagueSeasons } from '@mm/lib/data/seasons';
import { rankingRows, readBowlingSnapshot, seasonEvents } from '@mm/lib/bowlingSeason';
import { pickSeason } from '@mm/lib/seasons';
import { MIN_RANK_GAMES, rank } from '@mm/lib/stats';
import { METRICS, eligibleFor, metricDef, myPlace, placeCopy, seasonRangeLabel, type Metric } from '@mm/components/ranking/logic';
import { Card, ChoiceRow, LoadError, Loading, RowIcon, Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/**
 * La tabla del boliche (Lite de RankingPage de la web): «Tabla» con la métrica (Promedio, Mejor juego, Mejor serie,
 * Asistencia), la temporada con sus fechas (se cambia tocándola), tu lugar («Vas 2.º de 6, con 195…» con su barra, o
 * cuántos juegos te faltan) y la lista con «Tú». Solo cuentan los juegos aprobados. La lógica es la de la web
 * (src/lib/bowlingSeason.ts y src/components/ranking/logic.ts). La tabla completa de Pro, en la web.
 */
export function BowlingRanking({ lid, myPlayerId }: { lid: string; myPlayerId: string | null }) {
  const c = useColors();
  const events = useEvents(lid);
  const players = usePlayers(lid);
  const seasons = useLeagueSeasons(lid);
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>('promedio');
  const [picking, setPicking] = useState(false);
  const season = pickSeason(seasons.data, seasonId);
  const seasonIds = useMemo(() => seasonEvents(events.data, season).map((e) => e.id), [events.data, season]);
  const entries = useEntriesOfEvents(lid, seasonIds);

  const rows = useMemo(() => {
    const inSeason = new Set(seasonIds);
    return rankingRows(
      entries.data.filter((e) => inSeason.has(e.eventId)),
      players.data,
    );
  }, [entries.data, players.data, seasonIds]);

  // Temporada cerrada con su tabla guardada: se ve tal como quedó al cerrarla.
  const closed = season?.status === 'closed';
  const snapshot = closed ? readBowlingSnapshot(season.standings) : null;
  const def = metricDef(metric);
  const liteRows = snapshot && (snapshot.covers as string[]).includes(metric) ? snapshot.rows : rows;
  const ranked = rank(eligibleFor(liteRows, metric), def.value);
  const place = myPlace(liteRows, myPlayerId, metric, { closed });
  const copy = place ? placeCopy(place, metric, closed) : null;
  const error = events.error ?? players.error ?? entries.error;
  const loading = events.loading || players.loading || (seasons.loading && !seasons.data.length) || (entries.loading && !entries.data.length);
  const seasonName = season?.name ?? 'la temporada';

  return (
    <View style={{ gap: 14 }}>
      <Txt variant="title" accessibilityRole="header">
        Tabla
      </Txt>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel="Ordenar la tabla por" contentContainerStyle={{ gap: 8 }}>
        {METRICS.map((m) => {
          const on = m.key === metric;
          return (
            <Pressable
              key={m.key}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => setMetric(m.key)}
              style={[styles.chip, { backgroundColor: on ? c.accent : c.surface2 }]}
            >
              <Txt style={{ fontFamily: font.semibold, fontSize: 14, color: on ? c.accentFg : c.fg }}>{m.label}</Txt>
            </Pressable>
          );
        })}
      </ScrollView>
      {season && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Temporada: ${season.name}. ${seasons.data.length > 1 ? 'Toca para cambiarla' : ''}`}
          disabled={seasons.data.length < 2}
          onPress={() => setPicking(true)}
        >
          <Txt variant="meta" tone="muted">{`${season.name} · ${seasonRangeLabel(season)}${seasons.data.length > 1 ? '  ▾' : ''}`}</Txt>
        </Pressable>
      )}

      <Sheet open={picking} onClose={() => setPicking(false)} title="Temporada">
        <Card padded={false}>
          {seasons.data.map((s) => (
            <ChoiceRow
              key={s.id}
              title={`${s.name}${s.status === 'active' ? ' (en curso)' : ''}`}
              subtitle={seasonRangeLabel(s)}
              selected={s.id === season?.id}
              onPress={() => {
                setSeasonId(s.id);
                setPicking(false);
              }}
            />
          ))}
        </Card>
      </Sheet>

      {error ? (
        <LoadError error={error} />
      ) : loading ? (
        <Loading label="Cargando la tabla" />
      ) : (
        <>
          {copy && (
            <View accessibilityLabel="Tu lugar en la tabla" style={[styles.place, { backgroundColor: c.accentSoft }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
                <Txt style={{ fontFamily: font.bold, fontSize: 48, lineHeight: 52, color: c.accent }}>{copy.big}</Txt>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt variant="bodyStrong" style={{ fontSize: 17 }}>
                    {copy.title}
                  </Txt>
                  <Txt tone="fg2" style={{ fontSize: 14.5, marginTop: 3 }}>
                    {copy.subtitle}
                  </Txt>
                </View>
              </View>
              <View style={{ marginTop: 16 }}>
                <View style={[styles.bar, { backgroundColor: `${c.accent}29` }]}>
                  <View style={{ width: `${Math.round(Math.min(1, Math.max(0, copy.bar)) * 100)}%`, height: '100%', borderRadius: 4, backgroundColor: c.accent }} />
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 7 }}>
                  <Txt tone="fg2" style={{ fontSize: 12.5 }}>
                    {copy.left}
                  </Txt>
                  {!!copy.right && (
                    <Txt tone="fg2" numberOfLines={1} style={{ fontSize: 12.5, flexShrink: 1 }}>
                      {copy.right}
                    </Txt>
                  )}
                </View>
              </View>
            </View>
          )}
          {ranked.length > 0 ? (
            <Card padded={false} style={{ overflow: 'hidden' }}>
              {ranked.map(({ row, pos }, i) => {
                const isMe = !!myPlayerId && row.playerId === myPlayerId;
                return (
                  <Pressable
                    key={row.playerId || row.name}
                    accessibilityRole={row.playerId ? 'button' : undefined}
                    accessibilityLabel={`${pos}. ${row.name}${isMe ? ' (tú)' : ''}: ${def.value(row)}`}
                    disabled={!row.playerId}
                    onPress={() => router.push({ pathname: '/l/[lid]/j/[playerId]', params: { lid, playerId: row.playerId } })}
                    style={({ pressed }) => [
                      styles.row,
                      { backgroundColor: pressed ? c.surface2 : isMe ? c.accentSoft : 'transparent' },
                      i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null,
                    ]}
                  >
                    <Txt style={{ width: 24, textAlign: 'center', fontFamily: font.bold, color: isMe ? c.accent : c.muted }}>{pos}</Txt>
                    <Txt variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
                      {row.name}
                      {isMe ? <Txt tone="accent" style={{ fontSize: 13 }}>{'  Tú'}</Txt> : null}
                    </Txt>
                    <Txt style={{ fontFamily: font.bold, fontSize: 20, fontVariant: ['tabular-nums'] }}>{def.value(row)}</Txt>
                  </Pressable>
                );
              })}
            </Card>
          ) : (
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <RowIcon>
                <Medal size={20} color={c.accent} />
              </RowIcon>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt variant="bodyStrong">Todavía no sale nadie</Txt>
                <Txt variant="meta" tone="muted">
                  {metric === 'promedio' ? `Hace falta tener al menos ${MIN_RANK_GAMES} juegos aprobados en ${seasonName}.` : 'Aún no hay juegos aprobados.'}
                </Txt>
              </View>
            </Card>
          )}
          <Txt tone="muted" style={{ textAlign: 'center', fontSize: 13 }}>
            {metric === 'promedio' ? `Cuentan los juegos aprobados · mínimo ${MIN_RANK_GAMES} para salir` : 'Cuentan los juegos aprobados'}
          </Txt>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { height: 36, borderRadius: 18, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  place: { borderRadius: 24, paddingHorizontal: 22, paddingVertical: 20 },
  bar: { height: 8, borderRadius: 4, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 16, paddingVertical: 10 },
});
