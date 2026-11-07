/**
 * El acta digital de fútbol y sala en la app (FootballCourt.tsx de la web, con la misma máquina: useCourt +
 * footballAdapter, y la lógica de src/pages/sports/football/court.ts):
 * - arriba, el marcador grande, el tiempo y el minuto (corrido en campo, parado en sala), el añadido, las faltas
 *   acumuladas de sala con la alerta de la 5.ª y el tiro de 10 m desde la 6.ª, los tiempos muertos y las rojas;
 * - dos botones gigantes GOL (local y visita): el gol cuenta al toque y después, si se quiere, quién marcó y quién
 *   asistió (o autogol);
 * - los dorsales de los dos equipos: tarjetas (la 2.ª amarilla avisa que es roja), cambios, portero y faltas;
 * - fin de cada tiempo, prórroga y la tanda de penales paso a paso, los 2 minutos con uno menos de sala, y Deshacer
 *   siempre a la vista.
 * Todo se guarda en el teléfono en cada toque; se publica en cada gol o roja, en el descanso y al final (y cuando el
 * reloj arranca o se para), nunca por jugada. La pantalla no se apaga mientras se anota (CourtShell).
 */
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { AlertTriangle, ArrowLeftRight, Goal, Hand, MoreHorizontal, Pause, Play, ShieldAlert, Timer, Users, X } from 'lucide-react-native';
import { useCourt } from '@mm/court/useCourt';
import { setMatchPlayers, type Match } from '@mm/lib/data/matches';
import { knownServerOffset, useMatchRsvps, useServerOffset } from '@mm/lib/data/teamSports';
import { saveErrorMessage } from '@mm/lib/errorText';
import { useNow } from '@mm/lib/useNow';
import { formatClock } from '@mm/sports/team/clock';
import type { Suspended } from '@mm/sports/team/discipline';
import {
  activePowerPlays,
  footballTimeoutsLeft,
  foulStatus,
  minuteLabel,
  periodElapsed,
  shootoutScore,
  type FootballConfig,
  type FootballEvent,
  type FootballState,
  type FootballVariant,
} from '@mm/sports/team/football';
import type { Side } from '@mm/sports/types';
import { atBreak, eventLabel, footballAdapter, quietAdapter, replaceLastEvent, stageLabel } from '@mm/pages/sports/football/adapter';
import {
  ADDED_MINUTES,
  benchFor,
  finishText as finishLine,
  goalSheetTitle,
  lastGoalMinute,
  nextKicker,
  parseElapsed,
  periodEndLabel,
  periodEndNext,
  pickableIds,
  sameGoal,
  sideIds,
  subsMax,
  type GoalFlow,
} from '@mm/pages/sports/football/court';
import type { LineupSide } from '@mm/pages/sports/football/lineup';
import { footballConfigFrom, footballTeamRules, REASON_TEXT } from '@mm/pages/sports/football/rules';
import { rosterOf, shortName, teamColor, textOn } from '@mm/pages/sports/team/logic';
import type { TeamLeague } from '@mm/pages/sports/team/useTeamLeague';
import { confirmAsync, toast } from '../feedback';
import { DangerButton } from '../team/TeamBits';
import { Button, Field, Input, Sheet, Txt } from '../ui';
import { Note } from './BasketballCourt';
import { CourtShell } from './CourtShell';
import { LineupSheet } from './team/LineupSheet';
import { BigButton, BigText, CardIcon, JerseyButton, ScoreHeader, StatText, SubText } from './team/ScorerPieces';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/** La hora de la jugada (se lee al tocar, nunca al pintar). */
const stamp = () => Date.now();

