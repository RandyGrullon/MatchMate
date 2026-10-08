import { useMemo, useState } from 'react';
import { ArrowLeftRight, CircleDot } from 'lucide-react';
import { CourtLayout, CourtNote, TwoHalves } from '../../../../court';
import type { Match } from '../../../../lib/data/matches';
import { useLeagueCtx } from '../../../../lib/league';
import { resolveRules, type MatchSetup, type Pair, type PickleballEvent, type PickleballRules, type PickleballState, type Player } from '../../../../sports/racket';
import type { Side } from '../../../../sports/types';
import { cx } from '../../../../components/ui';
import { engineRules } from '../../racket/court/adapters';
import { useAdapterCourt } from '../../racket/court/useAdapterCourt';
import { pointsDeps } from '../../racket/court/usePointsCourt';
import { isPointsMatch } from '../../racket/logic/results';
import { Pill, RetireSheet, RulesBox, SetupChoice, SetupNote, SetupScreen, StartButton, retireItem } from '../../racket/court/parts';
import { presetOf, presetsOf, rulesText } from '../../racket/logic/rulesText';
import { useNames } from '../../racket/names';
import type { RacketCourtProps } from '../../racket/sport';
import { pickleballAdapter, pickleView, serverNumberText, type PickleMode, type PickleView } from './logic';

/** Reglas del partido: las suyas; el juego del round robin siempre es a un juego y en dobles. */
export function pickleRules(match: Pick<Match, 'rules' | 'format'>): PickleballRules {
  const r = engineRules('pickleball', match.rules) as PickleballRules;
  if (!isPointsMatch(match)) return r;
  return resolveRules('pickleball', { ...r, bestOf: 1, doubles: true, switchAt: r.switchAt });
}

/**
 * La cancha de pickleball. Conteo tradicional: dos botones gigantes, «ganó el que saca» (suma y cambia de lugar)
 * y «ganó el que recibe» (pasa al sacador 2 o cambia el saque). Arriba el canto en grande (5-3-2), quién saca y
 * desde qué lado, dónde está cada jugador, el aviso del primer saque (0-0-2) y el cambio de lado en el juego
 * decisivo. Conteo por rally: se toca el lado que ganó. El juego del round robin se guarda con sus puntos
 * (save_points_result); el partido a juegos, con finish_match (el rival confirma).
 */
