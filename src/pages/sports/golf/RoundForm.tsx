import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Plus, Trash2 } from 'lucide-react';
import type { Nine } from '../../../sports/golf/course';
import type { GolfCompetition } from '../../../sports/golf/scoring';
import {
  createGolfRound,
  createGolfTournament,
  updateGolfRound,
  useGolfCourses,
  useGolfRules,
  type GolfRoundFull,
} from '../../../lib/data/golf';
import { toIsoDate } from '../../../lib/format';
import { useLeagueCtx } from '../../../lib/league';
import { useAction } from '../../../components/feedback';
import { Button, Field, Input, Modal, Segmented, Select, cx } from '../../../components/ui';
import { COMPETITION_TEMPLATES, sameCompetition } from './logic';

/** Formato de la competencia: plantillas y % de handicap. */
export function CompetitionPicker({ value, onChange }: { value: GolfCompetition; onChange: (c: GolfCompetition) => void }) {
  const current = COMPETITION_TEMPLATES.find((t) => t.comp.format === value.format && t.comp.basis === value.basis);
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        {COMPETITION_TEMPLATES.map((t) => {
          const active = current?.key === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onChange({ ...t.comp, allowance: t.comp.basis === 'gross' ? 100 : (value.allowance ?? t.comp.allowance) })}
              aria-pressed={active}
              className={cx(
                'min-h-14 rounded-2xl px-3 py-2.5 text-left text-sm transition active:scale-[0.98]',
                active ? 'bg-accent-soft shadow-[inset_0_0_0_1.5px_var(--accent)]' : 'shadow-[inset_0_0_0_1px_var(--line)] hover:bg-surface-2',
              )}
            >
              <span className={cx('block font-semibold', active && 'text-accent')}>{t.label}</span>
              <span className="block text-xs text-muted">{t.hint}</span>
            </button>
          );
        })}
      </div>
      {value.basis === 'net' && (
        <Field label="% del handicap" hint="95 % es lo normal en stroke play individual y Stableford.">
          <Input
            type="number"
            inputMode="numeric"
            className="h-11"
            min={0}
            max={100}
            value={value.allowance ?? 95}
            onChange={(e) => onChange({ ...value, allowance: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
          />
        </Field>
      )}
    </div>
  );
}

/**
 * Crear una ronda o un torneo de varias rondas (admin), o cambiar lo del golf de una ronda (`edit`).
 * El campo y los hoyos solo cambian mientras nadie anotó nada.
 */
export function RoundForm({
  open,
  onClose,
  edit,
}: {
  open: boolean;
  onClose: () => void;
  /** Cambiar una ronda: su evento, lo que tiene (null = todavía sin campo) y si ya se anotó algo. */
  edit?: { eventId: string; round: GolfRoundFull | null; started: boolean };
}) {
  const { lid, base, isAdmin } = useLeagueCtx();
  const navigate = useNavigate();
  const run = useAction();
  const courses = useGolfCourses(lid);
  const rules = useGolfRules(lid);
  const today = toIsoDate(new Date());
  const [kind, setKind] = useState<'ronda' | 'torneo'>('ronda');
  const [name, setName] = useState('');
  const [date, setDate] = useState(today);
  const [dates, setDates] = useState<string[]>([today]);
  const [time, setTime] = useState('');
  const [courseId, setCourseId] = useState('');
  const [nine, setNine] = useState<Nine>('all');
  const [comp, setComp] = useState<GolfCompetition>(rules.data.competition);
  const [shotgun, setShotgun] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const r = edit?.round;
    setKind('ronda');
    setName('');
    setDate(today);
    setDates([today]);
    setTime('');
    setCourseId(r?.courseId ?? courses.data[0]?.id ?? '');
    setNine(r?.nine ?? 'all');
    setComp(r?.competition ?? rules.data.competition);
    setShotgun(r?.shotgun ?? false);
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open && !courseId && courses.data[0]) setCourseId(courses.data[0].id);
  }, [open, courseId, courses.data]);

  const course = courses.data.find((c) => c.id === courseId);
  const eighteen = (course?.holes.length ?? 18) === 18;
  const lockCourse = !!edit?.started;
  const valid = !!courseId && (edit ? true : kind === 'ronda' ? !!date : !!name.trim() && dates.length > 0 && dates.every(Boolean));

  const nineOptions = useMemo(
    () =>
      eighteen
        ? [
            { v: 'all' as Nine, l: '18 hoyos' },
            { v: 'front' as Nine, l: 'Ida 1–9' },
            { v: 'back' as Nine, l: 'Vuelta 10–18' },
          ]
        : [{ v: 'all' as Nine, l: '9 hoyos' }],
    [eighteen],
  );

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    try {
      if (edit) {
        const r = edit.round;
        const patch: Parameters<typeof updateGolfRound>[2] = {};
        if (!r || (!lockCourse && courseId !== r.courseId)) patch.courseId = courseId;
        if (!lockCourse && (!r || nine !== r.nine)) patch.nine = eighteen ? nine : 'all';
        if (!r || !sameCompetition(comp, r.competition)) patch.competition = comp;
        if (!r || shotgun !== r.shotgun) patch.shotgun = shotgun;
        const ok = await run(async () => {
          await updateGolfRound(lid, edit.eventId, patch);
          return true;
        }, 'Ronda guardada');
        if (ok) onClose();
        return;
      }
      const common = { courseId, nine: eighteen ? nine : ('all' as Nine), competition: comp, shotgun };
      if (kind === 'ronda') {
        const id = await run(() => createGolfRound(lid, { ...common, date, name, startTime: time || null }), 'Ronda creada');
        if (id) {
          onClose();
          navigate(`${base}/e/${id}`);
        }
      } else {
        const r = await run(() => createGolfTournament(lid, { ...common, name, dates: [...dates].sort() }), 'Torneo creado');
        if (r) {
          onClose();
          navigate(`${base}/e/${r.eventIds[0]}`);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={edit ? 'Ronda: campo y formato' : 'Nueva ronda'}
      footer={
        <>
          <Button className="h-11" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" className="h-11" onClick={submit} loading={busy} disabled={!valid}>
            {edit ? 'Guardar' : kind === 'ronda' ? 'Crear ronda' : `Crear torneo (${dates.length} ${dates.length === 1 ? 'ronda' : 'rondas'})`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {!courses.loading && !courses.data.length ? (
          <p className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">
            Primero agrega el campo del club en{' '}
            <Link to={`${base}/admin?tab=campos`} className="font-semibold underline" onClick={onClose}>
              Organizar › Campos
            </Link>
            .
          </p>
        ) : null}
        {!edit && (
          <Segmented
            full
            label="Qué se crea"
            options={[
              { key: 'ronda' as const, label: 'Una ronda' },
              { key: 'torneo' as const, label: 'Un torneo' },
            ]}
            value={kind}
            onChange={setKind}
          />
        )}
        {!edit && (
          <Field label={kind === 'ronda' ? 'Nombre (opcional)' : 'Nombre del torneo'}>
            <Input className="h-11" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={kind === 'ronda' ? 'Mensual de octubre' : 'Copa del Club'} />
          </Field>
        )}
        {!edit && kind === 'ronda' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha">
              <Input type="date" className="h-11" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Hora de salida (opcional)">
              <Input type="time" className="h-11" value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
          </div>
        )}
        {!edit && kind === 'torneo' && (
          <Field label="Fechas del torneo (una por ronda, hasta 6)">
            <div className="flex flex-col gap-2">
              {dates.map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-16 shrink-0 text-sm text-muted">Ronda {i + 1}</span>
                  <Input type="date" className="h-11" value={d} onChange={(e) => setDates(dates.map((x, k) => (k === i ? e.target.value : x)))} />
                  {dates.length > 1 && (
                    <Button variant="ghost" aria-label="Quitar ronda" icon={<Trash2 className="size-4" />} onClick={() => setDates(dates.filter((_, k) => k !== i))} />
                  )}
                </div>
              ))}
              {dates.length < 6 && (
                <Button variant="quiet" className="h-11 self-start" icon={<Plus className="size-4" />} onClick={() => setDates([...dates, dates[dates.length - 1] ?? today])}>
                  Otra ronda
                </Button>
              )}
            </div>
          </Field>
        )}
        <Field
          label="Campo"
          hint={
            lockCourse ? (
              'Ya hay golpes anotados: el campo y los hoyos no cambian.'
            ) : isAdmin && courses.data.length > 0 ? (
              <Link to={`${base}/admin?tab=campos`} onClick={onClose} className="font-medium text-accent">
                Agregar o cambiar campos
              </Link>
            ) : undefined
          }
        >
          <Select className="h-11" value={courseId} onChange={(e) => setCourseId(e.target.value)} disabled={lockCourse}>
            {courses.data.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.holes.length} hoyos · par {c.holes.reduce((a, h) => a + h.par, 0)}
              </option>
            ))}
          </Select>
        </Field>
        {nineOptions.length > 1 && (
          <Field label="Hoyos">
            <Segmented
              full
              label="Hoyos de la ronda"
              className={lockCourse ? 'pointer-events-none opacity-60' : undefined}
              options={nineOptions.map((o) => ({ key: o.v, label: o.l }))}
              value={nine}
              onChange={setNine}
            />
          </Field>
        )}
        <Field label="Formato">
          <CompetitionPicker value={comp} onChange={setComp} />
        </Field>
        <label className="flex min-h-14 items-start gap-3 rounded-2xl px-3 py-3 shadow-[inset_0_0_0_1px_var(--line)]">
          <input type="checkbox" className="mt-1 size-5 accent-[var(--accent)]" checked={shotgun} onChange={(e) => setShotgun(e.target.checked)} />
          <span className="text-sm">
            <span className="font-medium">Salida simultánea (shotgun)</span>
            <span className="block text-xs text-muted">Cada grupo sale por un hoyo distinto. El desempate usa los hoyos 10–18 igual.</span>
          </span>
        </label>
      </div>
    </Modal>
  );
}
