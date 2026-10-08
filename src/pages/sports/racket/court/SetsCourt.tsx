import { useMemo, useState } from 'react';
import { ArrowLeftRight, Repeat2 } from 'lucide-react';
import { CourtLayout, CourtNote, TwoHalves, useCourt } from '../../../../court';
import type { Match } from '../../../../lib/data/matches';
import { useLeagueCtx } from '../../../../lib/league';
import { isGameSport, toLive, type MatchSetup, type Pair, type Player, type RacketEvent, type RacketSport, type RacketState } from '../../../../sports/racket';
import type { Side } from '../../../../sports/types';
import { Button, Sheet } from '../../../../components/ui';
import { presetOf, presetsOf, rulesText } from '../logic/rulesText';
import { useNames } from '../names';
import { engineRules, racketAdapter } from './adapters';
import { Pill, PlayerPick, RetireSheet, RulesBox, SetupChoice, SetupScreen, StartButton, retireItem } from './parts';

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
            <Pill key={i}>{x}</Pill>
          ))}
          {!court.over && (
            <span className="num text-[28px] leading-none font-bold">
              {live.now[0]}-{live.now[1]}
              <span className="ml-1.5 text-[13px] font-medium tracking-normal text-muted">{pickle ? 'puntos' : 'juegos'}</span>
            </span>
          )}
        </div>
        {live.label && <Pill tone="accent">{live.label}</Pill>}
      </div>
      {!court.over && (
        <div className="flex min-h-11 items-center gap-2 rounded-2xl bg-surface-2 py-1.5 pr-1.5 pl-4">
          <p className="min-w-0 flex-1 text-[15px]" role="status">
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
            <Button variant="soft" className="h-11 shrink-0 rounded-xl" onClick={() => setOrdering(true)} icon={<Repeat2 className="size-4" />} aria-label="Orden de saque" disabled={court.readOnly}>
              Orden
            </Button>
          )}
        </div>
      )}
      {live.changeEnds && !court.over && (
        <CourtNote tone="accent" role="alert">
          <ArrowLeftRight className="size-5" /> Cambio de lado
        </CourtNote>
      )}
      {court.over && (
        <CourtNote tone="accent">
          {winner ? `Ganan ${labels[winner - 1]}: ${court.summary}` : court.summary}. Toca «Terminar» para enviar.
        </CourtNote>
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
        more={court.readOnly || court.over ? [] : [retireItem(() => setRetiring(true))]}
      >
        <TwoHalves swap={live?.leftSide === 2} disabled={court.readOnly || court.over || !s} a={half(0)} b={half(1)} />
      </CourtLayout>

      <RetireSheet
        open={retiring}
        onClose={() => setRetiring(false)}
        labels={labels}
        note="Se guarda el marcador; para la tabla, el set se completa a favor del ganador"
        onRetire={(side) => {
          court.apply({ type: 'retire', side });
          setRetiring(false);
        }}
      />

      <Sheet open={ordering} onClose={() => setOrdering(false)} title="Orden de saque en este set">
        <div className="flex flex-col gap-5 pb-1">
          {([1, 2] as const).map((side) => (
            <PlayerPick
              key={side}
              label={`${labels[side - 1]}: ¿quién saca primero?`}
              names={[people[side - 1]?.[0] ?? 'Jugador 1', people[side - 1]?.[1] ?? 'Jugador 2']}
              onPick={(p) => {
                const err = court.apply({ type: 'order', side, player: p });
                if (!err) setOrdering(false);
              }}
            />
          ))}
        </div>
      </Sheet>
    </>
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
  const [first, setFirst] = useState<Side>(1);
  const [fp, setFp] = useState<Pair<Player>>([0, 0]);
  const [left, setLeft] = useState<Side>(1);
  const pickle = isGameSport(sport);
  const current = presetOf(sport, engineRules(sport, match.rules));
  const canChange = isAdmin && match.status === 'scheduled' && match.seq === 0;

  return (
    <SetupScreen>
      <RulesBox line={rulesLine} match={match} canChange={canChange} presets={presetsOf(sport)} current={current?.id} />
      <SetupChoice
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
            <SetupChoice
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
      <SetupChoice
        label="¿Quién empieza a tu izquierda?"
        value={left}
        onChange={setLeft}
        options={[
          { value: 1, text: labels[0] },
          { value: 2, text: labels[1] },
        ]}
      />
      <StartButton onClick={() => onStart({ firstServer: first, firstPlayer: fp, leftSide: left })} />
    </SetupScreen>
  );
}
