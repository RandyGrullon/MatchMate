/**
 * La mesa anotadora de baloncesto en la app (BasketballCourt.tsx de la web, con la misma máquina: useCourt +
 * basketballAdapter, y la lógica de src/pages/sports/basketball/court.ts):
 * - arriba, el marcador grande, el periodo, el reloj de referencia (Arrancar / Parar), las faltas de equipo con BONUS,
 *   los tiempos muertos que quedan y la flecha de posesión;
 * - modo Rápido (+1, +2, +3 y Falta al equipo) o Por jugador (se toca el dorsal y luego +1, +2, +3 o Falta con su
 *   tipo), con el aviso de la 4.ª falta y FUERA con 5;
 * - Deshacer, «Fin del cuarto» y Terminar siempre a la vista; presentes, refuerzos y Más jugadas.
 * Todo se guarda en el teléfono en cada toque y se publica al cambiar de periodo, al parar o arrancar el reloj y como
 * mucho cada 60 s. La pantalla no se apaga mientras se anota (CourtShell).
 */
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { AlertTriangle, ArrowLeft, ArrowRight, Hand, MoreHorizontal, Pause, Play, Timer, Users, X } from 'lucide-react-native';
import { useCourt } from '@mm/court/useCourt';
import { setMatchPlayers, type Match } from '@mm/lib/data/matches';
import { knownServerOffset, useMatchRsvps, useServerOffset } from '@mm/lib/data/teamSports';
import { saveErrorMessage } from '@mm/lib/errorText';
import { useNow } from '@mm/lib/useNow';
import {
  basketballPeriodLabel,
  basketballTimeoutsLeft,
  inPenalty,
  remainingMs,
  type BasketballConfig,
  type BasketballEvent,
  type BasketballState,
  type FoulKind,
} from '@mm/sports/team/basketball';
import { formatClock } from '@mm/sports/team/clock';
import type { Side } from '@mm/sports/types';
import { basketballAdapter, EJECTION_LABEL, eventLabel, FOUL_LABEL } from '@mm/pages/sports/basketball/adapter';
import { courtPlayerIds, finishText as finishLine, lastFoulText as foulLine, parseRemaining, periodEndLabel, pointButtons, readMode, saveMode, type ScoreMode } from '@mm/pages/sports/basketball/court';
import { basketballConfigFrom, basketballTeamRules } from '@mm/pages/sports/basketball/rules';
import { rosterOf, shortName, teamColor, textOn } from '@mm/pages/sports/team/logic';
import type { PresentEntry } from '@mm/pages/sports/team/presentes';
import type { TeamLeague } from '@mm/pages/sports/team/useTeamLeague';
import { confirmAsync, toast } from '../feedback';
import { ToggleRow } from '../esports/inputs';
import { DangerButton } from '../team/TeamBits';
import { Button, Field, Input, Segmented, Sheet, Txt } from '../ui';
import { CourtShell } from './CourtShell';
import { PresentesSheet } from './team/PresentesSheet';
import { BigButton, BigText, JerseyButton, ScoreHeader, StatText, SubText } from './team/ScorerPieces';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/** La hora de la jugada (se lee al tocar, nunca al pintar). */
const stamp = () => Date.now();

interface Selection {
  side: Side;
  /** null = al equipo, sin jugador. */
  playerId: string | null;
}

/** Una línea de aviso arriba de las columnas (la falta, se acabó el tiempo). */
export function Note({ tone, children, icon }: { tone: 'neutral' | 'warn' | 'danger' | 'accent'; children: ReactNode; icon?: ReactNode }) {
  const c = useColors();
  const bg = tone === 'danger' ? c.dangerSoft : tone === 'warn' ? c.warnSoft : tone === 'accent' ? c.accentSoft : c.surface2;
  return (
    <View accessibilityRole="text" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: bg }}>
      {icon}
      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
    </View>
  );
}

