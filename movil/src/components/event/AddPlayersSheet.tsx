import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Check, Plus, Search } from 'lucide-react-native';
import { addEntries, createPlayer, fetchEffectiveAverages } from '@mm/lib/data';
import type { MinorInput } from '@mm/lib/data/players';
import { useLeagueCtx } from '@mm/lib/league';
import type { BowlingEvent, Entry, Player } from '@mm/lib/types';
import { emptyGuardian, guardianProblem, type GuardianDraft } from '@mm/components/players/logic';
import { addPlayersEmptyText, addPlayersSearch, addPlayersTitle, enrolledText } from '@mm/components/event/sheet';
import { useBusy } from '@/components/bowlingTeams/parts';
import { GuardianFields, MinorCheck } from '@/components/players/fields';
import { runAction } from '@/components/swimming/parts';
import { Button, Card, ErrorNote, Input, Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/**
 * «Agregar asistentes» de la Planilla (AddPlayersModal de la web, con su misma lógica: sheet.ts): buscar, marcar a los
 * del club que vinieron (o «Seleccionar todos») y «Agregar N»; si el nombre es nuevo, «Crear “…” y agregarlo» (en una
 * liga con menores, primero pregunta si es menor y su tutor). Se inscriben con el promedio de su temporada.
 */
export function AddPlayersSheet({ event, entries, players, onClose }: { event: BowlingEvent; entries: Entry[]; players: Player[]; onClose: () => void }) {
  const c = useColors();
  const { lid, league } = useLeagueCtx();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const newOne = useBusy();
  // Liga con menores: «Es menor de edad» y su tutor salen solo después de tocar «Crear…».
  const [creating, setCreating] = useState(false);
  const [isMinor, setIsMinor] = useState(true);
  const [guardian, setGuardian] = useState<GuardianDraft>(emptyGuardian);
  const [minorError, setMinorError] = useState<string | null>(null);

  const { available, filtered, canCreate } = addPlayersSearch(players, entries, q);
  const showMinor = !!league.hasMinors && creating && canCreate;

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  /** Lo del menor para crear al jugador (null = no es menor; undefined = falta algo del tutor). */
  function takeMinor(): MinorInput | null | undefined {
    if (!league.hasMinors || !isMinor) return null;
    const problem = guardianProblem(guardian);
    setMinorError(problem);
    if (problem) return undefined;
    return { guardianName: guardian.guardianName, guardianPhone: guardian.guardianPhone, consent: guardian.consent };
  }

  async function createAndPick() {
    // Primer toque en una liga con menores: pregunta si es menor (y su tutor) antes de crearlo.
    if (league.hasMinors && !creating) {
      setCreating(true);
      return;
    }
    const m = takeMinor();
    if (m === undefined) return;
    const id = await newOne.run('crear', () => runAction(() => createPlayer(lid, q, null, m), 'Jugador creado'));
    if (id) {
      setPicked((s) => new Set(s).add(id));
      setQ('');
      setCreating(false);
      setIsMinor(true);
      setGuardian(emptyGuardian);
      setMinorError(null);
    }
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    const chosen = players.filter((p) => picked.has(p.id));
    await runAction(async () => {
      const averages = await fetchEffectiveAverages(lid, chosen, { date: event.date, eventId: event.id });
      await addEntries(lid, event, chosen.map((p) => ({ id: p.id, average: averages.get(p.id) ?? 0 })));
    }, enrolledText(chosen.length));
    setBusy(false);
    onClose();
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={addPlayersTitle(event.type)}
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button onPress={onClose} style={{ flex: 1 }}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!picked.size} loading={busy} onPress={() => void save()} style={{ flex: 1 }}>
            {`Agregar ${picked.size || ''}`.trim()}
          </Button>
        </View>
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Search size={18} color={c.muted} style={{ position: 'absolute', left: 16, zIndex: 1 }} />
        <Input
          accessibilityLabel="Buscar o escribir un nombre nuevo"
          placeholder="Buscar o escribir un nombre nuevo"
          value={q}
          onChangeText={(t) => {
            setQ(t);
            // Borró el nombre: vuelve a buscar (sin el tutor abierto).
            if (!t.trim()) setCreating(false);
          }}
          autoCorrect={false}
          style={{ flex: 1, paddingLeft: 44 }}
        />
      </View>
      {canCreate && (
        <Button icon={<Plus size={16} color={c.fg} />} loading={newOne.isBusy()} onPress={() => void createAndPick()}>
          {`Crear “${q.trim()}” y agregarlo`}
        </Button>
      )}
      {showMinor && (
        <View style={{ gap: 12, borderRadius: 16, padding: 16, backgroundColor: c.surface2 }}>
          <MinorCheck checked={isMinor} onChange={setIsMinor} />
          {isMinor && <GuardianFields value={guardian} onChange={setGuardian} />}
          {!!minorError && isMinor && <ErrorNote>{minorError}</ErrorNote>}
        </View>
      )}
      <Card padded={false} style={{ borderWidth: StyleSheet.hairlineWidth, borderColor: c.line }}>
        {filtered.map((p, i) => {
          const on = picked.has(p.id);
          return (
            <Pressable
              key={p.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={p.name}
              onPress={() => toggle(p.id)}
              style={[styles.row, { backgroundColor: on ? c.accentSoft : 'transparent', borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderTopColor: c.line }]}
            >
              <View style={[styles.box, { borderColor: on ? c.accent : c.line, backgroundColor: on ? c.accent : 'transparent' }]}>{on && <Check size={14} color={c.accentFg} />}</View>
              <Txt style={{ flex: 1 }} numberOfLines={1}>
                {p.name}
              </Txt>
            </Pressable>
          );
        })}
        {filtered.length === 0 && (
          <Txt variant="meta" tone="muted" style={{ textAlign: 'center', paddingVertical: 24, paddingHorizontal: 12 }}>
            {addPlayersEmptyText(players.length, available.length)}
          </Txt>
        )}
      </Card>
      {available.length > 0 && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Txt variant="small" tone="muted">{`${picked.size} seleccionados`}</Txt>
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setPicked(new Set(filtered.map((p) => p.id)))} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Txt variant="small" tone="accent" style={{ fontFamily: font.semibold }}>
              Seleccionar todos
            </Txt>
          </Pressable>
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 14, paddingVertical: 10 },
  box: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
