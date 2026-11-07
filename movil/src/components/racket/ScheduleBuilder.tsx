/**
 * Armar el calendario de la liga en Pro (ScheduleBuilder.tsx de la web, con su misma lógica: logic/league.ts): quiénes
 * juegan, ida o ida y vuelta, la fecha de la jornada 1 y cada cuántos días, canchas (mesas en ping pong) y horas. Muestra
 * cómo queda (jornadas, partidos sin hora y choques) antes de crearlo.
 */
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { AlertTriangle, CalendarPlus, Plus, X } from 'lucide-react-native';
import { createMatches, useMatches } from '@mm/lib/data/matches';
import { updateRacketEvent, type RacketEvent } from '@mm/lib/data/racket';
import { saveErrorMessage } from '@mm/lib/errorText';
import { useLeagueCtx } from '@mm/lib/league';
import { isGameSport } from '@mm/sports/racket/rules';
import { buildLeagueSchedule, clashText, firstJornadas, leagueConfigJson, nextSlotTime, type PairsLeagueConfig } from '@mm/pages/sports/racket/logic/league';
import { localParts, timeLabel } from '@mm/pages/sports/racket/logic/time';
import { useNames } from '@mm/pages/sports/racket/names';
import { courtWords } from '@mm/pages/sports/racket/sport';
import { DateStepper } from '../DateStepper';
import { TimeStepper } from '../esports/fields';
import { ChoiceChips, ToggleRow } from '../esports/inputs';
import { toast } from '../feedback';
import { Button, Card, Field, Input, Txt } from '../ui';
import { PickList, Stepper, useRacketPhone } from './parts';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

