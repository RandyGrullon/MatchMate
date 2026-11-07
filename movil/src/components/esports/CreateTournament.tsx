/**
 * «Crear torneo» de esports (`/esports/<juego>/nuevo-torneo`, CreateTournamentPage + create/steps.tsx de la web, con
 * su misma lógica: src/pages/esports/create/logic.ts): a pantalla completa, con la barra de pasos y un solo botón abajo.
 * Juego y modo · Inscripción · Formato · Nombre y fecha · Invitar (el QR, el link y, si es privado, el código).
 * `?liga=<liga>` lo crea dentro de esa liga de esports. Sin cuenta, la tarjeta para entrar. En Lite, lo que casi no se
 * toca va en «Más opciones» (y los ajustes del formato, en «Ajustes del formato»); en Pro, a la vista, como en la web.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, View } from 'react-native';
import { Redirect, router, useLocalSearchParams, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { ArrowRight, Copy, MapPin, Share2, Trophy, X } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { getInviteCode } from '@mm/lib/data';
import { createEsportsTournament, esportsErrorText } from '@mm/lib/data/esports';
import { shareOrigin } from '@mm/lib/origin';
import { useIsPro } from '@mm/lib/useMode';
import { useNow } from '@mm/lib/useNow';
import { sportMeta } from '@mm/sports/registry';
import { ENTRY_LABEL, GAMES, entryTypesFor, isGameId, isIndividualMode, maxEntries, minEntries, modeLabel, type EntryType, type GameId, type Mode, type TournamentSettings } from '@mm/sports/esports';
import { codeInviteUrl, inviteShareText } from '@mm/components/invite/logic';
import { DEFAULT_TZ, todayIn } from '@mm/pages/sports/racket/logic/time';
import {
  CHECKIN_OPTIONS,
  CREATE_STEP,
  ENTRY_BLURB,
  LEAVE_ASK,
  STEPS,
  checkinHint,
  clampMax,
  createdPath,
  emptyForm,
  showStepErrors,
  singleEntryText,
  stepErrors,
  subsMaxOf,
  summary,
  tournamentInput,
  visibilityHint,
  withMode,
  wizardButton,
  type StepKey,
  type TournamentForm,
} from '@mm/pages/esports/create/logic';
import { DateStepper } from '../DateStepper';
import { QrCode } from '../invite/QrCode';
import { LogoSpinner } from '../Logo';
import { confirmAsync, toast } from '../feedback';
import { Button, Field, Input, Segmented, Txt } from '../ui';
import { GameMark } from './bits';
import { SignInCard } from './EsportsIndex';
import { ChoiceCard, FormatFields, Legend, MoreOptions, NumberRow, RequirementToggles, SoftNote, TimeStepper } from './fields';
import { ChoiceChips, ScoreStepper, ToggleRow } from './inputs';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

type SetField = <K extends keyof TournamentForm>(k: K, v: TournamentForm[K]) => void;

export function CreateTournament({ game }: { game: string }) {
  const c = useColors();
  const { user, loading } = useAuth();
  if (!isGameId(game)) return <Redirect href={'/esports' as Href} />;
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
        <LogoSpinner size={36} label="Cargando" />
      </View>
    );
  }
  if (!user) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg, padding: 16, paddingTop: 24 }}>
        <SignInCard icon={<Trophy size={28} color={c.accent} />} title={`Crea un torneo de ${GAMES[game].name}`} text="Con tu cuenta armas el cuadro, apruebas inscripciones y anotas resultados." />
      </SafeAreaView>
    );
  }
  return <Wizard game={game} />;
}

function Wizard({ game }: { game: GameId }) {
  const c = useColors();
  const params = useLocalSearchParams<{ liga?: string }>();
  const leagueId = params.liga || null;
  const pro = useIsPro();
  const now = useNow().getTime();
  const tz = DEFAULT_TZ;
  const [form, setForm] = useState<TournamentForm>(() => emptyForm(game, todayIn(tz, now)));
  const [index, setIndex] = useState(0);
  const [tried, setTried] = useState<Set<StepKey>>(() => new Set());
  const [created, setCreated] = useState<{ leagueId: string; eventId: string; inviteCode: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const step = STEPS[index].key;
  const errors = stepErrors(step, form, { tz, now });
  const set: SetField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const goTo = (to: string) => router.replace(to as Href);

  async function close() {
    if (busy) return;
    if (created) return goTo(createdPath(created, !!leagueId));
    if (form.name.trim() || index > 0) {
      if (!(await confirmAsync({ ...LEAVE_ASK }))) return;
    }
    if (router.canGoBack()) router.back();
    else goTo(leagueId ? `/l/${leagueId}` : `/esports/${game}`);
  }

  async function create() {
    setBusy(true);
    try {
      const out = await createEsportsTournament(tournamentInput(form, tz), leagueId ?? undefined);
      toast('Torneo creado');
      setCreated(out);
      setIndex(STEPS.length - 1);
    } catch (e) {
      toast(esportsErrorText(e, game, 'torneo'), 'error');
    } finally {
      setBusy(false);
    }
  }

  function next() {
    if (step === 'invitar') return created && goTo(createdPath(created, !!leagueId));
    setTried((s) => new Set(s).add(step));
    if (errors.length || busy) return;
    if (step === CREATE_STEP) return void create();
    setIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }

  const label = wizardButton(step);
  const showErrors = showStepErrors(step, errors, tried);
  const venueHint = sportMeta('esports')?.venueHint ?? 'Online, cibercafé o centro gamer';

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, height: 54 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={created ? 'Cerrar e ir al torneo' : 'Cerrar'}
            disabled={busy}
            onPress={close}
            style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface2, opacity: busy ? 0.5 : 1 }}
          >
            <X size={22} color={c.fg2} />
          </Pressable>
          <Txt accessibilityRole="header" numberOfLines={1} style={{ flex: 1, textAlign: 'center', fontSize: 17, fontFamily: font.semibold }}>
            Crear torneo
          </Txt>
          <Txt variant="meta" tone="muted" accessibilityLabel={`Paso ${index + 1} de ${STEPS.length}`} style={{ width: 60, textAlign: 'right', paddingRight: 6 }}>
            {`${index + 1} de ${STEPS.length}`}
          </Txt>
        </View>
        <StepBar index={index} />

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24, gap: 22 }}>
          {step === 'juego' && <GameStep form={form} onMode={(m) => setForm((f) => withMode(f, m))} />}
          {step === 'inscripcion' && <EntryStep form={form} set={set} pro={pro} />}
          {step === 'formato' && (
            <>
              <Question title="¿Cómo se juega?" sub="La plataforma, el formato y lo que cambia de cada fase." />
              <FormatFields value={form} onChange={(v) => setForm((f) => ({ ...f, ...v }))} pro={pro} />
              <View accessibilityLiveRegion="polite">
                <SoftNote>{summary(form)}</SoftNote>
              </View>
            </>
          )}
          {step === 'nombre' && <NameStep form={form} set={set} venueHint={venueHint} today={todayIn(tz, now)} />}
          {step === 'invitar' && created && <InviteStep lid={created.leagueId} name={form.name.trim()} inviteCode={created.inviteCode} />}
          {showErrors && (
            <View accessibilityRole="alert" style={{ gap: 4, borderRadius: 16, backgroundColor: c.dangerSoft, paddingHorizontal: 16, paddingVertical: 12 }}>
              {errors.map((e) => (
                <Txt key={e} tone="danger" style={{ fontSize: 14, fontFamily: font.medium }}>
                  {e}
                </Txt>
              ))}
            </View>
          )}
        </ScrollView>

        <View style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 12 }}>
          <Button
            variant="primary"
            size="xl"
            full
            loading={busy}
            disabled={showErrors && step !== 'invitar'}
            icon={step === 'invitar' || step === CREATE_STEP ? undefined : <ArrowRight size={20} color={c.accentFg} />}
            onPress={next}
          >
            {label}
          </Button>
          {index > 0 && step !== 'invitar' && (
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => setIndex((i) => Math.max(0, i - 1))} style={{ height: 44, alignItems: 'center', justifyContent: 'center', marginTop: 6, opacity: busy ? 0.5 : 1 }}>
              <Txt variant="meta" tone="accent" style={{ fontFamily: font.semibold }}>
                Atrás
              </Txt>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** La barra de pasos (StepBar de la web): una raya por paso, las hechas en acento, con su nombre debajo. */
