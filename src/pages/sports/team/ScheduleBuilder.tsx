import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, CalendarPlus, Coffee } from 'lucide-react';
import { createMatches } from '../../../lib/data/matches';
import { toIsoDate } from '../../../lib/format';
import { useAction } from '../../../components/feedback';
import { Badge, Button, Card, Field, Input, Modal, Select, cx } from '../../../components/ui';
import { whenText } from '../../../components/match/format';
import { isIsoDate, matchClashes, parseCourts, parseTimes, planClashes, planDrafts, planSchedule, zonedIso, type SchedulePlan } from './schedule';
import { TeamName } from './TeamBits';
import type { TeamLeague } from './useTeamLeague';

/**
 * Armar el calendario de la temporada (compartido por baloncesto y fútbol): todos contra todos de ida o de ida y
 * vuelta, una jornada cada N días, con horas y canchas, y aviso de choques antes de guardar. Se guarda en un lote
 * (los ids salen del teléfono). También: un partido suelto (amistoso, final, partido aplazado a otra fecha).
 */

const MAX_BATCH = 200;

const nextWeekday = (day: number) => {
  const d = new Date();
  d.setDate(d.getDate() + ((day - d.getDay() + 7) % 7 || 7));
  return toIsoDate(d);
};

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
  const lastRound = Math.max(0, ...tl.matches.data.map((m) => m.round ?? 0));
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
  const times = parseTimes(timesText);
  const everyDays = Math.max(1, Math.min(60, Number(every) || 7));
  const first = Math.max(1, Math.min(999, Number(firstRound) || 1));

  const plan: SchedulePlan | null = useMemo(() => {
    const teamIds = idsText ? idsText.split(',') : [];
    if (teamIds.length < 2 || !isIsoDate(start)) return null;
    return planSchedule({
      teams: teamIds,
      double,
      startDate: start,
      everyDays,
      times: parseTimes(timesText).times,
      courts: parseCourts(courtsText),
      firstRound: first,
      tz: tl.tz,
      skip: skipText.split(/[,;\s]+/).filter(isIsoDate),
    });
  }, [idsText, double, start, everyDays, timesText, courtsText, skipText, first, tl.tz]);
  const clashes = useMemo(() => (plan ? planClashes(plan, tl.matches.data, minutes, tl.tz) : []), [plan, tl.matches.data, minutes, tl.tz]);
  const byRound = useMemo(() => {
    const map = new Map<number, SchedulePlan['matches']>();
    for (const m of plan?.matches ?? []) map.set(m.round, [...(map.get(m.round) ?? []), m]);
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [plan]);

  const toggle = (id: string) => setPicked((p) => ((p ?? ids).includes(id) ? (p ?? ids).filter((x) => x !== id) : [...(p ?? ids), id]));

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
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Armar el calendario"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} disabled={!plan || !plan.matches.length || times.times.length === 0} onClick={() => void save()} icon={<CalendarPlus className="size-4" />}>
            Crear {plan?.matches.length ?? 0} partidos
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
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
                  className={cx('rounded-full border px-3 py-1.5 text-sm transition', on ? 'border-accent bg-accent-soft font-medium' : 'border-line text-muted')}
                >
                  <TeamName team={t} />
                </button>
              );
            })}
          </div>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Vueltas">
            <Select value={double ? '2' : '1'} onChange={(e) => setDouble(e.target.value === '2')}>
              <option value="1">Solo ida (todos contra todos una vez)</option>
              <option value="2">Ida y vuelta</option>
            </Select>
          </Field>
          <Field label="Primera jornada">
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Una jornada cada">
            <Select value={every} onChange={(e) => setEvery(e.target.value)}>
              <option value="7">Semana (7 días)</option>
              <option value="14">Dos semanas</option>
              <option value="3">3 días</option>
              <option value="1">Todos los días (torneo)</option>
            </Select>
          </Field>
          <Field label="Empieza en la jornada">
            <Input inputMode="numeric" value={firstRound} onChange={(e) => setFirstRound(e.target.value.replace(/\D/g, ''))} />
          </Field>
          <Field label="Horas de juego" hint={times.bad.length ? `No se entiende: ${times.bad.join(', ')}` : 'Separadas por coma: 7:00 pm, 8:30 pm'}>
            <Input value={timesText} onChange={(e) => setTimesText(e.target.value)} />
          </Field>
          <Field label="Canchas" hint="Separadas por coma">
            <Input value={courtsText} onChange={(e) => setCourtsText(e.target.value)} placeholder="Cancha 1, Cancha 2" />
          </Field>
          <Field label="Fechas sin juego (opcional)" hint="AAAA-MM-DD, separadas por coma: la jornada pasa al día siguiente" className="sm:col-span-2">
            <Input value={skipText} onChange={(e) => setSkipText(e.target.value)} placeholder="2026-12-24, 2026-12-31" />
          </Field>
        </div>

        {plan && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">
              {byRound.length} jornadas · {plan.matches.length} partidos
            </p>
            {times.times.length === 0 && <Warn>Escribe al menos una hora de juego.</Warn>}
            {plan.unassigned.length > 0 && (
              <Warn>
                {plan.unassigned.length} partidos no caben en las horas y canchas de su jornada: quedan sin hora. Agrega otra hora u otra cancha.
              </Warn>
            )}
            {clashes.length > 0 && (
              <Warn>
                {clashes.length} choques: {[...new Set(clashes.map((c) => (c.kind === 'court' ? `${c.who} ocupada` : `${name(c.who)} con dos partidos`)))].slice(0, 3).join(' · ')}.
              </Warn>
            )}
            <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
              {byRound.map(([round, list]) => (
                <Card key={round} className="px-3 py-2">
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
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Warn({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="flex items-start gap-2 rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">
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
  const valid = home && away && home !== away && isIsoDate(date) && /^\d{2}:\d{2}$/.test(time);
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
    <Modal
      open={open}
      onClose={onClose}
      title="Partido suelto"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} disabled={!valid} onClick={() => void save()}>
            Crear partido
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
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
        <Field label="Fase (opcional)" hint="Semifinal, Final, Amistoso…" className="sm:col-span-2">
          <Input value={stage} maxLength={40} onChange={(e) => setStage(e.target.value)} />
        </Field>
        {valid && (
          <p className="text-sm text-muted sm:col-span-2">
            {whenText(zonedIso(date, time, tl.tz), tl.tz)} {clashes.length > 0 && <Badge tone="warn">Choca con otro partido</Badge>}
          </p>
        )}
      </div>
    </Modal>
  );
}
