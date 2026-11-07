/**
 * Armar un torneo relámpago y «Pasar a la fase final» en la app (TournamentBuilder.tsx de la web, con su lógica:
 * tournament.ts y calendarAdmin.ts): los equipos, cuántos grupos, cuántos clasifican, el día, la hora del primer
 * partido, cada cuánto sale un turno y las canchas. Muestra los grupos y los partidos antes de guardar; se guarda en un
 * lote y el armado queda en las reglas de la liga (`rules.tournament`) para después pasar a los clasificados.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { ArrowRightLeft, Shuffle, Trophy } from 'lucide-react-native';
import { createMatches } from '@mm/lib/data/matches';
import { saveLeagueRules } from '@mm/lib/data/teamSports';
import { toIsoDate } from '@mm/lib/format';
import { useNow } from '@mm/lib/useNow';
import { seededRandom, shuffle } from '@mm/sports/formats/random';
import { applyTournamentChanges, changeText, defaultGroups, groupOptions, nextRound, PER_GROUP_OPTIONS, toggleTeam, tournamentChanges, tournamentPlanOf } from '@mm/pages/sports/team/calendarAdmin';
import { tournamentDrafts, tournamentErrors } from '@mm/pages/sports/team/tournament';
import type { TeamLeague } from '@mm/pages/sports/team/useTeamLeague';
import { DateStepper } from '@/components/DateStepper';
import { TimeStepper } from '@/components/esports/fields';
import { ToggleRow } from '@/components/esports/inputs';
import { PickField } from '@/components/players/fields';
import { Button, Card, Field, Input, Sheet, Txt } from '@/components/ui';
import { TeamName } from '../TeamBits';
import { act, NumField, TeamChips, Warn } from './parts';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

export interface TournamentBuilderProps {
  tl: TeamLeague;
  open: boolean;
  onClose: () => void;
  /** matches.format del deporte. */
  format?: string;
  /** Minutos por turno por defecto (el partido con su descanso). */
  slotMinutes?: number;
  /** Reglas de los partidos de la eliminatoria (p. ej. penales si empatan). */
  knockoutRules?: Record<string, unknown>;
}

/** «Torneo relámpago» (la hoja). Al abrir: 1 grupo con pocos equipos (final entre los 2 primeros), 2 grupos desde 6. */
export function TournamentBuilderSheet(props: TournamentBuilderProps) {
  if (!props.open) return null;
  return <TournamentBuilderOpen {...props} />;
}