function StepBar({ index }: { index: number }) {
  const c = useColors();
  return (
    <View accessibilityLabel={`Paso ${index + 1}: ${STEPS[index].label}`} style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 24, paddingBottom: 8 }}>
      {STEPS.map((s, i) => (
        <View key={s.key} style={{ flex: 1, gap: 6 }}>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: i <= index ? c.accent : c.surface2 }} />
          <Txt numberOfLines={1} style={{ fontSize: 11.5, fontFamily: i === index ? font.semibold : font.medium, color: i === index ? c.fg : c.muted }}>
            {s.label}
          </Txt>
        </View>
      ))}
    </View>
  );
}

/** La pregunta del paso y una línea debajo. */
function Question({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={{ gap: 6, marginTop: 6 }}>
      <Txt variant="title" accessibilityRole="header" style={{ fontSize: 30, lineHeight: 36 }}>
        {title}
      </Txt>
      {!!sub && (
        <Txt tone="muted" style={{ fontSize: 15.5 }}>
          {sub}
        </Txt>
      )}
    </View>
  );
}

// ---------- Paso 1: Juego y modo ----------

function GameStep({ form, onMode }: { form: TournamentForm; onMode: (m: Mode) => void }) {
  const c = useColors();
  const meta = GAMES[form.game];
  const modes = meta.modes;
  const items = modes.map((m) => ({ key: m, label: modeLabel(m) }));
  return (
    <>
      <Question title="¿De qué juego?" sub="El juego decide las reglas: cómo se anota y cuántos juegan." />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 16, padding: 16, backgroundColor: c.surface2 }}>
        <GameMark game={form.game} size="lg" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="bodyStrong" numberOfLines={1}>
            {meta.name}
          </Txt>
          <Txt variant="meta" tone="muted">
            {meta.blurb}
          </Txt>
        </View>
        <Pressable accessibilityRole="link" onPress={() => router.replace('/esports?crear=torneo' as Href)} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 }}>
          <Txt variant="meta" tone="accent" style={{ fontFamily: font.semibold }}>
            Cambiar
          </Txt>
        </Pressable>
      </View>
      {modes.length > 1 && (
        <View style={{ gap: 8 }}>
          <Legend>Modo</Legend>
          {modes.length <= 3 ? <Segmented<Mode> label="Modo" options={items} value={form.mode} onChange={onMode} /> : <ChoiceChips<Mode> label="Modo" items={items} value={form.mode} onChange={onMode} />}
        </View>
      )}
    </>
  );
}

