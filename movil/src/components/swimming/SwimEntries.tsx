/**
 * «Pruebas» del encuentro (EntriesPanel de la web): los inscritos de cada prueba con su siembra. En el teléfono inscribe
 * quien nada con cuenta (a sí mismo) y el entrenador (a los de su club), y antes de nadar cambian la siembra o se
 * sacan; inscribir a cualquiera (lo del admin) se queda en la web. La misma lógica: logic.ts (enterCandidates…).
 */
import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Check, ChevronDown, Search, UserPlus, Users, X } from 'lucide-react-native';
import { usePlayers } from '@mm/lib/data';
import { enterSwimmers, unenterSwimmer, useSwimmers, type SwimEntry, type SwimEventItem, type SwimmerInfo, type SwimmerPrivate } from '@mm/lib/data/swimming';
import { bySeed, canEnterSome, canManageEntry, enterCandidates, groupLabel, raceDetail, raceName, readSeed, seedText, type EntryWho, type MeetData } from '@mm/pages/sports/swimming/logic';
import { useSwim } from '@mm/pages/sports/swimming/swim';
import { confirmAsync } from '@/components/feedback';
import { Badge, Button, Card, Empty, Input, Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { ClubTag, NumBox, TuTag, openSwimmer, runAction, swimTime } from './parts';

/** En el teléfono no se usan los datos privados de los nadadores (solo el admin los lee, en la web). */
const NO_PRIVATE = new Map<string, SwimmerPrivate>();

export function EntriesPanel({ data }: { data: MeetData }) {
  const c = useColors();
  const { coachOf, myPlayerId } = useSwim();
  const { lid, meet, events, entries, clubs, name } = data;
  const swimmers = useSwimmers(lid);
  const info = useMemo(() => new Map(swimmers.data.map((s) => [s.playerId, s] as const)), [swimmers.data]);
  const [open, setOpen] = useState<Set<string>>(() => new Set(events.length <= 3 ? events.map((e) => e.id) : []));
  const [entering, setEntering] = useState<SwimEventItem | null>(null);
  const [seedOf, setSeedOf] = useState<SwimEntry | null>(null);
  // La inscripción que se está sacando: la ruedita en su botón.
  const [removing, setRemoving] = useState<string | null>(null);
  const closed = !!meet.finalizedAt;
  // Lo del admin (inscribir o sacar a cualquiera) está en la web.
  const who: EntryWho = useMemo(() => ({ isAdmin: false, myPlayerId, coachOf }), [myPlayerId, coachOf]);
  const canEnterAny = canEnterSome(closed, who);

  if (!events.length) return <Empty icon={<Users size={28} color={c.accent} />} title="Todavía no hay pruebas" text="Primero se arma el programa." />;

  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const remove = async (e: SwimEntry) => {
    if (!(await confirmAsync({ title: `¿Sacar a ${name(e.playerId)} de la prueba?`, confirmText: 'Sacar', danger: true }))) return;
    setRemoving(e.id);
    await runAction(() => unenterSwimmer(lid, meet.id, e.id), 'Listo');
    setRemoving(null);
  };

  return (
    <View style={{ gap: 12 }}>
      <Txt variant="meta" tone="muted" style={{ marginHorizontal: 4 }}>
        {`${entries.length === 1 ? '1 inscripción' : `${entries.length} inscripciones`} · ${events.length} pruebas · NT = sin tiempo`}
      </Txt>
      {events.map((ev) => {
        const list = entries.filter((e) => e.swimEventId === ev.id).sort(bySeed);
        const isOpen = open.has(ev.id);
        const meIn = !!myPlayerId && list.some((e) => e.playerId === myPlayerId);
        return (
          <Card key={ev.id} padded={false}>
            <View style={styles.head}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: isOpen }} onPress={() => toggle(ev.id)} style={styles.headMain}>
                <NumBox n={ev.num} on={meIn} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Txt variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                      {raceName(ev)}
                    </Txt>
                    {meIn && <TuTag />}
                  </View>
                  <Txt tone="muted" numberOfLines={1} style={{ fontSize: 14 }}>
                    {`${raceDetail(ev)} · ${list.length === 1 ? '1 inscrito' : `${list.length} inscritos`}`}
                  </Txt>
                </View>
                <ChevronDown size={20} color={c.faint} style={isOpen ? { transform: [{ rotate: '180deg' }] } : undefined} />
              </Pressable>
              {canEnterAny && <Button variant="soft" accessibilityLabel={`Inscribir en la prueba ${ev.num}`} icon={<UserPlus size={18} color={c.accent} />} onPress={() => setEntering(ev)} />}
            </View>
            {isOpen && (
              <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }}>
                {!list.length && (
                  <Txt tone="muted" style={{ paddingHorizontal: 20, paddingVertical: 14, fontSize: 14 }}>
                    Nadie inscrito todavía.
                  </Txt>
                )}
                {list.map((e) => {
                  const manage = canManageEntry(e, closed, who);
                  const me = !!myPlayerId && e.playerId === myPlayerId;
                  return (
                    <View key={e.id} style={[styles.entry, me && { backgroundColor: c.accentSoft }]}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Pressable accessibilityRole="link" onPress={() => openSwimmer(lid, e.playerId)}>
                          <Txt numberOfLines={1} style={{ fontFamily: font.semibold, fontSize: 15 }}>
                            {name(e.playerId)}
                          </Txt>
                        </Pressable>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8 }}>
                          <ClubTag club={e.clubId ? clubs.get(e.clubId) : null} short />
                          {!!e.ageGroup && (
                            <Txt tone="muted" style={{ fontSize: 12 }}>
                              {groupLabel(e.ageGroup)}
                            </Txt>
                          )}
                          {e.heat != null && <Txt tone="fg2" style={{ fontSize: 12, fontFamily: font.medium }}>{`Serie ${e.heat} · carril ${e.lane}`}</Txt>}
                        </View>
                      </View>
                      {manage ? (
                        <Pressable accessibilityRole="button" accessibilityLabel="Cambiar siembra" onPress={() => setSeedOf(e)} style={styles.seed}>
                          <Txt style={{ fontFamily: font.semibold, fontSize: 14, fontVariant: ['tabular-nums'] }}>{swimTime(e.seed)}</Txt>
                        </Pressable>
                      ) : (
                        <Txt tone="muted" style={{ paddingHorizontal: 10, fontSize: 14, fontVariant: ['tabular-nums'] }}>
                          {swimTime(e.seed)}
                        </Txt>
                      )}
                      {manage && (
                        <Button
                          variant="ghost"
                          accessibilityLabel="Sacar de la prueba"
                          icon={<X size={16} color={c.muted} />}
                          loading={removing === e.id}
                          disabled={removing != null}
                          onPress={() => void remove(e)}
                        />
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </Card>
        );
      })}
      {entering && <EnterSheet data={data} ev={entering} info={info} who={who} onClose={() => setEntering(null)} />}
      <SeedSheet key={seedOf?.id ?? ''} data={data} entry={seedOf} onClose={() => setSeedOf(null)} />
    </View>
  );
}

/**
 * Campo de tiempo de siembra (SeedField de la web): «28.45», «1:05.32» o vacío (NT). Devuelve centésimas o null;
 * `invalid` si lo escrito no se entiende.
 */
function SeedField({ value, onChange, big }: { value: number | null; onChange: (cs: number | null, invalid: boolean) => void; big?: boolean }) {
  const [text, setText] = useState(() => seedText('', value));
  const [seen, setSeen] = useState(value);
  // El tiempo cambió por fuera: el campo lo dice (si ya lo decía, queda como se escribió).
  if (seen !== value) {
    setSeen(value);
    setText((t) => seedText(t, value));
  }
  const bad = readSeed(text).invalid;
  return (
    <Input
      keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
      placeholder="NT"
      accessibilityLabel="Tiempo de siembra"
      invalid={bad}
      value={text}
      onChangeText={(t) => {
        setText(t);
        const { cs, invalid } = readSeed(t);
        onChange(cs, invalid);
      }}
      style={big ? { width: 160, height: 52, fontSize: 20, textAlign: 'center' } : { width: 96, height: 44, fontSize: 16, textAlign: 'center' }}
    />
  );
}

/** Cambiar el tiempo de siembra de un inscrito. */
function SeedSheet({ data, entry, onClose }: { data: MeetData; entry: SwimEntry | null; onClose: () => void }) {
  const [seed, setSeed] = useState<number | null>(entry?.seed ?? null);
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Sheet
      open={!!entry}
      onClose={onClose}
      title={entry ? data.name(entry.playerId) : ''}
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button variant="ghost" onPress={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={bad}
            style={{ flex: 1 }}
            onPress={async () => {
              if (!entry) return;
              setBusy(true);
              const ok = await runAction(() => enterSwimmers(data.lid, data.meet.id, entry.swimEventId, [{ playerId: entry.playerId, seed }]), 'Siembra guardada');
              setBusy(false);
              if (ok !== undefined) onClose();
            }}
          >
            Guardar
          </Button>
        </View>
      }
    >
      <View style={{ alignItems: 'center', gap: 8 }}>
        <Txt tone="muted" style={{ fontSize: 14, textAlign: 'center' }}>
          Tiempo de siembra (vacío = NT). Ej.: 28.45 o 1:05.32
        </Txt>
        {entry && (
          <SeedField
            big
            value={seed}
            onChange={(cs, invalid) => {
              setSeed(cs);
              setBad(invalid);
            }}
          />
        )}
      </View>
    </Sheet>
  );
}

/** Elegir nadadores para una prueba (EnterModal de la web), cada uno con su tiempo de siembra. */
function EnterSheet({ data, ev, info, who, onClose }: { data: MeetData; ev: SwimEventItem; info: Map<string, SwimmerInfo>; who: EntryWho; onClose: () => void }) {
  const c = useColors();
  const { lid, meet, entries, clubs } = data;
  const players = usePlayers(lid);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Map<string, number | null>>(new Map());
  const [bad, setBad] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const entered = useMemo(() => new Set(entries.filter((e) => e.swimEventId === ev.id).map((e) => e.playerId)), [entries, ev.id]);
  const candidates = useMemo(() => enterCandidates({ players: players.data, entered, who, info, privBy: NO_PRIVATE, meet, ev }), [players.data, entered, who, info, meet, ev]);

  const needle = q.trim().toLowerCase();
  const shown = candidates.filter((x) => x.ok && (!needle || x.name.toLowerCase().includes(needle)));
  const hidden = candidates.filter((x) => !x.ok).length;

  const toggle = (id: string) =>
    setPicked((m) => {
      const n = new Map(m);
      if (n.has(id)) n.delete(id);
      else n.set(id, null);
      return n;
    });

  const save = async () => {
    setBusy(true);
    const n = await runAction(
      () => enterSwimmers(lid, meet.id, ev.id, [...picked].map(([playerId, seed]) => ({ playerId, seed }))),
      picked.size === 1 ? 'Inscrito' : 'Inscritos',
    );
    setBusy(false);
    if (n !== undefined) onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Prueba ${ev.num} · ${raceName(ev)}`}
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button variant="ghost" onPress={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={busy} disabled={!picked.size || bad.size > 0} onPress={save} style={{ flex: 1 }}>
            {`Inscribir${picked.size ? ` (${picked.size})` : ''}`}
          </Button>
        </View>
      }
    >
      <Txt tone="muted" style={{ fontSize: 14 }}>{`${raceDetail(ev)}. Marca a quien nada y escribe su tiempo de siembra (vacío = NT).`}</Txt>
      {candidates.length > 6 && (
        <View style={{ justifyContent: 'center' }}>
          <Input value={q} onChangeText={setQ} placeholder="Buscar nadador" accessibilityLabel="Buscar nadador" style={{ paddingLeft: 40 }} />
          <View pointerEvents="none" style={{ position: 'absolute', left: 14 }}>
            <Search size={16} color={c.muted} />
          </View>
        </View>
      )}
      {!shown.length && (
        <Txt tone="muted" style={{ paddingVertical: 16, textAlign: 'center', fontSize: 14 }}>
          No hay nadadores para inscribir en esta prueba.
        </Txt>
      )}
      <View>
        {shown.map((x, i) => {
          const on = picked.has(x.playerId);
          return (
            <View key={x.playerId} style={[styles.candidate, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => toggle(x.playerId)} style={styles.candidateMain}>
                <View style={[styles.box, on ? { backgroundColor: c.accent, borderColor: c.accent } : { borderColor: c.faint }]}>{on && <Check size={14} color={c.accentFg} strokeWidth={3} />}</View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt numberOfLines={1} style={{ fontFamily: font.medium }}>
                    {x.name}
                  </Txt>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8 }}>
                    <ClubTag club={x.info?.clubId ? clubs.get(x.info.clubId) : null} short />
                    {!!x.group && (
                      <Txt tone="muted" style={{ fontSize: 12 }}>
                        {groupLabel(x.group)}
                      </Txt>
                    )}
                    {x.playerId === who.myPlayerId && <Badge tone="accent">Tú</Badge>}
                  </View>
                </View>
              </Pressable>
              {on && (
                <SeedField
                  value={picked.get(x.playerId) ?? null}
                  onChange={(cs, invalid) => {
                    setPicked((m) => new Map(m).set(x.playerId, cs));
                    setBad((s) => {
                      const n = new Set(s);
                      if (invalid) n.add(x.playerId);
                      else n.delete(x.playerId);
                      return n;
                    });
                  }}
                />
              )}
            </View>
          );
        })}
      </View>
      {hidden > 0 && (
        <Txt tone="muted" style={{ fontSize: 12 }}>
          {`${hidden === 1 ? '1 nadador no cumple' : `${hidden} nadadores no cumplen`} el sexo o la categoría de la prueba.`}
        </Txt>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56, paddingVertical: 8, paddingLeft: 16, paddingRight: 12 },
  headMain: { flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 14 },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, paddingVertical: 8, paddingLeft: 20, paddingRight: 8 },
  seed: { minHeight: 44, borderRadius: 12, paddingHorizontal: 10, justifyContent: 'center' },
  candidate: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  candidateMain: { flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
