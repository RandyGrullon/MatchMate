/**
 * «Nuevo» de raqueta (EventWizard.tsx de la web, con su misma lógica: create/wizard.ts): las plantillas del deporte
 * (Americano de la noche, Mexicano, Liga de parejas, Torneo por categorías, liga por cajas y escalera; «Repetir la última
 * noche») y en 1–2 pasos más la noche queda lista (jugadores, canchas, puntos y rondas) o la liga y el torneo listos para
 * armar su calendario. La noche y el torneo pueden abrir la inscripción «Me apunto». El round robin social del
 * pickleball, en la web. En la web es una hoja; aquí, su pantalla (`/l/<liga>/raqueta-nuevo`).
 */
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { ChevronLeft, ChevronRight, Copy, Users, type LucideIcon } from 'lucide-react-native';
import { createRacketEvent, useRacketEvents, type RacketEvent } from '@mm/lib/data/racket';
import { saveErrorMessage } from '@mm/lib/errorText';
import { useLeagueCtx } from '@mm/lib/league';
import { builtInTemplates, canRepeatNight, defaultName, wizardConfig, type WizardKind } from '@mm/pages/sports/racket/create/wizard';
import { extraTemplates } from '@mm/pages/sports/racket/extensions';
import { useLevels } from '@mm/pages/sports/racket/levels';
import { NIGHT_MAX_PLAYERS, isNightType, newNightConfig, parseNightConfig, suggestRounds, type NightConfig, type NightFormat } from '@mm/pages/sports/racket/logic/night';
import { signupCap, type SignupSettings } from '@mm/pages/sports/racket/logic/signup';
import { todayIn } from '@mm/pages/sports/racket/logic/time';
import { CATEGORY_IDS } from '@mm/pages/sports/racket/logic/tourney';
import { useNames } from '@mm/pages/sports/racket/names';
import { eventTypeInfo } from '@mm/pages/sports/racket/view';
import type { RacketSport } from '@mm/sports/racket';
import { DateStepper } from '../DateStepper';
import { TimeStepper } from '../esports/fields';
import { ToggleRow } from '../esports/inputs';
import { toast } from '../feedback';
import { Button, Card, Divider, Field, Input, ListRow, RowIcon, Txt } from '../ui';
import { BoxForm, LadderForm, NoEntrants } from './FormatForms';
import { NightFields, NightPlayers, SignupFields } from './NightForm';
import { Note, PickList, Stepper, useRacketPhone } from './parts';
import { openOnWeb } from '@/lib/web';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/** El ícono de una plantilla propia del deporte (el de su tipo; el round robin social, el de personas). */
const extraIcon = (k: string): LucideIcon => (k === 'social' ? Users : (eventTypeInfo(k).icon as unknown as LucideIcon));

/** La semilla de la noche (como la web: la hora en base 36). */
const nightSeed = () => `noche:${Date.now().toString(36)}`;

