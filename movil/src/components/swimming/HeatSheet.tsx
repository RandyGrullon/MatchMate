/**
 * Hoja de series (HeatSheetPanel de la web, con su misma lógica: logic.ts y admin.ts): cada prueba con sus series en
 * tarjetas y una fila por carril (el número, el nadador con su club y la siembra). Tu carril, resaltado. El admin (con lo
 * de Pro abierto, `manage`) la arma con el motor (los más rápidos en la última serie y en los carriles del centro; los
 * NT en las primeras; mínimo 3 en la primera), puede cambiar carriles tocando dos, y la publica. Una prueba que ya tiene
 * tiempos no se vuelve a armar. El borrador, con «Cancelar» y «Publicar», va arriba de las series.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Rows3, Send, Shuffle, X } from 'lucide-react-native';
import { publishHeats, type SwimEventItem } from '@mm/lib/data/swimming';
import { buildDraft, sheetEvents, tapLane, unassignedText, type LanePick } from '@mm/pages/sports/swimming/admin';
import { eventHasResults, publishedHeats, raceTitle, sheetAssignments, type MeetData, type SheetHeat } from '@mm/pages/sports/swimming/logic';
import { useSwim } from '@mm/pages/sports/swimming/swim';
import { confirmAsync } from '@/components/feedback';
import { Badge, Button, Card, Empty, SectionHeader, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { ClubTag, NumBox, runAction, swimTime } from './parts';

/** El título de una tarjeta de serie («SERIE 1 DE 2»). */
function CardLabel({ children }: { children: string }) {
  return (
    <Txt tone="muted" style={styles.cardLabel}>
      {children.toUpperCase()}
    </Txt>
  );
}

