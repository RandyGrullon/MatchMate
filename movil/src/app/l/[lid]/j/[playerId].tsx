import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { CalendarCheck, CheckCircle2, Clock, Flame, Globe, Hash, Layers, Sigma, Target, Trophy, XCircle } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { useEntriesOfEvents, useEvents, useLeague, usePlayer, usePlayerEntries, usePlayerSubmissions } from '@mm/lib/data';
import { useMembership } from '@mm/lib/data/members';
import { useLeagueSeasons } from '@mm/lib/data/seasons';
import { averageForDay, averageSourceLabel } from '@mm/lib/bowlingSeason';
import { eventLabel, formatDate, formatDateLong, toIsoDate } from '@mm/lib/format';
import { currentSeason, inSeason } from '@mm/lib/seasons';
import { effectiveAverage, entryLine, eventPosition, playerStats } from '@mm/lib/stats';
import type { Entry } from '@mm/lib/types';
import { useNow } from '@mm/lib/useNow';
import { leagueSport } from '@mm/sports/registry';
import { LeagueScope } from '@/components/league/LeagueScope';
import { LeaguePlayerBadges } from '@/components/badges/LeagueBadges';
import { SuggestionBox } from '@/components/suggestions/SuggestionBox';
import { SwimPlayer } from '@/components/swimming/SwimProfile';
import { BackBar, Badge, Button, Card, Empty, LoadError, Loading, Screen, SectionHeader, Txt } from '@/components/ui';
import { openOnWeb } from '@/lib/web';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/**
 * Un jugador de una liga de boliche (`/l/<liga>/j/<jugador>`, PlayerPage de la web): su nombre, juegos aprobados y por
 * aprobar, sus números (promedio, puntaje total, juegos, mejor juego, mejor serie y asistencia), sus envíos (si es el
 * tuyo), los torneos con su lugar, las prácticas y los números por temporada. La tendencia y el análisis por cuadros,
 * en la web.
 */
/** Un jugador de la liga: el nadador en natación; el del boliche, aquí abajo. */
export default function PlayerScreen() {
  const { lid, playerId } = useLocalSearchParams<{ lid: string; playerId: string }>();
  const league = useLeague(lid);
  if (league.loading && !league.data) return <Loading label="Cargando el jugador" />;
  if (league.data && leagueSport(league.data) === 'swimming') {
    return (
      <Screen>
        <LeagueScope lid={lid}>
          <SwimPlayer playerId={playerId} />
          {/* Sus insignias de la liga, abajo (LeaguePlayerBadges de la web). */}
          <LeaguePlayerBadges playerId={playerId} />
        </LeagueScope>
      </Screen>
    );
  }
  return <BowlingPlayerScreen />;
}

