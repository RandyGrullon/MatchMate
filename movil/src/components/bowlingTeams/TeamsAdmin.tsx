import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Pencil, Plus, Shuffle, UserPlus } from 'lucide-react-native';
import { usePlayers } from '@mm/lib/data';
import { colorOf, useBowlingTeams } from '@mm/lib/data/bowlingTeams';
import { useLeagueCtx } from '@mm/lib/league';
import { useNow } from '@mm/lib/useNow';
import { todayIn } from '@mm/pages/sports/racket/logic/time';
import { teamLine, useLeagueAverages } from '@mm/components/bowlingTeams/logic';
import { Avatar } from '@/components/social/Avatar';
import { Button, Card, Divider, LoadError, Loading, RowIcon, SectionHeader, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { AddToTeamSheet } from './AddToTeamSheet';
import { GenerateSheet } from './GenerateSheet';
import { DenseRow, SectionLink, TeamMark } from './parts';
import { TeamFormSheet } from './TeamFormSheet';
import { TeamPlayerSheet } from './TeamPlayerSheet';

/**
 * Organizar › Equipos de una liga de boliche (BowlingTeamsAdmin de la web, con su misma lógica): los equipos fijos,
 * cada uno con su color y sus jugadores (con su promedio). Se crean a mano o se generan todos de una vez («Al azar» o
 * «Parejos por promedio», con vista previa); cada jugador se toca para moverlo a otro equipo o sacarlo. Un jugador va
 * en un solo equipo; en los torneos de la liga, quien se inscribe entra solo a su equipo. Va dentro de LeagueScope.
 */
export function TeamsAdmin() {
  const c = useColors();
  const { lid, league } = useLeagueCtx();
  const now = useNow();
  const teams = useBowlingTeams(lid);
  const players = usePlayers(lid);
  const averages = useLeagueAverages(lid, league.tz, todayIn(league.tz, now.getTime()));
  // Las hojas siguen al equipo y al jugador de la caché (cambian mientras están abiertas).
  const [editing, setEditing] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  if (teams.error && !teams.data.length) return <LoadError error={teams.error} />;
  const loading = (teams.loading && !teams.data.length) || (players.loading && !players.data.length);
  const list = teams.data;
  const editingTeam = editing && editing !== 'nuevo' ? (list.find((t) => t.id === editing) ?? null) : null;
  const adding = addingTo ? (list.find((t) => t.id === addingTo) ?? null) : null;
  const member = memberId ? (players.data.find((p) => p.id === memberId) ?? null) : null;
  const assigned = new Set(list.flatMap((t) => t.players.map((p) => p.playerId)));
  const free = players.data.filter((p) => !assigned.has(p.id));
  const avg = (id: string) => averages.get(id) ?? 0;
  const generate = (
    <Button variant="primary" size="lg" full icon={<Shuffle size={20} color={c.accentFg} />} disabled={players.data.length < 2} onPress={() => setGenerating(true)}>
      Generar equipos
    </Button>
  );

  return (
    <View style={{ gap: 26 }}>
      <Txt variant="meta" tone="muted" style={{ marginTop: -8 }}>
        Cada jugador va en un solo equipo. En los torneos de la liga, quien se inscribe entra solo con su equipo.
      </Txt>

      {loading ? (
        <Loading />
      ) : !list.length ? (
        <Card style={{ gap: 12 }}>
          <View style={{ marginBottom: 4 }}>
            <Txt variant="cardTitle">Todavía no hay equipos</Txt>
            <Txt variant="meta" tone="muted" style={{ marginTop: 4 }}>
              {players.data.length >= 2 ? (
                'Genéralos al azar o parejos por promedio, o crea uno y elige sus jugadores.'
              ) : (
                <>
                  Primero agrega a los jugadores en{' '}
                  <Txt
                    variant="meta"
                    tone="accent"
                    accessibilityRole="link"
                    style={{ fontFamily: font.semibold }}
                    onPress={() => router.push({ pathname: '/l/[lid]/jugadores', params: { lid } })}
                  >
                    Jugadores y miembros
                  </Txt>
                  .
                </>
              )}
            </Txt>
          </View>
          {generate}
          <Button size="lg" full icon={<Plus size={20} color={c.fg} />} onPress={() => setEditing('nuevo')}>
            Crear un equipo
          </Button>
        </Card>
      ) : (
        <>
          {generate}
          <View style={{ gap: 10 }}>
            <SectionHeader
              title={`Equipos (${list.length})`}
              action={
                <SectionLink icon={<Plus size={18} color={c.accent} strokeWidth={2.4} />} onPress={() => setEditing('nuevo')}>
                  Nuevo equipo
                </SectionLink>
              }
            />
            <View style={{ gap: 14 }}>
              {list.map((t, i) => (
                <Card key={t.id} padded={false}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 8, paddingRight: 8, paddingLeft: 20 }}>
                    <TeamMark name={t.name} color={colorOf(t, i)} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Txt numberOfLines={1} style={{ fontSize: 17, fontFamily: font.semibold, letterSpacing: -0.17 }} accessibilityRole="header">
                        {t.name}
                      </Txt>
                      <Txt tone="muted" style={{ fontSize: 13 }}>
                        {teamLine(t, averages)}
                      </Txt>
                    </View>
                    <Button variant="ghost" accessibilityLabel={`Nombre y color de ${t.name}`} icon={<Pencil size={18} color={c.muted} />} onPress={() => setEditing(t.id)} />
                  </View>
                  {t.players.map((p) => (
                    <View key={p.playerId}>
                      <Divider inset={20} />
                      <DenseRow
                        leading={<Avatar name={p.name} size={36} />}
                        title={p.name}
                        value={avg(p.playerId) || '—'}
                        onPress={() => setMemberId(p.playerId)}
                        accessibilityLabel={`${p.name}: mover o sacar del equipo`}
                        chevron={false}
                      />
                    </View>
                  ))}
                  <Divider inset={20} />
                  <DenseRow
                    leading={
                      <RowIcon>
                        <UserPlus size={20} color={c.accent} />
                      </RowIcon>
                    }
                    title={
                      <Txt tone="accent" numberOfLines={1} style={{ fontSize: 15, fontFamily: font.semibold }}>
                        Agregar jugador
                      </Txt>
                    }
                    onPress={() => setAddingTo(t.id)}
                    accessibilityLabel={`Agregar jugador a ${t.name}`}
                    chevron={false}
                  />
                </Card>
              ))}
            </View>
          </View>
          {free.length > 0 && (
            <View style={{ gap: 10 }}>
              <SectionHeader title={`Sin equipo (${free.length})`} />
              <Card padded={false}>
                {free.map((p, i) => (
                  <View key={p.id}>
                    {i > 0 && <Divider inset={20} />}
                    <DenseRow
                      leading={<Avatar name={p.name} size={36} />}
                      title={p.name}
                      value={avg(p.id) || '—'}
                      onPress={() => setMemberId(p.id)}
                      accessibilityLabel={`${p.name}: poner en un equipo`}
                      chevron={false}
                    />
                  </View>
                ))}
              </Card>
            </View>
          )}
        </>
      )}

      {/* Cada hoja se monta al abrirse: empieza desde cero, con la liga como está. */}
      {generating && <GenerateSheet onClose={() => setGenerating(false)} players={players.data} teams={list} averages={averages} />}
      {editing != null && <TeamFormSheet key={editing} team={editingTeam} index={editingTeam ? list.indexOf(editingTeam) : list.length} onClose={() => setEditing(null)} />}
      {adding && <AddToTeamSheet key={adding.id} team={adding} teams={list} players={players.data} averages={averages} onClose={() => setAddingTo(null)} />}
      {member && <TeamPlayerSheet key={member.id} player={member} teams={list} averages={averages} onClose={() => setMemberId(null)} />}
    </View>
  );
}
