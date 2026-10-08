import { useEffect, useState, type ReactNode, type Ref } from 'react';
import { Link } from 'react-router';
import { ChevronDown, Copy, Globe, Lock, MapPin, Minus, Plus, RotateCcw, Share2, Trophy } from 'lucide-react';
import { getInviteCode } from '../../../lib/data';
import {
  ENTRY_LABEL,
  FORMAT_LABEL,
  GAMES,
  entryTypesFor,
  formatsFor,
  isIndividualMode,
  maxEntries,
  minEntries,
  modeLabel,
  type BestOf,
  type EntryType,
  type Format,
  type GameId,
  type Mode,
  type SeedingMethod,
  type TournamentSettings,
} from '../../../sports/esports';
import { GameMark } from '../../../components/esports/bits';
import { BusyIcon, useBusy } from '../../../components/busy';
import { useAction, useFeedback } from '../../../components/feedback';
import { codeInviteUrl, inviteShareText } from '../../../components/invite/logic';
import { QrCode } from '../../../components/QrCode';
import { shareLink } from '../../../components/share';
import { wizardField, wizardLabel, wizardLegend } from '../../../components/create/styles';
import { Segmented, Skeleton, cx } from '../../../components/ui';
import { ToggleRow } from '../../sports/racket/bits';
import { ChoiceChips, ScoreStepper } from '../../sports/esports/parts';
import { CHECKIN_OPTIONS, ENTRY_BLURB, FORMAT_BLURB, cleanPoints, clampMax, idRequirement, rankRequirement, subsMaxOf, withFormat, type TournamentForm } from './logic';

type SetField = <K extends keyof TournamentForm>(k: K, v: TournamentForm[K]) => void;

/** La pregunta del paso (30 px) y una línea debajo. */
export function Question({ title, sub, titleRef }: { title: string; sub?: string; titleRef?: Ref<HTMLHeadingElement> }) {
  return (
    <>
      <h1 ref={titleRef} tabIndex={-1} className="mt-7 text-[30px] leading-9 font-bold tracking-[-0.03em] outline-none">
        {title}
      </h1>
      {sub && <p className="mt-1.5 text-[15.5px] text-muted">{sub}</p>}
    </>
  );
}

