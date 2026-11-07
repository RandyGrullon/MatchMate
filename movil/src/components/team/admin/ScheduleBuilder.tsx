/**
 * Armar el calendario de la temporada y el partido suelto en la app (ScheduleBuilder.tsx de la web, con su lógica:
 * schedule.ts y calendarAdmin.ts): todos contra todos de ida o de ida y vuelta, una jornada cada N días, con horas y
 * canchas, y aviso de choques antes de guardar; se guarda en lotes (los ids salen del teléfono). Las fechas con
 * «‹ ›» y la hora con «−1 h / +1 h» (en el teléfono no se usa el calendario del sistema).
 */
import { useState } from 'react';
import { View } from 'react-native';
import { CalendarPlus, Coffee } from 'lucide-react-native';
import { createMatches } from '@mm/lib/data/matches';
import { useNow } from '@mm/lib/useNow';
import { whenText } from '@mm/components/match/format';
import { clashSummary, EVERY_OPTIONS, MAX_BATCH, nextRound, nextWeekday, ROUNDS_OPTIONS, scheduleByRound, schedulePlanOf, singleMatchValid, toggleTeam } from '@mm/pages/sports/team/calendarAdmin';
import { matchClashes, planClashes, planDrafts, zonedIso } from '@mm/pages/sports/team/schedule';
import type { TeamLeague } from '@mm/pages/sports/team/useTeamLeague';
import { DateStepper } from '@/components/DateStepper';
import { TimeStepper } from '@/components/esports/fields';
import { PickField } from '@/components/players/fields';
import { Badge, Button, Field, Input, Sheet, Txt } from '@/components/ui';
import { act, Half, NumField, Pair, TeamChips, Warn } from './parts';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

export interface ScheduleBuilderProps {
  tl: TeamLeague;
  open: boolean;
  onClose: () => void;
  /** matches.format del deporte ('fiba', '3x3', 'football'…). */
  format?: string;
  /** Lo que dura un partido (para los choques). */
  minutes?: number;
  /** Ida y vuelta marcado al abrir (p. ej. «Liga de campo ida y vuelta»). */
  defaultDouble?: boolean;
}

/** «Armar el calendario» (la hoja). Cada vez que se abre empieza en la jornada que sigue a las que ya hay. */
export function ScheduleBuilderSheet(props: ScheduleBuilderProps) {
  if (!props.open) return null;
  return <ScheduleBuilderOpen {...props} />;
}

function ScheduleBuilderOpen({ tl, onClose, format, minutes = 90, defaultDouble = false }: ScheduleBuilderProps) {
  const c = useColors();
  const now = useNow().getTime();
  const teams = tl.teams.data;
  const [picked, setPicked] = useState<string[] | null>(null);
  const [double, setDouble] = useState(defaultDouble);
  const [start, setStart] = useState(() => nextWeekday(6, now));
  const [every, setEvery] = useState('7');
  const [timesText, setTimesText] = useState('7:00 pm, 8:30 pm');
  const [courtsText, setCourtsText] = useState(tl.league.venue ? `${tl.league.venue}` : 'Cancha 1');
  const [skipText, setSkipText] = useState('');
  const [firstRound, setFirstRound] = useState(() => String(nextRound(tl.matches.data)));
  const [busy, setBusy] = useState(false);

  const ids = picked ?? teams.map((t) => t.id);
  const { plan, times } = schedulePlanOf({ teams: ids, double, start, every, timesText, courtsText, skipText, firstRound, tz: tl.tz });
  const clashes = plan ? planClashes(plan, tl.matches.data, minutes, tl.tz) : [];
  const byRound = scheduleByRound(plan);
  const name = (id: string) => tl.teamOf(id)?.name ?? '¿?';

  const save = async () => {
    if (!plan) return;
    setBusy(true);
    const drafts = planDrafts(plan, { format });
    const ok = await act(async () => {
      for (let i = 0; i < drafts.length; i += MAX_BATCH) await createMatches(tl.lid, drafts.slice(i, i + MAX_BATCH));
      return true;
    }, `Calendario listo: ${drafts.length} partidos`);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Armar el calendario"
      subtitle="Todos contra todos, con horas y canchas"
      footer={
        <Button
          variant="primary"
          size="lg"
          full
          loading={busy}
          disabled={!plan || !plan.matches.length || times.times.length === 0}
          onPress={() => void save()}
          icon={<CalendarPlus size={20} color={c.accentFg} />}
        >
          {`Crear ${plan?.matches.length ?? 0} partidos`}
        </Button>
      }
    >
      <TeamChips teams={teams} ids={ids} onToggle={(id) => setPicked((p) => toggleTeam(p, ids, id))} />
      <Field label="Vueltas">
        <PickField label="Vueltas" options={ROUNDS_OPTIONS} value={double ? '2' : '1'} onChange={(k) => setDouble(k === '2')} />
      </Field>
      <Field label="Primera jornada">
        <DateStepper value={start} onChange={setStart} />
      </Field>
      <Field label="Una jornada cada">
        <PickField label="Una jornada cada" options={EVERY_OPTIONS} value={every} onChange={setEvery} />
      </Field>
      <NumField label="Empieza en la jornada" value={firstRound} onChange={(t) => setFirstRound(t.replace(/\D/g, ''))} />
      <Field label="Horas de juego" hint={times.bad.length ? `No se entiende: ${times.bad.join(', ')}` : 'Separadas por coma: 7:00 pm, 8:30 pm'} error={times.bad.length > 0}>
        <Input value={timesText} onChangeText={setTimesText} accessibilityLabel="Horas de juego" />
      </Field>
      <Field label="Canchas" hint="Separadas por coma">
        <Input value={courtsText} onChangeText={setCourtsText} placeholder="Cancha 1, Cancha 2" accessibilityLabel="Canchas" />
      </Field>
      <Field label="Fechas sin juego (opcional)" hint="AAAA-MM-DD, separadas por coma: la jornada pasa al día siguiente">
        <Input value={skipText} onChangeText={setSkipText} placeholder="2026-12-24, 2026-12-31" accessibilityLabel="Fechas sin juego (opcional)" />
      </Field>

      {plan && (
        <View style={{ gap: 8 }}>
          <Txt style={{ fontSize: 15, fontFamily: font.semibold }}>{`${byRound.length} jornadas · ${plan.matches.length} partidos`}</Txt>
          {times.times.length === 0 && <Warn>Escribe al menos una hora de juego.</Warn>}
          {plan.unassigned.length > 0 && <Warn>{`${plan.unassigned.length} partidos no caben en las horas y canchas de su jornada: quedan sin hora. Agrega otra hora u otra cancha.`}</Warn>}
          {clashes.length > 0 && <Warn>{clashSummary(clashes, name)}</Warn>}
          {byRound.map(([round, list]) => (
            <View key={round} style={{ borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: c.surface2, gap: 2 }}>
              <Txt variant="meta" style={{ fontFamily: font.semibold }}>
                {`Jornada ${round}  `}
                <Txt variant="meta" tone="muted">
                  {list[0]?.date ?? ''}
                </Txt>
              </Txt>
              {list.map((m, k) => (
                <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Txt variant="meta" tone="muted" style={{ width: 48 }}>
                    {m.time ?? '—'}
                  </Txt>
                  <Txt variant="meta" numberOfLines={1} style={{ flex: 1 }}>
                    {`${name(m.home)} vs. ${name(m.away)}`}
                  </Txt>
                  {!!m.court && (
                    <Txt variant="small" tone="muted">
                      {m.court}
                    </Txt>
                  )}
                </View>
              ))}
              {plan.byes
                .filter((b) => b.round === round)
                .map((b) => (
                  <View key={b.team} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Coffee size={14} color={c.muted} />
                    <Txt variant="small" tone="muted">{`Descansa ${name(b.team)}`}</Txt>
                  </View>
                ))}
            </View>
          ))}
        </View>
      )}
    </Sheet>
  );
}