export function FootballCourt({
  tl,
  match: m,
  variant,
  suspended = [],
  onExit,
}: {
  tl: TeamLeague;
  match: Match;
  variant: FootballVariant;
  /** Los suspendidos para este partido (la app avisa, no bloquea). */
  suspended?: readonly Suspended[];
  onExit: () => void;
}) {
  const c = useColors();
  const config = footballConfigFrom(m.rules, variant);
  const rules = footballTeamRules(m.rules, variant);
  // La hora del servidor (para el minuto que ven los demás): se pide una vez; el adaptador la lee al publicar.
  useServerOffset();
  // `quietly`: cambiar quién marcó sin publicar el deshacer de en medio (replaceLastEvent).
  const [{ adapter, quietly }] = useState(() => quietAdapter(footballAdapter({ offset: knownServerOffset })));
  // Hitos (reloj, fin del tiempo) como mucho cada 5 s; los goles y las rojas se publican al toque (flush).
  const court = useCourt<FootballConfig, FootballState, FootballEvent>({
    lid: tl.lid,
    matchId: m.id,
    userId: tl.userId,
    adapter,
    status: m.status,
    config,
    publisher: { minGapMs: 5_000 },
  });
  const s = court.state;
  const rsvps = useMatchRsvps(tl.lid, [m.id]);
  const [goal, setGoal] = useState<GoalFlow | null>(null);
  const [pick, setPick] = useState<{ side: Side; playerId: string } | null>(null);
  const [subOut, setSubOut] = useState<{ side: Side; playerId: string } | null>(null);
  const [ending, setEnding] = useState(false);
  const [more, setMore] = useState(false);
  const [lineup, setLineup] = useState(false);
  // El reloj sale de marcas de tiempo: corriendo (o con uno menos), se vuelve a pintar cada medio segundo.
  const ticking = !!s && (s.clock.running || s.powerPlays.some((p) => p.endedBy === null));
  const now = useNow(ticking ? 500 : 60_000).getTime();
  const pps = s ? activePowerPlays(s, now) : [];

  const teams = m.sides.map((sd) => tl.teamOf(sd.teamId));
  const colors = [teamColor(teams[0], 1), teamColor(teams[1], 2)] as const;
  const names = [teams[0]?.name ?? m.sides[0].label, teams[1]?.name ?? m.sides[1].label] as const;
  const readOnly = court.readOnly || court.over || !s;
  const official = tl.officialOf(m.id);
  const suspendedIds = new Map(suspended.map((x) => [`${x.team}:${x.player}`, x] as const));
  const suspOf = (side: Side, id: string) => suspendedIds.get(`${m.sides[side - 1].teamId}:${id}`) ?? null;

  const jerseyOf = (side: Side, playerId: string): number | null =>
    m.sides[side - 1].players.find((p) => p.playerId === playerId)?.jersey ?? tl.jerseyOf(playerId, m.sides[side - 1].teamId);
  const who = (side: Side, playerId?: string | null) => {
    if (!playerId) return names[side - 1];
    const j = jerseyOf(side, playerId);
    return `${j != null ? `#${j} ` : ''}${shortName(tl.nameOf(playerId))}`;
  };

  const act = (ev: FootballEvent): boolean => {
    const err = court.apply(ev);
    if (err) toast(err, 'error');
    return !err;
  };
  const lastEvent = () => court.snapshot?.log.at(-1) as FootballEvent | undefined;

  /** Cambia el gol recién anotado (quién marcó, asistencia, autogol) sin perder su minuto. */
  const amendGoal = (g: GoalFlow, patch: Partial<Extract<FootballEvent, { type: 'goal' }>>): boolean => {
    if (!sameGoal(lastEvent(), g.side, g.at)) {
      toast('Ya se anotó otra jugada después del gol: corrígelo con Deshacer.', 'error');
      return false;
    }
    const prev = lastEvent() as Extract<FootballEvent, { type: 'goal' }>;
    // Quitar y volver a poner el gol sin que los espectadores lo vean desaparecer.
    const err = replaceLastEvent<FootballEvent>(court, quietly, prev, { ...prev, ...patch });
    if (err) toast(err, 'error');
    return !err;
  };

  const scoreGoal = (side: Side) => {
    const at = stamp();
    if (act({ type: 'goal', side, at })) setGoal({ side, at, step: 'scorer' });
  };
  const closeGoal = () => {
    setGoal(null);
    court.flush();
  };

  const toggleClock = () => {
    if (!s) return;
    act({ type: 'clock', action: s.clock.running ? 'stop' : 'start', at: stamp() });
  };

  const card = (side: Side, playerId: string, kind: 'yellow' | 'red') => {
    const p = s?.players[side - 1][playerId];
    const second = kind === 'yellow' && (p?.yellows ?? 0) >= 1;
    if (!act({ type: 'card', side, player: playerId, card: kind, at: stamp() })) return;
    setPick(null);
    if (second || kind === 'red') {
      toast(`${second ? 'Segunda amarilla: ROJA. ' : 'Roja: '}${who(side, playerId)} expulsado${config.powerPlayMs ? `. ${names[side - 1]} juega con uno menos 2 minutos.` : '.'}`, 'error');
      court.flush();
    }
  };

  const foul = (side: Side, playerId?: string) => {
    if (!act({ type: 'foul', side, ...(playerId ? { player: playerId } : {}), at: stamp() })) return;
    setPick(null);
  };

  const timeout = (side: Side) => {
    if (s?.clock.running) court.apply({ type: 'clock', action: 'stop', at: stamp() });
    if (act({ type: 'timeout', side, at: stamp() })) toast(`Tiempo muerto de ${names[side - 1]}`);
  };

  const saveLineup = (side: Side, lu: LineupSide, entries: Parameters<typeof setMatchPlayers>[3]) => {
    const warn = lu.starters.filter((id) => suspOf(side, id));
    if (!act({ type: 'lineup', side, players: lu.starters, ...(lu.goalkeeper ? { goalkeeper: lu.goalkeeper } : {}) })) return;
    setMatchPlayers(tl.lid, m.id, side, entries).catch((e) => toast(saveErrorMessage(e), 'error'));
    if (warn.length) toast(`Ojo: ${warn.map((id) => tl.nameOf(id)).join(', ')} está suspendido. Queda anotado; el admin decide.`, 'error');
  };

  // ---------- Lo que se ve ----------

  const elapsed = s ? periodElapsed(s, now) : 0;
  const clockUsed = config.clock !== 'none';
  const started = !!s && (s.clock.running || s.clock.elapsedMs > 0);
  const minute = s && clockUsed && started ? `${minuteLabel(config, s.period, elapsed)}'` : null;
  const periodLen = s ? (s.period <= 2 ? config.halfMinutes : config.extraTimeMinutes) : config.halfMinutes;
  const timeUp = !!s && clockUsed && s.status === 'playing' && elapsed >= periodLen * 60_000;
  const added = s?.addedTime[s.period - 1] ?? null;
  const last = lastEvent();
  const undoLabel = last ? `Deshacer: ${eventLabel(last, (side, p) => who(side, p))}` : 'Deshacer';
  const breakNow = !!s && atBreak(s);
  const noLineup = !!s && s.onField[0] === null && s.onField[1] === null && !s.present[0].length && !s.present[1].length;

  const currentLineup = (i: 0 | 1): LineupSide => ({ starters: s?.onField[i] ?? [], goalkeeper: s?.goalkeeper[i] ?? null });

  const sub = (side: Side) => {
    if (!s) return null;
    const i = side - 1;
    const reds = Object.values(s.players[i]).filter((p) => p.red).length;
    const f = foulStatus(s, side);
    return (
      <>
        {config.accumulatedFouls && (
          <SubText tone={f.alert ? 'danger' : 'muted'} strong={f.alert}>
            {`Faltas ${f.count}`}
          </SubText>
        )}
        {config.accumulatedFouls && f.count >= config.accumulatedFouls.penaltyFrom - 1 && <Txt style={{ fontSize: 11, fontFamily: font.bold, color: c.danger }}>10 m</Txt>}
        {config.timeoutsPerHalf > 0 && <SubText>{`· TM ${footballTimeoutsLeft(s, side)}`}</SubText>}
        {reds > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            {Array.from({ length: reds }, (_, k) => (
              <CardIcon key={k} kind="red" />
            ))}
          </View>
        )}
      </>
    );
  };

  const pens = s ? shootoutScore(s) : null;
  const header = s && (
    <ScoreHeader
      a={{ name: names[0], color: colors[0], score: s.score[0], sub: sub(1) }}
      b={{ name: names[1], color: colors[1], score: s.score[1], sub: sub(2) }}
      center={
        <>
          <Txt tone="accent" style={{ fontSize: 13, fontFamily: font.semibold }}>
            {stageLabel(s)}
          </Txt>
          {minute && !breakNow && s.status === 'playing' && (
            <Txt tone={timeUp ? 'danger' : s.clock.running ? 'accent' : 'fg'} style={{ fontSize: 30, lineHeight: 32, fontFamily: font.bold, fontVariant: ['tabular-nums'] }}>
              {minute}
            </Txt>
          )}
          {clockUsed && s.status === 'playing' && started && (
            <Txt tone="muted" style={{ fontSize: 13, fontVariant: ['tabular-nums'] }}>
              {formatClock(elapsed)}
            </Txt>
          )}
          {added != null && added > 0 && s.status === 'playing' && <Txt tone="accent" style={{ fontSize: 13, fontFamily: font.semibold }}>{`+${added} añadido`}</Txt>}
          {pens && s.status !== 'playing' && <Txt style={{ fontSize: 14, fontFamily: font.bold, fontVariant: ['tabular-nums'] }}>{`Pen. ${pens[0]}-${pens[1]}`}</Txt>}
          {clockUsed && s.status === 'playing' && (
            <Button
              size="md"
              variant={s.clock.running ? 'quiet' : 'primary'}
              disabled={readOnly}
              onPress={toggleClock}
              icon={s.clock.running ? <Pause size={16} color={c.fg} /> : <Play size={16} color={c.accentFg} />}
              accessibilityLabel={s.clock.running ? 'Parar el reloj' : 'Arrancar el reloj'}
            >
              {s.clock.running ? 'Parar' : breakNow ? `Arrancar ${s.period === 2 ? '2.º tiempo' : 'prórroga'}` : started ? 'Seguir' : 'Arrancar'}
            </Button>
          )}
        </>
      }
    />
  );

  /** Los de un lado: primero los que están en la cancha, después el banco; los que salieron o fueron expulsados al final. */
  const idsOf = (side: Side): string[] => {
    if (!s) return [];
    const roster = rosterOf(tl.allTeams.data, m.sides[side - 1].teamId).map((r) => r.playerId);
    return sideIds(s, side, roster, (id) => jerseyOf(side, id), tl.nameOf);
  };

  const column = (side: Side) => {
    const i = side - 1;
    const color = colors[i];
    const field = s?.onField[i] ?? null;
    const ids = idsOf(side);
    const tLeft = s ? footballTimeoutsLeft(s, side) : 0;
    return (
      <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
        {(config.accumulatedFouls || config.timeoutsPerHalf > 0) && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {config.accumulatedFouls && (
              <View style={{ flex: 1, minWidth: 0 }}>
                <Button size="lg" full disabled={readOnly} onPress={() => foul(side)} accessibilityLabel={`Falta de ${names[i]}`}>
                  Falta
                </Button>
              </View>
            )}
            {config.timeoutsPerHalf > 0 && (
              <View style={{ flex: config.accumulatedFouls ? undefined : 1 }}>
                <Button
                  size="lg"
                  full={!config.accumulatedFouls}
                  disabled={readOnly || tLeft === 0}
                  onPress={() => timeout(side)}
                  icon={<Timer size={16} color={c.fg} />}
                  accessibilityLabel={`Tiempo muerto de ${names[i]} (quedan ${tLeft})`}
                >
                  {/* Al lado de «Falta»: «TM» (como en la cabecera) para que quepan los dos. */}
                  {config.accumulatedFouls ? 'TM' : 'Tiempo muerto'}
                </Button>
              </View>
            )}
          </View>
        )}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {s &&
            ids.map((pid) => {
              const p = s.players[i][pid];
              const out = !!p?.red;
              const bench = !!field && !field.includes(pid) && !out;
              const gone = !!p?.subbedOff && !config.subs.reentry;
              const susp = suspOf(side, pid);
              return (
                <View key={pid} style={{ width: '48%' }}>
                  <JerseyButton
                    jersey={jerseyOf(side, pid)}
                    name={shortName(tl.nameOf(pid))}
                    stat={
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                        {p?.goals ? <StatText strong>{`${p.goals} G`}</StatText> : null}
                        {p?.keeper && s.goalkeeper[i] === pid ? <StatText>POR</StatText> : null}
                        {p?.red === 'second_yellow' ? <CardIcon kind="second_yellow" /> : p?.yellows ? <CardIcon kind="yellow" /> : null}
                        {p?.red === 'direct' ? <CardIcon kind="red" /> : null}
                        {susp && <Txt style={{ fontSize: 11, fontFamily: font.bold, color: c.danger }}>SUSP</Txt>}
                        {gone && !out && <StatText>salió</StatText>}
                      </View>
                    }
                    fouls={0}
                    foulMax={null}
                    state={out ? 'out' : p?.yellows ? 'warn' : 'ok'}
                    color={color}
                    selected={pick?.side === side && pick.playerId === pid}
                    disabled={readOnly || out}
                    dim={(bench || gone) && !out}
                    onTap={() => setPick({ side, playerId: pid })}
                  />
                </View>
              );
            })}
          {s && !ids.length && (
            <Txt variant="small" tone="muted" style={{ width: '100%', textAlign: 'center', paddingVertical: 16, fontSize: 13 }}>
              Sin plantilla: arma la alineación o anota los goles sin jugador.
            </Txt>
          )}
        </ScrollView>
      </View>
    );
  };

  const lf = s?.lastFoul;
  const finishText = s ? finishLine(s, pens, court.winner, names) : undefined;
  const period = s?.period ?? 1;
  const endLabel = periodEndLabel(period);

  return (
    <CourtShell
      title={`${names[0]} vs. ${names[1]}`}
      subtitle={[m.stage || (m.round != null ? `Jornada ${m.round}` : ''), m.court].filter(Boolean).join(' · ') || 'Acta del partido'}
      onExit={onExit}
      court={court}
      isAdmin={tl.isAdmin}
      header={header}
      undoLabel={undoLabel}
      finishSummary={finishText}
      onFinished={() => onExit()}
      actions={
        <Button variant={timeUp ? 'primary' : 'quiet'} size="xl" disabled={readOnly || s?.status !== 'playing' || breakNow} onPress={() => setEnding(true)} accessibilityLabel={endLabel} style={{ paddingHorizontal: 16 }}>
          Fin
        </Button>
      }
    >
      <View style={{ flex: 1, minHeight: 0, gap: 8 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <Button size="lg" icon={<Users size={16} color={c.fg} />} disabled={court.readOnly || !s} onPress={() => setLineup(true)}>
            Alineación
          </Button>
          <Button size="lg" icon={<MoreHorizontal size={20} color={c.fg} />} disabled={court.readOnly || !s} onPress={() => setMore(true)}>
            Más
          </Button>
        </View>

        {official && official.userId !== tl.userId && !court.readOnly && (
          <Note tone="neutral">
            <Txt variant="small" tone="muted" style={{ fontSize: 13 }}>
              El anotador de mesa designado es <Txt style={{ fontSize: 13, fontFamily: font.bold, color: c.muted }}>{official.name || 'otra persona'}</Txt>. Si terminas tú y juegas en un
              equipo, el resultado lo confirma el rival.
            </Txt>
          </Note>
        )}
        {noLineup && !court.readOnly && (
          <Pressable
            accessibilityRole="button"
            onPress={() => setLineup(true)}
            style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, backgroundColor: c.accentSoft, paddingHorizontal: 16, paddingVertical: 10 }}
          >
            <Users size={16} color={c.accent} />
            <Txt tone="accent" style={{ flex: 1, fontSize: 15, fontFamily: font.semibold }}>
              Antes de empezar, marca la alineación y el portero de cada equipo: así cuentan los partidos jugados y las vallas invictas.
            </Txt>
          </Pressable>
        )}
        {lf && config.accumulatedFouls && (lf.alert || lf.tenMeter) && (
          <Note tone={lf.tenMeter ? 'danger' : 'warn'} icon={<AlertTriangle size={16} color={lf.tenMeter ? c.danger : c.warn} style={{ marginTop: 2 }} />}>
            <Txt variant="meta" tone={lf.tenMeter ? 'danger' : 'warn'} style={{ fontFamily: font.semibold }} accessibilityLiveRegion="assertive">
              {lf.tenMeter
                ? `${lf.count}.ª falta de ${names[lf.side - 1]}: tiro libre desde 10 m sin barrera.`
                : `${lf.count}.ª falta de ${names[lf.side - 1]}: la próxima es tiro libre desde 10 m.`}
            </Txt>
          </Note>
        )}
        {pps.map((pp, k) => (
          <Note key={k} tone="warn" icon={<ShieldAlert size={16} color={c.warn} style={{ marginTop: 2 }} />}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Txt variant="meta" tone="warn" style={{ flex: 1, fontFamily: font.semibold }}>
                {`${names[pp.side - 1]} con uno menos (roja de ${who(pp.side, pp.player)})`}
              </Txt>
              <Txt tone="warn" style={{ fontSize: 18, fontFamily: font.bold, fontVariant: ['tabular-nums'] }}>
                {formatClock(pp.remainingMs, 'up')}
              </Txt>
            </View>
          </Note>
        ))}
        {timeUp && s && !breakNow && (
          <Note tone="danger">
            <Txt variant="meta" tone="danger" style={{ fontFamily: font.semibold }}>
              {`Ya se cumplieron los ${periodLen} minutos${added ? ` (más ${added} de añadido)` : ''}: cuando pite el árbitro, toca «${endLabel}».`}
            </Txt>
          </Note>
        )}

        {s?.status === 'shootout' ? (
          <Shootout state={s} names={names} colors={colors} readOnly={readOnly} who={who} ids={idsOf} act={act} />
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {([1, 2] as const).map((side) => {
                const fg = textOn(colors[side - 1]);
                return (
                  <BigButton
                    key={side}
                    tone="team"
                    bg={colors[side - 1]}
                    fg={fg}
                    disabled={readOnly || s?.status !== 'playing'}
                    onTap={() => scoreGoal(side)}
                    ariaLabel={`Gol de ${names[side - 1]}`}
                    minHeight={80}
                    style={{ flex: 1, flexDirection: 'column', gap: 0 }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Goal size={24} color={fg} />
                      <BigText color={fg} size={24}>
                        GOL
                      </BigText>
                    </View>
                    <Txt numberOfLines={1} style={{ color: fg, fontSize: 12, fontFamily: font.semibold, maxWidth: '100%' }}>
                      {`${side === 1 ? 'Local' : 'Visita'} · ${names[side - 1]}`}
                    </Txt>
                  </BigButton>
                );
              })}
            </View>
            <View style={{ flex: 1, minHeight: 0, flexDirection: 'row', gap: 8 }}>
              {column(1)}
              {column(2)}
            </View>
          </>
        )}
      </View>

      {/* Después del gol: quién marcó, asistencia o autogol. El gol ya cuenta. */}
      {goal && s && (
        <GoalSheet
          flow={goal}
          names={names}
          ids={idsOf}
          state={s}
          who={who}
          onPick={(pid) => {
            if (goal.step === 'own') {
              if (amendGoal(goal, { ownGoal: true, player: pid })) closeGoal();
            } else if (goal.step === 'scorer') {
              if (amendGoal(goal, { player: pid })) setGoal({ ...goal, step: 'assist', scorer: pid });
            } else if (amendGoal(goal, { assist: pid })) closeGoal();
          }}
          onOwnGoal={() => setGoal({ ...goal, step: 'own' })}
          onClose={closeGoal}
        />
      )}

      {pick && s && (
        <PlayerSheet
          side={pick.side}
          playerId={pick.playerId}
          state={s}
          config={config}
          name={who(pick.side, pick.playerId)}
          teamName={names[pick.side - 1]}
          suspended={suspOf(pick.side, pick.playerId)}
          onClose={() => setPick(null)}
          onGoal={() => {
            const at = stamp();
            if (act({ type: 'goal', side: pick.side, player: pick.playerId, at })) {
              setGoal({ side: pick.side, at, step: 'assist', scorer: pick.playerId });
              setPick(null);
            }
          }}
          onCard={(k) => card(pick.side, pick.playerId, k)}
          onFoul={() => foul(pick.side, pick.playerId)}
          onKeeper={() => {
            if (act({ type: 'goalkeeper', side: pick.side, player: pick.playerId, at: stamp() })) setPick(null);
          }}
          onSub={() => {
            setSubOut(pick);
            setPick(null);
          }}
        />
      )}

      {subOut && s && (
        <SubSheet
          out={subOut}
          state={s}
          config={config}
          ids={idsOf(subOut.side)}
          who={who}
          suspOf={suspOf}
          onClose={() => setSubOut(null)}
          onPick={(pin) => {
            if (act({ type: 'sub', side: subOut.side, out: subOut.playerId, in: pin, at: stamp() })) {
              if (suspOf(subOut.side, pin)) toast(`Ojo: ${tl.nameOf(pin)} está suspendido. Queda anotado; el admin decide.`, 'error');
              setSubOut(null);
            }
          }}
        />
      )}

      <Sheet
        open={ending}
        onClose={() => setEnding(false)}
        title={endLabel}
        footer={
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button size="lg" full onPress={() => setEnding(false)}>
                Seguir
              </Button>
            </View>
            <View style={{ flex: 1 }}>
              <Button
                variant="primary"
                size="lg"
                full
                onPress={() => {
                  if (act({ type: 'period_end', at: stamp() })) court.flush();
                  setEnding(false);
                }}
              >
                Confirmar
              </Button>
            </View>
          </View>
        }
      >
        {s && <EndText state={s} config={config} names={names} />}
      </Sheet>

      {more && s && (
        <MoreSheet
          onClose={() => setMore(false)}
          state={s}
          config={config}
          names={names}
          now={now}
          act={act}
          onLineup={() => {
            setMore(false);
            setLineup(true);
          }}
        />
      )}

      {lineup && s && (
        <LineupSheet
          onClose={() => setLineup(false)}
          tl={tl}
          match={m}
          rsvps={rsvps.data}
          current={[currentLineup(0), currentLineup(1)]}
          players={config.players}
          reinforcements={rules.reinforcements}
          suspended={suspended}
          onSave={saveLineup}
        />
      )}
    </CourtShell>
  );
}

