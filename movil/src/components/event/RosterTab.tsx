/**
 * Torneo › Inscritos (RosterTab de la web, la pestaña de Pro de quien organiza un torneo, con su misma lógica:
 * src/components/event/roster.ts): «Inscribir jugadores» (AddPlayersSheet), «Actualizar promedios» (el de la temporada de
 * cada uno, antes de empezar) y cada inscrito con su categoría, su equipo (con cupo), su promedio y su handicap (vacío =
 * se calcula solo; un número lo fija) y sacarlo del torneo. Va dentro de LeagueScope.
 */
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';
import { RefreshCw, UserPlus, Users, X } from 'lucide-react-native';
import { fetchEffectiveAverages, removeEntry, updateEntries, updateEntry } from '@mm/lib/data';
import { useLeagueCtx } from '@mm/lib/league';
import { calcHandicap, category } from '@mm/lib/stats';
import type { BowlingEvent, Entry, Player } from '@mm/lib/types';
import {
  ROSTER_EMPTY,
  SYNC_AVERAGES_CONFIRM,
  SYNC_AVERAGES_DONE,
  enrolledCount,
  hcpRuleText,
  numberCellCommit,
  removeFromTourneyConfirm,
  removedFromTourneyText,
  rosterOrder,
  rosterTeamOptions,
} from '@mm/components/event/roster';
import { useBusy } from '@/components/bowlingTeams/parts';
import { confirmAsync } from '@/components/feedback';
import { Avatar } from '@/components/social/Avatar';
import { runAction } from '@/components/swimming/parts';
import { Badge, Button, Card, Empty, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { AddPlayersSheet } from './AddPlayersSheet';
import { BusySelect } from './BusySelect';
import { CategoryBadge } from './CategoryBadge';

export function RosterTab({ event, entries, players }: { event: BowlingEvent; entries: Entry[]; players: Player[] }) {
  const c = useColors();
  const { lid } = useLeagueCtx();
  const [adding, setAdding] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const removing = useBusy();
  const byId = new Map(players.map((p) => [p.id, p]));
  const sorted = rosterOrder(entries, (id) => byId.get(id)?.name);

  async function remove(entry: Entry) {
    const name = byId.get(entry.playerId)?.name ?? 'jugador';
    const played = entry.scores?.some((s) => s != null) ?? false;
    const ok = await confirmAsync(removeFromTourneyConfirm(name, played));
    if (ok) await removing.run(entry.id, () => runAction(() => removeEntry(lid, entry), removedFromTourneyText(name)));
  }

  // true si se guardó: la casilla deja lo escrito hasta que llega el número nuevo.
  const saveEntry = (id: string, patch: Parameters<typeof updateEntry>[2]) => runAction(() => updateEntry(lid, id, patch).then(() => true));

  async function syncAverages() {
    const ok = await confirmAsync(SYNC_AVERAGES_CONFIRM);
    if (!ok) return;
    setSyncing(true);
    await runAction(async () => {
      const avgs = await fetchEffectiveAverages(
        lid,
        entries.map((e) => ({ id: e.playerId, averageOverride: byId.get(e.playerId)?.averageOverride ?? null })),
        { date: event.date, eventId: event.id },
      );
      await updateEntries(lid, entries.map((e) => ({ id: e.id, patch: { average: avgs.get(e.playerId) ?? 0 } })));
    }, SYNC_AVERAGES_DONE);
    setSyncing(false);
  }

  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <Button variant="primary" icon={<UserPlus size={16} color={c.accentFg} />} onPress={() => setAdding(true)}>
          Inscribir jugadores
        </Button>
        {entries.length > 0 && (
          <Button icon={<RefreshCw size={16} color={c.fg} />} loading={syncing} onPress={() => void syncAverages()}>
            Actualizar promedios
          </Button>
        )}
        <Txt variant="meta" tone="muted" style={{ marginLeft: 'auto' }}>
          {enrolledCount(entries.length)}
        </Txt>
      </View>

      {entries.length === 0 ? (
        <Empty icon={<Users size={28} color={c.accent} />} title={ROSTER_EMPTY.title} text={ROSTER_EMPTY.text} />
      ) : (
        <Card padded={false} style={{ overflow: 'hidden' }}>
          {sorted.map((e, i) => {
            const name = byId.get(e.playerId)?.name ?? '(jugador borrado)';
            const auto = calcHandicap(e.average, event.hcpBase, event.hcpPercent);
            return (
              <View key={e.id} style={[styles.row, i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Avatar name={name} size={32} />
                  <Txt variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {name}
                  </Txt>
                  <CategoryBadge value={category(e.average, event.categoryCuts)} />
                  <View style={{ flex: 1 }} />
                  <Button
                    variant="ghost"
                    accessibilityLabel={`Sacar a ${name}`}
                    loading={removing.isBusy(e.id)}
                    disabled={removing.isBusy()}
                    onPress={() => void remove(e)}
                    icon={<X size={16} color={c.muted} />}
                  />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
                  <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                    <Txt tone="muted" style={{ fontSize: 11 }}>
                      Equipo
                    </Txt>
                    <BusySelect
                      label="Equipo"
                      value={e.teamId ?? ''}
                      // Los equipos llenos se ven («· lleno») pero no se eligen.
                      options={rosterTeamOptions(event, entries, e.teamId)}
                      onPick={(v) => runAction(() => updateEntry(lid, e.id, { teamId: v || null }))}
                    />
                  </View>
                  <View style={{ alignItems: 'center', gap: 4 }}>
                    <Txt tone="muted" style={{ fontSize: 11 }}>
                      Promedio
                    </Txt>
                    <NumberCell label={`Promedio de ${name}`} value={e.average} onCommit={(v) => saveEntry(e.id, { average: v ?? 0 })} />
                  </View>
                  <View style={{ alignItems: 'center', gap: 4 }}>
                    <Txt tone="muted" style={{ fontSize: 11 }}>
                      Handicap
                    </Txt>
                    <NumberCell
                      label={`Handicap de ${name}`}
                      value={e.handicapOverride}
                      placeholder={String(auto)}
                      allowEmpty
                      onCommit={(v) => saveEntry(e.id, { handicapOverride: v })}
                    />
                  </View>
                </View>
                {e.handicapOverride != null && (
                  <View style={{ alignSelf: 'flex-end' }}>
                    <Badge tone="muted">fijo</Badge>
                  </View>
                )}
              </View>
            );
          })}
        </Card>
      )}
      <Txt variant="small" tone="muted">
        {hcpRuleText(event)}
      </Txt>

      {adding && <AddPlayersSheet event={event} entries={entries} players={players} onClose={() => setAdding(false)} />}
    </View>
  );
}

/**
 * Número editable en línea (NumberCell de la web): guarda al salir. Vacío = null (si se permite). Mientras guarda, la
 * ruedita adentro y se queda lo escrito; si se guardó, lo escrito sigue hasta que llega el número nuevo.
 */
function NumberCell({
  value,
  onCommit,
  placeholder,
  allowEmpty,
  label,
}: {
  value: number | null;
  /** Si devuelve `true` (se guardó), se deja lo escrito hasta que llegue el número nuevo; si no, vuelve al de antes. */
  onCommit: (v: number | null) => Promise<unknown> | void;
  placeholder?: string;
  allowEmpty?: boolean;
  label: string;
}) {
  const c = useColors();
  const show = (v: number | null) => (v == null ? '' : String(v));
  // Lo que se escribe mientras la casilla está abierta (null = cerrada).
  const [draft, setDraft] = useState<string | null>(null);
  // Lo guardado mientras llega el número nuevo: se ve mientras el de la base siga siendo el de antes.
  const [held, setHeld] = useState<{ text: string; before: number | null } | null>(null);
  const { isBusy, run } = useBusy();
  const busy = isBusy();
  const shown = draft ?? (held && (busy || held.before === value) ? held.text : show(value));

  function commit() {
    const text = draft ?? show(value);
    setDraft(null);
    const next = numberCellCommit(text, value, { allowEmpty });
    if (!next) return;
    const before = value;
    setHeld({ text: show(next.value), before });
    void run('guardar', async () => {
      if ((await onCommit(next.value)) !== true) setHeld(null);
    });
  }

  return (
    <View>
      <TextInput
        accessibilityLabel={label}
        accessibilityState={{ busy }}
        editable={!busy}
        keyboardType="number-pad"
        maxLength={3}
        placeholder={placeholder}
        placeholderTextColor={c.muted}
        value={shown}
        selectTextOnFocus
        onFocus={() => setDraft(show(value))}
        onChangeText={(t) => setDraft(t.replace(/[^\d]/g, ''))}
        onBlur={commit}
        onSubmitEditing={commit}
        style={[styles.cell, { color: c.fg, backgroundColor: c.surface, borderColor: c.line, fontFamily: font.medium }]}
      />
      {busy && <ActivityIndicator size="small" color={c.muted} style={{ position: 'absolute', right: 4, top: 12 }} />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  cell: { width: 64, height: 44, borderRadius: 10, borderWidth: 1, textAlign: 'center', fontSize: 16, fontVariant: ['tabular-nums'] },
});
