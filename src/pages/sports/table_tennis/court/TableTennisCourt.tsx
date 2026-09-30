import { useMemo, useState } from 'react';
import { ArrowLeftRight, Flag, Repeat2, Settings2 } from 'lucide-react';
import { CourtLayout, TwoHalves } from '../../../../court';
import { updateMatchSchedule, type Match } from '../../../../lib/data/matches';
import { useLeagueCtx } from '../../../../lib/league';
import type { MatchSetup, Player, TableTennisEvent, TableTennisRules, TableTennisState } from '../../../../sports/racket';
import type { Side } from '../../../../sports/types';
import { useAction } from '../../../../components/feedback';
import { Badge, Button, Modal, cx } from '../../../../components/ui';
import { engineRules } from '../../racket/court/adapters';
import { useAdapterCourt } from '../../racket/court/useAdapterCourt';
import { presetOf, presetsOf, rulesText } from '../../racket/logic/rulesText';
import { useNames } from '../../racket/names';
import type { RacketCourtProps } from '../../racket/sport';
import { servesText, tableTennisAdapter, ttView, winnerText, type TtView } from './logic';

/** Reglas del partido de ping pong (las suyas o las de la liga). */
export const ttRules = (match: Pick<Match, 'rules'>): TableTennisRules => engineRules('table_tennis', match.rules) as TableTennisRules;

/**
 * La mesa de ping pong: antes de empezar, el sorteo (quién saca, en dobles quién saca y quién recibe primero, y qué
 * lado queda a tu izquierda); después, dos mitades gigantes (se toca el lado que ganó el punto) con los puntos del
 * juego, los juegos, quién saca y quién recibe, cuántos saques le quedan, «Un saque cada uno» desde el 10-10, punto
 * de juego o de partido, el cambio de lado (fin de juego y a los 5 del decisivo) y, en dobles, el cruce de la
 * recepción en el decisivo. Se termina con finish_match y el rival confirma.
 */
export function TableTennisCourt({ match, isAdmin, userId, onExit }: RacketCourtProps) {
  const { lid } = useLeagueCtx();
  const names = useNames();
  const rules = useMemo(() => ttRules(match), [match]);
  const adapter = useMemo(() => tableTennisAdapter(rules), [rules]);
  const court = useAdapterCourt<MatchSetup, TableTennisState, TableTennisEvent>({ lid, matchId: match.id, userId, status: match.status, config: null, adapter });
  const [retiring, setRetiring] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const labels = [match.sides[0].label, match.sides[1].label] as const;
  const people = match.sides.map((x) => x.players.map((p) => names.nameOf(p.playerId)));
  const s = court.state;
  const v = s ? ttView(s, people, labels) : null;
  const title = [match.stage || (match.round != null ? `Jornada ${match.round}` : null), match.court].filter(Boolean).join(' · ') || 'Partido';

  if (court.ready && !court.snapshot) {
    return (
      <CourtLayout title={title} subtitle="Antes de empezar" onExit={onExit} court={court} isAdmin={isAdmin} canSuspend={false}>
        <TTSetup
          rules={rules}
          labels={labels}
          people={people}
          match={match}
          canChange={isAdmin && match.status === 'scheduled' && match.seq === 0}
          onStart={(setup) => court.start(setup)}
        />
      </CourtLayout>
    );
  }

  const winner = court.over ? court.winner : null;
  const won = winner ? winnerText(winner, labels, court.summary, rules.doubles) : null;
  const header = v && (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {!v.over && <Badge tone="accent">{`Juego ${v.gameNo} de ${rules.bestOf}${v.deciding ? ' · decisivo' : ''}`}</Badge>}
        {/* Juegos con el lado de la izquierda primero, como las mitades (se cambia de lado en cada juego). */}
        {!v.over && <Badge tone="neutral" className="tabular-nums">{`Juegos ${v.gamesLeft[0]}-${v.gamesLeft[1]}`}</Badge>}
        {v.doneLeft.map((x, i) => (
          <Badge key={i} tone="neutral" className="text-sm tabular-nums">
            {x}
          </Badge>
        ))}
        {v.matchPoint !== null ? <Badge tone="accent">Punto de partido</Badge> : v.gamePoint !== null ? <Badge tone="accent">Punto de juego</Badge> : null}
        {v.deuce && <Badge tone="warn">Un saque cada uno</Badge>}
      </div>
      {!v.over && (
        <ServeStrip v={v} doubles={rules.doubles} onOrder={v.canOrder ? () => setOrdering(true) : null} disabled={court.readOnly} />
      )}
      {v.switchNow && !v.over && (
        <p className="flex items-center gap-2 rounded-xl bg-warn-soft px-3 py-2 text-base font-bold text-warn" role="alert">
          <ArrowLeftRight className="size-5" /> Cambio de lado
        </p>
      )}
      {v.receiveSwap && v.nextReceiver && !v.over && (
        <p className="rounded-xl bg-warn-soft px-3 py-2 text-sm font-semibold text-warn" role="alert">
          La pareja que recibe cambia su orden: ahora recibe <b>{v.nextReceiver}</b>
        </p>
      )}
      {court.over && (
        <p className="rounded-xl bg-ok-soft px-3 py-2 text-sm font-semibold text-ok" role="status">
          {won ? `${won.who}: ${won.score}` : court.summary}. Toca «Terminar» para enviar.
        </p>
      )}
    </div>
  );

  const half = (i: 0 | 1) => {
    const side = (i + 1) as Side;
    const serving = !!v && !v.over && v.serving === side;
    return {
      label: labels[i],
      big: v?.now[i] ?? 0,
      sub: `Juegos ${v?.gamesWon[i] ?? 0}${serving ? ' · saca' : ''}`,
      onTap: () => court.apply({ type: 'point', side }),
      ariaLabel: `Punto para ${labels[i]}`,
    };
  };

  return (
    <>
      <CourtLayout
        title={title}
        subtitle={rulesText(rules)}
        onExit={onExit}
        court={court}
        isAdmin={isAdmin}
        header={header}
        undoLabel="Deshacer punto"
        finishSummary={won ? `${won.score} · ${won.who}` : court.summary}
        onFinished={() => onExit()}
        actions={
          <Button className="h-14" onClick={() => setRetiring(true)} icon={<Flag className="size-5" />} disabled={court.readOnly || court.over} aria-label="Retiro">
            <span className="hidden sm:inline">Retiro</span>
          </Button>
        }
      >
        <TwoHalves swap={s?.leftSide === 2} disabled={court.readOnly || court.over || !s} a={half(0)} b={half(1)} />
      </CourtLayout>

      <Modal open={retiring} onClose={() => setRetiring(false)} title="¿Quién se retira?">
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">Gana el otro lado. Se guarda el marcador de ahora y, para la tabla, se completan los juegos a favor del ganador.</p>
          {([1, 2] as const).map((side) => (
            <Button
              key={side}
              className="h-12 justify-start"
              onClick={() => {
                court.apply({ type: 'retire', side });
                setRetiring(false);
              }}
            >
              Se retira {labels[side - 1]}
            </Button>
          ))}
        </div>
      </Modal>

      {s && (
        <OrderModal
          open={ordering}
          onClose={() => setOrdering(false)}
          state={s}
          labels={labels}
          people={people}
          onPick={(side, player) => {
            if (!court.apply({ type: 'order', side, player })) setOrdering(false);
          }}
        />
      )}
    </>
  );
}

