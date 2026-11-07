import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Switch, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Baby, Camera, ChevronDown, ChevronLeft, Globe, ImagePlus, Lock, X } from 'lucide-react-native';
import { displayName, useAuth } from '@mm/lib/auth';
import { createLeague, createTournament } from '@mm/lib/data';
import type { CompressedLogo } from '@mm/lib/image';
import { logoErrorText, uploadLeagueLogo } from '@mm/lib/logos';
import { useIsPro } from '@mm/lib/useMode';
import { toIsoDate } from '@mm/lib/format';
import { WEEKDAY_SHORT, WEEKDAYS } from '@mm/lib/schedule';
import { setActiveSport } from '@mm/lib/sportContext';
import type { LeagueKind } from '@mm/lib/types';
import { isSportId, sportMeta } from '@mm/sports/registry';
import { useSportStatus } from '@mm/sports/status';
import type { SportId } from '@mm/sports/types';
import {
  TIME_OPTIONS,
  canAdvance,
  createStep,
  defaultSeason,
  emptyForm,
  scheduleSummary,
  seasonRange,
  wizardInput,
  wizardSteps,
  type Frequency,
  type WizardForm,
} from '@mm/components/create/logic';
import { timezoneOptions, tzOffset } from '@mm/components/league/logic';
import { DateStepper } from '@/components/DateStepper';
import { InvitePanel } from '@/components/invite/InvitePanel';
import { confirmAsync, toast } from '@/components/feedback';
import { saveErrorMessage } from '@mm/lib/errorText';
import { Button, ChoiceRow, ErrorNote, Field, Input, Segmented, Sheet, Txt } from '@/components/ui';
import { pickLogo } from '@/components/leagueSettings/logoImage';
import { useColors } from '@/theme/theme';

const FREQUENCIES: { key: Frequency; label: string }[] = [
  { key: 'semana', label: 'Cada semana' },
  { key: 'libre', label: 'Sin día fijo' },
];


/**
 * Crear una liga o un torneo sin liga (el asistente de la web, src/components/create/CreateWizard.tsx, con su misma
 * lógica: create/logic.ts): Nombre · Día y lugar · Temporada · Invitar (el torneo, sin temporada). Al crear queda en
 * Invitar con el QR y el código. Los esports van a su asistente (`/esports?crear=`). En Lite, lo que casi no se toca
 * (contacto, zona horaria, liga con menores) va en «Más opciones»; en Pro, a la vista, y en el nombre va «Logo
 * (opcional)», que se sube después de crear.
 */