export function BasketballCourt({ tl, match: m, onExit }: { tl: TeamLeague; match: Match; onExit: () => void }) {
  const c = useColors();
  const config = basketballConfigFrom(m.rules);
  const rules = basketballTeamRules(m.rules);
  // La hora del servidor (para el reloj que ven los demás): se pide una vez; el adaptador la lee al publicar.
  useServerOffset();
  const [adapter] = useState(() => basketballAdapter({ offset: knownServerOffset }));
  const court = useCourt<BasketballConfig, BasketballState, BasketballEvent>({ lid: tl.lid, matchId: m.id, userId: tl.userId, adapter, status: m.status, config });
  const s = court.state;
  const rsvps = useMatchRsvps(tl.lid, [m.id]);
  const [mode, setModeState] = useState<ScoreMode>(readMode);
  const [sel, setSel] = useState<Selection | null>(null);
  const [foulFor, setFoulFor] = useState<Selection | null>(null);
  const [ending, setEnding] = useState(false);
  const [more, setMore] = useState(false);
  const [presentes, setPresentes] = useState(false);
  const [late, setLate] = useState(false);
  // El reloj de la mesa sale de marcas de tiempo: corriendo, se vuelve a pintar cada 200 ms.
  const now = useNow(s?.clock.running ? 200 : 60_000).getTime();

  const teams = m.sides.map((sd) => tl.teamOf(sd.teamId));
  const colors = [teamColor(teams[0], 1), teamColor(teams[1], 2)] as const;
  const names = [teams[0]?.name ?? m.sides[0].label, teams[1]?.name ?? m.sides[1].label] as const;
  const readOnly = court.readOnly || court.over || !s;
  const official = tl.officialOf(m.id);

  const jerseyOf = (side: Side, playerId: string): number | null =>
    m.sides[side - 1].players.find((p) => p.playerId === playerId)?.jersey ?? tl.jerseyOf(playerId, m.sides[side - 1].teamId);
  const who = (side: Side, playerId?: string | null) => {
    if (!playerId) return names[side - 1];
    const j = jerseyOf(side, playerId);
    return `${j != null ? `#${j} ` : ''}${shortName(tl.nameOf(playerId))}`;
  };

  const setMode = (next: ScoreMode) => {
    setModeState(next);
    saveMode(next);
    setSel(null);
  };

  const act = (ev: BasketballEvent): boolean => {
    const err = court.apply(ev);
    if (err) toast(err, 'error');
    return !err;
  };
  const stopClock = () => {
    if (s?.clock.running) court.apply({ type: 'clock', action: 'stop', at: stamp() });
  };
  const addPoints = (side: Side, points: 1 | 2 | 3, playerId: string | null) => {
    act({ type: 'score', side, points, ...(playerId ? { player: playerId } : {}), at: stamp() });
    setSel(null);
  };
  const addFoul = (side: Side, kind: FoulKind, playerId: string | null) => {
    // Con reloj parado (FIBA), cada falta para el reloj; con reloj corrido, sigue.
    if (!rules.runningClock) stopClock();
    act({ type: 'foul', side, kind, ...(playerId && kind !== 'coach_technical' && kind !== 'bench_technical' ? { player: playerId } : {}), at: stamp() });
    setFoulFor(null);
    setSel(null);
  };
  const timeout = (side: Side) => {
    stopClock();
    if (act({ type: 'timeout', side, at: stamp(), ...(!config.clock && late ? { lastTwoMinutes: true } : {}) })) toast(`Tiempo muerto de ${names[side - 1]}`);
  };
  const toggleClock = () => {
    if (!s) return;
    act({ type: 'clock', action: s.clock.running ? 'stop' : 'start', at: stamp() });
  };
  const savePresent = (side: Side, list: PresentEntry[]) => {
    act({ type: 'present', side, players: list.map((p) => p.playerId) });
    setMatchPlayers(tl.lid, m.id, side, list).catch((e) => toast(saveErrorMessage(e), 'error'));
  };

  const left = s && config.clock ? remainingMs(s, now) : null;
  const timeUp = left === 0;
  const pts = pointButtons(config);
  const last = court.snapshot?.log.at(-1) as BasketballEvent | undefined;
  const undoLabel = last ? `Deshacer: ${eventLabel(last, (side, p) => who(side, p))}` : 'Deshacer';
  const otNoEnd = !!s && config.overtimeTarget !== null && s.period > config.periods;
  const noPresent = !!s && !s.present[0].length && !s.present[1].length && (court.snapshot?.log.length ?? 0) === 0;
  const endLabel = periodEndLabel(config, s?.period ?? 1);

  const sub = (side: Side) => {
    if (!s) return null;
    const i = side - 1;
    return (
      <>
        <SubText>{`Faltas ${s.teamFouls[i]}`}</SubText>
        {inPenalty(s, side) && (
          <Txt style={{ fontSize: 11, fontFamily: font.bold, letterSpacing: 0.5, color: c.danger }}>BONUS</Txt>
        )}
        <SubText>{`· TM ${basketballTimeoutsLeft(s, side, now)}`}</SubText>
      </>
    );
  };

  const header = s && (
    <ScoreHeader
      a={{ name: names[0], color: colors[0], score: s.score[0], sub: sub(1) }}
      b={{ name: names[1], color: colors[1], score: s.score[1], sub: sub(2) }}
      center={
        <>
          <Txt tone="accent" style={{ fontSize: 13, fontFamily: font.semibold }}>
            {basketballPeriodLabel(config, s.period)}
          </Txt>
          {left !== null && (
            <Txt tone={timeUp ? 'danger' : s.clock.running ? 'accent' : 'fg'} style={{ fontSize: 30, lineHeight: 32, fontFamily: font.bold, fontVariant: ['tabular-nums'] }}>
              {formatClock(left, 'up')}
            </Txt>
          )}
          {left !== null && (
            <Button
              size="md"
              variant={s.clock.running ? 'quiet' : 'primary'}
              disabled={readOnly || (timeUp && !s.clock.running)}
              onPress={toggleClock}
              icon={s.clock.running ? <Pause size={16} color={c.fg} /> : <Play size={16} color={c.accentFg} />}
              accessibilityLabel={s.clock.running ? 'Parar el reloj' : 'Arrancar el reloj'}
            >
              {s.clock.running ? 'Parar' : 'Arrancar'}
            </Button>
          )}
          {s.arrow != null && (
            <View accessibilityLabel="Flecha de posesión alterna" style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              {s.arrow === 1 && <ArrowLeft size={12} color={c.muted} />}
              <Txt style={{ fontSize: 11, color: c.muted }}>Posesión</Txt>
              {s.arrow === 2 && <ArrowRight size={12} color={c.muted} />}
            </View>
          )}
        </>
      }
    />
  );

  const column = (side: Side) => {
    if (!s) return null;
    const i = side - 1;
    const color = colors[i];
    const tLeft = basketballTimeoutsLeft(s, side, now);
    const roster = rosterOf(tl.allTeams.data, m.sides[i].teamId).map((r) => r.playerId);
    const ids = courtPlayerIds(s, side, roster, (id) => jerseyOf(side, id), tl.nameOf);
    const teamSel = sel?.side === side && sel.playerId === null;
    return (
      <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ flex: mode === 'quick' ? 1 : undefined }}>
            <Button
              size="lg"
              full={mode === 'quick'}
              disabled={readOnly || tLeft === 0}
              onPress={() => timeout(side)}
              icon={<Timer size={16} color={c.fg} />}
              accessibilityLabel={`Tiempo muerto de ${names[i]} (quedan ${tLeft})`}
            >
              {/* Por jugador va al lado de «Equipo»: «TM» (como en la cabecera) para que quepan los dos. */}
              {mode === 'quick' ? 'Tiempo muerto' : 'TM'}
            </Button>
          </View>
          {mode === 'players' && (
            <View style={{ flex: 1, minWidth: 0 }}>
              <Button size="lg" full variant={teamSel ? 'primary' : 'quiet'} disabled={readOnly} onPress={() => setSel({ side, playerId: null })} accessibilityLabel={`Anotar a ${names[i]} sin jugador`}>
                Equipo
              </Button>
            </View>
          )}
        </View>
        {mode === 'quick' ? (
          <View style={{ flex: 1, gap: 8 }}>
            {pts.map((p) => (
              <BigButton key={p} tone="team" bg={color} fg={textOn(color)} disabled={readOnly} onTap={() => addPoints(side, p, null)} ariaLabel={`${p} para ${names[i]}`} style={{ flex: 1 }}>
                {`+${p}`}
              </BigButton>
            ))}
            <BigButton tone="warn" disabled={readOnly} onTap={() => setFoulFor({ side, playerId: null })} ariaLabel={`Falta de ${names[i]}`} style={{ flex: 1 }}>
              <Hand size={24} color={c.warn} />
              <BigText color={c.warn} size={20}>
                Falta
              </BigText>
            </BigButton>
          </View>
        ) : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {ids.map((pid) => {
              const p = s.players[i][pid];
              const state = p?.out ? 'out' : p?.warning ? 'warn' : 'ok';
              return (
                <View key={pid} style={{ width: '48%' }}>
                  <JerseyButton
                    jersey={jerseyOf(side, pid)}
                    name={shortName(tl.nameOf(pid))}
                    stat={<StatText>{`${p?.points ?? 0} pts`}</StatText>}
                    fouls={p?.fouls ?? 0}
                    foulMax={config.ejection.fouls}
                    state={state}
                    color={color}
                    selected={sel?.side === side && sel.playerId === pid}
                    disabled={readOnly || state === 'out'}
                    onTap={() => setSel(sel?.side === side && sel.playerId === pid ? null : { side, playerId: pid })}
                  />
                </View>
              );
            })}
            {!ids.length && (
              <Txt variant="small" tone="muted" style={{ width: '100%', textAlign: 'center', paddingVertical: 16, fontSize: 13 }}>
                Sin plantilla: usa «Equipo» o marca los presentes.
              </Txt>
            )}
          </ScrollView>
        )}
      </View>
    );
  };

  const lf = s?.lastFoul;
  const lastFoulText = foulLine(lf, who);
  const finishText = s ? finishLine(s, court.winner, names) : undefined;

  return (
    <CourtShell
      title={`${names[0]} vs. ${names[1]}`}
      subtitle={[m.round != null ? `Jornada ${m.round}` : m.stage, m.court].filter(Boolean).join(' · ') || 'Mesa anotadora'}
      onExit={onExit}
      court={court}
      isAdmin={tl.isAdmin}
      header={header}
      undoLabel={undoLabel}
      finishSummary={finishText}
      onFinished={() => onExit()}
      actions={
        <Button variant={timeUp ? 'primary' : 'quiet'} size="xl" disabled={readOnly || otNoEnd} onPress={() => setEnding(true)} accessibilityLabel={endLabel} style={{ paddingHorizontal: 16 }}>
          Fin
        </Button>
      }
    >
      <View style={{ flex: 1, minHeight: 0, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Segmented<ScoreMode>
              label="Modo de anotar"
              value={mode}
              onChange={setMode}
              options={[
                { key: 'quick', label: 'Rápido' },
                { key: 'players', label: 'Por jugador' },
              ]}
            />
          </View>
          <Button size="lg" icon={<Users size={20} color={c.fg} />} disabled={court.readOnly || !s} onPress={() => setPresentes(true)} accessibilityLabel="Presentes" />
          <Button size="lg" icon={<MoreHorizontal size={20} color={c.fg} />} disabled={court.readOnly || !s} onPress={() => setMore(true)} accessibilityLabel="Más jugadas" />
        </View>

        {official && official.userId !== tl.userId && !court.readOnly && (
          <Note tone="neutral">
            <Txt variant="small" tone="muted" style={{ fontSize: 13 }}>
              El anotador de mesa designado es <Txt style={{ fontSize: 13, fontFamily: font.bold, color: c.muted }}>{official.name || 'otra persona'}</Txt>. Si terminas tú y juegas en un
              equipo, el resultado lo confirma el rival.
            </Txt>
          </Note>
        )}
        {noPresent && !court.readOnly && (
          <Pressable
            accessibilityRole="button"
            onPress={() => setPresentes(true)}
            style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, backgroundColor: c.accentSoft, paddingHorizontal: 16, paddingVertical: 10 }}
          >
            <Users size={16} color={c.accent} />
            <Txt tone="accent" style={{ flex: 1, fontSize: 15, fontFamily: font.semibold }}>
              Antes de empezar, marca los presentes: así cuenta el partido jugado de cada uno.
            </Txt>
          </Pressable>
        )}
        {lastFoulText && (
          <Note tone={lf?.out ? 'danger' : lf?.warning ? 'warn' : 'neutral'} icon={<AlertTriangle size={16} color={lf?.out ? c.danger : lf?.warning ? c.warn : c.fg} style={{ marginTop: 2 }} />}>
            <Txt variant="meta" tone={lf?.out ? 'danger' : lf?.warning ? 'warn' : 'fg'} accessibilityLiveRegion="polite">
              {lastFoulText}
              {lf?.warning && <Txt variant="meta" tone="warn" style={{ fontFamily: font.bold }}>{' · ¡4 faltas! Una más y sale.'}</Txt>}
              {lf?.out && (
                <Txt variant="meta" tone="danger" style={{ fontFamily: font.bold }}>
                  {` · ${lf.player ? who(lf.side, lf.player) : ''} ${EJECTION_LABEL[lf.out] ?? 'sale'}.`}
                </Txt>
              )}
            </Txt>
          </Note>
        )}
        {timeUp && s && !court.over && (
          <Note tone="danger">
            <Txt variant="meta" tone="danger" style={{ fontFamily: font.semibold }}>{`Se acabó el tiempo: toca «${periodEndLabel(config, s.period)}».`}</Txt>
          </Note>
        )}

        <View style={{ flex: 1, minHeight: 0, flexDirection: 'row', gap: 8 }}>
          {column(1)}
          {column(2)}
        </View>

        {sel && s && (
          <View style={{ gap: 8, borderRadius: 24, backgroundColor: c.surface, padding: 10, borderWidth: 2, borderColor: colors[sel.side - 1] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 6 }}>
              <Txt numberOfLines={1} style={{ flex: 1, minWidth: 0, fontSize: 15, fontFamily: font.semibold }}>
                {`${who(sel.side, sel.playerId)}${sel.playerId ? ` · ${names[sel.side - 1]}` : ' (sin jugador)'}`}
              </Txt>
              <Button variant="ghost" size="lg" icon={<X size={16} color={c.fg} />} onPress={() => setSel(null)} accessibilityLabel="Quitar selección" />
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {pts.map((p) => (
                <BigButton key={p} tone="accent" disabled={readOnly} onTap={() => addPoints(sel.side, p, sel.playerId)} style={{ flex: 1 }}>
                  {`+${p}`}
                </BigButton>
              ))}
              <BigButton tone="warn" disabled={readOnly} fontSize={16} onTap={() => setFoulFor(sel)} style={{ flex: 1 }}>
                Falta
              </BigButton>
            </View>
          </View>
        )}
      </View>

      {foulFor && (
        <FoulPicker title={`Falta de ${who(foulFor.side, foulFor.playerId)}`} withPlayer={!!foulFor.playerId} onClose={() => setFoulFor(null)} onPick={(kind) => addFoul(foulFor.side, kind, foulFor.playerId)} />
      )}

      <Sheet
        open={ending}
        onClose={() => setEnding(false)}
        title={s ? periodEndLabel(config, s.period) : ''}
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
                  act({ type: 'period_end', at: stamp() });
                  setEnding(false);
                }}
              >
                Confirmar
              </Button>
            </View>
          </View>
        }
      >
        {s && (
          <View style={{ gap: 8 }}>
            <Txt variant="stat">{`${s.score[0]}-${s.score[1]}`}</Txt>
            {s.period >= config.periods && s.score[0] !== s.score[1] ? (
              <Txt tone="fg2">
                Termina el partido: gana <Txt style={{ fontFamily: font.bold }}>{names[s.score[0] > s.score[1] ? 0 : 1]}</Txt>. Después toca{' '}
                <Txt style={{ fontFamily: font.bold }}>Terminar</Txt> para enviar el resultado.
              </Txt>
            ) : s.period >= config.periods ? (
              <Txt tone="fg2">{`Empate: sigue la prórroga${config.overtimeMinutes ? ` de ${config.overtimeMinutes} minutos` : ''}.`}</Txt>
            ) : (
              <Txt tone="fg2">
                {`Pasa a ${basketballPeriodLabel(config, s.period + 1).toLowerCase()}. ${config.variant === '5x5' && s.period + 1 <= config.periods ? 'Las faltas de equipo vuelven a 0.' : ''}`.trimEnd()}
              </Txt>
            )}
          </View>
        )}
      </Sheet>

      {more && s && (
        <MoreSheet
          onClose={() => setMore(false)}
          state={s}
          config={config}
          names={names}
          late={late}
          setLate={setLate}
          act={act}
          onFoul={(side, kind) => addFoul(side, kind, null)}
        />
      )}

      {presentes && s && (
        <PresentesSheet
          onClose={() => setPresentes(false)}
          tl={tl}
          match={m}
          rsvps={rsvps.data}
          current={[s.present[0], s.present[1]]}
          reinforcements={rules.reinforcements}
          onSave={savePresent}
        />
      )}
    </CourtShell>
  );
}

