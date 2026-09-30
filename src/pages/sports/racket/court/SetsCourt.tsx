import { useMemo, useState } from 'react';
import { ArrowLeftRight, Flag, Repeat2, Settings2 } from 'lucide-react';
import { CourtLayout, TwoHalves, useCourt } from '../../../../court';
import { updateMatchSchedule, type Match } from '../../../../lib/data/matches';
import { useLeagueCtx } from '../../../../lib/league';
import { isGameSport, toLive, type MatchSetup, type Pair, type Player, type RacketEvent, type RacketSport, type RacketState } from '../../../../sports/racket';
import type { Side } from '../../../../sports/types';
import { useAction } from '../../../../components/feedback';
import { Badge, Button, Modal, cx } from '../../../../components/ui';
import { presetOf, presetsOf, rulesText } from '../logic/rulesText';
import { useNames } from '../names';
import { engineRules, racketAdapter } from './adapters';

/**
 * La cancha de un partido a sets (pádel, tenis, pickleball; el ping pong tiene la suya, TableTennisCourt, y esta
 * queda solo de respaldo): antes de empezar, el sorteo (quién saca, orden de saque de cada pareja, quién empieza a
 * la izquierda) y las reglas; después, dos mitades gigantes (se toca la pareja que ganó el punto) con sets, juegos,
 * 15/30/40/AD, «Punto de oro» o «Star point», quién saca y desde qué lado, y el aviso de cambio de lado. El
 * tie-break y el súper tie-break entran solos.
 */