export default function CreateScreen() {
  const params = useLocalSearchParams<{ kind?: string; sport?: string }>();
  const kind: LeagueKind = params.kind === 'torneo' ? 'torneo' : 'liga';
  const torneo = kind === 'torneo';
  const c = useColors();
  const auth = useAuth();
  const sports = useSportStatus(auth.isSuper);
  const steps = wizardSteps(kind);
  const today = toIsoDate(new Date());
  const [index, setIndex] = useState(0);
  const [form, setForm] = useState<WizardForm>(() => emptyForm(kind, displayName(auth), today));
  const [picked, setPicked] = useState<SportId | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ lid: string } | null>(null);
  const [timeOpen, setTimeOpen] = useState(false);
  const [tzOpen, setTzOpen] = useState(false);
  const pro = useIsPro();
  // En Pro «Más opciones» empieza abierto (como la web).
  const [more, setMore] = useState(pro);
  const [logo, setLogo] = useState<CompressedLogo | null>(null);

  // El deporte: el que se tocó, el pedido (si lo puede crear), el boliche o el primero que pueda crear (sin esports).
  const others: SportId[] = sports.creatable.filter((s) => s !== 'esports');
  const wanted = params.sport && isSportId(params.sport) ? params.sport : null;
  const sport: SportId = picked ?? (wanted && others.includes(wanted) ? wanted : others.includes('bowling') ? 'bowling' : (others[0] ?? 'bowling'));
  const meta = sportMeta(sport);
  const step = steps[index].key;
  const set = <K extends keyof WizardForm>(k: K, v: WizardForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const tzs = useMemo(() => timezoneOptions(form.tz), [form.tz]);

  if (!auth.user) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg, padding: 16, gap: 16 }}>
        <Txt variant="title">{torneo ? 'Crear torneo' : 'Crear liga'}</Txt>
        <Txt tone="fg2">Entra a tu cuenta para crear {torneo ? 'un torneo' : 'una liga'}.</Txt>
        <Button variant="primary" size="xl" full onPress={() => router.replace('/login')}>
          Entrar
        </Button>
      </SafeAreaView>
    );
  }
  const owner = { uid: auth.user.uid, name: displayName(auth) };

  async function close() {
    if (busy) return;
    if (created) return router.replace({ pathname: '/l/[lid]', params: { lid: created.lid } });
    if (form.name.trim()) {
      const ok = await confirmAsync({ title: torneo ? '¿Salir sin crear el torneo?' : '¿Salir sin crear la liga?', message: 'Lo que llenaste se pierde.', confirmText: 'Salir' });
      if (!ok) return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/ligas');
  }

  async function create() {
    setBusy(true);
    try {
      const input = wizardInput(kind, sport, form);
      const lid = torneo ? (await createTournament(owner, input, form.date)).lid : await createLeague(owner, input);
      toast(torneo ? 'Torneo creado' : 'Liga creada');
      // El logo (Pro), después de crearla y si se puede: si falla, igual queda creada.
      if (logo) {
        try {
          await uploadLeagueLogo(lid, logo);
        } catch (e) {
          console.warn('[logo]', e);
          toast(
            torneo
              ? 'El torneo se creó, pero el logo no se pudo subir. Súbelo desde sus ajustes.'
              : 'La liga se creó, pero el logo no se pudo subir. Súbelo desde Organizar › Ajustes de la liga.',
            'error',
          );
        }
      }
      setActiveSport(sport);
      setCreated({ lid });
      setIndex(steps.length - 1);
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  function next() {
    if (step === 'invitar') return created && router.replace({ pathname: '/l/[lid]', params: { lid: created.lid } });
    if (!canAdvance(step, kind, form) || busy) return;
    if (step === createStep(kind)) return void create();
    setIndex((i) => Math.min(i + 1, steps.length - 1));
  }

  const label = step === 'invitar' ? (torneo ? 'Ir al torneo' : 'Ir a mi liga') : step === createStep(kind) ? (torneo ? 'Crear torneo' : 'Crear liga') : 'Siguiente';
  const photos = meta?.photos !== false;
  const summary = scheduleSummary(form.days, form.time, form.freq);
  const timeLabel = TIME_OPTIONS.find((t) => t.value === form.time)?.label ?? 'Sin hora';

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 }}>
        {index > 0 && !created ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Atrás" hitSlop={8} onPress={() => setIndex((i) => i - 1)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <ChevronLeft size={24} color={c.fg} />
          </Pressable>
        ) : (
          <View style={{ width: 44 }} />
        )}
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Txt variant="meta" tone="muted">
            Paso {index + 1} de {steps.length} · {steps[index].label}
          </Txt>
          <View style={{ flexDirection: 'row', gap: 4, marginTop: 6 }}>
            {steps.map((s, i) => (
              <View key={s.key} style={{ width: 28, height: 4, borderRadius: 2, backgroundColor: i <= index ? c.accent : c.surface2 }} />
            ))}
          </View>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={created ? `Cerrar e ir a ${torneo ? 'el torneo' : 'la liga'}` : 'Cerrar'} hitSlop={8} onPress={close} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <X size={24} color={c.fg} />
        </Pressable>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}>
        {step === 'nombre' && (
          <>
            <Question title={torneo ? '¿Cómo se llama el torneo?' : '¿Cómo se llama tu liga?'} sub={torneo ? 'Así lo van a ver los jugadores.' : 'Así la van a ver los jugadores.'} />
            <Input accessibilityLabel="Nombre" autoFocus maxLength={60} placeholder={torneo ? 'Copa de verano' : 'Liga de los martes'} value={form.name} onChangeText={(v) => set('name', v)} />
            <Txt variant="bodyStrong">Deporte</Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {sports.creatable.map((id) => {
                const m = sportMeta(id);
                const Icon = m?.icon;
                const on = id === sport;
                return (
                  <Pressable
                    key={id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    onPress={() => (id === 'esports' ? router.push(torneo ? '/esports?crear=torneo' : '/esports?crear=liga') : setPicked(id))}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, borderRadius: 22, paddingHorizontal: 14, borderWidth: 1.5, borderColor: on ? c.accent : c.line, backgroundColor: on ? c.accentSoft : c.surface }}
                  >
                    {Icon && <Icon size={18} color={on ? c.accent : (m?.color ?? c.fg)} />}
                    <Txt variant="bodyStrong" tone={on ? 'accent' : 'fg'}>
                      {m?.label ?? id}
                    </Txt>
                  </Pressable>
                );
              })}
            </View>
            <Txt variant="bodyStrong">{torneo ? '¿Quién lo puede ver?' : '¿Quién la puede ver?'}</Txt>
            <ChoiceRow icon={<Lock size={20} color={c.fg2} />} title="Privada" subtitle="Solo con invitación" selected={form.visibility === 'private'} onPress={() => set('visibility', 'private')} />
            <ChoiceRow
              icon={<Globe size={20} color={c.fg2} />}
              title="Pública"
              subtitle={form.hasMinors ? 'Con menores no se puede' : torneo ? 'Cualquiera lo ve y se une' : 'Cualquiera la ve y se une'}
              selected={form.visibility === 'public'}
              onPress={() => !form.hasMinors && set('visibility', 'public')}
            />
            {pro && <LogoField value={logo} onChange={setLogo} torneo={torneo} />}
          </>
        )}

        {step === 'lugar' && !torneo && (
          <>
            <Question title="¿Cuándo y dónde juegan?" sub="Lo puedes cambiar después." />
            <Segmented<Frequency> label="Cada cuánto" value={form.freq} onChange={(v) => set('freq', v)} options={FREQUENCIES} />
            {form.freq === 'semana' && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                {WEEKDAY_SHORT.map((d, i) => {
                  const on = form.days.includes(i);
                  return (
                    <Pressable
                      key={d}
                      accessibilityRole="checkbox"
                      accessibilityLabel={WEEKDAYS[i]}
                      accessibilityState={{ checked: on }}
                      onPress={() => set('days', on ? form.days.filter((x) => x !== i) : [...form.days, i].sort((a, b) => a - b))}
                      style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.accent : c.surface, borderWidth: 1.5, borderColor: on ? c.accent : c.line }}
                    >
                      <Txt variant="bodyStrong" tone={on ? 'accentFg' : 'fg'}>
                        {d}
                      </Txt>
                    </Pressable>
                  );
                })}
              </View>
            )}
            <Field label="Hora">
              <SelectButton label={timeLabel} onPress={() => setTimeOpen(true)} />
            </Field>
            <Txt tone="fg2">
              {summary.before}
              {!!summary.strong && <Txt variant="bodyStrong">{summary.strong}</Txt>}
              {summary.after ?? ''}
            </Txt>
            <Field label="Lugar">
              <Input accessibilityLabel="Lugar" maxLength={80} placeholder={meta?.venueHint ?? 'Dónde juegan'} value={form.venue} onChangeText={(v) => set('venue', v)} />
            </Field>
          </>
        )}

        {step === 'lugar' && torneo && (
          <>
            <Question title="¿Cuándo y dónde es?" sub="Lo puedes cambiar después." />
            <Field label="Fecha">
              <DateStepper value={form.date} min={today} onChange={(v) => set('date', v)} />
            </Field>
            <Field label="Lugar">
              <Input accessibilityLabel="Lugar" maxLength={80} placeholder={meta?.venueHint ?? 'Dónde juegan'} value={form.venue} onChangeText={(v) => set('venue', v)} />
            </Field>
          </>
        )}

        {step === 'temporada' && (
          <>
            <Question title="¿Tiene temporada?" sub="Es opcional. Lo puedes cambiar después." />
            <Segmented<'no' | 'si'>
              label="Temporada"
              value={form.hasSeason ? 'si' : 'no'}
              onChange={(v) => setForm((f) => (v === 'si' ? { ...f, hasSeason: true, ...(f.seasonStart ? {} : defaultSeason(today)) } : { ...f, hasSeason: false }))}
              options={[
                { key: 'no', label: 'Sin fechas' },
                { key: 'si', label: 'Con fechas' },
              ]}
            />
            {form.hasSeason ? (
              <>
                <Field label="Empieza">
                  <DateStepper value={form.seasonStart} onChange={(v) => set('seasonStart', v)} />
                </Field>
                <Field label="Termina">
                  <DateStepper value={form.seasonEnd} onChange={(v) => set('seasonEnd', v)} />
                </Field>
                {form.seasonEnd < form.seasonStart ? (
                  <ErrorNote>La fecha de fin va después de la de inicio.</ErrorNote>
                ) : (
                  <Txt tone="fg2">Temporada {seasonRange(form.seasonStart, form.seasonEnd)}.</Txt>
                )}
              </>
            ) : (
              <Txt tone="muted">Sin fechas por ahora: las pones cuando quieras en Organizar.</Txt>
            )}
            {photos && !form.hasMinors && (
              <ToggleRow
                icon={<Camera size={20} color={c.accent} />}
                title="Exigir foto del marcador"
                text={form.requirePhoto ? 'Un juego cuenta cuando se verifica con la foto.' : 'Los juegos cuentan sin foto; igual se aprueban.'}
                value={form.requirePhoto}
                onChange={(v) => set('requirePhoto', v)}
              />
            )}
            <Pressable accessibilityRole="button" onPress={() => setMore((m) => !m)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 }}>
              <Txt variant="bodyStrong" tone="accent">
                Más opciones
              </Txt>
              <ChevronDown size={18} color={c.accent} style={{ transform: [{ rotate: more ? '180deg' : '0deg' }] }} />
            </Pressable>
            {more && (
              <>
                <Field label="Contacto">
                  <Input accessibilityLabel="Contacto" maxLength={60} autoComplete="name" placeholder="Nombre" value={form.contactName} onChangeText={(v) => set('contactName', v)} />
                </Field>
                <Field label="WhatsApp" hint="Sale en los anuncios de los torneos, para escribirle.">
                  <Input accessibilityLabel="WhatsApp" keyboardType="phone-pad" maxLength={20} placeholder="809 555 0000" value={form.contactPhone} onChangeText={(v) => set('contactPhone', v)} />
                </Field>
                <Field label="Zona horaria">
                  <SelectButton label={tzs.find((z) => z.id === form.tz)?.label ?? form.tz} onPress={() => setTzOpen(true)} />
                </Field>
                <ToggleRow
                  icon={<Baby size={20} color={c.accent} />}
                  title="Liga con menores"
                  text={form.hasMinors ? 'Una vez creada, no la puedes apagar tú.' : 'Para clubes con niños y jóvenes.'}
                  value={form.hasMinors}
                  onChange={(v) => setForm((f) => (v ? { ...f, hasMinors: true, visibility: 'private', requirePhoto: false } : { ...f, hasMinors: false }))}
                />
              </>
            )}
          </>
        )}

        {step === 'invitar' && created && (
          <>
            <Question title={torneo ? '¡Listo! Invita a los jugadores' : '¡Lista! Invita a tus jugadores'} sub="Mándales el link o enséñales el QR: entran con un toque." />
            <InvitePanel lid={created.lid} name={form.name.trim()} />
          </>
        )}

      </ScrollView>

      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        <Button variant="primary" size="xl" full loading={busy} disabled={step !== 'invitar' && !canAdvance(step, kind, form)} onPress={next}>
          {label}
        </Button>
      </View>

      <Sheet open={timeOpen} onClose={() => setTimeOpen(false)} title="Hora">
        {[{ value: '', label: 'Sin hora' }, ...TIME_OPTIONS].map((t) => (
          <ChoiceRow
            key={t.value || 'sin'}
            title={t.label}
            selected={form.time === t.value}
            onPress={() => {
              set('time', t.value);
              setTimeOpen(false);
            }}
          />
        ))}
      </Sheet>
      <Sheet open={tzOpen} onClose={() => setTzOpen(false)} title="Zona horaria">
        {tzs.map((z) => {
          const off = tzOffset(z.id);
          return (
            <ChoiceRow
              key={z.id}
              title={off ? `${z.label} (${off})` : z.label}
              selected={form.tz === z.id}
              onPress={() => {
                set('tz', z.id);
                setTzOpen(false);
              }}
            />
          );
        })}
      </Sheet>
    </SafeAreaView>
  );
}

