import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, CalendarPlus, Coffee } from 'lucide-react';
import { createMatches } from '../../../lib/data/matches';
import { useAction } from '../../../components/feedback';
import { Badge, Button, Field, Input, Select, Sheet, cx } from '../../../components/ui';
import { whenText } from '../../../components/match/format';
import { clashSummary, EVERY_OPTIONS, MAX_BATCH, nextRound, nextWeekday, ROUNDS_OPTIONS, scheduleByRound, schedulePlanOf, singleMatchValid, toggleTeam } from './calendarAdmin';
import { matchClashes, planClashes, planDrafts, zonedIso } from './schedule';
import { TeamName } from './TeamBits';
import type { TeamLeague } from './useTeamLeague';

/**
 * Armar el calendario de la temporada (compartido por baloncesto y fútbol): todos contra todos de ida o de ida y
 * vuelta, una jornada cada N días, con horas y canchas, y aviso de choques antes de guardar. Se guarda en un lote
 * (los ids salen del teléfono). También: un partido suelto (amistoso, final, partido aplazado a otra fecha). Lo que se
 * decide sin pantalla está en calendarAdmin.ts (lo comparte la app del teléfono).
 */

export function ScheduleBuilder({
  tl,
  open,
  onClose,
  format,
  minutes = 90,
  defaultDouble = false,
}: {
  tl: TeamLeague;
  open: boolean;
  onClose: () => void;
  /** matches.format del deporte ('fiba', '3x3', 'football'…). */
  format?: string;
  /** Lo que dura un partido (para los choques). */
  minutes?: number;
  /** Ida y vuelta marcado al abrir (p. ej. «Liga de campo ida y vuelta»). */
  defaultDouble?: boolean;
}) {
  const run = useAction();
  const teams = tl.teams.data;
  const lastRound = nextRound(tl.matches.data) - 1;
  const [picked, setPicked] = useState<string[] | null>(null);
  const [double, setDouble] = useState(defaultDouble);
  const [start, setStart] = useState(nextWeekday(6));
  const [every, setEvery] = useState('7');
  const [timesText, setTimesText] = useState('7:00 pm, 8:30 pm');
  const [courtsText, setCourtsText] = useState(tl.league.venue ? `${tl.league.venue}` : 'Cancha 1');
  const [skipText, setSkipText] = useState('');
  const [firstRound, setFirstRound] = useState(String(lastRound + 1));
  const [busy, setBusy] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);
  // Al abrir: la jornada que sigue a las que ya hay.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setFirstRound(String(lastRound + 1));
      if (defaultDouble) setDouble(true);
    }
  }

  const ids = picked ?? teams.map((t) => t.id);
  const idsText = ids.join(',');

  const { plan, times } = useMemo(
    () => schedulePlanOf({ teams: idsText ? idsText.split(',') : [], double, start, every, timesText, courtsText, skipText, firstRound, tz: tl.tz }),
    [idsText, double, start, every, timesText, courtsText, skipText, firstRound, tl.tz],
  );
  const clashes = useMemo(() => (plan ? planClashes(plan, tl.matches.data, minutes, tl.tz) : []), [plan, tl.matches.data, minutes, tl.tz]);
  const byRound = useMemo(() => scheduleByRound(plan), [plan]);

  const toggle = (id: string) => setPicked((p) => toggleTeam(p, ids, id));

  const save = async () => {
    if (!plan) return;
    setBusy(true);
    const drafts = planDrafts(plan, { format });
    const ok = await run(async () => {
      for (let i = 0; i < drafts.length; i += MAX_BATCH) await createMatches(tl.lid, drafts.slice(i, i + MAX_BATCH));
      return true;
    }, `Calendario listo: ${drafts.length} partidos`);
    setBusy(false);
    if (ok) {
      setPicked(null);
      onClose();
    }
  };

  const name = (id: string) => tl.teamOf(id)?.name ?? '¿?';

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Armar el calendario"
      subtitle="Todos contra todos, con horas y canchas"
      footer={
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          loading={busy}
          disabled={!plan || !plan.matches.length || times.times.length === 0}
          onClick={() => void save()}
          icon={<CalendarPlus className="size-5" />}
        >
          Crear {plan?.matches.length ?? 0} partidos
        </Button>
      }
    >
      <div className="flex flex-col gap-4 pb-1">
        <Field label={`Equipos (${ids.length})`}>
          <div className="flex flex-wrap gap-1.5">
            {teams.map((t) => {
              const on = ids.includes(t.id);
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
          <Field label="Vueltas" className="col-span-2">
            <Select value={double ? '2' : '1'} onChange={(e) => setDouble(e.target.value === '2')}>
              {ROUNDS_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Primera jornada">
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Una jornada cada">
            <Select value={every} onChange={(e) => setEvery(e.target.value)}>
              {EVERY_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Empieza en la jornada">
            <Input inputMode="numeric" value={firstRound} onChange={(e) => setFirstRound(e.target.value.replace(/\D/g, ''))} />
          </Field>
          <Field label="Horas de juego" hint={times.bad.length ? `No se entiende: ${times.bad.join(', ')}` : 'Separadas por coma: 7:00 pm, 8:30 pm'} className="col-span-2">
            <Input value={timesText} onChange={(e) => setTimesText(e.target.value)} />
          </Field>
          <Field label="Canchas" hint="Separadas por coma" className="col-span-2">
            <Input value={courtsText} onChange={(e) => setCourtsText(e.target.value)} placeholder="Cancha 1, Cancha 2" />
          </Field>
          <Field label="Fechas sin juego (opcional)" hint="AAAA-MM-DD, separadas por coma: la jornada pasa al día siguiente" className="col-span-2">
            <Input value={skipText} onChange={(e) => setSkipText(e.target.value)} placeholder="2026-12-24, 2026-12-31" />
          </Field>
        </div>

        {plan && (
          <div className="flex flex-col gap-2">
            <p className="text-[15px] font-semibold">
              {byRound.length} jornadas · {plan.matches.length} partidos
            </p>
            {times.times.length === 0 && <Warn>Escribe al menos una hora de juego.</Warn>}
            {plan.unassigned.length > 0 && (
              <Warn>
                {plan.unassigned.length} partidos no caben en las horas y canchas de su jornada: quedan sin hora. Agrega otra hora u otra cancha.
              </Warn>
            )}
            {clashes.length > 0 && (
              <Warn>{clashSummary(clashes, name)}</Warn>
            )}
            <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
              {byRound.map(([round, list]) => (
                <div key={round} className="rounded-2xl bg-surface-2 px-3.5 py-2.5">
                  <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
                    Jornada {round}
                    <span className="font-normal text-muted">{list[0]?.date}</span>
                  </div>
                  <ul className="flex flex-col gap-0.5 text-sm">
                    {list.map((m, k) => (
                      <li key={k} className="flex items-center gap-2">
                        <span className="w-12 shrink-0 tabular-nums text-muted">{m.time ?? '—'}</span>
                        <span className="min-w-0 flex-1 truncate">
                          {name(m.home)} vs. {name(m.away)}
                        </span>
                        {m.court && <span className="shrink-0 text-xs text-muted">{m.court}</span>}
                      </li>
                    ))}
                    {plan.byes
                      .filter((b) => b.round === round)
                      .map((b) => (
                        <li key={b.team} className="flex items-center gap-2 text-xs text-muted">
                          <Coffee className="size-3.5" /> Descansa {name(b.team)}
                        </li>
                      ))}
                  </ul>
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

/** Un partido suelto: dos equipos, fecha, hora, cancha, jornada y fase («Final»). */
export function SingleMatchModal({ tl, open, onClose, format, minutes = 90 }: { tl: TeamLeague; open: boolean; onClose: () => void; format?: string; minutes?: number }) {
  const run = useAction();
  const teams = tl.teams.data;
  const [home, setHome] = useState('');
  const [away, setAway] = useState('');
  const [date, setDate] = useState(nextWeekday(6));
  const [time, setTime] = useState('19:00');
  const [court, setCourt] = useState(tl.league.venue || 'Cancha 1');
  const [round, setRound] = useState('');
  const [stage, setStage] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = singleMatchValid({ home, away, date, time });
  const clashes = valid ? matchClashes({ date, time, court: court.trim() || null, teams: [home, away] }, tl.matches.data, minutes, tl.tz) : [];
  const save = async () => {
    setBusy(true);
    const ok = await run(async () => {
      await createMatches(tl.lid, [
        {
          round: round ? Number(round) : null,
          stage: stage.trim().slice(0, 40),
          court: court.trim().slice(0, 40),
          scheduledAt: zonedIso(date, time, tl.tz),
          format,
          sides: [
            { side: 1, teamId: home },
            { side: 2, teamId: away },
          ],
        },
      ]);
      return true;
    }, 'Partido creado');
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Partido suelto"
      subtitle="Un amistoso, una final o uno aplazado"
      footer={
        <Button variant="primary" size="lg" className="w-full" loading={busy} disabled={!valid} onClick={() => void save()}>
          Crear partido
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-3 pb-1">
        <Field label="Local">
          <Select value={home} onChange={(e) => setHome(e.target.value)}>
            <option value="">Elige…</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id} disabled={t.id === away}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Visita">
          <Select value={away} onChange={(e) => setAway(e.target.value)}>
            <option value="">Elige…</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id} disabled={t.id === home}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Fecha">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Hora">
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field label="Cancha">
          <Input value={court} maxLength={40} onChange={(e) => setCourt(e.target.value)} />
        </Field>
        <Field label="Jornada (opcional)">
          <Input inputMode="numeric" value={round} onChange={(e) => setRound(e.target.value.replace(/\D/g, '').slice(0, 3))} />
        </Field>
        <Field label="Fase (opcional)" hint="Semifinal, Final, Amistoso…" className="col-span-2">
          <Input value={stage} maxLength={40} onChange={(e) => setStage(e.target.value)} />
        </Field>
        {valid && (
          <p className="col-span-2 text-sm text-muted">
            {whenText(zonedIso(date, time, tl.tz), tl.tz)} {clashes.length > 0 && <Badge tone="warn">Choca con otro partido</Badge>}
          </p>
        )}
      </div>
    </Sheet>
  );
}