export function PickleballCourt({ match, isAdmin, userId, onExit }: RacketCourtProps) {
  const { lid } = useLeagueCtx();
  const names = useNames();
  const mode: PickleMode = isPointsMatch(match) ? 'game' : 'sets';
  const rules = useMemo(() => pickleRules(match), [match]);
  const adapter = useMemo(() => pickleballAdapter(rules, mode), [rules, mode]);
  const court = useAdapterCourt<MatchSetup, PickleballState, PickleballEvent>({
    lid,
    matchId: match.id,
    userId,
    status: match.status,
    config: null,
    adapter,
    deps: mode === 'game' ? (l, id) => pointsDeps(l, id) : undefined,
  });
  const [retiring, setRetiring] = useState(false);
  const labels = [match.sides[0].label, match.sides[1].label] as const;
  const people = match.sides.map((x) => x.players.map((p) => names.nameOf(p.playerId)));
  const s = court.state;
  const v = s ? pickleView(s, people, labels) : null;
  const title =
    [match.stage || (match.round != null ? `${mode === 'game' ? 'Ronda' : 'Jornada'} ${match.round}` : null), match.court].filter(Boolean).join(' · ') || 'Partido';

  if (court.ready && !court.snapshot) {
    return (
      <CourtLayout title={title} subtitle="Antes de empezar" onExit={onExit} court={court} isAdmin={isAdmin} canSuspend={false}>
        <PickleSetup
          rules={rules}
          labels={labels}
          people={people}
          match={match}
          canChange={isAdmin && mode === 'sets' && match.status === 'scheduled' && match.seq === 0}
          onStart={(setup) => court.start(setup)}
        />
      </CourtLayout>
    );
  }

  const winner = court.over ? court.winner : null;
  const receiving: Side = v?.serving === 1 ? 2 : 1;
  const sideout = rules.scoring === 'sideout';

  const header = v && (
    <div className="flex flex-col gap-2">
      {(rules.bestOf > 1 || v.done.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 empty:hidden">
          {rules.bestOf > 1 && !v.over && <Pill tone="accent">{`Juego ${v.gameNo} de ${rules.bestOf}${v.deciding ? ' · decisivo' : ''}`}</Pill>}
          {v.done.map((x, i) => (
            <Pill key={i}>{x}</Pill>
          ))}
        </div>
      )}
      {!v.over && <CallBoard v={v} labels={labels} doubles={rules.doubles} />}
      {v.firstServe && !v.over && <CourtNote tone="accent">Primer saque del juego: un solo sacador (0-0-2).</CourtNote>}
      {v.switchNow && !v.over && (
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

  const halves =
    v && sideout
      ? {
          swap: false,
          a: {
            label: `Ganó el que saca`,
            big: '+1',
            sub: labels[v.serving - 1],
            onTap: () => court.apply({ type: 'rally', won: 'serving' }),
            ariaLabel: `Ganó el que saca (${labels[v.serving - 1]})`,
          },
          b: {
            label: 'Ganó el que recibe',
            big: rules.doubles && v.serverNumber === 1 ? '2.º' : '⇄',
            sub: rules.doubles && v.serverNumber === 1 ? 'pasa al sacador 2' : `saca ${labels[receiving - 1]}`,
            onTap: () => court.apply({ type: 'rally', won: 'receiving' }),
            ariaLabel: `Ganó el que recibe (${labels[receiving - 1]})`,
          },
        }
      : {
          swap: s?.leftSide === 2,
          a: {
            label: labels[0],
            big: v?.now[0] ?? 0,
            sub: v?.serving === 1 ? 'Saca' : ' ',
            onTap: () => court.apply({ type: 'point', side: 1 }),
            ariaLabel: `Punto para ${labels[0]}`,
          },
          b: {
            label: labels[1],
            big: v?.now[1] ?? 0,
            sub: v?.serving === 2 ? 'Saca' : ' ',
            onTap: () => court.apply({ type: 'point', side: 2 }),
            ariaLabel: `Punto para ${labels[1]}`,
          },
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
        undoLabel="Deshacer"
        finishSummary={winner ? `${court.summary} · Ganan ${labels[winner - 1]}` : court.summary}
        onFinished={() => onExit()}
        more={court.readOnly || court.over ? [] : [retireItem(() => setRetiring(true))]}
      >
        <div className="flex h-full min-h-0 flex-col gap-2">
          {v && rules.doubles && !v.over && <Positions v={v} leftSide={s?.leftSide ?? 1} />}
          <TwoHalves className="min-h-0 flex-1" swap={halves.swap} disabled={court.readOnly || court.over || !s} a={halves.a} b={halves.b} />
        </div>
      </CourtLayout>

      <RetireSheet
        open={retiring}
        onClose={() => setRetiring(false)}
        labels={labels}
        note="Gana el otro lado; se guarda el marcador de ahora"
        onRetire={(side) => {
          court.apply({ type: 'retire', side });
          setRetiring(false);
        }}
      />
    </>
  );
}

/** El canto en grande: puntos del que saca · del que recibe · número de sacador. */
function CallBoard({ v, labels, doubles }: { v: PickleView; labels: readonly [string, string]; doubles: boolean }) {
  const [a, b, n] = v.parts;
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-surface-2 px-4 py-2.5">
      <div className="num flex items-baseline gap-2 leading-none font-bold" aria-label={`Canto ${v.call}`} role="status">
        <span className="text-[44px] sm:text-6xl">{a}</span>
        <span className="text-3xl text-faint">-</span>
        <span className="text-[44px] sm:text-6xl">{b}</span>
        {n !== null && (
          <>
            <span className="text-3xl text-faint">-</span>
            <span className="text-[44px] text-accent sm:text-6xl">{n}</span>
          </>
        )}
      </div>
      <div className="min-w-0 flex-1 text-[15px] leading-tight">
        <p className="truncate">
          Saca <b>{v.serverName}</b>
          {doubles ? ` (${labels[v.serving - 1]})` : ''}
        </p>
        <p className="truncate text-muted">
          Desde la {v.from}
          {n !== null ? ` · ${serverNumberText(n)}` : ''}
        </p>
      </div>
    </div>
  );
}

/** Dónde está cada jugador (derecha o izquierda de su lado) y quién saca. */
function Positions({ v, leftSide }: { v: PickleView; leftSide: Side }) {
  const order = leftSide === 1 ? v.spots : [v.spots[1], v.spots[0]];
  return (
    <div className="grid grid-cols-2 gap-2 text-sm">
      {order.map((sp) => (
        <div key={sp.side} className={cx('rounded-2xl px-3.5 py-2', sp.serving ? 'bg-accent-soft' : 'bg-surface-2')}>
          <p className="truncate text-xs font-semibold text-muted">{sp.label}</p>
          {(['right', 'left'] as const).map((k) => {
            const name = k === 'right' ? sp.right : sp.left;
            const serving = sp.server !== null && name === sp.server;
            return (
              <p key={k} className={cx('flex items-center gap-1 truncate', serving && 'font-bold text-accent')}>
                <span className="w-16 shrink-0 text-xs text-muted">{k === 'right' ? 'Derecha' : 'Izquierda'}</span>
                <span className="truncate">{name}</span>
                {serving && <CircleDot className="size-3.5 shrink-0" aria-label="saca" />}
              </p>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/**
 * El sorteo: quién saca primero, quién empieza a la derecha en cada pareja y qué lado queda a tu izquierda. El
 * admin puede cambiar las reglas de este partido antes del primer punto (plantillas probadas).
 */
function PickleSetup({
  rules,
  labels,
  people,
  match,
  canChange,
  onStart,
}: {
  rules: PickleballRules;
  labels: readonly [string, string];
  people: string[][];
  match: Match;
  canChange: boolean;
  onStart: (s: MatchSetup) => void;
}) {
  const [first, setFirst] = useState<Side>(1);
  const [fp, setFp] = useState<Pair<Player>>([0, 0]);
  const [left, setLeft] = useState<Side>(1);
  const current = presetOf('pickleball', rules);
  return (
    <SetupScreen>
      <RulesBox line={rulesText(rules)} match={match} canChange={canChange} presets={presetsOf('pickleball')} current={current?.id} />
      <SetupChoice
        label="¿Quién saca primero?"
        value={first}
        onChange={setFirst}
        options={[
          { value: 1, text: labels[0] },
          { value: 2, text: labels[1] },
        ]}
      />
      {rules.doubles &&
        ([0, 1] as const).map((i) =>
          (people[i]?.length ?? 0) >= 2 ? (
            <SetupChoice
              key={i}
              label={`${labels[i]}: ¿quién empieza a la derecha?`}
              value={fp[i]}
              onChange={(val) => setFp(i === 0 ? [val, fp[1]] : [fp[0], val])}
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
      {rules.doubles && rules.scoring === 'sideout' && <SetupNote>El juego empieza en 0-0-2: la pareja que saca primero tiene un solo sacador, el de la derecha.</SetupNote>}
      <StartButton onClick={() => onStart({ firstServer: first, firstPlayer: fp, leftSide: left })} />
    </SetupScreen>
  );
}