const B = ({ children }: { children: ReactNode }) => <Txt style={{ fontFamily: font.bold }}>{children}</Txt>;

/** Lo que pasa al terminar el tiempo. */
function EndText({ state: s, config, names }: { state: FootballState; config: FootballConfig; names: readonly [string, string] }) {
  const tied = s.score[0] === s.score[1];
  const kind = periodEndNext(s, config);
  let next: ReactNode;
  if (kind === 'half') next = <Txt variant="meta">{['Descanso.', config.accumulatedFouls ? 'Las faltas acumuladas vuelven a 0.' : '', 'El reloj del 2.º tiempo arranca en 0.'].filter(Boolean).join(' ')}</Txt>;
  else if (kind === 'extra_half') next = <Txt variant="meta">Termina la 1.ª parte de la prórroga.</Txt>;
  else if (kind === 'extra_time') next = <Txt variant="meta">{`Empate: sigue la prórroga de 2 × ${config.extraTimeMinutes} minutos.`}</Txt>;
  else if (kind === 'shootout') next = <Txt variant="meta">{`Empate: tanda de penales (${config.shootoutKicks} por equipo y luego muerte súbita). No cuentan en los goles.`}</Txt>;
  else
    next = (
      <Txt variant="meta">
        Termina el partido:{' '}
        {tied ? (
          <B>empate</B>
        ) : (
          <>
            gana <B>{names[s.score[0] > s.score[1] ? 0 : 1]}</B>
          </>
        )}
        . Después toca <B>Terminar</B> para enviar el resultado.
      </Txt>
    );
  return (
    <View style={{ gap: 8 }}>
      <Txt style={{ fontSize: 24, lineHeight: 30, fontFamily: font.bold, fontVariant: ['tabular-nums'] }}>{`${s.score[0]}-${s.score[1]}`}</Txt>
      {next}
    </View>
  );
}