/** Quién saca (y en dobles a quién, desde la derecha y en diagonal) y cuántos saques le quedan. */
function ServeStrip({ v, doubles, onOrder, disabled }: { v: TtView; doubles: boolean; onOrder: (() => void) | null; disabled: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2">
      <div className="min-w-0 flex-1 text-sm leading-tight" role="status">
        {doubles ? (
          <>
            <p className="truncate">
              Saca <b>{v.serverName}</b> → recibe <b>{v.receiverName}</b>
            </p>
            <p className="truncate text-muted">{servesText(v)} · desde la derecha, en diagonal</p>
          </>
        ) : (
          <p className="truncate">
            Saca <b>{v.serverName}</b> · {servesText(v)}
          </p>
        )}
      </div>
      {/* Aquí y no en la barra de abajo (como en la cancha de sets): con «Orden» ahí, «Terminar» se salía de la pantalla. */}
      {onOrder && (
        <Button size="sm" className="shrink-0" onClick={onOrder} icon={<Repeat2 className="size-4" />} aria-label="Orden de saque" disabled={disabled}>
          Orden
        </Button>
      )}
    </div>
  );
}

/**
 * Orden de dobles antes del primer punto del juego: la pareja que saca elige quién empieza; en el juego 1, la que
 * recibe elige quién recibe primero (desde el juego 2 lo fija el juego anterior).
 */
function OrderModal({
  open,
  onClose,
  state,
  labels,
  people,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  state: TableTennisState;
  labels: readonly [string, string];
  people: string[][];
  onPick: (side: Side, player: Player) => void;
}) {
  const rot = state.rotation;
  if (rot.length < 4) return null;
  const firstGame = state.games.length === 0;
  const rows: { side: Side; text: string; current: Player }[] = [{ side: rot[0].side, text: `${labels[rot[0].side - 1]}: ¿quién saca primero?`, current: rot[0].player }];
  if (firstGame) rows.push({ side: rot[1].side, text: `${labels[rot[1].side - 1]}: ¿quién recibe primero?`, current: rot[1].player });
  return (
    <Modal open={open} onClose={onClose} title="Orden de saque en este juego">
      <div className="flex flex-col gap-4">
        {rows.map((row) => (
          <div key={row.side} className="flex flex-col gap-2">
            <p className="text-sm font-medium">{row.text}</p>
            <div className="grid grid-cols-2 gap-2">
              {([0, 1] as const).map((p) => (
                <Button key={p} className="h-12" variant={row.current === p ? 'primary' : 'secondary'} aria-pressed={row.current === p} onClick={() => onPick(row.side, p)}>
                  {people[row.side - 1]?.[p] ?? `Jugador ${p + 1}`}
                </Button>
              ))}
            </div>
          </div>
        ))}
        {!firstGame && <p className="text-sm text-muted">Recibe primero quien le sacó en el juego anterior a quien empieza a sacar.</p>}
      </div>
    </Modal>
  );
}

