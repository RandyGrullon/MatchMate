/**
 * «Editar torneo» (admin/EditTournamentSheet.tsx de la web, con su misma lógica: admin/logic.ts): nombre, inicio,
 * cierre de la inscripción, check-in, cupo (no menos que los aprobados), premio y reglas; y, solo en la inscripción y
 * sin fases, el formato con sus ajustes y lo que se pide (ID confirmado y rango verificado, si el juego lo comprueba).
 */
import { useState } from 'react';
import { View } from 'react-native';
import { esportsErrorText, updateTournament, type EsportsTournament } from '@mm/lib/data/esports';
import { useIsPro } from '@mm/lib/useMode';
import { CHECKIN_OPTIONS, idRequirement, rankRequirement, type FormatValue } from '@mm/pages/esports/create/logic';
import { FORMAT_LOCKED_TEXT, editInitial, editRange, editTournamentErrors, editTournamentPatch } from '@mm/pages/sports/esports/admin/logic';
import { toast } from '../feedback';
import { Button, Field, Input, Sheet, Txt } from '../ui';
import { DateTimeFields, FormatFields, GrayNote, Legend, RequirementToggles } from './fields';
import { ChoiceChips, ScoreStepper } from './inputs';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

export function EditTournamentSheet({ open, onClose, t, tz, approved, formatEditable }: { open: boolean; onClose: () => void; t: EsportsTournament; tz?: string; approved: number; formatEditable: boolean }) {
  return (
    <Sheet open={open} onClose={onClose} title="Editar torneo" subtitle={t.name}>
      {open && <Body t={t} tz={tz} approved={approved} formatEditable={formatEditable} onDone={onClose} />}
    </Sheet>
  );
}

function Body({ t, tz, approved, formatEditable, onDone }: { t: EsportsTournament; tz?: string; approved: number; formatEditable: boolean; onDone: () => void }) {
  const c = useColors();
  const pro = useIsPro();
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
  const [busy, setBusy] = useState(false);
  const requirements = !!idRequirement(t.game) || !!rankRequirement(t.game);
  const { lo, hi } = editRange(t, format.format, approved);
  const values = { name, date, time, closeDate, closeTime, checkin, prize, announcement, format };
  const errors = editTournamentErrors(t, values, { tz, approved, formatEditable });

  async function save() {
    if (errors.length) return;
    const patch = editTournamentPatch(t, values, { tz, formatEditable });
    if (!Object.keys(patch).length) return onDone();
    setBusy(true);
    try {
      await updateTournament(t.eventId, patch);
      toast('Torneo guardado');
      onDone();
    } catch (e) {
      toast(esportsErrorText(e, t.game, 'torneo'), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 16 }}>
      <Field label="Nombre">
        <Input accessibilityLabel="Nombre" maxLength={60} value={name} onChangeText={setName} />
      </Field>
      <DateTimeFields label="Día del inicio" date={date} time={time} onDate={setDate} onTime={setTime} />
      <DateTimeFields label="Cierra la inscripción" date={closeDate} time={closeTime} onDate={setCloseDate} onTime={setCloseTime} />
      <View style={{ gap: 8 }}>
        <Legend>Check-in</Legend>
        <ChoiceChips label="Check-in" items={CHECKIN_OPTIONS.map((o) => ({ key: String(o.value), label: o.label }))} value={String(checkin)} onChange={(k) => setCheckin(Number(k))} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }}>
        <Txt style={{ flex: 1, minWidth: 0, fontSize: 15, fontFamily: font.semibold }}>{`Cupo (${lo} a ${hi})`}</Txt>
        <ScoreStepper value={format.maxEntries} min={lo} max={hi} label="Cupo" onChange={(n) => setFormat((f) => ({ ...f, maxEntries: n ?? lo }))} />
      </View>
      <Field label="Premio (opcional)">
        <Input accessibilityLabel="Premio (opcional)" maxLength={120} value={prize} onChangeText={setPrize} />
      </Field>
      <Field label="Reglas o aviso (opcional)">
        <Input accessibilityLabel="Reglas o aviso (opcional)" multiline maxLength={1000} value={announcement} onChangeText={setAnnouncement} style={{ height: 104, paddingTop: 14, textAlignVertical: 'top' }} />
      </Field>
      {formatEditable ? (
        <>
          <FormatFields value={format} onChange={setFormat} pro={pro} />
          {requirements && <RequirementToggles game={t.game} settings={format.settings} onChange={(p) => setFormat((f) => ({ ...f, settings: { ...f.settings, ...p } }))} />}
        </>
      ) : (
        <GrayNote>{FORMAT_LOCKED_TEXT}</GrayNote>
      )}
      {errors.length > 0 && (
        <View accessibilityRole="alert" style={{ gap: 4 }}>
          {errors.map((e) => (
            <Txt key={e} style={{ fontSize: 13.5, fontFamily: font.medium, color: c.danger }}>
              {e}
            </Txt>
          ))}
        </View>
      )}
      <Button variant="primary" size="lg" full disabled={errors.length > 0} loading={busy} onPress={save}>
        Guardar
      </Button>
    </View>
  );
}