/** Un dorsal para elegir en una hoja (quién marcó, quién entra). */
function PickTile({ label, onPress, danger, sub }: { label: string; onPress: () => void; danger?: boolean; sub?: string }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        width: '31%',
        minHeight: 56,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 18,
        paddingHorizontal: 4,
        backgroundColor: c.surface2,
        borderWidth: danger ? 1.5 : 0,
        borderColor: danger ? c.danger : 'transparent',
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}
    >
      <Txt numberOfLines={1} style={{ fontSize: 14, fontFamily: font.semibold, maxWidth: '100%' }}>
        {label}
      </Txt>
      {!!sub && <Txt style={{ fontSize: 10, fontFamily: font.bold, color: c.danger, textTransform: 'uppercase' }}>{sub}</Txt>}
    </Pressable>
  );
}

/** Dorsales de un lado para elegir (los expulsados no). */
function JerseyGrid({
  side,
  ids,
  state: s,
  who,
  exclude = [],
  onPick,
}: {
  side: Side;
  ids: string[];
  state: FootballState;
  who: (side: Side, id?: string | null) => string;
  exclude?: string[];
  onPick: (id: string) => void;
}) {
  const list = pickableIds(s, side, ids, { exclude });
  if (!list.length)
    return (
      <Txt variant="meta" tone="muted" style={{ textAlign: 'center', paddingVertical: 8 }}>
        Sin jugadores para elegir.
      </Txt>
    );
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {list.map((id) => (
        <PickTile key={id} label={who(side, id)} onPress={() => onPick(id)} />
      ))}
    </View>
  );
}