export function HeatSheetPanel({ data, manage = false }: { data: MeetData; manage?: boolean }) {
  const c = useColors();
  const { isAdmin, myPlayerId } = useSwim();
  const { lid, meet, events, entries } = data;
  const [draft, setDraft] = useState<Map<string, SheetHeat[]> | null>(null);
  const [pick, setPick] = useState<LanePick | null>(null);
  const [busy, setBusy] = useState(false);
  const canEdit = isAdmin && manage && !meet.finalizedAt;
  const { withEntries, seedable } = sheetEvents(events, entries);

  const build = (only?: SwimEventItem) => {
    setDraft(buildDraft(only ? [only] : seedable, entries, meet.lanes));
    setPick(null);
  };
  const tap = (ev: string, heat: number, lane: number) => {
    if (!draft) return;
    const next = tapLane(draft, pick, { ev, heat, lane });
    setDraft(next.draft);
    setPick(next.pick);
  };
  const publish = async () => {
    if (!draft) return;
    if (
      meet.heatsPublishedAt &&
      !(await confirmAsync({
        title: '¿Publicar de nuevo?',
        message: 'Las pruebas del borrador cambian de series y carriles. Avisa a los nadadores.',
        confirmText: 'Publicar',
      }))
    )
      return;
    setBusy(true);
    const n = await runAction(
      () => publishHeats(lid, meet.id, [...draft].map(([swimEventId, heats]) => ({ swimEventId, lanes: sheetAssignments(heats) }))),
      'Hoja de series publicada',
    );
    setBusy(false);
    if (n !== undefined) setDraft(null);
  };

  if (!withEntries.length) {
    return <Empty icon={<Rows3 size={28} color={c.accent} />} title="Sin inscritos todavía" text="La hoja de series se arma con los inscritos de cada prueba." />;
  }
  if (!draft && !meet.heatsPublishedAt) {
    return (
      <Empty
        icon={<Rows3 size={28} color={c.accent} />}
        title="La hoja de series todavía no está"
        text={canEdit ? 'Se arma sola con los tiempos de siembra; después puedes mover carriles antes de publicarla.' : 'El organizador la publica antes del encuentro.'}
        action={
          canEdit ? (
            <Button variant="primary" size="lg" icon={<Shuffle size={20} color={c.accentFg} />} onPress={() => build()}>
              Armar series
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <View style={{ gap: 26 }}>
      {draft ? (
        <View style={[styles.draft, { backgroundColor: c.surface, borderColor: c.accent }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }}>
            <Badge>Borrador</Badge>
            <Txt tone="muted" style={{ flex: 1, minWidth: 0, fontSize: 14 }}>
              Toca un carril y después otro para cambiarlos.
            </Txt>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button size="lg" icon={<X size={20} color={c.fg} />} onPress={() => setDraft(null)}>
              Cancelar
            </Button>
            <View style={{ flex: 1 }}>
              <Button variant="primary" size="lg" full loading={busy} icon={<Send size={20} color={c.accentFg} />} onPress={publish}>
                Publicar
              </Button>
            </View>
          </View>
        </View>
      ) : (
        canEdit &&
        seedable.length > 0 && (
          <Button size="lg" full icon={<Shuffle size={20} color={c.fg} />} onPress={() => build()}>
            Armar de nuevo
          </Button>
        )
      )}

      {withEntries.map((ev) => {
        const draftOf = draft?.get(ev.id);
        const pub = publishedHeats(ev, entries, meet.lanes);
        const heats = draftOf ?? pub.heats;
        if (draft && !draftOf) return null;
        const canBuild = !draft && canEdit && !eventHasResults(ev.id, entries) && (pub.unassigned.length > 0 || !pub.heats.length);
        return (
          <View key={ev.id} style={{ gap: 10 }}>
            <SectionHeader
              title={raceTitle(ev)}
              action={
                canBuild ? (
                  <Pressable accessibilityRole="button" hitSlop={8} onPress={() => build(ev)} style={({ pressed }) => [styles.link, { opacity: pressed ? 0.6 : 1 }]}>
                    <Shuffle size={16} color={c.accent} />
                    <Txt variant="meta" tone="accent" style={{ fontFamily: font.semibold }}>
                      Armar
                    </Txt>
                  </Pressable>
                ) : undefined
              }
            />
            {!draft && pub.unassigned.length > 0 && (
              <Txt tone="warn" style={{ fontSize: 13, marginHorizontal: 4 }}>
                {unassignedText(pub.unassigned.length)}
              </Txt>
            )}
            {heats.map((h) => (
              <Card key={h.n} padded={false}>
                <CardLabel>{`Serie ${h.n} de ${heats.length}`}</CardLabel>
                {h.lanes.map((l) => {
                  const selected = pick?.ev === ev.id && pick.heat === h.n && pick.lane === l.lane;
                  const me = !!myPlayerId && l.entry?.playerId === myPlayerId;
                  const row = (
                    <>
                      <NumBox n={l.lane} strong={me || selected} />
                      {l.entry ? (
                        <>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Txt numberOfLines={1} style={{ fontFamily: font.semibold, fontSize: 15 }}>
                              {data.name(l.entry.playerId)}
                            </Txt>
                            <ClubTag club={l.entry.clubId ? data.clubs.get(l.entry.clubId) : null} short />
                          </View>
                          <Txt tone="muted" style={{ fontSize: 14, fontVariant: ['tabular-nums'] }}>
                            {swimTime(l.entry.seed)}
                          </Txt>
                        </>
                      ) : (
                        <Txt tone="faint" style={{ flex: 1, fontSize: 14 }}>
                          Libre
                        </Txt>
                      )}
                    </>
                  );
                  return draftOf ? (
                    <Pressable
                      key={l.lane}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`Carril ${l.lane}: ${l.entry ? data.name(l.entry.playerId) : 'Libre'}`}
                      onPress={() => tap(ev.id, h.n, l.lane)}
                      style={({ pressed }) => [styles.row, { backgroundColor: selected ? c.accentSoft : pressed ? c.surface2 : 'transparent' }]}
                    >
                      {row}
                    </Pressable>
                  ) : (
                    <View key={l.lane} style={[styles.row, me && { backgroundColor: c.accentSoft }]}>
                      {row}
                    </View>
                  );
                })}
              </Card>
            ))}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  cardLabel: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6, fontSize: 12, fontFamily: font.semibold, letterSpacing: 0.7 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 52, paddingVertical: 8, paddingLeft: 16, paddingRight: 20 },
  draft: { gap: 10, borderRadius: 26, borderWidth: 1.5, padding: 12 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 },
});
