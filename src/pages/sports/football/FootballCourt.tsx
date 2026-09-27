import { useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowLeftRight, Goal, Hand, MoreHorizontal, Pause, Play, ShieldAlert, Timer, Users, X, Zap } from 'lucide-react';
import { CourtLayout, useCourt, type CourtController } from '../../../court';
import { setMatchPlayers, type Match } from '../../../lib/data/matches';
import { useServerOffset } from '../../../lib/data/teamSports';
import { formatClock } from '../../../sports/team/clock';
import type { Suspended } from '../../../sports/team/discipline';
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
} from '../../../sports/team/football';
import type { Side } from '../../../sports/types';
import { saveErrorMessage, useFeedback } from '../../../components/feedback';
import { Badge, Button, Field, Input, Modal, cx } from '../../../components/ui';
import { ON_OK, rosterOf, shortName, teamColor, textOn } from '../team/logic';
import { BigButton, JerseyButton, ScoreHeader, useTicker } from '../team/ScorerPieces';
import type { TeamLeague } from '../team/useTeamLeague';
import { atBreak, eventLabel, footballAdapter, quietAdapter, replaceLastEvent, stageLabel } from './adapter';
import { CardIcon, REASON_TEXT } from './bits';
import { LineupModal, type LineupSide } from './LineupModal';
import { footballConfigFrom, footballTeamRules } from './rules';

/**
 * Acta digital de fútbol y sala en el teléfono (modo cancha, src/court):
 * - cabecera: marcador grande, tiempo y minuto (marcas de tiempo; corrido en campo, parado en sala), añadido,
 *   faltas acumuladas de sala con alerta en la 5.ª y tiro de 10 m desde la 6.ª, tiempos muertos y rojas;
 * - dos botones gigantes GOL LOCAL / GOL VISITA: el gol cuenta al toque y después, si se quiere, quién marcó y
 *   quién asistió (o autogol, con un toque);
 * - dorsales de los dos equipos: tarjetas (la 2.ª amarilla avisa que es roja), cambios, portero y faltas;
 * - fin de cada tiempo, prórroga y tanda de penales paso a paso (aparte del marcador), 2 minutos con uno menos tras
 *   una roja en sala, y Deshacer siempre a la vista.
 * Todo se guarda en el teléfono en cada toque; se publica en cada gol o roja, en el descanso y al final (y cuando el
 * reloj arranca o se para), nunca por jugada.
 */

interface GoalFlow {
  side: Side;
  at: number;
  step: 'scorer' | 'assist' | 'own';
  scorer?: string;
}

