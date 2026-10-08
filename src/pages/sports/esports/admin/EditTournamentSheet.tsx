import { useState } from 'react';
import { esportsErrorText, updateTournament, type EsportsTournament } from '../../../../lib/data/esports';
import { maxEntries, minEntries, validateSettings } from '../../../../sports/esports';
import { useBusy } from '../../../../components/busy';
import { useFeedback } from '../../../../components/feedback';
import { useIsPro } from '../../../../components/mode';
import { CreateStyles } from '../../../../components/create/styles';
import { Button, Field, Input, Sheet, Textarea } from '../../../../components/ui';
import { CHECKIN_OPTIONS, idRequirement, rankRequirement, withRequirements } from '../../../esports/create/logic';
import { FormatFields, RequirementToggles, type FormatValue } from '../../../esports/create/steps';
import { localParts, zonedIso } from '../../racket/logic/time';
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
  const start = localParts(t.startsAt, tz) ?? { date: '', time: '' };
  const close = localParts(t.registrationClosesAt, tz) ?? start;
  const [name, setName] = useState(t.name);
  const [date, setDate] = useState(start.date);
  const [time, setTime] = useState(start.time);
  const [closeDate, setCloseDate] = useState(close.date);
  const [closeTime, setCloseTime] = useState(close.time);
  const [checkin, setCheckin] = useState(t.checkinMinutes ?? 0);
  const [prize, setPrize] = useState(t.prizeText);
  const [announcement, setAnnouncement] = useState(t.announcement);
  const [format, setFormat] = useState<FormatValue>({
    game: t.game,
    mode: t.mode,
    format: t.format,
    entryType: t.entryType,
    maxEntries: t.maxEntries,
    settings: withRequirements(t.game, t.settings),
  });
  const requirements = !!idRequirement(t.game) || !!rankRequirement(t.game);
  const lo = Math.max(minEntries(format.format), approved);
  const hi = maxEntries(t.game, t.mode, format.format);
  const startsAt = zonedIso(date, time, tz);
  const closesAt = zonedIso(closeDate, closeTime, tz);
  const errors: string[] = [];
  if (name.trim().length < 2) errors.push('Ponle un nombre al torneo.');
  if (!startsAt) errors.push('Pon el día y la hora del inicio.');
  if (startsAt && closesAt && Date.parse(closesAt) > Date.parse(startsAt)) errors.push('La inscripción tiene que cerrar antes del inicio.');
  if (format.maxEntries < lo || format.maxEntries > hi) errors.push(`El cupo va de ${lo} a ${hi}.`);
  if (formatEditable) errors.push(...validateSettings(t.game, t.mode, format.format, format.entryType, format.maxEntries, format.settings));

  const save = () =>
    busy.run('guardar', async () => {
      if (errors.length) return;
      const patch: Parameters<typeof updateTournament>[1] = {};
      if (name.trim() !== t.name) patch.name = name.trim();
      if (startsAt && startsAt !== new Date(t.startsAt).toISOString()) patch.startsAt = startsAt;
      if (closesAt && closesAt !== new Date(t.registrationClosesAt).toISOString()) patch.registrationClosesAt = closesAt;
      if ((t.checkinMinutes ?? 0) !== checkin) patch.checkinMinutes = checkin > 0 ? checkin : null;
      if (format.maxEntries !== t.maxEntries) patch.maxEntries = format.maxEntries;
      if (prize.trim() !== t.prizeText) patch.prizeText = prize;
      if (announcement.trim() !== t.announcement) patch.announcement = announcement;
      if (formatEditable) {
        if (format.format !== t.format) patch.format = format.format;
        if (JSON.stringify(format.settings) !== JSON.stringify(t.settings) || patch.format) patch.settings = format.settings;
      }
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
        <p className="rounded-2xl bg-surface-2 px-4 py-3.5 text-sm text-muted">El formato ya no se cambia: el torneo empezó.</p>
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
