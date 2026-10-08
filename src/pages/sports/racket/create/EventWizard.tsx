import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ChevronLeft, ChevronRight, Copy } from 'lucide-react';
import { createRacketEvent, type RacketEvent } from '../../../../lib/data/racket';
import { useLeagueCtx } from '../../../../lib/league';
import { useFeedback, saveErrorMessage } from '../../../../components/feedback';
import { Button, Card, Field, Input, ListRow, RowIcon, Sheet, cx } from '../../../../components/ui';
import { EventIcon, PickList, Stepper, ToggleRow, eventTypeInfo } from '../bits';
import { parseLeagueConfig, leagueConfigJson } from '../logic/league';
import { NIGHT_MAX_PLAYERS, newNightConfig, nightConfigJson, parseNightConfig, suggestRounds, type NightConfig, type NightFormat } from '../logic/night';
import { signupCap, type SignupSettings } from '../logic/signup';
import { CATEGORY_IDS, newCategory, tourneyConfigJson, type TourneyConfig } from '../logic/tourney';
import { todayIn } from '../logic/time';
import { useLevels } from '../levels';
import { useNames } from '../names';
import { NightFields, NightPlayers } from '../night/NightForm';
import { SignupFields } from '../signup/SignupFields';
import { useRacket, type WizardTemplate } from '../sport';

type Kind = 'americano' | 'mexicano' | 'liga' | 'torneo';

const weekday = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Intl.DateTimeFormat('es-DO', { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
};

/** Nombre por defecto: «Americano del jueves», «Liga de parejas», «Torneo de octubre». */
export function defaultName(kind: Kind, date: string, doubles: boolean): string {
  if (kind === 'americano' || kind === 'mexicano') return `${eventTypeInfo(kind).label} del ${weekday(date)}`;
  if (kind === 'liga') return doubles ? 'Liga de parejas' : 'Liga';
  const [y, m] = date.split('-').map(Number);
  const month = y && m ? new Intl.DateTimeFormat('es-DO', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1))) : '';
  return `Torneo de ${month}`;
}

/**
 * «Nuevo»: plantillas del deporte (Americano de la noche, Mexicano, Liga de parejas, Torneo por categorías, y las
 * que agrega el deporte: liga por cajas, escalera, round robin social), y en 1–2 pasos más la noche queda lista
 * para empezar (jugadores, canchas, puntos y rondas) o la liga y el torneo listos para armar su calendario. La
 * noche y el torneo pueden abrir la inscripción «Me apunto» (cupo, fecha límite y lista de espera) en vez de, o
 * además de, elegir a mano.
 */