export function SetsCourt({ match, sport, onExit, isAdmin, userId }: { match: Match; sport: RacketSport; onExit: () => void; isAdmin: boolean; userId: string | null }) {
  const { lid } = useLeagueCtx();
  const names = useNames();
  const adapter = useMemo(() => racketAdapter(sport, match.rules), [sport, match.rules]);
  const rules = useMemo(() => engineRules(sport, match.rules), [sport, match.rules]);
  const court = useCourt<MatchSetup, RacketState, RacketEvent>({ lid, matchId: match.id, userId, adapter, status: match.status, config: null });
  const [retiring, setRetiring] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const s = court.state;
  const live = s ? toLive(s) : null;
  const labels = [match.sides[0].label, match.sides[1].label] as const;
  const people = match.sides.map((x) => x.players.map((p) => names.nameOf(p.playerId)));
  const pickle = isGameSport(sport);

  const title = [match.stage || (match.round != null ? `Jornada ${match.round}` : null), match.court].filter(Boolean).join(' · ') || 'Partido';

  if (court.ready && !court.snapshot) {
    return (
      <CourtLayout title={title} subtitle="Antes de empezar" onExit={onExit} court={court} isAdmin={isAdmin} canSuspend={false}>
        <SetupForm
          sport={sport}
          doubles={rules.doubles}
          labels={labels}
          people={people}
          rulesLine={rulesText(rules)}
          match={match}
          isAdmin={isAdmin}
          onStart={(setup) => court.start(setup)}
        />
      </CourtLayout>
    );
  }

  const serverName = live && rules.doubles ? people[live.server - 1]?.[live.serverPlayer] : null;
  const winner = court.over ? court.winner : null;
  const sets = s && (s.sport === 'tennis' || s.sport === 'padel') ? s : null;
  const tb = sets ? sets.tiebreak : false;
  const canOrder = !!sets && rules.doubles && !court.over && sets.points[0] + sets.points[1] === 0 && (!tb || sets.matchTiebreak) && sets.games[0] + sets.games[1] <= 1;

  const header = live && (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {live.done.map((x, i) => (
            <Badge key={i} tone="neutral" className="text-sm tabular-nums">
              {x}
            </Badge>
          ))}
          {!court.over && (
            <span className="text-2xl font-black tabular-nums">
              {live.now[0]}-{live.now[1]}
              <span className="ml-1 text-xs font-medium text-muted">{pickle ? 'puntos' : 'juegos'}</span>
            </span>
          )}
        </div>
        {live.label && <Badge tone={sets?.decidingPoint ? 'warn' : 'accent'}>{live.label}</Badge>}
      </div>
      {!court.over && (
        <div className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2">
          <p className="min-w-0 flex-1 text-sm" role="status">
            {pickle && live.call ? (
              <>
                Canto: <b className="tabular-nums">{live.call}</b> · saca {labels[live.server - 1]}
              </>
            ) : (
              <>
                Saca <b>{serverName ?? labels[live.server - 1]}</b>
                {serverName ? ` (${labels[live.server - 1]})` : ''}
                {live.serveFrom ? ` · desde la ${live.serveFrom === 'right' ? 'derecha' : 'izquierda'}` : ' · punto decisivo: elige lado quien recibe'}
              </>
            )}
          </p>
          {/* Aquí y no en la barra de abajo: con «Orden» ahí, «Terminar» se salía de la pantalla en un teléfono. */}
          {canOrder && (
            <Button size="sm" className="shrink-0" onClick={() => setOrdering(true)} icon={<Repeat2 className="size-4" />} aria-label="Orden de saque" disabled={court.readOnly}>
              Orden
            </Button>
          )}
        </div>
      )}
      {live.changeEnds && !court.over && (
        <p className="flex items-center gap-2 rounded-xl bg-warn-soft px-3 py-2 text-base font-bold text-warn" role="alert">
          <ArrowLeftRight className="size-5" /> Cambio de lado
        </p>
      )}
      {court.over && (
        <p className="rounded-xl bg-ok-soft px-3 py-2 text-sm font-semibold text-ok" role="status">
          {winner ? `Ganan ${labels[winner - 1]}: ${court.summary}` : court.summary}. Toca «Terminar» para enviar.
        </p>
      )}
    </div>
  );

  const half = (i: 0 | 1) => {
    const side = (i + 1) as Side;
    const big = live ? (pickle ? live.now[i] : (live.points?.[i] ?? '0')) : 0;
    const serving = live?.server === side;
    const sub = pickle ? (serving ? 'Saca' : ' ') : `${live?.now[i] ?? 0} juegos${serving ? ' · saca' : ''}`;
    return { label: labels[i], big, sub, onTap: () => court.apply({ type: 'point', side }), ariaLabel: `Punto para ${labels[i]}` };
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
        finishSummary={winner ? `${court.summary} · Ganan ${labels[winner - 1]}` : court.summary}
        onFinished={() => onExit()}
        actions={
          <Button className="h-14" onClick={() => setRetiring(true)} icon={<Flag className="size-5" />} disabled={court.readOnly || court.over} aria-label="Retiro">
            <span className="hidden sm:inline">Retiro</span>
          </Button>
        }
      >
        <TwoHalves swap={live?.leftSide === 2} disabled={court.readOnly || court.over || !s} a={half(0)} b={half(1)} />
      </CourtLayout>

      <Modal open={retiring} onClose={() => setRetiring(false)} title="¿Quién se retira?">
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">Gana el otro lado. Se guarda el marcador de ahora y, para la tabla, se completa el set a favor del ganador.</p>
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

      <Modal open={ordering} onClose={() => setOrdering(false)} title="Orden de saque en este set">
        <div className="flex flex-col gap-4">
          {([1, 2] as const).map((side) => (
            <div key={side} className="flex flex-col gap-2">
              <p className="text-sm font-medium">{labels[side - 1]}: ¿quién saca primero?</p>
              <div className="grid grid-cols-2 gap-2">
                {([0, 1] as const).map((p) => (
                  <Button
                    key={p}
                    className="h-12"
                    onClick={() => {
                      const err = court.apply({ type: 'order', side, player: p });
                      if (!err) setOrdering(false);
                    }}
                  >
                    {people[side - 1]?.[p] ?? `Jugador ${p + 1}`}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </>
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

function SetupForm({
  sport,
  doubles,
  labels,
  people,
  rulesLine,
  match,
  isAdmin,
  onStart,
}: {
  sport: RacketSport;
  doubles: boolean;
  labels: readonly [string, string];
  people: string[][];
  rulesLine: string;
  match: Match;
  isAdmin: boolean;
  onStart: (s: MatchSetup) => void;
}) {
  const { lid } = useLeagueCtx();
  const run = useAction();
  const [first, setFirst] = useState<Side>(1);
  const [fp, setFp] = useState<Pair<Player>>([0, 0]);
  const [left, setLeft] = useState<Side>(1);
  const [changing, setChanging] = useState(false);
  const pickle = isGameSport(sport);
  const current = presetOf(sport, engineRules(sport, match.rules));
  const canChange = isAdmin && match.status === 'scheduled' && match.seq === 0;

  return (
    <div className="mx-auto flex h-full max-w-xl flex-col gap-5 overflow-y-auto pb-4">
      <div className="flex items-start gap-2 rounded-2xl bg-surface-2 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted">Reglas de este partido</p>
          <p className="text-sm font-semibold">{rulesLine}</p>
        </div>
        {canChange && (
          <Button size="sm" variant="ghost" icon={<Settings2 className="size-4" />} onClick={() => setChanging(true)}>
            Cambiar
          </Button>
        )}
      </div>
      <Choice
        label="¿Quién saca primero?"
        value={first}
        onChange={setFirst}
        options={[
          { value: 1, text: labels[0] },
          { value: 2, text: labels[1] },
        ]}
      />
      {doubles &&
        ([0, 1] as const).map((i) =>
          (people[i]?.length ?? 0) >= 2 ? (
            <Choice
              key={i}
              label={pickle ? `${labels[i]}: ¿quién empieza a la derecha?` : `${labels[i]}: ¿quién saca primero?`}
              value={fp[i]}
              onChange={(v) => setFp(i === 0 ? [v, fp[1]] : [fp[0], v])}
              options={[
                { value: 0 as Player, text: people[i][0] },
                { value: 1 as Player, text: people[i][1] },
              ]}
            />
          ) : null,
        )}
      <Choice
        label="¿Quién empieza a tu izquierda?"
        value={left}
        onChange={setLeft}
        options={[
          { value: 1, text: labels[0] },
          { value: 2, text: labels[1] },
        ]}
      />
      <Button variant="primary" className="h-14 text-base" onClick={() => onStart({ firstServer: first, firstPlayer: fp, leftSide: left })}>
        Empezar el partido
      </Button>
      <Modal open={changing} onClose={() => setChanging(false)} title="Reglas de este partido">
        <div className="flex flex-col gap-2">
          {presetsOf(sport).map((p) => (
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
    </div>
  );
}
