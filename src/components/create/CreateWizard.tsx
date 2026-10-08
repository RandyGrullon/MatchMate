import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';
import { ArrowRight, Baby, Calendar, CalendarDays, Camera, ChevronDown, Copy, Globe, ImagePlus, Lock, MapPin, Share2, UserPlus, X } from 'lucide-react';
import { displayName, useAuth } from '../../lib/auth';
import { createLeague, createTournament, getInviteCode, renewInviteCode, useLeague } from '../../lib/data';
import { toIsoDate } from '../../lib/format';
import type { CompressedLogo } from '../../lib/image';
import { logoErrorText, prepareLogo, uploadLeagueLogo } from '../../lib/logos';
import { WEEKDAY_SHORT, WEEKDAYS } from '../../lib/schedule';
import type { LeagueKind } from '../../lib/types';
import { useIsPro } from '../../lib/useMode';
import { getSport, sportMeta, sportsOf } from '../../sports/registry';
import { useSportStatus } from '../../sports/status';
import type { SportId } from '../../sports/types';
import { SportIcon } from '../../pages/sports/SportBits';
import { SportPicker } from '../../pages/sports/SportPicker';
import { BusyIcon, useBusy } from '../busy';
import { useAction, useFeedback } from '../feedback';
import { sportTint } from '../home/SportTint';
import { useMyLeagues } from '../home/useHomeData';
import { InviteSheet } from '../invite/InviteSheet';
import { codeInviteUrl, inviteShareText } from '../invite/logic';
import { timezoneOptions, tzOffset } from '../league/logic';
import { initialSport } from '../LeagueFormModal';
import { QrCode } from '../QrCode';
import { shareLink } from '../share';
import { Card, ListRow, MODAL_OPENED, RowIcon, Segmented, Sheet, Skeleton, cx, keyboardInset } from '../ui';
import {
  TIME_OPTIONS,
  canAdvance,
  createStep,
  defaultSeason,
  emptyForm,
  longDay,
  scheduleSummary,
  seasonRange,
  wizardInput,
  wizardSteps,
  type Frequency,
  type WizardForm,
} from './logic';
import { CreateStyles, wizardField, wizardLabel, wizardLegend } from './styles';

/** Lo que cambia con «Liga con menores» (lo mismo que explicaba el formulario de antes). */
const MINORS_RULES = [
  'La liga queda privada: solo entra quien tenga la invitación.',
  'Los menores no tienen cuenta: los registra un admin, con el permiso de su papá, mamá o tutor.',
  'Su año de nacimiento y sus datos solo los ven los admins; los demás ven su nombre y su categoría.',
  'Sin fotos, sin «Me gusta» y sin comentarios en toda la liga.',
  'Sin link para anotar: a cada anotador se le invita por su @usuario. Quien entró con un link solo para anotar sale de la liga.',
];

/**
 * El deporte marcado al abrir: el pedido (si se puede crear), el único que juegas, o el boliche (o el primero). Esports
 * sale marcado solo si se pidió (al elegirlo, el asistente lleva a crear en Esports: ver `esportsCreatePath`).
 */
export function wizardSport(creatable: readonly SportId[], wanted: SportId | null | undefined, mySports: readonly string[]): SportId {
  // Esports nunca sale marcado por venir de él (el deporte en que estabas): al marcarlo el asistente se iría a Esports
  // sin dejar elegir otro deporte. Se elige tocándolo (o si es lo único que se puede crear).
  if (wanted && wanted !== 'esports' && creatable.includes(wanted)) return wanted;
  const others = creatable.filter((s) => s !== 'esports');
  const mine = mySports.filter((s): s is SportId => (others as readonly string[]).includes(s));
  if (mine.length === 1) return mine[0];
  return initialSport(others.length ? others : creatable, null).sport;
}

/**
 * Esports no sigue este asistente (el juego decide todo, docs/esports.md §11.2): al elegirlo se cierra y va a Esports a
 * elegir el juego, para crear un torneo (`?crear=torneo`) o una liga de esports (`?crear=liga`).
 */
export const esportsCreatePath = (kind: LeagueKind): string => (kind === 'torneo' ? '/esports?crear=torneo' : '/esports?crear=liga');

/** El tamaño del teclado del teléfono (0 sin teclado): el pie con el botón queda encima de él. */
function useKeyboard(): number {
  const [kb, setKb] = useState(0);
  useEffect(() => {
    const vv = typeof window === 'undefined' ? null : window.visualViewport;
    if (!vv) return;
    const sync = () => setKb(keyboardInset(window.innerHeight, vv));
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
    };
  }, []);
  return kb;
}

/**
 * «Crear una liga» en 4 pasos cortos, a pantalla completa (Ligas › Crear o unirme › Una liga): Nombre · Día y lugar ·
 * Temporada · Invitar, con la barra de pasos arriba y un solo botón abajo («Siguiente», «Crear liga», «Ir a mi liga»).
 * Un torneo sin liga va en 3 (Nombre · Fecha y lugar · Invitar). Crea con lo mismo de siempre (create_league o
 * create_tournament, el logo después) y al final muestra el código, el QR y el link para invitar.
 * En Lite, lo que casi no se toca (contacto, zona horaria, liga con menores) va en «Más opciones»; en Pro, a la vista,
 * con el logo.
 */
