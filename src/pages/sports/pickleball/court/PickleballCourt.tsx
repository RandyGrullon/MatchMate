import { useMemo, useState } from 'react';
import { ArrowLeftRight, CircleDot, Flag, Settings2 } from 'lucide-react';
import { CourtLayout, TwoHalves } from '../../../../court';
import { updateMatchSchedule, type Match } from '../../../../lib/data/matches';
import { useLeagueCtx } from '../../../../lib/league';
import { resolveRules, type MatchSetup, type Pair, type PickleballEvent, type PickleballRules, type PickleballState, type Player } from '../../../../sports/racket';
import type { Side } from '../../../../sports/types';
import { useBusy } from '../../../../components/busy';
import { useAction } from '../../../../components/feedback';
import { Badge, Button, Modal, cx } from '../../../../components/ui';
import { engineRules } from '../../racket/court/adapters';
import { useAdapterCourt } from '../../racket/court/useAdapterCourt';
import { pointsDeps } from '../../racket/court/usePointsCourt';
import { isPointsMatch } from '../../racket/logic/results';
import { PresetButtons } from '../../racket/bits';
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
      <div className="flex flex-wrap items-center gap-1.5">
        {rules.bestOf > 1 && !v.over && <Badge tone="accent">{`Juego ${v.gameNo} de ${rules.bestOf}${v.deciding ? ' · decisivo' : ''}`}</Badge>}
        {v.done.map((x, i) => (
          <Badge key={i} tone="neutral" className="text-sm tabular-nums">
            {x}
          </Badge>
        ))}
      </div>
      {!v.over && <CallBoard v={v} labels={labels} doubles={rules.doubles} />}
      {v.firstServe && !v.over && (
        <p className="rounded-xl bg-accent-soft px-3 py-2 text-sm font-medium text-accent" role="status">
          Primer saque del juego: la pareja que saca tiene un solo sacador (0-0-2).
        </p>
      )}
      {v.switchNow && !v.over && (
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
        actions={
          <Button className="h-14" onClick={() => setRetiring(true)} icon={<Flag className="size-5" />} disabled={court.readOnly || court.over} aria-label="Retiro">
            <span className="hidden sm:inline">Retiro</span>
          </Button>
        }
      >
        <div className="flex h-full min-h-0 flex-col gap-2">
          {v && rules.doubles && !v.over && <Positions v={v} leftSide={s?.leftSide ?? 1} />}
          <TwoHalves className="min-h-0 flex-1" swap={halves.swap} disabled={court.readOnly || court.over || !s} a={halves.a} b={halves.b} />
        </div>
      </CourtLayout>

      <Modal open={retiring} onClose={() => setRetiring(false)} title="¿Quién se retira?">
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">Gana el otro lado. Se guarda el marcador de ahora.</p>
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
    </>
  );
}

/** El canto en grande: puntos del que saca · del que recibe · número de sacador. */
function CallBoard({ v, labels, doubles }: { v: PickleView; labels: readonly [string, string]; doubles: boolean }) {
  const [a, b, n] = v.parts;
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-surface-2 px-3 py-2">
      <div className="flex items-baseline gap-2 font-black tabular-nums leading-none" aria-label={`Canto ${v.call}`} role="status">
        <span className="text-5xl sm:text-6xl">{a}</span>
        <span className="text-3xl text-muted">-</span>
        <span className="text-5xl sm:text-6xl">{b}</span>
        {n !== null && (
          <>
            <span className="text-3xl text-muted">-</span>
            <span className="text-5xl text-accent sm:text-6xl">{n}</span>
          </>
        )}
      </div>
      <div className="min-w-0 flex-1 text-sm leading-tight">
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
        <div key={sp.side} className={cx('rounded-xl border px-3 py-1.5', sp.serving ? 'border-accent bg-accent-soft/60' : 'border-line bg-surface')}>
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
  const { lid } = useLeagueCtx();
  const run = useAction();
  const saving = useBusy();
  const [first, setFirst] = useState<Side>(1);
  const [fp, setFp] = useState<Pair<Player>>([0, 0]);
  const [left, setLeft] = useState<Side>(1);
  const [changing, setChanging] = useState(false);
  const current = presetOf('pickleball', rules);
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
        <PresetButtons
          presets={presetsOf('pickleball')}
          current={current?.id}
          pending={saving.busy}
          className="min-h-12"
          onPick={(p) =>
            void saving.run(p.id, async () => {
              await run(() => updateMatchSchedule(lid, match.id, { rules: { ...(match.rules ?? {}), match: p.rules } }), 'Reglas cambiadas');
              setChanging(false);
            })
          }
        />
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
      {rules.doubles &&
        ([0, 1] as const).map((i) =>
          (people[i]?.length ?? 0) >= 2 ? (
            <Choice
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
      <Choice
        label="¿Quién empieza a tu izquierda?"
        value={left}
        onChange={setLeft}
        options={[
          { value: 1, text: labels[0] },
          { value: 2, text: labels[1] },
        ]}
      />
      {rules.doubles && rules.scoring === 'sideout' && (
        <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">El juego empieza en 0-0-2: la pareja que saca primero tiene un solo sacador, el de la derecha.</p>
      )}
      <Button variant="primary" className="h-14 text-base" onClick={() => onStart({ firstServer: first, firstPlayer: fp, leftSide: left })}>
        Empezar el partido
      </Button>
    </div>
  );
}
