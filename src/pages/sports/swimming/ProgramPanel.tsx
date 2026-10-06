import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ListChecks, Pencil, Plus, Trash2 } from 'lucide-react';
import { deleteSwimEvent, saveSwimEvents, type SwimEventInput, type SwimEventItem } from '../../../lib/data/swimming';
import { SWIM_DISTANCES, SWIM_STROKES, STROKE_LABEL, GENDER_LABEL, validateSwimEvent, type SwimGender, type SwimStroke } from '../../../sports/swimming';
import { useBusy } from '../../../components/busy';
import { useAction, useFeedback } from '../../../components/feedback';
import { Button, Card, Empty, Field, Modal, Select, cx } from '../../../components/ui';
import { Segmented, useSwim } from './bits';
import { ageGroupsOf, clubMeetTemplate, eventHasResults, raceDetail, raceName, timeTrialTemplate } from './logic';
import type { MeetData } from './MeetPage';

const toInput = (e: SwimEventItem): SwimEventInput => ({ id: e.id, num: e.num, distance: e.distance, stroke: e.stroke, gender: e.gender, ageGroups: e.ageGroups });

/** Programa del encuentro: las pruebas en orden. El admin las agrega, cambia, ordena y quita. */
export function ProgramPanel({ data }: { data: MeetData }) {
  const { isAdmin } = useSwim();
  const run = useAction();
  const { confirm } = useFeedback();
  const { lid, meet, events, entries } = data;
  const [editing, setEditing] = useState<SwimEventItem | 'new' | null>(null);
  // Lo que espera: una plantilla ('club', 'control') o una prueba (`id:up`, `id:down`, `id:del`). Una a la vez: subir
  // y bajar cambian números de las pruebas de al lado.
  const busy = useBusy();
  const canEdit = isAdmin && !meet.finalizedAt;
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries) m.set(e.swimEventId, (m.get(e.swimEventId) ?? 0) + 1);
    return m;
  }, [entries]);

  const move = (k: number, dir: -1 | 1) => {
    const a = events[k];
    const b = events[k + dir];
    if (!a || !b) return;
    void busy.run(`${a.id}:${dir < 0 ? 'up' : 'down'}`, () => run(() => saveSwimEvents(lid, meet.id, [{ ...toInput(a), num: b.num }, { ...toInput(b), num: a.num }])));
  };
  const remove = async (ev: SwimEventItem) => {
    const n = counts.get(ev.id) ?? 0;
    if (
      !(await confirm({
        title: `¿Quitar la prueba ${ev.num}?`,
        message: n ? `Tiene ${n} inscritos: se borran con sus series y resultados.` : undefined,
        confirmText: 'Quitar',
        danger: true,
      }))
    )
      return;
    await busy.run(`${ev.id}:del`, () => run(() => deleteSwimEvent(lid, meet.id, ev.id), 'Prueba quitada'));
  };
  const applyTemplate = (key: 'club' | 'control', list: SwimEventInput[]) => busy.run(key, () => run(() => saveSwimEvents(lid, meet.id, list), 'Pruebas agregadas'));

  if (!events.length) {
    return (
      <Empty icon={<ListChecks className="size-8" />} title="Todavía no hay pruebas">
        {canEdit ? (
          <div className="mt-3 flex flex-col items-center gap-2">
            <Button variant="primary" loading={busy.isBusy('club')} disabled={busy.isBusy()} onClick={() => applyTemplate('club', clubMeetTemplate(meet.pool, meet.ageGroups))}>
              Usar las de un encuentro de club
            </Button>
            <Button loading={busy.isBusy('control')} disabled={busy.isBusy()} onClick={() => applyTemplate('control', timeTrialTemplate())}>
              Usar las de control de marcas
            </Button>
            <Button variant="ghost" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
              Agregar una prueba
            </Button>
          </div>
        ) : (
          'El organizador está armando el programa.'
        )}
        <EventFormModal data={data} editing={editing} onClose={() => setEditing(null)} />
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {canEdit && (
        <div className="flex justify-end">
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            Agregar prueba
          </Button>
        </div>
      )}
      <Card className="stagger divide-y divide-line overflow-hidden">
        {events.map((ev, k) => {
          const n = counts.get(ev.id) ?? 0;
          const locked = eventHasResults(ev.id, entries);
          return (
            <div key={ev.id} className="flex items-center gap-3 px-4 py-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft font-bold text-accent tabular-nums">{ev.num}</span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{raceName(ev)}</p>
                <p className="truncate text-xs text-muted">
                  {raceDetail(ev)} · {n === 1 ? '1 inscrito' : `${n} inscritos`}
                </p>
              </div>
              {canEdit && (
                <div className="flex shrink-0 items-center">
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Subir"
                    disabled={k === 0 || busy.isBusy()}
                    loading={busy.isBusy(`${ev.id}:up`)}
                    icon={<ArrowUp className="size-4" />}
                    onClick={() => move(k, -1)}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Bajar"
                    disabled={k === events.length - 1 || busy.isBusy()}
                    loading={busy.isBusy(`${ev.id}:down`)}
                    icon={<ArrowDown className="size-4" />}
                    onClick={() => move(k, 1)}
                  />
                  <Button size="sm" variant="ghost" aria-label="Cambiar" icon={<Pencil className="size-4" />} onClick={() => setEditing(ev)} />
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Quitar"
                    disabled={locked || busy.isBusy()}
                    loading={busy.isBusy(`${ev.id}:del`)}
                    className="text-danger"
                    icon={<Trash2 className="size-4" />}
                    onClick={() => remove(ev)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </Card>
      <p className="text-xs text-muted">
        Finales por tiempo: en cada serie nadan juntas las categorías y el puesto se calcula por categoría.
      </p>
      <EventFormModal data={data} editing={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

/** Agregar o cambiar una prueba: distancia, estilo, sexo y categorías. */
function EventFormModal({ data, editing, onClose }: { data: MeetData; editing: SwimEventItem | 'new' | null; onClose: () => void }) {
  const run = useAction();
  const { lid, meet, entries } = data;
  const current = editing && editing !== 'new' ? editing : null;
  const [stroke, setStroke] = useState<SwimStroke>('libre');
  const [distance, setDistance] = useState<number>(50);
  const [gender, setGender] = useState<SwimGender>('X');
  const [groups, setGroups] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!editing) return;
    setStroke(current?.stroke ?? 'libre');
    setDistance(current?.distance ?? 50);
    setGender(current?.gender ?? 'X');
    setGroups(current?.ageGroups ?? []);
  }, [editing, current]);
  const locked = !!current && eventHasResults(current.id, entries);
  const distances = SWIM_DISTANCES.filter((d) => !validateSwimEvent({ distance: d, stroke, pool: meet.pool }).length);
  const errors = validateSwimEvent({ distance: distance as SwimEventItem['distance'], stroke, pool: meet.pool });
  const all = ageGroupsOf(meet.ageGroups);

  const save = async () => {
    setBusy(true);
    const ok = await run(
      () => saveSwimEvents(lid, meet.id, [{ ...(current ? { id: current.id, num: current.num } : {}), distance, stroke, gender, ageGroups: groups }]),
      current ? 'Prueba guardada' : 'Prueba agregada',
    );
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal
      open={!!editing}
      onClose={onClose}
      title={current ? `Prueba ${current.num}` : 'Nueva prueba'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={busy} disabled={errors.length > 0} onClick={save}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {locked && <p className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">Ya tiene tiempos: la distancia y el estilo no se pueden cambiar.</p>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Estilo">
            <Select
              value={stroke}
              disabled={locked}
              onChange={(e) => {
                const s = e.target.value as SwimStroke;
                setStroke(s);
                const ok = SWIM_DISTANCES.filter((d) => !validateSwimEvent({ distance: d, stroke: s, pool: meet.pool }).length);
                if (!ok.includes(distance as (typeof SWIM_DISTANCES)[number])) setDistance(ok[0] ?? 50);
              }}
            >
              {SWIM_STROKES.map((s) => (
                <option key={s} value={s}>
                  {STROKE_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Distancia">
            <Select value={distance} disabled={locked} onChange={(e) => setDistance(Number(e.target.value))}>
              {distances.map((d) => (
                <option key={d} value={d}>
                  {d} m
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {errors.length > 0 && <p className="text-sm text-danger">{errors[0]}</p>}
        <Field label="Sexo">
          <Segmented
            label="Sexo de la prueba"
            value={gender}
            onChange={setGender}
            options={(['F', 'M', 'X'] as SwimGender[]).map((g) => ({ value: g, label: GENDER_LABEL[g] }))}
          />
        </Field>
        {all.length > 0 && (
          <Field label="Categorías" hint="Sin marcar ninguna, la prueba es abierta (el puesto igual se calcula por categoría).">
            <div className="flex flex-wrap gap-1.5">
              {all.map((g) => {
                const on = groups.includes(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setGroups((x) => (on ? x.filter((y) => y !== g.id) : all.filter((a) => a.id === g.id || x.includes(a.id)).map((a) => a.id)))}
                    className={cx(
                      'min-h-9 rounded-full px-3 text-sm font-medium transition active:scale-95',
                      on ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted hover:text-fg',
                    )}
                  >
                    {g.label}
                  </button>
                );
              })}
            </div>
          </Field>
        )}
      </div>
    </Modal>
  );
}
