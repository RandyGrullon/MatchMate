import { useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, Gift, Search, Sparkles, Undo2, Users } from 'lucide-react';
import { Insignia, badgeLabel, normalizeSearch } from '../../../badges/visual';
import { usePlayers } from '../../../lib/data';
import { awardLeagueBadge, revokeLeagueBadgeAward, LIMIT_OF, MAX_AWARD_PLAYERS, type GiveResult, type LeagueBadge, type MadeAward } from '../../../lib/data/leagueBadges';
import { useSeasonTeams } from '../../../lib/data/seasonTeams';
import { useLeagueCtx } from '../../../lib/league';
import type { Player } from '../../../lib/types';
import { leagueSport } from '../../../sports/registry';
import { useFeedback } from '../../feedback';
import { Badge, Button, Card, Input, LoadError, Modal, Spinner, Textarea, cx } from '../../ui';
import { BADGE_TEXT_MAX, badgeTextError, cleanBadgeText, textLength } from '../text';
import { LIMIT_INFO, dayText, givenText, makerErrorText, namesText, periodChoices, quotaFullText, quotaLeft, slotKey, type PeriodChoice } from './design';
import { designLook } from './look';
import { Chip, Counter, Toggle } from './parts';
import type { Suggestion, SuggestOutcome } from './suggest';
import { useBadgeSuggestions } from './useSuggestions';

type Step = 'cual' | 'quien' | 'detalles' | 'vista' | 'listo';

export interface GiveBadgeProps {
  /** null = cerrado. */
  open: boolean;
  /** El diseño a dar; sin él, primero se elige cuál. */
  badge: LeagueBadge | null;
  /** Los diseños activos de la liga (para elegir) y los otorgamientos (cupos y quién ya la tiene). */
  designs: readonly LeagueBadge[];
  awards: readonly MadeAward[];
  onClose: () => void;
}

/**
 * «Dar insignia» (docs/insignias.md §5.6): a quién (con «Sugerencias de la app»), el periodo, la división y una nota,
 * «Así la verá» y el aviso con «Deshacer». Con una insignia por equipo se elige el equipo o la pareja y su plantilla
 * sale marcada. Nadie se la da a sí mismo; los cupos los pone la base.
 */
export function GiveBadge({ open, badge, designs, awards, onClose }: GiveBadgeProps) {
  return (
    <Modal open={open} onClose={onClose} title={badge ? `Dar “${badge.name}”` : 'Dar insignia'} wide>
      {open && <GiveFlow key={badge?.id ?? 'elegir'} initial={badge} designs={designs} awards={awards} onClose={onClose} />}
    </Modal>
  );
}