export function EventWizard() {
  const c = useColors();
  const { lid, league } = useLeagueCtx();
  const { doubles, side, ext, sport } = useRacketPhone();
  const names = useNames();
  const { levels } = useLevels();
  const events = useRacketEvents(lid);
  const lastNight = useMemo(() => events.data.find((e) => isNightType(e.type)) ?? null, [events.data]);
  const [custom, setCustom] = useState<'cajas' | 'escalera' | null>(null);
  const [kind, setKind] = useState<WizardKind | null>(null);
  const [step, setStep] = useState(0);
  const [date, setDate] = useState(() => todayIn(league.tz));
  const [time, setTime] = useState('19:00');
  const [name, setName] = useState('');
  const [night, setNight] = useState<NightConfig>(() => newNightConfig('americano', { players: [], courts: ['Cancha 1', 'Cancha 2'] }));
  const [pairs, setPairs] = useState<string[]>([]);
  const [double, setDouble] = useState(false);
  const [cats, setCats] = useState(1);
  const [signup, setSignup] = useState<SignupSettings | null>(null);
  const [busy, setBusy] = useState(false);

  const openEvent = (id: string) => router.replace({ pathname: '/l/[lid]/e/[eventId]', params: { lid, eventId: id } });

  const pick = (k: WizardKind, from?: RacketEvent | null) => {
    setKind(k);
    setStep(1);
    setSignup(null);
    if (k === 'americano' || k === 'mexicano') {
      const prev = from ? parseNightConfig(from.config, from.type) : null;
      setNight(
        newNightConfig(k as NightFormat, {
          players: prev?.players ?? [],
          courts: prev?.courts ?? ['Cancha 1', 'Cancha 2'],
          points: prev?.points,
          rounds: prev ? prev.rounds : undefined,
          rest: prev?.rest,
          firstRound: prev?.firstRound,
        }),
      );
      if (from?.startTime) setTime(from.startTime);
    }
  };

  const title = name.trim() || (kind ? defaultName(kind, date, doubles) : '');
  const entrantItems = useMemo(
    () =>
      doubles
        ? names.teams.map((t) => ({ id: t.id, name: t.name, sub: t.roster.map((r) => names.nameOf(r.playerId)).join(' / ') }))
        : names.players.map((p) => ({ id: p.id, name: p.name })),
    [doubles, names],
  );

  const create = async () => {
    if (!kind) return;
    setBusy(true);
    try {
      const config = wizardConfig(kind, { night, levels, signup, pairs, double, date, time, cats, seed: nightSeed() });
      const id = await createRacketEvent(lid, { type: kind, name: title, date, startTime: time || null, config });
      toast('Listo');
      openEvent(id);
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const isNight = kind === 'americano' || kind === 'mexicano';
  const lastStep = isNight ? 3 : 2;
  // Con «Me apunto» la noche se crea con los que haya (se llena sola).
  const enoughPlayers = night.players.length >= 4 || !!signup?.open;
  const canNext = step === 1 ? !!date : step === 2 && isNight ? enoughPlayers : true;
  // Las rondas recomendadas cuentan con el cupo mientras la lista se llena.
  const expected = signup?.open ? Math.min(NIGHT_MAX_PLAYERS, signupCap(signup)) : undefined;
  const changeSignup = (s: SignupSettings | null) => {
    setSignup(s);
    if (!isNight) return;
    const before = Math.max(night.players.length, signup?.open ? Math.min(NIGHT_MAX_PLAYERS, signupCap(signup)) : 0);
    const after = Math.max(night.players.length, s?.open ? Math.min(NIGHT_MAX_PLAYERS, signupCap(s)) : 0);
    setNight((x) => (x.rounds === suggestRounds(x.format, before, x.courts.length) ? { ...x, rounds: suggestRounds(x.format, after, x.courts.length) } : x));
  };

  const templates = builtInTemplates(doubles, ext);
  const extra = extraTemplates(sport as RacketSport);
  const canRepeat = canRepeatNight(lastNight, doubles, ext);

  const head = (t: string, sub: string) => (
    <View style={{ gap: 4 }}>
      <Txt variant="title">{t}</Txt>
      <Txt variant="meta" tone="muted">
        {sub}
      </Txt>
    </View>
  );

  if (custom) {
    const info = extra.find((t) => t.k === custom)!;
    const Form = custom === 'cajas' ? BoxForm : LadderForm;
    return (
      <View style={{ gap: 20 }}>
        <Txt variant="title">{info.title}</Txt>
        <Form onBack={() => setCustom(null)} onDone={openEvent} />
      </View>
    );
  }

  if (step === 0 || !kind) {
    return (
      <View style={{ gap: 16 }}>
        {head('Nuevo', '¿Qué vas a organizar?')}
        {canRepeat && lastNight && (
          <Card padded={false} style={{ backgroundColor: c.surface2 }}>
            <ListRow
              icon={
                <RowIcon>
                  <Copy size={20} color={c.accent} />
                </RowIcon>
              }
              title="Repetir la última noche"
              subtitle={`${lastNight.name || eventTypeInfo(lastNight.type).label}: mismos jugadores, canchas y puntos`}
              onPress={() => pick(lastNight.type === 'mexicano' ? 'mexicano' : 'americano', lastNight)}
            />
          </Card>
        )}
        <Card padded={false}>
          {templates.map((t, i) => {
            const Icon = eventTypeInfo(t.k).icon as unknown as LucideIcon;
            return (
              <View key={t.k}>
                {i > 0 && <Divider inset={68} />}
                <ListRow
                  icon={
                    <RowIcon>
                      <Icon size={20} color={c.accent} />
                    </RowIcon>
                  }
                  title={t.title}
                  subtitle={t.text}
                  onPress={() => pick(t.k)}
                />
              </View>
            );
          })}
          {extra.map((t) => {
            const Icon = extraIcon(t.k);
            return (
              <View key={t.k}>
                <Divider inset={68} />
                <ListRow
                  icon={
                    <RowIcon>
                      <Icon size={20} color={c.accent} />
                    </RowIcon>
                  }
                  title={t.title}
                  subtitle={t.text}
                  // El round robin social del pickleball, todavía en la web.
                  onPress={() => (t.k === 'cajas' || t.k === 'escalera' ? setCustom(t.k) : void openOnWeb(`/l/${lid}`))}
                />
              </View>
            );
          })}
        </Card>
      </View>
    );
  }

  return (
    <View style={{ gap: 20 }}>
      {head(title, `Paso ${step} de ${lastStep}`)}

      {step === 1 && (
        <View style={{ gap: 16 }}>
          <Field label={kind === 'liga' ? 'Primera jornada' : 'Fecha'}>
            <DateStepper value={date} onChange={setDate} />
          </Field>
          <Field label="Hora">
            <TimeStepper value={time} onChange={setTime} label="Hora" />
          </Field>
          <Field label="Nombre">
            <Input value={name} maxLength={80} onChangeText={setName} placeholder={defaultName(kind, date, doubles)} accessibilityLabel="Nombre" />
          </Field>
          {isNight && <NightFields value={night} onChange={setNight} parts={['courts', 'points']} />}
          {kind === 'liga' && <ToggleRow checked={double} onChange={setDouble} label="Ida y vuelta" hint={`Cada ${side[0]} juega dos veces contra cada rival`} />}
          {kind === 'torneo' && <Stepper label="Categorías (A, B, C…)" value={cats} min={1} max={CATEGORY_IDS.length} onChange={setCats} />}
        </View>
      )}

      {step === 2 && isNight && (
        <View style={{ gap: 12 }}>
          <SignupFields value={signup} onChange={changeSignup} unit={['jugador', 'jugadores']} defaultCap={Math.max(4, night.courts.length * 4)} maxCap={NIGHT_MAX_PLAYERS} tz={league.tz} />
          <Txt variant="meta" tone="muted">
            {signup?.open ? 'Los que se apunten entran solos. Agrega aquí a quien ya sabes.' : '¿Quién juega esta noche?'}
          </Txt>
          <NightPlayers
            value={night.players}
            levels={levels}
            onChange={(players) =>
              setNight((x) => ({ ...x, players, rounds: x.rounds === suggestRounds(x.format, x.players.length, x.courts.length) ? suggestRounds(x.format, players.length, x.courts.length) : x.rounds }))
            }
          />
        </View>
      )}

      {step === 3 && isNight && (
        <View style={{ gap: 12 }}>
          <Txt>
            <Txt style={{ fontFamily: font.bold }}>{night.players.length}</Txt> jugadores · <Txt style={{ fontFamily: font.bold }}>{night.courts.length}</Txt>{' '}
            {night.courts.length === 1 ? 'cancha' : 'canchas'} · <Txt style={{ fontFamily: font.bold }}>{night.rounds}</Txt> rondas ·{' '}
            {night.points.mode === 'total' ? `a ${night.points.target} puntos` : `${night.points.minutes} minutos`}
          </Txt>
          <NightFields value={night} onChange={setNight} parts={['rounds']} expected={expected} />
          <Txt tone="muted" style={{ fontSize: 13 }}>
            {signup?.open ? 'Luego comparte el link para que se apunten.' : 'Luego, en la noche, tocas «Empezar ronda 1».'}
          </Txt>
        </View>
      )}

      {step === 2 && !isNight && (
        <View style={{ gap: 12 }}>
          {kind === 'torneo' && <SignupFields value={signup} onChange={changeSignup} unit={side} perCategory={cats > 1} defaultCap={8} tz={league.tz} />}
          {kind === 'torneo' && cats > 1 ? (
            <Note>{`Las ${side[1]} de cada categoría se eligen en el torneo.`}</Note>
          ) : (
            <>
              <Txt variant="meta" tone="muted">
                ¿Qué {side[1]} juegan? Lo puedes cambiar después.
              </Txt>
              <PickList
                items={entrantItems}
                selected={new Set(pairs)}
                onToggle={(id) => setPairs(pairs.includes(id) ? pairs.filter((x) => x !== id) : [...pairs, id])}
                empty={<NoEntrants doubles={doubles} />}
              />
              <Txt tone={pairs.length < 2 ? 'danger' : 'muted'} style={{ fontSize: 14, fontFamily: font.semibold }}>
                {`${pairs.length} ${pairs.length === 1 ? side[0] : side[1]}`}
              </Txt>
            </>
          )}
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Button size="lg" full icon={<ChevronLeft size={18} color={c.fg} />} onPress={() => setStep(step - 1)}>
            Atrás
          </Button>
        </View>
        <View style={{ flex: 1 }}>
          {step < lastStep ? (
            <Button variant="primary" size="lg" full disabled={!canNext} icon={<ChevronRight size={18} color={c.accentFg} />} onPress={() => setStep(step + 1)}>
              Siguiente
            </Button>
          ) : (
            <Button variant="primary" size="lg" full loading={busy} disabled={isNight && !enoughPlayers} onPress={() => void create()}>
              Crear
            </Button>
          )}
        </View>
      </View>
    </View>
  );
}
