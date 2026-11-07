/**
 * Presentes de la mesa anotadora (PresentesModal.tsx de la web, con la lógica de src/pages/sports/team/presentes.ts):
 * quién vino de cada equipo (de ahí salen los partidos jugados), los que dijeron «Voy», todos o ninguno, y los
 * refuerzos de la liga hasta el límite. Arranca con la lista que ya tiene la mesa o con la convocatoria.
 */
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { CheckSquare, Square, UserPlus, X } from 'lucide-react-native';
import type { Match } from '@mm/lib/data/matches';
import type { MatchRsvp } from '@mm/lib/data/teamSports';
import type { Side } from '@mm/sports/types';
import { rosterOf, teamColor } from '@mm/pages/sports/team/logic';
import { presentEntries, presentStart, reinforcementCandidates, togglePresent, type PresentEntry } from '@mm/pages/sports/team/presentes';
import type { TeamLeague } from '@mm/pages/sports/team/useTeamLeague';
import { PickField } from '../../players/fields';
import { Jersey, RsvpBadge } from '../../team/TeamBits';
import { Button, Field, Segmented, Sheet, Txt } from '../../ui';
import { useColors } from '@/theme/theme';

/** Se muestra al montarla (la mesa la pone solo mientras está abierta: así arranca con la lista de ese momento). */
export function PresentesSheet({
  onClose,
  tl,
  match: m,
  rsvps,
  current,
  reinforcements,
  onSave,
}: {
  onClose: () => void;
  tl: TeamLeague;
  match: Match;
  /** La convocatoria del partido (useMatchRsvps de la mesa). */
  rsvps: readonly MatchRsvp[];
  current: [string[], string[]];
  reinforcements: number;
  onSave: (side: Side, players: PresentEntry[]) => void;
}) {
  const c = useColors();
  const [tab, setTab] = useState<'1' | '2'>('1');
  const [picked, setPicked] = useState<[string[], string[]]>(() => presentStart(current, rsvps, m.id));
  const rosters = [rosterOf(tl.allTeams.data, m.sides[0].teamId), rosterOf(tl.allTeams.data, m.sides[1].teamId)] as const;

  const i = tab === '1' ? 0 : 1;
  const side = m.sides[i];
  const color = teamColor(tl.teamOf(side.teamId), i + 1);
  const roster = rosters[i];
  const rosterIds = new Set(roster.map((r) => r.playerId));
  const extras = picked[i].filter((id) => !rosterIds.has(id));
  const candidates = reinforcementCandidates(tl.players.data, picked, rosters);
  const full = extras.length >= reinforcements;

  const toggle = (id: string) => setPicked((p) => togglePresent(p, i, id));
  const setSide = (ids: string[]) =>
    setPicked((p) => {
      const next: [string[], string[]] = [[...p[0]], [...p[1]]];
      next[i] = ids;
      return next;
    });
  const statusOf = (pid: string) => rsvps.find((r) => r.matchId === m.id && r.playerId === pid)?.status;

  const save = () => {
    for (const [s, list] of presentEntries(picked, rosters)) onSave(s, list);
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Presentes"
      subtitle="Cuenta como partido jugado para cada uno"
      footer={
        <Button variant="primary" size="lg" full onPress={save}>
          {`Guardar presentes (${picked[0].length} y ${picked[1].length})`}
        </Button>
      }
    >
      <Segmented<'1' | '2'>
        label="Equipo"
        value={tab}
        onChange={setTab}
        options={m.sides.map((s, k) => ({ key: String(k + 1) as '1' | '2', label: `${tl.teamOf(s.teamId)?.name ?? s.label} ${picked[k].length}` }))}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Button size="lg" onPress={() => setSide(roster.filter((r) => statusOf(r.playerId) === 'yes').map((r) => r.playerId).concat(extras))}>
          Los que dijeron «Voy»
        </Button>
        <Button size="lg" onPress={() => setSide([...roster.map((r) => r.playerId), ...extras])}>
          Todos
        </Button>
        <Button size="lg" variant="ghost" onPress={() => setSide([])}>
          Ninguno
        </Button>
      </View>
      {!roster.length && (
        <Txt variant="meta" tone="muted">
          Este equipo no tiene plantilla. Agrega refuerzos o arma la plantilla en Organizar › Equipos.
        </Txt>
      )}
      <View style={{ gap: 4 }}>
        {roster.map((r) => {
          const on = picked[i].includes(r.playerId);
          const Box = on ? CheckSquare : Square;
          return (
            <Pressable
              key={r.playerId}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={tl.nameOf(r.playerId)}
              onPress={() => toggle(r.playerId)}
              style={({ pressed }) => ({ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, paddingHorizontal: 12, backgroundColor: on ? c.accentSoft : pressed ? c.surface2 : 'transparent' })}
            >
              <Box size={20} color={on ? c.accent : c.muted} />
              <Jersey n={r.jersey} color={on ? color : undefined} />
              <Txt numberOfLines={1} style={{ flex: 1, minWidth: 0, fontSize: 15 }}>
                {tl.nameOf(r.playerId)}
              </Txt>
              <RsvpBadge status={statusOf(r.playerId)} />
            </Pressable>
          );
        })}
      </View>
      <View style={{ gap: 8, borderRadius: 20, backgroundColor: c.surface2, padding: 16 }}>
        <Txt variant="bodyStrong" style={{ fontSize: 15 }}>{`Refuerzos (${extras.length} de ${reinforcements})`}</Txt>
        {extras.map((pid) => (
          <View key={pid} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <UserPlus size={16} color={c.muted} />
            <Txt variant="meta" numberOfLines={1} style={{ flex: 1 }}>
              {tl.nameOf(pid)}
            </Txt>
            <Button variant="ghost" size="lg" icon={<X size={16} color={c.fg} />} accessibilityLabel={`Quitar a ${tl.nameOf(pid)}`} onPress={() => toggle(pid)} />
          </View>
        ))}
        {reinforcements > 0 && (
          <Field label="Agregar refuerzo" hint={full ? `La liga permite ${reinforcements} por partido.` : 'Jugadores de la liga que no son de ningún equipo de este partido.'}>
            <PickField
              label="Agregar refuerzo"
              disabled={full || !candidates.length}
              value=""
              onChange={(id) => id && toggle(id)}
              options={[{ key: '', label: candidates.length ? 'Elige un jugador…' : 'No hay más jugadores en la liga' }, ...candidates.map((p) => ({ key: p.id, label: p.name }))]}
            />
          </Field>
        )}
      </View>
    </Sheet>
  );
}
