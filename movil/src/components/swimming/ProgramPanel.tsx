/**
 * Programa del encuentro (ProgramPanel de la web, con su misma lógica: src/pages/sports/swimming/admin.ts): las pruebas
 * en orden, como filas (el número, la prueba, para quién y cuántos van). El admin agrega con «+ Agregar» y toca una
 * prueba para cambiarla, subirla, bajarla o quitarla. Sin pruebas, empieza con una plantilla.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ArrowDown, ArrowUp, ListChecks, Plus, Trash2 } from 'lucide-react-native';
import { deleteSwimEvent, saveSwimEvents, type SwimEventInput, type SwimEventItem } from '@mm/lib/data/swimming';
import { GENDER_LABEL, STROKE_LABEL, SWIM_STROKES, type SwimGender, type SwimStroke } from '@mm/sports/swimming';
import { distanceForStroke, enteredText, entryCounts, eventErrors, moveEvent, strokeDistances, toggleAgeGroup } from '@mm/pages/sports/swimming/admin';
import { ageGroupsOf, clubMeetTemplate, eventHasResults, raceDetail, raceName, timeTrialTemplate, type MeetData } from '@mm/pages/sports/swimming/logic';
import { useSwim } from '@mm/pages/sports/swimming/swim';
import { confirmAsync } from '@/components/feedback';
import { Button, Empty, Field, ListRow, SectionHeader, Segmented, Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { InlineSelect, SectionAdd, SheetFooter, useBusy } from './adminParts';
import { Lines, NumBox, runAction } from './parts';

type Busy = ReturnType<typeof useBusy<string>>;

interface Tools {
  move: (ev: SwimEventItem, dir: -1 | 1) => void;
  remove: (ev: SwimEventItem) => Promise<void>;
  busy: Busy;
  locked: (ev: SwimEventItem) => boolean;
}

const STROKES = SWIM_STROKES.map((s) => ({ value: s, label: STROKE_LABEL[s] }));
const GENDERS = (['F', 'M', 'X'] as SwimGender[]).map((g) => ({ key: g, label: GENDER_LABEL[g] }));

export function ProgramPanel({ data }: { data: MeetData }) {
  const c = useColors();
  const { isAdmin } = useSwim();
  const { lid, meet, events, entries } = data;
  const [editing, setEditing] = useState<SwimEventItem | 'new' | null>(null);
  // Lo que espera: una plantilla ('club', 'control') o una prueba (`id:up`, `id:down`, `id:del`). Una a la vez: subir
  // y bajar cambian números de las pruebas de al lado.
  const busy = useBusy();
  const canEdit = isAdmin && !meet.finalizedAt;
  const counts = entryCounts(entries);

  const move = (ev: SwimEventItem, dir: -1 | 1) => {
    const pair = moveEvent(events, ev.id, dir);
    if (!pair) return;
    void busy.run(`${ev.id}:${dir < 0 ? 'up' : 'down'}`, () => runAction(() => saveSwimEvents(lid, meet.id, pair)));
  };
  const remove = async (ev: SwimEventItem) => {
    const n = counts.get(ev.id) ?? 0;
    if (
      !(await confirmAsync({
        title: `¿Quitar la prueba ${ev.num}?`,
        message: n ? `Tiene ${n} inscritos: se borran con sus series y resultados.` : undefined,
        confirmText: 'Quitar',
        danger: true,
      }))
    )
      return;
    const ok = await busy.run(`${ev.id}:del`, () => runAction(() => deleteSwimEvent(lid, meet.id, ev.id).then(() => true), 'Prueba quitada'));
    if (ok) setEditing(null);
  };
  const applyTemplate = (key: 'club' | 'control', list: SwimEventInput[]) => busy.run(key, () => runAction(() => saveSwimEvents(lid, meet.id, list), 'Pruebas agregadas'));
  const sheet = (
    <EventFormSheet
      key={editing === 'new' ? 'new' : (editing?.id ?? '')}
      data={data}
      editing={editing}
      onClose={() => setEditing(null)}
      tools={canEdit ? { move, remove, busy, locked: (ev) => eventHasResults(ev.id, entries) } : null}
    />
  );

  if (!events.length) {
    return (
      <>
        <Empty
          icon={<ListChecks size={28} color={c.accent} />}
          title="Todavía no hay pruebas"
          text={canEdit ? 'Empieza con una plantilla o agrega las pruebas una por una.' : 'El organizador está armando el programa.'}
          action={
            canEdit ? (
              <View style={{ gap: 10 }}>
                <Button variant="primary" size="lg" loading={busy.isBusy('club')} disabled={busy.isBusy()} onPress={() => applyTemplate('club', clubMeetTemplate(meet.pool, meet.ageGroups))}>
                  Usar las de un encuentro de club
                </Button>
                <Button size="lg" loading={busy.isBusy('control')} disabled={busy.isBusy()} onPress={() => applyTemplate('control', timeTrialTemplate())}>
                  Usar las de control de marcas
                </Button>
                <Button variant="ghost" icon={<Plus size={16} color={c.fg} />} onPress={() => setEditing('new')}>
                  Agregar una prueba
                </Button>
              </View>
            ) : undefined
          }
        />
        {sheet}
      </>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      <SectionHeader title={events.length === 1 ? '1 prueba' : `${events.length} pruebas`} action={canEdit ? <SectionAdd label="Agregar" onPress={() => setEditing('new')} /> : undefined} />
      <Lines>
        {events.map((ev) => (
          <ListRow
            key={ev.id}
            icon={<NumBox n={ev.num} />}
            title={raceName(ev)}
            subtitle={`${raceDetail(ev)} · ${enteredText(counts.get(ev.id) ?? 0)}`}
            onPress={canEdit ? () => setEditing(ev) : undefined}
            accessibilityLabel={canEdit ? `Cambiar la prueba ${ev.num}: ${raceName(ev)}` : undefined}
          />
        ))}
      </Lines>
      <Txt tone="muted" style={{ fontSize: 13, marginHorizontal: 4 }}>
        Finales por tiempo: en cada serie nadan juntas las categorías; el puesto es por categoría.
      </Txt>
      {sheet}
    </View>
  );
}

/** Agregar o cambiar una prueba: distancia, estilo, sexo y categorías; una que ya existe, además, subirla, bajarla o quitarla. */
function EventFormSheet({ data, editing, onClose, tools }: { data: MeetData; editing: SwimEventItem | 'new' | null; onClose: () => void; tools: Tools | null }) {
  return editing ? <EventFormOpen data={data} editing={editing} onClose={onClose} tools={tools} /> : null;
}

