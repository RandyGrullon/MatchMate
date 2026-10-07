import { useEffect, useState } from 'react';
import { AlertTriangle, CalendarX, CloudRain } from 'lucide-react';
import { DEFAULT_TZ } from '../../lib/calendar';
import { asBackendError } from '../../lib/db/errors';
import { SUSPEND_REASON_MAX, suspendChanges, suspendDay, suspendable, useSuspendPreview } from '../../lib/data/organizer';
import { useLeagueCtx } from '../../lib/league';
import { localNow } from '../../lib/reminders';
import { useNow } from '../../lib/useNow';
import { saveErrorMessage, useFeedback } from '../feedback';
import { Button, Card, Field, Input, ListRow, Modal, RowIcon, Skeleton, cx } from '../ui';
import { dayWords, suspendCounts, suspendDoneText, suspendLines, suspendNotice, suspendReasons } from './logic';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Hoy en la zona de la liga ('YYYY-MM-DD'). */
export function leagueToday(tz: string | null | undefined, now: Date = new Date()): string {
  try {
    return localNow(now, tz || DEFAULT_TZ).today;
  } catch {
    return localNow(now, DEFAULT_TZ).today;
  }
}

/**
 * Suspender un día (lluvia, apagón): el día (hoy por defecto), el motivo y, si se sabe, la nueva fecha. Muestra lo
 * que va a pasar (suspend_day_preview) y, al confirmar, mueve o aplaza todo y manda UN aviso a la liga.
 */