function GoalSheet({
  flow,
  names,
  ids,
  state,
  who,
  onPick,
  onOwnGoal,
  onClose,
}: {
  flow: GoalFlow;
  names: readonly [string, string];
  ids: (side: Side) => string[];
  state: FootballState;
  who: (side: Side, id?: string | null) => string;
  onPick: (id: string) => void;
  onOwnGoal: () => void;
  onClose: () => void;
}) {
  const other: Side = flow.side === 1 ? 2 : 1;
  const title = goalSheetTitle(flow, names, who, lastGoalMinute(state));
  return (
    <Sheet
      open
      onClose={onClose}
      title={title}
      footer={
        <Button variant="primary" size="lg" full onPress={onClose}>
          {flow.step === 'assist' ? 'Sin asistencia' : 'Listo (sin jugador)'}
        </Button>
      }
    >
      <Txt variant="meta" tone="muted">
        El gol ya cuenta. Esto es opcional.
      </Txt>
      <JerseyGrid
        side={flow.step === 'own' ? other : flow.side}
        ids={ids(flow.step === 'own' ? other : flow.side)}
        state={state}
        who={who}
        exclude={flow.step === 'assist' && flow.scorer ? [flow.scorer] : []}
        onPick={onPick}
      />
      {flow.step === 'scorer' && (
        <Button size="lg" full onPress={onOwnGoal}>
          {`Fue autogol de ${names[other - 1]}`}
        </Button>
      )}
    </Sheet>
  );
}

