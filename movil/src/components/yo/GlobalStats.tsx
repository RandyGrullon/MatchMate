/**
 * Yo › Pro › «Por liga y temporada» (`/yo/estadisticas`, ProfileStats, GlobalStats y SportLeagues de
 * src/components/GlobalStats.tsx, con su misma lógica: bowlingNumbers.ts y profileNumbers.ts): el total del boliche de
 * todas tus ligas, torneos y juegos sueltos («Todo junto»), cada liga con sus números (abre «Mis números» de esa liga),
 * los juegos sueltos y cada año; y las ligas de los otros deportes (cada una a tus números ahí). Solo cuentan los juegos
 * verificados, igual que en cada liga.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { CircleHelp } from 'lucide-react-native';
import { router } from 'expo-router';
import { useMySoloSessions, type SoloSession } from '@mm/lib/data/solo';
import type { League, Member } from '@mm/lib/types';
import { leagueSport, sportMeta } from '@mm/sports/registry';
import { splitBySport, useBowlingNumbers, type SportLeagueLink } from '@mm/components/bowlingNumbers';
import { SPORT_LEAGUES_TEXT, globalPendingNote, globalWhatLine, sportLeaguesTitle, statsLine } from '@mm/components/profileNumbers';
import { LeagueMark } from '@/components/squads/bits';
import { Card, Divider, ListRow, LoadError, RowIcon, SectionHeader, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font, type as typeScale } from '@/theme/tokens';
import { NoBowlingNumbers } from './LiteNumbers';

/** Lo que sale en «Por liga y temporada»: el boliche (si juega, tiene juegos sueltos o ninguna liga de otro deporte) y los otros deportes. */
export function ProfileStats({ memberships, leagues }: { memberships: Member[]; leagues: League[] }) {
  const { bowling, others } = splitBySport(memberships, leagues);
  const solo = useMySoloSessions();
  const showBowling = bowling.length > 0 || others.length === 0 || solo.data.length > 0;
  return (
    <>
      {showBowling && <GlobalStats memberships={bowling} leagues={leagues} solo={solo.data} soloLoading={solo.loading} title={others.length > 0} />}
      {others.length > 0 && <SportLeagues leagues={others} alone={!showBowling} />}
    </>
  );
}

/** Las ligas de los otros deportes: cada una abre «Mis números» en esa liga. */
function SportLeagues({ leagues, alone }: { leagues: SportLeagueLink[]; alone: boolean }) {
  const c = useColors();
  return (
    <View accessibilityLabel={alone ? 'Mis ligas' : 'Mis ligas de otros deportes'} style={{ gap: 8 }}>
      <SectionHeader title={sportLeaguesTitle(alone)} />
      <Txt variant="meta" tone="muted" style={{ marginHorizontal: 4, marginBottom: 4 }}>
        {SPORT_LEAGUES_TEXT}
      </Txt>
      <Card padded={false}>
        {leagues.map((l, i) => {
          const meta = sportMeta(l.sport);
          const Icon = meta?.icon ?? CircleHelp;
          return (
            <View key={l.lid}>
              {i > 0 && <Divider inset={68} />}
              <ListRow
                icon={
                  <RowIcon>
                    <Icon size={20} color={c.accent} />
                  </RowIcon>
                }
                title={l.name}
                subtitle={`${meta?.short ?? 'Otro deporte'} · ${l.kind === 'torneo' ? 'Torneo' : 'Liga'} · Mis números`}
                onPress={() => router.push({ pathname: '/l/[lid]/perfil', params: { lid: l.lid } })}
              />
            </View>
          );
        })}
      </Card>
    </View>
  );
}

/** Una fila de «Por liga» con el promedio a la derecha. */
function LeagueStatRow({ mark, title, subtitle, value, onPress }: { mark: ReactNode; title: string; subtitle: string; value: number | string; onPress: () => void }) {
  return (
    <ListRow
      icon={mark}
      title={title}
      subtitle={subtitle}
      onPress={onPress}
      accessibilityLabel={`${title}. ${subtitle}. Promedio ${value}`}
      right={<Txt style={{ fontSize: 20, fontFamily: font.bold, fontVariant: ['tabular-nums'] }}>{String(value)}</Txt>}
    />
  );
}