/** «Más opciones»: en Lite, lo que casi no se toca va escondido (en Pro, a la vista). */
export function MoreOptions({ pro, children, label = 'Más opciones' }: { pro: boolean; children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  if (pro) return <>{children}</>;
  return (
    <div className="mt-6">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex min-h-12 w-full items-center gap-2 rounded-2xl bg-(--mm-field) px-4 text-left text-[15px] font-semibold shadow-(--mm-field-shadow) focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span className="min-w-0 flex-1">{label}</span>
        <ChevronDown aria-hidden="true" className={cx('size-5 text-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="animate-fade-up">{children}</div>}
    </div>
  );
}

/** Un selector con la flecha (la lista del teléfono), del tamaño de los campos del asistente. */
function SelectField({ id, value, onChange, options, label }: { id: string; value: string; onChange: (v: string) => void; options: readonly { value: string; label: string }[]; label?: string }) {
  return (
    <div className={cx(wizardField, 'relative pr-3')}>
      <select id={id} value={value} aria-label={label} onChange={(e) => onChange(e.target.value)} className="h-full min-w-0 flex-1 appearance-none bg-transparent pr-7 text-fg outline-none">
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

/** Una tarjeta para elegir (entrada, formato): título, una línea y el círculo de elegido. */
function ChoiceCard({ on, title, text, onClick, disabled }: { on: boolean; title: string; text: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'flex w-full items-center gap-3.5 rounded-2xl p-4 text-left transition active:scale-[0.99] disabled:opacity-50',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        on ? 'bg-accent-soft shadow-[inset_0_0_0_1.5px_var(--accent)]' : 'bg-(--mm-field) shadow-(--mm-field-shadow)',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className={cx('block text-body font-semibold', on && 'text-accent')}>{title}</span>
        <span className="mt-0.5 block text-sm text-muted">{text}</span>
      </span>
      <span aria-hidden="true" className={cx('grid size-6 shrink-0 place-items-center rounded-full', on ? 'bg-accent' : 'shadow-[inset_0_0_0_1.5px_var(--faint)]')}>
        {on && <span className="size-2.5 rounded-full bg-accent-fg" />}
      </span>
    </button>
  );
}

/** Mejor de: Segmented con 2 o 3 opciones; con 4 (1, 3, 5, 7), fichas. */
function BestOfPick({ label, value, options, onChange }: { label: string; value: BestOf; options: readonly BestOf[]; onChange: (b: BestOf) => void }) {
  const items = options.map((b) => ({ key: String(b), label: b === 1 ? 'Bo1' : `Bo${b}` }));
  return (
    <div className="mt-4">
      <p className={wizardLegend}>{label}</p>
      {items.length <= 3 ? (
        <Segmented full label={label} options={items} value={String(value)} onChange={(k) => onChange(Number(k) as BestOf)} />
      ) : (
        <ChoiceChips label={label} items={items} value={String(value)} onChange={(k) => onChange(Number(k) as BestOf)} />
      )}
    </div>
  );
}

/** Un número del asistente con − y + («Grupos», «Pasan por grupo», «Partidas por jornada»). */
function NumberRow({ label, hint, value, min, max, onChange }: { label: string; hint?: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="mt-3 flex min-h-14 items-center gap-3 rounded-2xl bg-(--mm-field) px-4 py-2 shadow-(--mm-field-shadow)">
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">{label}</span>
        {hint && <span className="block text-[13px] text-muted">{hint}</span>}
      </span>
      <ScoreStepper value={value} min={min} max={max} label={label} onChange={(n) => onChange(n ?? min)} />
    </div>
  );
}

// ---------- Paso 1: Juego y modo ----------

export function GameStep({ form, onMode }: { form: TournamentForm; onMode: (m: Mode) => void }) {
  const meta = GAMES[form.game];
  const modes = meta.modes;
  return (
    <>
      <Question title="¿De qué juego?" sub="El juego decide las reglas: cómo se anota y cuántos juegan." />
      <div className="mt-6 flex items-center gap-3.5 rounded-2xl bg-(--mm-field) p-4 shadow-(--mm-field-shadow)">
        <GameMark game={form.game} size="lg" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-semibold">{meta.name}</span>
          <span className="block text-sm text-muted">{meta.blurb}</span>
        </span>
        <Link to="/esports?crear=torneo" className="inline-flex min-h-11 shrink-0 items-center px-1 text-meta font-[550] text-accent">
          Cambiar
        </Link>
      </div>
      {modes.length > 1 && (
        <fieldset className="mt-6">
          <legend className={wizardLegend}>Modo</legend>
          {modes.length <= 3 ? (
            <Segmented full label="Modo" options={modes.map((m) => ({ key: m, label: modeLabel(m) }))} value={form.mode} onChange={onMode} />
          ) : (
            <ChoiceChips label="Modo" items={modes.map((m) => ({ key: m, label: modeLabel(m) }))} value={form.mode} onChange={onMode} />
          )}
        </fieldset>
      )}
    </>
  );
}

// ---------- Paso 2: Inscripción ----------

export function EntryStep({ form, set, pro, titleRef }: { form: TournamentForm; set: SetField; pro: boolean; titleRef?: Ref<HTMLHeadingElement> }) {
  const types = entryTypesFor(form.game, form.mode);
  const lo = minEntries(form.format);
  const hi = maxEntries(form.game, form.mode, form.format);
  const subsMax = subsMaxOf(form.game, form.mode);
  const s = form.settings;
  const setS = (patch: Partial<TournamentSettings>) => set('settings', { ...s, ...patch });
  return (
    <>
      <Question title="¿Quién se inscribe?" sub="Cuántos entran y hasta cuándo." titleRef={titleRef} />
      <fieldset className="mt-6" role="radiogroup">
        <legend className={wizardLegend}>Entrada</legend>
        {types.length === 1 ? (
          <p className="rounded-2xl bg-accent-soft px-4 py-3.5 text-[15px] text-fg-2">
            <b className="font-semibold text-accent">{ENTRY_LABEL[types[0]]}</b>
            {form.mode === '1v1' ? '. En 1 contra 1 cada quien se inscribe solo.' : isIndividualMode(form.mode) ? '. Cada quien se inscribe por su cuenta.' : `: ${ENTRY_BLURB[types[0]]}`}
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {types.map((e: EntryType) => (
              <ChoiceCard key={e} on={form.entryType === e} title={ENTRY_LABEL[e]} text={ENTRY_BLURB[e]} onClick={() => set('entryType', e)} />
            ))}
          </div>
        )}
      </fieldset>
      <p className={wizardLabel}>{`Cupo (${lo} a ${hi})`}</p>
      <div className={cx(wizardField, 'justify-between')}>
        <span className="text-muted">{isIndividualMode(form.mode) ? 'Jugadores' : 'Equipos'}</span>
        <ScoreStepper value={form.maxEntries} min={lo} max={hi} label="Cupo" onChange={(n) => set('maxEntries', clampMax(n ?? lo, form.game, form.mode, form.format))} />
      </div>
      <p className={wizardLabel}>Cierra la inscripción</p>
      <ToggleRow checked={form.closeAtStart} onChange={(v) => set('closeAtStart', v)} label="Cuando empieza el torneo" hint="Si no, elige el día y la hora." />
      {!form.closeAtStart && (
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <div className={wizardField}>
            <input type="date" aria-label="Día que cierra" value={form.closeDate} onChange={(e) => set('closeDate', e.target.value)} className="h-full min-w-0 flex-1 bg-transparent outline-none" />
          </div>
          <div className={wizardField}>
            <input type="time" aria-label="Hora que cierra" value={form.closeTime} onChange={(e) => set('closeTime', e.target.value)} className="h-full min-w-0 flex-1 bg-transparent outline-none" />
          </div>
        </div>
      )}
      <MoreOptions pro={pro}>
        <fieldset className="mt-6">
          <legend className={wizardLegend}>Check-in</legend>
          <ChoiceChips label="Check-in" items={CHECKIN_OPTIONS.map((o) => ({ key: String(o.value), label: o.label }))} value={String(form.checkin)} onChange={(k) => set('checkin', Number(k))} />
          {form.checkin > 0 && <p className="mx-1 mt-2 text-[13.5px] text-muted">{`Los inscritos confirman que van desde ${form.checkin} min antes del inicio.`}</p>}
        </fieldset>
        <div className="mt-6 flex flex-col gap-2.5">
          <ToggleRow checked={s.autoApprove} onChange={(v) => setS({ autoApprove: v })} label="Aprobar solo" hint="Quien cumple queda inscrito sin que lo revises." />
          <RequirementToggles game={form.game} settings={s} onChange={setS} />
        </div>
        {subsMax > 0 && <NumberRow label="Suplentes" hint={`Hasta ${subsMax} por equipo`} value={s.subs} min={0} max={subsMax} onChange={(n) => setS({ subs: n })} />}
      </MoreOptions>
    </>
  );
}

/**
 * «Pedir ID confirmado» y «Pedir rango verificado» (en crear y en «Editar torneo»): solo los que el juego puede
 * comprobar solo (el ID con la cuenta conectada o con Riot; el rango, solo en LoL). En los demás juegos no sale nada.
 */
export function RequirementToggles({ game, settings: s, onChange }: { game: GameId; settings: TournamentSettings; onChange: (patch: Partial<TournamentSettings>) => void }) {
  const id = idRequirement(game);
  const rank = rankRequirement(game);
  return (
    <>
      {id && <ToggleRow checked={s.requireConfirmedId} onChange={(v) => onChange({ requireConfirmedId: v })} label={id.label} hint={id.hint} />}
      {rank && <ToggleRow checked={s.requireVerifiedRank} onChange={(v) => onChange({ requireVerifiedRank: v })} label={rank.label} hint={rank.hint} />}
    </>
  );
}

// ---------- Paso 3: Formato ----------

/** Lo que se edita del formato (en el asistente y en «Editar torneo» antes de empezar). */
export interface FormatValue {
  game: GameId;
  mode: Mode;
  format: Format;
  entryType: EntryType;
  maxEntries: number;
  settings: TournamentSettings;
}

/**
 * El formato y sus ajustes (§12.7 paso 3): tarjetas de formato con una línea; según el formato, el mejor de por fase,
 * el 3.er lugar, el reinicio de la gran final, grupos y clasificados, ida y vuelta, playoffs simple o doble; EA SPORTS
 * FC: empates en grupos; SF6/TEKKEN: rondas para ganar; Smash: vidas; NBA 2K: la plataforma; BR: jornadas, partidas y la
 * tabla de puntos editable («+ puesto», puntos por kill, «Volver a los de {juego}»); y la siembra. En Lite los ajustes
 * van en «Más opciones».
 */
export function FormatFields({ value: v, onChange, pro }: { value: FormatValue; onChange: (v: FormatValue) => void; pro: boolean }) {
  const meta = GAMES[v.game];
  const formats = formatsFor(v.game);
  const s = v.settings;
  const setS = (patch: Partial<TournamentSettings>) => onChange({ ...v, settings: { ...s, ...patch } });
  const pickFormat = (f: Format) => onChange(withFormat(v, f));
  const bo = meta.bestOf;
  const draws = v.game === 'ea_fc' && (v.format === 'groups_playoffs' || v.format === 'round_robin');
  const playoffsDouble = v.format === 'double_elim' || (v.format === 'groups_playoffs' && s.playoffs === 'double');
  const playoffsSingle = v.format === 'single_elim' || (v.format === 'groups_playoffs' && s.playoffs === 'single');
  const settings = (
    <>
      {v.format !== 'br' && bo.length > 1 && (
        <>
          {(v.format === 'groups_playoffs' || v.format === 'round_robin') && (
            <BestOfPick label={v.format === 'round_robin' ? 'Mejor de (cada serie)' : 'Mejor de en grupos'} value={s.bestOf.groups} options={bo} onChange={(b) => setS({ bestOf: { ...s.bestOf, groups: b } })} />
          )}
          {v.format !== 'round_robin' && (
            <>
              <BestOfPick label={v.format === 'groups_playoffs' ? 'Mejor de en playoffs' : 'Mejor de (rondas)'} value={s.bestOf.playoffs} options={bo} onChange={(b) => setS({ bestOf: { ...s.bestOf, playoffs: b } })} />
              <BestOfPick label="Mejor de en la final" value={s.bestOf.final} options={bo} onChange={(b) => setS({ bestOf: { ...s.bestOf, final: b } })} />
            </>
          )}
        </>
      )}
      {v.format === 'groups_playoffs' && (
        <>
          <NumberRow label="Grupos" value={s.groups} min={1} max={8} onChange={(n) => setS({ groups: n })} />
          <NumberRow label="Pasan por grupo" value={s.perGroup} min={1} max={4} onChange={(n) => setS({ perGroup: n })} />
          <div className="mt-4">
            <p className={wizardLegend}>Playoffs</p>
            <Segmented
              full
              label="Playoffs"
              options={[
                { key: 'single', label: 'Eliminación simple' },
                { key: 'double', label: 'Doble' },
              ]}
              value={s.playoffs}
              onChange={(k) => setS({ playoffs: k as 'single' | 'double' })}
            />
          </div>
        </>
      )}
      <div className="mt-4 flex flex-col gap-2.5 empty:hidden">
        {playoffsSingle && <ToggleRow checked={s.thirdPlace} onChange={(x) => setS({ thirdPlace: x })} label="Partido por el 3.er lugar" />}
        {playoffsDouble && (
          <ToggleRow checked={s.bracketReset} onChange={(x) => setS({ bracketReset: x })} label="Reinicio de la gran final" hint="Si gana el que viene de perdedores, se juega otra serie." />
        )}
        {(v.format === 'groups_playoffs' || v.format === 'round_robin') && <ToggleRow checked={s.doubleRoundRobin} onChange={(x) => setS({ doubleRoundRobin: x })} label="Ida y vuelta" />}
        {draws && <ToggleRow checked={s.draws} onChange={(x) => setS({ draws: x })} label="Empates en grupos" hint="Al mejor de 1 se puede empatar (como en el fútbol)." />}
      </div>
      {meta.roundsToWin && meta.roundsToWin.options.length > 1 && (
        <div className="mt-4">
          <p className={wizardLegend}>Rondas para ganar un juego</p>
          <Segmented
            full
            label="Rondas para ganar"
            options={meta.roundsToWin.options.map((n) => ({ key: String(n), label: `${n} rondas` }))}
            value={String(s.roundsToWin ?? meta.roundsToWin.default)}
            onChange={(k) => setS({ roundsToWin: Number(k) as 2 | 3 })}
          />
        </div>
      )}
      {meta.stocks && <NumberRow label="Vidas por jugador" value={s.stocks ?? meta.stocks.default} min={meta.stocks.min} max={meta.stocks.max} onChange={(n) => setS({ stocks: n })} />}
      {meta.idInfo.platforms.length > 0 && v.game === 'nba_2k' && (
        <div className="mt-4">
          <label htmlFor="tz-plataforma" className={wizardLegend}>
            Plataforma del torneo
          </label>
          <SelectField
            id="tz-plataforma"
            value={s.platform}
            onChange={(p) => setS({ platform: p })}
            options={[{ value: '', label: 'Elige la plataforma' }, ...meta.idInfo.platforms.map((p) => ({ value: p.id, label: p.label }))]}
          />
        </div>
      )}
      {v.format === 'br' && <BrFields game={v.game} settings={s} onChange={setS} />}
      {v.format !== 'br' && (
        <div className="mt-4">
          <p className={wizardLegend}>Siembra</p>
          <Segmented<SeedingMethod>
            full
            label="Siembra"
            options={[
              { key: 'random', label: 'Al azar' },
              { key: 'rank', label: 'Por rango' },
              { key: 'manual', label: 'A mano' },
            ]}
            value={s.seeding}
            onChange={(k) => setS({ seeding: k })}
          />
        </div>
      )}
    </>
  );
  return (
    <>
      <fieldset className="mt-6" role="radiogroup">
        <legend className={wizardLegend}>Formato</legend>
        <div className="flex flex-col gap-2.5">
          {formats.map((f) => (
            <ChoiceCard key={f} on={v.format === f} title={FORMAT_LABEL[f]} text={FORMAT_BLURB[f]} onClick={() => pickFormat(f)} />
          ))}
        </div>
      </fieldset>
      <MoreOptions pro={pro} label="Ajustes del formato">
        {settings}
      </MoreOptions>
    </>
  );
}

/** Battle royale: jornadas, partidas por jornada y la tabla de puntos por puesto y por kill (editable). */
function BrFields({ game, settings: s, onChange }: { game: GameId; settings: TournamentSettings; onChange: (p: Partial<TournamentSettings>) => void }) {
  const meta = GAMES[game];
  const br = s.br ?? { placementPoints: [...(meta.br?.placementPoints ?? [])], killPoints: meta.br?.killPoints ?? 1, rounds: 1, gamesPerRound: 4 };
  const set = (patch: Partial<typeof br>) => onChange({ br: { ...br, ...patch } });
  const points = br.placementPoints;
  const setPoint = (i: number, n: number) => set({ placementPoints: cleanPoints(points.map((p, j) => (j === i ? n : p))) });
  return (
    <>
      <NumberRow label="Jornadas" value={br.rounds} min={1} max={10} onChange={(n) => set({ rounds: n })} />
      <NumberRow label="Partidas por jornada" value={br.gamesPerRound} min={1} max={12} onChange={(n) => set({ gamesPerRound: n })} />
      <div className="mt-5">
        <p className={wizardLegend}>Puntos por puesto</p>
        <div className="grid grid-cols-3 gap-2">
          {points.map((p, i) => (
            <label key={i} className="flex h-12 items-center gap-1.5 rounded-xl bg-(--mm-field) px-2.5 shadow-(--mm-field-shadow) focus-within:outline-2 focus-within:outline-accent">
              <span className="w-8 shrink-0 text-[13px] font-semibold text-muted">{`${i + 1}.º`}</span>
              <input
                inputMode="numeric"
                aria-label={`Puntos del puesto ${i + 1}`}
                value={p}
                onChange={(e) => setPoint(i, Number(e.target.value.replace(/\D/g, '') || 0))}
                className="num h-full min-w-0 flex-1 bg-transparent text-right text-[17px] font-semibold outline-none"
              />
            </label>
          ))}
        </div>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => set({ placementPoints: cleanPoints([...points, 0]) })}
            disabled={points.length >= 100}
            className="inline-flex h-11 items-center gap-1.5 rounded-full bg-accent-soft px-4 text-[15px] font-semibold text-accent disabled:opacity-50"
          >
            <Plus aria-hidden="true" className="size-4" />
            puesto
          </button>
          <button
            type="button"
            onClick={() => set({ placementPoints: points.slice(0, -1) })}
            disabled={points.length <= 1}
            className="inline-flex h-11 items-center gap-1.5 rounded-full bg-surface-2 px-4 text-[15px] font-semibold text-fg-2 disabled:opacity-50"
          >
            <Minus aria-hidden="true" className="size-4" />
            puesto
          </button>
          <button
            type="button"
            onClick={() => set({ placementPoints: [...(meta.br?.placementPoints ?? [])], killPoints: meta.br?.killPoints ?? 1 })}
            className="inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full bg-surface-2 px-4 py-2 text-left text-[15px] font-semibold text-fg-2"
          >
            <RotateCcw aria-hidden="true" className="size-4" />
            {`Volver a los de ${meta.name}`}
          </button>
        </div>
      </div>
      <NumberRow label="Puntos por kill" value={br.killPoints} min={0} max={10} onChange={(n) => set({ killPoints: n })} />
    </>
  );
}

export function FormatStep({ form, onChange, pro, titleRef }: { form: TournamentForm; onChange: (f: TournamentForm) => void; pro: boolean; titleRef?: Ref<HTMLHeadingElement> }) {
  return (
    <>
      <Question title="¿Cómo se juega?" sub="El formato y lo que cambia de cada fase." titleRef={titleRef} />
      <FormatFields value={form} onChange={(v) => onChange({ ...form, ...v })} pro={pro} />
    </>
  );
}

// ---------- Paso 4: Nombre y fecha ----------

export function NameStep({ form, set, venueHint, titleRef }: { form: TournamentForm; set: SetField; venueHint: string; titleRef?: Ref<HTMLHeadingElement> }) {
  return (
    <>
      <Question title="¿Cómo se llama?" sub="El nombre, el día y la hora del inicio." titleRef={titleRef} />
      <label htmlFor="tz-nombre" className={wizardLabel}>
        Nombre
      </label>
      <div className={wizardField}>
        <Trophy aria-hidden="true" className="size-5 shrink-0 text-muted" />
        <input
          id="tz-nombre"
          value={form.name}
          maxLength={60}
          autoComplete="off"
          placeholder={`Copa de ${GAMES[form.game].name}`}
          onChange={(e) => set('name', e.target.value)}
          className="h-full min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:font-normal placeholder:text-faint"
        />
      </div>
      <p className={wizardLabel}>Empieza</p>
      <div className="grid grid-cols-2 gap-2.5">
        <div className={wizardField}>
          <input type="date" aria-label="Día del inicio" value={form.date} onChange={(e) => set('date', e.target.value)} className="h-full min-w-0 flex-1 bg-transparent outline-none" />
        </div>
        <div className={wizardField}>
          <input type="time" aria-label="Hora del inicio" value={form.time} onChange={(e) => set('time', e.target.value)} className="h-full min-w-0 flex-1 bg-transparent outline-none" />
        </div>
      </div>
      <fieldset className="mt-6">
        <legend className={wizardLegend}>¿Quién lo ve?</legend>
        <Segmented
          full
          label="Quién lo ve"
          options={[
            { key: 'public', label: 'Público', icon: <Globe aria-hidden="true" className="size-4" /> },
            { key: 'private', label: 'Privado', icon: <Lock aria-hidden="true" className="size-4" /> },
          ]}
          value={form.visibility}
          onChange={(k) => set('visibility', k as 'public' | 'private')}
        />
        <p className="mx-1 mt-2 text-[13.5px] text-muted">{form.visibility === 'public' ? 'Sale en la página del juego y cualquiera se puede inscribir.' : 'Solo entra quien tenga el código o el link.'}</p>
      </fieldset>
      <label htmlFor="tz-sede" className={wizardLabel}>
        Sede (opcional)
      </label>
      <div className={wizardField}>
        <MapPin aria-hidden="true" className="size-5 shrink-0 text-muted" />
        <input
          id="tz-sede"
          value={form.venue}
          maxLength={80}
          placeholder={venueHint}
          onChange={(e) => set('venue', e.target.value)}
          className="h-full min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:font-normal placeholder:text-faint"
        />
      </div>
      <label htmlFor="tz-premio" className={wizardLabel}>
        Premio (opcional)
      </label>
      <div className={wizardField}>
        <input
          id="tz-premio"
          value={form.prize}
          maxLength={120}
          placeholder="RD$5,000 al campeón"
          onChange={(e) => set('prize', e.target.value)}
          className="h-full min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:font-normal placeholder:text-faint"
        />
      </div>
      <label htmlFor="tz-reglas" className={wizardLabel}>
        Reglas o aviso (opcional)
      </label>
      <textarea
        id="tz-reglas"
        value={form.announcement}
        maxLength={1000}
        rows={4}
        placeholder="Llegar 15 min antes, capturas de cada mapa…"
        onChange={(e) => set('announcement', e.target.value)}
        className="w-full resize-none rounded-2xl bg-(--mm-field) px-4 py-3 text-[16px] text-fg shadow-(--mm-field-shadow) outline-none placeholder:text-faint focus:outline-2 focus:outline-accent"
      />
    </>
  );
}

// ---------- Paso 5: Invitar ----------

export function InviteStep({ lid, name, inviteCode, titleRef }: { lid: string; name: string; inviteCode: string | null; titleRef?: Ref<HTMLHeadingElement> }) {
  const run = useAction();
  const { toast } = useFeedback();
  const { isBusy, run: wait } = useBusy<'compartir' | 'codigo'>();
  const [code, setCode] = useState<string | null | undefined>(inviteCode ?? undefined);
  const priv = inviteCode !== null;
  useEffect(() => {
    if (code !== undefined || !priv) return;
    let alive = true;
    getInviteCode(lid)
      .then((c) => alive && setCode(c))
      .catch(() => alive && setCode(null));
    return () => {
      alive = false;
    };
  }, [lid, code, priv]);
  const origin = typeof location !== 'undefined' ? location.origin : '';
  const url = priv ? (code ? codeInviteUrl(origin, code) : null) : `${origin}/l/${lid}`;
  return (
    <>
      <Question title="¡Listo! Invita a los jugadores" sub={priv ? 'Es privado: entran con el código o el QR.' : 'Mándales el link: se inscriben desde ahí.'} titleRef={titleRef} />
      {priv && code === undefined ? (
        <Skeleton className="mt-6 h-[300px] rounded-3xl" />
      ) : url ? (
        <>
          <div className="mt-6 flex flex-col items-center rounded-3xl bg-(--mm-field) px-5 pt-5 pb-4 shadow-(--mm-field-shadow)">
            <div className="rounded-2xl bg-white p-2">
              <QrCode value={url} className="size-[168px]" />
            </div>
            {priv && code ? (
              <>
                <p className="mt-4 text-sm text-muted">Código</p>
                <p className="num mt-0.5 text-[28px] leading-none font-bold tracking-[0.12em]">{code}</p>
              </>
            ) : (
              <p className="mt-4 max-w-full truncate text-sm text-muted">{url.replace(/^https?:\/\//, '')}</p>
            )}
          </div>
          <div className={cx('mt-3 grid gap-2.5', priv && code ? 'grid-cols-2' : 'grid-cols-1')}>
            <button
              type="button"
              disabled={isBusy()}
              aria-busy={isBusy('compartir') || undefined}
              onClick={() =>
                wait('compartir', async () => {
                  if (await shareLink(url, inviteShareText(name))) toast('Link copiado');
                })
              }
              className="inline-flex h-12 min-w-0 items-center justify-center gap-2 rounded-[15px] bg-accent-soft px-3 text-base font-semibold whitespace-nowrap text-accent transition active:scale-[0.97] disabled:opacity-60"
            >
              <BusyIcon busy={isBusy('compartir')} icon={<Share2 aria-hidden="true" className="size-[18px]" />} className="size-[18px]" />
              Compartir link
            </button>
            {priv && code && (
              <button
                type="button"
                disabled={isBusy()}
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
            )}
          </div>
        </>
      ) : (
        <p className="mt-6 rounded-2xl bg-surface-2 px-4 py-3.5 text-sm text-muted">El código se ve en el torneo, en «Invitar».</p>
      )}
    </>
  );
}
