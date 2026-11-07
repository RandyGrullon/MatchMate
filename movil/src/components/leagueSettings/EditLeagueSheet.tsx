import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Baby, Check, CircleHelp, Globe, Lock, Save } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { updateLeague } from '@mm/lib/data';
import { toIsoDate } from '@mm/lib/format';
import { useLeagueCtx } from '@mm/lib/league';
import { formatSchedule, formatTime, WEEKDAY_SHORT, WEEKDAYS } from '@mm/lib/schedule';
import { useNow } from '@mm/lib/useNow';
import { leagueSport, sportMeta } from '@mm/sports/registry';
import { TIME_OPTIONS } from '@mm/components/create/logic';
import { DEFAULT_TZ, minorsLocked, timezoneOptions, tzOffset, withMinors } from '@mm/components/league/logic';
import {
  MINORS_BLURB,
  MINORS_OFF_TEXT,
  MINORS_RULES,
  PRIVATE_CHOICE_TEXT,
  SEASON_ORDER_TEXT,
  TZ_HINT,
  leagueDataTitle,
  leagueFormData,
  leagueFormProblem,
  leagueInput,
  leagueNameLabel,
  leagueNamePlaceholder,
  minorsConfirm,
  minorsNote,
  minorsTitle,
  needsMinorsConfirm,
  publicChoiceText,
  requirePhotoText,
  scheduleDraft,
  scheduleHint,
  seasonToggle,
  toggleDay,
  whoCanSeeLabel,
} from '@mm/components/league/settings';
import type { LeagueInput } from '@mm/lib/data';
import { DateStepper } from '@/components/DateStepper';
import { ToggleRow } from '@/components/esports/inputs';
import { confirmAsync } from '@/components/feedback';
import { PickField } from '@/components/players/fields';
import { runAction } from '@/components/swimming/parts';
import { Button, ChoiceRow, ErrorNote, Field, Input, Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';

/**
 * Con la temporada a medias (solo una fecha guardada), la que falta arranca como al prender «Temporada con fechas»: en
 * el teléfono la fecha se elige con «‹ ›» y no puede quedar en blanco (en la web es un campo obligatorio vacío).
 */
function withBothDates(f: LeagueInput, today: string): LeagueInput {
  if (!(f.seasonStart || f.seasonEnd) || (f.seasonStart && f.seasonEnd)) return f;
  const start = f.seasonStart || today;
  return { ...f, seasonStart: start, seasonEnd: f.seasonEnd || `${start.slice(0, 4)}-12-31` };
}

/**
 * Editar los datos de la liga o del torneo (EditLeagueModal de la web, con el formulario LeagueForm y su misma lógica:
 * src/components/league/settings.ts): el deporte (no se cambia), el nombre, quién la ve, el lugar, cuándo juegan y la
 * temporada (no en un torneo suelto), el contacto, la foto del marcador (boliche), la zona horaria y «Liga con
 * menores». Se monta abierta: arranca de los datos de ese momento (si alguien más los cambia, no se pisa lo que estás
 * escribiendo). «Guardar» guarda; «Cancelar» cierra sin cambiar nada.
 */
export function EditLeagueSheet({ onClose }: { onClose: () => void }) {
  const c = useColors();
  const { lid, league } = useLeagueCtx();
  const { isSuper } = useAuth();
  const now = useNow();
  const sport = leagueSport(league);
  const meta = sportMeta(sport);
  const [initial] = useState(() => leagueInput(league));
  const [form, setForm] = useState<LeagueInput>(() => withBothDates(initial, toIsoDate(now)));
  const [hasSeason, setHasSeason] = useState(() => !!(initial.seasonStart || initial.seasonEnd));
  const [schedule, setSchedule] = useState(() => scheduleDraft(initial.schedule));
  const [saving, setSaving] = useState(false);
  const torneo = form.kind === 'torneo';
  const set = <K extends keyof LeagueInput>(k: K, v: LeagueInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const savedMinors = !!initial.hasMinors;
  const locked = minorsLocked(savedMinors, isSuper);
  const minors = !!form.hasMinors;
  const problem = leagueFormProblem(form, hasSeason);

  /** Días u hora nuevos: lo escrito a mano antes se reemplaza. */
  function updateSchedule(days: number[], time: string) {
    setSchedule({ days, time, legacy: '' });
    set('schedule', formatSchedule(days, time));
  }

  async function save() {
    if (saving || problem) return;
    // Encenderla en una liga que ya existe no tiene vuelta atrás para el admin: se confirma.
    if (needsMinorsConfirm(false, minors, initial.hasMinors) && !(await confirmAsync(minorsConfirm(torneo)))) return;
    const data = leagueFormData(form, { hasSeason, sportPhotos: meta?.photos });
    setSaving(true);
    const ok = await runAction(async () => {
      await updateLeague(lid, data);
      return true;
    }, 'Cambios guardados');
    setSaving(false);
    if (ok) onClose();
  }

  const times = [{ key: '', label: 'Sin hora' }, ...TIME_OPTIONS.map((t) => ({ key: t.value, label: t.label }))];
  if (schedule.time && !times.some((t) => t.key === schedule.time)) times.push({ key: schedule.time, label: formatTime(schedule.time) });
  const zones = timezoneOptions(form.tz).map((z) => {
    const off = tzOffset(z.id, now);
    return { key: z.id, label: off ? `${z.label} (${off})` : z.label };
  });
  const SportIcon = meta?.icon ?? CircleHelp;
  const note = minorsNote({ on: minors, locked, canTurnOff: savedMinors && isSuper });

  return (
    <Sheet
      open
      onClose={onClose}
      title={leagueDataTitle(league.kind)}
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button size="lg" onPress={onClose}>
            Cancelar
          </Button>
          <View style={{ flex: 1 }}>
            <Button variant="primary" size="lg" full loading={saving} disabled={!!problem} icon={<Save size={18} color={c.accentFg} />} onPress={() => void save()}>
              Guardar
            </Button>
          </View>
        </View>
      }
    >
      <View style={{ gap: 16, paddingBottom: 4 }}>
        {/* El deporte, fijo al editar. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1.5, borderColor: c.line, padding: 12 }}>
          <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accentSoft }}>
            <SportIcon size={20} color={c.accent} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt variant="small" tone="muted">
              Deporte
            </Txt>
            <Txt variant="bodyStrong" numberOfLines={1}>
              {meta?.label ?? 'Otro deporte'}
            </Txt>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Lock size={14} color={c.muted} />
            <Txt variant="small" tone="muted">
              No se cambia
            </Txt>
          </View>
        </View>

        <Field label={leagueNameLabel(torneo)}>
          <Input accessibilityLabel={leagueNameLabel(torneo)} maxLength={60} value={form.name} onChangeText={(v) => set('name', v)} placeholder={leagueNamePlaceholder(torneo)} invalid={problem === 'nombre'} />
        </Field>

        <View style={{ gap: 8 }}>
          <Txt variant="bodyStrong" tone="fg2">
            {whoCanSeeLabel(torneo)}
          </Txt>
          <ChoiceRow icon={<Lock size={20} color={c.fg2} />} title="Privada" subtitle={PRIVATE_CHOICE_TEXT} selected={form.visibility === 'private'} onPress={() => set('visibility', 'private')} />
          <ChoiceRow
            icon={<Globe size={20} color={c.fg2} />}
            title="Pública"
            subtitle={publicChoiceText(minors, torneo)}
            selected={form.visibility === 'public'}
            onPress={() => !minors && set('visibility', 'public')}
          />
        </View>

        <Field label={meta?.venue ?? 'Lugar'}>
          <Input accessibilityLabel={meta?.venue ?? 'Lugar'} maxLength={80} value={form.venue} onChangeText={(v) => set('venue', v)} placeholder={meta?.venueHint ?? 'Dónde juegan'} />
        </Field>

        {!torneo && (
          <>
            <View style={{ gap: 8 }}>
              <Txt variant="bodyStrong" tone="fg2">
                Cuándo juegan
              </Txt>
              <View accessibilityRole="none" accessibilityLabel="Días" style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                {WEEKDAY_SHORT.map((d, i) => {
                  const on = schedule.days.includes(i);
                  return (
                    <Pressable
                      key={d}
                      accessibilityRole="checkbox"
                      accessibilityLabel={WEEKDAYS[i]}
                      accessibilityState={{ checked: on }}
                      onPress={() => updateSchedule(toggleDay(schedule.days, i), schedule.time)}
                      style={{ width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.accent : c.surface, borderWidth: 1.5, borderColor: on ? c.accent : c.line }}
                    >
                      <Txt variant="bodyStrong" tone={on ? 'accentFg' : 'muted'}>
                        {d}
                      </Txt>
                    </Pressable>
                  );
                })}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <PickField label="Hora" options={times} value={schedule.time} onChange={(t) => updateSchedule(schedule.days, t)} />
                </View>
                {(schedule.days.length > 0 || !!schedule.time) && (
                  <Button variant="ghost" onPress={() => updateSchedule([], '')}>
                    Borrar
                  </Button>
                )}
              </View>
              <Txt variant="meta" tone="muted">
                {scheduleHint(schedule.legacy, schedule.days, schedule.time)}
              </Txt>
            </View>

            <ToggleRow
              checked={hasSeason}
              onChange={(on) => {
                setHasSeason(on);
                setForm((f) => seasonToggle(f, on, toIsoDate(now)));
              }}
              label="Temporada con fechas"
              hint="Opcional: cuándo empieza y termina la liga."
            />
            {hasSeason && (
              <>
                <Field label="Temporada desde">
                  <DateStepper value={form.seasonStart} onChange={(v) => set('seasonStart', v)} />
                </Field>
                <Field label="Hasta">
                  <DateStepper value={form.seasonEnd} min={form.seasonStart || undefined} onChange={(v) => set('seasonEnd', v)} />
                </Field>
                {problem === 'orden' && <ErrorNote>{SEASON_ORDER_TEXT}</ErrorNote>}
              </>
            )}
          </>
        )}

        <Field label="Contacto para torneos">
          <Input accessibilityLabel="Contacto para torneos" maxLength={60} autoComplete="name" value={form.contactName} onChangeText={(v) => set('contactName', v)} placeholder="Nombre" />
        </Field>
        <Field label="WhatsApp">
          <Input accessibilityLabel="WhatsApp" keyboardType="phone-pad" maxLength={20} value={form.contactPhone} onChangeText={(v) => set('contactPhone', v)} placeholder="809 555 0000" />
        </Field>

        {meta?.photos !== false && !minors && (
          <ToggleRow checked={form.requirePhoto} onChange={(v) => set('requirePhoto', v)} label="Exigir foto del marcador" hint={requirePhotoText(form.requirePhoto)} />
        )}

        <Field label="Zona horaria" hint={TZ_HINT}>
          <PickField label="Zona horaria" options={zones} value={form.tz || DEFAULT_TZ} onChange={(v) => set('tz', v)} />
        </Field>

        {/* «Liga con menores», con lo que cambia explicado antes de activarla. */}
        <View style={{ gap: 10, borderRadius: 16, borderWidth: 1.5, borderColor: minors ? c.accent : c.line, backgroundColor: minors ? c.accentSoft : 'transparent', padding: 12 }}>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: minors, disabled: locked }}
            disabled={locked}
            onPress={() => setForm((f) => withMinors({ ...f, hasMinors: !minors }))}
            style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, opacity: locked ? 0.7 : 1 }}
          >
            <View style={{ width: 24, height: 24, marginTop: 2, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: minors ? c.accent : c.surface, borderWidth: minors ? 0 : 1.5, borderColor: c.faint }}>
              {minors && <Check size={16} color={c.accentFg} strokeWidth={3} />}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Baby size={16} color={c.accent} />
                <Txt variant="bodyStrong">{minorsTitle(torneo)}</Txt>
              </View>
              <Txt variant="meta" tone="muted">
                {MINORS_BLURB}
              </Txt>
            </View>
          </Pressable>
          <View style={{ marginLeft: 36, gap: 4 }}>
            {minors ? (
              MINORS_RULES.map((r) => (
                <Txt key={r} variant="small" tone="muted">
                  • {r}
                </Txt>
              ))
            ) : (
              <Txt variant="small" tone="muted">
                {MINORS_OFF_TEXT}
              </Txt>
            )}
            {!!note && (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 6 }}>
                {locked && <Lock size={13} color={c.fg} style={{ marginTop: 2 }} />}
                <Txt variant="small" style={{ flex: 1 }}>
                  {note}
                </Txt>
              </View>
            )}
          </View>
        </View>
      </View>
    </Sheet>
  );
}
