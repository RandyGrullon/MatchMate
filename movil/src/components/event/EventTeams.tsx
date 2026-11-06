import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Pencil, Plus, Shield, Shuffle, Trash2, X } from 'lucide-react-native';
import { addTeam, deleteTeam, renameTeam, updateEntry } from '@mm/lib/data';
import { useLeagueCtx } from '@mm/lib/league';
import { category, entryHandicap } from '@mm/lib/stats';
import type { BowlingEvent, Entry, Player } from '@mm/lib/types';
import { entryNames, eventTeamList, nextTeamName, teamFull, teamMembers, teamTotals, unassignedEntries } from '@mm/components/bowlingTeams/eventTeams';
import { FixedTeamsCard } from '@/components/bowlingTeams/FixedTeamsCard';
import { RowSpinner, useBusy } from '@/components/bowlingTeams/parts';
import { confirmAsync } from '@/components/feedback';
import { runAction } from '@/components/swimming/parts';
import { Button, Card, Empty, Field, Input, Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { AutoTeamsSheet } from './AutoTeamsSheet';
import { BusySelect } from './BusySelect';
import { CategoryBadge } from './CategoryBadge';

/**
 * Torneo › Equipos (quien organiza; TeamsTab de la web, con su misma lógica): los equipos fijos de la liga, crear un
 * equipo, «Armar automáticamente», cada equipo con sus sumas y sus jugadores (quitar a uno, agregar de los que no
 * tienen), cambiarle el nombre o eliminarlo, y quiénes están sin equipo. Va dentro de LeagueScope.
 */
export function EventTeams({ event, entries, players }: { event: BowlingEvent; entries: Entry[]; players: Player[] }) {
  const c = useColors();
  const { lid } = useLeagueCtx();
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [auto, setAuto] = useState(false);
  // Crear, renombrar, borrar un equipo o sacar a alguien: una a la vez, con la ruedita en el que la hizo.
  const busy = useBusy();
  const nameOf: (e: Entry) => string = entryNames(players);
  const teams = eventTeamList(event);
  const unassigned = unassignedEntries(event, entries, nameOf);

  async function create() {
    if (busy.isBusy()) return;
    const n = name.trim() || nextTeamName(teams.length);
    setName('');
    await busy.run('crear', () => runAction(() => addTeam(lid, event.id, n), `${n} creado`));
  }

  async function remove(teamId: string, teamName: string, members: Entry[]) {
    const ok = await confirmAsync({
      title: `¿Eliminar ${teamName}?`,
      message: members.length ? `Sus ${members.length} jugadores quedan sin equipo.` : undefined,
      confirmText: 'Eliminar',
      danger: true,
    });
    if (ok) await busy.run(`del:${teamId}`, () => runAction(() => deleteTeam(lid, event.id, teamId, members.map((m) => m.id)), 'Equipo eliminado'));
  }

  async function saveName() {
    if (busy.isBusy()) return;
    // Se cierra cuando termina de guardar (la ruedita va en «Guardar»).
    if (renaming?.name.trim()) await busy.run('nombre', () => runAction(() => renameTeam(lid, event.id, renaming.id, renaming.name.trim())));
    setRenaming(null);
  }

  return (
    <View style={{ gap: 16 }}>
      {/* La liga tiene equipos fijos: se ponen aquí de una vez (y los que se inscriben después entran solos al suyo). */}
      <FixedTeamsCard event={event} entries={entries} />
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Input
              placeholder={nextTeamName(teams.length)}
              maxLength={60}
              value={name}
              onChangeText={setName}
              accessibilityLabel="Nombre del equipo"
              returnKeyType="done"
              onSubmitEditing={() => void create()}
              style={{ height: 48 }}
            />
          </View>
          <Button size="lg" icon={<Plus size={16} color={c.fg} />} loading={busy.isBusy('crear')} disabled={busy.isBusy()} onPress={() => void create()}>
            Crear
          </Button>
        </View>
        <Button variant="primary" size="lg" full icon={<Shuffle size={16} color={c.accentFg} />} disabled={entries.length < 2} onPress={() => setAuto(true)}>
          Armar automáticamente
        </Button>
      </View>

      {teams.length === 0 ? (
        <Empty icon={<Shield size={32} color={c.accent} />} title="Sin equipos" text="Arma los equipos automáticamente por promedio, o créalos y asígnales jugadores a mano." />
      ) : (
        <View style={{ gap: 12 }}>
          {teams.map(([teamId, team]) => {
            const members = teamMembers(entries, teamId, nameOf);
            const { avg, hcp } = teamTotals(members, event);
            const full = teamFull(event, members.length);
            return (
              <Card key={teamId} padded={false}>
                <View style={[styles.head, { borderBottomColor: c.line }]}>
                  <Shield size={16} color={c.accent} />
                  {/* Tocar el nombre: cambiarlo. */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={team.name}
                    accessibilityHint="Cambiar el nombre"
                    onPress={() => setRenaming({ id: teamId, name: team.name })}
                    style={{ flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }}
                  >
                    <Txt numberOfLines={1} style={{ flexShrink: 1, fontFamily: font.semibold }}>
                      {team.name}
                    </Txt>
                    <Pencil size={14} color={c.muted} />
                  </Pressable>
                  {!!event.teamSize && (
                    <Txt style={{ fontSize: 12, fontFamily: full ? font.medium : font.regular, color: full ? c.ok : c.muted }}>{`${members.length}/${event.teamSize}`}</Txt>
                  )}
                  <Button
                    variant="ghost"
                    accessibilityLabel="Eliminar equipo"
                    icon={<Trash2 size={16} color={c.fg} />}
                    loading={busy.isBusy(`del:${teamId}`)}
                    disabled={busy.isBusy()}
                    onPress={() => void remove(teamId, team.name, members)}
                  />
                </View>
                <View style={{ flexDirection: 'row', gap: 16, paddingHorizontal: 16, paddingTop: 8 }}>
                  <Txt tone="muted" style={{ fontSize: 12 }}>
                    Suma promedios <Txt style={{ fontSize: 12, fontFamily: font.bold }}>{String(avg)}</Txt>
                  </Txt>
                  <Txt tone="muted" style={{ fontSize: 12 }}>
                    Hcp equipo <Txt style={{ fontSize: 12, fontFamily: font.bold }}>{String(hcp)}</Txt>
                  </Txt>
                </View>
                <View style={{ paddingHorizontal: 8, paddingVertical: 8 }}>
                  {members.map((m) => (
                    <View key={m.id} style={styles.member}>
                      <CategoryBadge value={category(m.average, event.categoryCuts)} />
                      <Txt numberOfLines={1} style={{ flex: 1, minWidth: 0, fontSize: 14 }}>
                        {nameOf(m)}
                      </Txt>
                      <Txt tone="muted" style={{ fontSize: 12 }}>{`${m.average} · hcp ${entryHandicap(m, event)}`}</Txt>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Quitar a ${nameOf(m)} del equipo`}
                        accessibilityState={{ disabled: busy.isBusy(), busy: busy.isBusy(`out:${m.id}`) }}
                        disabled={busy.isBusy()}
                        hitSlop={6}
                        onPress={() => void busy.run(`out:${m.id}`, () => runAction(() => updateEntry(lid, m.id, { teamId: null })))}
                        style={({ pressed }) => [styles.out, { opacity: busy.isBusy() || pressed ? 0.6 : 1 }]}
                      >
                        {busy.isBusy(`out:${m.id}`) ? <RowSpinner /> : <X size={14} color={c.muted} />}
                      </Pressable>
                    </View>
                  ))}
                  {members.length === 0 && (
                    <Txt tone="muted" style={{ fontSize: 14, paddingHorizontal: 8, paddingVertical: 6 }}>
                      Sin jugadores
                    </Txt>
                  )}
                </View>
                {unassigned.length > 0 && !full && (
                  <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                    <BusySelect
                      value=""
                      label={`Agregar jugador a ${team.name}`}
                      options={[{ key: '', label: '+ Agregar jugador…' }, ...unassigned.map((u) => ({ key: u.id, label: `${nameOf(u)} (${u.average})` }))]}
                      onPick={(id) => (id ? runAction(() => updateEntry(lid, id, { teamId })) : undefined)}
                    />
                  </View>
                )}
              </Card>
            );
          })}
        </View>
      )}

      {entries.length > 0 && (
        <Card style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
          <Txt style={{ marginBottom: 8, fontSize: 14, fontFamily: font.semibold }} accessibilityRole="header">
            {`Sin equipo (${unassigned.length})`}
          </Txt>
          {unassigned.length === 0 ? (
            <Txt tone="muted" style={{ fontSize: 14 }}>
              Todos los inscritos tienen equipo.
            </Txt>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {unassigned.map((u) => (
                <View key={u.id} style={[styles.chip, { backgroundColor: c.surface2 }]}>
                  <Txt style={{ fontSize: 14 }}>
                    {`${nameOf(u)} `}
                    <Txt tone="muted" style={{ fontSize: 14 }}>
                      {String(u.average)}
                    </Txt>
                  </Txt>
                </View>
              ))}
            </View>
          )}
        </Card>
      )}

      {auto && <AutoTeamsSheet onClose={() => setAuto(false)} event={event} entries={entries} players={players} />}
      {renaming != null && (
        <Sheet
          open
          onClose={() => setRenaming(null)}
          title="Renombrar equipo"
          footer={
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button size="lg" onPress={() => setRenaming(null)}>
                Cancelar
              </Button>
              <View style={{ flex: 1 }}>
                <Button variant="primary" size="lg" full loading={busy.isBusy('nombre')} onPress={() => void saveName()}>
                  Guardar
                </Button>
              </View>
            </View>
          }
        >
          <Field label="Nombre">
            <Input
              autoFocus
              maxLength={60}
              value={renaming.name}
              onChangeText={(v) => setRenaming((r) => r && { ...r, name: v })}
              accessibilityLabel="Nombre"
              returnKeyType="done"
              onSubmitEditing={() => void saveName()}
            />
          </Field>
        </Sheet>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 16, paddingRight: 4, paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  member: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  out: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
});
