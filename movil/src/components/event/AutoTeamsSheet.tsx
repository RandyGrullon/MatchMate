import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { applyTeams } from '@mm/lib/data';
import { useLeagueCtx } from '@mm/lib/league';
import { category } from '@mm/lib/stats';
import type { BowlingEvent, Entry, Player } from '@mm/lib/types';
import { autoTeamCount, autoTeamName, autoTeamSize, autoTeamsProposal, autoTeamsRemoved, autoTeamsSpread, entryNames, eventTeamList } from '@mm/components/bowlingTeams/eventTeams';
import { runAction } from '@/components/swimming/parts';
import { Badge, Button, Card, Field, Input, Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { CategoryBadge } from './CategoryBadge';

/**
 * «Armar equipos parejos» (AutoTeamsModal de la web, con su misma lógica): reparto en serpiente por promedio, con
 * categorías distintas cuando se puede. Muestra la propuesta antes de aplicarla; reutiliza los nombres de los equipos
 * que ya existan y deja ponerles otro. Se monta al abrirse (de a cuántos: el del torneo, o 3).
 */
export function AutoTeamsSheet({ onClose, event, entries, players }: { onClose: () => void; event: BowlingEvent; entries: Entry[]; players: Player[] }) {
  const c = useColors();
  const { lid } = useLeagueCtx();
  const [size, setSize] = useState(event.teamSize || 3);
  const [busy, setBusy] = useState(false);
  // Nombres que les pone el organizador (por posición; vacío = el de siempre).
  const [names, setNames] = useState<Record<number, string>>({});

  const nameOf = entryNames(players);
  const existing = eventTeamList(event);
  const count = autoTeamCount(entries.length, size);
  const proposal = autoTeamsProposal(entries, count, event);
  const spread = autoTeamsSpread(proposal);
  const removed = autoTeamsRemoved(existing.length, count);

  async function apply() {
    setBusy(true);
    const ok = await runAction(async () => {
      await applyTeams(
        lid,
        event,
        proposal.map((t, i) => ({ teamId: t.teamId, name: autoTeamName(names, i, t.name), entryIds: t.members.map((m) => m.id) })),
      );
      return true;
    }, `${proposal.length} equipos armados`);
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Armar equipos parejos"
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button size="lg" onPress={onClose}>
            Cancelar
          </Button>
          <View style={{ flex: 1 }}>
            <Button variant="primary" size="lg" full loading={busy} disabled={entries.length < 2} onPress={() => void apply()}>
              Aplicar
            </Button>
          </View>
        </View>
      }
    >
      <View style={{ gap: 16 }}>
        <View style={{ gap: 12 }}>
          <View style={{ width: 160 }}>
            <Field label="Jugadores por equipo">
              <Input keyboardType="number-pad" inputMode="numeric" maxLength={2} value={String(size)} onChangeText={(v) => setSize(autoTeamSize(v))} accessibilityLabel="Jugadores por equipo" />
            </Field>
          </View>
          <Txt variant="meta" tone="muted">
            {`${entries.length} inscritos → `}
            <Txt variant="meta" style={{ fontFamily: font.bold }}>{`${count} equipos`}</Txt>
            {'. Cada equipo lleva categorías distintas cuando se puede y sumas de promedio parejas; diferencia entre equipos: '}
            <Txt variant="meta" style={{ fontFamily: font.bold }}>{String(spread)}</Txt>
            {' pinos de promedio.'}
          </Txt>
        </View>
        {removed > 0 && <Badge tone="warn">{`Se borran ${removed} equipo(s) que sobran.`}</Badge>}
        <View style={{ gap: 12 }}>
          {proposal.map((t, i) => (
            <Card key={i} style={{ padding: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line }}>
              <View style={{ marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Input
                    value={names[i] ?? t.name}
                    onChangeText={(v) => setNames((n) => ({ ...n, [i]: v }))}
                    maxLength={40}
                    accessibilityLabel={`Nombre del equipo ${i + 1}`}
                    placeholder={t.name}
                    style={{ height: 44, fontSize: 16, fontFamily: font.semibold }}
                  />
                </View>
                <Txt tone="muted" style={{ fontSize: 12 }}>{`Σ ${t.sum}`}</Txt>
              </View>
              <View style={{ gap: 4 }}>
                {t.members.map((m) => (
                  <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <CategoryBadge value={category(m.average, event.categoryCuts)} />
                    <Txt numberOfLines={1} style={{ flex: 1, minWidth: 0, fontSize: 14 }}>
                      {nameOf(m)}
                    </Txt>
                    <Txt tone="muted" style={{ fontSize: 14 }}>
                      {String(m.average)}
                    </Txt>
                  </View>
                ))}
              </View>
            </Card>
          ))}
        </View>
        <Txt tone="muted" style={{ fontSize: 12 }}>
          Ponle nombre a cada equipo aquí o después. También puedes mover jugadores a mano.
        </Txt>
      </View>
    </Sheet>
  );
}