/** Un botón grande de la hoja de un jugador (Gol, Amarilla, Roja, Cambio, Portero, Falta). */
function ActionTile({ icon, label, onPress, disabled, bg, fg }: { icon: ReactNode; label: string; onPress: () => void; disabled?: boolean; bg: string; fg: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: '48%',
        minHeight: 64,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        borderRadius: 18,
        paddingHorizontal: 8,
        backgroundColor: bg,
        opacity: disabled ? 0.4 : 1,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}
    >
      {icon}
      <Txt style={{ color: fg, fontFamily: font.semibold, fontSize: 15, textAlign: 'center' }}>{label}</Txt>
    </Pressable>
  );
}

function PlayerSheet({
  side,
  playerId,
  state: s,
  config,
  name,
  teamName,
  suspended,
  onClose,
  onGoal,
  onCard,
  onFoul,
  onKeeper,
  onSub,
}: {
  side: Side;
  playerId: string;
  state: FootballState;
  config: FootballConfig;
  name: string;
  teamName: string;
  suspended: Suspended | null;
  onClose: () => void;
  onGoal: () => void;
  onCard: (k: 'yellow' | 'red') => void;
  onFoul: () => void;
  onKeeper: () => void;
  onSub: () => void;
}) {
  const c = useColors();
  const p = s.players[side - 1][playerId];
  const yellows = p?.yellows ?? 0;
  const keeper = s.goalkeeper[side - 1] === playerId;
  const playing = s.status === 'playing';
  const field = s.onField[side - 1];
  const onField = !field || field.includes(playerId);
  return (
    <Sheet open onClose={onClose} title={`${name} · ${teamName}`}>
      {suspended && (
        <Note tone="danger" icon={<AlertTriangle size={16} color={c.danger} style={{ marginTop: 2 }} />}>
          <Txt variant="meta" tone="danger">{`Está suspendido para este partido (${REASON_TEXT[suspended.reason] ?? suspended.reason}).`}</Txt>
        </Note>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <ActionTile icon={<Goal size={24} color={c.ok} />} label="Gol" bg={c.okSoft} fg={c.ok} disabled={!playing} onPress={onGoal} />
        <ActionTile
          icon={<CardIcon kind={yellows ? 'second_yellow' : 'yellow'} scale={1.25} />}
          label={yellows ? '2.ª amarilla = ROJA' : 'Amarilla'}
          bg={yellows ? c.dangerSoft : c.warnSoft}
          fg={yellows ? c.danger : c.warn}
          onPress={() => onCard('yellow')}
        />
        <ActionTile icon={<CardIcon kind="red" scale={1.25} />} label="Roja directa" bg={c.dangerSoft} fg={c.danger} onPress={() => onCard('red')} />
        <ActionTile icon={<ArrowLeftRight size={24} color={c.fg} />} label={onField ? 'Cambio (sale)' : 'En el banco'} bg={c.surface} fg={c.fg} disabled={!playing || !onField} onPress={onSub} />
        <ActionTile icon={<Hand size={24} color={keeper ? c.accent : c.fg} />} label={keeper ? 'Es el portero' : 'Portero'} bg={keeper ? c.accentSoft : c.surface} fg={keeper ? c.accent : c.fg} disabled={keeper} onPress={onKeeper} />
        <ActionTile
          icon={<Hand size={24} color={c.fg} style={{ transform: [{ rotate: '90deg' }] }} />}
          label={`Falta${config.accumulatedFouls ? ` (${s.fouls[side - 1]} del equipo)` : ''}`}
          bg={c.surface}
          fg={c.fg}
          disabled={!playing}
          onPress={onFoul}
        />
      </View>
      {yellows > 0 && (
        <Txt tone="warn" style={{ fontSize: 13, fontFamily: font.semibold }}>
          Ya tiene amarilla: la segunda es roja y sale del partido.
        </Txt>
      )}
    </Sheet>
  );
}

function SubSheet({
  out,
  state: s,
  config,
  ids,
  who,
  suspOf,
  onClose,
  onPick,
}: {
  out: { side: Side; playerId: string };
  state: FootballState;
  config: FootballConfig;
  ids: string[];
  who: (side: Side, id?: string | null) => string;
  suspOf: (side: Side, id: string) => Suspended | null;
  onClose: () => void;
  onPick: (id: string) => void;
}) {
  const i = out.side - 1;
  const max = subsMax(config, s.period);
  const bench = benchFor(s, config, out, ids);
  return (
    <Sheet open onClose={onClose} title={`Sale ${who(out.side, out.playerId)}: ¿quién entra?`}>
      <Txt variant="meta" tone="muted">
        {`Cambios: ${s.subsUsed[i]}${max !== null ? ` de ${max}` : ' (sin límite)'}${config.subs.reentry ? ' · con reingreso' : ''}`}
      </Txt>
      {!bench.length ? (
        <Txt variant="meta" tone="muted" style={{ textAlign: 'center', paddingVertical: 8 }}>
          No hay suplentes. Agrégalos a la plantilla o a la alineación.
        </Txt>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {bench.map((id) => (
            <PickTile key={id} label={who(out.side, id)} danger={!!suspOf(out.side, id)} sub={suspOf(out.side, id) ? 'Suspendido' : undefined} onPress={() => onPick(id)} />
          ))}
        </View>
      )}
    </Sheet>
  );
}

/** Tanda de penales paso a paso: quién patea, gol o fallado, y cómo va (aparte del marcador). */
function Shootout({
  state: s,
  names,
  colors,
  readOnly,
  who,
  ids,
  act,
}: {
  state: FootballState;
  names: readonly [string, string];
  colors: readonly [string, string];
  readOnly: boolean;
  who: (side: Side, id?: string | null) => string;
  ids: (side: Side) => string[];
  act: (ev: FootballEvent) => boolean;
}) {
  const c = useColors();
  const [kicker, setKicker] = useState<string | null>(null);
  const [first, setFirst] = useState<Side | null>(null);
  const kicks = s.shootout?.kicks ?? [];
  const nextSide = nextKicker(kicks, first);
  const score = shootoutScore(s) ?? [0, 0];
  const kick = (scored: boolean) => {
    if (!nextSide) return;
    if (act({ type: 'shootout', side: nextSide, scored, ...(kicker ? { player: kicker } : {}) })) setKicker(null);
  };
  const row = (side: Side) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Txt numberOfLines={1} style={{ width: 96, fontSize: 14, fontFamily: font.semibold }}>
        {names[side - 1]}
      </Txt>
      <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
        {kicks
          .filter((k) => k.side === side)
          .map((k, i) => (
            <View
              key={i}
              accessibilityLabel={`${k.scored ? 'Gol' : 'Falló'}${k.player ? `: ${who(side, k.player)}` : ''}`}
              style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: k.scored ? c.ok : c.danger }}
            >
              <Txt style={{ fontSize: 12, fontFamily: font.bold, color: k.scored ? c.bg : c.onDanger }}>{k.scored ? '✓' : '✗'}</Txt>
            </View>
          ))}
      </View>
      <Txt style={{ fontSize: 20, fontFamily: font.bold, fontVariant: ['tabular-nums'] }}>{score[side - 1]}</Txt>
    </View>
  );
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 12 }}>
      <View style={{ gap: 8, borderRadius: 16, backgroundColor: c.surface2, padding: 12 }}>
        <Txt style={{ fontSize: 14, fontFamily: font.semibold }}>{`Tanda de penales (${s.config.shootoutKicks} y luego muerte súbita)`}</Txt>
        {row(1)}
        {row(2)}
      </View>
      {s.status === 'final' ? null : !nextSide ? (
        <View style={{ gap: 8 }}>
          <Txt style={{ fontSize: 14, fontFamily: font.medium }}>¿Quién patea primero?</Txt>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {([1, 2] as const).map((side) => (
              <BigButton key={side} tone="team" bg={colors[side - 1]} fg={textOn(colors[side - 1])} fontSize={18} disabled={readOnly} onTap={() => setFirst(side)} style={{ flex: 1 }}>
                {names[side - 1]}
              </BigButton>
            ))}
          </View>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          <Txt style={{ fontSize: 14, fontFamily: font.medium }}>
            Patea <B>{names[nextSide - 1]}</B>
            {kicker ? `: ${who(nextSide, kicker)}` : ' (toca el dorsal si quieres anotar quién)'}
          </Txt>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 4 }}>
            {ids(nextSide)
              .filter((id) => !s.players[nextSide - 1][id]?.red)
              .map((id) => (
                <Pressable
                  key={id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: kicker === id }}
                  onPress={() => setKicker(kicker === id ? null : id)}
                  style={{ minHeight: 44, justifyContent: 'center', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: kicker === id ? c.accent : c.surface2 }}
                >
                  <Txt style={{ fontSize: 14, fontFamily: font.semibold, color: kicker === id ? c.accentFg : c.fg }}>{who(nextSide, id)}</Txt>
                </Pressable>
              ))}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <BigButton tone="team" bg={c.ok} fg={c.bg} minHeight={80} disabled={readOnly} onTap={() => kick(true)} ariaLabel={`Penal de ${names[nextSide - 1]}: gol`} style={{ flex: 1 }}>
              <Goal size={28} color={c.bg} />
              <BigText color={c.bg}>GOL</BigText>
            </BigButton>
            <BigButton tone="team" bg={c.danger} fg={c.onDanger} minHeight={80} disabled={readOnly} onTap={() => kick(false)} ariaLabel={`Penal de ${names[nextSide - 1]}: fallado`} style={{ flex: 1 }}>
              <X size={28} color={c.onDanger} />
              <BigText color={c.onDanger}>Falló</BigText>
            </BigButton>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

