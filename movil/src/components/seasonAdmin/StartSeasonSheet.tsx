import { useState } from 'react';
import { View } from 'react-native';
import { CalendarPlus } from 'lucide-react-native';
import { startSeason } from '@mm/lib/data/seasonAdmin';
import { useLeagueCtx } from '@mm/lib/league';
import type { Season } from '@mm/lib/seasons';
import { useNow } from '@mm/lib/useNow';
import { todayIn } from '@mm/pages/sports/racket/logic/time';
import { seasonErrorText } from '@mm/components/season/adminLogic';
import { newSeasonDefaults, newSeasonProblem, withStartDate, type NewSeasonInput } from '@mm/components/season/logic';
import { DateStepper } from '@/components/DateStepper';
import { ToggleRow } from '@/components/esports/inputs';
import { toast } from '@/components/feedback';
import { Button, Field, Input, Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { OptionalDayField } from './parts';

/**
 * Nueva temporada (StartSeasonModal de la web, con su misma lógica): nombre, cuándo empieza y termina (previsto) y, en
 * las ligas de equipos, copiar los equipos. Se monta al abrirse, con lo que se propone.
 */
export function StartSeasonSheet({ seasons, teamSport, onClose }: { seasons: readonly Season[]; teamSport: boolean; onClose: () => void }) {
  const c = useColors();
  const { lid, league } = useLeagueCtx();
  const now = useNow();
  const [form, setForm] = useState<NewSeasonInput>(() => newSeasonDefaults([...seasons], todayIn(league.tz, now.getTime()), teamSport));
  // Mientras el admin no cambie el nombre a mano, sigue al año de cuando empieza.
  const [nameTouched, setNameTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const problem = newSeasonProblem(form, [...seasons]);

  const save = async () => {
    if (problem || busy) return;
    setBusy(true);
    try {
      await startSeason(lid, { name: form.name, startsOn: form.startsOn, endsOn: form.endsOn || null, copyTeams: teamSport && form.copyTeams });
      toast(`Empezó ${form.name.trim()}`);
      onClose();
    } catch (e) {
      console.error(e);
      toast(seasonErrorText(e, 'Revisa las fechas: tiene que empezar después de la temporada anterior y no puede haber otra en curso.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Nueva temporada"
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button size="lg" onPress={onClose}>
            Cancelar
          </Button>
          <View style={{ flex: 1 }}>
            <Button variant="primary" size="lg" full loading={busy} disabled={!!problem} icon={<CalendarPlus size={18} color={c.accentFg} />} onPress={() => void save()}>
              Empezar temporada
            </Button>
          </View>
        </View>
      }
    >
      <View style={{ gap: 16, paddingBottom: 4 }}>
        <Field label="Nombre">
          <Input
            value={form.name}
            maxLength={60}
            accessibilityLabel="Nombre"
            returnKeyType="done"
            onSubmitEditing={() => void save()}
            onChangeText={(name) => {
              setNameTouched(true);
              setForm({ ...form, name });
            }}
          />
        </Field>
        <Field label="Empieza">
          <DateStepper value={form.startsOn} onChange={(v) => setForm(withStartDate(form, v, seasons, nameTouched))} />
        </Field>
        <Field label="Termina (opcional)" hint="La fecha prevista. La temporada termina cuando la cierras.">
          <OptionalDayField label="Termina (opcional)" value={form.endsOn} min={form.startsOn} start={form.startsOn} onChange={(endsOn) => setForm({ ...form, endsOn })} />
        </Field>
        {teamSport && (
          <ToggleRow
            checked={form.copyTeams}
            onChange={(copyTeams) => setForm({ ...form, copyTeams })}
            label="Copiar los equipos de la temporada anterior"
            hint="Con sus plantillas (dorsal, posición, capitán y delegado). Después puedes cambiarlos en Equipos."
          />
        )}
        {!!problem && (
          <Txt tone="warn" style={{ fontSize: 14 }}>
            {problem}
          </Txt>
        )}
      </View>
    </Sheet>
  );
}