const FOUL_HINT: Partial<Record<FoulKind, string>> = {
  offensive: 'Cuenta como falta de equipo, sin tiros libres',
  technical: '1 tiro libre',
  unsportsmanlike: '2 tiros libres y posesión',
  disqualifying: 'Sale del juego',
  coach_technical: 'No cuenta como falta de equipo',
  bench_technical: 'No cuenta como falta de equipo',
};

/** Tipo de falta: personal, ofensiva, técnica, antideportiva (y las raras en «Más tipos»). */
function FoulPicker({ title, withPlayer, onClose, onPick }: { title: string; withPlayer: boolean; onClose: () => void; onPick: (k: FoulKind) => void }) {
  const c = useColors();
  const [moreKinds, setMoreKinds] = useState(false);
  const main: FoulKind[] = ['personal', 'offensive', 'technical', 'unsportsmanlike'];
  const extra: FoulKind[] = withPlayer ? ['disqualifying'] : ['disqualifying', 'coach_technical', 'bench_technical'];
  return (
    <Sheet open onClose={onClose} title={title}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {main.map((k) => (
          <Pressable
            key={k}
            accessibilityRole="button"
            onPress={() => onPick(k)}
            style={({ pressed }) => ({ width: '48%', minHeight: 72, alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: 18, paddingHorizontal: 8, backgroundColor: c.surface2, transform: [{ scale: pressed ? 0.97 : 1 }] })}
          >
            <Txt style={{ fontSize: 17, fontFamily: font.semibold, textAlign: 'center' }}>{FOUL_LABEL[k]}</Txt>
            {!!FOUL_HINT[k] && (
              <Txt variant="small" tone="muted" style={{ textAlign: 'center', fontSize: 12, fontFamily: font.regular }}>
                {FOUL_HINT[k]}
              </Txt>
            )}
          </Pressable>
        ))}
      </View>
      {moreKinds ? (
        <View style={{ gap: 8 }}>
          {extra.map((k) => (
            <Pressable
              key={k}
              accessibilityRole="button"
              onPress={() => onPick(k)}
              style={({ pressed }) => ({ minHeight: 48, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: pressed ? c.line : c.surface2 })}
            >
              <Txt variant="bodyStrong">{FOUL_LABEL[k]}</Txt>
              <Txt variant="meta" tone="muted" style={{ fontSize: 13 }}>
                {FOUL_HINT[k]}
              </Txt>
            </Pressable>
          ))}
        </View>
      ) : (
        <Txt accessibilityRole="button" variant="meta" tone="accent" style={{ fontFamily: font.semibold, paddingVertical: 12 }} onPress={() => setMoreKinds(true)}>
          {`Más tipos (descalificante${withPlayer ? '' : ', entrenador, banco'})`}
        </Txt>
      )}
    </Sheet>
  );
}