/** Jugadas que no van en la pantalla principal: añadido, corregir el reloj, los 2 minutos de sala, W.O. */
function MoreSheet({
  onClose,
  state: s,
  config,
  names,
  now,
  act,
  onLineup,
}: {
  onClose: () => void;
  state: FootballState;
  config: FootballConfig;
  names: readonly [string, string];
  now: number;
  act: (ev: FootballEvent) => boolean;
  onLineup: () => void;
}) {
  const c = useColors();
  const [clock, setClock] = useState('');
  const doAct = (ev: FootballEvent) => {
    if (act(ev)) onClose();
  };
  const elapsedMs = parseElapsed(clock);
  const setElapsed = () => {
    if (elapsedMs === null) return;
    doAct({ type: 'clock', action: 'set', elapsedMs, at: stamp() });
    setClock('');
  };
  const walkover = async (side: Side) => {
    const yes = await confirmAsync({
      title: `¿${names[side - 1]} no se presentó?`,
      message: `Pierde ${config.walkoverScore}-0 por W.O. Después toca Terminar.`,
      confirmText: 'Sí, anotar W.O.',
      danger: true,
    });
    if (yes) doAct({ type: 'walkover', side });
  };
  const pps = activePowerPlays(s, now);
  const playing = s.status === 'playing';
  const title = (t: string) => <Txt style={{ fontSize: 14, fontFamily: font.semibold }}>{t}</Txt>;
  return (
    <Sheet open onClose={onClose} title="Más jugadas">
      <View style={{ gap: 16 }}>
        <Button size="lg" full icon={<Users size={20} color={c.fg} />} onPress={onLineup}>
          Alineación y portero
        </Button>
        {config.clock !== 'none' && playing && (
          <View style={{ gap: 8 }}>
            {title('Añadido de este tiempo')}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {ADDED_MINUTES.map((n) => (
                <Button key={n} size="lg" variant={s.addedTime[s.period - 1] === n ? 'primary' : 'quiet'} onPress={() => doAct({ type: 'added_time', minutes: n })}>
                  {`+${n}`}
                </Button>
              ))}
            </View>
          </View>
        )}
        {config.clock !== 'none' && playing && (
          <View style={{ gap: 8 }}>
            {title('Corregir el reloj')}
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Field label="Tiempo jugado de este tiempo (mm:ss)">
                  <Input keyboardType="numbers-and-punctuation" value={clock} onChangeText={setClock} placeholder="23:00" />
                </Field>
              </View>
              <Button size="lg" onPress={setElapsed} disabled={elapsedMs === null} style={{ height: 56 }}>
                Poner
              </Button>
            </View>
            <Txt variant="small" tone="muted" style={{ fontSize: 13 }}>
              El reloj del teléfono es de referencia; el que manda es el del árbitro.
            </Txt>
          </View>
        )}
        {pps.length > 0 && (
          <View style={{ gap: 8 }}>
            {title('Uno menos (2 minutos)')}
            {[...new Set(pps.map((p) => p.side))].map((side) => (
              <Button key={side} size="lg" full onPress={() => doAct({ type: 'power_play_end', side, at: stamp() })}>
                {`${names[side - 1]} ya completa`}
              </Button>
            ))}
          </View>
        )}
        {playing && (
          <View style={{ gap: 8 }}>
            {title('W.O.')}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {([1, 2] as const).map((side) => (
                <View key={side} style={{ flex: 1 }}>
                  <DangerButton full onPress={() => void walkover(side)}>
                    {`No vino ${names[side - 1]}`}
                  </DangerButton>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>
    </Sheet>
  );
}
