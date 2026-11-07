/**
 * Admin: corregir el acta de un partido de fútbol o sala ya anotado (ActaEditor.tsx de la web, con la lógica de
 * src/pages/sports/football/acta.ts): goles, penales y, por jugador, si jugó, goles, asistencias, autogoles,
 * amarillas, roja directa y portero. De aquí salen goleadores, tarjetas, vallas invictas y las suspensiones. Queda
 * confirmado (con historial). Se muestra al montarla (el «•••» del partido la pone solo mientras está abierta).
 */
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Check, Minus, Plus, Trash2 } from 'lucide-react-native';
import { adminCorrectResult, type Match } from '@mm/lib/data/matches';
import { saveErrorMessage } from '@mm/lib/errorText';
import type { Side } from '@mm/sports/types';
import { actaCandidates, actaCheck, newActaLine, withYellows } from '@mm/pages/sports/football/acta';
import { correctedScore, decodeLines, pensFromScore, type ScoreLine } from '@mm/pages/sports/football/adapter';
import { rosterOf } from '@mm/pages/sports/team/logic';
import type { TeamLeague } from '@mm/pages/sports/team/useTeamLeague';
import { toast } from '../../feedback';
import { PickField } from '../../players/fields';
import { Button, Field, Input, Segmented, Sheet, Txt } from '../../ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

