import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Plus, Search } from 'lucide-react-native';
import { rosterWith, saveBowlingTeam, teamOf, type BowlingTeam } from '@mm/lib/data/bowlingTeams';
import { useLeagueCtx } from '@mm/lib/league';
import type { Player } from '@mm/lib/types';
import { teamLine } from '@mm/components/bowlingTeams/logic';
import { Avatar } from '@/components/social/Avatar';
import { runAction } from '@/components/swimming/parts';
import { Card, Divider, Input, Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { DenseRow, RowSpinner, useBusy } from './parts';

/**
 * «Agregar a Equipo 1» (AddPlayersSheet de la web, con su misma lógica): primero los que no tienen equipo y después los
 * de otros equipos (entrar aquí los saca del suyo). Cada toque guarda; la hoja queda abierta para agregar más.
 */
export function AddToTeamSheet({ team, teams, players, averages, onClose }: { team: BowlingTeam; teams: BowlingTeam[]; players: Player[]; averages: ReadonlyMap<string, number>; onClose: () => void }) {
  const c = useColors();
  const { lid } = useLeagueCtx();
  const busy = useBusy();
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const others = players.filter((p) => !team.players.some((m) => m.playerId === p.id) && p.name.toLowerCase().includes(query));
  const withTeam = others.map((p) => ({ p, from: teamOf(teams, p.id) }));
  const free = withTeam.filter((x) => !x.from);
  const moving = withTeam.filter((x) => x.from);

  const add = (p: Player) =>
    busy.run(p.id, () => runAction(() => saveBowlingTeam(lid, { id: team.id, name: team.name, color: team.color, players: rosterWith(team, p.id) }), `${p.name} entró a ${team.name}`));

  const row = ({ p, from }: { p: Player; from: BowlingTeam | null }, i: number) => (
    <View key={p.id}>
      {i > 0 && <Divider inset={20} />}
      <DenseRow
        leading={<Avatar name={p.name} size={36} />}
        title={p.name}
        subtitle={from ? `En ${from.name}: se cambia` : undefined}
        value={averages.get(p.id) || undefined}
        onPress={() => void add(p)}
        accessibilityLabel={`Agregar a ${p.name}${from ? ` (sale de ${from.name})` : ''}`}
        trailing={busy.isBusy(p.id) ? <RowSpinner /> : <Plus size={20} color={c.accent} />}
      />
    </View>
  );

  const group = (label: string, rows: typeof withTeam) => (
    <View>
      <Txt tone="muted" accessibilityRole="header" style={{ marginBottom: 8, fontSize: 14, fontFamily: font.medium }}>
        {label}
      </Txt>
      <Card padded={false} style={{ borderWidth: StyleSheet.hairlineWidth, borderColor: c.line }}>
        {rows.map(row)}
      </Card>
    </View>
  );

  return (
    <Sheet open onClose={onClose} title={`Agregar a ${team.name}`} subtitle={teamLine(team, averages)}>
      <View style={{ gap: 16, paddingBottom: 4 }}>
        {players.length > 8 && (
          <View style={{ justifyContent: 'center' }}>
            <Search size={16} color={c.muted} style={{ position: 'absolute', left: 12, zIndex: 1 }} />
            <Input value={q} onChangeText={setQ} placeholder="Buscar jugador" accessibilityLabel="Buscar jugador" returnKeyType="search" clearButtonMode="while-editing" style={{ paddingLeft: 36 }} />
          </View>
        )}
        {free.length > 0 && group('Sin equipo', free)}
        {moving.length > 0 && group('En otro equipo', moving)}
        {!others.length && (
          <Txt variant="meta" tone="muted">
            {query ? 'Nadie con ese nombre.' : 'Todos los jugadores de la liga ya están en este equipo.'}
          </Txt>
        )}
      </View>
    </Sheet>
  );
}
