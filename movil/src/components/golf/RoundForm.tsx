import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ChevronDown, Plus, Trash2 } from 'lucide-react-native';
import type { Nine } from '@mm/sports/golf/course';
import type { GolfCompetition } from '@mm/sports/golf/scoring';
import { createGolfRound, createGolfTournament, updateGolfRound, useGolfCourses, useGolfRules, type GolfRoundFull } from '@mm/lib/data/golf';
import { toIsoDate } from '@mm/lib/format';
import { useLeagueCtx } from '@mm/lib/league';
import { useNow } from '@mm/lib/useNow';
import { TIME_OPTIONS } from '@mm/components/create/logic';
import { COMPETITION_TEMPLATES } from '@mm/pages/sports/golf/logic';
import {
  MAX_TOURNAMENT_ROUNDS,
  addDate,
  allowanceOf,
  courseOption,
  nineOptions,
  pickTemplate,
  roundFormValid,
  roundPatch,
  submitLabel,
  templateOf,
  type RoundKind,
} from '@mm/pages/sports/golf/roundSetup';
import { DateStepper } from '@/components/DateStepper';
import { ToggleRow } from '@/components/esports/inputs';
import { Button, ChoiceRow, Field, Input, Segmented, Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { SHEET_CLOSE_MS, TextLink, golfAction, openCourses, openRound } from './parts';

/** Formato de la competencia (CompetitionPicker de la web): las plantillas y el % del handicap. */
export function CompetitionPicker({ value, onChange }: { value: GolfCompetition; onChange: (c: GolfCompetition) => void }) {
  const c = useColors();
  const current = templateOf(value);
  return (
    <View style={{ gap: 12 }}>
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {COMPETITION_TEMPLATES.map((t) => {
          const active = current?.key === t.key;
          return (
            <Pressable
              key={t.key}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${t.label}. ${t.hint}`}
              onPress={() => onChange(pickTemplate(t, value))}
              style={({ pressed }) => [
                styles.template,
                { backgroundColor: active ? c.accentSoft : c.surface2, borderColor: active ? c.accent : 'transparent', transform: [{ scale: pressed ? 0.98 : 1 }] },
              ]}
            >
              <Txt variant="bodyStrong" tone={active ? 'accent' : 'fg'} style={{ fontSize: 14 }}>
                {t.label}
              </Txt>
              <Txt tone="muted" style={{ fontSize: 12 }}>
                {t.hint}
              </Txt>
            </Pressable>
          );
        })}
      </View>
      {value.basis === 'net' && (
        <Field label="% del handicap" hint="95 % es lo normal en stroke play individual y Stableford.">
          <Input keyboardType="number-pad" value={String(value.allowance ?? 95)} onChangeText={(t) => onChange({ ...value, allowance: allowanceOf(t) })} />
        </Field>
      )}
    </View>
  );
}

/** Cambiar una ronda: su evento, lo que tiene (null = todavía sin campo) y si ya se anotó algo. */
export interface RoundEdit {
  eventId: string;
  round: GolfRoundFull | null;
  started: boolean;
}

/**
 * «Nueva ronda» (crear una ronda o un torneo de varias rondas, el admin) o «Ronda: campo y formato» (`edit`), como
 * RoundForm de la web con su misma lógica (roundSetup.ts). El campo y los hoyos solo cambian mientras nadie anotó nada.
 * Se monta abierta: cada vez empieza con lo de la ronda (o vacía).
 */
export function RoundForm({ open, onClose, edit }: { open: boolean; onClose: () => void; edit?: RoundEdit }) {
  if (!open) return null;
  return <RoundFormOpen onClose={onClose} edit={edit} />;
}

function RoundFormOpen({ onClose, edit }: { onClose: () => void; edit?: RoundEdit }) {
  const c = useColors();
  const { lid, isAdmin } = useLeagueCtx();
  const courses = useGolfCourses(lid);
  const rules = useGolfRules(lid);
  const today = toIsoDate(useNow());
  const r = edit?.round ?? null;
  const [kind, setKind] = useState<RoundKind>('ronda');
  const [name, setName] = useState('');
  const [date, setDate] = useState(today);
  const [dates, setDates] = useState<string[]>([today]);
  const [time, setTime] = useState('');
  const [timeOpen, setTimeOpen] = useState(false);
  const [pickedCourse, setCourseId] = useState<string | null>(null);
  const [nine, setNine] = useState<Nine>(r?.nine ?? 'all');
  // El formato de la ronda (o el de la liga, hasta que se elija otro).
  const [pickedComp, setComp] = useState<GolfCompetition | null>(r?.competition ?? null);
  const [shotgun, setShotgun] = useState(r?.shotgun ?? false);
  const [busy, setBusy] = useState(false);

  const courseId = pickedCourse ?? r?.courseId ?? courses.data[0]?.id ?? '';
  const comp = pickedComp ?? rules.data.competition;
  const course = courses.data.find((x) => x.id === courseId);
  const eighteen = (course?.holes.length ?? 18) === 18;
  const lockCourse = !!edit?.started;
  const valid = roundFormValid({ kind, name, date, dates, courseId }, !!edit);
  const nines = nineOptions(eighteen);
  const timeLabel = TIME_OPTIONS.find((t) => t.value === time)?.label ?? 'Sin hora';

  // Organizar › Campos, cerrando la hoja.
  const goCourses = () => {
    onClose();
    setTimeout(() => openCourses(lid), SHEET_CLOSE_MS);
  };

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    try {
      if (edit) {
        const patch = roundPatch(edit.round, { courseId, nine, comp, shotgun, eighteen }, lockCourse);
        const ok = await golfAction(async () => {
          await updateGolfRound(lid, edit.eventId, patch);
          return true;
        }, 'Ronda guardada');
        if (ok) onClose();
        return;
      }
      const common = { courseId, nine: eighteen ? nine : ('all' as Nine), competition: comp, shotgun };
      if (kind === 'ronda') {
        const id = await golfAction(() => createGolfRound(lid, { ...common, date, name, startTime: time || null }), 'Ronda creada');
        if (id) {
          onClose();
          setTimeout(() => openRound(lid, id), SHEET_CLOSE_MS);
        }
      } else {
        const res = await golfAction(() => createGolfTournament(lid, { ...common, name, dates: [...dates].sort() }), 'Torneo creado');
        if (res) {
          onClose();
          setTimeout(() => openRound(lid, res.eventIds[0]), SHEET_CLOSE_MS);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={edit ? 'Ronda: campo y formato' : 'Nueva ronda'}
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button onPress={onClose} style={{ flex: 1 }}>
            Cancelar
          </Button>
          <Button variant="primary" loading={busy} disabled={!valid} onPress={() => void submit()} style={{ flex: 1.6 }}>
            {submitLabel(!!edit, kind, dates.length)}
          </Button>
        </View>
      }
    >
      {!courses.loading && !courses.data.length && (
        <View style={[styles.warn, { backgroundColor: c.warnSoft }]}>
          <Txt tone="warn" style={{ fontSize: 14 }}>
            {'Primero agrega el campo del club en '}
            <TextLink onPress={goCourses}>Organizar › Campos</TextLink>.
          </Txt>
        </View>
      )}
      {!edit && (
        <Segmented<RoundKind>
          label="Qué se crea"
          options={[
            { key: 'ronda', label: 'Una ronda' },
            { key: 'torneo', label: 'Un torneo' },
          ]}
          value={kind}
          onChange={setKind}
        />
      )}
      {!edit && (
        <Field label={kind === 'ronda' ? 'Nombre (opcional)' : 'Nombre del torneo'}>
          <Input value={name} maxLength={60} onChangeText={setName} placeholder={kind === 'ronda' ? 'Mensual de octubre' : 'Copa del Club'} />
        </Field>
      )}
      {!edit && kind === 'ronda' && (
        <>
          <Field label="Fecha">
            <DateStepper value={date} onChange={setDate} />
          </Field>
          <Field label="Hora de salida (opcional)">
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: timeOpen }}
              accessibilityLabel={`Hora de salida: ${timeLabel}`}
              onPress={() => setTimeOpen((v) => !v)}
              style={[styles.select, { backgroundColor: c.surface2 }]}
            >
              <Txt variant="bodyStrong" style={{ flex: 1 }}>
                {timeLabel}
              </Txt>
              <ChevronDown size={18} color={c.muted} style={timeOpen ? { transform: [{ rotate: '180deg' }] } : undefined} />
            </Pressable>
            {timeOpen && (
              // La lista de horas ahí mismo (una hoja encima de otra no se ve bien en el teléfono).
              <ScrollView nestedScrollEnabled style={{ maxHeight: 240 }} contentContainerStyle={{ gap: 6 }}>
                {[{ value: '', label: 'Sin hora' }, ...TIME_OPTIONS].map((t) => (
                  <ChoiceRow
                    key={t.value || 'sin'}
                    title={t.label}
                    selected={time === t.value}
                    onPress={() => {
                      setTime(t.value);
                      setTimeOpen(false);
                    }}
                  />
                ))}
              </ScrollView>
            )}
          </Field>
        </>
      )}
      {!edit && kind === 'torneo' && (
        <Field label={`Fechas del torneo (una por ronda, hasta ${MAX_TOURNAMENT_ROUNDS})`}>
          <View style={{ gap: 8 }}>
            {dates.map((d, i) => (
              <View key={i} style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 }}>
                  <Txt tone="muted" style={{ fontSize: 14 }}>{`Ronda ${i + 1}`}</Txt>
                  {dates.length > 1 && (
                    <Button variant="ghost" accessibilityLabel="Quitar ronda" icon={<Trash2 size={18} color={c.muted} />} onPress={() => setDates(dates.filter((_, k) => k !== i))} />
                  )}
                </View>
                <DateStepper value={d} onChange={(v) => setDates(dates.map((x, k) => (k === i ? v : x)))} />
              </View>
            ))}
            {dates.length < MAX_TOURNAMENT_ROUNDS && (
              <Button icon={<Plus size={18} color={c.fg} />} onPress={() => setDates(addDate(dates, today))} style={{ alignSelf: 'flex-start' }}>
                Otra ronda
              </Button>
            )}
          </View>
        </Field>
      )}
      <Field label="Campo" hint={lockCourse ? 'Ya hay golpes anotados: el campo y los hoyos no cambian.' : null}>
        <View style={{ gap: 6, opacity: lockCourse ? 0.6 : 1 }}>
          {courses.data.map((x) => (
            <ChoiceRow key={x.id} title={courseOption(x)} selected={x.id === courseId} onPress={() => !lockCourse && setCourseId(x.id)} />
          ))}
        </View>
        {!lockCourse && isAdmin && courses.data.length > 0 && (
          <Pressable accessibilityRole="link" onPress={goCourses} hitSlop={6} style={{ alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center' }}>
            <Txt tone="accent" style={{ fontSize: 14, fontFamily: font.medium }}>
              Agregar o cambiar campos
            </Txt>
          </Pressable>
        )}
      </Field>
      {nines.length > 1 && (
        <Field label="Hoyos">
          <View style={{ opacity: lockCourse ? 0.6 : 1, pointerEvents: lockCourse ? 'none' : 'auto' }}>
            <Segmented<Nine> label="Hoyos de la ronda" options={nines} value={nine} onChange={setNine} />
          </View>
        </Field>
      )}
      <Field label="Formato">
        <CompetitionPicker value={comp} onChange={setComp} />
      </Field>
      <ToggleRow checked={shotgun} onChange={setShotgun} label="Salida simultánea (shotgun)" hint="Cada grupo sale por un hoyo distinto. El desempate usa los hoyos 10–18 igual." />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  template: { flexBasis: '46%', flexGrow: 1, minHeight: 56, borderRadius: 16, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 10, gap: 2 },
  warn: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  select: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 56, borderRadius: 16, paddingHorizontal: 16 },
});
