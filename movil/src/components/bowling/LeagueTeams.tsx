import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { colorOf, teamAverageSum, useBowlingTeams } from '@mm/lib/data/bowlingTeams';
import { usePlayers } from '@mm/lib/data';
import { useLeagueCtx } from '@mm/lib/league';
import { firstNames, homeAverages } from '@mm/components/bowlingTeams/logic';
import { useSeasonTable } from '@mm/components/league/home/seasonTable';
import { TeamMark } from '@/components/bowlingTeams/parts';
import { Card, ListRow, SectionHeader, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/**
 * Inicio de la liga › «Equipos» (LeagueTeamsSection de la web): cada equipo fijo en una fila (su color, su nombre, sus
 * jugadores y la suma de sus promedios), tu equipo con «Tú». Quien organiza tiene «Editar» (Organizar › Equipos). Sin
 * equipos fijos no sale. Los promedios: los de la tabla de la temporada y el fijo de quien todavía no tiene juegos.
 */
export function LeagueTeamsSection() {
  const c = useColors();
  const { lid, league, isAdmin, myPlayerId } = useLeagueCtx();
  const teams = useBowlingTeams(league.kind === 'torneo' ? null : lid);
  const table = useSeasonTable();
  const players = usePlayers(lid);
  const averages = useMemo(() => homeAverages(table.rows, players.data), [table.rows, players.data]);
  if (!teams.data.length) return null;
  const anySum = teams.data.some((t) => teamAverageSum(t.players.map((p) => p.playerId), averages) > 0);
  return (
    <View style={{ gap: 8 }}>
      <SectionHeader
        title="Equipos"
        action={
          isAdmin ? (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.push({ pathname: '/l/[lid]/equipos', params: { lid } })}>
              <Txt tone="accent" variant="bodyStrong">
                Editar
              </Txt>
            </Pressable>
          ) : undefined
        }
      />
      <Card padded={false} style={{ overflow: 'hidden' }}>
        {teams.data.map((t, i) => {
          const me = !!myPlayerId && t.players.some((p) => p.playerId === myPlayerId);
          const sum = teamAverageSum(
            t.players.map((p) => p.playerId),
            averages,
          );
          return (
            <View key={t.id} style={[{ backgroundColor: me ? c.accentSoft : 'transparent' }, i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null]}>
              <ListRow
                chevron={false}
                icon={<TeamMark name={t.name} color={colorOf(t, i)} />}
                title={`${t.name}${me ? ' · Tú' : ''}`}
                subtitle={t.players.length ? firstNames(t.players.map((p) => p.name)) : 'Sin jugadores'}
                right={sum ? <Txt style={{ fontFamily: font.bold, fontSize: 18 }}>{String(sum)}</Txt> : undefined}
              />
            </View>
          );
        })}
      </Card>
      {anySum && (
        <Txt tone="muted" style={{ fontSize: 13, marginHorizontal: 4 }}>
          Al lado de cada equipo, la suma de los promedios de sus jugadores.
        </Txt>
      )}
    </View>
  );
}
