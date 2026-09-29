import { useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Baby, CalendarRange, Camera, CircleHelp, Clock, Globe, ImagePlus, ImageUp, Lock, X } from 'lucide-react';
import { displayName, useAuth } from '../lib/auth';
import { createLeague, createTournament, type LeagueInput } from '../lib/data';
import { toIsoDate } from '../lib/format';
import type { CompressedLogo } from '../lib/image';
import { LeagueContext } from '../lib/league';
import { logoErrorText, prepareLogo, uploadLeagueLogo } from '../lib/logos';
import { formatSchedule, isCanonicalSchedule, parseSchedule, WEEKDAY_SHORT, WEEKDAYS } from '../lib/schedule';
import type { League, LeagueKind, Visibility } from '../lib/types';
import { DEFAULT_SPORT, getSport, leagueSport, sportMeta } from '../sports/registry';
import { preselectedSport, useSportStatus } from '../sports/status';
import type { SportId } from '../sports/types';
import { SportPicker } from '../pages/sports/SportPicker';
import { useAction, useFeedback } from './feedback';
import { Button, Field, Input, Modal, Select, cx } from './ui';
import { DEFAULT_TZ, minorsLocked, timezoneOptions, tzOffset, withMinors } from './league/logic';

/**
 * Lo que se manda al crear: los datos del formulario más el deporte (create_league / create_tournament
 * reciben `p_sport`). El deporte no va en `updateLeague`: no se cambia después de crear.
 */
export type NewLeagueInput = LeagueInput & { sport: SportId };

const empty = (contactName: string, kind: LeagueKind): LeagueInput => ({
  name: '',
  kind,
  visibility: kind === 'torneo' ? 'public' : 'private',
  venue: '',
  schedule: '',
  // La temporada es opcional: se activa en el formulario.
  seasonStart: '',
  seasonEnd: '',
  contactName,
  contactPhone: '',
  requirePhoto: true,
  hasMinors: false,
  tz: DEFAULT_TZ,
});

export const leagueInput = (l: League): LeagueInput => ({
  name: l.name,
  kind: l.kind ?? 'liga',
  visibility: l.visibility,
  venue: l.venue ?? '',
  schedule: l.schedule ?? '',
  seasonStart: l.seasonStart ?? '',
  seasonEnd: l.seasonEnd ?? '',
  contactName: l.contactName ?? '',
  contactPhone: l.contactPhone ?? '',
  requirePhoto: l.requirePhoto ?? true,
  hasMinors: !!l.hasMinors,
  tz: l.tz || DEFAULT_TZ,
});

/** Lo que cambia con «Liga con menores» (lo explica el formulario antes de activarla). */
const MINORS_RULES = [
  'La liga queda privada: solo entra quien tenga la invitación.',
  'Los menores no tienen cuenta: los registra un admin, con el permiso de su papá, mamá o tutor.',
  'Su año de nacimiento y sus datos solo los ven los admins; los demás ven su nombre y su categoría.',
  'Sin fotos, sin «Me gusta» y sin comentarios en toda la liga.',
  'Sin link para anotar: a cada anotador se le invita por su @usuario. Quien entró con un link solo para anotar sale de la liga.',
];

/**
 * Formulario de la liga (o del torneo sin liga): crear (queda como dueño) o editar sus datos.
 * El deporte se muestra arriba: al crear se puede volver a elegir (`onChangeSport`); al editar es solo
 * lectura (sin `sport`, se toma el de la liga abierta).
 * Abajo, la zona horaria (recordatorios y el «hoy» de la liga) y «Liga con menores», que el admin enciende y no
 * puede apagar (solo el superadmin, y la base exige que no quede ningún menor). Un torneo nuevo no las trae
 * (create_tournament no las recibe): se cambian después en sus datos.
 */
