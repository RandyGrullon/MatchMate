import { useEffect, useMemo, useState } from 'react';
import { LandPlot, Pencil, Plus, Trash2 } from 'lucide-react';
import { validateCourse, type GolfCourse, type GolfTee } from '../../../sports/golf/course';
import type { GolfCompetition } from '../../../sports/golf/scoring';
import { deleteGolfCourse, saveGolfCourse, saveGolfRules, useGolfCourses, useGolfRules, type GolfCourseDoc } from '../../../lib/data/golf';
import { useLeagueCtx } from '../../../lib/league';
import { useAction, useFeedback } from '../../../components/feedback';
import { Button, Card, Empty, Field, Input, ListSkeleton, Modal, Select, cx } from '../../../components/ui';
import { CompetitionPicker } from './RoundForm';
import { formatLabel } from './logic';

/**
 * Admin · Campos: los campos del club (par y SI por hoyo, salidas con rating y slope) y el formato por
 * defecto de la liga con los puntos del orden de mérito. Editar un campo no cambia las rondas ya creadas.
 */
export default function GolfAdmin() {
  const { lid } = useLeagueCtx();
  const courses = useGolfCourses(lid);
  const run = useAction();
  const { confirm } = useFeedback();
  const [editing, setEditing] = useState<GolfCourseDoc | 'nuevo' | null>(null);

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Campos del club</h2>
          <Button size="sm" variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing('nuevo')}>
            Agregar campo
          </Button>
        </div>
        {courses.loading ? (
          <ListSkeleton rows={2} />
        ) : !courses.data.length ? (
          <Empty icon={<LandPlot className="size-8" />} title="Todavía no hay campos">
            Agrega el campo con el par y el SI de cada hoyo y el rating y slope de cada salida (salen en la tarjeta del club).
          </Empty>
        ) : (
          <Card className="divide-y divide-line overflow-hidden">
            {courses.data.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{c.name}</div>
                  <div className="truncate text-xs text-muted">
                    {c.holes.length} hoyos · par {c.holes.reduce((a, h) => a + h.par, 0)} · {c.tees.map((t) => `${t.name} ${t.rating}/${t.slope}`).join(' · ')}
                  </div>
                </div>
                <Button size="sm" icon={<Pencil className="size-4" />} onClick={() => setEditing(c)} aria-label={`Editar ${c.name}`} />
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Trash2 className="size-4" />}
                  aria-label={`Borrar ${c.name}`}
                  onClick={async () => {
                    const ok = await confirm({
                      title: `¿Borrar ${c.name}?`,
                      message: 'Las rondas ya creadas guardan su copia del campo y no cambian.',
                      confirmText: 'Borrar',
                      danger: true,
                    });
                    if (ok) await run(() => deleteGolfCourse(lid, c.id), 'Campo borrado');
                  }}
                />
              </div>
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
  const parsed = points
    .split(/[,\s]+/)
    .filter(Boolean)
    .map(Number);
  const bad = !parsed.length || parsed.length > 50 || parsed.some((n) => !Number.isFinite(n) || n < 0 || n > 100);

  async function save() {
    setBusy(true);
    await run(() => saveGolfRules(lid, { competition: comp, meritPoints: parsed }), 'Reglas guardadas');
    setBusy(false);
  }

  return (
    <Card className="flex flex-col gap-3 px-4 py-4">
      <div>
        <h2 className="font-semibold">Formato de la liga</h2>
        <p className="text-xs text-muted">Lo que sale al crear una ronda (se puede cambiar en cada una). Ahora: {formatLabel(rules.data.competition)}.</p>
      </div>
      <CompetitionPicker value={comp} onChange={setComp} />
      <Field label="Puntos del orden de mérito por puesto" hint="Del 1.º en adelante, separados por coma. Un empate reparte los puntos de esos puestos.">
        <Input value={points} onChange={(e) => setPoints(e.target.value)} aria-invalid={bad} />
      </Field>
      <Button variant="primary" onClick={save} loading={busy} disabled={bad}>
        Guardar formato
      </Button>
    </Card>
  );
}

// ---------- Editor de campo ----------

interface TeeDraft {
  id: string;
  name: string;
  rating: string;
  slope: string;
  byNine: boolean;
  front: { rating: string; slope: string };
  back: { rating: string; slope: string };
  /** Pares o SI propios de esa salida (se conservan tal cual). */
  pars?: number[];
  sis?: number[];
}

/** SI por defecto: impares en la ida y pares en la vuelta (con 9 hoyos, 1–9). */
export const defaultSis = (n: number) => (n === 9 ? Array.from({ length: 9 }, (_, i) => i + 1) : [...Array.from({ length: 9 }, (_, i) => i * 2 + 1), ...Array.from({ length: 9 }, (_, i) => i * 2 + 2)]);

const newTee = (name: string, rating = '', slope = ''): TeeDraft => ({
  id: `t${Math.random().toString(36).slice(2, 8)}`,
  name,
  rating,
  slope,
  byNine: false,
  front: { rating: '', slope: '' },
  back: { rating: '', slope: '' },
});

const numOrNaN = (s: string) => (s.trim() === '' ? Number.NaN : Number(s.replace(',', '.')));
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Borrador del editor → campo del motor (para validar y guardar). */
export function draftCourse(id: string, name: string, holes: { par: number; si: number }[], tees: TeeDraft[]): GolfCourse {
  const n = holes.length;
  return {
    id,
    name: name.trim(),
    holes,
    tees: tees.map((t): GolfTee => {
      const pars = t.pars && t.pars.length === n ? t.pars : holes.map((h) => h.par);
      const tee: GolfTee = { id: t.id, name: t.name.trim(), rating: numOrNaN(t.rating), slope: numOrNaN(t.slope), par: sum(pars) };
      if (t.pars && t.pars.length === n) tee.pars = t.pars;
      if (t.sis && t.sis.length === n) tee.sis = t.sis;
      if (n === 18 && t.byNine) {
        tee.front9 = { rating: numOrNaN(t.front.rating), slope: numOrNaN(t.front.slope), par: sum(pars.slice(0, 9)) };
        tee.back9 = { rating: numOrNaN(t.back.rating), slope: numOrNaN(t.back.slope), par: sum(pars.slice(9)) };
      }
      return tee;
    }),
  };
}

export function CourseEditor({ open, course, onClose }: { open: boolean; course: GolfCourseDoc | null; onClose: () => void }) {
  const { lid } = useLeagueCtx();
  const run = useAction();
  const [name, setName] = useState('');
  const [holes, setHoles] = useState<{ par: number; si: number }[]>([]);
  const [tees, setTees] = useState<TeeDraft[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (course) {
      setName(course.name);
      setHoles(course.holes.map((h) => ({ par: h.par, si: h.si })));
      setTees(
        course.tees.map((t) => ({
          id: t.id,
          name: t.name,
          rating: String(t.rating),
          slope: String(t.slope),
          byNine: !!(t.front9 || t.back9),
          front: { rating: t.front9 ? String(t.front9.rating) : '', slope: t.front9 ? String(t.front9.slope) : '' },
          back: { rating: t.back9 ? String(t.back9.rating) : '', slope: t.back9 ? String(t.back9.slope) : '' },
          pars: t.pars,
          sis: t.sis,
        })),
      );
    } else {
      setName('');
      const sis = defaultSis(18);
      setHoles(sis.map((si) => ({ par: 4, si })));
      setTees([newTee('Blancas'), newTee('Rojas')]);
    }
  }, [open, course]);

  const n = holes.length;
  const draft = useMemo(() => draftCourse(course?.id ?? 'nuevo', name, holes, tees), [course, name, holes, tees]);
  const errors = useMemo(() => {
    const e = validateCourse(draft);
    if (tees.some((t) => !t.name.trim())) e.push('Cada salida lleva nombre (Azules, Blancas, Rojas…).');
    return e;
  }, [draft, tees]);
  const par = sum(holes.map((h) => h.par));

  function setCount(count: 9 | 18) {
    if (count === n) return;
    if (count === 9) {
      // Se quedan los hoyos 1–9 con sus SI en orden (1 al 9).
      const first = holes.slice(0, 9);
      const rank = [...first].map((h, i) => ({ si: h.si, i })).sort((a, b) => a.si - b.si);
      const sis = Array<number>(9);
      rank.forEach((r, k) => (sis[r.i] = k + 1));
      setHoles(first.map((h, i) => ({ par: h.par, si: sis[i] })));
    } else {
      const sis = defaultSis(18);
      setHoles(Array.from({ length: 18 }, (_, i) => ({ par: holes[i]?.par ?? 4, si: sis[i] })));
    }
    setTees(tees.map((t) => ({ ...t, byNine: count === 18 && t.byNine, pars: undefined, sis: undefined })));
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

  const setTee = (i: number, patch: Partial<TeeDraft>) => setTees(tees.map((t, k) => (k === i ? { ...t, ...patch } : t)));

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={course ? `Editar ${course.name}` : 'Nuevo campo'}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={save} loading={busy} disabled={!!errors.length}>
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
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
              {([9, 18] as const).map((c) => (
                <button key={c} type="button" onClick={() => setCount(c)} className={cx('rounded-lg py-2 text-sm font-medium', n === c ? 'bg-surface shadow-sm' : 'text-muted')}>
                  {c} hoyos
                </button>
              ))}
            </div>
          </Field>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-medium">Par y SI de cada hoyo</span>
            <span className="text-muted">
              Par total <b className="text-fg">{par}</b>
              {n === 18 && ` (ida ${sum(holes.slice(0, 9).map((h) => h.par))} · vuelta ${sum(holes.slice(9).map((h) => h.par))})`}
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
            {tees.length < 10 && (
              <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setTees([...tees, newTee('')])}>
                Otra salida
              </Button>
            )}
          </div>
          {tees.map((t, i) => (
            <Card key={t.id} className="flex flex-col gap-2 px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted">
                  Salida {i + 1} · par {draft.tees[i]?.par}
                  {t.pars ? ' (con pares propios)' : ''}
                  {t.sis ? ' · SI propios' : ''}
                </p>
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
            </Card>
          ))}
        </div>

        {errors.length > 0 && (
          <ul className="flex list-disc flex-col gap-0.5 rounded-xl bg-warn-soft py-2 pr-3 pl-7 text-sm text-warn">
            {[...new Set(errors)].slice(0, 8).map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
