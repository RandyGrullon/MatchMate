import { useEffect, useMemo, useState } from 'react';
import { LandPlot, Plus, Trash2 } from 'lucide-react';
import { MAX_TEES, courseDraft, courseErrors, courseLine, coursePar, draftCourse, newTee, parSplit, parseMeritPoints, resizeCourse, shownErrors, teeLine, type TeeDraft } from './courseForm';
import type { GolfCompetition } from '../../../sports/golf/scoring';
import { deleteGolfCourse, saveGolfCourse, saveGolfRules, useGolfCourses, useGolfRules, type GolfCourseDoc } from '../../../lib/data/golf';
import { useLeagueCtx } from '../../../lib/league';
import { useBusy } from '../../../components/busy';
import { useAction, useFeedback } from '../../../components/feedback';
import { Button, Card, Field, Input, ListRow, ListSkeleton, Modal, RowIcon, SectionHeader, Segmented, Select } from '../../../components/ui';
import { EmptyCard, SectionAdd } from '../FieldChrome';
import { CompetitionPicker } from './RoundForm';
import { formatLabel } from './logic';

/**
 * Organizar › Campos (rediseño «Calma y foco»; el título y «‹ Organizar» los pone la pantalla de Organizar): los campos
 * del club como filas (par y SI por hoyo, salidas con rating y slope; tocar uno lo abre para cambiarlo o borrarlo) con
 * «+ Agregar» a la derecha, y el formato por defecto de la liga con los puntos del orden de mérito. Editar un campo no
 * cambia las rondas ya creadas.
 */
export default function GolfAdmin() {
  const { lid } = useLeagueCtx();
  const courses = useGolfCourses(lid);
  const [editing, setEditing] = useState<GolfCourseDoc | 'nuevo' | null>(null);

  return (
    <div className="flex flex-col gap-[26px]">
      <section aria-labelledby="golf-campos">
        <SectionHeader
          id="golf-campos"
          title="Campos del club"
          action={courses.data.length > 0 ? <SectionAdd label="Agregar" onClick={() => setEditing('nuevo')} /> : undefined}
        />
        {courses.loading ? (
          <ListSkeleton rows={2} />
        ) : !courses.data.length ? (
          <EmptyCard
            icon={<LandPlot className="size-5" />}
            title="Todavía no hay campos"
            text="El par y el SI de cada hoyo y el rating y slope de cada salida (salen en la tarjeta del club)."
            action={
              <Button variant="primary" size="lg" icon={<Plus className="size-5" />} onClick={() => setEditing('nuevo')}>
                Agregar campo
              </Button>
            }
          />
        ) : (
          <Card className="overflow-hidden">
            {courses.data.map((c) => (
              <ListRow
                key={c.id}
                leading={
                  <RowIcon tone="accent">
                    <LandPlot className="size-5" />
                  </RowIcon>
                }
                title={c.name}
                subtitle={courseLine(c)}
                onClick={() => setEditing(c)}
                ariaLabel={`Editar ${c.name}`}
              />
            ))}
          </Card>
        )}
      </section>
      <RulesCard />
      <CourseEditor open={editing != null} course={editing === 'nuevo' ? null : editing} onClose={() => setEditing(null)} />
    </div>
  );
}

/** Formato por defecto de las rondas nuevas y puntos del orden de mérito. */
function RulesCard() {
  const { lid } = useLeagueCtx();
  const rules = useGolfRules(lid);
  const run = useAction();
  const [comp, setComp] = useState<GolfCompetition>(rules.data.competition);
  const [points, setPoints] = useState(rules.data.meritPoints.join(', '));
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setComp(rules.data.competition);
    setPoints(rules.data.meritPoints.join(', '));
  }, [rules.data]);
  const { points: parsed, bad } = parseMeritPoints(points);

  async function save() {
    setBusy(true);
    await run(() => saveGolfRules(lid, { competition: comp, meritPoints: parsed }), 'Reglas guardadas');
    setBusy(false);
  }

  return (
    <section aria-labelledby="golf-formato">
      <SectionHeader id="golf-formato" title="Formato de la liga" />
      <Card className="flex flex-col gap-4 p-5">
        <p className="text-meta text-muted">Lo que sale al crear una ronda (se cambia en cada una). Ahora: {formatLabel(rules.data.competition)}.</p>
        <CompetitionPicker value={comp} onChange={setComp} />
        <Field label="Puntos del orden de mérito por puesto" hint="Del 1.º en adelante, separados por coma. Un empate reparte los puntos.">
          <Input className="h-11" value={points} onChange={(e) => setPoints(e.target.value)} aria-invalid={bad} />
        </Field>
        <Button variant="primary" size="lg" onClick={save} loading={busy} disabled={bad}>
          Guardar formato
        </Button>
      </Card>
    </section>
  );
}

