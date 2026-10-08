import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowRightLeft, Shuffle, Trophy } from 'lucide-react';
import { createMatches, setMatchSides, type Match } from '../../../lib/data/matches';
import { saveLeagueRules } from '../../../lib/data/teamSports';
import { toIsoDate } from '../../../lib/format';
import { seededRandom, shuffle } from '../../../sports/formats/random';
import { useAction } from '../../../components/feedback';
import { Button, Card, Field, Input, Select, Sheet, cx } from '../../../components/ui';
import { isPlayoffMatch } from './playoffs';
import { isIsoDate, parseCourts } from './schedule';
import { TeamName } from './TeamBits';
import { advanceTournament, groupName, planTournament, tournamentDrafts, tournamentErrors, tournamentSetupOf, type SideChange, type TournamentPlan } from './tournament';
import type { TeamLeague } from './useTeamLeague';

/**
 * Armar un torneo relámpago (compartido por los deportes de equipo): los equipos, cuántos grupos, cuántos
 * clasifican, el día, la hora del primer partido, cada cuánto sale un turno y las canchas. Muestra los grupos y los
 * partidos antes de guardar; se guarda en un lote (los ids salen del teléfono) y el armado queda en las reglas de la
 * liga (`rules.tournament`) para después pasar a los clasificados.
 */