const sameGoal = (a: FootballEvent | undefined, side: Side, at: number) => a?.type === 'goal' && a.side === side && a.at === at;

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
  suspended?: readonly Suspended[];
  onExit: () => void;
}) {
  const { toast } = useFeedback();
  const config = useMemo(() => footballConfigFrom(m.rules, variant), [m.rules, variant]);
  const rules = useMemo(() => footballTeamRules(m.rules, variant), [m.rules, variant]);
  const offset = useServerOffset();
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  // `quietly`: cambiar quién marcó sin publicar el deshacer de en medio (replaceLastEvent).
  const { adapter, quietly } = useMemo(() => quietAdapter(footballAdapter({ offset: () => offsetRef.current })), []);
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
  const [goal, setGoal] = useState<GoalFlow | null>(null);
  const [pick, setPick] = useState<{ side: Side; playerId: string } | null>(null);
  const [subOut, setSubOut] = useState<{ side: Side; playerId: string } | null>(null);
  const [ending, setEnding] = useState(false);
  const [more, setMore] = useState(false);
  const [lineup, setLineup] = useState(false);
  const now = Date.now();
  const pps = s ? activePowerPlays(s, now) : [];
  useTicker(!!s?.clock.running || pps.length > 0, 500);

  const teams = m.sides.map((sd) => tl.teamOf(sd.teamId));
  const colors = [teamColor(teams[0], 1), teamColor(teams[1], 2)] as const;
  const names = [teams[0]?.name ?? m.sides[0].label, teams[1]?.name ?? m.sides[1].label] as const;
  const readOnly = court.readOnly || court.over || !s;
  const official = tl.officialOf(m.id);
  const suspendedIds = useMemo(() => new Map(suspended.map((x) => [`${x.team}:${x.player}`, x] as const)), [suspended]);
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
    const at = Date.now();
    if (act({ type: 'goal', side, at })) setGoal({ side, at, step: 'scorer' });
  };
  const closeGoal = () => {
    setGoal(null);
    court.flush();
  };

  const toggleClock = () => {
    if (!s) return;
    act({ type: 'clock', action: s.clock.running ? 'stop' : 'start', at: Date.now() });
  };

  const card = (side: Side, playerId: string, kind: 'yellow' | 'red') => {
    const p = s?.players[side - 1][playerId];
    const second = kind === 'yellow' && (p?.yellows ?? 0) >= 1;
    if (!act({ type: 'card', side, player: playerId, card: kind, at: Date.now() })) return;
    setPick(null);
    if (second || kind === 'red') {
      toast(`${second ? 'Segunda amarilla: ROJA. ' : 'Roja: '}${who(side, playerId)} expulsado${config.powerPlayMs ? `. ${names[side - 1]} juega con uno menos 2 minutos.` : '.'}`, 'error');
      court.flush();
    }
  };

  const foul = (side: Side, playerId?: string) => {
    if (!act({ type: 'foul', side, ...(playerId ? { player: playerId } : {}), at: Date.now() })) return;
    setPick(null);
  };

  const timeout = (side: Side) => {
    if (s?.clock.running) court.apply({ type: 'clock', action: 'stop', at: Date.now() });
    if (act({ type: 'timeout', side, at: Date.now() })) toast(`Tiempo muerto de ${names[side - 1]}`);
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
          <span className={cx('tabular-nums', f.alert && 'font-bold text-danger')}>Faltas {f.count}</span>
        )}
        {config.accumulatedFouls && f.count >= config.accumulatedFouls.penaltyFrom - 1 && <Badge tone="danger">10 m</Badge>}
        {config.timeoutsPerHalf > 0 && <span className="tabular-nums">· TM {footballTimeoutsLeft(s, side)}</span>}
        {reds > 0 && (
          <span className="flex items-center gap-0.5">
            {Array.from({ length: reds }, (_, k) => (
              <CardIcon key={k} kind="red" />
            ))}
          </span>
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
          <span className="text-xs font-semibold uppercase text-muted">{stageLabel(s)}</span>
          {minute && !breakNow && s.status === 'playing' && (
            <span className={cx('text-3xl font-black tabular-nums leading-none', timeUp ? 'text-danger' : s.clock.running && 'text-ok')} aria-live="off">
              {minute}
            </span>
          )}
          {clockUsed && s.status === 'playing' && started && <span className="text-xs tabular-nums text-muted">{formatClock(elapsed)}</span>}
          {added != null && added > 0 && s.status === 'playing' && <Badge tone="accent">+{added} añadido</Badge>}
          {pens && s.status !== 'playing' && (
            <span className="text-sm font-bold tabular-nums">
              Pen. {pens[0]}-{pens[1]}
            </span>
          )}
          {clockUsed && s.status === 'playing' && (
            <Button
              size="sm"
              variant={s.clock.running ? 'secondary' : 'primary'}
              disabled={readOnly}
              onClick={toggleClock}
              icon={s.clock.running ? <Pause className="size-4" /> : <Play className="size-4" />}
              aria-label={s.clock.running ? 'Parar el reloj' : 'Arrancar el reloj'}
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
    const i = side - 1;
    const roster = rosterOf(tl.teams.data, m.sides[i].teamId).map((r) => r.playerId);
    const all = [...new Set([...(s.onField[i] ?? []), ...s.present[i], ...roster, ...Object.keys(s.players[i])])];
    const field = s.onField[i];
    const rank = (id: string) => {
      const p = s.players[i][id];
      if (p?.red) return 3;
      if (field) return field.includes(id) ? 0 : p?.subbedOff ? 2 : 1;
      return p?.subbedOff ? 2 : 0;
    };
    return all.sort((a, b) => rank(a) - rank(b) || (jerseyOf(side, a) ?? 1000) - (jerseyOf(side, b) ?? 1000) || tl.nameOf(a).localeCompare(tl.nameOf(b), 'es'));
  };

  const column = (side: Side) => {
    const i = side - 1;
    const color = colors[i];
    const field = s?.onField[i] ?? null;
    const ids = idsOf(side);
    const tLeft = s ? footballTimeoutsLeft(s, side) : 0;
    return (
      <div className="flex min-h-0 flex-col gap-2">
        {(config.accumulatedFouls || config.timeoutsPerHalf > 0) && (
          <div className="flex items-center gap-1.5">
            {config.accumulatedFouls && (
              <Button size="sm" className="flex-1" disabled={readOnly} onClick={() => foul(side)} icon={<Hand className="size-4" />} aria-label={`Falta de ${names[i]}`}>
                Falta
              </Button>
            )}
            {config.timeoutsPerHalf > 0 && (
              <Button
                size="sm"
                className="flex-1"
                disabled={readOnly || tLeft === 0}
                onClick={() => timeout(side)}
                icon={<Timer className="size-4" />}
                aria-label={`Tiempo muerto de ${names[i]} (quedan ${tLeft})`}
              >
                T. muerto
              </Button>
            )}
          </div>
        )}
        <div className="grid min-h-0 grid-cols-2 content-start gap-1.5 overflow-y-auto sm:grid-cols-3">
          {s && ids.map((pid) => {
            const p = s.players[i][pid];
            const out = !!p?.red;
            const bench = !!field && !field.includes(pid) && !out;
            const gone = !!p?.subbedOff && !config.subs.reentry;
            const susp = suspOf(side, pid);
            return (
              <div key={pid} className={cx('relative', (bench || gone) && !out && 'opacity-60')}>
                <JerseyButton
                  jersey={jerseyOf(side, pid)}
                  name={shortName(tl.nameOf(pid))}
                  stat={
                    <span className="flex items-center gap-0.5">
                      {p?.goals ? <b className="text-fg">{p.goals} G</b> : null}
                      {p?.keeper && s.goalkeeper[i] === pid ? <span title="Portero">POR</span> : null}
                      {p?.red === 'second_yellow' ? <CardIcon kind="second_yellow" /> : p?.yellows ? <CardIcon kind="yellow" /> : null}
                      {p?.red === 'direct' ? <CardIcon kind="red" /> : null}
                      {susp && <span className="font-bold text-danger">SUSP</span>}
                      {gone && !out && <span>salió</span>}
                    </span>
                  }
                  fouls={0}
                  foulMax={null}
                  state={out ? 'out' : p?.yellows ? 'warn' : 'ok'}
                  color={color}
                  selected={pick?.side === side && pick.playerId === pid}
                  disabled={readOnly || out}
                  onTap={() => setPick({ side, playerId: pid })}
                />
              </div>
            );
          })}
          {s && !ids.length && <p className="col-span-full py-4 text-center text-xs text-muted">Sin plantilla: arma la alineación o anota los goles sin jugador.</p>}
        </div>
      </div>
    );
  };

  const lf = s?.lastFoul;
  const finishText = s
    ? `${s.score[0]}-${s.score[1]}${pens && pens[0] + pens[1] > 0 ? ` (pen. ${pens[0]}-${pens[1]})` : ''}${court.winner ? ` · Gana ${names[court.winner - 1]}` : s.score[0] === s.score[1] ? ' · Empate' : ''}`
    : undefined;
  const period = s?.period ?? 1;
  const endLabel = period === 1 ? 'Fin del 1.er tiempo' : period === 2 ? 'Fin del 2.º tiempo' : `Fin de la prórroga ${period - 2}`;

  return (
    <CourtLayout
      title={`${names[0]} vs. ${names[1]}`}
      subtitle={[m.stage || (m.round != null ? `Jornada ${m.round}` : ''), m.court].filter(Boolean).join(' · ') || 'Acta del partido'}
      onExit={onExit}
      court={court as unknown as CourtController<unknown, unknown, unknown>}
      isAdmin={tl.isAdmin}
      header={header}
      undoLabel={undoLabel}
      finishSummary={finishText}
      onFinished={() => onExit()}
      actions={
        <Button
          variant={timeUp ? 'primary' : 'secondary'}
          className="h-14 px-3 text-base"
          disabled={readOnly || s?.status !== 'playing' || breakNow}
          onClick={() => setEnding(true)}
          aria-label={endLabel}
        >
          <Zap className="hidden size-5 sm:inline" />
          <span className="hidden sm:inline">{endLabel}</span>
          <span className="sm:hidden">Fin</span>
        </Button>
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" icon={<Users className="size-4" />} disabled={court.readOnly || !s} onClick={() => setLineup(true)}>
            Alineación
          </Button>
          <Button size="sm" variant="ghost" icon={<MoreHorizontal className="size-4" />} disabled={court.readOnly || !s} onClick={() => setMore(true)}>
            Más
          </Button>
        </div>

        {official && official.userId !== tl.userId && !court.readOnly && (
          <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">
            El anotador de mesa designado es <b>{official.name || 'otra persona'}</b>. Si terminas tú y juegas en un equipo, el resultado lo confirma el rival.
          </p>
        )}
        {noLineup && !court.readOnly && (
          <button type="button" onClick={() => setLineup(true)} className="flex items-center gap-2 rounded-xl bg-accent-soft px-3 py-2 text-left text-sm">
            <Users className="size-4 shrink-0 text-accent" />
            <span className="flex-1">Antes de empezar, marca la alineación y el portero de cada equipo: así cuentan los partidos jugados y las vallas invictas.</span>
          </button>
        )}
        {lf && config.accumulatedFouls && (lf.alert || lf.tenMeter) && (
          <p role="alert" className={cx('flex items-start gap-2 rounded-xl px-3 py-2 text-sm font-medium', lf.tenMeter ? 'bg-danger-soft text-danger' : 'bg-warn-soft text-warn')}>
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {lf.tenMeter
              ? `${lf.count}.ª falta de ${names[lf.side - 1]}: tiro libre desde 10 m sin barrera.`
              : `${lf.count}.ª falta de ${names[lf.side - 1]}: la próxima es tiro libre desde 10 m.`}
          </p>
        )}
        {pps.map((pp, k) => (
          <p key={k} role="status" className="flex items-center gap-2 rounded-xl bg-warn-soft px-3 py-2 text-sm font-medium text-warn">
            <ShieldAlert className="size-4 shrink-0" />
            <span className="flex-1">
              {names[pp.side - 1]} con uno menos (roja de {who(pp.side, pp.player)})
            </span>
            <span className="text-lg font-black tabular-nums">{formatClock(pp.remainingMs, 'up')}</span>
          </p>
        ))}
        {timeUp && s && !breakNow && (
          <p role="status" className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
            Ya se cumplieron los {periodLen} minutos{added ? ` (más ${added} de añadido)` : ''}: cuando pite el árbitro, toca «{endLabel}».
          </p>
        )}

        {s?.status === 'shootout' ? (
          <Shootout state={s} names={names} colors={colors} readOnly={readOnly} who={who} ids={idsOf} act={act} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              {([1, 2] as const).map((side) => (
                <BigButton
                  key={side}
                  tone="team"
                  disabled={readOnly || s?.status !== 'playing'}
                  onTap={() => scoreGoal(side)}
                  style={{ background: colors[side - 1], color: textOn(colors[side - 1]) }}
                  className="min-h-20 flex-col gap-0 text-2xl"
                  ariaLabel={`Gol de ${names[side - 1]}`}
                >
                  <span className="flex items-center gap-1.5">
                    <Goal className="size-6" /> GOL
                  </span>
                  <span className="max-w-full truncate text-xs font-semibold uppercase">{side === 1 ? 'Local' : 'Visita'} · {names[side - 1]}</span>
                </BigButton>
              ))}
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-2 gap-2">
              {column(1)}
              {column(2)}
            </div>
          </>
        )}
      </div>

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
            const at = Date.now();
            if (act({ type: 'goal', side: pick.side, player: pick.playerId, at })) {
              setGoal({ side: pick.side, at, step: 'assist', scorer: pick.playerId });
              setPick(null);
            }
          }}
          onCard={(k) => card(pick.side, pick.playerId, k)}
          onFoul={() => foul(pick.side, pick.playerId)}
          onKeeper={() => {
            if (act({ type: 'goalkeeper', side: pick.side, player: pick.playerId, at: Date.now() })) setPick(null);
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
            if (act({ type: 'sub', side: subOut.side, out: subOut.playerId, in: pin, at: Date.now() })) {
              if (suspOf(subOut.side, pin)) toast(`Ojo: ${tl.nameOf(pin)} está suspendido. Queda anotado; el admin decide.`, 'error');
              setSubOut(null);
            }
          }}
        />
      )}

      <Modal
        open={ending}
        onClose={() => setEnding(false)}
        title={endLabel}
        footer={
          <>
            <Button onClick={() => setEnding(false)}>Seguir</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (act({ type: 'period_end', at: Date.now() })) court.flush();
                setEnding(false);
              }}
            >
              Confirmar
            </Button>
          </>
        }
      >
        {s && <EndText state={s} config={config} names={names} />}
      </Modal>

      {s && (
        <MoreSheet
          open={more}
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

      {s && (
        <LineupModal
          open={lineup}
          onClose={() => setLineup(false)}
          tl={tl}
          match={m}
          current={[currentLineup(0), currentLineup(1)]}
          players={config.players}
          reinforcements={rules.reinforcements}
          suspended={suspended}
          onSave={saveLineup}
        />
      )}
    </CourtLayout>
  );
}

