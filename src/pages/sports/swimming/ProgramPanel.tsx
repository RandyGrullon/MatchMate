import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ListChecks, Plus, Trash2 } from 'lucide-react';
import { deleteSwimEvent, saveSwimEvents, type SwimEventInput, type SwimEventItem } from '../../../lib/data/swimming';
import { SWIM_DISTANCES, SWIM_STROKES, STROKE_LABEL, GENDER_LABEL, validateSwimEvent, type SwimGender, type SwimStroke } from '../../../sports/swimming';
import { useBusy, type Busy } from '../../../components/busy';
import { useAction, useFeedback } from '../../../components/feedback';
import { Button, Card, Field, ListRow, Modal, SectionHeader, Select, cx } from '../../../components/ui';
import { EmptyCard, SectionAdd } from '../FieldChrome';
import { Segmented, useSwim } from './bits';
import { ageGroupsOf, clubMeetTemplate, eventHasResults, raceDetail, raceName, timeTrialTemplate } from './logic';
import type { MeetData } from './MeetPage';

const toInput = (e: SwimEventItem): SwimEventInput => ({ id: e.id, num: e.num, distance: e.distance, stroke: e.stroke, gender: e.gender, ageGroups: e.ageGroups });

/** El número de la prueba en su caja, al principio de la fila (como el carril en la hoja de series). */
export function NumBox({ n, on }: { n: number; on?: boolean }) {
  return (
    <span aria-hidden="true" className={cx('num grid size-10 shrink-0 place-items-center rounded-xl text-[17px] font-[650]', on ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-fg-2')}>
      {n}
    </span>
  );
}

/**
 * Programa del encuentro (rediseño «Calma y foco»): las pruebas en orden, como filas (el número, la prueba, para quién y
 * cuántos van). El admin agrega con «+ Agregar» y toca una prueba para cambiarla, subirla, bajarla o quitarla. Sin
 * pruebas, empieza con una plantilla.
 */
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

  const move = (ev: SwimEventItem, dir: -1 | 1) => {
    const k = events.findIndex((e) => e.id === ev.id);
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
    const ok = await busy.run(`${ev.id}:del`, () => run(() => deleteSwimEvent(lid, meet.id, ev.id).then(() => true), 'Prueba quitada'));
    if (ok) setEditing(null);
  };
  const applyTemplate = (key: 'club' | 'control', list: SwimEventInput[]) => busy.run(key, () => run(() => saveSwimEvents(lid, meet.id, list), 'Pruebas agregadas'));
  const modal = (
    <EventFormModal
      data={data}
      editing={editing}
      onClose={() => setEditing(null)}
      tools={canEdit ? { move, remove, busy, locked: (ev) => eventHasResults(ev.id, entries) } : null}
    />
  );

  if (!events.length) {
    return (
      <>
        <EmptyCard
          icon={<ListChecks className="size-5" />}
          title="Todavía no hay pruebas"
          text={canEdit ? 'Empieza con una plantilla o agrega las pruebas una por una.' : 'El organizador está armando el programa.'}
          action={
            canEdit && (
              <div className="flex flex-col gap-2.5">
                <Button variant="primary" size="lg" loading={busy.isBusy('club')} disabled={busy.isBusy()} onClick={() => applyTemplate('club', clubMeetTemplate(meet.pool, meet.ageGroups))}>
                  Usar las de un encuentro de club
                </Button>
                <Button variant="quiet" size="lg" loading={busy.isBusy('control')} disabled={busy.isBusy()} onClick={() => applyTemplate('control', timeTrialTemplate())}>
                  Usar las de control de marcas
                </Button>
                <Button variant="ghost" className="h-11" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
                  Agregar una prueba
                </Button>
              </div>
            )
          }
        />
        {modal}
      </>
    );
  }

  return (
    <section aria-labelledby="natacion-programa" className="flex flex-col">
      <SectionHeader
        id="natacion-programa"
        title={events.length === 1 ? '1 prueba' : `${events.length} pruebas`}
        action={canEdit ? <SectionAdd label="Agregar" onClick={() => setEditing('new')} /> : undefined}
      />
      <Card className="stagger overflow-hidden">
        {events.map((ev) => {
          const n = counts.get(ev.id) ?? 0;
          return (
            <ListRow
              key={ev.id}
              dense
              leading={<NumBox n={ev.num} />}
              title={raceName(ev)}
              subtitle={`${raceDetail(ev)} · ${n === 1 ? '1 inscrito' : `${n} inscritos`}`}
              onClick={canEdit ? () => setEditing(ev) : undefined}
              ariaLabel={canEdit ? `Cambiar la prueba ${ev.num}: ${raceName(ev)}` : undefined}
            />
          );
        })}
      </Card>
      <p className="mx-1 mt-3 text-[13px] leading-[1.4] text-muted">Finales por tiempo: en cada serie nadan juntas las categorías; el puesto es por categoría.</p>
      {modal}
    </section>
  );
}

/** Agregar o cambiar una prueba: distancia, estilo, sexo y categorías; una que ya existe, además, subirla, bajarla o quitarla. */
function EventFormModal({
  data,
  editing,
  onClose,
  tools,
}: {
  data: MeetData;
  editing: SwimEventItem | 'new' | null;
  onClose: () => void;
  tools: { move: (ev: SwimEventItem, dir: -1 | 1) => void; remove: (ev: SwimEventItem) => Promise<void>; busy: Busy<string>; locked: (ev: SwimEventItem) => boolean } | null;
}) {
  const run = useAction();
  const { lid, meet, entries, events } = data;
  const picked = editing && editing !== 'new' ? editing : null;
  // La prueba como está ahora (subir y bajar le cambian el número con la ventana abierta).
  const current = picked ? (events.find((e) => e.id === picked.id) ?? picked) : null;
  const [stroke, setStroke] = useState<SwimStroke>('libre');
  const [distance, setDistance] = useState<number>(50);
  const [gender, setGender] = useState<SwimGender>('X');
  const [groups, setGroups] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!editing) return;
    setStroke(picked?.stroke ?? 'libre');
    setDistance(picked?.distance ?? 50);
    setGender(picked?.gender ?? 'X');
    setGroups(picked?.ageGroups ?? []);
  }, [editing, picked]);
  const locked = !!current && eventHasResults(current.id, entries);
  const distances = SWIM_DISTANCES.filter((d) => !validateSwimEvent({ distance: d, stroke, pool: meet.pool }).length);
  const errors = validateSwimEvent({ distance: distance as SwimEventItem['distance'], stroke, pool: meet.pool });
  const all = ageGroupsOf(meet.ageGroups);
  const k = current ? events.findIndex((e) => e.id === current.id) : -1;
  const waiting = tools?.busy.isBusy() ?? false;

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
          <Button variant="ghost" className="h-11" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" className="h-11" loading={busy} disabled={errors.length > 0 || waiting} onClick={save}>
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
              className="h-11"
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
            <Select value={distance} disabled={locked} className="h-11" onChange={(e) => setDistance(Number(e.target.value))}>
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
                      'min-h-11 rounded-full px-3.5 text-sm font-medium transition active:scale-95',
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
        {current && tools && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <Button
              variant="quiet"
              className="h-11"
              icon={<ArrowUp className="size-4" />}
              disabled={k <= 0 || waiting}
              loading={tools.busy.isBusy(`${current.id}:up`)}
              onClick={() => tools.move(current, -1)}
            >
              Subir
            </Button>
            <Button
              variant="quiet"
              className="h-11"
              icon={<ArrowDown className="size-4" />}
              disabled={k < 0 || k >= events.length - 1 || waiting}
              loading={tools.busy.isBusy(`${current.id}:down`)}
              onClick={() => tools.move(current, 1)}
            >
              Bajar
            </Button>
            <Button
              variant="ghost"
              className="ml-auto h-11 text-danger"
              icon={<Trash2 className="size-4" />}
              disabled={tools.locked(current) || waiting}
              loading={tools.busy.isBusy(`${current.id}:del`)}
              onClick={() => void tools.remove(current)}
            >
              Quitar prueba
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
