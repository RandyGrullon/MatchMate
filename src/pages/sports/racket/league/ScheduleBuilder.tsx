import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, CalendarPlus, Plus, X } from 'lucide-react';
import { createMatches, useMatches } from '../../../../lib/data/matches';
import { updateRacketEvent, type RacketEvent } from '../../../../lib/data/racket';
import { useLeagueCtx } from '../../../../lib/league';
import { useFeedback, saveErrorMessage } from '../../../../components/feedback';
import { Button, Card, Field, Input, Select } from '../../../../components/ui';
import { PickList, Stepper, ToggleRow } from '../bits';
import { buildLeagueSchedule, clashText, leagueConfigJson, type PairsLeagueConfig } from '../logic/league';
import { localParts, timeLabel } from '../logic/time';
import { useNames } from '../names';
import { isGameSport } from '../../../../sports/racket/rules';
import { courtWords, useRacket } from '../sport';

/**
 * Armar el calendario de la liga: quiénes juegan, ida o ida y vuelta, fecha de la jornada 1 y cada cuántos días,
 * canchas (mesas en ping pong) y horas. Muestra cómo queda (jornadas, partidos sin hora y choques) antes de crearlo.
 */
export function ScheduleBuilder({ event, cfg }: { event: RacketEvent; cfg: PairsLeagueConfig }) {
  const { lid, base, league } = useLeagueCtx();
  const { sport, ext, doubles, side, leagueRules } = useRacket();
  const w = courtWords(ext);
  const names = useNames();
  const { toast } = useFeedback();
  const existing = useMatches({ lid }).data;
  const [draft, setDraft] = useState<PairsLeagueConfig>(() => ({
    ...cfg,
    courts: cfg.courts.length ? cfg.courts : [`${w.One} 1`, `${w.One} 2`],
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
      <Card className="flex flex-col gap-3.5 px-5 pt-[18px] pb-5">
        <p className="text-[17px] font-[650] tracking-[-0.01em]">1. ¿Quiénes juegan?</p>
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
          <p className="text-[13px] font-semibold text-danger">
            {incomplete.map(names.entrantName).join(', ')}: la pareja no tiene dos jugadores.
          </p>
        )}
      </Card>

      <Card className="flex flex-col gap-4 px-5 pt-[18px] pb-5">
        <p className="text-[17px] font-[650] tracking-[-0.01em]">2. Fechas, {w.many} y horas</p>
        <ToggleRow checked={draft.double} onChange={(double) => set({ double })} label="Ida y vuelta" hint={`Cada ${side[0]} juega dos veces contra cada rival`} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Jornada 1">
            <Input type="date" value={draft.startDate} onChange={(e) => set({ startDate: e.target.value })} />
          </Field>
          <Stepper label="Cada cuántos días" value={draft.everyDays} min={1} max={30} onChange={(everyDays) => set({ everyDays })} suffix="días" />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted">{w.Many}</span>
          <div className="grid grid-cols-2 gap-2">
            {draft.courts.map((c, i) => (
              <div key={i} className="flex gap-1">
                <Input value={c} maxLength={40} aria-label={`${w.One} ${i + 1}`} onChange={(e) => set({ courts: draft.courts.map((x, j) => (j === i ? e.target.value : x)) })} />
                <Button variant="ghost" className="size-11 shrink-0 rounded-full text-faint" icon={<X className="size-4" />} aria-label={`Quitar ${w.one}`} onClick={() => set({ courts: draft.courts.filter((_, j) => j !== i) })} />
              </div>
            ))}
          </div>
          <Button variant="soft" className="h-11 self-start rounded-full" icon={<Plus className="size-4" />} onClick={() => set({ courts: [...draft.courts, `${w.One} ${draft.courts.length + 1}`] })}>
            {w.One}
          </Button>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted">Horas de cada jornada</span>
          <div className="grid grid-cols-2 gap-2">
            {draft.times.map((t, i) => (
              <div key={i} className="flex gap-1">
                <Input type="time" value={t} aria-label={`Hora ${i + 1}`} onChange={(e) => set({ times: draft.times.map((x, j) => (j === i ? e.target.value : x)) })} />
                <Button variant="ghost" className="size-11 shrink-0 rounded-full text-faint" icon={<X className="size-4" />} aria-label="Quitar hora" onClick={() => set({ times: draft.times.filter((_, j) => j !== i) })} />
              </div>
            ))}
          </div>
          <Button
            variant="soft"
            className="h-11 self-start rounded-full"
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
          {/* Pickleball y ping pong traen sus propios puntos de tabla (partidos ganados; ganar 2, perder 1). */}
          {!isGameSport(sport) && (
            <Field label="Puntos de la tabla">
              <Select value={draft.points} onChange={(e) => set({ points: e.target.value === '2-0' ? '2-0' : 'standard' })}>
                <option value="standard">Ganar 3, perder 1, W.O. 0</option>
                <option value="2-0">Ganar 2, perder 0</option>
              </Select>
            </Field>
          )}
        </div>
      </Card>

      <Card className="flex flex-col gap-3 px-5 pt-[18px] pb-5">
        <p className="text-[17px] font-[650] tracking-[-0.01em]">3. Así queda</p>
        {draft.pairs.length < 2 ? (
          <p className="text-sm text-muted">Elige al menos 2 {side[1]}.</p>
        ) : (
          <>
            <p className="text-body">
              <b className="num">{plan.jornadas}</b> jornadas · <b className="num">{plan.drafts.length}</b> partidos
              {draft.pairs.length % 2 === 1 && ` · descansa ${doubles ? 'una pareja' : 'uno'} por jornada`}
            </p>
            {firstDates.length > 0 && (
              <ul className="text-meta text-muted">
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
              <p className="flex items-start gap-2 rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                {plan.unassigned} {plan.unassigned === 1 ? 'partido no cabe' : 'partidos no caben'} en las {w.many} y horas: {plan.unassigned === 1 ? 'queda' : 'quedan'} sin hora. Agrega una {w.one} o una hora.
              </p>
            )}
            {plan.clashes.length > 0 && (
              <div className="flex flex-col gap-1 rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">
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
            <Button variant="primary" size="xl" className="mt-1 w-full" icon={<CalendarPlus className="size-5" />} loading={busy} disabled={draft.pairs.length < 2} onClick={() => void create()}>
              Crear el calendario
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