function TournamentBuilderOpen({ tl, onClose, format, slotMinutes = 50, knockoutRules }: TournamentBuilderProps) {
  const c = useColors();
  const today = toIsoDate(useNow());
  const teams = tl.teams.data;
  const [picked, setPicked] = useState<string[] | null>(null);
  const [seed, setSeed] = useState(0);
  const [groups, setGroups] = useState(() => String(defaultGroups(teams.length)));
  const [perGroup, setPerGroup] = useState('2');
  const [third, setThird] = useState(false);
  const [date, setDate] = useState(today);
  const [start, setStart] = useState('08:00');
  const [slot, setSlot] = useState(String(slotMinutes));
  const [courtsText, setCourtsText] = useState(tl.league.venue || 'Cancha 1');
  const [busy, setBusy] = useState(false);

  const base = picked ?? teams.map((t) => t.id);
  // «Sortear»: mezcla el orden (el primero de cada grupo sale del orden de los equipos).
  const ids = seed ? shuffle(base, seededRandom(seed)) : base;
  const g = Number(groups);
  const q = Number(perGroup);
  const errors = tournamentErrors({ teams: ids, groups: g, perGroup: q });
  const plan = tournamentPlanOf({ teams: ids, groups: g, perGroup: q, thirdPlace: third, date, start, slot, slotMinutes, courtsText, tz: tl.tz, firstRound: nextRound(tl.matches.data) });
  const name = (id: string | null, label: string) => (id ? (tl.teamOf(id)?.name ?? '¿?') : label);

  const save = async () => {
    if (!plan) return;
    setBusy(true);
    const ok = await act(async () => {
      await createMatches(tl.lid, tournamentDrafts(plan, { format, knockoutRules }));
      await saveLeagueRules(tl.lid, { tournament: { groups: g, perGroup: q, thirdPlace: third } });
      return true;
    }, `Torneo listo: ${plan.games.length} partidos`);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Torneo relámpago"
      subtitle="Grupos y la final, en un día"
      footer={
        <Button variant="primary" size="lg" full loading={busy} disabled={!plan} onPress={() => void save()} icon={<Trophy size={20} color={c.accentFg} />}>
          {`Crear ${plan?.games.length ?? 0} partidos`}
        </Button>
      }
    >
      <TeamChips teams={teams} ids={base} onToggle={(id) => setPicked((p) => toggleTeam(p, base, id))} />
      <Field label="Grupos">
        <PickField label="Grupos" options={groupOptions(ids.length)} value={groups} onChange={setGroups} />
      </Field>
      <Field label="Clasifican por grupo">
        <PickField label="Clasifican por grupo" options={PER_GROUP_OPTIONS} value={perGroup} onChange={setPerGroup} />
      </Field>
      <Field label="Día">
        <DateStepper value={date} onChange={setDate} />
      </Field>
      <Field label="Primer partido">
        <TimeStepper value={start} onChange={setStart} label="Primer partido" />
      </Field>
      <NumField label="Un turno cada (min)" hint="El partido más el descanso" value={slot} onChange={(t) => setSlot(t.replace(/\D/g, '').slice(0, 3))} />
      <Field label="Canchas" hint="Separadas por coma">
        <Input value={courtsText} onChangeText={setCourtsText} placeholder="Cancha 1, Cancha 2" accessibilityLabel="Canchas" />
      </Field>
      <ToggleRow checked={third} onChange={setThird} label="Partido por el 3.er lugar" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <Button size="lg" icon={<Shuffle size={16} color={c.fg} />} onPress={() => setSeed(Date.now())}>
          Sortear los grupos
        </Button>
        {seed !== 0 && (
          <Button variant="ghost" size="lg" onPress={() => setSeed(0)}>
            Por orden
          </Button>
        )}
      </View>
      {errors.length > 0 && <Warn>{errors[0]}</Warn>}
      {plan && (
        <View style={{ gap: 12 }}>
          {plan.groups.map((gr) => (
            <View key={gr.name} style={{ borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: c.surface2, gap: 4 }}>
              <Txt variant="meta" style={{ fontFamily: font.semibold }}>
                {gr.name}
              </Txt>
              {gr.teams.map((t) => (
                <TeamName key={t} team={tl.teamOf(t)} />
              ))}
            </View>
          ))}
          <View style={{ borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: c.surface2, gap: 4 }}>
            {plan.games.map((m, k) => (
              <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Txt variant="meta" tone="muted" style={{ width: 48 }}>
                  {m.time}
                </Txt>
                <Txt variant="small" tone="muted" numberOfLines={1} style={{ width: 88 }}>
                  {m.stage}
                </Txt>
                <Txt variant="meta" numberOfLines={1} style={{ flex: 1 }}>
                  {`${name(m.home, m.homeLabel)} vs. ${name(m.away, m.awayLabel)}`}
                </Txt>
                {!!m.court && (
                  <Txt variant="small" tone="muted">
                    {m.court}
                  </Txt>
                )}
              </View>
            ))}
          </View>
        </View>
      )}
    </Sheet>
  );
}

/**
 * Admin: pasar a la fase final a los que ya se saben (los clasificados de los grupos que terminaron y los ganadores
 * de la eliminatoria). `rankGroup(stage)` = la tabla de ese grupo (ids en orden) o null si todavía no termina.
 */
export function TournamentAdvance({ tl, rankGroup }: { tl: TeamLeague; rankGroup: (stage: string) => string[] | null }) {
  const now = useNow(30_000).getTime();
  const [busy, setBusy] = useState(false);
  const changes = tournamentChanges(tl, rankGroup, now);
  const c = useColors();
  if (!tl.isAdmin || !changes.length) return null;
  const apply = async () => {
    setBusy(true);
    await act(() => applyTournamentChanges(tl.lid, changes), 'Fase final al día');
    setBusy(false);
  };
  return (
    <Card style={{ gap: 12, backgroundColor: c.accentSoft }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <ArrowRightLeft size={16} color={c.accent} />
        <Txt variant="meta" tone="accent" style={{ fontFamily: font.semibold }}>
          Pasar a la fase final
        </Txt>
      </View>
      <View style={{ gap: 4 }}>
        {changes.map((ch) => (
          <Txt key={ch.matchId} tone="fg2" style={{ fontSize: 15 }}>
            {changeText(ch, tl.matches.data, (id) => tl.teamOf(id)?.name)}
          </Txt>
        ))}
      </View>
      <Button variant="primary" size="lg" full loading={busy} onPress={() => void apply()}>
        Poner estos equipos
      </Button>
    </Card>
  );
}