export function CreateWizard({
  kind,
  sport: wanted,
  onClose,
  onDone,
}: {
  kind: LeagueKind;
  /** Deporte que sale marcado (si la cuenta lo puede crear). */
  sport?: SportId | null;
  onClose: () => void;
  /** Ir a la liga (o al torneo) recién creada. */
  onDone: (to: string) => void;
}) {
  const auth = useAuth();
  const pro = useIsPro();
  const run = useAction();
  const { confirm, toast } = useFeedback();
  const sports = useSportStatus(auth.isSuper);
  const mine = useMyLeagues(null);
  const mySports = useMemo(() => sportsOf(mine.all), [mine.all]);
  const torneo = kind === 'torneo';
  const steps = wizardSteps(kind);
  const [index, setIndex] = useState(0);
  const [form, setForm] = useState<WizardForm>(() => emptyForm(kind, displayName(auth), toIsoDate(new Date())));
  const [sport, setSport] = useState<SportId>(() => wizardSport(sports.creatable, wanted, mySports));
  const [picking, setPicking] = useState(false);
  const [logo, setLogo] = useState<CompressedLogo | null>(null);
  const [created, setCreated] = useState<{ lid: string; to: string } | null>(null);
  const { isBusy, run: wait } = useBusy<'crear'>();
  const touched = useRef(false);
  const ref = useRef<HTMLDialogElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const kb = useKeyboard();

  // Qué puede crear y qué deportes juega llegan un momento después: si no tocó el deporte, se vuelve a marcar.
  const key = `${sports.creatable.join(',')}|${mySports.join(',')}`;
  useEffect(() => {
    if (!touched.current) setSport(wizardSport(sports.creatable, wanted, mySports));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) {
      d.showModal();
      window.dispatchEvent(new Event(MODAL_OPENED));
      // showModal pone el foco en la X: el primer paso empieza escribiendo el nombre.
      d.querySelector<HTMLInputElement>('#wz-nombre')?.focus();
    }
  }, []);
  useLayoutEffect(() => {
    const d = ref.current;
    return () => {
      if (d?.open) d.close();
    };
  }, []);
  // Cada paso empieza arriba, con el foco en su pregunta (el lector de pantalla la lee).
  useEffect(() => {
    scroller.current?.scrollTo?.({ top: 0 });
    if (index > 0) title.current?.focus({ preventScroll: true });
  }, [index]);

  const step = steps[index].key;
  const tint = sportTint(sport);
  const set = <K extends keyof WizardForm>(k: K, v: WizardForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const chooseSport = (id: SportId) => {
    touched.current = true;
    // Esports: en lugar de seguir, a Esports a elegir el juego (solo al tocarlo: nunca por haber venido de Esports).
    if (id === 'esports') return onDone(esportsCreatePath(kind));
    setSport(id);
  };
  // Si Esports es lo único que esta cuenta puede crear, el asistente va directo a Esports.
  useEffect(() => {
    if (sport === 'esports' && sports.creatable.length === 1) onDone(esportsCreatePath(kind));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sport, sports.creatable.length]);

  async function close() {
    // Mientras se crea no se cierra (quedaría creada sin llevarte a ella).
    if (isBusy('crear')) return;
    if (created) return onDone(created.to);
    if (form.name.trim()) {
      const ok = await confirm({
        title: torneo ? '¿Salir sin crear el torneo?' : '¿Salir sin crear la liga?',
        message: 'Lo que llenaste se pierde.',
        confirmText: 'Salir',
      });
      if (!ok) return;
    }
    onClose();
  }

  async function create() {
    if (!auth.user) return;
    const owner = { uid: auth.user.uid, name: displayName(auth) };
    const input = wizardInput(kind, sport, form);
    await wait('crear', async () => {
      const made = torneo
        ? await run(async () => {
            const { lid, eid } = await createTournament(owner, input, form.date);
            // Equipos: el torneo se arma desde su inicio; los demás van a inscribir en su evento.
            return { lid, to: getSport(sport).family === 'team' ? `/l/${lid}` : `/l/${lid}/e/${eid}?tab=inscritos` };
          }, 'Torneo creado')
        : await run(async () => ({ lid: await createLeague(owner, input), to: '' }), 'Liga creada');
      if (!made) return;
      const done = { lid: made.lid, to: made.to || `/l/${made.lid}` };
      // El logo, después de crearla y si se puede: si falla, igual queda creada.
      if (logo) {
        try {
          await uploadLeagueLogo(done.lid, logo);
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
      setCreated(done);
      setIndex(steps.length - 1);
    });
  }

  function next(e?: FormEvent) {
    e?.preventDefault();
    if (step === 'invitar') return created && onDone(created.to);
    if (!canAdvance(step, kind, form) || isBusy()) return;
    if (step === createStep(kind)) return void create();
    setIndex((i) => Math.min(i + 1, steps.length - 1));
  }

  const busy = isBusy('crear');
  const label =
    step === 'invitar' ? (torneo ? 'Ir al torneo' : 'Ir a mi liga') : step === createStep(kind) ? (torneo ? 'Crear torneo' : 'Crear liga') : 'Siguiente';
  const noun = torneo ? 'el torneo' : 'la liga';

  return (
    <dialog
      ref={ref}
      aria-labelledby="wz-titulo"
      onCancel={(e) => {
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        void close();
      }}
      className={cx(
        'mm-create overflow-hidden overscroll-none bg-bg p-0 text-fg',
        tint.className,
        // Teléfono: pantalla completa. Computadora: un cuadro en el centro.
        'm-0 h-dvh max-h-none w-full max-w-none',
        'sm:m-auto sm:h-[min(52rem,calc(100dvh-3rem))] sm:w-[calc(100%-1.5rem)] sm:max-w-lg sm:rounded-3xl sm:border sm:border-line sm:shadow-2xl',
      )}
    >
      <CreateStyles />
      {tint.css && (
        <style href={tint.className} precedence="default">
          {tint.css}
        </style>
      )}
      <div className="flex h-full flex-col pt-[env(safe-area-inset-top)]" style={kb ? { paddingBottom: kb } : undefined}>
        <header className="grid h-[54px] shrink-0 grid-cols-[60px_1fr_60px] items-center px-4">
          <button
            type="button"
            onClick={() => void close()}
            disabled={busy}
            aria-label={created ? `Cerrar e ir a ${noun}` : 'Cerrar'}
            className="grid size-11 place-items-center rounded-full bg-surface-2 text-fg-2 transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
          >
            <X aria-hidden="true" className="size-[22px]" />
          </button>
          <h2 id="wz-titulo" className="truncate text-center text-[17px] font-[650] tracking-[-0.01em]">
            {torneo ? 'Crear un torneo' : 'Crear una liga'}
          </h2>
          <span className="num pr-1.5 text-right text-sm font-[550] tracking-normal text-muted">
            <span className="sr-only">Paso </span>
            {`${index + 1} de ${steps.length}`}
          </span>
        </header>
        <StepBar labels={steps.map((s) => s.label)} index={index} />

        <div ref={scroller} className="modal-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6">
          <form id="wz-form" onSubmit={next} noValidate>
            {step === 'nombre' && (
              <NameStep
                torneo={torneo}
                form={form}
                set={set}
                sport={sport}
                creatable={sports.creatable}
                mySports={mySports}
                onSport={chooseSport}
                onMore={() => setPicking(true)}
                pro={pro}
                logo={logo}
                onLogo={setLogo}
              />
            )}
            {step === 'lugar' &&
              (torneo ? (
                <TournamentPlaceStep form={form} set={set} sport={sport} titleRef={title} pro={pro} />
              ) : (
                <PlaceStep form={form} set={set} sport={sport} titleRef={title} />
              ))}
            {step === 'temporada' && <SeasonStep form={form} set={set} sport={sport} titleRef={title} pro={pro} />}
            {step === 'invitar' && created && <InviteStep lid={created.lid} torneo={torneo} name={form.name.trim()} titleRef={title} />}
          </form>
        </div>

        <footer className="shrink-0 px-6 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <button
            type="submit"
            form="wz-form"
            disabled={!canAdvance(step, kind, form) || busy}
            aria-busy={busy || undefined}
            className="flex h-btn w-full items-center justify-center gap-2.5 rounded-btn bg-accent px-6 text-[17px] font-semibold tracking-[-0.01em] whitespace-nowrap text-accent-fg transition select-none active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
          >
            {label}
            <BusyIcon busy={busy} icon={step === 'invitar' || step === createStep(kind) ? null : <ArrowRight aria-hidden="true" className="size-5" />} className="size-5" />
          </button>
          {index > 0 && step !== 'invitar' && (
            <button
              type="button"
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={busy}
              className="mt-1.5 flex h-11 w-full items-center justify-center text-meta font-[550] text-accent transition active:opacity-70 disabled:opacity-50"
            >
              Atrás
            </button>
          )}
        </footer>
      </div>

      {/* El deporte, en una hoja aparte (solo si puede crear de varios). */}
      <Sheet
        open={picking}
        onClose={() => setPicking(false)}
        title="¿De qué deporte?"
        footer={
          <button
            type="button"
            onClick={() => setPicking(false)}
            className="flex h-btn w-full items-center justify-center rounded-btn bg-accent text-[17px] font-semibold text-accent-fg"
          >
            Listo
          </button>
        }
      >
        <SportPicker groups={sports.choices} status={sports.status} value={sport} onChange={chooseSport} />
      </Sheet>
    </dialog>
  );
}

/** Barra de pasos: un segmento por paso (los hechos y el actual en el color del deporte) y su nombre debajo. */
export function StepBar({ labels, index }: { labels: readonly string[]; index: number }) {
  const cols = { gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` };
  return (
    <div className="mx-6 mt-2 shrink-0">
      <div aria-hidden="true" className="grid gap-1.5" style={cols}>
        {labels.map((l, i) => (
          <i key={l} className={cx('block h-[5px] rounded-[3px]', i <= index ? 'bg-accent' : 'bg-(--mm-track)')} />
        ))}
      </div>
      <ol className="mt-[7px] grid gap-1.5 text-[12.5px] font-[550]" style={cols}>
        {labels.map((l, i) => (
          <li
            key={l}
            aria-current={i === index ? 'step' : undefined}
            className={cx('truncate', i === index ? 'font-[650] text-accent' : i < index ? 'text-fg-2' : 'text-muted')}
          >
            {l}
          </li>
        ))}
      </ol>
    </div>
  );
}

type SetField = <K extends keyof WizardForm>(k: K, v: WizardForm[K]) => void;

/** La pregunta de cada paso (30 px) y una línea debajo. */
function Question({ title, sub, titleRef }: { title: string; sub: string; titleRef?: Ref<HTMLHeadingElement> }) {
  return (
    <>
      <h1 ref={titleRef} tabIndex={-1} className="mt-7 text-[30px] leading-9 font-bold tracking-[-0.03em] outline-none">
        {title}
      </h1>
      <p className="mt-1.5 text-[15.5px] text-muted">{sub}</p>
    </>
  );
}

/** Un campo de texto del asistente (56 px), con ícono adelante y una X para borrar. */
function TextField({
  id,
  value,
  onChange,
  placeholder,
  icon,
  clearable,
  ...rest
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  icon?: ReactNode;
  clearable?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'id'>) {
  return (
    <div className={wizardField}>
      {icon && <span className="shrink-0 text-muted">{icon}</span>}
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-full min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:font-normal placeholder:text-faint"
        {...rest}
      />
      {clearable && value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Borrar"
          className="-mr-2 grid size-11 shrink-0 place-items-center text-faint transition hover:text-fg"
        >
          <X aria-hidden="true" className="size-[18px]" />
        </button>
      )}
    </div>
  );
}

/** Un selector del asistente con la flecha a la derecha (la lista es la del teléfono). */
function SelectField({ id, value, onChange, options, label }: { id: string; value: string; onChange: (v: string) => void; options: readonly { value: string; label: string }[]; label?: string }) {
  return (
    <div className={cx(wizardField, 'relative pr-3')}>
      <select
        id={id}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        className="h-full min-w-0 flex-1 appearance-none bg-transparent pr-7 text-fg outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-4 size-[18px] text-faint" />
    </div>
  );
}

/** La frase de abajo de un paso, en acento suave: «Jugarán **todos los martes, 7:30 pm**». */
function Summary({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p aria-live="polite" className="mt-[22px] flex items-center gap-2.5 rounded-2xl bg-accent-soft px-4 py-3.5 text-[15px] text-fg-2">
      <span aria-hidden="true" className="shrink-0 text-accent">
        {icon}
      </span>
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** Interruptor en tarjeta (foto del marcador, liga con menores). */
function SwitchRow({ icon, title, text, on, onChange }: { icon: ReactNode; title: string; text: ReactNode; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex w-full items-center gap-3.5 rounded-2xl bg-(--mm-field) p-4 text-left shadow-(--mm-field-shadow) transition active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-body font-semibold">{title}</span>
        <span className="mt-0.5 block text-sm text-muted">{text}</span>
      </span>
      <span aria-hidden="true" className={cx('flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors', on ? 'bg-accent' : 'bg-line')}>
        <span className={cx('size-5 rounded-full bg-white shadow-sm transition-transform', on && 'translate-x-5')} />
      </span>
    </button>
  );
}

// ---------- Paso 1: Nombre ----------

function NameStep({
  torneo,
  form,
  set,
  sport,
  creatable,
  mySports,
  onSport,
  onMore,
  pro,
  logo,
  onLogo,
}: {
  torneo: boolean;
  form: WizardForm;
  set: SetField;
  sport: SportId;
  creatable: readonly SportId[];
  mySports: readonly string[];
  onSport: (s: SportId) => void;
  onMore: () => void;
  pro: boolean;
  logo: CompressedLogo | null;
  onLogo: (l: CompressedLogo | null) => void;
}) {
  const meta = getSport(sport);
  // Chips con los deportes que ya juegas (si son varios) y «Otro» para los demás; si juegas uno, una fila con «Cambiar».
  const mine = mySports.filter((s): s is SportId => (creatable as readonly string[]).includes(s));
  const chips = mine.length > 1 ? (mine.includes(sport) ? mine : [...mine, sport]) : [];
  return (
    <>
      <Question title={torneo ? '¿Cómo se llama el torneo?' : '¿Cómo se llama tu liga?'} sub={torneo ? 'Así lo van a ver los jugadores.' : 'Así la van a ver los jugadores.'} />
      <label htmlFor="wz-nombre" className={wizardLabel}>
        Nombre
      </label>
      <TextField
        id="wz-nombre"
        value={form.name}
        onChange={(v) => set('name', v)}
        placeholder={torneo ? 'Copa de verano' : 'Liga de los martes'}
        maxLength={60}
        autoFocus
        autoComplete="off"
        enterKeyHint="next"
      />

      {creatable.length > 1 &&
        (chips.length ? (
          <fieldset className="mt-6">
            <legend className={wizardLegend}>Deporte</legend>
            <div className="flex flex-wrap gap-2">
              {chips.map((s) => {
                const on = s === sport;
                const t = sportTint(s);
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onSport(s)}
                    className={cx(
                      'inline-flex h-11 items-center gap-2 rounded-full px-4 text-meta font-semibold transition active:scale-[0.97]',
                      t.className,
                      on ? 'bg-accent text-accent-fg' : 'bg-(--mm-field) text-fg-2 shadow-(--mm-field-shadow)',
                    )}
                  >
                    {t.css && (
                      <style href={t.className} precedence="default">
                        {t.css}
                      </style>
                    )}
                    <SportIcon sport={s} className="size-[18px]" />
                    {sportMeta(s)?.short ?? 'Otro'}
                  </button>
                );
              })}
              {creatable.length > chips.length && (
                <button
                  type="button"
                  onClick={onMore}
                  className="inline-flex h-11 items-center gap-1 rounded-full bg-(--mm-field) px-4 text-meta font-semibold text-fg-2 shadow-(--mm-field-shadow) transition active:scale-[0.97]"
                >
                  Otro <ChevronDown aria-hidden="true" className="size-4" />
                </button>
              )}
            </div>
          </fieldset>
        ) : (
          <>
            <p className={wizardLabel}>Deporte</p>
            <button type="button" onClick={onMore} className={cx(wizardField, 'text-left transition active:scale-[0.99]')} aria-label={`Deporte: ${meta.label}. Cambiar`}>
              <SportIcon sport={sport} className="size-5 shrink-0 text-accent" />
              <span className="min-w-0 flex-1 truncate">{meta.label}</span>
              <span className="shrink-0 text-meta font-semibold text-accent">Cambiar</span>
            </button>
          </>
        ))}
      {!meta.ready && (
        <p className="mt-3 rounded-2xl bg-warn-soft px-4 py-3 text-sm text-warn">
          Las pantallas de {meta.lower} llegan pronto: {torneo ? 'el torneo se crea ya y queda listo' : 'la liga se crea ya y queda lista'} para cuando lleguen.
        </p>
      )}

      <fieldset className="mt-6">
        <legend className={wizardLegend}>{torneo ? '¿Quién lo puede ver?' : '¿Quién la puede ver?'}</legend>
        <div className="grid grid-cols-2 gap-2.5">
          <VisibilityCard
            on={form.visibility === 'private'}
            onClick={() => set('visibility', 'private')}
            icon={<Lock className="size-[18px]" />}
            title="Privada"
            text="Solo con invitación"
          />
          <VisibilityCard
            on={form.visibility === 'public'}
            onClick={() => set('visibility', 'public')}
            icon={<Globe className="size-[18px]" />}
            title="Pública"
            text={form.hasMinors ? 'Con menores no se puede' : torneo ? 'Cualquiera lo ve y se une' : 'Cualquiera la ve y se une'}
            disabled={form.hasMinors}
          />
        </div>
      </fieldset>

      {pro && <LogoField value={logo} onChange={onLogo} torneo={torneo} />}
    </>
  );
}

function VisibilityCard({ on, onClick, icon, title, text, disabled }: { on: boolean; onClick: () => void; icon: ReactNode; title: string; text: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'flex min-h-[84px] flex-col items-start gap-1 rounded-2xl p-4 text-left transition active:scale-[0.98] disabled:opacity-50',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        on ? 'bg-accent-soft shadow-[inset_0_0_0_2px_var(--accent)]' : 'bg-(--mm-field) shadow-(--mm-field-shadow)',
      )}
    >
      <span className={cx('flex items-center gap-1.5 text-body font-[650]', on && 'text-accent')}>
        {icon}
        {title}
      </span>
      <span className="text-[13.5px] leading-snug text-muted">{text}</span>
    </button>
  );
}

/** «Logo (opcional)» (Pro): se elige, se recorta al cuadrado y se comprime aquí; se sube después de crear. */
function LogoField({ value, onChange, torneo }: { value: CompressedLogo | null; onChange: (l: CompressedLogo | null) => void; torneo: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const { isBusy, run } = useBusy<'logo'>();
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!value || typeof URL.createObjectURL !== 'function') {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(value.blob);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);
  async function pick(file: File | undefined) {
    if (input.current) input.current.value = '';
    if (!file) return;
    setError(null);
    await run('logo', async () => {
      try {
        onChange(await prepareLogo(file));
      } catch (e) {
        setError(logoErrorText(e, torneo ? 'torneo' : 'liga'));
      }
    });
  }
  const busy = isBusy('logo');
  return (
    <>
      <p className={wizardLabel}>Logo (opcional)</p>
      <div className={cx(wizardField, 'h-auto min-h-14 py-2')}>
        {preview ? (
          <img src={preview} alt="" className="size-10 shrink-0 rounded-xl object-cover" />
        ) : (
          <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-(--mm-track) text-muted">
            <ImagePlus className="size-5" />
          </span>
        )}
        <span className="min-w-0 flex-1 text-sm font-normal text-muted">{value ? 'Listo: se sube al crear' : 'Cuadrado, se ve en la lista'}</span>
        {value && !busy && (
          <button type="button" onClick={() => onChange(null)} className="min-h-11 shrink-0 px-1 text-meta font-semibold text-fg-2">
            Quitar
          </button>
        )}
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          aria-busy={busy || undefined}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 px-1 text-meta font-semibold text-accent disabled:opacity-60"
        >
          <BusyIcon busy={busy} className="size-4" />
          {busy ? 'Preparando…' : value ? 'Cambiar' : 'Elegir'}
        </button>
      </div>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files?.[0])} />
      {error && (
        <p role="alert" className="mx-1 mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </>
  );
}

// ---------- Paso 2: Día y lugar ----------

const FREQUENCIES: readonly { value: Frequency; label: string }[] = [
  { value: 'semana', label: 'Cada semana' },
  { value: 'libre', label: 'Sin día fijo' },
];

function VenueField({ form, set, sport }: { form: WizardForm; set: SetField; sport: string }) {
  const meta = sportMeta(sport);
  return (
    <>
      <label htmlFor="wz-lugar" className={wizardLabel}>
        {meta?.venue ?? 'Lugar'}
      </label>
      <TextField
        id="wz-lugar"
        value={form.venue}
        onChange={(v) => set('venue', v)}
        placeholder={meta?.venueHint ?? 'Dónde juegan'}
        icon={<MapPin className="size-5" />}
        clearable
        maxLength={80}
        autoComplete="off"
        enterKeyHint="next"
      />
    </>
  );
}

function PlaceStep({ form, set, sport, titleRef }: { form: WizardForm; set: SetField; sport: string; titleRef: Ref<HTMLHeadingElement> }) {
  const libre = form.freq === 'libre';
  const toggle = (d: number) => set('days', form.days.includes(d) ? form.days.filter((x) => x !== d) : [...form.days, d]);
  const sum = scheduleSummary(form.days, form.time, form.freq);
  return (
    <>
      <Question title="¿Cuándo y dónde juegan?" sub="Lo puedes cambiar después." titleRef={titleRef} />
      <fieldset disabled={libre} className="mt-6 disabled:opacity-50">
        <legend className={wizardLegend}>Día</legend>
        <div className="grid grid-cols-7 gap-1.5">
          {WEEKDAY_SHORT.map((short, d) => {
            const on = !libre && form.days.includes(d);
            return (
              <button
                key={short}
                type="button"
                onClick={() => toggle(d)}
                aria-pressed={on}
                aria-label={WEEKDAYS[d]}
                className={cx(
                  'h-[46px] min-w-0 rounded-[14px] text-[15px] font-[650] transition active:scale-95',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                  on ? 'bg-accent text-accent-fg' : 'bg-(--mm-field) text-fg shadow-(--mm-field-shadow)',
                )}
              >
                {short}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="grid grid-cols-[1fr_1.3fr] gap-2.5">
        <div className="min-w-0">
          <label htmlFor="wz-hora" className={wizardLabel}>
            Hora
          </label>
          <SelectField id="wz-hora" value={form.time} onChange={(v) => set('time', v)} options={[{ value: '', label: 'Sin hora' }, ...TIME_OPTIONS]} />
        </div>
        <div className="min-w-0">
          <label htmlFor="wz-cada" className={wizardLabel}>
            Cada cuánto
          </label>
          <SelectField id="wz-cada" value={form.freq} onChange={(v) => set('freq', v as Frequency)} options={FREQUENCIES} />
        </div>
      </div>
      <VenueField form={form} set={set} sport={sport} />
      <Summary icon={<Calendar className="size-5" />}>
        {sum.before}
        {sum.strong && <b className="font-[650] text-fg">{sum.strong}</b>}
      </Summary>
    </>
  );
}

function TournamentPlaceStep({ form, set, sport, titleRef, pro }: { form: WizardForm; set: SetField; sport: string; titleRef: Ref<HTMLHeadingElement>; pro: boolean }) {
  const day = form.date ? longDay(form.date) : '';
  return (
    <>
      <Question title="¿Cuándo y dónde es?" sub="Lo puedes cambiar después." titleRef={titleRef} />
      <label htmlFor="wz-fecha" className={wizardLabel}>
        Fecha
      </label>
      <TextField id="wz-fecha" type="date" value={form.date} onChange={(v) => set('date', v)} icon={<CalendarDays className="size-5" />} required />
      <VenueField form={form} set={set} sport={sport} />
      {day && (
        <Summary icon={<Calendar className="size-5" />}>
          Se juega el <b className="font-[650] text-fg">{day}</b>
        </Summary>
      )}
      <PhotoAndMore form={form} set={set} sport={sport} pro={pro} torneo />
    </>
  );
}

// ---------- Paso 3: Temporada ----------

function SeasonStep({ form, set, sport, titleRef, pro }: { form: WizardForm; set: SetField; sport: string; titleRef: Ref<HTMLHeadingElement>; pro: boolean }) {
  function toggle(on: boolean) {
    if (!on) return set('hasSeason', false);
    const today = toIsoDate(new Date());
    const d = defaultSeason(today);
    set('hasSeason', true);
    if (!form.seasonStart) {
      set('seasonStart', d.seasonStart);
      set('seasonEnd', d.seasonEnd);
    }
  }
  const range = form.hasSeason && form.seasonStart && form.seasonEnd ? seasonRange(form.seasonStart, form.seasonEnd) : null;
  const backwards = form.hasSeason && !!form.seasonStart && !!form.seasonEnd && form.seasonEnd < form.seasonStart;
  return (
    <>
      <Question title="¿Tiene temporada?" sub="Es opcional. Lo puedes cambiar después." titleRef={titleRef} />
      <Segmented
        full
        label="Temporada"
        className="mt-6"
        value={form.hasSeason ? 'si' : 'no'}
        onChange={(k) => toggle(k === 'si')}
        options={[
          { key: 'no', label: 'Sin fechas' },
          { key: 'si', label: 'Con fechas' },
        ]}
      />
      {form.hasSeason && (
        <div className="grid grid-cols-2 gap-2.5">
          <div className="min-w-0">
            <label htmlFor="wz-desde" className={wizardLabel}>
              Empieza
            </label>
            <TextField id="wz-desde" type="date" value={form.seasonStart} onChange={(v) => set('seasonStart', v)} required />
          </div>
          <div className="min-w-0">
            <label htmlFor="wz-hasta" className={wizardLabel}>
              Termina
            </label>
            <TextField id="wz-hasta" type="date" value={form.seasonEnd} min={form.seasonStart || undefined} onChange={(v) => set('seasonEnd', v)} required />
          </div>
        </div>
      )}
      <Summary icon={<Calendar className="size-5" />}>
        {backwards ? (
          'La fecha de fin va después de la de inicio.'
        ) : range ? (
          <>
            Temporada <b className="font-[650] text-fg">{range}</b>
          </>
        ) : (
          'Sin fechas por ahora: las pones cuando quieras en Organizar.'
        )}
      </Summary>
      <PhotoAndMore form={form} set={set} sport={sport} pro={pro} />
    </>
  );
}

/**
 * «Exigir foto del marcador» (los deportes con foto) y «Más opciones»: contacto para torneos, WhatsApp, zona horaria y
 * liga con menores (la liga; el torneo nuevo no las lleva). En Lite «Más opciones» está cerrado; en Pro, abierto.
 */
function PhotoAndMore({ form, set, sport, pro, torneo }: { form: WizardForm; set: SetField; sport: string; pro: boolean; torneo?: boolean }) {
  const [more, setMore] = useState(pro);
  const photos = sportMeta(sport)?.photos !== false;
  const minors = form.hasMinors;
  return (
    <>
      {photos && !minors && (
        <div className="mt-6">
          <SwitchRow
            icon={<Camera className="size-5" />}
            title="Exigir foto del marcador"
            text={form.requirePhoto ? 'Un juego cuenta cuando se verifica con la foto.' : 'Los juegos cuentan sin foto; igual se aprueban.'}
            on={form.requirePhoto}
            onChange={(v) => set('requirePhoto', v)}
          />
        </div>
      )}
      <button
        type="button"
        aria-expanded={more}
        aria-controls="wz-mas"
        onClick={() => setMore((m) => !m)}
        className="mt-4 flex h-11 items-center gap-1 px-1 text-meta font-[550] text-fg-2"
      >
        Más opciones <ChevronDown aria-hidden="true" className={cx('size-4 transition-transform', more && 'rotate-180')} />
      </button>
      <div id="wz-mas" hidden={!more}>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="min-w-0">
            <label htmlFor="wz-contacto" className={wizardLabel}>
              Contacto
            </label>
            <TextField id="wz-contacto" value={form.contactName} onChange={(v) => set('contactName', v)} placeholder="Nombre" maxLength={60} autoComplete="name" />
          </div>
          <div className="min-w-0">
            <label htmlFor="wz-whatsapp" className={wizardLabel}>
              WhatsApp
            </label>
            <TextField id="wz-whatsapp" type="tel" inputMode="tel" value={form.contactPhone} onChange={(v) => set('contactPhone', v)} placeholder="809 555 0000" maxLength={20} />
          </div>
        </div>
        <p className="mx-1 mt-2 text-sm text-muted">Sale en los anuncios de los torneos, para escribirle.</p>
        {!torneo && (
          <>
            <label htmlFor="wz-zona" className={wizardLabel}>
              Zona horaria
            </label>
            <SelectField
              id="wz-zona"
              value={form.tz}
              onChange={(v) => set('tz', v)}
              options={timezoneOptions(form.tz).map((z) => {
                const off = tzOffset(z.id);
                return { value: z.id, label: off ? `${z.label} (${off})` : z.label };
              })}
            />
            <div className="mt-6">
              <SwitchRow
                icon={<Baby className="size-5" />}
                title="Liga con menores"
                text={minors ? 'Una vez creada, no la puedes apagar tú.' : 'Para clubes con niños y jóvenes.'}
                on={minors}
                onChange={(v) => setMinors(v, form, set)}
              />
              {minors && (
                <ul className="mx-1 mt-3 flex list-disc flex-col gap-1 pl-5 text-sm text-muted">
                  {MINORS_RULES.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

/** Con menores: privada y sin foto obligatoria (la base no deja otra cosa). */
function setMinors(on: boolean, form: WizardForm, set: SetField) {
  set('hasMinors', on);
  if (on) {
    set('visibility', 'private');
    set('requirePhoto', false);
  } else if (!form.requirePhoto) set('requirePhoto', true);
}

// ---------- Paso 4: Invitar ----------

/** El código, el QR y el link de la liga recién creada, y «Buscar en la app» (la hoja de invitar con las cuentas). */
function InviteStep({ lid, torneo, name, titleRef }: { lid: string; torneo: boolean; name: string; titleRef: Ref<HTMLHeadingElement> }) {
  const run = useAction();
  const { toast } = useFeedback();
  const league = useLeague(lid);
  const [code, setCode] = useState<string | null | undefined>(undefined);
  const [inviting, setInviting] = useState(false);
  const { isBusy, run: wait } = useBusy<'compartir' | 'codigo' | 'crear'>();
  useEffect(() => {
    let alive = true;
    getInviteCode(lid)
      .then((c) => alive && setCode(c))
      .catch(() => alive && setCode(null));
    return () => {
      alive = false;
    };
  }, [lid]);
  const url = code ? codeInviteUrl(location.origin, code) : null;
  return (
    <>
      <Question
        title={torneo ? '¡Listo! Invita a los jugadores' : '¡Lista! Invita a tus jugadores'}
        sub="Mándales el link o enséñales el QR: entran con un toque."
        titleRef={titleRef}
      />
      {code === undefined ? (
        <Skeleton className="mt-6 h-[300px] rounded-3xl" />
      ) : !code ? (
        <Card className="mt-6 flex flex-col items-center gap-3 p-6 text-center">
          <p className="text-sm text-muted">Todavía no hay código para entrar.</p>
          <button
            type="button"
            disabled={isBusy()}
            onClick={() =>
              wait('crear', async () => {
                const c = await run(() => renewInviteCode({ id: lid }), 'Invitación creada');
                if (c) setCode(c);
              })
            }
            className="inline-flex h-12 items-center gap-2 rounded-[15px] bg-accent-soft px-5 text-base font-semibold text-accent"
          >
            <BusyIcon busy={isBusy('crear')} className="size-4" />
            Crear invitación
          </button>
        </Card>
      ) : (
        <>
          <div className="mt-6 flex flex-col items-center rounded-3xl bg-(--mm-field) px-5 pt-5 pb-4 shadow-(--mm-field-shadow)">
            <div className="rounded-2xl bg-white p-2">
              <QrCode value={url!} className="size-[168px]" />
            </div>
            <p className="mt-4 text-sm text-muted">Código</p>
            <p className="num mt-0.5 text-[28px] leading-none font-bold tracking-[0.12em]">{code}</p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <button
              type="button"
              disabled={isBusy()}
              aria-busy={isBusy('compartir') || undefined}
              onClick={() =>
                wait('compartir', async () => {
                  if (await shareLink(url!, inviteShareText(name))) toast('Link copiado');
                })
              }
              className="inline-flex h-12 min-w-0 items-center justify-center gap-2 rounded-[15px] bg-accent-soft px-3 text-base font-semibold whitespace-nowrap text-accent transition active:scale-[0.97] disabled:opacity-60"
            >
              <BusyIcon busy={isBusy('compartir')} icon={<Share2 aria-hidden="true" className="size-[18px]" />} className="size-[18px]" />
              Compartir link
            </button>
            <button
              type="button"
              disabled={isBusy()}
              aria-busy={isBusy('codigo') || undefined}
              onClick={() =>
                wait('codigo', async () => {
                  await run(() => navigator.clipboard.writeText(code), 'Código copiado');
                })
              }
              className="inline-flex h-12 min-w-0 items-center justify-center gap-2 rounded-[15px] bg-(--mm-field) px-3 text-base font-semibold whitespace-nowrap text-fg shadow-(--mm-field-shadow) transition active:scale-[0.97] disabled:opacity-60"
            >
              <BusyIcon busy={isBusy('codigo')} icon={<Copy aria-hidden="true" className="size-[18px]" />} className="size-[18px]" />
              Copiar código
            </button>
          </div>
        </>
      )}
      <Card className="mt-5 overflow-hidden">
        <ListRow
          leading={
            <RowIcon>
              <UserPlus className="size-5" />
            </RowIcon>
          }
          title="Buscar en la app"
          subtitle="Invita a quien ya tiene cuenta"
          onClick={league.data ? () => setInviting(true) : undefined}
        />
      </Card>
      {league.data && <InviteSheet league={league.data} lid={lid} isAdmin member open={inviting} onClose={() => setInviting(false)} onCode={setCode} />}
    </>
  );
}