function BowlingPlayerScreen() {
  const { lid, playerId } = useLocalSearchParams<{ lid: string; playerId: string }>();
  const c = useColors();
  const auth = useAuth();
  const member = useMembership(lid, auth.user?.uid);
  const player = usePlayer(lid, playerId);
  const entries = usePlayerEntries(lid, playerId);
  const events = useEvents(lid);
  const subs = usePlayerSubmissions(lid, playerId);
  const seasons = useLeagueSeasons(lid);
  const now = useNow();
  const eventById = useMemo(() => new Map(events.data.map((e) => [e.id, e])), [events.data]);
  const mine = useMemo(
    () =>
      entries.data
        .filter((e) => eventById.has(e.eventId))
        .sort((a, b) => eventById.get(b.eventId)!.date.localeCompare(eventById.get(a.eventId)!.date)),
    [entries.data, eventById],
  );
  const tournamentIds = useMemo(() => mine.filter((e) => eventById.get(e.eventId)!.type === 'torneo').map((e) => e.eventId), [mine, eventById]);
  const tournamentEntries = useEntriesOfEvents(lid, tournamentIds);
  const dated = useMemo(() => mine.map((entry) => ({ entry, date: eventById.get(entry.eventId)!.date })), [mine, eventById]);

  const loadError = player.error ?? entries.error ?? events.error;
  if (loadError) {
    return (
      <Screen>
        <BackBar label="Tabla" fallback={`/l/${lid}/tabla`} />
        <LoadError error={loadError} />
      </Screen>
    );
  }
  if ((player.loading && !player.data) || (entries.loading && !entries.data.length) || (events.loading && !events.data.length)) return <Loading label="Cargando el jugador" />;
  if (!player.data) {
    return (
      <Screen>
        <BackBar label="Tabla" fallback={`/l/${lid}/tabla`} />
        <Empty title="Este jugador no existe" text="Revisa el link que te compartieron." />
      </Screen>
    );
  }

  const p = player.data;
  const isOwner = !!member.data?.playerId && member.data.playerId === p.id;
  const stats = playerStats(mine);
  const attended = mine.filter((e) => e.scores?.some((sc, i) => sc != null && e.photos?.[i] != null)).length;
  const season = currentSeason(seasons.data);
  const bySeason = seasons.data.length ? averageForDay({ entries: dated, seasons: seasons.data, day: toIsoDate(now), override: p.averageOverride }) : null;
  const average = bySeason ? bySeason.average : effectiveAverage(p, stats);
  const averageNote = bySeason ? (bySeason.source === 'temporada' && season ? season.name : averageSourceLabel(bySeason.source)) : undefined;
  const tournaments = mine.filter((e) => eventById.get(e.eventId)!.type === 'torneo');
  const practices = mine.filter((e) => eventById.get(e.eventId)!.type === 'practica');
  const thisYear = String(now.getFullYear());

  // Sus números por temporada (sin temporadas leídas, por año).
  const byYear = new Map<string, Entry[]>();
  if (seasons.data.length) {
    for (const s of seasons.data) {
      const list = dated.filter((d) => inSeason(s, d.date)).map((d) => d.entry);
      if (list.length) byYear.set(s.name, list);
    }
  } else {
    for (const e of mine) {
      const y = eventById.get(e.eventId)!.date.slice(0, 4);
      byYear.set(y, [...(byYear.get(y) ?? []), e]);
    }
  }
  const openSubs = subs.data
    .filter((s) => s.status !== 'aprobado' || (s.createdAt && now.getTime() - s.createdAt.toMillis() < 7 * 86400_000))
    .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0))
    .slice(0, 6);
  const gamesOf = (e: Entry) => (e.scores ?? []).filter((s): s is number => s != null).join(' · ') || '—';
  const openEvent = (eventId: string) => router.push({ pathname: '/l/[lid]/e/[eventId]', params: { lid, eventId } });

  const stat = (Icon: typeof Target, label: string, value: string | number, sub?: string) => (
    <View style={[styles.stat, { backgroundColor: c.surface }]} accessible accessibilityLabel={`${label}: ${value}${sub ? `, ${sub}` : ''}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon size={16} color={c.muted} />
        <Txt variant="meta" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
          {label}
        </Txt>
      </View>
      <Txt style={{ fontFamily: font.bold, fontSize: 26, fontVariant: ['tabular-nums'] }}>{value}</Txt>
      {!!sub && (
        <Txt tone="muted" numberOfLines={1} style={{ fontSize: 12 }}>
          {sub}
        </Txt>
      )}
    </View>
  );

  return (
    <Screen>
      <BackBar label="Tabla" fallback={`/l/${lid}/tabla`} />
      <Card style={{ alignItems: 'center', gap: 4 }}>
        <Txt variant="title" style={{ textAlign: 'center' }}>
          {p.name}
        </Txt>
        <Txt variant="meta" tone="muted">
          {`${stats.games} ${stats.games === 1 ? 'juego aprobado' : 'juegos aprobados'}${stats.pending > 0 ? ` · ${stats.pending} por aprobar` : ''}`}
        </Txt>
      </Card>

      <View style={styles.grid}>
        {stat(Target, !bySeason && p.averageOverride != null ? 'Promedio (fijo)' : 'Promedio', average || '—', averageNote)}
        {stat(Sigma, 'Puntaje total', stats.pins ? stats.pins.toLocaleString('es-DO') : '—')}
        {stat(Hash, 'Juegos', stats.games)}
        {stat(Flame, 'Mejor juego', stats.high || '—')}
        {stat(Layers, 'Mejor serie (3)', stats.highSeries || '—')}
        {stat(CalendarCheck, 'Asistencia', attended, attended === 1 ? 'evento' : 'eventos')}
      </View>

      {isOwner && openSubs.length > 0 && (
        <View style={{ gap: 8 }}>
          <SectionHeader title="Mis envíos" />
          <Card padded={false} style={{ overflow: 'hidden' }}>
            {openSubs.map((s, i) => {
              const ev = s.eventId ? eventById.get(s.eventId) : undefined;
              const Icon = s.status === 'pendiente' ? Clock : s.status === 'aprobado' ? CheckCircle2 : XCircle;
              const tone = s.status === 'pendiente' ? 'warn' : s.status === 'aprobado' ? 'ok' : 'danger';
              return (
                <View key={s.id} style={[styles.subRow, i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null]}>
                  <Icon size={16} color={c[tone]} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt numberOfLines={1}>{ev ? eventLabel(ev) : s.date ? `Práctica ${formatDate(s.date)}` : 'Evento eliminado'}</Txt>
                    <Txt tone="muted" numberOfLines={2} style={{ fontSize: 12, fontVariant: ['tabular-nums'] }}>
                      {`${(s.scores ?? []).map((g) => g ?? '–').join(' · ')}${s.note ? ` — ${s.note}` : ''}`}
                    </Txt>
                  </View>
                  <Badge tone={tone}>{s.status === 'pendiente' ? 'Por aprobar' : s.status === 'aprobado' ? 'Aprobado' : 'Rechazado'}</Badge>
                </View>
              );
            })}
          </Card>
        </View>
      )}

      <View style={{ gap: 8 }}>
        <SectionHeader title="Torneos" />
        {tournaments.length === 0 ? (
          <Txt variant="meta" tone="muted">
            Todavía no ha jugado torneos.
          </Txt>
        ) : (
          tournaments.map((e) => {
            const ev = eventById.get(e.eventId)!;
            const line = entryLine(e, ev);
            const r = eventPosition(ev, tournamentEntries.data, e.id);
            return (
              <Card key={e.id} style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Trophy size={16} color={c.accent} />
                      <Txt variant="bodyStrong">{eventLabel(ev)}</Txt>
                      {ev.date.startsWith(thisYear) && e === tournaments[0] && <Badge>Actual</Badge>}
                    </View>
                    <Txt variant="meta" tone="muted">
                      {formatDateLong(ev.date)}
                    </Txt>
                    <Txt variant="meta" style={{ fontVariant: ['tabular-nums'] }}>
                      {gamesOf(e)}
                    </Txt>
                  </View>
                  {r && (
                    <View style={{ alignItems: 'flex-end' }}>
                      <Txt style={{ fontFamily: font.bold, fontSize: 24 }}>{`${r.pos}°`}</Txt>
                      <Txt tone="muted" style={{ fontSize: 12 }}>{`de ${r.of}`}</Txt>
                    </View>
                  )}
                </View>
                <Txt variant="meta" tone="muted">
                  {`Scratch ${line.scratch}${ev.hcpPercent > 0 ? ` · Hcp ${line.hcp}/juego` : ''} · Total ${line.total} · Promedio de entrada ${e.average}`}
                </Txt>
                <Button onPress={() => openEvent(ev.id)}>Ver clasificación</Button>
              </Card>
            );
          })
        )}
      </View>

      <View style={{ gap: 8 }}>
        <SectionHeader title="Prácticas" />
        {practices.length === 0 ? (
          <Txt variant="meta" tone="muted">
            Todavía no hay prácticas registradas.
          </Txt>
        ) : (
          <Card padded={false} style={{ overflow: 'hidden' }}>
            {practices.map((e, i) => {
              const ev = eventById.get(e.eventId)!;
              const line = entryLine(e, ev);
              return (
                <View key={e.id} style={i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${formatDate(ev.date)}: ${gamesOf(e)}. Promedio ${line.avg || '—'}`}
                    onPress={() => openEvent(ev.id)}
                    style={({ pressed }) => [styles.practice, { backgroundColor: pressed ? c.surface2 : 'transparent' }]}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Txt variant="bodyStrong">{formatDate(ev.date)}</Txt>
                      <Txt variant="meta" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>
                        {gamesOf(e)}
                      </Txt>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Txt style={{ fontFamily: font.bold, fontSize: 18, fontVariant: ['tabular-nums'] }}>{line.avg || '—'}</Txt>
                      <Txt tone="muted" style={{ fontSize: 12 }}>
                        promedio
                      </Txt>
                    </View>
                  </Pressable>
                </View>
              );
            })}
          </Card>
        )}
      </View>

      {byYear.size > 0 && (
        <View style={{ gap: 8 }}>
          <SectionHeader title={seasons.data.length ? 'Por temporada' : 'Por año'} />
          <Card padded={false} style={{ overflow: 'hidden' }}>
            <View style={[styles.tableRow, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }]}>
              <Txt tone="muted" style={[styles.cellName, { fontSize: 12 }]}>
                {seasons.data.length ? 'Temporada' : 'Año'}
              </Txt>
              <Txt tone="muted" style={[styles.cell, { fontSize: 12 }]}>
                Juegos
              </Txt>
              <Txt tone="muted" style={[styles.cell, { fontSize: 12 }]}>
                Promedio
              </Txt>
              <Txt tone="muted" style={[styles.cell, { fontSize: 12 }]}>
                Mejor
              </Txt>
            </View>
            {[...byYear.entries()].map(([y, list], i) => {
              const s = playerStats(list);
              return (
                <View key={y} style={[styles.tableRow, i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null]}>
                  <Txt variant="bodyStrong" numberOfLines={1} style={styles.cellName}>
                    {y}
                  </Txt>
                  <Txt style={styles.cell}>{s.games}</Txt>
                  <Txt variant="bodyStrong" style={styles.cell}>
                    {s.autoAverage ?? '—'}
                  </Txt>
                  <Txt style={styles.cell}>{s.high || '—'}</Txt>
                </View>
              );
            })}
          </Card>
        </View>
      )}

      <LeagueScope lid={lid}>
        {/* En «Mis números», el buzón de sugerencias de la liga (como la web). */}
        {isOwner && <SuggestionBox />}
        {/* Sus insignias de la liga, abajo (LeaguePlayerBadges de la web). */}
        <LeaguePlayerBadges playerId={p.id} />
      </LeagueScope>

      <Button full icon={<Globe size={18} color={c.fg} />} onPress={() => openOnWeb(`/l/${lid}/j/${p.id}`)}>
        Tendencia y análisis por cuadros en la web
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { flexBasis: '47%', flexGrow: 1, borderRadius: 18, padding: 14, gap: 2 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  practice: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16, paddingVertical: 12 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  cellName: { flex: 1.6 },
  cell: { flex: 1, textAlign: 'right', fontVariant: ['tabular-nums'] },
});
