import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { BarChart3 } from 'lucide-react-native';
import { invalidate } from '@mm/lib/data/client';
import { peopleTags } from '@mm/lib/data/follows';
import { useProfileStats, type ProfileStats } from '@mm/lib/data/profileGames';
import { STROKE_LABEL } from '@mm/sports/swimming/events';
import { formatSwimTime } from '@mm/sports/swimming/time';
import { bowlingSummary, hasStats, winRate } from '@mm/components/social/socialFormat';
import { SportBadge } from '@/components/social/GameCard';
import { Card, Empty, LoadError, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/**
 * El resumen por deporte de un perfil (SportStats y StatsTab de la web, src/components/social/SportStats.tsx y
 * ProfileView.tsx): lo que ve quien mira (solo ligas que puede ver y nunca las de menores). En Yo va debajo de «Dónde
 * juego» cuando no juegas boliche (`skipBowling`: el boliche ya sale arriba con más detalle).
 */

function Num({ label, value }: { label: string; value: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ flexBasis: '47%', flexGrow: 1, minWidth: 0, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: c.surface2 }}>
      <Txt tone="muted" numberOfLines={1} style={{ fontSize: 11, lineHeight: 14, fontFamily: font.medium }}>
        {label}
      </Txt>
      <Txt style={{ fontSize: 18, lineHeight: 22, fontFamily: font.bold, fontVariant: ['tabular-nums'] }}>{value}</Txt>
    </View>
  );
}

function SportCard({ sport, note, children }: { sport: string; note?: string; children: ReactNode }) {
  return (
    <Card padded={false} style={{ padding: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <SportBadge sport={sport} />
        {!!note && (
          <Txt tone="muted" style={{ fontSize: 12 }}>
            {note}
          </Txt>
        )}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>
    </Card>
  );
}

const dash = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? '—' : n);
const strokeText = (s: string) => (STROKE_LABEL as Record<string, string>)[s] ?? s;

export function SportStats({
  stats,
  loading,
  error,
  onRetry,
  skipBowling,
  emptyText = 'Cuando juegue en alguna liga, aquí salen sus números de cada deporte.',
}: {
  stats: ProfileStats | null;
  loading: boolean;
  error: Error | null;
  onRetry?: () => unknown;
  skipBowling?: boolean;
  emptyText?: string | null;
}) {
  const c = useColors();
  if (loading && !stats) return <View accessibilityLabel="Cargando" style={{ height: 160, borderRadius: 24, backgroundColor: c.surface2 }} />;
  if (error && !stats) return <LoadError error={error} onRetry={onRetry} />;
  if (!stats || !hasStats(stats, { skipBowling })) {
    return emptyText ? <Empty icon={<BarChart3 size={28} color={c.accent} />} title="Sin números todavía" text={emptyText} /> : null;
  }
  const b = !skipBowling && stats.bowling ? bowlingSummary(stats.bowling.series) : null;
  return (
    <View style={{ gap: 12 }}>
      {b && b.sessions > 0 && (
        <SportCard sport="bowling" note={`${b.sessions} ${b.sessions === 1 ? 'evento' : 'eventos'}`}>
          <Num label="Promedio" value={b.avg} />
          <Num label="Juego más alto" value={b.high} />
          <Num label="Mejor serie" value={b.bestSeries} />
          <Num label="Juegos" value={b.games} />
        </SportCard>
      )}
      {stats.matches
        .filter((m) => m.played > 0)
        .map((m) => (
          <SportCard key={m.sport} sport={m.sport} note={`${m.played} ${m.played === 1 ? 'partido' : 'partidos'}`}>
            <Num label="Ganados" value={m.won} />
            <Num label="Perdidos" value={m.lost} />
            <Num label="Empates" value={m.drawn} />
            <Num label="% ganados" value={`${winRate(m.played, m.won)}%`} />
          </SportCard>
        ))}
      {stats.golf && stats.golf.rounds > 0 && (
        <SportCard sport="golf" note={`${stats.golf.rounds} ${stats.golf.rounds === 1 ? 'ronda' : 'rondas'}`}>
          <Num label="Mejor (18 hoyos)" value={dash(stats.golf.best18)} />
          <Num label="Promedio (18)" value={stats.golf.avg18 == null ? '—' : Math.round(stats.golf.avg18 * 10) / 10} />
          <Num label="Mejor (9 hoyos)" value={dash(stats.golf.best9)} />
          <Num label="Rondas" value={stats.golf.rounds} />
        </SportCard>
      )}
      {stats.swim && stats.swim.results > 0 && (
        <Card padded={false} style={{ padding: 16, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <SportBadge sport="swimming" />
            <Txt tone="muted" style={{ fontSize: 12 }}>
              {stats.swim.results} {stats.swim.results === 1 ? 'prueba' : 'pruebas'}
            </Txt>
          </View>
          {stats.swim.bests.length ? (
            <View>
              {stats.swim.bests.map((x, i) => (
                <View
                  key={`${x.distance}-${x.stroke}-${x.pool}`}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 8, borderTopWidth: i > 0 ? StyleSheet.hairlineWidth : 0, borderTopColor: c.line }}
                >
                  <Txt variant="meta" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {x.distance} m {strokeText(x.stroke).toLowerCase()}{' '}
                    <Txt tone="muted" style={{ fontSize: 12 }}>
                      · piscina {x.pool} m
                    </Txt>
                  </Txt>
                  <Txt variant="meta" style={{ fontFamily: font.bold, fontVariant: ['tabular-nums'] }}>
                    {formatSwimTime(x.timeCs)}
                  </Txt>
                </View>
              ))}
            </View>
          ) : (
            <Txt variant="meta" tone="muted">
              Todavía sin tiempos válidos.
            </Txt>
          )}
        </Card>
      )}
    </View>
  );
}

/** El resumen por deporte de una cuenta (`skipBowling`: el boliche ya sale con más detalle). */
export function StatsTab({ userId, skipBowling, isMe }: { userId: string; skipBowling?: boolean; isMe: boolean }) {
  const stats = useProfileStats(userId);
  return (
    <SportStats
      stats={stats.data}
      loading={stats.loading}
      error={stats.error}
      onRetry={() => invalidate(peopleTags.user(userId))}
      skipBowling={skipBowling}
      emptyText={skipBowling ? null : isMe ? 'Cuando juegues en alguna liga, aquí salen tus números de cada deporte.' : undefined}
    />
  );
}