export function TournamentBuilder({
  tl,
  open,
  onClose,
  format,
  slotMinutes = 50,
  knockoutRules,
}: {
  tl: TeamLeague;
  open: boolean;
  onClose: () => void;
  /** matches.format del deporte. */
  format?: string;
  /** Minutos por turno por defecto (el partido con su descanso). */
  slotMinutes?: number;
  /** Reglas de los partidos de la eliminatoria (p. ej. penales si empatan). */
  knockoutRules?: Record<string, unknown>;
}) {
  const run = useAction();
  const teams = tl.teams.data;
  const lastRound = Math.max(0, ...tl.matches.data.map((m) => m.round ?? 0));
  const [picked, setPicked] = useState<string[] | null>(null);
  const [seed, setSeed] = useState(0);
  const [groups, setGroups] = useState(() => String(teams.length >= 6 ? 2 : 1));
  const [perGroup, setPerGroup] = useState('2');
  const [third, setThird] = useState(false);
  const [date, setDate] = useState(toIsoDate(new Date()));
  const [start, setStart] = useState('08:00');
  const [slot, setSlot] = useState(String(slotMinutes));
  const [courtsText, setCourtsText] = useState(tl.league.venue || 'Cancha 1');
  const [busy, setBusy] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);
  // Al abrir: 1 grupo con pocos equipos (final entre los 2 primeros), 2 grupos desde 6 (semifinales).
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && !picked) setGroups(String(teams.length >= 6 ? 2 : 1));
  }

  const base = picked ?? teams.map((t) => t.id);
  // «Sortear»: mezcla el orden (el primero de cada grupo sale del orden de los equipos).
  const ids = useMemo(() => (seed ? shuffle(base, seededRandom(seed)) : base), [base.join(), seed]);
  const g = Number(groups);
  const q = Number(perGroup);
  const errors = tournamentErrors({ teams: ids, groups: g, perGroup: q });
  const plan: TournamentPlan | null = useMemo(() => {
    if (errors.length || !isIsoDate(date) || !/^\d{2}:\d{2}$/.test(start)) return null;
    try {
      return planTournament({
        teams: ids,
        groups: g,
        perGroup: q,
        thirdPlace: third,
        date,
        start,
        slotMinutes: Math.max(5, Math.min(240, Number(slot) || slotMinutes)),
        courts: parseCourts(courtsText),
        tz: tl.tz,
        firstRound: lastRound + 1,
      });
    } catch {
      return null;
    }
  }, [ids.join(), g, q, third, date, start, slot, courtsText, tl.tz, lastRound, errors.length]);

  const toggle = (id: string) => setPicked((p) => ((p ?? base).includes(id) ? (p ?? base).filter((x) => x !== id) : [...(p ?? base), id]));
  const name = (id: string | null, label: string) => (id ? (tl.teamOf(id)?.name ?? '¿?') : label);

  const save = async () => {
    if (!plan) return;
    setBusy(true);
    const ok = await run(async () => {
      await createMatches(tl.lid, tournamentDrafts(plan, { format, knockoutRules }));
      await saveLeagueRules(tl.lid, { tournament: { groups: g, perGroup: q, thirdPlace: third } });
      return true;
    }, `Torneo listo: ${plan.games.length} partidos`);
    setBusy(false);
    if (ok) {
      setPicked(null);
      onClose();
    }
  };

  const maxGroups = Math.max(1, Math.min(8, Math.floor(ids.length / 2)));
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Torneo relámpago"
      subtitle="Grupos y la final, en un día"
      footer={
        <Button variant="primary" size="lg" className="w-full" loading={busy} disabled={!plan} onClick={() => void save()} icon={<Trophy className="size-5" />}>
          Crear {plan?.games.length ?? 0} partidos
        </Button>
      }
    >
      <div className="flex flex-col gap-4 pb-1">
        <Field label={`Equipos (${ids.length})`}>
          <div className="flex flex-wrap gap-1.5">
            {teams.map((t) => {
              const on = base.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(t.id)}
                  className={cx(
                    "relative h-9 rounded-full px-3.5 text-sm font-semibold transition after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']",
                    on ? 'bg-accent-soft text-fg' : 'bg-surface-2 text-muted',
                  )}
                >
                  <TeamName team={t} />
                </button>
              );
            })}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Grupos">
            <Select value={groups} onChange={(e) => setGroups(e.target.value)}>
              {Array.from({ length: maxGroups }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? '1 grupo (todos contra todos)' : `${n} grupos`}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Clasifican por grupo">
            <Select value={perGroup} onChange={(e) => setPerGroup(e.target.value)}>
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? 'El 1.º' : `Los ${n} primeros`}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Día">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Primer partido">
            <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Un turno cada (min)" hint="El partido más el descanso">
            <Input inputMode="numeric" value={slot} onChange={(e) => setSlot(e.target.value.replace(/\D/g, '').slice(0, 3))} />
          </Field>
          <Field label="Canchas" hint="Separadas por coma">
            <Input value={courtsText} onChange={(e) => setCourtsText(e.target.value)} placeholder="Cancha 1, Cancha 2" />
          </Field>
        </div>
        <label className="flex min-h-12 cursor-pointer items-center gap-3 text-[15px]">
          <span className="min-w-0 flex-1">Partido por el 3.er lugar</span>
          <input type="checkbox" className="size-5 shrink-0 accent-[var(--accent)]" checked={third} onChange={(e) => setThird(e.target.checked)} />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="quiet" icon={<Shuffle className="size-4" />} size="lg" onClick={() => setSeed(Date.now())}>
            Sortear los grupos
          </Button>
          {seed !== 0 && (
            <Button variant="ghost" size="lg" onClick={() => setSeed(0)}>
              Por orden
            </Button>
          )}
        </div>
        {errors.length > 0 && <Warn>{errors[0]}</Warn>}
        {plan && (
          <div className="flex flex-col gap-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {plan.groups.map((gr) => (
                <div key={gr.name} className="rounded-2xl bg-surface-2 px-3.5 py-2.5">
                  <p className="mb-1 text-sm font-semibold">{gr.name}</p>
                  <ul className="flex flex-col gap-0.5 text-sm">
                    {gr.teams.map((t) => (
                      <li key={t}>
                        <TeamName team={tl.teamOf(t)} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="flex max-h-72 flex-col gap-1 overflow-y-auto rounded-2xl bg-surface-2 px-3.5 py-3 text-sm">
              {plan.games.map((m, k) => (
                <div key={k} className="flex items-center gap-2">
                  <span className="w-12 shrink-0 tabular-nums text-muted">{m.time}</span>
                  <span className="w-24 shrink-0 truncate text-xs text-muted">{m.stage}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {name(m.home, m.homeLabel)} vs. {name(m.away, m.awayLabel)}
                  </span>
                  {m.court && <span className="shrink-0 text-xs text-muted">{m.court}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}

function Warn({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="flex items-start gap-2 rounded-2xl bg-warn-soft px-3.5 py-2.5 text-sm text-warn">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/** Los cambios de la eliminatoria que ya se pueden poner (grupos terminados, ganadores que cuentan). */
export function tournamentChanges(tl: TeamLeague, rankGroup: (stage: string) => string[] | null, now = Date.now()): SideChange[] {
  const setup = tournamentSetupOf(tl.rules.data);
  if (!setup) return [];
  // Solo el cuadro del torneo (los juegos del playoff tienen su propia llave).
  const knockout = tl.matches.data.filter((m) => !!m.bracketKey && !isPlayoffMatch(m));
  if (!knockout.length) return [];
  const rankings = Array.from({ length: setup.groups }, (_, i) => rankGroup(groupName(i)));
  try {
    return advanceTournament({ ...setup, rankings, knockout, now });
  } catch {
    return [];
  }
}

/**
 * Admin: pasar a la fase final a los que ya se saben (los clasificados de los grupos que terminaron y los ganadores
 * de la eliminatoria). `rankGroup(stage)` = la tabla de ese grupo (ids en orden) o null si todavía no termina.
 */
export function TournamentAdvance({ tl, rankGroup, className }: { tl: TeamLeague; rankGroup: (stage: string) => string[] | null; className?: string }) {
  const run = useAction();
  const [busy, setBusy] = useState(false);
  const changes = tournamentChanges(tl, rankGroup);
  if (!tl.isAdmin || !changes.length) return null;
  const byId = new Map(tl.matches.data.map((m) => [m.id, m] as const));
  const text = (c: SideChange) => {
    const m = byId.get(c.matchId) as Match | undefined;
    const nm = (i: 0 | 1) => (c.sides[i].teamId ? (tl.teamOf(c.sides[i].teamId)?.name ?? '¿?') : (c.sides[i].label ?? 'Por definir'));
    return `${m?.stage || c.bracketKey}: ${nm(0)} vs. ${nm(1)}`;
  };
  const apply = async () => {
    setBusy(true);
    await run(async () => {
      for (const c of changes) await setMatchSides(tl.lid, c.matchId, c.sides);
    }, 'Fase final al día');
    setBusy(false);
  };
  return (
    <Card soft className={cx('flex flex-col gap-3 px-5 pt-[18px] pb-5', className)}>
      <p className="flex items-center gap-2 text-sm font-semibold text-accent">
        <ArrowRightLeft aria-hidden="true" className="size-4" /> Pasar a la fase final
      </p>
      <ul className="flex flex-col gap-1 text-[15px] text-fg-2">
        {changes.map((c) => (
          <li key={c.matchId}>{text(c)}</li>
        ))}
      </ul>
      <Button variant="primary" size="lg" className="w-full" loading={busy} onClick={() => void apply()}>
        Poner estos equipos
      </Button>
    </Card>
  );
}