export function EventWizard({ open, onClose, lastNight }: { open: boolean; onClose: () => void; lastNight?: RacketEvent | null }) {
  const { lid, base, league } = useLeagueCtx();
  const { doubles, side, ext } = useRacket();
  const names = useNames();
  const { levels } = useLevels();
  const [custom, setCustom] = useState<WizardTemplate | null>(null);
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const [kind, setKind] = useState<Kind | null>(null);
  const [step, setStep] = useState(0);
  const [date, setDate] = useState(todayIn(league.tz));
  const [time, setTime] = useState('19:00');
  const [name, setName] = useState('');
  const [night, setNight] = useState<NightConfig>(() => newNightConfig('americano', { players: [], courts: ['Cancha 1', 'Cancha 2'] }));
  const [pairs, setPairs] = useState<string[]>([]);
  const [double, setDouble] = useState(false);
  const [cats, setCats] = useState(1);
  const [signup, setSignup] = useState<SignupSettings | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKind(null);
    setCustom(null);
    setStep(0);
    setDate(todayIn(league.tz));
    setName('');
    setPairs([]);
    setSignup(null);
  }, [open, league.tz]);

  const pick = (k: Kind, from?: RacketEvent | null) => {
    setKind(k);
    setStep(1);
    setSignup(null);
    if (k === 'americano' || k === 'mexicano') {
      const prev = from ? parseNightConfig(from.config, from.type) : null;
      const players = prev?.players ?? [];
      const courts = prev?.courts ?? ['Cancha 1', 'Cancha 2'];
      setNight(
        newNightConfig(k as NightFormat, {
          players,
          courts,
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
      let config: Record<string, unknown>;
      if (kind === 'americano' || kind === 'mexicano') {
        const lv: Record<string, number> = {};
        for (const p of night.players) if (levels[p] != null) lv[p] = levels[p];
        config = nightConfigJson({ ...night, format: kind, levels: lv, seed: `noche:${Date.now().toString(36)}`, ...(signup?.open ? { signup } : {}) });
      } else if (kind === 'liga') {
        config = leagueConfigJson(parseLeagueConfig({ pairs, double, startDate: date, times: [time], everyDays: 7, minutes: 90 }, date));
      } else {
        const t: TourneyConfig = {
          v: 1,
          format: 'torneo',
          categories: CATEGORY_IDS.slice(0, cats).map((id) => ({ ...newCategory(id), pairs: cats === 1 ? pairs : [] })),
          courts: [],
          points: 'standard',
          ...(signup?.open ? { signup } : {}),
        };
        config = tourneyConfigJson(t);
      }
      const id = await createRacketEvent(lid, { type: kind, name: title, date, startTime: time || null, config });
      toast('Listo');
      onClose();
      navigate(`${base}/e/${id}`);
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
    setNight((c) => (c.rounds === suggestRounds(c.format, before, c.courts.length) ? { ...c, rounds: suggestRounds(c.format, after, c.courts.length) } : c));
  };

  const builtIn: { k: Kind; title: string; text: string }[] = [
    ...(doubles
      ? [
          { k: 'americano' as const, title: 'Americano de la noche', text: 'Las parejas rotan cada ronda y cada quien suma sus puntos. La app arma las rondas.' },
          { k: 'mexicano' as const, title: 'Mexicano', text: 'Cada ronda se arma con la tabla: 1.º y 4.º contra 2.º y 3.º. Recomendado de 8 jugadores en adelante.' },
        ]
      : []),
    { k: 'liga', title: doubles ? 'Liga de parejas' : 'Liga', text: `Todos contra todos por jornadas, de ida o de ida y vuelta, con canchas, horas y tabla.` },
    { k: 'torneo', title: 'Torneo por categorías', text: 'Categorías A, B, C…: grupos por nivel, cruces y cuadro con 3.er lugar.' },
  ];
  // Lo que agrega el deporte: esconde plantillas, les cambia el nombre y suma las suyas.
  const titles = ext.templateTitles?.(doubles) ?? {};
  const templates = builtIn.filter((t) => !ext.hideTemplates?.includes(t.k)).map((t) => ({ ...t, ...titles[t.k] }));
  const extra = ext.templates ?? [];
  const canRepeat = !!lastNight && doubles && !ext.hideTemplates?.includes(lastNight.type === 'mexicano' ? 'mexicano' : 'americano');

  if (custom) {
    const Form = custom.Form;
    return (
      <Sheet open={open} onClose={onClose} title={custom.title}>
        <Form
          last={lastNight}
          onBack={() => setCustom(null)}
          onDone={(id) => {
            onClose();
            navigate(`${base}/e/${id}`);
          }}
        />
      </Sheet>
    );
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={step === 0 ? 'Nuevo' : title}
      subtitle={step === 0 ? '¿Qué vas a organizar?' : `Paso ${step} de ${lastStep}`}
      footer={
        step === 0 ? undefined : (
          <div className="flex gap-2.5">
            <Button variant="quiet" size="lg" className="flex-1" icon={<ChevronLeft className="size-4" />} onClick={() => setStep(step - 1)}>
              Atrás
            </Button>
            {step < lastStep ? (
              <Button variant="primary" size="lg" className="flex-1" disabled={!canNext} onClick={() => setStep(step + 1)} icon={<ChevronRight className="size-4" />}>
                Siguiente
              </Button>
            ) : (
              <Button variant="primary" size="lg" className="flex-1" loading={busy} disabled={isNight && !enoughPlayers} onClick={() => void create()}>
                Crear
              </Button>
            )}
          </div>
        )
      }
    >
      {step === 0 && (
        <div className="flex flex-col gap-3 pb-1">
          {canRepeat && lastNight && (
            <Card soft className="overflow-hidden">
              <ListRow
                leading={
                  <RowIcon tone="accent">
                    <Copy className="size-5" />
                  </RowIcon>
                }
                title="Repetir la última noche"
                subtitle={`${lastNight.name || eventTypeInfo(lastNight.type).label}: mismos jugadores, canchas y puntos`}
                onClick={() => pick(lastNight.type === 'mexicano' ? 'mexicano' : 'americano', lastNight)}
              />
            </Card>
          )}
          <Card className="overflow-hidden">
            {templates.map((t) => (
              <ListRow
                key={t.k}
                leading={
                  <RowIcon tone="accent">
                    <EventIcon type={t.k} className="size-5" />
                  </RowIcon>
                }
                title={t.title}
                subtitle={t.text}
                onClick={() => pick(t.k)}
              />
            ))}
            {extra.map((t) => (
              <ListRow
                key={t.k}
                leading={
                  <RowIcon tone="accent">
                    <t.icon className="size-5" aria-hidden="true" />
                  </RowIcon>
                }
                title={t.title}
                subtitle={t.text}
                onClick={() => setCustom(t)}
              />
            ))}
          </Card>
        </div>
      )}

      {step === 1 && kind && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label={kind === 'liga' ? 'Primera jornada' : 'Fecha'}>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Hora">
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
          </div>
          <Field label="Nombre">
            <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder={defaultName(kind, date, doubles)} />
          </Field>
          {isNight && <NightFields value={night} onChange={setNight} parts={['courts', 'points']} />}
          {kind === 'liga' && <ToggleRow checked={double} onChange={setDouble} label="Ida y vuelta" hint={`Cada ${side[0]} juega dos veces contra cada rival`} />}
          {kind === 'torneo' && (
            <Stepper label="Categorías (A, B, C…)" value={cats} min={1} max={CATEGORY_IDS.length} onChange={setCats} />
          )}
        </div>
      )}

      {step === 2 && isNight && (
        <div className="flex flex-col gap-3">
          <SignupFields
            value={signup}
            onChange={changeSignup}
            unit={['jugador', 'jugadores']}
            defaultCap={Math.max(4, night.courts.length * 4)}
            maxCap={NIGHT_MAX_PLAYERS}
            tz={league.tz}
          />
          <p className="text-meta text-muted">{signup?.open ? 'Los que se apunten entran solos. Agrega aquí a quien ya sabes.' : '¿Quién juega esta noche?'}</p>
          <NightPlayers
            value={night.players}
            levels={levels}
            onChange={(players) =>
              setNight((c) => ({ ...c, players, rounds: c.rounds === suggestRounds(c.format, c.players.length, c.courts.length) ? suggestRounds(c.format, players.length, c.courts.length) : c.rounds }))
            }
          />
        </div>
      )}

      {step === 3 && isNight && (
        <div className="flex flex-col gap-3">
          <p className="text-body">
            <b className="num">{night.players.length}</b> jugadores · <b className="num">{night.courts.length}</b> {night.courts.length === 1 ? 'cancha' : 'canchas'} ·{' '}
            <b className="num">{night.rounds}</b> rondas · {night.points.mode === 'total' ? `a ${night.points.target} puntos` : `${night.points.minutes} minutos`}
          </p>
          <NightFields value={night} onChange={setNight} parts={['rounds']} expected={expected} />
          <p className="text-[13px] text-muted">{signup?.open ? 'Luego comparte el link para que se apunten.' : 'Luego, en la noche, tocas «Empezar ronda 1».'}</p>
        </div>
      )}

      {step === 2 && !isNight && (
        <div className="flex flex-col gap-3">
          {kind === 'torneo' && (
            <SignupFields value={signup} onChange={changeSignup} unit={side} perCategory={cats > 1} defaultCap={8} tz={league.tz} />
          )}
          {kind === 'torneo' && cats > 1 ? (
            <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-fg-2">Las {side[1]} de cada categoría se eligen en el torneo.</p>
          ) : (
            <>
              <p className="text-meta text-muted">¿Qué {side[1]} juegan? Lo puedes cambiar después.</p>
              <PickList
                items={entrantItems}
                selected={new Set(pairs)}
                onToggle={(id) => setPairs(pairs.includes(id) ? pairs.filter((x) => x !== id) : [...pairs, id])}
                empty={
                  doubles ? (
                    <>
                      Todavía no hay parejas.{' '}
                      <Link className="font-medium text-accent" to={`${base}/admin?tab=parejas`} onClick={onClose}>
                        Arma las parejas
                      </Link>
                      .
                    </>
                  ) : (
                    'Todavía no hay jugadores.'
                  )
                }
              />
              <p className={cx('text-sm font-semibold', pairs.length < 2 ? 'text-danger' : 'text-muted')}>
                {pairs.length} {pairs.length === 1 ? side[0] : side[1]}
              </p>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}
