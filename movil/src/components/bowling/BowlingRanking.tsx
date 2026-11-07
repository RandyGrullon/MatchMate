import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Medal } from 'lucide-react-native';
import { useEntriesOfEvents, useEvents, usePlayers } from '@mm/lib/data';
import { useIsPro } from '@mm/lib/useMode';
import { useLeagueSeasons } from '@mm/lib/data/seasons';
import { rankingRows, readBowlingSnapshot, seasonEvents } from '@mm/lib/bowlingSeason';
import { pickSeason } from '@mm/lib/seasons';
import { MIN_RANK_GAMES, rank } from '@mm/lib/stats';
import { METRICS, eligibleFor, metricDef, metricOf, myPlace, placeCopy, seasonRangeLabel, type Metric } from '@mm/components/ranking/logic';
import { TitleMark, useCurrentTitle } from '@/components/badges/LeagueBadges';
import { initials } from '@/components/social/Avatar';
import { BackBar, Card, LoadError, Loading, RowIcon, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { RankingPro } from './RankingPro';
import { SeasonAwardsCard } from './SeasonExtras';
import { TuTag } from './StandingsTable';

/**
 * La tabla del boliche (RankingPage de la web) con su «‹ Liga» arriba: en Pro, la tabla completa (RankingPro, con Excel
 * y compartir); en Lite, la de abajo. Va dentro de LeagueScope (lo de Pro lee la liga de ahí).
 */
export function BowlingRanking({
  lid,
  myPlayerId,
  initialSeasonId,
  initialSort,
  initialHcp,
  backLabel,
  backFallback,
}: {
  lid: string;
  myPlayerId: string | null;
  initialSeasonId?: string | null;
  /** `?ver=` y `?hcp=1` de la dirección (lo de Pro). */
  initialSort?: string | null;
  initialHcp?: boolean;
  backLabel: string;
  backFallback: string;
}) {
  const pro = useIsPro();
  if (pro) return <RankingPro backLabel={backLabel} backFallback={backFallback} initialSeasonId={initialSeasonId} initialSort={initialSort} initialHcp={initialHcp} />;
  return (
    <>
      <BackBar label={backLabel} fallback={backFallback} />
      <LiteRanking lid={lid} myPlayerId={myPlayerId} initialSeasonId={initialSeasonId} initialMetric={initialSort} />
    </>
  );
}

/**
 * La tabla del boliche en Lite (Lite de RankingPage de la web): «Tabla» con la métrica (Promedio, Mejor juego, Mejor
 * serie, Asistencia; `?ver=`), la temporada con sus fechas (la de `?temporada=`, que ponen Temporadas y los links; si no,
 * la de ahora), los premios de una temporada cerrada, tu lugar («Vas 2.º de 6, con 195…» con su barra, o cuántos juegos
 * te faltan) y la lista: el puesto, las iniciales, el nombre con «Tú» y el escudo del título vigente, y el número. Solo
 * cuentan los juegos aprobados. La lógica es la de la web (src/lib/bowlingSeason.ts y src/components/ranking/logic.ts).
 */
function LiteRanking({ lid, myPlayerId, initialSeasonId, initialMetric }: { lid: string; myPlayerId: string | null; initialSeasonId?: string | null; initialMetric?: string | null }) {
  const c = useColors();
  const events = useEvents(lid);
  const players = usePlayers(lid);
  const seasons = useLeagueSeasons(lid);
  const [metric, setMetric] = useState<Metric>(metricOf(initialMetric));
  // El campeón de la última temporada cerrada lleva el escudo «Título vigente».
  const title = useCurrentTitle();
  const season = pickSeason(seasons.data, initialSeasonId ?? null);
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
        <Txt variant="meta" tone="muted">
          {`${season.name} · ${seasonRangeLabel(season)}`}
        </Txt>
      )}

      {/* Una temporada cerrada: su campeón y sus premios. */}
      {closed && season && <SeasonAwardsCard season={season} />}

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
                    <Txt style={{ width: 18, textAlign: 'center', fontFamily: font.semibold, fontSize: 15, color: c.muted, fontVariant: ['tabular-nums'] }}>{pos}</Txt>
                    <View style={[styles.initials, { backgroundColor: isMe ? c.accent : c.surface2 }]}>
                      <Txt style={{ fontSize: 14, fontFamily: font.semibold, color: isMe ? c.accentFg : c.fg2 }}>{initials(row.name)}</Txt>
                    </View>
                    <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Txt variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                        {row.name}
                      </Txt>
                      {isMe && <TuTag />}
                      <TitleMark title={title} playerId={row.playerId} />
                    </View>
                    <Txt style={{ fontFamily: font.bold, fontSize: 22, lineHeight: 25, letterSpacing: -0.44, fontVariant: ['tabular-nums'] }}>{def.value(row)}</Txt>
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
  initials: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
