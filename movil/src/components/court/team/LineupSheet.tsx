/**
 * La alineación del acta de fútbol y sala (LineupModal.tsx de la web, con la lógica de src/pages/sports/football/lineup.ts):
 * los titulares de cada equipo (hasta los que van en la cancha) y el portero con el guante; los que dijeron «Voy» o
 * ninguno; los suspendidos marcados (la app avisa, no bloquea) y los refuerzos de la liga hasta el límite. Se muestra
 * al montarla (el acta la pone solo mientras está abierta: arranca con lo que tiene el acta o con la convocatoria).
 */
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { AlertTriangle, CheckSquare, Hand, Square, UserPlus, X } from 'lucide-react-native';
import type { Match, PlayerDraft } from '@mm/lib/data/matches';
import type { MatchRsvp } from '@mm/lib/data/teamSports';
import type { Suspended } from '@mm/sports/team/discipline';
import type { Side } from '@mm/sports/types';
import { REASON_TEXT } from '@mm/pages/sports/football/rules';
import { changedSides, lineupEntries, lineupStart, toggleKeeper, toggleStarter, type LineupSide } from '@mm/pages/sports/football/lineup';
import { rosterOf, teamColor } from '@mm/pages/sports/team/logic';
import type { TeamLeague } from '@mm/pages/sports/team/useTeamLeague';
import { PickField } from '../../players/fields';
import { Jersey, RsvpBadge } from '../../team/TeamBits';
import { Badge, Button, Field, Segmented, Sheet, Txt } from '../../ui';
import { useColors } from '@/theme/theme';

