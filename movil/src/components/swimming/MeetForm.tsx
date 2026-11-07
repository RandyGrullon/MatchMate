/**
 * Crear o cambiar un encuentro (MeetFormModal de la web, con su misma lógica: src/pages/sports/swimming/admin.ts): tipo,
 * nombre, fecha y hora, piscina, carriles, puntos por puesto, categorías y anuncio. Al crear se puede empezar con una
 * plantilla («Pruebas de un encuentro de club» o «de control de marcas»). La fecha y la hora van con «‹ ›» (sin el
 * calendario del sistema), como las demás de la app.
 */
import { useState } from 'react';
import { Platform, View } from 'react-native';
import { createMeet, updateMeet, type AgeScheme, type SwimMeet, type SwimRules } from '@mm/lib/data/swimming';
import { toIsoDate } from '@mm/lib/format';
import { useNow } from '@mm/lib/useNow';
import { LANE_OPTIONS, meetChanges, meetFormValid, parsePoints, pointsAfterLanes, templateEvents, templateOptions, type MeetTemplate } from '@mm/pages/sports/swimming/admin';
import { SCHEME_LABEL } from '@mm/pages/sports/swimming/logic';
import { DateStepper } from '@/components/DateStepper';
import { ScoreStepper } from '@/components/esports/inputs';
import { Button, Field, Input, Segmented, Sheet } from '@/components/ui';
import { Col, InlineSelect, OptionalTime, SheetFooter, TwoCols } from './adminParts';
import { runAction } from './parts';

type MeetKind = 'encuentro' | 'control';

const SCHEMES = (Object.keys(SCHEME_LABEL) as AgeScheme[]).map((s) => ({ value: s, label: SCHEME_LABEL[s] }));
const MIN_LANES = LANE_OPTIONS[0];
const MAX_LANES = LANE_OPTIONS[LANE_OPTIONS.length - 1];

export interface MeetFormProps {
  open: boolean;
  onClose: () => void;
  lid: string;
  /** Encuentro que se cambia (sin él, se crea uno nuevo). */
  meet?: SwimMeet | null;
  onCreated?: (id: string) => void;
  /** Reglas de la liga para uno nuevo. */
  defaults: SwimRules;
}

/** La hoja «Nuevo encuentro» o «Cambiar encuentro» (se monta al abrirla: cada vez empieza con lo de ahora). */
export function MeetFormSheet(props: MeetFormProps) {
  return props.open ? <MeetFormOpen {...props} /> : null;
}

function MeetFormOpen({ onClose, lid, meet, onCreated, defaults }: MeetFormProps) {
  const today = toIsoDate(useNow());
  const editing = !!meet;
  const [type, setType] = useState<MeetKind>(meet?.type === 'control' ? 'control' : 'encuentro');
  const [name, setName] = useState(meet?.name ?? '');
  const [date, setDate] = useState(meet?.date ?? today);
  const [time, setTime] = useState(meet?.startTime ?? '');
  const [pool, setPool] = useState<25 | 50>(meet?.pool ?? defaults.pool);
  const [lanes, setLanes] = useState(meet?.lanes ?? defaults.lanes);
  const [points, setPoints] = useState((meet?.points ?? defaults.points).join('-'));
  const [scheme, setScheme] = useState<AgeScheme>(meet?.ageGroups ?? defaults.ageGroups);
  const [template, setTemplate] = useState<MeetTemplate>('club');
  const [announcement, setAnnouncement] = useState(meet?.announcement ?? '');
  const [busy, setBusy] = useState(false);

  const parsed = parsePoints(points);
  const valid = meetFormValid({ date, points: parsed, name });

  const save = async () => {
    if (!parsed) return;
    setBusy(true);
    const input = { type, name, date, startTime: time || null, announcement, pool, lanes, points: parsed, ageGroups: scheme };
    const tpl = templateEvents(template, pool, scheme);
    const r = await runAction(
      async () => (meet ? (await updateMeet(lid, meet.id, meetChanges(meet, input)), meet.id) : createMeet(lid, input, tpl)),
      editing ? 'Encuentro guardado' : 'Encuentro creado',
    );
    setBusy(false);
    if (r) {
      onClose();
      if (!editing) onCreated?.(r);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={editing ? 'Cambiar encuentro' : 'Nuevo encuentro'}
      footer={
        <SheetFooter onCancel={onClose}>
          <Button variant="primary" full loading={busy} disabled={!valid} onPress={save}>
            {editing ? 'Guardar' : 'Crear'}
          </Button>
        </SheetFooter>
      }
    >
      <View style={{ gap: 16 }}>
        <Field label="Tipo">
          <Segmented<MeetKind>
            label="Tipo de encuentro"
            value={type}
            onChange={(t) => {
              setType(t);
              if (!editing) setTemplate(t === 'control' ? 'control' : 'club');
            }}
            options={[
              { key: 'encuentro', label: 'Encuentro de club' },
              { key: 'control', label: 'Control de marcas' },
            ]}
          />
        </Field>
        <Field label="Nombre (opcional)">
          <Input accessibilityLabel="Nombre (opcional)" value={name} maxLength={80} placeholder="Copa Delfín" onChangeText={setName} />
        </Field>
        <Field label="Fecha">
          <DateStepper value={date} onChange={setDate} />
        </Field>
        <Field label="Hora (opcional)">
          <OptionalTime value={time} onChange={setTime} label="Hora (opcional)" />
        </Field>
        <TwoCols>
          <Col>
            <Field label="Piscina">
              <Segmented<'25' | '50'>
                label="Piscina"
                value={pool === 50 ? '50' : '25'}
                onChange={(v) => setPool(v === '50' ? 50 : 25)}
                options={[
                  { key: '25', label: '25 m' },
                  { key: '50', label: '50 m' },
                ]}
              />
            </Field>
          </Col>
          <Col>
            <Field label="Carriles">
              <ScoreStepper
                label="Carriles"
                value={lanes}
                min={MIN_LANES}
                max={MAX_LANES}
                onChange={(n) => {
                  const next = n ?? lanes;
                  // Los puntos por defecto siguen a los carriles mientras no se cambien a mano.
                  setPoints(pointsAfterLanes(points, lanes, next));
                  setLanes(next);
                }}
              />
            </Field>
          </Col>
        </TwoCols>
        {type === 'encuentro' && (
          <Field label="Puntos por puesto" hint="Del 1.º en adelante, separados por guiones. En un empate se reparten.">
            <Input accessibilityLabel="Puntos por puesto" value={points} keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'} invalid={!parsed} onChangeText={setPoints} />
          </Field>
        )}
        <Field label="Categorías" hint="Se calculan con el año de nacimiento (edad al 31 de diciembre).">
          <InlineSelect<AgeScheme> label="Categorías" value={scheme} options={SCHEMES} onChange={setScheme} />
        </Field>
        {!editing && (
          <Field label="Empezar con" hint="Después puedes agregar, cambiar o quitar pruebas.">
            <InlineSelect<MeetTemplate> label="Empezar con" value={template} options={templateOptions(pool, scheme)} onChange={setTemplate} />
          </Field>
        )}
        <Field label="Anuncio (opcional)">
          <Input
            accessibilityLabel="Anuncio (opcional)"
            multiline
            value={announcement}
            maxLength={1000}
            placeholder="Calentamiento 7:30 am. Traigan gorro del club."
            onChangeText={setAnnouncement}
            style={{ height: 88, paddingTop: 14, textAlignVertical: 'top' }}
          />
        </Field>
      </View>
    </Sheet>
  );
}