/** El total del boliche, por liga y por año (GlobalStats de la web). Recibe solo las membresías del boliche. */
function GlobalStats({ memberships, leagues, solo, soloLoading, title }: { memberships: Member[]; leagues: League[]; solo: SoloSession[]; soloLoading: boolean; title: boolean }) {
  const c = useColors();
  const state = useBowlingNumbers(memberships, leagues, solo, soloLoading);
  const leagueOf = new Map(leagues.map((l) => [l.id, l]));
  // «Mis números» de esa liga: la página de tu jugador ahí (la web: /l/<liga>/perfil); sin jugador todavía, la liga.
  const playerOf = new Map(memberships.map((m) => [m.leagueId, m.playerId]));
  const openMine = (lid: string) => {
    const playerId = playerOf.get(lid);
    if (playerId) router.push({ pathname: '/l/[lid]/j/[playerId]', params: { lid, playerId } });
    else router.push({ pathname: '/l/[lid]', params: { lid } });
  };
  if (state.status === 'none') return <NoBowlingNumbers preparing={state.preparing} />;
  if (state.status === 'error') return <LoadError error={state.error} />;
  if (state.status === 'loading') return <View accessibilityLabel="Cargando tus números" style={{ height: 220, borderRadius: 24, backgroundColor: c.surface2 }} />;
  const n = state.data;

  return (
    <View style={{ gap: 26 }}>
      <View accessibilityLabel="Todo junto" style={{ gap: 8 }}>
        <SectionHeader title={title ? 'Boliche, todo junto' : 'Todo junto'} />
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
            <View>
              <Txt variant="meta" tone="muted">
                Promedio
              </Txt>
              <Txt style={[typeScale.stat, { marginTop: 4, fontVariant: ['tabular-nums'] }]}>{String(n.all.autoAverage ?? '—')}</Txt>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Txt variant="meta" tone="muted">
                Puntaje total
              </Txt>
              <Txt style={{ marginTop: 4, fontSize: 22, lineHeight: 28, fontFamily: font.bold, fontVariant: ['tabular-nums'] }}>{n.all.pins ? n.all.pins.toLocaleString('es-DO') : '—'}</Txt>
            </View>
          </View>
          <Txt variant="meta" tone="fg2" style={{ marginTop: 12 }}>
            {globalWhatLine(n)}
          </Txt>
          <Txt tone="muted" style={{ marginTop: 4, fontSize: 13 }}>
            {globalPendingNote(n.all.pending)}
          </Txt>
        </Card>
      </View>

      <View accessibilityLabel="Por liga" style={{ gap: 8 }}>
        <SectionHeader
          title="Por liga"
          action={
            <Txt variant="meta" tone="muted">
              Promedio
            </Txt>
          }
        />
        <Card padded={false}>
          {n.perLeague.map(({ lid, name, stats }, i) => {
            const l = leagueOf.get(lid);
            return (
              <View key={lid}>
                {i > 0 && <Divider inset={68} />}
                <LeagueStatRow
                  mark={<LeagueMark sport={l ? leagueSport(l) : 'bowling'} logo={l?.logoPath ?? null} />}
                  title={name}
                  subtitle={statsLine(stats)}
                  value={stats.autoAverage ?? '—'}
                  onPress={() => openMine(lid)}
                />
              </View>
            );
          })}
          {n.solo && (
            <>
              {n.perLeague.length > 0 && <Divider inset={68} />}
              <LeagueStatRow
                mark={<LeagueMark sport="bowling" logo={null} />}
                title="Juegos sueltos"
                subtitle={statsLine(n.solo)}
                value={n.solo.autoAverage ?? '—'}
                onPress={() => router.push('/juegos-sueltos')}
              />
            </>
          )}
        </Card>
      </View>

      {n.years.length > 0 && (
        <View accessibilityLabel="Por año" style={{ gap: 8 }}>
          <SectionHeader title="Por año" />
          <Card padded={false}>
            <View style={[styles.tr, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }]}>
              <Txt tone="muted" style={[styles.th, styles.name]}>
                Año
              </Txt>
              <Txt tone="muted" style={[styles.th, styles.num]}>
                Juegos
              </Txt>
              <Txt tone="muted" style={[styles.th, styles.num]}>
                Promedio
              </Txt>
              <Txt tone="muted" style={[styles.th, styles.num]}>
                Mejor
              </Txt>
            </View>
            {n.years.map(({ year, stats: s }, i) => (
              <View key={year} style={[styles.tr, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
                <Txt variant="bodyStrong" style={styles.name}>
                  {year}
                </Txt>
                <Txt style={styles.num}>{String(s.games)}</Txt>
                <Txt variant="bodyStrong" style={styles.num}>
                  {String(s.autoAverage ?? '—')}
                </Txt>
                <Txt style={styles.num}>{String(s.high || '—')}</Txt>
              </View>
            ))}
          </Card>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tr: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 11 },
  th: { fontSize: 12, fontFamily: font.medium },
  name: { flex: 1.4 },
  num: { flex: 1, textAlign: 'right', fontVariant: ['tabular-nums'] },
});