// ---------- Editor de campo ----------

// La lógica del editor (el borrador, 9 o 18 hoyos, lo que falta) está en courseForm.ts: la comparte la app.
export { defaultSis, draftCourse } from './courseForm';

export function CourseEditor({ open, course, onClose }: { open: boolean; course: GolfCourseDoc | null; onClose: () => void }) {
  const { lid } = useLeagueCtx();
  const run = useAction();
  const [name, setName] = useState('');
  const [holes, setHoles] = useState<{ par: number; si: number }[]>([]);
  const [tees, setTees] = useState<TeeDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const { confirm } = useFeedback();
  // Borrar el campo (antes, el botón de la fila): la ruedita en su botón.
  const removing = useBusy();

  useEffect(() => {
    if (!open) return;
    const d = courseDraft(course);
    setName(d.name);
    setHoles(d.holes);
    setTees(d.tees);
  }, [open, course]);

  const n = holes.length;
  const draft = useMemo(() => draftCourse(course?.id ?? 'nuevo', name, holes, tees), [course, name, holes, tees]);
  const errors = useMemo(() => courseErrors(draft, tees), [draft, tees]);
  const par = coursePar(holes);

  function setCount(count: 9 | 18) {
    // A 9 se quedan los hoyos 1–9 con sus SI en orden (1 al 9).
    const next = resizeCourse(holes, tees, count);
    if (!next) return;
    setHoles(next.holes);
    setTees(next.tees);
  }

  async function save() {
    if (errors.length || busy) return;
    setBusy(true);
    const ok = await run(async () => {
      await saveGolfCourse(lid, { id: course?.id, name: draft.name, holes: draft.holes, tees: draft.tees });
      return true;
    }, 'Campo guardado');
    setBusy(false);
    if (ok) onClose();
  }

  async function remove() {
    if (!course) return;
    const ok = await confirm({
      title: `¿Borrar ${course.name}?`,
      message: 'Las rondas ya creadas guardan su copia del campo y no cambian.',
      confirmText: 'Borrar',
      danger: true,
    });
    if (!ok) return;
    const done = await removing.run('borrar', () => run(async () => {
      await deleteGolfCourse(lid, course.id);
      return true;
    }, 'Campo borrado'));
    if (done) onClose();
  }

  const setTee = (i: number, patch: Partial<TeeDraft>) => setTees(tees.map((t, k) => (k === i ? { ...t, ...patch } : t)));

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={course ? `Editar ${course.name}` : 'Nuevo campo'}
      footer={
        <>
          {course && (
            <Button variant="ghost" className="mr-auto h-11 text-danger" icon={<Trash2 className="size-4" />} loading={removing.isBusy()} disabled={busy} onClick={() => void remove()}>
              Borrar
            </Button>
          )}
          <Button className="h-11" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" className="h-11" onClick={save} loading={busy} disabled={!!errors.length || removing.isBusy()}>
            Guardar campo
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
          <Field label="Nombre del campo">
            <Input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Club de Golf …" />
          </Field>
          <Field label="Hoyos">
            <Segmented
              full
              label="Hoyos del campo"
              options={[
                { key: '9', label: '9 hoyos' },
                { key: '18', label: '18 hoyos' },
              ]}
              value={String(n === 9 ? 9 : 18)}
              onChange={(k) => setCount(k === '9' ? 9 : 18)}
            />
          </Field>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-medium">Par y SI de cada hoyo</span>
            <span className="text-muted">
              Par total <b className="text-fg">{par}</b>
              {n === 18 && ` (${parSplit(holes)})`}
            </span>
          </div>
          <p className="mb-2 text-xs text-muted">SI = índice de dificultad (1 = el hoyo más difícil), sin repetir. Sale en la tarjeta del club.</p>
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            {[holes.slice(0, Math.min(9, n)), holes.slice(9)].filter((p) => p.length).map((part, h) => (
              <div key={h} className="flex flex-col">
                <div className="grid grid-cols-[2.5rem_1fr_1fr] gap-2 py-1 text-xs text-muted">
                  <span>Hoyo</span>
                  <span>Par</span>
                  <span>SI</span>
                </div>
                {part.map((hole, k) => {
                  const i = h * 9 + k;
                  return (
                    <div key={i} className="grid grid-cols-[2.5rem_1fr_1fr] items-center gap-2 py-0.5">
                      <span className="text-sm font-semibold tabular-nums">{i + 1}</span>
                      <Select
                        value={hole.par}
                        aria-label={`Par del hoyo ${i + 1}`}
                        onChange={(e) => setHoles(holes.map((x, j) => (j === i ? { ...x, par: Number(e.target.value) } : x)))}
                      >
                        {[3, 4, 5, 6].map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </Select>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={18}
                        aria-label={`SI del hoyo ${i + 1}`}
                        value={Number.isFinite(hole.si) ? hole.si : ''}
                        onChange={(e) => setHoles(holes.map((x, j) => (j === i ? { ...x, si: e.target.value === '' ? Number.NaN : Number(e.target.value) } : x)))}
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Salidas (tees)</span>
            {tees.length < MAX_TEES && (
              <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setTees([...tees, newTee('')])}>
                Otra salida
              </Button>
            )}
          </div>
          {tees.map((t, i) => (
            <div key={t.id} className="flex flex-col gap-2 rounded-2xl bg-surface-2 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted">{teeLine(i, draft.tees[i]?.par, t)}</p>
                <Button size="sm" variant="ghost" aria-label="Quitar salida" icon={<Trash2 className="size-4" />} disabled={tees.length === 1} onClick={() => setTees(tees.filter((_, k) => k !== i))} />
              </div>
              <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1fr_6rem_6rem]">
                <Field label="Nombre" className="col-span-2 sm:col-span-1">
                  <Input value={t.name} maxLength={40} onChange={(e) => setTee(i, { name: e.target.value })} placeholder="Blancas" />
                </Field>
                <Field label="Rating">
                  <Input inputMode="decimal" value={t.rating} onChange={(e) => setTee(i, { rating: e.target.value })} placeholder="71.2" />
                </Field>
                <Field label="Slope">
                  <Input inputMode="numeric" value={t.slope} onChange={(e) => setTee(i, { slope: e.target.value })} placeholder="128" />
                </Field>
              </div>
              {n === 18 && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={t.byNine} onChange={(e) => setTee(i, { byNine: e.target.checked })} />
                  Rating y slope de cada vuelta (para rondas de 9 hoyos)
                </label>
              )}
              {n === 18 && t.byNine && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Field label="Ida: rating">
                    <Input inputMode="decimal" value={t.front.rating} onChange={(e) => setTee(i, { front: { ...t.front, rating: e.target.value } })} />
                  </Field>
                  <Field label="Ida: slope">
                    <Input inputMode="numeric" value={t.front.slope} onChange={(e) => setTee(i, { front: { ...t.front, slope: e.target.value } })} />
                  </Field>
                  <Field label="Vuelta: rating">
                    <Input inputMode="decimal" value={t.back.rating} onChange={(e) => setTee(i, { back: { ...t.back, rating: e.target.value } })} />
                  </Field>
                  <Field label="Vuelta: slope">
                    <Input inputMode="numeric" value={t.back.slope} onChange={(e) => setTee(i, { back: { ...t.back, slope: e.target.value } })} />
                  </Field>
                </div>
              )}
            </div>
          ))}
        </div>

        {errors.length > 0 && (
          <ul className="flex list-disc flex-col gap-0.5 rounded-xl bg-warn-soft py-2 pr-3 pl-7 text-sm text-warn">
            {shownErrors(errors).map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