/**
 * «Logo (opcional)» (Pro, LogoField de la web): se elige de la galería, se recorta al cuadrado y se comprime aquí
 * (pickLogo, el de Ajustes de la liga); se sube después de crear.
 */
function LogoField({ value, onChange, torneo }: { value: CompressedLogo | null; onChange: (l: CompressedLogo | null) => void; torneo: boolean }) {
  const c = useColors();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function pick() {
    setError(null);
    setBusy(true);
    try {
      const l = await pickLogo('library');
      if (l) onChange(l);
    } catch (e) {
      setError(logoErrorText(e, torneo ? 'torneo' : 'liga'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Field label="Logo (opcional)">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1.5, borderColor: c.line, backgroundColor: c.surface }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: value ? c.accentSoft : c.surface2, alignItems: 'center', justifyContent: 'center' }}>
          <ImagePlus size={20} color={value ? c.accent : c.muted} />
        </View>
        <Txt variant="meta" tone="muted" style={{ flex: 1 }}>
          {value ? 'Listo: se sube al crear' : 'Cuadrado, se ve en la lista'}
        </Txt>
        {value && !busy && (
          <Txt variant="meta" tone="fg2" accessibilityRole="button" suppressHighlighting onPress={() => onChange(null)} style={{ fontWeight: '600', paddingVertical: 12, paddingHorizontal: 4 }}>
            Quitar
          </Txt>
        )}
        <Pressable accessibilityRole="button" accessibilityState={{ busy, disabled: busy }} disabled={busy} onPress={() => void pick()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 4, opacity: busy ? 0.6 : 1 }}>
          {busy && <ActivityIndicator size="small" color={c.accent} />}
          <Txt variant="meta" tone="accent" style={{ fontWeight: '600' }}>
            {busy ? 'Preparando…' : value ? 'Cambiar' : 'Elegir'}
          </Txt>
        </Pressable>
      </View>
      {!!error && (
        <Txt variant="meta" tone="danger" accessibilityRole="alert" style={{ marginHorizontal: 4 }}>
          {error}
        </Txt>
      )}
    </Field>
  );
}

function Question({ title, sub }: { title: string; sub: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Txt variant="title" accessibilityRole="header" style={{ fontSize: 28, lineHeight: 33 }}>
        {title}
      </Txt>
      <Txt tone="muted">{sub}</Txt>
    </View>
  );
}

function SelectButton({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 56, borderRadius: 16, paddingHorizontal: 16, borderWidth: 1.5, borderColor: c.line, backgroundColor: c.surface }}
    >
      <Txt variant="bodyStrong">{label}</Txt>
      <ChevronDown size={20} color={c.muted} />
    </Pressable>
  );
}

function ToggleRow({ icon, title, text, value, onChange }: { icon: ReactNode; title: string; text: string; value: boolean; onChange: (v: boolean) => void }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 14, backgroundColor: c.surface }}>
      {icon}
      <View style={{ flex: 1 }}>
        <Txt variant="bodyStrong">{title}</Txt>
        <Txt variant="meta" tone="muted">
          {text}
        </Txt>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: c.accent, false: c.surface2 }} thumbColor="#ffffff" accessibilityLabel={title} />
    </View>
  );
}