function GiveFlow({ initial, designs, awards, onClose }: { initial: LeagueBadge | null; designs: readonly LeagueBadge[]; awards: readonly MadeAward[]; onClose: () => void }) {
  const { lid, league, myPlayerId } = useLeagueCtx();
  const { toast } = useFeedback();
  const sport = leagueSport(league);
  const players = usePlayers(lid);
  const choices = useMemo(() => periodChoices(league, Date.now()), [league]);
  const [badge, setBadge] = useState<LeagueBadge | null>(initial);
  const [step, setStep] = useState<Step>(initial ? 'quien' : 'cual');
  const [picked, setPicked] = useState<string[]>([]);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [period, setPeriod] = useState(initial?.periodText ?? '');
  const [division, setDivision] = useState('');
  const [note, setNote] = useState('');
  const [notify, setNotify] = useState(!league.hasMinors);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GiveResult | null>(null);
  const teams = useSeasonTeams(badge?.byTeam ? lid : undefined);
  const suggestions = useBadgeSuggestions({ template: badge?.template ?? null, byTeam: badge?.byTeam ?? false, periodText: badge?.periodText ?? '', enabled: step === 'quien' });

  const byId = useMemo(() => new Map(players.data.map((p) => [p.id, p] as const)), [players.data]);
  const nameOf = (id: string) => byId.get(id)?.name ?? 'Jugador';
  const cleanPeriod = cleanBadgeText(period).toUpperCase();
  const cleanDivision = cleanBadgeText(division);
  // Quiénes ya la tienen vigente con este periodo y división (no se les puede volver a dar).
  const holders = useMemo(
    () =>
      new Set(
        awards
          .filter((a) => badge && a.badgeId === badge.id && !a.revokedAt && slotKey(a.period) === slotKey(cleanPeriod) && slotKey(a.division) === slotKey(cleanDivision))
          .map((a) => a.playerId),
      ),
    [awards, badge, cleanPeriod, cleanDivision],
  );
  const left = badge ? quotaLeft(badge, awards, cleanPeriod, cleanDivision) : 0;
  const team = teams.data.find((t) => t.id === teamId) ?? null;

  const free = (id: string) => id !== myPlayerId && !holders.has(id);
  const pick = (ids: readonly string[], team: string | null = teamId) => {
    setTeamId(team);
    setPicked(ids.filter(free).slice(0, MAX_AWARD_PLAYERS));
  };
  /** Una sugerencia: un equipo reemplaza la selección por su plantilla; un jugador se suma (o se quita si ya estaba). */
  const suggest = (s: Suggestion) => {
    if (badge?.byTeam && s.teamId) return pick(s.playerIds, s.teamId);
    setPicked((p) =>
      s.playerIds.every((id) => p.includes(id)) ? p.filter((id) => !s.playerIds.includes(id)) : [...p, ...s.playerIds.filter((id) => free(id) && !p.includes(id))].slice(0, MAX_AWARD_PLAYERS),
    );
  };
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX_AWARD_PLAYERS ? p : [...p, id]));

  const textErrors = { period: badgeTextError(period), division: badgeTextError(division), note: badgeTextError(note) };
  const detailsOk =
    !textErrors.period &&
    !textErrors.division &&
    !textErrors.note &&
    textLength(cleanPeriod) <= BADGE_TEXT_MAX.period &&
    textLength(cleanDivision) <= BADGE_TEXT_MAX.division &&
    textLength(cleanBadgeText(note)) <= BADGE_TEXT_MAX.note;

  // El cupo que se ve en el teléfono (la base decide igual): con una por equipo, el equipo cuenta 1.
  const overQuota = badge ? (badge.byTeam ? left < 1 && !awards.some((a) => a.badgeId === badge.id && !a.revokedAt && a.teamId === teamId && a.period === cleanPeriod && a.division === cleanDivision) : picked.length > left) : false;
  const quotaText = badge ? quotaFullText({ name: badge.name, limitKind: badge.limitKind, period: cleanPeriod, holders: [...holders].map(nameOf) }) : '';

  async function give() {
    if (!badge || busy) return;
    if (overQuota) {
      setError(quotaText);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await awardLeagueBadge({ badge, players: picked, teamId: badge.byTeam ? teamId : null, period: cleanPeriod, division: cleanDivision, note, notify: notify && !league.hasMinors });
      setResult(res);
      setStep('listo');
    } catch (e) {
      console.error(e);
      setError(makerErrorText(e, { action: 'dar', name: badge.name, limitKind: badge.limitKind, period: cleanPeriod, holders: [...holders].map(nameOf) }));
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    if (!result || busy) return;
    setBusy(true);
    try {
      await revokeLeagueBadgeAward(lid, result.awards.map((a) => a.id));
      toast('Deshecho: se la quitamos');
      onClose();
    } catch (e) {
      console.error(e);
      setError(makerErrorText(e, { action: 'quitar' }));
    } finally {
      setBusy(false);
    }
  }

  const back = (to: Step) => () => {
    setError(null);
    setStep(to);
  };

  let body: ReactNode;
  let footer: ReactNode;
  if (step === 'cual' || !badge) {
    body = (
      <PickDesign
        designs={designs}
        sport={sport}
        onPick={(b) => {
          setBadge(b);
          setPeriod(b.periodText);
          setPicked([]);
          setTeamId(null);
          setStep('quien');
        }}
      />
    );
    footer = <Button className="min-h-11" onClick={onClose}>Cancelar</Button>;
  } else if (step === 'quien') {
    body = (
      <WhoStep
        badge={badge}
        players={players.data}
        loading={players.loading}
        error={players.error}
        picked={picked}
        onToggle={toggle}
        onSuggestion={suggest}
        myPlayerId={myPlayerId}
        holders={holders}
        left={left}
        period={cleanPeriod}
        teams={badge.byTeam ? teams.data : null}
        teamsLoading={teams.loading}
        teamsError={teams.error}
        teamId={teamId}
        onTeam={(id) => {
          const t = teams.data.find((x) => x.id === id);
          pick(t ? t.roster.map((r) => r.playerId) : [], id);
        }}
        suggestions={suggestions.outcome}
        suggestionsLoading={suggestions.loading}
      />
    );
    footer = (
      <>
        <Button className="min-h-11" onClick={onClose}>Cancelar</Button>
        <Button
          className="min-h-11"
          variant="primary"
          icon={<ArrowRight className="size-4" />}
          disabled={!picked.length || (badge.byTeam && !teamId)}
          onClick={() => setStep('detalles')}
        >
          Siguiente
        </Button>
      </>
    );
  } else if (step === 'detalles') {
    body = (
      <DetailsStep
        badge={badge}
        choices={choices}
        period={period}
        onPeriod={setPeriod}
        division={division}
        onDivision={setDivision}
        note={note}
        onNote={setNote}
        notify={notify}
        onNotify={setNotify}
        minors={!!league.hasMinors}
        errors={textErrors}
        withAccount={picked.filter((id) => byId.get(id)?.uid).length}
      />
    );
    footer = (
      <>
        <Button className="min-h-11" icon={<ArrowLeft className="size-4" />} onClick={back('quien')}>
          Atrás
        </Button>
        <Button className="min-h-11" variant="primary" icon={<ArrowRight className="size-4" />} disabled={!detailsOk} onClick={() => setStep('vista')}>
          Siguiente
        </Button>
      </>
    );
  } else if (step === 'vista') {
    body = (
      <PreviewStep
        badge={badge}
        sport={sport}
        leagueName={league.name}
        tz={league.tz}
        period={cleanPeriod}
        division={cleanDivision}
        note={cleanBadgeText(note)}
        names={picked.map(nameOf)}
        teamName={badge.byTeam ? (team?.name ?? null) : null}
        error={error ?? (overQuota ? quotaText : null)}
      />
    );
    footer = (
      <>
        <Button className="min-h-11" icon={<ArrowLeft className="size-4" />} onClick={back('detalles')}>
          Atrás
        </Button>
        <Button className="min-h-11" variant="primary" icon={<Gift className="size-4" />} loading={busy} disabled={overQuota} onClick={() => void give()}>
          Dar insignia
        </Button>
      </>
    );
  } else {
    body = <DoneStep badge={badge} result={result} names={picked.map(nameOf)} period={cleanPeriod} error={error} />;
    footer = (
      <>
        <Button className="min-h-11" icon={<Undo2 className="size-4" />} loading={busy} onClick={() => void undo()}>
          Deshacer
        </Button>
        <Button className="min-h-11" variant="primary" icon={<Check className="size-4" />} onClick={onClose}>
          Listo
        </Button>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {step !== 'cual' && step !== 'listo' && <Steps step={step} />}
      {body}
      {/* Los botones del paso quedan pegados abajo mientras se desliza la lista. */}
      <div className="sticky -bottom-4 z-10 -mx-5 -mb-4 flex flex-wrap justify-end gap-2 border-t border-line bg-surface px-5 py-3">{footer}</div>
    </div>
  );
}

const STEP_LABEL: Record<'quien' | 'detalles' | 'vista', string> = { quien: '¿A quién?', detalles: 'Periodo y nota', vista: 'Así la verá' };

function Steps({ step }: { step: Step }) {
  const keys = ['quien', 'detalles', 'vista'] as const;
  const at = keys.indexOf(step as (typeof keys)[number]);
  return (
    <ol className="flex items-center gap-2 text-xs font-medium" aria-label="Pasos">
      {keys.map((k, i) => (
        <li key={k} className={cx('flex items-center gap-1.5', i === at ? 'text-accent' : 'text-muted')} aria-current={i === at ? 'step' : undefined}>
          <span className={cx('flex size-5 items-center justify-center rounded-full text-[11px]', i <= at ? 'bg-accent text-accent-fg' : 'bg-surface-2')}>{i + 1}</span>
          <span className={cx(i !== at && 'hidden sm:inline')}>{STEP_LABEL[k]}</span>
        </li>
      ))}
    </ol>
  );
}

/** Elegir cuál dar (cuando «Dar insignia» se abre sin un diseño). */
export function PickDesign({ designs, sport, onPick }: { designs: readonly LeagueBadge[]; sport: string; onPick: (b: LeagueBadge) => void }) {
  const active = designs.filter((d) => d.status === 'activa');
  if (!active.length) return <p className="py-6 text-center text-sm text-muted">No hay insignias activas. Crea una con «Nueva insignia».</p>;
  return (
    <div className="flex flex-col gap-1">
      <p id="cual-dar" className="mb-1 text-sm font-semibold">
        ¿Cuál vas a dar?
      </p>
      <ul className="flex flex-col gap-1" aria-labelledby="cual-dar">
        {active.map((d) => {
          const look = designLook(d, sport);
          return (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => onPick(d)}
                className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition hover:bg-surface-2 active:scale-[0.99]"
              >
                <Insignia badge={look} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{d.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {LIMIT_INFO[d.limitKind].label}
                    {d.periodText ? ` · ${d.periodText}` : ''}
                    {d.byTeam ? ' · por equipo' : ''}
                  </span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Paso 1, «¿A quién?»: las sugerencias arriba y la lista de jugadores (o el equipo y su plantilla). */
export function WhoStep({
  badge,
  players,
  loading,
  error,
  picked,
  onToggle,
  onSuggestion,
  myPlayerId,
  holders,
  left,
  period,
  teams,
  teamsLoading,
  teamsError,
  teamId,
  onTeam,
  suggestions,
  suggestionsLoading,
}: {
  badge: LeagueBadge;
  players: readonly Player[];
  loading?: boolean;
  /** No se pudieron leer los jugadores: se dice (con «Reintentar»), no «Todavía no hay jugadores». */
  error?: Error | null;
  picked: readonly string[];
  onToggle: (id: string) => void;
  onSuggestion: (s: Suggestion) => void;
  myPlayerId: string | null;
  holders: ReadonlySet<string>;
  left: number;
  period: string;
  /** Equipos o parejas (solo con una insignia por equipo). */
  teams: readonly { id: string; name: string; roster: readonly { playerId: string }[] }[] | null;
  teamsLoading?: boolean;
  teamsError?: Error | null;
  teamId: string | null;
  onTeam: (id: string) => void;
  suggestions: SuggestOutcome | null;
  suggestionsLoading?: boolean;
}) {
  const [q, setQ] = useState('');
  const team = teams?.find((t) => t.id === teamId) ?? null;
  const pool = team ? players.filter((p) => team.roster.some((r) => r.playerId === p.id)) : players;
  const query = normalizeSearch(q);
  const list = [...pool].filter((p) => !query || normalizeSearch(p.name).includes(query)).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const limit = LIMIT_OF[badge.limitKind];

  return (
    <div className="flex flex-col gap-4">
      {suggestions && <SuggestionsBox outcome={suggestions} loading={suggestionsLoading} picked={picked} teamId={badge.byTeam ? teamId : null} onPick={onSuggestion} />}

      <p className="text-xs text-muted">
        {badge.byTeam
          ? `${LIMIT_INFO[badge.limitKind].label}: ${limit === 1 ? '1 equipo' : `hasta ${limit} equipos`} por periodo.`
          : left > 0
            ? `${LIMIT_INFO[badge.limitKind].label}: ${left === 1 ? 'queda 1 lugar' : `quedan ${left} lugares`}${period ? ` en ${period}` : ''}.`
            : `${LIMIT_INFO[badge.limitKind].label}: ya no quedan lugares${period ? ` en ${period}` : ''}. Puedes darla con otro periodo o división en el paso siguiente.`}
      </p>

      {teams && (
        <fieldset className="min-w-0 flex flex-col gap-1.5">
          <legend className="mb-1.5 text-xs font-medium text-muted">Equipo o pareja</legend>
          {teams.length ? (
            <div className="flex flex-wrap gap-1.5">
              {teams.map((t) => (
                <Chip key={t.id} on={teamId === t.id} onClick={() => onTeam(t.id)}>
                  <Users className="size-4" aria-hidden="true" />
                  {t.name}
                </Chip>
              ))}
            </div>
          ) : teamsLoading ? (
            <Spinner className="size-5" />
          ) : teamsError ? (
            <LoadError error={teamsError} />
          ) : (
            <p className="text-sm text-muted">Todavía no hay equipos ni parejas de temporada.</p>
          )}
          {team && <p className="text-xs text-muted">Su plantilla sale marcada: desmarca a los que no jugaron.</p>}
        </fieldset>
      )}

      {(!teams || team) && (
        <div className="flex flex-col gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busca un jugador" aria-label="Buscar jugador" className="pl-9" autoComplete="off" />
          </div>
          <div className="flex max-h-80 flex-col overflow-y-auto rounded-xl border border-line" role="group" aria-label="Jugadores">
            {loading && !players.length ? (
              <div className="flex justify-center py-6">
                <Spinner className="size-5" />
              </div>
            ) : error && !players.length ? (
              <div className="p-3">
                <LoadError error={error} />
              </div>
            ) : list.length ? (
              list.map((p) => {
                const me = p.id === myPlayerId;
                const has = holders.has(p.id);
                const on = picked.includes(p.id);
                return (
                  <label
                    key={p.id}
                    className={cx(
                      'flex min-h-11 items-center gap-3 border-b border-line px-3 py-2 last:border-0',
                      me || has ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
                      on && 'bg-accent-soft',
                    )}
                  >
                    <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={on} disabled={me || has} onChange={() => onToggle(p.id)} />
                    <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                    {me ? <Badge>Tú</Badge> : has ? <Badge tone="ok">Ya la tiene</Badge> : !p.uid && <Badge>Sin cuenta</Badge>}
                  </label>
                );
              })
            ) : (
              <p className="px-3 py-6 text-center text-sm text-muted">{players.length ? 'Nadie coincide.' : 'Todavía no hay jugadores en la liga.'}</p>
            )}
          </div>
          <p className="text-xs text-muted" aria-live="polite">
            {picked.length ? `${picked.length === 1 ? '1 elegido' : `${picked.length} elegidos`}: ${namesText(picked.map((id) => players.find((p) => p.id === id)?.name ?? 'Jugador'))}` : 'Elige a quién se la das.'}
            {myPlayerId && ' Nadie se da insignias a sí mismo.'}
          </p>
        </div>
      )}
    </div>
  );
}

/** «Sugerencias de la app»: los primeros con sus números. Tocar una la elige. */
export function SuggestionsBox({
  outcome,
  loading,
  picked,
  teamId,
  onPick,
}: {
  outcome: SuggestOutcome;
  loading?: boolean;
  picked: readonly string[];
  teamId: string | null;
  onPick: (s: Suggestion) => void;
}) {
  const chosen = (s: Suggestion) => (s.teamId && teamId ? s.teamId === teamId : s.playerIds.length > 0 && s.playerIds.every((id) => picked.includes(id)));
  return (
    <section aria-labelledby="sugerencias-app" className="flex flex-col gap-1.5 rounded-xl bg-surface-2 p-3">
      <h3 id="sugerencias-app" className="flex items-center gap-1.5 text-sm font-semibold">
        <Sparkles className="size-4 text-accent" aria-hidden="true" /> Sugerencias de la app
      </h3>
      {loading && !outcome.list.length ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner className="size-4" /> Calculando…
        </p>
      ) : outcome.list.length ? (
        <ul className="flex flex-col">
          {outcome.list.map((s) => {
            const on = chosen(s);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onPick(s)}
                  className={cx('-mx-1 flex min-h-11 w-[calc(100%+0.5rem)] items-center gap-2 rounded-lg px-1 text-left transition hover:bg-surface', on && 'text-accent')}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{s.name}</span>
                    <span className="block truncate text-xs text-muted">{s.detail}</span>
                  </span>
                  {on ? <Check className="size-4 shrink-0" aria-hidden="true" /> : <span className="shrink-0 text-xs font-semibold text-accent">Elegir</span>}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted">{outcome.note}</p>
      )}
      <p className="text-xs text-muted">La app sugiere; la liga decide.</p>
    </section>
  );
}

/** Paso 2: periodo (el del diseño, uno de los de hoy o uno libre), división, nota y «Avisarle». */
export function DetailsStep({
  badge,
  choices,
  period,
  onPeriod,
  division,
  onDivision,
  note,
  onNote,
  notify,
  onNotify,
  minors,
  errors,
  withAccount,
}: {
  badge: LeagueBadge;
  choices: readonly PeriodChoice[];
  period: string;
  onPeriod: (v: string) => void;
  division: string;
  onDivision: (v: string) => void;
  note: string;
  onNote: (v: string) => void;
  notify: boolean;
  onNotify: (v: boolean) => void;
  minors: boolean;
  errors: { period: string | null; division: string | null; note: string | null };
  withAccount: number;
}) {
  const current = cleanBadgeText(period).toUpperCase();
  const own = badge.periodText.trim();
  // El del diseño primero; después los de hoy que no son el mismo.
  const options = [
    ...(own ? [{ key: 'diseno', label: 'El del diseño', text: own }] : []),
    ...choices.filter((c) => c.mode !== 'torneo' && (c.mode === 'none' || c.text !== own)).map((c) => ({ key: c.mode, label: c.label, text: c.text })),
  ];
  return (
    <div className="flex flex-col gap-4">
      <fieldset className="min-w-0 flex flex-col gap-1.5">
        <legend className="mb-1.5 text-xs font-medium text-muted">Periodo</legend>
        <div className="flex flex-wrap gap-1.5">
          {options.map((o) => (
            <Chip key={o.key} on={current === o.text} onClick={() => onPeriod(o.text)}>
              {o.label}
              {o.text && <span className="text-xs text-muted">{o.text}</span>}
            </Chip>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={period}
            maxLength={BADGE_TEXT_MAX.period}
            onChange={(e) => onPeriod(e.target.value.toUpperCase())}
            placeholder="O escribe uno: CLAUSURA"
            aria-label="Periodo"
            aria-invalid={!!errors.period}
            autoComplete="off"
          />
          <Counter value={textLength(period)} max={BADGE_TEXT_MAX.period} />
        </div>
        {errors.period && (
          <p role="alert" className="text-xs font-medium text-danger">
            {errors.period}
          </p>
        )}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="dar-division" className="text-xs font-medium text-muted">
            División (opcional)
          </label>
          <Counter value={textLength(division)} max={BADGE_TEXT_MAX.division} />
        </div>
        <Input id="dar-division" value={division} maxLength={BADGE_TEXT_MAX.division} onChange={(e) => onDivision(e.target.value)} placeholder="Cat. A, Femenino…" autoComplete="off" aria-invalid={!!errors.division} />
        {errors.division && (
          <p role="alert" className="text-xs font-medium text-danger">
            {errors.division}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="dar-nota" className="text-xs font-medium text-muted">
            Nota para el jugador (opcional)
          </label>
          <Counter value={textLength(note)} max={BADGE_TEXT_MAX.note} />
        </div>
        <Textarea id="dar-nota" rows={2} value={note} maxLength={BADGE_TEXT_MAX.note} onChange={(e) => onNote(e.target.value)} placeholder="“Por tu 279 en la final”" aria-invalid={!!errors.note} />
        <p className="text-xs text-muted">La ven el jugador y los admins. Nunca sale en la imagen para compartir.</p>
        {errors.note && (
          <p role="alert" className="text-xs font-medium text-danger">
            {errors.note}
          </p>
        )}
      </div>

      <Toggle
        id="dar-avisar"
        on={notify && !minors && withAccount > 0}
        disabled={minors || withAccount === 0}
        onChange={onNotify}
        label={withAccount > 1 ? 'Avisarles' : 'Avisarle'}
        hint={
          minors
            ? 'En ligas con menores no se mandan avisos.'
            : withAccount === 0
              ? 'Ninguno tiene cuenta: la ven en la página de la liga.'
              : withAccount === 1
                ? 'Le llega un aviso al teléfono (tiene cuenta).'
                : `Les llega un aviso al teléfono (${withAccount} tienen cuenta).`
        }
      />
    </div>
  );
}

/** Paso 3, «Así la verá»: la insignia a 128 px sobre la tarjeta del jugador. */
export function PreviewStep({
  badge,
  sport,
  leagueName,
  tz,
  period,
  division,
  note,
  names,
  teamName,
  error,
}: {
  badge: LeagueBadge;
  sport: string;
  leagueName: string;
  tz?: string;
  period: string;
  division: string;
  note: string;
  names: readonly string[];
  teamName: string | null;
  error: string | null;
}) {
  const look = designLook(badge, sport, period);
  const detail = [division, teamName].filter(Boolean).join(' · ');
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-semibold">Así la verá</p>
      <Card className="flex flex-col items-center gap-2 p-4 text-center">
        <Insignia badge={look} size={128} label={badgeLabel(badge.name, look)} />
        <h3 className="text-lg font-bold tracking-tight">{badge.name}</h3>
        {badge.description && <p className="max-w-sm text-sm text-muted">{badge.description}</p>}
        {detail && <p className="text-xs font-medium text-muted">{detail}</p>}
        <p className="text-xs text-muted">
          Otorgada por {leagueName} · {dayText(new Date().toISOString(), tz)}
        </p>
        {note && <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm italic">“{note}”</p>}
      </Card>
      <p className="text-sm">
        Para <b>{namesText(names, 4)}</b>.
      </p>
      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** El aviso de listo, con «Deshacer» (sirve 24 h; después, solo el dueño la quita). */
export function DoneStep({ badge, result, names, period, error }: { badge: LeagueBadge; result: GiveResult | null; names: readonly string[]; period: string; error: string | null }) {
  const notified = result?.notified ?? 0;
  return (
    <div className="flex flex-col items-center gap-2 py-2 text-center" role="status">
      <span className="flex size-12 items-center justify-center rounded-full bg-ok-soft text-ok">
        <Check className="size-6" aria-hidden="true" />
      </span>
      <p className="text-base font-semibold">{givenText(names, badge.name, period)}</p>
      <p className="text-sm text-muted">
        {notified ? (notified === 1 ? 'Le avisamos a 1 jugador con cuenta. ' : `Les avisamos a ${notified} jugadores con cuenta. `) : ''}
        ¿Te equivocaste? Puedes deshacerla durante 24 horas.
      </p>
      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