export interface SingleMatchProps {
  tl: TeamLeague;
  open: boolean;
  onClose: () => void;
  format?: string;
  minutes?: number;
}

/** Un partido suelto: dos equipos, fecha, hora, cancha, jornada y fase («Final»). */
export function SingleMatchSheet(props: SingleMatchProps) {
  if (!props.open) return null;
  return <SingleMatchOpen {...props} />;
}

function SingleMatchOpen({ tl, onClose, format, minutes = 90 }: SingleMatchProps) {
  const now = useNow().getTime();
  const teams = tl.teams.data;
  const [home, setHome] = useState('');
  const [away, setAway] = useState('');
  const [date, setDate] = useState(() => nextWeekday(6, now));
  const [time, setTime] = useState('19:00');
  const [court, setCourt] = useState(tl.league.venue || 'Cancha 1');
  const [round, setRound] = useState('');
  const [stage, setStage] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = singleMatchValid({ home, away, date, time });
  const clashes = valid ? matchClashes({ date, time, court: court.trim() || null, teams: [home, away] }, tl.matches.data, minutes, tl.tz) : [];
  const options = (other: string) => [{ key: '', label: 'Elige…' }, ...teams.filter((t) => t.id !== other).map((t) => ({ key: t.id, label: t.name }))];
  const save = async () => {
    setBusy(true);
    const ok = await act(async () => {
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
      open
      onClose={onClose}
      title="Partido suelto"
      subtitle="Un amistoso, una final o uno aplazado"
      footer={
        <Button variant="primary" size="lg" full loading={busy} disabled={!valid} onPress={() => void save()}>
          Crear partido
        </Button>
      }
    >
      <Field label="Local">
        <PickField label="Local" options={options(away)} value={home} onChange={setHome} />
      </Field>
      <Field label="Visita">
        <PickField label="Visita" options={options(home)} value={away} onChange={setAway} />
      </Field>
      <Field label="Fecha">
        <DateStepper value={date} onChange={setDate} />
      </Field>
      <Field label="Hora">
        <TimeStepper value={time} onChange={setTime} label="Hora" />
      </Field>
      <Pair>
        <Half>
          <Field label="Cancha">
            <Input value={court} maxLength={40} onChangeText={setCourt} accessibilityLabel="Cancha" />
          </Field>
        </Half>
        <Half>
          <NumField label="Jornada (opcional)" value={round} onChange={(t) => setRound(t.replace(/\D/g, '').slice(0, 3))} />
        </Half>
      </Pair>
      <Field label="Fase (opcional)" hint="Semifinal, Final, Amistoso…">
        <Input value={stage} maxLength={40} onChangeText={setStage} accessibilityLabel="Fase (opcional)" />
      </Field>
      {valid && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Txt variant="meta" tone="muted">
            {whenText(zonedIso(date, time, tl.tz), tl.tz)}
          </Txt>
          {clashes.length > 0 && <Badge tone="warn">Choca con otro partido</Badge>}
        </View>
      )}
    </Sheet>
  );
}