export function LineupSheet({
  onClose,
  tl,
  match: m,
  rsvps,
  current,
  players,
  reinforcements,
  suspended,
  onSave,
}: {
  onClose: () => void;
  tl: TeamLeague;
  match: Match;
  /** La convocatoria del partido (useMatchRsvps del acta). */
  rsvps: readonly MatchRsvp[];
  current: [LineupSide, LineupSide];
  /** Jugadores en cancha por equipo (11, 7, 5). */
  players: number;
  reinforcements: number;
  suspended: readonly Suspended[];
  onSave: (side: Side, lineup: LineupSide, entries: PlayerDraft[]) => void;
}) {
  const c = useColors();
  const rosters = [rosterOf(tl.allTeams.data, m.sides[0].teamId), rosterOf(tl.allTeams.data, m.sides[1].teamId)] as const;
  const [tab, setTab] = useState<'1' | '2'>('1');
  const [start] = useState(() => lineupStart(current, rsvps, m.id, rosters, players));
  const [picked, setPicked] = useState<[LineupSide, LineupSide]>(start.picked);
  const [extras, setExtras] = useState<[string[], string[]]>(start.extras);

  const i = tab === '1' ? 0 : 1;
  const side = m.sides[i];
  const color = teamColor(tl.teamOf(side.teamId), i + 1);
  const roster = rosters[i];
  const mine = picked[i];
  const list = [...roster.map((r) => r.playerId), ...extras[i]];
  const taken = new Set([...rosters[0], ...rosters[1]].map((r) => r.playerId).concat(extras[0], extras[1]));
  const candidates = tl.players.data.filter((p) => !taken.has(p.id)).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const susp = new Map(suspended.filter((s) => s.team === side.teamId).map((s) => [s.player, s] as const));
  const full = mine.starters.length >= players;
  const statusOf = (pid: string) => rsvps.find((r) => r.matchId === m.id && r.playerId === pid)?.status;
  const jersey = (pid: string) => roster.find((r) => r.playerId === pid)?.jersey ?? null;
  const warnings = mine.starters.filter((id) => susp.has(id));

  const update = (next: LineupSide) =>
    setPicked((p) => {
      const out: [LineupSide, LineupSide] = [p[0], p[1]];
      out[i] = next;
      return out;
    });
  const toggle = (id: string) => {
    const next = toggleStarter(mine, id, players);
    if (next !== mine) update(next);
  };
  const setKeeper = (id: string) => {
    const next = toggleKeeper(mine, id, players);
    if (next !== mine) update(next);
  };
  const setExtrasOf = (fn: (ids: string[]) => string[]) =>
    setExtras((e) => {
      const out: [string[], string[]] = [[...e[0]], [...e[1]]];
      out[i] = fn(out[i]);
      return out;
    });

  const save = () => {
    for (const s of changedSides(picked, current)) onSave(s, picked[s - 1], lineupEntries(picked[s - 1], rosters[s - 1]));
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Alineación"
      subtitle={`Los ${players} titulares de cada equipo`}
      footer={
        <Button variant="primary" size="lg" full onPress={save}>
          {`Guardar (${picked[0].starters.length} y ${picked[1].starters.length})`}
        </Button>
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        <Txt variant="meta" tone="muted">
          Toca
        </Txt>
        <Hand size={16} color={c.muted} accessibilityLabel="el guante" />
        <Txt variant="meta" tone="muted">
          para el portero. Los que entran de cambio se suman solos.
        </Txt>
      </View>
      <Segmented<'1' | '2'>
        label="Equipo"
        value={tab}
        onChange={setTab}
        options={m.sides.map((s, k) => ({ key: String(k + 1) as '1' | '2', label: `${tl.teamOf(s.teamId)?.name ?? s.label} ${picked[k].starters.length}` }))}
      />
      {warnings.length > 0 && (
        <View accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 16, backgroundColor: c.dangerSoft, paddingHorizontal: 14, paddingVertical: 10 }}>
          <AlertTriangle size={16} color={c.danger} style={{ marginTop: 2 }} />
          <Txt variant="meta" tone="danger" style={{ flex: 1 }}>
            {`${warnings.map((id) => tl.nameOf(id)).join(', ')} ${warnings.length === 1 ? 'está suspendido' : 'están suspendidos'} para este partido. Si juega, sale como alineación indebida (el admin decide).`}
          </Txt>
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <Button size="lg" onPress={() => update({ starters: list.filter((pid) => statusOf(pid) === 'yes').slice(0, players), goalkeeper: null })}>
          Los que dijeron «Voy»
        </Button>
        <Button size="lg" variant="ghost" onPress={() => update({ starters: [], goalkeeper: null })}>
          Ninguno
        </Button>
        <Txt variant="meta" tone={full ? 'accent' : 'muted'} style={{ marginLeft: 'auto', fontVariant: ['tabular-nums'] }}>
          {`${mine.starters.length} de ${players}`}
        </Txt>
      </View>
      {!roster.length && !extras[i].length && (
        <Txt variant="meta" tone="muted">
          Este equipo no tiene plantilla. Arma la plantilla en Organizar › Equipos.
        </Txt>
      )}
      <View style={{ gap: 4 }}>
        {list.map((pid) => {
          const on = mine.starters.includes(pid);
          const gk = mine.goalkeeper === pid;
          const s = susp.get(pid);
          const Box = on ? CheckSquare : Square;
          return (
            <View key={pid} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on, disabled: !on && full }}
                accessibilityLabel={tl.nameOf(pid)}
                disabled={!on && full}
                onPress={() => toggle(pid)}
                style={({ pressed }) => ({
                  flex: 1,
                  minWidth: 0,
                  minHeight: 56,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  borderRadius: 16,
                  paddingHorizontal: 12,
                  opacity: !on && full ? 0.5 : 1,
                  backgroundColor: on ? c.accentSoft : pressed ? c.surface2 : 'transparent',
                })}
              >
                <Box size={20} color={on ? c.accent : c.muted} />
                <Jersey n={jersey(pid)} color={on ? color : undefined} />
                <Txt numberOfLines={1} style={{ flex: 1, minWidth: 0, fontSize: 15 }}>
                  {tl.nameOf(pid)}
                </Txt>
                {s && <Badge tone="danger">Suspendido</Badge>}
                {!s && extras[i].includes(pid) && <Badge>Refuerzo</Badge>}
                {!s && !extras[i].includes(pid) && <RsvpBadge status={statusOf(pid)} />}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: gk }}
                accessibilityLabel={gk ? `${tl.nameOf(pid)} es el portero` : `Poner a ${tl.nameOf(pid)} de portero`}
                onPress={() => setKeeper(pid)}
                style={({ pressed }) => ({ width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: gk ? c.accent : c.surface2, opacity: pressed ? 0.85 : 1 })}
              >
                <Hand size={20} color={gk ? c.accentFg : c.fg} />
              </Pressable>
            </View>
          );
        })}
      </View>
      {susp.size > 0 && (
        <Txt variant="small" tone="muted" style={{ fontSize: 13 }}>
          {`Suspendidos: ${[...susp.values()].map((s) => `${tl.nameOf(s.player)} (${REASON_TEXT[s.reason] ?? s.reason})`).join(', ')}.`}
        </Txt>
      )}
      {reinforcements > 0 && (
        <View style={{ gap: 8, borderRadius: 20, backgroundColor: c.surface2, padding: 16 }}>
          <Txt variant="bodyStrong" style={{ fontSize: 15 }}>{`Refuerzos (${extras[i].length} de ${reinforcements})`}</Txt>
          {extras[i].map((pid) => (
            <View key={pid} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <UserPlus size={16} color={c.muted} />
              <Txt variant="meta" numberOfLines={1} style={{ flex: 1 }}>
                {tl.nameOf(pid)}
              </Txt>
              <Button
                variant="ghost"
                size="lg"
                icon={<X size={16} color={c.fg} />}
                accessibilityLabel={`Quitar a ${tl.nameOf(pid)}`}
                onPress={() => {
                  setExtrasOf((ids) => ids.filter((x) => x !== pid));
                  update({ starters: mine.starters.filter((x) => x !== pid), goalkeeper: mine.goalkeeper === pid ? null : mine.goalkeeper });
                }}
              />
            </View>
          ))}
          <Field label="Agregar refuerzo">
            <PickField
              label="Agregar refuerzo"
              disabled={extras[i].length >= reinforcements || !candidates.length}
              value=""
              onChange={(id) => id && setExtrasOf((ids) => [...ids, id])}
              options={[{ key: '', label: candidates.length ? 'Elige un jugador…' : 'No hay más jugadores en la liga' }, ...candidates.map((p) => ({ key: p.id, label: p.name }))]}
            />
          </Field>
        </View>
      )}
    </Sheet>
  );
}
