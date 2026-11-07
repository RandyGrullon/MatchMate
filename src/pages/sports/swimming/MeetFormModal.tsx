import { useEffect, useState } from 'react';
import { createMeet, updateMeet, type AgeScheme, type SwimMeet } from '../../../lib/data/swimming';
import { toIsoDate } from '../../../lib/format';
import { useAction } from '../../../components/feedback';
import { Button, Field, Input, Modal, Select, Textarea } from '../../../components/ui';
import { Segmented } from './bits';
import { LANE_OPTIONS, meetChanges, meetFormValid, parsePoints, pointsAfterLanes, templateEvents, templateOptions, type MeetTemplate } from './admin';
import { SCHEME_LABEL } from './logic';

type Template = MeetTemplate;

/**
 * Crear o cambiar un encuentro: tipo, nombre, fecha, piscina, carriles, puntos por puesto y categorías.
 * Al crear se puede empezar con una plantilla («Encuentro de club» o «Control de marcas»).
 */
export function MeetFormModal({
  open,
  onClose,
  lid,
  meet,
  onCreated,
  defaults,
}: {
  open: boolean;
  onClose: () => void;
  lid: string;
  /** Encuentro que se cambia (sin él, se crea uno nuevo). */
  meet?: SwimMeet | null;
  onCreated?: (id: string) => void;
  /** Reglas de la liga para uno nuevo. */
  defaults: { pool: 25 | 50; lanes: number; points: number[]; ageGroups: AgeScheme };
}) {
  const run = useAction();
  const editing = !!meet;
  const [type, setType] = useState<'encuentro' | 'control'>('encuentro');
  const [name, setName] = useState('');
  const [date, setDate] = useState(toIsoDate(new Date()));
  const [time, setTime] = useState('');
  const [pool, setPool] = useState<25 | 50>(25);
  const [lanes, setLanes] = useState(6);
  const [points, setPoints] = useState('6-4-3-2-1');
  const [scheme, setScheme] = useState<AgeScheme>('cccan');
  const [template, setTemplate] = useState<Template>('club');
  const [announcement, setAnnouncement] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const m = meet;
    setType(m?.type === 'control' ? 'control' : 'encuentro');
    setName(m?.name ?? '');
    setDate(m?.date ?? toIsoDate(new Date()));
    setTime(m?.startTime ?? '');
    setPool(m?.pool ?? defaults.pool);
    setLanes(m?.lanes ?? defaults.lanes);
    setPoints((m?.points ?? defaults.points).join('-'));
    setScheme(m?.ageGroups ?? defaults.ageGroups);
    setTemplate('club');
    setAnnouncement(m?.announcement ?? '');
  }, [open, meet, defaults.pool, defaults.lanes, defaults.points, defaults.ageGroups]);

  const parsed = parsePoints(points);
  const valid = meetFormValid({ date, points: parsed, name });

  const save = async () => {
    if (!parsed) return;
    setBusy(true);
    const input = { type, name, date, startTime: time || null, announcement, pool, lanes, points: parsed, ageGroups: scheme };
    const tpl = templateEvents(template, pool, scheme);
    const r = await run(
      async () => (editing ? (await updateMeet(lid, meet!.id, meetChanges(meet!, input)), meet!.id) : createMeet(lid, input, tpl)),
      editing ? 'Encuentro guardado' : 'Encuentro creado',
    );
    setBusy(false);
    if (r) {
      onClose();
      if (!editing) onCreated?.(r);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Cambiar encuentro' : 'Nuevo encuentro'}
      footer={
        <>
          <Button variant="ghost" className="h-11" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" className="h-11" loading={busy} disabled={!valid} onClick={save}>
            {editing ? 'Guardar' : 'Crear'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Tipo">
          <Segmented
            label="Tipo de encuentro"
            value={type}
            onChange={(t) => {
              setType(t);
              if (!editing) setTemplate(t === 'control' ? 'control' : 'club');
            }}
            options={[
              { value: 'encuentro', label: 'Encuentro de club' },
              { value: 'control', label: 'Control de marcas' },
            ]}
          />
        </Field>
        <Field label="Nombre (opcional)">
          <Input className="h-11" value={name} maxLength={80} placeholder="Copa Delfín" onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha">
            <Input type="date" className="h-11" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Hora (opcional)">
            <Input type="time" className="h-11" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Piscina">
            <Segmented
              label="Piscina"
              value={pool}
              onChange={setPool}
              options={[
                { value: 25, label: '25 m' },
                { value: 50, label: '50 m' },
              ]}
            />
          </Field>
          <Field label="Carriles">
            <Select
              value={lanes}
              className="h-11"
              onChange={(e) => {
                const n = Number(e.target.value);
                // Los puntos por defecto siguen a los carriles mientras no se cambien a mano.
                setPoints(pointsAfterLanes(points, lanes, n));
                setLanes(n);
              }}
            >
              {LANE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} carriles
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {type === 'encuentro' && (
          <Field label="Puntos por puesto" hint="Del 1.º en adelante, separados por guiones. En un empate se reparten.">
            <Input className="h-11" value={points} inputMode="numeric" aria-invalid={!parsed} onChange={(e) => setPoints(e.target.value)} />
          </Field>
        )}
        <Field label="Categorías" hint="Se calculan con el año de nacimiento (edad al 31 de diciembre).">
          <Select className="h-11" value={scheme} onChange={(e) => setScheme(e.target.value as AgeScheme)}>
            {(Object.keys(SCHEME_LABEL) as AgeScheme[]).map((s) => (
              <option key={s} value={s}>
                {SCHEME_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
        {!editing && (
          <Field label="Empezar con" hint="Después puedes agregar, cambiar o quitar pruebas.">
            <Select className="h-11" value={template} onChange={(e) => setTemplate(e.target.value as Template)}>
              {templateOptions(pool, scheme).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Anuncio (opcional)">
          <Textarea
            value={announcement}
            maxLength={1000}
            rows={2}
            onChange={(e) => setAnnouncement(e.target.value)}
            placeholder="Calentamiento 7:30 am. Traigan gorro del club."
          />
        </Field>
      </div>
    </Modal>
  );
}