/** Jugadas que no van en la pantalla principal: salto inicial, posesión alterna, técnicas al banco, reloj, forfeit, default. */
function MoreSheet({
  onClose,
  state: s,
  config,
  names,
  late,
  setLate,
  act,
  onFoul,
}: {
  onClose: () => void;
  state: BasketballState;
  config: BasketballConfig;
  names: readonly [string, string];
  late: boolean;
  setLate: (v: boolean) => void;
  act: (ev: BasketballEvent) => boolean;
  onFoul: (side: Side, kind: FoulKind) => void;
}) {
  const [clock, setClock] = useState('');
  const doAct = (ev: BasketballEvent) => {
    if (act(ev)) onClose();
  };
  const remaining = parseRemaining(clock);
  const setRemaining = () => {
    if (remaining === null) return;
    doAct({ type: 'clock', action: 'set', remainingMs: remaining, at: stamp() });
    setClock('');
  };
  const ending = async (kind: 'forfeit' | 'default', side: Side) => {
    const yes = await confirmAsync({
      title: kind === 'forfeit' ? `¿${names[side - 1]} no se presentó?` : `¿${names[side - 1]} se quedó sin jugadores?`,
      message:
        kind === 'forfeit'
          ? `Pierde ${config.forfeitScore}-0 por forfeit y no suma puntos en la tabla. Después toca Terminar.`
          : 'Pierde por default: si iba ganando, queda 2-0; si no, se queda el marcador. Suma 1 punto en la tabla. Después toca Terminar.',
      confirmText: 'Sí, anotar',
      danger: true,
    });
    if (yes) doAct({ type: kind, side, at: stamp() });
  };
  const title = (t: string) => (
    <Txt variant="bodyStrong" style={{ fontSize: 15 }}>
      {t}
    </Txt>
  );
  return (
    <Sheet open onClose={onClose} title="Más jugadas">
      <View style={{ gap: 20 }}>
        {config.variant === '5x5' && (
          <View style={{ gap: 8 }}>
            {title('Posesión')}
            {s.arrow === null ? (
              ([1, 2] as const).map((side) => (
                <Button key={side} size="lg" full onPress={() => doAct({ type: 'jump_ball', side })}>
                  {`Salto: ganó ${names[side - 1]}`}
                </Button>
              ))
            ) : (
              <Button size="lg" full onPress={() => doAct({ type: 'alternating' })}>
                {`Posesión alterna: saca ${names[s.arrow - 1]} (y se voltea la flecha)`}
              </Button>
            )}
          </View>
        )}
        <View style={{ gap: 8 }}>
          {title('Técnica al entrenador o al banco')}
          {([1, 2] as const).map((side) => (
            <Button key={side} size="lg" full onPress={() => onFoul(side, 'coach_technical')}>
              {`Entrenador ${names[side - 1]}`}
            </Button>
          ))}
          {([1, 2] as const).map((side) => (
            <Button key={`b${side}`} size="lg" full onPress={() => onFoul(side, 'bench_technical')}>
              {`Banco ${names[side - 1]}`}
            </Button>
          ))}
        </View>
        {config.clock ? (
          <View style={{ gap: 8 }}>
            {title('Corregir el reloj')}
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Field label="Lo que falta (mm:ss)">
                  <Input keyboardType="numbers-and-punctuation" value={clock} onChangeText={setClock} placeholder="2:00" />
                </Field>
              </View>
              <Button size="lg" onPress={setRemaining} disabled={remaining === null} style={{ height: 56 }}>
                Poner
              </Button>
            </View>
            <Txt variant="small" tone="muted" style={{ fontSize: 13 }}>
              El reloj del teléfono es de referencia, no oficial.
            </Txt>
          </View>
        ) : (
          config.variant === '5x5' &&
          s.period === config.periods && (
            <ToggleRow checked={late} onChange={setLate} label={`Estamos en los últimos 2 minutos (máximo ${config.timeouts.lastTwoMinutes} tiempos muertos)`} />
          )
        )}
        <View style={{ gap: 8 }}>
          {title('Forfeit o default')}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {([1, 2] as const).map((side) => (
              <View key={side} style={{ width: '48%' }}>
                <DangerButton full onPress={() => void ending('forfeit', side)}>
                  {`No vino ${names[side - 1]}`}
                </DangerButton>
              </View>
            ))}
            {([1, 2] as const).map((side) => (
              <View key={`d${side}`} style={{ width: '48%' }}>
                <DangerButton full onPress={() => void ending('default', side)}>
                  {`${names[side - 1]} sin jugadores`}
                </DangerButton>
              </View>
            ))}
          </View>
        </View>
      </View>
    </Sheet>
  );
}