export function ScheduleBuilder({ event, cfg }: { event: RacketEvent; cfg: PairsLeagueConfig }) {
  const c = useColors();
  const { lid, league } = useLeagueCtx();
  const { sport, ext, doubles, side, leagueRules } = useRacketPhone();
  const w = courtWords(ext);
  const names = useNames();
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

  const firstDates = firstJornadas(plan);
  const step = (t: string) => <Txt style={{ fontSize: 17, fontFamily: font.bold, letterSpacing: -0.2 }}>{t}</Txt>;
  const label = (t: string) => (
    <Txt tone="muted" style={{ fontSize: 12, fontFamily: font.medium }}>
      {t}
    </Txt>
  );
  const remove = (a11y: string, onPress: () => void) => (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} hitSlop={4} onPress={onPress} style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}>
      <X size={18} color={c.faint} />
    </Pressable>
  );

  return (
    <View style={{ gap: 16 }}>
      <Card style={{ gap: 14 }}>
        {step('1. ¿Quiénes juegan?')}
        <PickList
          items={items}
          selected={new Set(draft.pairs)}
          onToggle={(id) => set({ pairs: draft.pairs.includes(id) ? draft.pairs.filter((x) => x !== id) : [...draft.pairs, id] })}
          empty={
            doubles ? (
              <Txt tone="muted" style={{ fontSize: 14 }}>
                No hay parejas todavía.{' '}
                <Txt accessibilityRole="link" style={{ fontSize: 14, fontFamily: font.medium, color: c.accent }} onPress={() => router.push({ pathname: '/l/[lid]/parejas', params: { lid } })}>
                  Arma las parejas
                </Txt>
              </Txt>
            ) : (
              'No hay jugadores todavía.'
            )
          }
        />
        {incomplete.length > 0 && (
          <Txt tone="danger" style={{ fontSize: 13, fontFamily: font.semibold }}>
            {`${incomplete.map(names.entrantName).join(', ')}: la pareja no tiene dos jugadores.`}
          </Txt>
        )}
      </Card>

      <Card style={{ gap: 16 }}>
        {step(`2. Fechas, ${w.many} y horas`)}
        <ToggleRow checked={draft.double} onChange={(double) => set({ double })} label="Ida y vuelta" hint={`Cada ${side[0]} juega dos veces contra cada rival`} />
        <Field label="Jornada 1">
          <DateStepper value={draft.startDate} onChange={(startDate) => set({ startDate })} />
        </Field>
        <Stepper label="Cada cuántos días" value={draft.everyDays} min={1} max={30} onChange={(everyDays) => set({ everyDays })} suffix="días" />
        <View style={{ gap: 8 }}>
          {label(w.Many)}
          {draft.courts.map((name, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ flex: 1 }}>
                <Input value={name} maxLength={40} accessibilityLabel={`${w.One} ${i + 1}`} onChangeText={(v) => set({ courts: draft.courts.map((x, j) => (j === i ? v : x)) })} />
              </View>
              {remove(`Quitar ${w.one}`, () => set({ courts: draft.courts.filter((_, j) => j !== i) }))}
            </View>
          ))}
          <View style={{ alignSelf: 'flex-start' }}>
            <Button variant="soft" icon={<Plus size={16} color={c.accent} />} onPress={() => set({ courts: [...draft.courts, `${w.One} ${draft.courts.length + 1}`] })}>
              {w.One}
            </Button>
          </View>
        </View>
        <View style={{ gap: 8 }}>
          {label('Horas de cada jornada')}
          {draft.times.map((t, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ flex: 1 }}>
                <TimeStepper value={t} label={`Hora ${i + 1}`} onChange={(v) => set({ times: draft.times.map((x, j) => (j === i ? v : x)) })} />
              </View>
              {remove('Quitar hora', () => set({ times: draft.times.filter((_, j) => j !== i) }))}
            </View>
          ))}
          <View style={{ alignSelf: 'flex-start' }}>
            <Button variant="soft" icon={<Plus size={16} color={c.accent} />} onPress={() => set({ times: [...draft.times, nextSlotTime(draft.times.at(-1), draft.minutes)] })}>
              Hora
            </Button>
          </View>
        </View>
        <Stepper label="Minutos por partido" value={draft.minutes} min={30} max={180} step={15} onChange={(minutes) => set({ minutes })} />
        {/* Pickleball y ping pong traen sus propios puntos de tabla (partidos ganados; ganar 2, perder 1). */}
        {!isGameSport(sport) && (
          <View style={{ gap: 8 }}>
            {label('Puntos de la tabla')}
            <ChoiceChips<'standard' | '2-0'>
              label="Puntos de la tabla"
              value={draft.points === '2-0' ? '2-0' : 'standard'}
              items={[
                { key: 'standard', label: 'Ganar 3, perder 1, W.O. 0' },
                { key: '2-0', label: 'Ganar 2, perder 0' },
              ]}
              onChange={(points) => set({ points })}
            />
          </View>
        )}
      </Card>

      <Card style={{ gap: 12 }}>
        {step('3. Así queda')}
        {draft.pairs.length < 2 ? (
          <Txt tone="muted" style={{ fontSize: 14 }}>
            {`Elige al menos 2 ${side[1]}.`}
          </Txt>
        ) : (
          <>
            <Txt>
              <Txt style={{ fontFamily: font.bold }}>{plan.jornadas}</Txt> jornadas · <Txt style={{ fontFamily: font.bold }}>{plan.drafts.length}</Txt> partidos
              {draft.pairs.length % 2 === 1 ? ` · descansa ${doubles ? 'una pareja' : 'uno'} por jornada` : ''}
            </Txt>
            {firstDates.length > 0 && (
              <View style={{ gap: 2 }}>
                {firstDates.map((f) => (
                  <Txt key={f.round} variant="meta" tone="muted">
                    {`Jornada ${f.round}: ${f.date ?? 'sin fecha'}${f.time ? ` · desde las ${timeLabel(f.time)}` : ''}`}
                  </Txt>
                ))}
                {plan.jornadas > firstDates.length && (
                  <Txt variant="meta" tone="muted">
                    …
                  </Txt>
                )}
              </View>
            )}
            {plan.unassigned > 0 && (
              <View style={{ flexDirection: 'row', gap: 8, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: c.dangerSoft }}>
                <AlertTriangle size={16} color={c.danger} style={{ marginTop: 2 }} />
                <Txt tone="danger" style={{ flex: 1, fontSize: 14 }}>
                  {`${plan.unassigned} ${plan.unassigned === 1 ? 'partido no cabe' : 'partidos no caben'} en las ${w.many} y horas: ${plan.unassigned === 1 ? 'queda' : 'quedan'} sin hora. Agrega una ${w.one} o una hora.`}
                </Txt>
              </View>
            )}
            {plan.clashes.length > 0 && (
              <View style={{ gap: 4, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: c.dangerSoft }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <AlertTriangle size={16} color={c.danger} />
                  <Txt tone="danger" style={{ fontSize: 14, fontFamily: font.semibold }}>{`Choques (${plan.clashes.length})`}</Txt>
                </View>
                {plan.clashes.slice(0, 5).map((x, i) => {
                  const other = [x.a, x.b].find((id) => id.startsWith('m:'));
                  const m = other ? existing.find((e) => `m:${e.id}` === other) : null;
                  const when = m ? localParts(m.scheduledAt, league.tz) : null;
                  return (
                    <Txt key={i} tone="danger" style={{ fontSize: 14 }}>
                      {`${clashText(x, (id) => (names.team(id) ? names.entrantName(id) : names.nameOf(id)))}${when ? ` (ya juega el ${when.date} a las ${timeLabel(when.time)})` : ''}`}
                    </Txt>
                  );
                })}
              </View>
            )}
            <Button variant="primary" size="xl" full icon={<CalendarPlus size={20} color={c.accentFg} />} loading={busy} disabled={draft.pairs.length < 2} onPress={() => void create()}>
              Crear el calendario
            </Button>
          </>
        )}
      </Card>
    </View>
  );
}
