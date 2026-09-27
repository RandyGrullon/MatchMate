import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, Hand, MoreHorizontal, Pause, Play, Timer, Users, X, Zap } from 'lucide-react';
import { CourtLayout, useCourt, type CourtController } from '../../../court';
import { setMatchPlayers, type Match } from '../../../lib/data/matches';
import { useServerOffset } from '../../../lib/data/teamSports';
import {
  basketballPeriodLabel,
  basketballTimeoutsLeft,
  inPenalty,
  remainingMs,
  type BasketballConfig,
  type BasketballEvent,
  type BasketballState,
  type FoulKind,
} from '../../../sports/team/basketball';
import { formatClock } from '../../../sports/team/clock';
import type { Side } from '../../../sports/types';
import { saveErrorMessage, useFeedback } from '../../../components/feedback';
import { Badge, Button, Field, Input, Modal, cx } from '../../../components/ui';
import { rosterOf, shortName, teamColor, textOn } from '../team/logic';
import { PresentesModal, type PresentEntry } from '../team/PresentesModal';
import { BigButton, JerseyButton, ScoreHeader, useTicker } from '../team/ScorerPieces';
import type { TeamLeague } from '../team/useTeamLeague';
import { basketballAdapter, EJECTION_LABEL, eventLabel, FOUL_LABEL } from './adapter';
import { basketballConfigFrom, basketballTeamRules } from './rules';

/**
 * Mesa anotadora de baloncesto en el teléfono (modo cancha, src/court):
 * - cabecera: marcador grande, periodo, reloj de referencia (marcas de tiempo, arrancar/parar), faltas de equipo
 *   con BONUS y tiempos muertos que quedan;
 * - modo rápido (por defecto): +1, +2, +3 y Falta directo al equipo; modo por jugador: se toca el dorsal y luego
 *   +1, +2, +3 o Falta (con su tipo); faltas por jugador con aviso en la 4.ª y FUERA con 5 (o 2 T, 2 U, T+U);
 * - Deshacer siempre a la vista, «Fin del cuarto» y Terminar; presentes (partidos jugados) y refuerzos.
 * Todo se guarda en el teléfono en cada toque y se publica al cambiar de periodo, al parar o arrancar el reloj
 * y como mucho cada 60 s: nunca por canasta.
 */

type Mode = 'quick' | 'players';
const MODE_KEY = 'mm:bb:modo';

function readMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === 'players' ? 'players' : 'quick';
  } catch {
    return 'quick';
  }
}

function saveMode(m: Mode) {
  try {
    localStorage.setItem(MODE_KEY, m);
  } catch {
    // sin almacenamiento: solo por esta vez
  }
}

/** Botón de fin del periodo según el formato. */
function periodEndLabel(cfg: BasketballConfig, period: number): string {
  if (period > cfg.periods) return 'Fin de la prórroga';
  if (cfg.periods === 4) return 'Fin del cuarto';
  if (cfg.periods === 2) return 'Fin de la mitad';
  return 'Fin del tiempo';
}

interface Selection {
  side: Side;
  /** null = al equipo, sin jugador. */
  playerId: string | null;
}

