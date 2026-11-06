import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Medal } from 'lucide-react-native';
import { useGolfTournaments } from '@mm/lib/data/golf';
import { useLeagueSeasons } from '@mm/lib/data/seasons';
import { eventLabel } from '@mm/lib/format';
import { useLeagueCtx } from '@mm/lib/league';
import { currentSeason } from '@mm/lib/seasons';
import { meritPlace } from '@mm/pages/sports/golf/home';
import { useGolfMerit } from '@mm/pages/sports/golf/seasonTable';
import { Card, Empty, ListRow, LoadError, Loading, SectionHeader, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/**
 * Orden de mérito de la temporada (GolfStandings de la web, Lite): puntos por puesto en cada ronda cerrada, tu lugar
 * («Vas 3.º de 6, con 41 pts…») y la lista con «Tú», y las rondas que cuentan con quién ganó cada una. La misma lógica
 * de la web (useGolfMerit). Otras temporadas y la tabla de Pro, en la web.
 */
export function GolfStandings() {
  const c = useColors();
  const { lid, myPlayerId } = useLeagueCtx();
  const seasons = useLeagueSeasons(lid);
  const { season, rules, events, players, merit, counted } = useGolfMerit(currentSeason(seasons.data));
  const tournaments = useGolfTournaments(lid);
  if (season.error) return <LoadError error={season.error} />;
  if (season.loading) return <Loading label="Cargando el orden de mérito" />;
  const nameOf = (id: string) => players.data.find((p) => p.id === id)?.name ?? '(jugador borrado)';
  const eventName = (id: string) => {
    const e = events.data.find((x) => x.id === id);
    return e ? eventLabel({ type: e.type, name: e.name, date: e.date }, 'golf') : 'Ronda';
  };
  const place = meritPlace(merit, myPlayerId, nameOf);
  const leader = merit[0];
  const minePts = merit.find((m) => m.id === myPlayerId)?.points ?? 0;

  return (
    <View style={{ gap: 14 }}>
      <Txt variant="title" accessibilityRole="header">
        Orden de mérito
      </Txt>
      {!merit.length ? (
        <Empty icon={<Medal size={28} color={c.accent} />} title="Todavía no hay rondas cerradas" text="Cuando el admin cierre una ronda, sus resultados suman aquí." />
      ) : (
        <>
          {place && leader && (
            <View accessibilityLabel="Tu lugar" style={[styles.place, { backgroundColor: c.accentSoft }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
                <Txt style={{ fontFamily: font.bold, fontSize: 48, lineHeight: 52, color: c.accent }}>{place.big}</Txt>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt variant="bodyStrong" style={{ fontSize: 17 }}>
                    {place.title}
                  </Txt>
                  <Txt tone="fg2" style={{ fontSize: 14.5, marginTop: 3 }}>
                    {place.subtitle}
                  </Txt>
                </View>
              </View>
              <View style={{ marginTop: 16 }}>
                <View style={[styles.bar, { backgroundColor: `${c.accent}29` }]}>
                  <View style={{ width: `${Math.round(Math.min(1, leader.points ? minePts / leader.points : 0) * 100)}%`, height: '100%', borderRadius: 4, backgroundColor: c.accent }} />
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 7 }}>
                  <Txt tone="fg2" style={{ fontSize: 12.5 }}>{`Tú · ${minePts}`}</Txt>
                  {leader.id !== myPlayerId && <Txt tone="fg2" numberOfLines={1} style={{ fontSize: 12.5, flexShrink: 1 }}>{`1.º · ${nameOf(leader.id)} ${leader.points}`}</Txt>}
                </View>
              </View>
            </View>
          )}
          <Card padded={false} style={{ overflow: 'hidden' }}>
            {merit.map((m, i) => {
              const me = !!myPlayerId && m.id === myPlayerId;
              return (
                <View key={m.id} style={i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null}>
                  <View style={{ backgroundColor: me ? c.accentSoft : 'transparent' }}>
                    <ListRow
                      chevron={false}
                      accessibilityLabel={`${m.rank}. ${nameOf(m.id)}${me ? ' (tú)' : ''}: ${m.points} puntos. Jugó ${m.events}, ganó ${m.wins}`}
                      icon={<Txt style={{ width: 22, textAlign: 'center', fontFamily: font.bold, color: me ? c.accent : c.muted }}>{m.rank}</Txt>}
                      title={`${nameOf(m.id)}${me ? ' · Tú' : ''}`}
                      subtitle={`Jugó ${m.events} · ganó ${m.wins}`}
                      right={<Txt style={{ fontFamily: font.bold, fontSize: 20 }}>{m.points.toLocaleString('es-DO')}</Txt>}
                    />
                  </View>
                </View>
              );
            })}
          </Card>
        </>
      )}
      <Txt tone="muted" style={{ textAlign: 'center', fontSize: 13 }}>{`Puntos por puesto en cada ronda cerrada: ${rules.data.meritPoints.slice(0, 5).join(', ')}…`}</Txt>

      {counted.length > 0 && (
        <View style={{ gap: 8 }}>
          <SectionHeader title={`Rondas que cuentan (${counted.length})`} />
          <Card padded={false} style={{ overflow: 'hidden' }}>
            {counted.map((e) => (
              <ListRow
                key={e.id}
                title={e.kind === 'torneo' ? (tournaments.data.find((t) => t.id === e.id)?.name ?? 'Torneo') : eventName(e.id)}
                subtitle={`${e.kind === 'torneo' ? `${e.eventIds.length} rondas · ` : ''}ganó ${e.rows.filter((r) => r.rank === 1).map((r) => nameOf(r.id)).join(' y ') || '–'}`}
                onPress={() => router.push({ pathname: '/l/[lid]/e/[eventId]', params: { lid, eventId: e.eventIds[0], tab: 'leaderboard' } })}
              />
            ))}
          </Card>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  place: { borderRadius: 24, paddingHorizontal: 22, paddingVertical: 20 },
  bar: { height: 8, borderRadius: 4, overflow: 'hidden' },
});