function Stepper({ label, value, onChange, max = 20 }: { label: string; value: number; onChange: (n: number) => void; max?: number }) {
  const c = useColors();
  const round = (off: boolean) => ({ width: 40, height: 44, alignItems: 'center' as const, justifyContent: 'center' as const, opacity: off ? 0.4 : 1 });
  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <Txt style={{ fontSize: 11, fontFamily: font.semibold, color: c.muted }}>{label}</Txt>
      <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 12, backgroundColor: c.surface2 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Menos ${label}`} disabled={value <= 0} onPress={() => onChange(value - 1)} style={round(value <= 0)}>
          <Minus size={16} color={c.fg} />
        </Pressable>
        <Txt style={{ width: 20, textAlign: 'center', fontSize: 17, fontFamily: font.bold, fontVariant: ['tabular-nums'] }}>{value}</Txt>
        <Pressable accessibilityRole="button" accessibilityLabel={`Más ${label}`} disabled={value >= max} onPress={() => onChange(value + 1)} style={round(value >= max)}>
          <Plus size={16} color={c.fg} />
        </Pressable>
      </View>
    </View>
  );
}

function CheckLabel({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: !!disabled }}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }}
    >
      <View style={{ width: 20, height: 20, borderRadius: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: checked ? c.accent : c.surface, borderWidth: checked ? 0 : 1.5, borderColor: c.faint, opacity: disabled ? 0.5 : 1 }}>
        {checked && <Check size={14} color={c.accentFg} strokeWidth={3} />}
      </View>
      <Txt variant="meta" tone={disabled ? 'muted' : 'fg'}>
        {label}
      </Txt>
    </Pressable>
  );
}

export function ActaEditorSheet({ tl, match: m, onClose }: { tl: TeamLeague; match: Match; onClose: () => void }) {
  const c = useColors();
  const [tab, setTab] = useState<'1' | '2'>('1');
  const [lines, setLines] = useState<ScoreLine[]>(() => decodeLines(m.score?.lines));
  const [goals, setGoals] = useState<[string, string]>(() => {
    const s = m.score?.sides;
    return [String(s?.[0] ?? 0), String(s?.[1] ?? 0)];
  });
  const [pens, setPens] = useState<[string, string]>(() => {
    const p = pensFromScore(m.score);
    return p ? [String(p[0]), String(p[1])] : ['', ''];
  });
  const [busy, setBusy] = useState(false);

  const side = (tab === '1' ? 1 : 2) as Side;
  const names = m.sides.map((s) => tl.teamOf(s.teamId)?.name ?? s.label);
  const roster = rosterOf(tl.allTeams.data, m.sides[side - 1].teamId);
  const mine = lines.filter((l) => l.side === side);
  const candidates = actaCandidates(
    roster.map((r) => r.playerId),
    tl.players.data.map((p) => p.id),
    lines,
  );
  const { a, b, pa, pb, tied, pensSet, valid, mismatch } = actaCheck(goals, pens, lines);

  const patch = (id: string, p: Partial<ScoreLine>) => setLines((ls) => ls.map((l) => (l.side === side && l.playerId === id ? { ...l, ...p } : l)));
  const add = (id: string) => {
    if (!id) return;
    setLines((ls) => [...ls, newActaLine(id, side)]);
  };

  const save = async () => {
    if (!valid || a === null || b === null || busy) return;
    setBusy(true);
    const { score, winner } = correctedScore({ old: m.score, lines, sides: [a, b], pens: pensSet ? [pa!, pb!] : null });
    try {
      await adminCorrectResult(tl.lid, m.id, { score, winner, note: 'Acta corregida' });
      toast('Acta corregida');
      onClose();
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const half = { flexBasis: '47%', flexGrow: 1 } as const;
  return (
    <Sheet
      open
      onClose={onClose}
      title="Corregir el acta"
      subtitle="Al guardar, el resultado queda confirmado"
      footer={
        <Button variant="primary" size="lg" full loading={busy} disabled={!valid} onPress={() => void save()}>
          Guardar el acta
        </Button>
      }
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <View style={half}>
          <Field label={`Goles ${names[0]}`}>
            <Input keyboardType="number-pad" value={goals[0]} onChangeText={(t) => setGoals([t, goals[1]])} />
          </Field>
        </View>
        <View style={half}>
          <Field label={`Goles ${names[1]}`}>
            <Input keyboardType="number-pad" value={goals[1]} onChangeText={(t) => setGoals([goals[0], t])} />
          </Field>
        </View>
        {tied && (
          <>
            <View style={half}>
              <Field label={`Penales ${names[0]}`} hint="Solo si hubo tanda">
                <Input keyboardType="number-pad" value={pens[0]} onChangeText={(t) => setPens([t, pens[1]])} />
              </Field>
            </View>
            <View style={half}>
              <Field label={`Penales ${names[1]}`}>
                <Input keyboardType="number-pad" value={pens[1]} onChangeText={(t) => setPens([pens[0], t])} />
              </Field>
            </View>
          </>
        )}
      </View>
      {pensSet && pa === pb && (
        <Txt variant="meta" tone="danger">
          La tanda de penales no termina empatada.
        </Txt>
      )}
      {mismatch && (
        <Txt variant="meta" tone="warn">
          Los goles por jugador suman más que el marcador: revisa.
        </Txt>
      )}

      <Segmented<'1' | '2'>
        label="Equipo"
        value={tab}
        onChange={setTab}
        options={([1, 2] as const).map((s) => ({ key: String(s) as '1' | '2', label: `${names[s - 1]} ${lines.filter((l) => l.side === s && l.played).length}` }))}
      />
      <View>
        {mine.map((l, k) => (
          <View key={l.playerId} style={{ gap: 8, paddingVertical: 12, borderTopWidth: k > 0 ? 1 : 0, borderTopColor: c.line }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Txt numberOfLines={1} style={{ flex: 1, minWidth: 0, fontSize: 15, fontFamily: font.semibold }}>
                {tl.nameOf(l.playerId)}
              </Txt>
              <CheckLabel label="Jugó" checked={l.played} onChange={(v) => patch(l.playerId, { played: v })} />
              <CheckLabel label="Portero" checked={l.keeper} onChange={(v) => patch(l.playerId, { keeper: v })} />
              <Button
                variant="ghost"
                size="lg"
                icon={<Trash2 size={16} color={c.fg} />}
                accessibilityLabel={`Quitar a ${tl.nameOf(l.playerId)} del acta`}
                onPress={() => setLines((ls) => ls.filter((x) => !(x.side === side && x.playerId === l.playerId)))}
              />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
              <Stepper label="Goles" value={l.goals} onChange={(n) => patch(l.playerId, { goals: n })} />
              <Stepper label="Asist." value={l.assists} onChange={(n) => patch(l.playerId, { assists: n })} />
              <Stepper label="Autogol" value={l.ownGoals} onChange={(n) => patch(l.playerId, { ownGoals: n })} />
              <Stepper label="Amarillas" value={l.yellows} max={2} onChange={(n) => patch(l.playerId, withYellows(l, n))} />
              <CheckLabel
                label={l.red === 'second_yellow' ? 'Roja (doble amarilla)' : 'Roja directa'}
                disabled={l.red === 'second_yellow'}
                checked={l.red === 'direct' || l.red === 'second_yellow'}
                onChange={(v) => patch(l.playerId, { red: v ? 'direct' : null })}
              />
            </View>
          </View>
        ))}
        {!mine.length && (
          <Txt variant="meta" tone="muted" style={{ paddingVertical: 12 }}>
            Nadie de este equipo en el acta todavía.
          </Txt>
        )}
      </View>
      <Field label="Agregar al acta">
        <PickField
          label="Agregar al acta"
          value=""
          onChange={add}
          options={[
            { key: '', label: candidates.length ? 'Elige un jugador…' : 'No hay más jugadores' },
            ...candidates.map((id) => ({ key: id, label: `${tl.nameOf(id)}${roster.some((r) => r.playerId === id) ? '' : ' (fuera de la plantilla)'}` })),
          ]}
        />
      </Field>
      <Txt variant="small" tone="muted" style={{ fontSize: 13 }}>
        Las suspensiones y las tablas se recalculan solas.
      </Txt>
    </Sheet>
  );
}