function Choice<T extends string | number>({ label, options, value, onChange }: { label: string; options: { value: T; text: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={cx(
              'min-h-14 rounded-2xl border-2 px-3 py-2 text-left text-base font-semibold transition active:scale-[0.98]',
              value === o.value ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface',
            )}
          >
            <span className="line-clamp-2">{o.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * El sorteo: quién saca primero; en dobles, quién de la pareja que saca empieza y quién de la otra recibe primero;
 * y qué lado queda a tu izquierda. El admin puede cambiar las reglas de este partido antes del primer punto.
 */
export function TTSetup({
  rules,
  labels,
  people,
  match,
  canChange,
  onStart,
}: {
  rules: TableTennisRules;
  labels: readonly [string, string];
  people: string[][];
  match: Match;
  canChange: boolean;
  onStart: (s: MatchSetup) => void;
}) {
  const { lid } = useLeagueCtx();
  const run = useAction();
  const [first, setFirst] = useState<Side>(1);
  const [serverPick, setServerPick] = useState<Player>(0);
  const [receiverPick, setReceiverPick] = useState<Player>(0);
  const [left, setLeft] = useState<Side>(1);
  const [changing, setChanging] = useState(false);
  const current = presetOf('table_tennis', rules);
  const receiving: Side = first === 1 ? 2 : 1;
  const pick = (side: Side, value: Player, onChange: (p: Player) => void, text: string) =>
    (people[side - 1]?.length ?? 0) >= 2 ? (
      <Choice
        label={text}
        value={value}
        onChange={onChange}
        options={[
          { value: 0 as Player, text: people[side - 1][0] },
          { value: 1 as Player, text: people[side - 1][1] },
        ]}
      />
    ) : null;
  return (
    <div className="mx-auto flex h-full max-w-xl flex-col gap-5 overflow-y-auto pb-4">
      <div className="flex items-start gap-2 rounded-2xl bg-surface-2 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted">Reglas de este partido</p>
          <p className="text-sm font-semibold">{rulesText(rules)}</p>
        </div>
        {canChange && (
          <Button size="sm" variant="ghost" icon={<Settings2 className="size-4" />} onClick={() => setChanging(true)}>
            Cambiar
          </Button>
        )}
      </div>
      <Modal open={changing} onClose={() => setChanging(false)} title="Reglas de este partido">
        <div className="flex flex-col gap-2">
          {presetsOf('table_tennis').map((p) => (
            <Button
              key={p.id}
              variant={current?.id === p.id ? 'primary' : 'secondary'}
              className="h-auto min-h-12 justify-start py-2 text-left"
              onClick={async () => {
                await run(() => updateMatchSchedule(lid, match.id, { rules: { ...(match.rules ?? {}), match: p.rules } }), 'Reglas cambiadas');
                setChanging(false);
              }}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </Modal>
      <Choice
        label="¿Quién saca primero?"
        value={first}
        onChange={setFirst}
        options={[
          { value: 1, text: labels[0] },
          { value: 2, text: labels[1] },
        ]}
      />
      {rules.doubles && pick(first, serverPick, setServerPick, `${labels[first - 1]}: ¿quién saca primero?`)}
      {rules.doubles && pick(receiving, receiverPick, setReceiverPick, `${labels[receiving - 1]}: ¿quién recibe primero?`)}
      <Choice
        label="¿Quién empieza a tu izquierda?"
        value={left}
        onChange={setLeft}
        options={[
          { value: 1, text: labels[0] },
          { value: 2, text: labels[1] },
        ]}
      />
      <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">
        {rules.doubles
          ? 'Cada uno saca 2 puntos, siempre desde la derecha y en diagonal; desde el 10-10, uno cada uno. Se cambia de lado en cada juego y a los 5 del decisivo.'
          : 'Cada uno saca 2 puntos; desde el 10-10, uno cada uno. Se cambia de lado en cada juego y a los 5 del decisivo.'}
      </p>
      <Button
        variant="primary"
        className="h-14 text-base"
        onClick={() => onStart({ firstServer: first, firstPlayer: first === 1 ? [serverPick, receiverPick] : [receiverPick, serverPick], leftSide: left })}
      >
        Empezar el partido
      </Button>
    </div>
  );
}
