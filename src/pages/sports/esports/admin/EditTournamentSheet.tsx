import { useState } from 'react';
import { esportsErrorText, updateTournament, type EsportsTournament } from '../../../../lib/data/esports';
import { useBusy } from '../../../../components/busy';
import { useFeedback } from '../../../../components/feedback';
import { useIsPro } from '../../../../components/mode';
import { CreateStyles } from '../../../../components/create/styles';
import { Button, Field, Input, Sheet, Textarea } from '../../../../components/ui';
import { CHECKIN_OPTIONS, idRequirement, rankRequirement, type FormatValue } from '../../../esports/create/logic';
import { FormatFields, RequirementToggles } from '../../../esports/create/steps';
import { FORMAT_LOCKED_TEXT, editInitial, editRange, editTournamentErrors, editTournamentPatch } from './logic';
import { ChoiceChips, ScoreStepper } from '../parts';

/**
 * «Editar torneo» (§9.7 esports_update_tournament): nombre, inicio, cierre de la inscripción, check-in, cupo (no menos que
 * los aprobados), premio y reglas; y, solo en la inscripción y sin fases, el formato con sus ajustes y lo que se pide
 * (ID confirmado y rango verificado, solo si el juego lo puede comprobar).
 */
export function EditTournamentSheet({ open, onClose, t, tz, approved, formatEditable }: { open: boolean; onClose: () => void; t: EsportsTournament; tz?: string; approved: number; formatEditable: boolean }) {
  return (
    <Sheet open={open} onClose={onClose} title="Editar torneo" subtitle={t.name}>
      {open && <Body t={t} tz={tz} approved={approved} formatEditable={formatEditable} onDone={onClose} />}
    </Sheet>
  );
}

function Body({ t, tz, approved, formatEditable, onDone }: { t: EsportsTournament; tz?: string; approved: number; formatEditable: boolean; onDone: () => void }) {
  const { toast } = useFeedback();
  const pro = useIsPro();
  const busy = useBusy<'guardar'>();
  const [initial] = useState(() => editInitial(t, tz));
  const [name, setName] = useState(initial.name);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [closeDate, setCloseDate] = useState(initial.closeDate);
  const [closeTime, setCloseTime] = useState(initial.closeTime);
  const [checkin, setCheckin] = useState(initial.checkin);
  const [prize, setPrize] = useState(initial.prize);
  const [announcement, setAnnouncement] = useState(initial.announcement);
  const [format, setFormat] = useState<FormatValue>(initial.format);
  const requirements = !!idRequirement(t.game) || !!rankRequirement(t.game);
  const { lo, hi } = editRange(t, format.format, approved);
  const values = { name, date, time, closeDate, closeTime, checkin, prize, announcement, format };
  const errors = editTournamentErrors(t, values, { tz, approved, formatEditable });

  const save = () =>
    busy.run('guardar', async () => {
      if (errors.length) return;
      const patch = editTournamentPatch(t, values, { tz, formatEditable });
      if (!Object.keys(patch).length) return onDone();
      try {
        await updateTournament(t.eventId, patch);
        toast('Torneo guardado');
        onDone();
      } catch (e) {
        toast(esportsErrorText(e, t.game, 'torneo'), 'error');
      }
    });

  return (
    <div className="mm-create flex flex-col gap-4 pb-1">
      <CreateStyles />
      <Field label="Nombre">
        <Input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className="h-11" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Día del inicio">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11" />
        </Field>
        <Field label="Hora">
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-11" />
        </Field>
        <Field label="Cierra la inscripción">
          <Input type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} className="h-11" />
        </Field>
        <Field label="Hora">
          <Input type="time" value={closeTime} onChange={(e) => setCloseTime(e.target.value)} className="h-11" />
        </Field>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted">Check-in</span>
        <ChoiceChips label="Check-in" items={CHECKIN_OPTIONS.map((o) => ({ key: String(o.value), label: o.label }))} value={String(checkin)} onChange={(k) => setCheckin(Number(k))} />
      </div>
      <div className="flex min-h-12 items-center gap-3">
        <span className="min-w-0 flex-1 text-[15px] font-semibold">{`Cupo (${lo} a ${hi})`}</span>
        <ScoreStepper value={format.maxEntries} min={lo} max={hi} label="Cupo" onChange={(n) => setFormat((f) => ({ ...f, maxEntries: n ?? lo }))} />
      </div>
      <Field label="Premio (opcional)">
        <Input value={prize} maxLength={120} onChange={(e) => setPrize(e.target.value)} className="h-11" />
      </Field>
      <Field label="Reglas o aviso (opcional)">
        <Textarea className="min-h-24" maxLength={1000} value={announcement} onChange={(e) => setAnnouncement(e.target.value)} />
      </Field>
      {formatEditable ? (
        <>
          <FormatFields value={format} onChange={setFormat} pro={pro} />
          {requirements && (
            <div className="flex flex-col gap-2.5">
              <RequirementToggles game={t.game} settings={format.settings} onChange={(p) => setFormat((f) => ({ ...f, settings: { ...f.settings, ...p } }))} />
            </div>
          )}
        </>
      ) : (
        <p className="rounded-2xl bg-surface-2 px-4 py-3.5 text-sm text-muted">{FORMAT_LOCKED_TEXT}</p>
      )}
      {errors.length > 0 && (
        <ul role="alert" className="flex flex-col gap-1 text-[13.5px] font-medium text-danger">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <Button variant="primary" size="lg" className="w-full" disabled={errors.length > 0} loading={busy.isBusy('guardar')} onClick={() => void save()}>
        Guardar
      </Button>
    </div>
  );
}