// ---------- Paso 2: Inscripción ----------

function EntryStep({ form, set, pro }: { form: TournamentForm; set: SetField; pro: boolean }) {
  const c = useColors();
  const types = entryTypesFor(form.game, form.mode);
  const lo = minEntries(form.format);
  const hi = maxEntries(form.game, form.mode, form.format);
  const subsMax = subsMaxOf(form.game, form.mode);
  const s = form.settings;
  const setS = (patch: Partial<TournamentSettings>) => set('settings', { ...s, ...patch });
  return (
    <>
      <Question title="¿Quién se inscribe?" sub="Cuántos entran y hasta cuándo." />
      <View accessibilityRole="radiogroup" accessibilityLabel="Entrada" style={{ gap: 10 }}>
        <Legend>Entrada</Legend>
        {types.length === 1 ? (
          <SoftNote>
            <Txt tone="accent" style={{ fontSize: 15, fontFamily: font.semibold }}>
              {ENTRY_LABEL[types[0]]}
            </Txt>
            {singleEntryText(form.mode, types[0])}
          </SoftNote>
        ) : (
          types.map((e: EntryType) => <ChoiceCard key={e} on={form.entryType === e} title={ENTRY_LABEL[e]} text={ENTRY_BLURB[e]} onPress={() => set('entryType', e)} />)
        )}
      </View>
      <View style={{ gap: 8 }}>
        <Legend>{`Cupo (${lo} a ${hi})`}</Legend>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 56, borderRadius: 16, paddingHorizontal: 16, backgroundColor: c.surface2 }}>
          <Txt tone="muted">{isIndividualMode(form.mode) ? 'Jugadores' : 'Equipos'}</Txt>
          <ScoreStepper value={form.maxEntries} min={lo} max={hi} label="Cupo" onChange={(n) => set('maxEntries', clampMax(n ?? lo, form.game, form.mode, form.format))} />
        </View>
      </View>
      <View style={{ gap: 8 }}>
        <Legend>Cierra la inscripción</Legend>
        <ToggleRow checked={form.closeAtStart} onChange={(v) => set('closeAtStart', v)} label="Cuando empieza el torneo" hint="Si no, elige el día y la hora." />
        {!form.closeAtStart && (
          <>
            <DateStepper value={form.closeDate} onChange={(v) => set('closeDate', v)} />
            <TimeStepper value={form.closeTime} onChange={(v) => set('closeTime', v)} label="Hora que cierra" />
          </>
        )}
      </View>
      <MoreOptions pro={pro}>
        <View style={{ gap: 8 }}>
          <Legend>Check-in</Legend>
          <ChoiceChips label="Check-in" items={CHECKIN_OPTIONS.map((o) => ({ key: String(o.value), label: o.label }))} value={String(form.checkin)} onChange={(k) => set('checkin', Number(k))} />
          {form.checkin > 0 && (
            <Txt tone="muted" style={{ fontSize: 13.5, marginHorizontal: 4 }}>
              {checkinHint(form.checkin)}
            </Txt>
          )}
        </View>
        <ToggleRow checked={s.autoApprove} onChange={(v) => setS({ autoApprove: v })} label="Aprobar solo" hint="Quien cumple queda inscrito sin que lo revises." />
        <RequirementToggles game={form.game} settings={s} onChange={setS} />
        {subsMax > 0 && <NumberRow label="Suplentes" hint={`Hasta ${subsMax} por equipo`} value={s.subs} min={0} max={subsMax} onChange={(n) => setS({ subs: n })} />}
      </MoreOptions>
    </>
  );
}