export function BasketballCourt({ tl, match: m, onExit }: { tl: TeamLeague; match: Match; onExit: () => void }) {
  const { toast } = useFeedback();
  const config = useMemo(() => basketballConfigFrom(m.rules), [m.rules]);
  const rules = useMemo(() => basketballTeamRules(m.rules), [m.rules]);
  const offset = useServerOffset();
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  const adapter = useMemo(() => basketballAdapter({ offset: () => offsetRef.current }), []);
  const court = useCourt<BasketballConfig, BasketballState, BasketballEvent>({ lid: tl.lid, matchId: m.id, userId: tl.userId, adapter, status: m.status, config });
  const s = court.state;
  const [mode, setModeState] = useState<Mode>(readMode);
  const [sel, setSel] = useState<Selection | null>(null);
  const [foulFor, setFoulFor] = useState<Selection | null>(null);
  const [ending, setEnding] = useState(false);
  const [more, setMore] = useState(false);
  const [presentes, setPresentes] = useState(false);
  const [late, setLate] = useState(false);
  useTicker(!!s?.clock.running, 200);

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

  const setMode = (next: Mode) => {
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
    if (s?.clock.running) court.apply({ type: 'clock', action: 'stop', at: Date.now() });
  };
  const addPoints = (side: Side, points: 1 | 2 | 3, playerId: string | null) => {
    act({ type: 'score', side, points, ...(playerId ? { player: playerId } : {}), at: Date.now() });
    setSel(null);
  };
  const addFoul = (side: Side, kind: FoulKind, playerId: string | null) => {
    // Con reloj parado (FIBA), cada falta para el reloj; con reloj corrido, sigue.
    if (!rules.runningClock) stopClock();
    act({ type: 'foul', side, kind, ...(playerId && kind !== 'coach_technical' && kind !== 'bench_technical' ? { player: playerId } : {}), at: Date.now() });
    setFoulFor(null);
    setSel(null);
  };
  const timeout = (side: Side) => {
    stopClock();
    if (act({ type: 'timeout', side, at: Date.now(), ...(!config.clock && late ? { lastTwoMinutes: true } : {}) })) toast(`Tiempo muerto de ${names[side - 1]}`);
  };
  const toggleClock = () => {
    if (!s) return;
    act({ type: 'clock', action: s.clock.running ? 'stop' : 'start', at: Date.now() });
  };
  const savePresent = (side: Side, list: PresentEntry[]) => {
    act({ type: 'present', side, players: list.map((p) => p.playerId) });
    setMatchPlayers(tl.lid, m.id, side, list).catch((e) => toast(saveErrorMessage(e), 'error'));
  };

  const now = Date.now();
  const left = s && config.clock ? remainingMs(s, now) : null;
  const timeUp = left === 0;
  const pts = config.variant === '3x3' ? ([1, 2] as const) : ([1, 2, 3] as const);
  const last = court.snapshot?.log.at(-1) as BasketballEvent | undefined;
  const undoLabel = last ? `Deshacer: ${eventLabel(last, (side, p) => who(side, p))}` : 'Deshacer';
  const otNoEnd = !!s && config.overtimeTarget !== null && s.period > config.periods;
  const noPresent = !!s && !s.present[0].length && !s.present[1].length && (court.snapshot?.log.length ?? 0) === 0;

  const sub = (side: Side) => {
    if (!s) return null;
    const i = side - 1;
    return (
      <>
        <span className="tabular-nums">Faltas {s.teamFouls[i]}</span>
        {inPenalty(s, side) && <Badge tone="danger">BONUS</Badge>}
        <span className="tabular-nums">· TM {basketballTimeoutsLeft(s, side, now)}</span>
      </>
    );
  };

  const header = s && (
    <ScoreHeader
      a={{ name: names[0], color: colors[0], score: s.score[0], sub: sub(1) }}
      b={{ name: names[1], color: colors[1], score: s.score[1], sub: sub(2) }}
      center={
        <>
          <span className="text-xs font-semibold uppercase text-muted">{basketballPeriodLabel(config, s.period)}</span>
          {left !== null && (
            <span className={cx('text-3xl font-black tabular-nums leading-none', timeUp ? 'text-danger' : s.clock.running && 'text-ok')} aria-live="off">
              {formatClock(left, 'up')}
            </span>
          )}
          {left !== null && (
            <Button
              size="sm"
              variant={s.clock.running ? 'secondary' : 'primary'}
              disabled={readOnly || (timeUp && !s.clock.running)}
              onClick={toggleClock}
              icon={s.clock.running ? <Pause className="size-4" /> : <Play className="size-4" />}
              aria-label={s.clock.running ? 'Parar el reloj' : 'Arrancar el reloj'}
            >
              {s.clock.running ? 'Parar' : 'Arrancar'}
            </Button>
          )}
          {s.arrow && (
            <span className="flex items-center gap-0.5 text-[11px] text-muted" title="Flecha de posesión alterna">
              {s.arrow === 1 ? <ArrowLeft className="size-3" /> : null}
              Posesión
              {s.arrow === 2 ? <ArrowRight className="size-3" /> : null}
            </span>
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
    const roster = rosterOf(tl.teams.data, m.sides[i].teamId).map((r) => r.playerId);
    const ids = [...new Set([...(s.present[i].length ? s.present[i] : roster), ...Object.keys(s.players[i])])];
    ids.sort((a, b) => (jerseyOf(side, a) ?? 1000) - (jerseyOf(side, b) ?? 1000) || tl.nameOf(a).localeCompare(tl.nameOf(b), 'es'));
    return (
      <div className="flex min-h-0 flex-col gap-2">
        <div className="flex items-center gap-1.5">
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
          {mode === 'players' && (
            <Button
              size="sm"
              variant={sel?.side === side && sel.playerId === null ? 'primary' : 'secondary'}
              disabled={readOnly}
              onClick={() => setSel({ side, playerId: null })}
              aria-label={`Anotar a ${names[i]} sin jugador`}
            >
              Equipo
            </Button>
          )}
        </div>
        {mode === 'quick' ? (
          <div className="grid flex-1 auto-rows-fr gap-2">
            {pts.map((p) => (
              <BigButton key={p} tone="team" disabled={readOnly} onTap={() => addPoints(side, p, null)} style={{ background: color, color: textOn(color) }} ariaLabel={`${p} para ${names[i]}`}>
                +{p}
              </BigButton>
            ))}
            <BigButton tone="warn" disabled={readOnly} onTap={() => setFoulFor({ side, playerId: null })} ariaLabel={`Falta de ${names[i]}`} className="text-xl">
              <Hand className="size-6" />
              Falta
            </BigButton>
          </div>
        ) : (
          <div className="grid min-h-0 grid-cols-2 content-start gap-1.5 overflow-y-auto sm:grid-cols-3">
            {ids.map((pid) => {
              const p = s.players[i][pid];
              const state = p?.out ? 'out' : p?.warning ? 'warn' : 'ok';
              return (
                <JerseyButton
                  key={pid}
                  jersey={jerseyOf(side, pid)}
                  name={shortName(tl.nameOf(pid))}
                  stat={<span>{p?.points ?? 0} pts</span>}
                  fouls={p?.fouls ?? 0}
                  foulMax={config.ejection.fouls}
                  state={state}
                  color={color}
                  selected={sel?.side === side && sel.playerId === pid}
                  disabled={readOnly || state === 'out'}
                  onTap={() => setSel(sel?.side === side && sel.playerId === pid ? null : { side, playerId: pid })}
                />
              );
            })}
            {!ids.length && <p className="col-span-full py-4 text-center text-xs text-muted">Sin plantilla: usa «Equipo» o marca los presentes.</p>}
          </div>
        )}
      </div>
    );
  };

  const lf = s?.lastFoul;
  const lastFoulText = lf
    ? [
        `Falta ${FOUL_LABEL[lf.kind].toLowerCase()} de ${who(lf.side, lf.player)}`,
        lf.kind === 'coach_technical' || lf.kind === 'bench_technical' ? '1 tiro libre' : `${lf.teamFouls}.ª del equipo`,
        lf.kind === 'offensive'
          ? 'sin tiros libres'
          : lf.freeThrows && lf.kind === 'personal'
            ? `bonus: ${lf.freeThrows} tiros libres${lf.possession ? ' + posesión' : ''}`
            : lf.freeThrows && lf.kind !== 'coach_technical' && lf.kind !== 'bench_technical'
              ? `${lf.freeThrows} ${lf.freeThrows === 1 ? 'tiro libre' : 'tiros libres'}${lf.possession ? ' + posesión' : ''}`
              : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;

  const finishText = s ? `${s.score[0]}-${s.score[1]}${court.winner ? ` · Gana ${names[court.winner - 1]}` : ''}` : undefined;

  return (
    <CourtLayout
      title={`${names[0]} vs. ${names[1]}`}
      subtitle={[m.round != null ? `Jornada ${m.round}` : m.stage, m.court].filter(Boolean).join(' · ') || 'Mesa anotadora'}
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
          disabled={readOnly || otNoEnd}
          onClick={() => setEnding(true)}
          aria-label={periodEndLabel(config, s?.period ?? 1)}
        >
          <Zap className="hidden size-5 sm:inline" />
          <span className="hidden sm:inline">{periodEndLabel(config, s?.period ?? 1)}</span>
          <span className="sm:hidden">Fin</span>
        </Button>
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <div role="group" aria-label="Modo de anotar" className="flex rounded-xl bg-surface-2 p-0.5">
            {(['quick', 'players'] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={mode === k}
                onClick={() => setMode(k)}
                className={cx('rounded-lg px-3 py-1.5 text-sm font-medium', mode === k ? 'bg-surface shadow-sm' : 'text-muted')}
              >
                {k === 'quick' ? 'Rápido' : 'Por jugador'}
              </button>
            ))}
          </div>
          <Button size="sm" icon={<Users className="size-4" />} disabled={court.readOnly || !s} onClick={() => setPresentes(true)}>
            Presentes
          </Button>
          <Button size="sm" variant="ghost" icon={<MoreHorizontal className="size-4" />} disabled={court.readOnly || !s} onClick={() => setMore(true)} aria-label="Más jugadas" />
        </div>

        {official && official.userId !== tl.userId && !court.readOnly && (
          <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">
            El anotador de mesa designado es <b>{official.name || 'otra persona'}</b>. Si terminas tú y juegas en un equipo, el resultado lo confirma el rival.
          </p>
        )}
        {noPresent && !court.readOnly && (
          <button type="button" onClick={() => setPresentes(true)} className="flex items-center gap-2 rounded-xl bg-accent-soft px-3 py-2 text-left text-sm">
            <Users className="size-4 shrink-0 text-accent" />
            <span className="flex-1">Antes de empezar, marca los presentes: así cuenta el partido jugado de cada uno.</span>
          </button>
        )}
        {lastFoulText && (
          <p role="status" className={cx('flex items-start gap-2 rounded-xl px-3 py-2 text-sm', lf?.out ? 'bg-danger-soft text-danger' : lf?.warning ? 'bg-warn-soft text-warn' : 'bg-surface-2')}>
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              {lastFoulText}
              {lf?.warning && <b> · ¡4 faltas! Una más y sale.</b>}
              {lf?.out && <b> · {lf.player ? who(lf.side, lf.player) : ''} {EJECTION_LABEL[lf.out] ?? 'sale'}.</b>}
            </span>
          </p>
        )}
        {timeUp && s && !court.over && (
          <p role="status" className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
            Se acabó el tiempo: toca «{periodEndLabel(config, s.period)}».
          </p>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-2 gap-2">
          {column(1)}
          {column(2)}
        </div>

        {sel && s && (
          <div className="flex flex-col gap-2 rounded-2xl border-2 bg-surface p-2" style={{ borderColor: colors[sel.side - 1] }}>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className="min-w-0 flex-1 truncate">
                {who(sel.side, sel.playerId)}
                {sel.playerId ? ` · ${names[sel.side - 1]}` : ' (sin jugador)'}
              </span>
              <Button size="sm" variant="ghost" icon={<X className="size-4" />} onClick={() => setSel(null)} aria-label="Quitar selección" />
            </div>
            <div className={cx('grid gap-2', pts.length === 3 ? 'grid-cols-4' : 'grid-cols-3')}>
              {pts.map((p) => (
                <BigButton key={p} tone="accent" disabled={readOnly} onTap={() => addPoints(sel.side, p, sel.playerId)}>
                  +{p}
                </BigButton>
              ))}
              <BigButton tone="warn" disabled={readOnly} className="text-base" onTap={() => setFoulFor(sel)}>
                Falta
              </BigButton>
            </div>
          </div>
        )}
      </div>

      <FoulPicker
        open={!!foulFor}
        title={foulFor ? `Falta de ${who(foulFor.side, foulFor.playerId)}` : ''}
        withPlayer={!!foulFor?.playerId}
        onClose={() => setFoulFor(null)}
        onPick={(kind) => foulFor && addFoul(foulFor.side, kind, foulFor.playerId)}
      />

      <Modal
        open={ending}
        onClose={() => setEnding(false)}
        title={s ? periodEndLabel(config, s.period) : ''}
        footer={
          <>
            <Button onClick={() => setEnding(false)}>Seguir</Button>
            <Button
              variant="primary"
              onClick={() => {
                act({ type: 'period_end', at: Date.now() });
                setEnding(false);
              }}
            >
              Confirmar
            </Button>
          </>
        }
      >
        {s && (
          <div className="flex flex-col gap-2 text-sm">
            <p className="text-2xl font-bold tabular-nums">
              {s.score[0]}-{s.score[1]}
            </p>
            {s.period >= config.periods && s.score[0] !== s.score[1] ? (
              <p>
                Termina el partido: gana <b>{names[s.score[0] > s.score[1] ? 0 : 1]}</b>. Después toca <b>Terminar</b> para enviar el resultado.
              </p>
            ) : s.period >= config.periods ? (
              <p>Empate: sigue la prórroga{config.overtimeMinutes ? ` de ${config.overtimeMinutes} minutos` : ''}.</p>
            ) : (
              <p>Pasa a {basketballPeriodLabel(config, s.period + 1).toLowerCase()}. {config.variant === '5x5' && s.period + 1 <= config.periods && 'Las faltas de equipo vuelven a 0.'}</p>
            )}
          </div>
        )}
      </Modal>

      {s && (
        <MoreModal
          open={more}
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

      {s && (
        <PresentesModal
          open={presentes}
          onClose={() => setPresentes(false)}
          tl={tl}
          match={m}
          current={[s.present[0], s.present[1]]}
          reinforcements={rules.reinforcements}
          onSave={savePresent}
        />
      )}
    </CourtLayout>
  );
}

/** Tipo de falta: personal, ofensiva, técnica, antideportiva (y las raras en «Más»). */
function FoulPicker({ open, title, withPlayer, onClose, onPick }: { open: boolean; title: string; withPlayer: boolean; onClose: () => void; onPick: (k: FoulKind) => void }) {
  const [moreKinds, setMoreKinds] = useState(false);
  const main: FoulKind[] = ['personal', 'offensive', 'technical', 'unsportsmanlike'];
  const extra: FoulKind[] = withPlayer ? ['disqualifying'] : ['disqualifying', 'coach_technical', 'bench_technical'];
  const hint: Partial<Record<FoulKind, string>> = {
    offensive: 'Cuenta como falta de equipo, sin tiros libres',
    technical: '1 tiro libre',
    unsportsmanlike: '2 tiros libres y posesión',
    disqualifying: 'Sale del juego',
    coach_technical: 'No cuenta como falta de equipo',
    bench_technical: 'No cuenta como falta de equipo',
  };
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="grid grid-cols-2 gap-2">
        {main.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => onPick(k)}
            className="flex min-h-16 flex-col items-center justify-center rounded-2xl border-2 border-line bg-surface px-2 text-center font-semibold active:scale-[0.97]"
          >
            {FOUL_LABEL[k]}
            {hint[k] && <span className="text-[11px] font-normal text-muted">{hint[k]}</span>}
          </button>
        ))}
      </div>
      <div className="mt-3">
        {moreKinds ? (
          <div className="flex flex-col gap-2">
            {extra.map((k) => (
              <Button key={k} className="h-12 justify-start" onClick={() => onPick(k)}>
                {FOUL_LABEL[k]}
                <span className="text-xs font-normal text-muted">{hint[k]}</span>
              </Button>
            ))}
          </div>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setMoreKinds(true)}>
            Más tipos (descalificante{withPlayer ? '' : ', entrenador, banco'})
          </Button>
        )}
      </div>
    </Modal>
  );
}

/** Jugadas que no van en la pantalla principal: salto inicial, posesión alterna, reloj, forfeit, default. */
function MoreModal({
  open,
  onClose,
  state: s,
  config,
  names,
  late,
  setLate,
  act,
  onFoul,
}: {
  open: boolean;
  onClose: () => void;
  state: BasketballState;
  config: BasketballConfig;
  names: readonly [string, string];
  late: boolean;
  setLate: (v: boolean) => void;
  act: (ev: BasketballEvent) => boolean;
  onFoul: (side: Side, kind: FoulKind) => void;
}) {
  const { confirm } = useFeedback();
  const [clock, setClock] = useState('');
  const doAct = (ev: BasketballEvent) => {
    if (act(ev)) onClose();
  };
  const setRemaining = () => {
    const m = /^(\d{1,2})[:.](\d{2})$/.exec(clock.trim());
    if (!m) return;
    doAct({ type: 'clock', action: 'set', remainingMs: (Number(m[1]) * 60 + Number(m[2])) * 1000, at: Date.now() });
    setClock('');
  };
  const ending = async (kind: 'forfeit' | 'default', side: Side) => {
    const yes = await confirm({
      title: kind === 'forfeit' ? `¿${names[side - 1]} no se presentó?` : `¿${names[side - 1]} se quedó sin jugadores?`,
      message:
        kind === 'forfeit'
          ? `Pierde ${config.forfeitScore}-0 por forfeit y no suma puntos en la tabla. Después toca Terminar.`
          : 'Pierde por default: si iba ganando, queda 2-0; si no, se queda el marcador. Suma 1 punto en la tabla. Después toca Terminar.',
      confirmText: 'Sí, anotar',
      danger: true,
    });
    if (yes) doAct({ type: kind, side, at: Date.now() });
  };
  return (
    <Modal open={open} onClose={onClose} title="Más jugadas" footer={<Button onClick={onClose}>Cerrar</Button>}>
      <div className="flex flex-col gap-4">
        {config.variant === '5x5' && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Posesión</h3>
            {s.arrow === null ? (
              <div className="grid grid-cols-2 gap-2">
                {([1, 2] as const).map((side) => (
                  <Button key={side} className="h-12" onClick={() => doAct({ type: 'jump_ball', side })}>
                    Salto: ganó {names[side - 1]}
                  </Button>
                ))}
              </div>
            ) : (
              <Button className="h-12" onClick={() => doAct({ type: 'alternating' })}>
                Posesión alterna: saca {names[s.arrow - 1]} (y se voltea la flecha)
              </Button>
            )}
          </section>
        )}
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Técnica al entrenador o al banco</h3>
          <div className="grid grid-cols-2 gap-2">
            {([1, 2] as const).map((side) => (
              <Button key={side} className="h-12" onClick={() => onFoul(side, 'coach_technical')}>
                Entrenador {names[side - 1]}
              </Button>
            ))}
            {([1, 2] as const).map((side) => (
              <Button key={`b${side}`} className="h-12" onClick={() => onFoul(side, 'bench_technical')}>
                Banco {names[side - 1]}
              </Button>
            ))}
          </div>
        </section>
        {config.clock ? (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Corregir el reloj</h3>
            <div className="flex gap-2">
              <Field label="Lo que falta (mm:ss)" className="flex-1">
                <Input inputMode="numeric" value={clock} onChange={(e) => setClock(e.target.value)} placeholder="2:00" />
              </Field>
              <Button className="mt-auto" onClick={setRemaining} disabled={!/^(\d{1,2})[:.](\d{2})$/.test(clock.trim())}>
                Poner
              </Button>
            </div>
            <p className="text-xs text-muted">El reloj del teléfono es de referencia, no oficial.</p>
          </section>
        ) : (
          config.variant === '5x5' &&
          s.period === config.periods && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-5" checked={late} onChange={(e) => setLate(e.target.checked)} />
              Estamos en los últimos 2 minutos (máximo {config.timeouts.lastTwoMinutes} tiempos muertos)
            </label>
          )
        )}
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Forfeit o default</h3>
          <div className="grid grid-cols-2 gap-2">
            {([1, 2] as const).map((side) => (
              <Button key={side} className="h-12" variant="ghost" onClick={() => void ending('forfeit', side)}>
                No vino {names[side - 1]}
              </Button>
            ))}
            {([1, 2] as const).map((side) => (
              <Button key={`d${side}`} className="h-12" variant="ghost" onClick={() => void ending('default', side)}>
                {names[side - 1]} sin jugadores
              </Button>
            ))}
          </div>
        </section>
      </div>
    </Modal>
  );
}