export function LeagueForm({
  id,
  initial,
  onSubmit,
  withDate,
  sport: sportProp,
  creating,
  onChangeSport,
  logo,
}: {
  id: string;
  initial: LeagueInput;
  onSubmit: (data: LeagueInput, date: string) => void;
  /** Liga nueva: el selector del logo (va debajo del nombre). */
  logo?: ReactNode;
  /** Torneo nuevo: pide la fecha del torneo. */
  withDate?: boolean;
  /** Deporte de la liga. Por defecto, el de la liga abierta (editar) o el boliche. */
  sport?: string;
  /** Liga nueva: el deporte todavía se puede cambiar (si hay de dónde elegir). */
  creating?: boolean;
  onChangeSport?: () => void;
}) {
  const ctx = useContext(LeagueContext);
  const { isSuper } = useAuth();
  const { confirm } = useFeedback();
  const sport = sportProp ?? (ctx ? leagueSport(ctx.league) : DEFAULT_SPORT);
  const meta = sportMeta(sport);
  const [form, setForm] = useState(initial);
  const [date, setDate] = useState(() => toIsoDate(new Date()));
  const [hasSeason, setHasSeason] = useState(() => !!(initial.seasonStart || initial.seasonEnd));
  useEffect(() => {
    setForm(initial);
    setHasSeason(!!(initial.seasonStart || initial.seasonEnd));
  }, [initial]);
  const isTournament = form.kind === 'torneo';
  const set = <K extends keyof LeagueInput>(k: K, v: LeagueInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  // Menores y zona horaria: al editar, y al crear una liga (el torneo nuevo no las lleva).
  const advanced = !withDate;
  const savedMinors = !creating && !!initial.hasMinors;
  const minorsFixed = minorsLocked(savedMinors, isSuper);
  const minors = !!form.hasMinors;

  function toggleSeason(on: boolean) {
    setHasSeason(on);
    if (!on) setForm((f) => ({ ...f, seasonStart: '', seasonEnd: '' }));
    else if (!form.seasonStart) {
      // Arranca hoy y termina el 31 de diciembre; se puede cambiar.
      const today = toIsoDate(new Date());
      setForm((f) => ({ ...f, seasonStart: today, seasonEnd: `${today.slice(0, 4)}-12-31` }));
    }
  }

  /** Con menores: privada y sin foto obligatoria (la base no deja otra cosa). */
  function setMinors(on: boolean) {
    setForm((f) => withMinors({ ...f, hasMinors: on }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    // Encenderla en una liga que ya existe no tiene vuelta atrás para el admin: se confirma.
    if (!creating && minors && !initial.hasMinors) {
      const ok = await confirm({
        title: '¿Activar «Liga con menores»?',
        message: `${isTournament ? 'El torneo queda privado' : 'La liga queda privada'}, sin fotos ni comentarios, y después no la puedes apagar tú. Los links para anotar dejan de servir y quien entró con uno solo para anotar sale ${isTournament ? 'del torneo' : 'de la liga'}.`,
        confirmText: 'Activar y guardar',
      });
      if (!ok) return;
    }
    const data = withMinors({
      ...form,
      // La foto del marcador (y su lectura con IA) es solo del boliche.
      requirePhoto: meta?.photos === false ? false : form.requirePhoto,
      name: form.name.trim(),
      venue: form.venue.trim(),
      schedule: form.schedule.trim(),
      seasonStart: hasSeason ? form.seasonStart : '',
      seasonEnd: hasSeason ? form.seasonEnd : '',
      contactName: form.contactName.trim(),
      contactPhone: form.contactPhone.replace(/[^\d+]/g, ''),
    });
    // El torneo nuevo no manda menores ni zona (create_tournament no las recibe).
    onSubmit(advanced ? data : { ...data, hasMinors: undefined, tz: undefined }, date);
  }

  return (
    <form id={id} onSubmit={submit} className="grid grid-cols-2 gap-4">
      <SportRow sport={sport} creating={creating} onChange={onChangeSport} />
      <Field label={isTournament ? 'Nombre del torneo' : 'Nombre de la liga'} className={withDate ? '' : 'col-span-2'}>
        <Input
          required
          maxLength={60}
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder={isTournament ? 'Copa de verano' : 'Liga de los martes'}
        />
      </Field>
      {withDate && (
        <Field label="Fecha del torneo">
          <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      )}
      {logo}
      <fieldset className="col-span-2 grid grid-cols-2 gap-2">
        <legend className="mb-1.5 text-xs font-medium text-muted">¿Quién puede {isTournament ? 'verlo' : 'verla'}?</legend>
        <Choice
          active={form.visibility === 'private'}
          onClick={() => set('visibility', 'private' as Visibility)}
          icon={<Lock className="size-4" />}
          title="Privada"
          text="Solo con invitación (link, QR o código)."
        />
        <Choice
          active={form.visibility === 'public'}
          onClick={() => set('visibility', 'public' as Visibility)}
          icon={<Globe className="size-4" />}
          title="Pública"
          text={minors ? 'Con menores no se puede.' : isTournament ? 'Cualquiera lo ve y se une.' : 'Cualquiera la ve y se une.'}
          disabled={minors}
        />
      </fieldset>
      <Field label={meta?.venue ?? 'Lugar'} className="col-span-2">
        <Input maxLength={80} value={form.venue} onChange={(e) => set('venue', e.target.value)} placeholder={meta?.venueHint ?? 'Dónde juegan'} />
      </Field>
      {!isTournament && (
        <>
          <SchedulePicker value={form.schedule} onChange={(v) => set('schedule', v)} />
          <label className="col-span-2 flex cursor-pointer items-center gap-3 rounded-xl border border-line p-3">
            <input
              type="checkbox"
              className="size-4 accent-[var(--accent)]"
              checked={hasSeason}
              onChange={(e) => toggleSeason(e.target.checked)}
            />
            <span className="flex-1 text-sm">
              <span className="flex items-center gap-1.5 font-medium">
                <CalendarRange className="size-4 text-accent" /> Temporada con fechas
              </span>
              <span className="text-muted">Opcional: cuándo empieza y termina la liga.</span>
            </span>
          </label>
          {hasSeason && (
            <>
              <Field label="Temporada desde">
                <Input type="date" required value={form.seasonStart} onChange={(e) => set('seasonStart', e.target.value)} />
              </Field>
              <Field label="Hasta">
                <Input
                  type="date"
                  required
                  min={form.seasonStart || undefined}
                  value={form.seasonEnd}
                  onChange={(e) => set('seasonEnd', e.target.value)}
                />
              </Field>
            </>
          )}
        </>
      )}
      <Field label="Contacto para torneos">
        <Input maxLength={60} value={form.contactName} onChange={(e) => set('contactName', e.target.value)} placeholder="Nombre" />
      </Field>
      <Field label="WhatsApp">
        <Input type="tel" inputMode="tel" maxLength={20} value={form.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} placeholder="809 555 0000" />
      </Field>
      {meta?.photos !== false && !minors && (
        <label className="col-span-2 flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-[var(--accent)]"
            checked={form.requirePhoto}
            onChange={(e) => set('requirePhoto', e.target.checked)}
          />
          <span className="text-sm">
            <span className="flex items-center gap-1.5 font-medium">
              <Camera className="size-4 text-accent" /> Exigir foto del marcador
            </span>
            <span className="text-muted">
              {form.requirePhoto
                ? 'Un juego cuenta en promedios y clasificaciones cuando se verifica con la foto. Si un jugador lo envía sin foto, el admin decide si lo acepta.'
                : 'Los juegos que anota un admin cuentan de una; los que suben los jugadores igual se aprueban.'}
            </span>
          </span>
        </label>
      )}
      {advanced && (
        <Field label="Zona horaria" className="col-span-2" hint="Con esta hora salen los recordatorios, los avisos y el «hoy» de la liga.">
          <Select value={form.tz || DEFAULT_TZ} onChange={(e) => set('tz', e.target.value)}>
            {timezoneOptions(form.tz).map((z) => {
              const off = tzOffset(z.id);
              return (
                <option key={z.id} value={z.id}>
                  {z.label}
                  {off ? ` (${off})` : ''}
                </option>
              );
            })}
          </Select>
        </Field>
      )}
      {advanced && (
        <MinorsToggle on={minors} locked={minorsFixed} canTurnOff={savedMinors && isSuper} tournament={isTournament} onChange={setMinors} />
      )}
    </form>
  );
}

/** «Liga con menores», con lo que cambia explicado antes de activarla. */
function MinorsToggle({
  on,
  locked,
  canTurnOff,
  tournament,
  onChange,
}: {
  on: boolean;
  locked: boolean;
  canTurnOff: boolean;
  tournament: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className={cx('col-span-2 flex flex-col gap-2 rounded-xl border p-3', on ? 'border-accent bg-accent-soft/40' : 'border-line')}>
      <label className={cx('flex items-start gap-3', locked ? 'cursor-not-allowed' : 'cursor-pointer')}>
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-[var(--accent)]"
          checked={on}
          disabled={locked}
          onChange={(e) => onChange(e.target.checked)}
          aria-describedby="menores-reglas"
        />
        <span className="text-sm">
          <span className="flex items-center gap-1.5 font-medium">
            <Baby className="size-4 text-accent" /> {tournament ? 'Torneo con menores' : 'Liga con menores'}
          </span>
          <span className="text-muted">Para clubes con niños y jóvenes: natación, escuelitas, juveniles.</span>
        </span>
      </label>
      <div id="menores-reglas" className="ml-7 text-xs text-muted">
        {on ? (
          <ul className="flex list-disc flex-col gap-1 pl-4">
            {MINORS_RULES.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        ) : (
          <p>Al activarla queda privada, sin fotos ni comentarios, y a los menores los registra un admin (no tienen cuenta).</p>
        )}
        {locked ? (
          <p className="mt-2 flex items-start gap-1.5 font-medium text-fg">
            <Lock className="mt-0.5 size-3.5 shrink-0" /> Ya está activada. Solo el equipo de MatchMate la puede apagar, y solo si no queda ningún menor.
          </p>
        ) : canTurnOff ? (
          <p className="mt-2 font-medium text-fg">Como superadmin la puedes apagar, solo si no queda ningún menor en la liga.</p>
        ) : (
          on && <p className="mt-2 font-medium text-fg">Una vez guardada, no la puedes apagar tú.</p>
        )}
      </div>
    </div>
  );
}

/** El deporte, arriba del formulario: al crear, con «Cambiar» (si hay otros); al editar, fijo. */
function SportRow({ sport, creating, onChange }: { sport: string; creating?: boolean; onChange?: () => void }) {
  const meta = sportMeta(sport);
  const Icon = meta?.icon ?? CircleHelp;
  return (
    <div className="col-span-2 flex items-center gap-3 rounded-xl border border-line p-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1 text-sm">
        <span className="block text-xs text-muted">Deporte</span>
        <span className="block truncate font-semibold">{meta?.label ?? 'Otro deporte'}</span>
      </span>
      {creating && onChange ? (
        <button type="button" onClick={onChange} className="rounded-lg px-2 py-1 text-sm font-medium text-accent hover:bg-surface-2">
          Cambiar
        </button>
      ) : (
        !creating && (
          <span className="flex items-center gap-1 text-xs text-muted">
            <Lock className="size-3.5" /> No se cambia
          </span>
        )
      )}
    </div>
  );
}

/** Días de la semana (se pueden varios) + la hora con el selector de hora del teléfono. */
function SchedulePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [days, setDays] = useState<number[]>(() => parseSchedule(value).days);
  const [time, setTime] = useState(() => parseSchedule(value).time);
  // Texto escrito a mano antes del selector: se muestra tal cual hasta que se elija algo.
  const [legacy, setLegacy] = useState(() => (value.trim() && !isCanonicalSchedule(value) ? value.trim() : ''));
  // Si cambian los datos de afuera (otra liga, reabrir el formulario), se vuelven a leer.
  useEffect(() => {
    const parsed = parseSchedule(value);
    if (formatSchedule(parsed.days, parsed.time) !== formatSchedule(days, time)) {
      setDays(parsed.days);
      setTime(parsed.time);
    }
    if (value !== formatSchedule(days, time)) setLegacy(value.trim() && !isCanonicalSchedule(value) ? value.trim() : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function update(nextDays: number[], nextTime: string) {
    setDays(nextDays);
    setTime(nextTime);
    setLegacy('');
    onChange(formatSchedule(nextDays, nextTime));
  }

  const toggle = (d: number) => update(days.includes(d) ? days.filter((x) => x !== d) : [...days, d], time);
  const summary = formatSchedule(days, time);

  return (
    <fieldset className="col-span-2 flex flex-col gap-2">
      <legend className="mb-1.5 text-xs font-medium text-muted">Cuándo juegan</legend>
      <div className="grid grid-cols-7 gap-1.5" role="group" aria-label="Días">
        {WEEKDAY_SHORT.map((short, d) => {
          const on = days.includes(d);
          return (
            <button
              key={short}
              type="button"
              onClick={() => toggle(d)}
              aria-pressed={on}
              aria-label={WEEKDAYS[d]}
              title={WEEKDAYS[d]}
              className={cx(
                'h-10 rounded-xl border text-sm font-semibold transition active:scale-95',
                on ? 'border-accent bg-accent text-accent-fg' : 'border-line text-muted hover:bg-surface-2',
              )}
            >
              {short}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <label className="relative flex-1">
          <Clock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <Input
            type="time"
            aria-label="Hora"
            value={time}
            onChange={(e) => update(days, e.target.value)}
            className="pl-9"
          />
        </label>
        {(days.length > 0 || time) && (
          <button type="button" onClick={() => update([], '')} className="px-2 text-xs font-medium text-muted hover:text-fg">
            Borrar
          </button>
        )}
      </div>
      <span className="text-xs text-muted">
        {legacy
          ? `Ahora dice: “${legacy}”. Si eliges días u hora, se reemplaza.`
          : summary
            ? `Se verá así: ${summary}`
            : 'Elige el día (o los días) y la hora.'}
      </span>
    </fieldset>
  );
}

function Choice({
  active,
  onClick,
  icon,
  title,
  text,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  title: string;
  text: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      disabled={disabled}
      className={cx(
        'flex flex-col items-start gap-1 rounded-xl border p-3 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-50',
        active ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2',
      )}
    >
      <span className={cx('flex items-center gap-1.5 font-semibold', active && 'text-accent')}>
        {icon} {title}
      </span>
      <span className="text-xs text-muted">{text}</span>
    </button>
  );
}

/**
 * «Logo (opcional)» al crear: se elige la imagen, se recorta al cuadrado del centro y se comprime de una (así un
 * archivo que no sirve se avisa aquí); se sube después de crear la liga (src/lib/logos.ts).
 */
export function LogoPicker({ value, onChange }: { value: CompressedLogo | null; onChange: (logo: CompressedLogo | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
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
    setBusy(true);
    setError(null);
    try {
      onChange(await prepareLogo(file));
    } catch (e) {
      setError(logoErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="col-span-2 flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted">Logo (opcional)</span>
      <div className="flex items-center gap-3 rounded-xl border border-line p-3">
        {preview ? (
          <img src={preview} alt="" className="size-14 shrink-0 rounded-2xl border border-line bg-surface-2 object-cover" />
        ) : (
          <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-dashed border-line text-muted" aria-hidden="true">
            <ImagePlus className="size-6" />
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <Button className="h-11" loading={busy} onClick={() => input.current?.click()} icon={<ImageUp className="size-4" />}>
            {busy ? 'Preparando…' : value ? 'Cambiar' : 'Elegir logo'}
          </Button>
          {value && !busy && (
            <Button className="h-11" variant="ghost" onClick={() => onChange(null)} icon={<X className="size-4" />}>
              Quitar
            </Button>
          )}
        </div>
      </div>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files?.[0])} />
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : (
        <span className="text-xs text-muted">Se recorta al cuadrado del centro. Es una imagen pública; la puedes cambiar después en Admin.</span>
      )}
    </div>
  );
}

/**
 * Deporte que sale marcado al abrir «Crear»: el pedido (p. ej. «Crear liga de pádel» o el deporte en que estás) si
 * la cuenta lo puede crear; si no, el boliche o el primero que pueda. `direct`: ya viene elegido y se va de una a los
 * datos (con «Cambiar» arriba si hay otros).
 */
export function initialSport(creatable: readonly SportId[], wanted?: SportId | null): { sport: SportId; direct: boolean } {
  if (wanted && creatable.includes(wanted)) return { sport: wanted, direct: true };
  return { sport: preselectedSport(creatable) ?? DEFAULT_SPORT, direct: false };
}

/**
 * Crear una liga o un torneo sin liga, en dos pasos: el deporte (si puede elegir entre varios; el boliche
 * sale marcado) y los datos. Los deportes en beta solo le salen al superadmin (la base igual lo impone).
 * Con `sport` (p. ej. «Crear liga de pádel» o el deporte en que estás) ese sale marcado y se va de una a los datos.
 * Devuelve a dónde ir después.
 */
export function LeagueFormModal({
  open,
  onClose,
  kind,
  sport: wanted,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  kind: LeagueKind;
  /** Deporte que sale marcado (si la cuenta lo puede crear). */
  sport?: SportId | null;
  /** Ruta de la liga o del torneo recién creado. */
  onSaved?: (to: string) => void;
}) {
  const auth = useAuth();
  const run = useAction();
  const { toast } = useFeedback();
  const sports = useSportStatus(auth.isSuper);
  const [busy, setBusy] = useState(false);
  const [logo, setLogo] = useState<CompressedLogo | null>(null);
  const [initial, setInitial] = useState<LeagueInput>(() => empty(displayName(auth), kind));
  const [sport, setSport] = useState<SportId>(DEFAULT_SPORT);
  const [step, setStep] = useState<'sport' | 'form'>('form');
  // Ya eligió el deporte a mano: lo que llegue después de la base (qué deportes puede crear) no lo cambia.
  const touched = useRef(false);
  // Hay de dónde elegir: más de un deporte, o el fútbol con sus dos modalidades.
  const canChoose = sports.creatable.length > 1;
  useEffect(() => {
    if (!open) return;
    touched.current = false;
    setInitial(empty(displayName(auth), kind));
    setLogo(null);
    const pick = initialSport(sports.creatable, wanted);
    setSport(pick.sport);
    setStep(canChoose && !pick.direct ? 'sport' : 'form');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind, wanted]);
  // Qué puede crear llega de la base un momento después (la primera vez): si no tocó nada, se vuelve a marcar.
  const creatableKey = sports.creatable.join(',');
  useEffect(() => {
    if (!open || touched.current) return;
    const pick = initialSport(sports.creatable, wanted);
    setSport(pick.sport);
    if (pick.direct) setStep('form');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creatableKey]);
  const chooseSport = (id: SportId) => {
    touched.current = true;
    setSport(id);
  };
  const isTournament = kind === 'torneo';

  async function save(data: LeagueInput, date: string) {
    if (!auth.user) return;
    const owner = { uid: auth.user.uid, name: displayName(auth) };
    const input: NewLeagueInput = { ...data, sport };
    setBusy(true);
    const made = isTournament
      ? await run(async () => {
          const { lid, eid } = await createTournament(owner, input, date);
          // Equipos (baloncesto, fútbol, sala): el torneo se arma desde su inicio (equipos y relámpago); el evento
          // que crea la base es solo el contenedor. Los demás van a inscribir en su evento.
          return { lid, to: getSport(sport).family === 'team' ? `/l/${lid}` : `/l/${lid}/e/${eid}?tab=inscritos` };
        }, 'Torneo creado')
      : await run(async () => {
          const lid = await createLeague(owner, input);
          return { lid, to: `/l/${lid}/admin?tab=liga` };
        }, 'Liga creada');
    // El logo, después de crearla y si se puede: si falla, la liga igual queda creada.
    if (made && logo) {
      try {
        await uploadLeagueLogo(made.lid, logo);
      } catch (e) {
        console.warn('[logo]', e);
        toast(
          isTournament
            ? 'El torneo se creó, pero el logo no se pudo subir. Súbelo desde Admin › Datos.'
            : 'La liga se creó, pero el logo no se pudo subir. Súbelo desde Admin › Liga.',
          'error',
        );
      }
    }
    setBusy(false);
    if (made) {
      onClose();
      onSaved?.(made.to);
    }
  }

  const meta = getSport(sport);
  const choosing = step === 'sport';
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isTournament ? 'Nuevo torneo (sin liga)' : 'Nueva liga'}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          {choosing ? (
            <Button variant="primary" onClick={() => setStep('form')}>
              Siguiente
            </Button>
          ) : (
            <Button variant="primary" type="submit" form="league-form" loading={busy}>
              {isTournament ? 'Crear torneo' : 'Crear liga'}
            </Button>
          )}
        </>
      }
    >
      {choosing && <SportPicker groups={sports.choices} status={sports.status} value={sport} onChange={chooseSport} />}
      {/* El formulario sigue montado mientras se elige el deporte: lo escrito no se pierde al volver. */}
      <div hidden={choosing}>
        {isTournament && (
          <p className="mb-4 rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">
            Un torneo suelto, con sus propios jugadores, equipos y clasificación. Si es de tu liga, créalo mejor dentro de la liga (Eventos → Nuevo).
          </p>
        )}
        {!meta.ready && (
          <p className="mb-4 rounded-xl bg-warn-soft px-3 py-2 text-xs text-warn">
            Las pantallas de {meta.lower} llegan en la próxima fase: {isTournament ? 'el torneo se crea ya y queda listo' : 'la liga se crea ya y queda lista'} para cuando lleguen.
          </p>
        )}
        <LeagueForm
          id="league-form"
          initial={initial}
          onSubmit={save}
          withDate={isTournament}
          sport={sport}
          creating
          logo={<LogoPicker value={logo} onChange={setLogo} />}
          onChangeSport={
            canChoose
              ? () => {
                  touched.current = true;
                  setStep('sport');
                }
              : undefined
          }
        />
      </div>
    </Modal>
  );
}
