import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Copy, Eraser, Rows3, Send, Shuffle, Users } from 'lucide-react-native';
import { fetchEffectiveAverages } from '@mm/lib/data';
import { assignLanes, clearLanes, publishLanes, setPlayerLane, useEventLanes } from '@mm/lib/data/lanes';
import { asBackendError } from '@mm/lib/db/errors';
import { saveErrorMessage } from '@mm/lib/errorText';
import { eventLabel } from '@mm/lib/format';
import {
  PER_LANE_OPTIONS,
  formatLanes,
  groupLanes,
  hasTeams,
  laneCandidates,
  laneChoices,
  lanesNeeded,
  lanesPublished,
  lanesText,
  orderByAverage,
  parseLanes,
  unpublishedCount,
  type LaneMode,
} from '@mm/lib/lanes';
import { useLeagueCtx } from '@mm/lib/league';
import type { BowlingEvent, Entry, Player } from '@mm/lib/types';
import {
  LANES_RATE_LIMITED,
  clearLanesConfirm,
  laneCandidatesText,
  laneModeHint,
  laneModes,
  lanesDontFitText,
  lanesPublishedText,
  lanesStatus,
  publishLanesConfirm,
  readLanePrefs,
  rebuildLanesConfirm,
  saveLanePrefs,
} from '@mm/components/lanes/logic';
import { BusySelect } from '@/components/event/BusySelect';
import { confirmAsync, toast } from '@/components/feedback';
import { runAction } from '@/components/swimming/parts';
import { Badge, Button, Card, Empty, Field, Input, LoadError, Loading, Segmented, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/**
 * Evento de boliche › Pistas (LanesPanel de la web, con su misma lógica: src/lib/lanes.ts y lanes/logic.ts; admin o
 * anotador): arma las pistas con los que dijeron «voy» o están inscritos (números como «5-9», jugadores por pista y
 * cómo: por promedio, por equipo o al azar), las muestra por pista con «Mover a…», las comparte para WhatsApp («Pista
 * 7: Juan, Ana, Luis») y las publica (push a cada jugador con cuenta). Va dentro de LeagueScope.
 */
export function LanesPanel({ event, entries, players }: { event: BowlingEvent; entries: Entry[]; players: Player[] }) {
  const c = useColors();
  const { lid } = useLeagueCtx();
  const lanes = useEventLanes(lid, event.id);
  const rows = lanes.data;
  const byId = new Map(players.map((p) => [p.id, p]));
  const nameOf = (id: string) => byId.get(id)?.name ?? '(jugador borrado)';
  const groups = groupLanes(rows, nameOf);
  const candidates = laneCandidates(event, entries);
  const teams = hasTeams(entries);

  const [prefs] = useState(() => readLanePrefs(lid));
  const [input, setInput] = useState(prefs.lanes);
  const [perLane, setPerLane] = useState(prefs.perLane);
  const [mode, setMode] = useState<LaneMode>('promedio');
  const [busy, setBusy] = useState<'armar' | 'publicar' | 'borrar' | null>(null);

  const typed = parseLanes(input);
  const need = lanesNeeded(candidates.length, perLane);
  const fits = !!typed && candidates.length <= typed.length * perLane;
  const choices = laneChoices(typed, rows);
  const withLane = new Set(rows.map((r) => r.playerId));
  const unassigned = candidates.filter((id) => !withLane.has(id)).sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'es'));
  const published = lanesPublished(rows);
  const changed = unpublishedCount(rows);
  const { modes, active: activeMode } = laneModes(mode, teams);
  const status = lanesStatus(published, changed);

  async function generate() {
    if (!typed || !fits || !candidates.length || busy) return;
    if (rows.length) {
      const ok = await confirmAsync(rebuildLanesConfirm);
      if (!ok) return;
    }
    setBusy('armar');
    saveLanePrefs(lid, { lanes: formatLanes(typed), perLane });
    await runAction(async () => {
      let order: string[] | null = null;
      if (activeMode !== 'azar') {
        // El mismo promedio que toma el handicap de este evento: el de su temporada (src/lib/bowlingSeason.ts).
        const averages = await fetchEffectiveAverages(
          lid,
          candidates.map((id) => ({ id, averageOverride: byId.get(id)?.averageOverride ?? null })),
          { date: event.date, eventId: event.id },
        );
        order = orderByAverage(candidates, averages, players);
      }
      await assignLanes(event.id, { lanes: typed, perLane, mode: activeMode, order });
      return true;
    }, 'Pistas armadas');
    setBusy(null);
  }

  async function move(playerId: string, value: string) {
    const lane = value === 'quitar' ? null : Number(value);
    if (lane !== null && !Number.isInteger(lane)) return;
    await runAction(() => setPlayerLane(event.id, playerId, lane));
  }

  async function copy() {
    const ok = await Clipboard.setStringAsync(lanesText(groups, `Pistas · ${eventLabel(event)}`)).catch(() => false);
    toast(ok ? 'Copiado: pégalo en el grupo de WhatsApp' : 'No se pudo copiar', ok ? 'ok' : 'error');
  }

  async function publish() {
    if (busy) return;
    const ok = await confirmAsync(publishLanesConfirm(published));
    if (!ok) return;
    setBusy('publicar');
    try {
      const r = await publishLanes(event.id);
      toast(lanesPublishedText(r.pushed));
    } catch (e) {
      console.error(e);
      toast(asBackendError(e)?.kind === 'rate_limited' ? LANES_RATE_LIMITED : saveErrorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  async function clear() {
    if (busy) return;
    const ok = await confirmAsync(clearLanesConfirm(published));
    if (!ok) return;
    setBusy('borrar');
    await runAction(() => clearLanes(event.id), 'Pistas borradas');
    setBusy(null);
  }

  // Cada fila con su ruedita: las demás se pueden mover mientras tanto.
  const moveSelect = (playerId: string, current: number | null) => (
    <View style={{ width: 150 }}>
      <BusySelect
        label={`Mover a ${nameOf(playerId)}`}
        value={current == null ? '' : String(current)}
        options={[
          ...(current == null ? [{ key: '', label: 'Poner en…' }] : []),
          ...choices.map((n) => ({ key: String(n), label: `Pista ${n}` })),
          ...(current != null ? [{ key: 'quitar', label: 'Quitar de la pista' }] : []),
        ]}
        onPick={(value) => (value ? move(playerId, value) : undefined)}
      />
    </View>
  );

  return (
    <View style={{ gap: 16 }}>
      <Card style={{ gap: 16, padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <View style={[styles.icon, { backgroundColor: c.accentSoft }]}>
            <Rows3 size={20} color={c.accent} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt variant="bodyStrong">Armar las pistas</Txt>
            <Txt variant="meta" tone="muted">
              {laneCandidatesText(candidates.length)}
            </Txt>
          </View>
        </View>

        <Field label="Pistas" hint={input && !typed ? 'Escribe números como 5-9 o 3, 5, 7.' : undefined} error={!!input && !typed}>
          {/* Teclado de texto (no numérico): el numérico no tiene guion ni coma para «5-9» o «3, 5». */}
          <Input
            accessibilityLabel="Pistas"
            value={input}
            onChangeText={setInput}
            placeholder="5-9"
            autoComplete="off"
            autoCorrect={false}
            autoCapitalize="none"
            spellCheck={false}
            returnKeyType="done"
            invalid={!!input && !typed}
          />
        </Field>
        <Field label="Jugadores por pista">
          <Segmented<string> label="Jugadores por pista" value={String(perLane)} onChange={(k) => setPerLane(Number(k))} options={PER_LANE_OPTIONS.map((n) => ({ key: String(n), label: String(n) }))} />
        </Field>

        <Segmented<LaneMode> label="Cómo se reparten" value={activeMode} onChange={setMode} options={modes} />
        <Txt variant="small" tone="muted" style={{ marginTop: -8 }}>
          {laneModeHint(activeMode, candidates.length, need, perLane)}
        </Txt>
        {typed && !fits && candidates.length > 0 && (
          <Txt variant="meta" tone="warn">
            {lanesDontFitText(candidates.length, typed.length * perLane)}
          </Txt>
        )}

        <Button
          variant="primary"
          size="lg"
          full
          icon={activeMode === 'azar' ? <Shuffle size={16} color={c.accentFg} /> : <Rows3 size={16} color={c.accentFg} />}
          loading={busy === 'armar'}
          disabled={!typed || !fits || !candidates.length || !!busy}
          onPress={() => void generate()}
        >
          {rows.length ? 'Armar de nuevo' : 'Armar pistas'}
        </Button>
      </Card>

      {lanes.error && !rows.length ? (
        <LoadError error={lanes.error} />
      ) : lanes.loading && !rows.length ? (
        <Loading />
      ) : !rows.length ? (
        <Empty
          icon={<Rows3 size={32} color={c.accent} />}
          title="Sin pistas todavía"
          text="Escribe las pistas que te dieron en la bolera y toca «Armar pistas». Después puedes mover a cualquiera."
        />
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Txt variant="bodyStrong" style={{ flex: 1 }}>
              Pistas
            </Txt>
            <Badge tone={status.tone}>{status.text}</Badge>
          </View>
          {groups.map((g) => (
            <Card key={g.lane} padded={false}>
              <View style={[styles.laneHead, { borderBottomColor: c.line, backgroundColor: c.surface2 }]}>
                <Txt style={{ fontFamily: font.semibold }}>{`Pista ${g.lane}`}</Txt>
                <Txt variant="small" tone="muted" style={{ marginLeft: 'auto' }}>
                  {`${g.players.length} ${g.players.length === 1 ? 'jugador' : 'jugadores'}`}
                </Txt>
              </View>
              {g.players.map((p, i) => (
                <View key={p.playerId} style={[styles.row, i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null]}>
                  <Txt variant="small" tone="muted" style={{ width: 20, textAlign: 'center', fontVariant: ['tabular-nums'] }}>
                    {String(p.position)}
                  </Txt>
                  <Txt numberOfLines={1} style={{ flex: 1, minWidth: 0, fontSize: 14, fontFamily: font.medium }}>
                    {p.name}
                  </Txt>
                  {moveSelect(p.playerId, g.lane)}
                </View>
              ))}
            </Card>
          ))}

          {unassigned.length > 0 && (
            <Card padded={false} style={{ borderWidth: 1, borderColor: c.warn }}>
              <View style={[styles.laneHead, { borderBottomColor: c.line, backgroundColor: c.warnSoft }]}>
                <Users size={16} color={c.warn} />
                <Txt style={{ fontSize: 14, fontFamily: font.semibold, color: c.warn }}>{`Sin pista (${unassigned.length})`}</Txt>
              </View>
              {unassigned.map((id, i) => (
                <View key={id} style={[styles.row, i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null]}>
                  <Txt numberOfLines={1} style={{ flex: 1, minWidth: 0, fontSize: 14, fontFamily: font.medium }}>
                    {nameOf(id)}
                  </Txt>
                  {moveSelect(id, null)}
                </View>
              ))}
            </Card>
          )}

          <Button size="lg" full icon={<Copy size={16} color={c.fg} />} onPress={() => void copy()}>
            Copiar para WhatsApp
          </Button>
          <Button variant="primary" size="lg" full icon={<Send size={16} color={c.accentFg} />} loading={busy === 'publicar'} disabled={!!busy} onPress={() => void publish()}>
            Publicar y avisar
          </Button>
          <Button variant="ghost" icon={<Eraser size={16} color={c.danger} />} loading={busy === 'borrar'} disabled={!!busy} onPress={() => void clear()}>
            <Txt style={{ color: c.danger, fontFamily: font.semibold }}>Borrar pistas</Txt>
          </Button>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  laneHead: { flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
});