/** Lo que pasa al terminar el tiempo. */
function EndText({ state: s, config, names }: { state: FootballState; config: FootballConfig; names: readonly [string, string] }) {
  const tied = s.score[0] === s.score[1];
  let next: ReactNode;
  if (s.period === 1) next = <p>Descanso. {config.accumulatedFouls && 'Las faltas acumuladas vuelven a 0.'} El reloj del 2.º tiempo arranca en 0.</p>;
  else if (s.period === 3) next = <p>Termina la 1.ª parte de la prórroga.</p>;
  else if (s.period === 2 && tied && config.extraTime) next = <p>Empate: sigue la prórroga de 2 × {config.extraTimeMinutes} minutos.</p>;
  else if (tied && config.shootout) next = <p>Empate: tanda de penales ({config.shootoutKicks} por equipo y luego muerte súbita). No cuentan en los goles.</p>;
  else
    next = (
      <p>
        Termina el partido: {tied ? <b>empate</b> : <>gana <b>{names[s.score[0] > s.score[1] ? 0 : 1]}</b></>}. Después toca <b>Terminar</b> para enviar el resultado.
      </p>
    );
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="text-2xl font-bold tabular-nums">
        {s.score[0]}-{s.score[1]}
      </p>
      {next}
    </div>
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
  onlyAvailable = true,
}: {
  side: Side;
  ids: string[];
  state: FootballState;
  who: (side: Side, id?: string | null) => string;
  exclude?: string[];
  onPick: (id: string) => void;
  onlyAvailable?: boolean;
}) {
  const i = side - 1;
  const field = s.onField[i];
  const list = ids.filter((id) => {
    if (exclude.includes(id)) return false;
    const p = s.players[i][id];
    if (p?.red) return false;
    if (!onlyAvailable) return true;
    if (field) return field.includes(id);
    return !(p?.subbedOff && !s.config.subs.reentry);
  });
  if (!list.length) return <p className="py-2 text-center text-sm text-muted">Sin jugadores para elegir.</p>;
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {list.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onPick(id)}
          className="flex min-h-14 flex-col items-center justify-center rounded-xl border-2 border-line bg-surface px-1 text-center font-semibold active:scale-[0.97]"
        >
          <span className="w-full truncate text-sm">{who(side, id)}</span>
        </button>
      ))}
    </div>
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
  const minute = [...state.timeline].reverse().find((t) => t.kind === 'goal' || t.kind === 'own_goal')?.minute;
  const title =
    flow.step === 'own'
      ? `Autogol: ¿de quién de ${names[other - 1]}?`
      : flow.step === 'assist'
        ? `¿Quién asistió a ${who(flow.side, flow.scorer)}?`
        : `¡Gol de ${names[flow.side - 1]}!${minute ? ` (${minute}')` : ''} ¿Quién marcó?`;
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      footer={
        <Button variant="primary" onClick={onClose}>
          {flow.step === 'assist' ? 'Sin asistencia' : 'Listo (sin jugador)'}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">El gol ya cuenta. Esto es opcional.</p>
        <JerseyGrid
          side={flow.step === 'own' ? other : flow.side}
          ids={ids(flow.step === 'own' ? other : flow.side)}
          state={state}
          who={who}
          exclude={flow.step === 'assist' && flow.scorer ? [flow.scorer] : []}
          onPick={onPick}
        />
        {flow.step === 'scorer' && (
          <Button className="h-12" variant="ghost" onClick={onOwnGoal}>
            Fue autogol de {names[other - 1]}
          </Button>
        )}
      </div>
    </Modal>
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
  const p = s.players[side - 1][playerId];
  const yellows = p?.yellows ?? 0;
  const keeper = s.goalkeeper[side - 1] === playerId;
  const playing = s.status === 'playing';
  const field = s.onField[side - 1];
  const onField = !field || field.includes(playerId);
  const big = 'flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl border-2 px-2 text-center font-semibold active:scale-[0.97] disabled:opacity-40';
  return (
    <Modal open onClose={onClose} title={`${name} · ${teamName}`} footer={<Button onClick={onClose}>Cerrar</Button>}>
      <div className="flex flex-col gap-3">
        {suspended && (
          <p role="alert" className="flex items-center gap-2 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
            <AlertTriangle className="size-4 shrink-0" />
            Está suspendido para este partido ({REASON_TEXT[suspended.reason] ?? suspended.reason}).
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={cx(big, 'border-ok bg-ok-soft text-ok')} disabled={!playing} onClick={onGoal}>
            <Goal className="size-6" />
            Gol
          </button>
          <button type="button" className={cx(big, yellows ? 'border-danger bg-danger-soft text-danger' : 'border-warn bg-warn-soft text-warn')} onClick={() => onCard('yellow')}>
            <CardIcon kind={yellows ? 'second_yellow' : 'yellow'} className="scale-125" />
            {yellows ? '2.ª amarilla = ROJA' : 'Amarilla'}
          </button>
          <button type="button" className={cx(big, 'border-danger bg-danger-soft text-danger')} onClick={() => onCard('red')}>
            <CardIcon kind="red" className="scale-125" />
            Roja directa
          </button>
          <button type="button" className={cx(big, 'border-line bg-surface')} disabled={!playing || !onField} onClick={onSub}>
            <ArrowLeftRight className="size-6" />
            {onField ? 'Cambio (sale)' : 'En el banco'}
          </button>
          <button type="button" className={cx(big, keeper ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface')} onClick={onKeeper} disabled={keeper}>
            <Hand className="size-6" />
            {keeper ? 'Es el portero' : 'Portero'}
          </button>
          <button type="button" className={cx(big, 'border-line bg-surface')} disabled={!playing} onClick={onFoul}>
            <Hand className="size-6 rotate-90" />
            Falta{config.accumulatedFouls ? ` (${s.fouls[side - 1]} del equipo)` : ''}
          </button>
        </div>
        {yellows > 0 && <p className="text-xs text-warn">Ya tiene amarilla: la segunda es roja y sale del partido.</p>}
      </div>
    </Modal>
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
  const field = s.onField[i];
  const max = config.subs.max === null ? null : config.subs.max + (s.period >= 3 ? config.subs.extraTimeBonus : 0);
  const bench = ids.filter((id) => {
    if (id === out.playerId) return false;
    const p = s.players[i][id];
    if (p?.red) return false;
    if (p?.subbedOff && !config.subs.reentry) return false;
    return field ? !field.includes(id) : true;
  });
  return (
    <Modal open onClose={onClose} title={`Sale ${who(out.side, out.playerId)}: ¿quién entra?`} footer={<Button onClick={onClose}>Cancelar</Button>}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">
          Cambios: {s.subsUsed[i]}
          {max !== null ? ` de ${max}` : ' (sin límite)'}
          {config.subs.reentry ? ' · con reingreso' : ''}
        </p>
        {!bench.length ? (
          <p className="py-2 text-center text-sm text-muted">No hay suplentes. Agrégalos a la plantilla o a la alineación.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {bench.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => onPick(id)}
                className={cx(
                  'flex min-h-14 flex-col items-center justify-center rounded-xl border-2 bg-surface px-1 text-center font-semibold active:scale-[0.97]',
                  suspOf(out.side, id) ? 'border-danger' : 'border-line',
                )}
              >
                <span className="w-full truncate text-sm">{who(out.side, id)}</span>
                {suspOf(out.side, id) && <span className="text-[10px] font-bold uppercase text-danger">Suspendido</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Tanda de penales paso a paso: quién patea, gol o fallado, y cómo va (aparte del marcador). */
export function Shootout({
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
  const [kicker, setKicker] = useState<string | null>(null);
  const [first, setFirst] = useState<Side | null>(null);
  const kicks = s.shootout?.kicks ?? [];
  const nextSide: Side | null = kicks.length ? (kicks.length % 2 === 0 ? kicks[0].side : kicks[0].side === 1 ? 2 : 1) : first;
  const score = shootoutScore(s) ?? [0, 0];
  const kick = (scored: boolean) => {
    if (!nextSide) return;
    if (act({ type: 'shootout', side: nextSide, scored, ...(kicker ? { player: kicker } : {}) })) setKicker(null);
  };
  const row = (side: Side) => (
    <div className="flex items-center gap-2">
      <span className="w-24 truncate text-sm font-semibold">{names[side - 1]}</span>
      <div className="flex flex-wrap gap-1">
        {kicks
          .filter((k) => k.side === side)
          .map((k, i) => (
            <span
              key={i}
              title={k.player ? who(side, k.player) : undefined}
              className={cx(
                'inline-flex size-6 items-center justify-center rounded-full text-xs font-bold',
                k.scored ? 'bg-ok text-[color:var(--on-ok,var(--bg))]' : 'bg-danger text-on-danger',
              )}
            >
              {k.scored ? '✓' : '✗'}
            </span>
          ))}
      </div>
      <span className="ml-auto text-xl font-black tabular-nums">{score[side - 1]}</span>
    </div>
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
      <div className="flex flex-col gap-2 rounded-2xl bg-surface-2 p-3">
        <p className="text-sm font-semibold">Tanda de penales ({s.config.shootoutKicks} y luego muerte súbita)</p>
        {row(1)}
        {row(2)}
      </div>
      {s.status === 'final' ? null : !nextSide ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">¿Quién patea primero?</p>
          <div className="grid grid-cols-2 gap-2">
            {([1, 2] as const).map((side) => (
              <BigButton key={side} tone="team" disabled={readOnly} onTap={() => setFirst(side)} style={{ background: colors[side - 1], color: textOn(colors[side - 1]) }} className="text-lg">
                {names[side - 1]}
              </BigButton>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">
            Patea <b>{names[nextSide - 1]}</b>
            {kicker ? `: ${who(nextSide, kicker)}` : ' (toca el dorsal si quieres anotar quién)'}
          </p>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {ids(nextSide)
              .filter((id) => !s.players[nextSide - 1][id]?.red)
              .map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={kicker === id}
                  onClick={() => setKicker(kicker === id ? null : id)}
                  className={cx('shrink-0 rounded-xl border-2 px-3 py-2 text-sm font-semibold', kicker === id ? 'border-accent bg-accent-soft' : 'border-line bg-surface')}
                >
                  {who(nextSide, id)}
                </button>
              ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <BigButton tone="team" disabled={readOnly} onTap={() => kick(true)} className="min-h-20" style={{ background: 'var(--ok)', color: ON_OK }} ariaLabel={`Penal de ${names[nextSide - 1]}: gol`}>
              <Goal className="size-7" /> GOL
            </BigButton>
            <BigButton tone="team" disabled={readOnly} onTap={() => kick(false)} className="min-h-20" style={{ background: 'var(--danger)', color: 'var(--on-danger)' }} ariaLabel={`Penal de ${names[nextSide - 1]}: fallado`}>
              <X className="size-7" /> Falló
            </BigButton>
          </div>
        </div>
      )}
    </div>
  );
}

/** Jugadas que no van en la pantalla principal: añadido, corregir el reloj, los 2 minutos de sala, W.O. */
function MoreSheet({
  open,
  onClose,
  state: s,
  config,
  names,
  now,
  act,
  onLineup,
}: {
  open: boolean;
  onClose: () => void;
  state: FootballState;
  config: FootballConfig;
  names: readonly [string, string];
  now: number;
  act: (ev: FootballEvent) => boolean;
  onLineup: () => void;
}) {
  const { confirm } = useFeedback();
  const [clock, setClock] = useState('');
  const doAct = (ev: FootballEvent) => {
    if (act(ev)) onClose();
  };
  const CLOCK = /^(\d{1,3})[:.](\d{2})$/;
  const setElapsed = () => {
    const m = CLOCK.exec(clock.trim());
    if (!m) return;
    doAct({ type: 'clock', action: 'set', elapsedMs: (Number(m[1]) * 60 + Number(m[2])) * 1000, at: Date.now() });
    setClock('');
  };
  const walkover = async (side: Side) => {
    const yes = await confirm({
      title: `¿${names[side - 1]} no se presentó?`,
      message: `Pierde ${config.walkoverScore}-0 por W.O. Después toca Terminar.`,
      confirmText: 'Sí, anotar W.O.',
      danger: true,
    });
    if (yes) doAct({ type: 'walkover', side });
  };
  const pps = activePowerPlays(s, now);
  const playing = s.status === 'playing';
  return (
    <Modal open={open} onClose={onClose} title="Más jugadas" footer={<Button onClick={onClose}>Cerrar</Button>}>
      <div className="flex flex-col gap-4">
        <Button className="h-12 justify-start" icon={<Users className="size-5" />} onClick={onLineup}>
          Alineación y portero
        </Button>
        {config.clock !== 'none' && playing && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Añadido de este tiempo</h3>
            <div className="flex flex-wrap gap-1.5">
              {[0, 1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                <Button key={n} size="sm" variant={s.addedTime[s.period - 1] === n ? 'primary' : 'secondary'} onClick={() => doAct({ type: 'added_time', minutes: n })}>
                  +{n}
                </Button>
              ))}
            </div>
          </section>
        )}
        {config.clock !== 'none' && playing && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Corregir el reloj</h3>
            <div className="flex gap-2">
              <Field label="Tiempo jugado de este tiempo (mm:ss)" className="flex-1">
                <Input inputMode="numeric" value={clock} onChange={(e) => setClock(e.target.value)} placeholder="23:00" />
              </Field>
              <Button className="mt-auto" onClick={setElapsed} disabled={!CLOCK.test(clock.trim())}>
                Poner
              </Button>
            </div>
            <p className="text-xs text-muted">El reloj del teléfono es de referencia; el que manda es el del árbitro.</p>
          </section>
        )}
        {pps.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Uno menos (2 minutos)</h3>
            {[...new Set(pps.map((p) => p.side))].map((side) => (
              <Button key={side} className="h-12" onClick={() => doAct({ type: 'power_play_end', side, at: Date.now() })}>
                {names[side - 1]} ya completa
              </Button>
            ))}
          </section>
        )}
        {playing && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">W.O.</h3>
            <div className="grid grid-cols-2 gap-2">
              {([1, 2] as const).map((side) => (
                <Button key={side} className="h-12" variant="ghost" onClick={() => void walkover(side)}>
                  No vino {names[side - 1]}
                </Button>
              ))}
            </div>
          </section>
        )}
      </div>
    </Modal>
  );
}