export function SuspendDayModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { lid, league } = useLeagueCtx();
  const { confirm, toast } = useFeedback();
  const today = leagueToday(league.tz);
  const [date, setDate] = useState(today);
  const [reason, setReason] = useState('');
  const [newDate, setNewDate] = useState('');
  const [busy, setBusy] = useState(false);
  // Cada vez que se abre, empieza en hoy y sin motivo.
  useEffect(() => {
    if (!open) return;
    setDate(leagueToday(league.tz));
    setReason('');
    setNewDate('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const validDate = ISO_DATE.test(date);
  const preview = useSuspendPreview(open ? lid : null, open && validDate ? date : null);
  const p = preview.data;
  const target = newDate && ISO_DATE.test(newDate) ? newDate : null;
  const badNewDate = !!target && (target < today || target === date);
  const why = reason.trim();
  const n = suspendable(p);
  // Sin nueva fecha, lo que tiene inscritos se queda: si es lo único, suspender no cambiaría nada (ni sale el aviso).
  const changes = suspendChanges(p, target);
  const canSend = validDate && !!why && !!p && changes > 0 && !badNewDate && !busy;
  const all = league.kind === 'torneo' ? 'todo el torneo' : 'toda la liga';

  async function send() {
    if (!canSend) return;
    const ok = await confirm({
      title: `¿Suspender el ${dayWords(date)}?`,
      message: (
        <>
          <span className="mb-2 block rounded-xl bg-surface-2 px-3 py-2 break-words text-fg">{suspendNotice(date, why, target)}</span>
          Ese aviso le llega a {all}. Lo que se mueva o se cancele no se puede deshacer desde aquí.
        </>
      ),
      confirmText: 'Suspender',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await suspendDay(lid, date, why, target);
      toast(suspendDoneText(r));
      onClose();
    } catch (e) {
      console.error(e);
      const be = asBackendError(e);
      toast(
        be?.kind === 'validation' ? 'Revisa el motivo y la nueva fecha (desde hoy y distinta del día que se suspende).' : saveErrorMessage(e),
        'error',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <CalendarX className="size-5 text-accent" /> Suspender un día
        </span>
      }
      footer={
        <>
          <Button className="h-11" onClick={onClose}>
            Cancelar
          </Button>
          <Button className="h-11" variant="danger" loading={busy} disabled={!canSend} icon={<CalendarX className="size-4" />} onClick={() => void send()}>
            Suspender el día
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Día que se suspende">
          <Input type="date" className="h-11" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>

        <div className="flex flex-col gap-1.5">
          <Field label="Motivo (va en el aviso)">
            <Input
              className="h-11"
              value={reason}
              maxLength={SUSPEND_REASON_MAX}
              onChange={(e) => setReason(e.target.value.slice(0, SUSPEND_REASON_MAX))}
              placeholder="Lluvia"
            />
          </Field>
          <div className="no-scrollbar -mx-5 flex gap-1.5 overflow-x-auto px-5" role="group" aria-label="Motivos listos">
            {suspendReasons(league.sport).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setReason(t)}
                className={cx(
                  'min-h-11 shrink-0 rounded-full px-3 text-sm font-medium transition active:scale-95',
                  reason === t ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted hover:text-fg',
                )}
              >
                {t}
              </button>
            ))}
            <span aria-hidden="true" className="w-3 shrink-0" />
          </div>
        </div>

        <Field
          label="Nueva fecha (opcional)"
          hint={
            badNewDate
              ? 'Tiene que ser desde hoy y distinta del día que se suspende.'
              : 'Si todavía no la sabes, déjala vacía: los partidos quedan aplazados y se avisa que la fecha se dirá después.'
          }
        >
          <Input type="date" className="h-11" value={newDate} min={today} onChange={(e) => setNewDate(e.target.value)} />
        </Field>

        <div className="rounded-xl border border-line bg-surface-2/60 p-3 text-sm" aria-live="polite">
          {!validDate ? (
            <p className="text-muted">Elige el día.</p>
          ) : preview.loading && !p ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : preview.error ? (
            <p className="flex items-center gap-2 text-danger">
              <AlertTriangle className="size-4 shrink-0" /> No se pudo ver qué hay ese día. Revisa tu conexión.
            </p>
          ) : p && n === 0 ? (
            <p className="text-muted">
              {p.counts.locked ? 'Lo de ese día ya empezó o tiene resultados: no hay nada que suspender.' : `El ${dayWords(date)} no hay nada programado.`}
            </p>
          ) : p ? (
            <>
              <p className="font-medium">
                El {dayWords(date)}: {suspendCounts(p).join(', ')}.
              </p>
              <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 text-muted">
                {suspendLines(p, target).map((l) => (
                  <li key={l}>{l}</li>
                ))}
                {changes > 0 && <li>Se manda un aviso a {all}.</li>}
              </ul>
              {changes === 0 && !badNewDate && (
                <p className="mt-2 font-medium text-warn">Sin nueva fecha no cambia nada: ponle una nueva fecha para moverlo.</p>
              )}
            </>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

/** Botón «Suspender un día» con su modal (Admin › Pendientes). */
export function SuspendDayButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button className={cx('h-11', className)} icon={<CloudRain className="size-4" />} onClick={() => setOpen(true)}>
        Suspender un día
      </Button>
      <SuspendDayModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** Organizar › Temporada y fechas: la fila «Suspender un día» (abre el mismo modal). */
export function SuspendDayRow() {
  const { league } = useLeagueCtx();
  const [open, setOpen] = useState(false);
  return (
    <Card className="overflow-hidden">
      <ListRow
        dense
        leading={
          <RowIcon>
            <CloudRain className="size-5" />
          </RowIcon>
        }
        title="Suspender un día"
        subtitle={`Lluvia, sin luz… mueve o aplaza lo de ese día y avisa a ${league.kind === 'torneo' ? 'todo el torneo' : 'toda la liga'}`}
        onClick={() => setOpen(true)}
      />
      <SuspendDayModal open={open} onClose={() => setOpen(false)} />
    </Card>
  );
}

/** Inicio de la liga, para los admins, solo si hoy hay algo que se pueda suspender: «Hoy: 3 partidos · Suspender». */
export function SuspendTodayCard() {
  const { lid, league, isAdmin } = useLeagueCtx();
  const now = useNow();
  const today = leagueToday(league.tz, now);
  const preview = useSuspendPreview(isAdmin ? lid : null, isAdmin ? today : null);
  const [open, setOpen] = useState(false);
  const p = preview.data;
  if (!isAdmin || !p || suspendable(p) === 0) return null;
  return (
    <Card className="animate-fade-up flex items-center gap-3 p-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
        <CloudRain className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted">Hoy</p>
        <p className="truncate text-sm font-semibold">{suspendCounts(p).join(' · ')}</p>
      </div>
      <Button className="h-11 shrink-0" icon={<CalendarX className="size-4" />} onClick={() => setOpen(true)}>
        Suspender
      </Button>
      <SuspendDayModal open={open} onClose={() => setOpen(false)} />
    </Card>
  );
}
