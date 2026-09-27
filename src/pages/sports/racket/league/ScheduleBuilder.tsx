import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, CalendarPlus, Plus, X } from 'lucide-react';
import { createMatches, useMatches } from '../../../../lib/data/matches';
import { updateRacketEvent, type RacketEvent } from '../../../../lib/data/racket';
import { useLeagueCtx } from '../../../../lib/league';
import { useFeedback, saveErrorMessage } from '../../../../components/feedback';
import { Button, Card, Field, Input, Select } from '../../../../components/ui';
import { PickList, Stepper } from '../bits';
import { buildLeagueSchedule, clashText, leagueConfigJson, type PairsLeagueConfig } from '../logic/league';
import { localParts, timeLabel } from '../logic/time';
import { useNames } from '../names';
import { useRacket } from '../sport';

/**
 * Armar el calendario de la liga: quiénes juegan, ida o ida y vuelta, fecha de la jornada 1 y cada cuántos días,
 * canchas y horas. Muestra cómo queda (jornadas, partidos sin hora y choques) antes de crearlo.
 */
export function ScheduleBuilder({ event, cfg }: { event: RacketEvent; cfg: PairsLeagueConfig }) {
  const { lid, base, league } = useLeagueCtx();
  const { doubles, side, leagueRules } = useRacket();
  const names = useNames();
  const { toast } = useFeedback();
  const existing = useMatches({ lid }).data;
  const [draft, setDraft] = useState<PairsLeagueConfig>(() => ({
    ...cfg,
    courts: cfg.courts.length ? cfg.courts : ['Cancha 1', 'Cancha 2'],
    times: cfg.times.length ? cfg.times : [event.startTime ?? '19:00'],
  }));
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<PairsLeagueConfig>) => setDraft((d) => ({ ...d, ...patch }));

  const items = useMemo(
    () =>
      doubles
        ? names.teams.map((t) => ({ id: t.id, name: t.name, sub: t.roster.map((r) => names.nameOf(r.playerId)).join(' / ') }))
        : names.players.map((p) => ({ id: p.id, name: p.name })),
    [doubles, names],
  );
  const plan = useMemo(
    () => buildLeagueSchedule(draft, [...names.entrants(draft.pairs).values()], { eventId: event.id, tz: league.tz, existing, rules: leagueRules }),
    [draft, names, event.id, league.tz, existing, leagueRules],
  );
  const incomplete = doubles ? draft.pairs.filter((id) => names.rosterOf(id).length < 2) : [];

  const create = async () => {
    setBusy(true);
    try {
      await updateRacketEvent(lid, event.id, { config: leagueConfigJson(draft) });
      await createMatches(lid, plan.drafts);
      toast(`Calendario listo: ${plan.drafts.length} partidos en ${plan.jornadas} jornadas`);
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const firstDates = plan.fixtures.filter((f, i, all) => all.findIndex((x) => x.round === f.round) === i).slice(0, 4);

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 p-4">
        <p className="font-semibold">1. ¿Quiénes juegan?</p>
        <PickList
          items={items}
          selected={new Set(draft.pairs)}
          onToggle={(id) => set({ pairs: draft.pairs.includes(id) ? draft.pairs.filter((x) => x !== id) : [...draft.pairs, id] })}
          empty={
            doubles ? (
              <>
                No hay parejas todavía.{' '}
                <Link className="font-medium text-accent" to={`${base}/admin?tab=parejas`}>
                  Arma las parejas
                </Link>
              </>
            ) : (
              'No hay jugadores todavía.'
            )
          }
        />
        {incomplete.length > 0 && (
          <p className="text-sm text-warn">
            {incomplete.map(names.entrantName).join(', ')}: la pareja no tiene dos jugadores (las estadísticas van a quien juega).
          </p>
        )}
      </Card>

      <Card className="flex flex-col gap-4 p-4">
        <p className="font-semibold">2. Fechas, canchas y horas</p>
        <label className="flex min-h-12 items-center gap-3 rounded-xl border border-line px-3">
          <input type="checkbox" checked={draft.double} onChange={(e) => set({ double: e.target.checked })} className="size-5 accent-[var(--accent)]" />
          <span className="text-sm font-medium">Ida y vuelta</span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Jornada 1">
            <Input type="date" value={draft.startDate} onChange={(e) => set({ startDate: e.target.value })} />
          </Field>
          <Stepper label="Cada cuántos días" value={draft.everyDays} min={1} max={30} onChange={(everyDays) => set({ everyDays })} suffix="días" />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted">Canchas</span>
          <div className="grid grid-cols-2 gap-2">
            {draft.courts.map((c, i) => (
              <div key={i} className="flex gap-1">
                <Input value={c} maxLength={40} aria-label={`Cancha ${i + 1}`} onChange={(e) => set({ courts: draft.courts.map((x, j) => (j === i ? e.target.value : x)) })} />
                <Button variant="ghost" icon={<X className="size-4" />} aria-label="Quitar cancha" onClick={() => set({ courts: draft.courts.filter((_, j) => j !== i) })} />
              </div>
            ))}
          </div>
          <Button size="sm" className="self-start" icon={<Plus className="size-4" />} onClick={() => set({ courts: [...draft.courts, `Cancha ${draft.courts.length + 1}`] })}>
            Cancha
          </Button>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted">Horas de cada jornada</span>
          <div className="grid grid-cols-2 gap-2">
            {draft.times.map((t, i) => (
              <div key={i} className="flex gap-1">
                <Input type="time" value={t} aria-label={`Hora ${i + 1}`} onChange={(e) => set({ times: draft.times.map((x, j) => (j === i ? e.target.value : x)) })} />
                <Button variant="ghost" icon={<X className="size-4" />} aria-label="Quitar hora" onClick={() => set({ times: draft.times.filter((_, j) => j !== i) })} />
              </div>
            ))}
          </div>
          <Button
            size="sm"
            className="self-start"
            icon={<Plus className="size-4" />}
            onClick={() => {
              const last = draft.times.at(-1) ?? '19:00';
              const [h, m] = last.split(':').map(Number);
              const next = `${String(Math.min(23, h + Math.floor((m + draft.minutes) / 60))).padStart(2, '0')}:${String((m + draft.minutes) % 60).padStart(2, '0')}`;
              set({ times: [...draft.times, next] });
            }}
          >
            Hora
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Stepper label="Minutos por partido" value={draft.minutes} min={30} max={180} step={15} onChange={(minutes) => set({ minutes })} />
          <Field label="Puntos de la tabla">
            <Select value={draft.points} onChange={(e) => set({ points: e.target.value === '2-0' ? '2-0' : 'standard' })}>
              <option value="standard">Ganar 3, perder 1, W.O. 0</option>
              <option value="2-0">Ganar 2, perder 0</option>
            </Select>
          </Field>
        </div>
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <p className="font-semibold">3. Así queda</p>
        {draft.pairs.length < 2 ? (
          <p className="text-sm text-muted">Elige al menos 2 {side[1]}.</p>
        ) : (
          <>
            <p className="text-sm">
              <b>{plan.jornadas}</b> jornadas · <b>{plan.drafts.length}</b> partidos
              {draft.pairs.length % 2 === 1 && ` · descansa ${doubles ? 'una pareja' : 'uno'} por jornada`}
            </p>
            {firstDates.length > 0 && (
              <ul className="text-sm text-muted">
                {firstDates.map((f) => (
                  <li key={f.round}>
                    Jornada {f.round}: {f.date ?? 'sin fecha'}
                    {f.time ? ` · desde las ${timeLabel(f.time)}` : ''}
                  </li>
                ))}
                {plan.jornadas > firstDates.length && <li>…</li>}
              </ul>
            )}
            {plan.unassigned > 0 && (
              <p className="flex items-start gap-2 rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                {plan.unassigned} {plan.unassigned === 1 ? 'partido no cabe' : 'partidos no caben'} en las canchas y horas: {plan.unassigned === 1 ? 'queda' : 'quedan'} sin hora. Agrega una cancha o una hora.
              </p>
            )}
            {plan.clashes.length > 0 && (
              <div className="flex flex-col gap-1 rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">
                <p className="flex items-center gap-2 font-semibold">
                  <AlertTriangle className="size-4" /> Choques ({plan.clashes.length})
                </p>
                {plan.clashes.slice(0, 5).map((c, i) => {
                  const other = [c.a, c.b].find((x) => x.startsWith('m:'));
                  const m = other ? existing.find((x) => `m:${x.id}` === other) : null;
                  const when = m ? localParts(m.scheduledAt, league.tz) : null;
                  return (
                    <p key={i}>
                      {clashText(c, (id) => (names.team(id) ? names.entrantName(id) : names.nameOf(id)))}
                      {when ? ` (ya juega el ${when.date} a las ${timeLabel(when.time)})` : ''}
                    </p>
                  );
                })}
              </div>
            )}
            <Button variant="primary" className="h-12 text-base" icon={<CalendarPlus className="size-5" />} loading={busy} disabled={draft.pairs.length < 2} onClick={() => void create()}>
              Crear el calendario
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
