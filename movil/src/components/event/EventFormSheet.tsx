import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { createEvent, updateEvent, type EventInput } from '@mm/lib/data';
import type { BowlingEvent, EventType, RankBy } from '@mm/lib/types';
import { bowlingRuleText } from '@mm/prizes/catalog';
import { cleanEventInput, defaults, eventFormOf, eventFormTitle, eventNamePlaceholder, eventSavedText, hcpExample } from '@mm/components/eventForm';
import { DateStepper } from '@/components/DateStepper';
import { runAction } from '@/components/swimming/parts';
import { Button, Field, Input, Segmented, Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font, radius } from '@/theme/tokens';

/**
 * Crear o configurar una práctica o un torneo del boliche (EventFormModal de la web, con su misma lógica:
 * src/components/eventForm.ts): nombre, fecha y juegos por jugador; en un torneo, además el handicap (base y
 * porcentaje, con su ejemplo), jugadores por equipo, cómo se clasifican el individual y los equipos (con la regla de los
 * premios), las categorías por promedio y el anuncio para la liga. Se monta al abrirse (empieza con lo del evento o con
 * lo de un evento nuevo). La fecha va con «‹ ›» y «−7/+7» (DateStepper): en el teléfono no hay calendario del sistema.
 */
export function EventFormSheet({
  lid,
  type,
  event,
  onClose,
  onCreated,
}: {
  lid: string;
  type: EventType;
  /** Si viene, se edita; si no, se crea. */
  event?: BowlingEvent;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const c = useColors();
  const [form, setForm] = useState<EventInput>(() => (event ? eventFormOf(event) : defaults(type)));
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof EventInput>(k: K, v: EventInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const isTorneo = form.type === 'torneo';
  const rule = bowlingRuleText({ individualRankBy: form.individualRankBy, teamRankBy: form.teamRankBy, hcpPercent: Math.round(form.hcpPercent) || 0 });

  async function submit() {
    if (busy) return;
    setBusy(true);
    const data = cleanEventInput(form);
    if (event) {
      await runAction(() => updateEvent(lid, event.id, data), eventSavedText(true, form.type));
      onClose();
    } else {
      const id = await runAction(() => createEvent(lid, data), eventSavedText(false, form.type));
      onClose();
      if (id) onCreated?.(id);
    }
    setBusy(false);
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={eventFormTitle(!!event, form.type)}
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button onPress={onClose} style={{ flex: 1 }}>
            Cancelar
          </Button>
          <Button variant="primary" loading={busy} onPress={() => void submit()} style={{ flex: 1 }}>
            {event ? 'Guardar' : 'Crear'}
          </Button>
        </View>
      }
    >
      <Field label="Nombre" hint={!form.name ? 'Si lo dejas vacío se usa la fecha.' : undefined}>
        <Input accessibilityLabel="Nombre" value={form.name} maxLength={80} placeholder={eventNamePlaceholder(form)} onChangeText={(t) => set('name', t)} />
      </Field>
      <Field label="Fecha">
        <DateStepper value={form.date} onChange={(d) => set('date', d)} />
      </Field>
      <Field label="Juegos por jugador">
        <NumInput label="Juegos por jugador" value={form.games} max={10} onChange={(n) => set('games', n)} />
      </Field>
      {isTorneo && (
        <>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field label="Base del handicap" hint="2025: 230">
                <NumInput label="Base del handicap" value={form.hcpBase} max={300} onChange={(n) => set('hcpBase', n)} />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Porcentaje" hint="2025: 80. 0 = sin handicap">
                <NumInput label="Porcentaje" value={form.hcpPercent} max={100} onChange={(n) => set('hcpPercent', n)} />
              </Field>
            </View>
          </View>
          <View style={[styles.note, { backgroundColor: c.surface2 }]}>
            <Txt variant="small" tone="muted">
              {`Handicap por juego = (${form.hcpBase || 0} − promedio) × ${form.hcpPercent || 0}%. Ej.: promedio 165 → `}
              <Txt variant="small" style={{ fontFamily: font.bold }}>
                {String(hcpExample(form))}
              </Txt>
              {' pinos.'}
            </Txt>
          </View>
          <Field label="Jugadores por equipo" hint="Un equipo lleno no acepta más. 0 = sin límite">
            <NumInput label="Jugadores por equipo" value={form.teamSize} max={10} onChange={(n) => set('teamSize', n)} />
          </Field>
          <Field label="Individual se clasifica">
            <Segmented<RankBy>
              label="Individual se clasifica"
              value={form.individualRankBy}
              onChange={(v) => set('individualRankBy', v)}
              options={[
                { key: 'hcp', label: 'Con handicap' },
                { key: 'scratch', label: 'Scratch (solo pinos)' },
              ]}
            />
          </Field>
          <Field label="Equipos se clasifican">
            <Segmented<RankBy>
              label="Equipos se clasifican"
              value={form.teamRankBy}
              onChange={(v) => set('teamRankBy', v)}
              options={[
                { key: 'scratch', label: 'Scratch (solo pinos)' },
                { key: 'hcp', label: 'Con handicap' },
              ]}
            />
          </Field>
          {/* Con qué se entregan los premios del torneo, con lo elegido (RuleLine de la web). */}
          <Txt variant="small" tone="muted" accessibilityLiveRegion="polite" style={{ marginTop: -6 }}>
            {rule.rule}
            {!!rule.note && <Txt variant="small" style={{ color: c.warn, fontFamily: font.medium }}>{`\n${rule.note}`}</Txt>}
          </Txt>
          <View style={{ gap: 6 }}>
            <Txt variant="small" tone="muted" style={{ fontFamily: font.medium }}>
              Categorías por promedio (D es lo de abajo)
            </Txt>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['A', 'B', 'C'] as const).map((letter, i) => (
                <View key={letter} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={[styles.letter, { backgroundColor: c.accentSoft }]}>
                    <Txt style={{ fontSize: 12, fontFamily: font.bold, color: c.accent }}>{letter}</Txt>
                  </View>
                  <View style={{ flex: 1 }}>
                    <NumInput
                      label={`Categoría ${letter} desde`}
                      value={form.categoryCuts[i]}
                      max={300}
                      onChange={(n) => set('categoryCuts', form.categoryCuts.map((x, j) => (j === i ? n : x)) as [number, number, number])}
                    />
                  </View>
                </View>
              ))}
            </View>
            <Txt variant="small" tone="muted">
              Promedio mínimo de cada una. Se usan al armar equipos: uno de cada categoría cuando se puede.
            </Txt>
          </View>
          <Field
            label="Anuncio para la liga"
            hint="Sale arriba en Eventos para todos los miembros hasta el día del torneo, con el contacto de la liga para escribirle por WhatsApp."
          >
            <TextInput
              accessibilityLabel="Anuncio para la liga"
              multiline
              maxLength={500}
              value={form.announcement}
              onChangeText={(t) => set('announcement', t)}
              placeholder="Inscripción RD$1,000 · 3 juegos · equipos de 3. ¡Confirma con el admin!"
              placeholderTextColor={c.faint}
              textAlignVertical="top"
              style={[styles.area, { color: c.fg, borderColor: c.line, backgroundColor: c.surface }]}
            />
          </Field>
        </>
      )}
    </Sheet>
  );
}

/** Un número entero (0 a `max`): lo escrito se queda como se escribe; vacío vale 0 (como el campo de la web). */
function NumInput({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  return (
    <Input
      accessibilityLabel={label}
      keyboardType="number-pad"
      maxLength={String(max).length}
      value={text}
      onChangeText={(t) => {
        const clean = t.replace(/[^\d]/g, '');
        setText(clean);
        onChange(clean === '' ? 0 : Number(clean));
      }}
    />
  );
}

const styles = StyleSheet.create({
  note: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  letter: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  area: { minHeight: 96, borderRadius: radius.btn, borderWidth: 1.5, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, fontFamily: font.medium },
});