function EventFormOpen({ data, editing, onClose, tools }: { data: MeetData; editing: SwimEventItem | 'new'; onClose: () => void; tools: Tools | null }) {
  const c = useColors();
  const { lid, meet, entries, events } = data;
  const picked = editing !== 'new' ? editing : null;
  // La prueba como está ahora (subir y bajar le cambian el número con la hoja abierta).
  const current = picked ? (events.find((e) => e.id === picked.id) ?? picked) : null;
  const [stroke, setStroke] = useState<SwimStroke>(picked?.stroke ?? 'libre');
  const [distance, setDistance] = useState<number>(picked?.distance ?? 50);
  const [gender, setGender] = useState<SwimGender>(picked?.gender ?? 'X');
  const [groups, setGroups] = useState<string[]>(picked?.ageGroups ?? []);
  const [busy, setBusy] = useState(false);
  const locked = !!current && eventHasResults(current.id, entries);
  const distances = strokeDistances(stroke, meet.pool).map((d) => ({ value: String(d), label: `${d} m` }));
  const errors = eventErrors(distance, stroke, meet.pool);
  const all = ageGroupsOf(meet.ageGroups);
  const k = current ? events.findIndex((e) => e.id === current.id) : -1;
  const waiting = tools?.busy.isBusy() ?? false;

  const save = async () => {
    setBusy(true);
    const ok = await runAction(
      () => saveSwimEvents(lid, meet.id, [{ ...(current ? { id: current.id, num: current.num } : {}), distance, stroke, gender, ageGroups: groups }]),
      current ? 'Prueba guardada' : 'Prueba agregada',
    );
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={current ? `Prueba ${current.num}` : 'Nueva prueba'}
      footer={
        <SheetFooter onCancel={onClose}>
          <Button variant="primary" full loading={busy} disabled={errors.length > 0 || waiting} onPress={save}>
            Guardar
          </Button>
        </SheetFooter>
      }
    >
      <View style={{ gap: 16 }}>
        {locked && (
          <View style={{ borderRadius: 12, backgroundColor: c.warnSoft, paddingHorizontal: 12, paddingVertical: 8 }}>
            <Txt tone="warn" style={{ fontSize: 14 }}>
              Ya tiene tiempos: la distancia y el estilo no se pueden cambiar.
            </Txt>
          </View>
        )}
        <Field label="Estilo">
          <InlineSelect<SwimStroke>
            label="Estilo"
            value={stroke}
            options={STROKES}
            disabled={locked}
            onChange={(s) => {
              setStroke(s);
              setDistance(distanceForStroke(s, distance, meet.pool));
            }}
          />
        </Field>
        <Field label="Distancia">
          <InlineSelect label="Distancia" value={String(distance)} options={distances} disabled={locked} onChange={(d) => setDistance(Number(d))} />
        </Field>
        {errors.length > 0 && (
          <Txt tone="danger" style={{ fontSize: 14 }}>
            {errors[0]}
          </Txt>
        )}
        <Field label="Sexo">
          <Segmented<SwimGender> label="Sexo de la prueba" value={gender} onChange={setGender} options={GENDERS} />
        </Field>
        {all.length > 0 && (
          <Field label="Categorías" hint="Sin marcar ninguna, la prueba es abierta (el puesto igual se calcula por categoría).">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {all.map((g) => {
                const on = groups.includes(g.id);
                return (
                  <Pressable
                    key={g.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    onPress={() => setGroups((x) => toggleAgeGroup(all, x, g.id))}
                    style={({ pressed }) => [styles.chip, { backgroundColor: on ? c.accent : c.surface2, transform: [{ scale: pressed ? 0.95 : 1 }] }]}
                  >
                    <Txt style={{ fontSize: 14, fontFamily: font.medium, color: on ? c.accentFg : c.muted }}>{g.label}</Txt>
                  </Pressable>
                );
              })}
            </View>
          </Field>
        )}
        {current && tools && (
          <View style={[styles.tools, { borderTopColor: c.line }]}>
            <Button icon={<ArrowUp size={16} color={c.fg} />} disabled={k <= 0 || waiting} loading={tools.busy.isBusy(`${current.id}:up`)} onPress={() => tools.move(current, -1)}>
              Subir
            </Button>
            <Button
              icon={<ArrowDown size={16} color={c.fg} />}
              disabled={k < 0 || k >= events.length - 1 || waiting}
              loading={tools.busy.isBusy(`${current.id}:down`)}
              onPress={() => tools.move(current, 1)}
            >
              Bajar
            </Button>
            <View style={{ flex: 1 }} />
            <Button
              variant="ghost"
              icon={<Trash2 size={16} color={c.danger} />}
              disabled={tools.locked(current) || waiting}
              loading={tools.busy.isBusy(`${current.id}:del`)}
              onPress={() => void tools.remove(current)}
            >
              <Txt tone="danger">Quitar prueba</Txt>
            </Button>
          </View>
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  chip: { minHeight: 44, borderRadius: 22, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  tools: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 16 },
});