// ---------- Paso 4: Nombre y fecha ----------

function NameStep({ form, set, venueHint, today }: { form: TournamentForm; set: SetField; venueHint: string; today: string }) {
  const c = useColors();
  const icon = (node: ReactNode) => <View style={{ position: 'absolute', left: 16, top: 18 }}>{node}</View>;
  return (
    <>
      <Question title="¿Cómo se llama?" sub="El nombre, el día y la hora del inicio." />
      <Field label="Nombre">
        <View>
          {icon(<Trophy size={20} color={c.muted} />)}
          <Input accessibilityLabel="Nombre" maxLength={60} autoComplete="off" placeholder={`Copa de ${GAMES[form.game].name}`} value={form.name} onChangeText={(v) => set('name', v)} style={{ paddingLeft: 46 }} />
        </View>
      </Field>
      <View style={{ gap: 8 }}>
        <Legend>Empieza</Legend>
        <DateStepper value={form.date} min={today} onChange={(v) => set('date', v)} />
        <TimeStepper value={form.time} onChange={(v) => set('time', v)} label="Hora del inicio" />
      </View>
      <View style={{ gap: 8 }}>
        <Legend>¿Quién lo ve?</Legend>
        <Segmented<TournamentForm['visibility']>
          label="Quién lo ve"
          options={[
            { key: 'public', label: 'Público' },
            { key: 'private', label: 'Privado' },
          ]}
          value={form.visibility}
          onChange={(k) => set('visibility', k)}
        />
        <Txt tone="muted" style={{ fontSize: 13.5, marginHorizontal: 4 }}>
          {visibilityHint(form.visibility)}
        </Txt>
      </View>
      <Field label="Sede (opcional)">
        <View>
          {icon(<MapPin size={20} color={c.muted} />)}
          <Input accessibilityLabel="Sede (opcional)" maxLength={80} placeholder={venueHint} value={form.venue} onChangeText={(v) => set('venue', v)} style={{ paddingLeft: 46 }} />
        </View>
      </Field>
      <Field label="Premio (opcional)">
        <Input accessibilityLabel="Premio (opcional)" maxLength={120} placeholder="RD$5,000 al campeón" value={form.prize} onChangeText={(v) => set('prize', v)} />
      </Field>
      <Field label="Reglas o aviso (opcional)">
        <Input
          accessibilityLabel="Reglas o aviso (opcional)"
          multiline
          maxLength={1000}
          placeholder="Llegar 15 min antes, capturas de cada mapa…"
          value={form.announcement}
          onChangeText={(v) => set('announcement', v)}
          style={{ height: 112, paddingTop: 14, textAlignVertical: 'top' }}
        />
      </Field>
    </>
  );
}

// ---------- Paso 5: Invitar ----------

function InviteStep({ lid, name, inviteCode }: { lid: string; name: string; inviteCode: string | null }) {
  const c = useColors();
  const priv = inviteCode !== null;
  // undefined: buscando (privado sin el código a mano); null: no se pudo.
  const [fetched, setFetched] = useState<string | null | undefined>(undefined);
  const code = inviteCode ?? fetched;
  useEffect(() => {
    if (!priv || inviteCode) return;
    let alive = true;
    getInviteCode(lid)
      .then((v) => alive && setFetched(v))
      .catch(() => alive && setFetched(null));
    return () => {
      alive = false;
    };
  }, [lid, priv, inviteCode]);
  const origin = shareOrigin(null);
  const url = priv ? (code ? codeInviteUrl(origin, code) : null) : `${origin}/l/${lid}`;

  async function share(link: string) {
    try {
      await Share.share({ message: `${inviteShareText(name)}\n${link}`, url: link });
    } catch {
      toast('No se pudo compartir.', 'error');
    }
  }

  return (
    <>
      <Question title="¡Listo! Invita a los jugadores" sub={priv ? 'Es privado: entran con el código o el QR.' : 'Mándales el link: se inscriben desde ahí.'} />
      {priv && code === undefined ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <LogoSpinner size={36} label="Preparando la invitación" />
        </View>
      ) : url ? (
        <View style={{ gap: 12 }}>
          <View style={{ alignItems: 'center', borderRadius: 24, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, backgroundColor: c.surface2 }}>
            <View style={{ borderRadius: 16, backgroundColor: '#ffffff', padding: 8 }}>
              <QrCode value={url} />
            </View>
            {priv && code ? (
              <>
                <Txt variant="meta" tone="muted" style={{ marginTop: 16 }}>
                  Código
                </Txt>
                <Txt selectable style={{ fontSize: 28, lineHeight: 32, fontFamily: font.bold, letterSpacing: 3 }}>
                  {code}
                </Txt>
              </>
            ) : (
              <Txt variant="meta" tone="muted" numberOfLines={1} style={{ marginTop: 16 }}>
                {url.replace(/^https?:\/\//, '')}
              </Txt>
            )}
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button variant="soft" size="lg" full icon={<Share2 size={18} color={c.accent} />} onPress={() => share(url)}>
                Compartir link
              </Button>
            </View>
            {priv && !!code && (
              <View style={{ flex: 1 }}>
                <Button
                  size="lg"
                  full
                  icon={<Copy size={18} color={c.fg} />}
                  onPress={async () => {
                    await Clipboard.setStringAsync(code);
                    toast('Código copiado');
                  }}
                >
                  Copiar código
                </Button>
              </View>
            )}
          </View>
        </View>
      ) : (
        <View style={{ borderRadius: 16, backgroundColor: c.surface2, paddingHorizontal: 16, paddingVertical: 14 }}>
          <Txt variant="meta" tone="muted">
            El código se ve en el torneo, en «Invitar».
          </Txt>
        </View>
      )}
    </>
  );
}
