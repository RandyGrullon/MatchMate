import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, ChevronLeft, ChevronRight, CloudOff, Hand, Minus, Plus, Send, Signature, Undo2 } from 'lucide-react';
import { strokesReceived } from '../../../sports/golf/course';
import { scoreRound } from '../../../sports/golf/scoring';
import { pendingGolfSign, type GolfCardDoc, type GolfRoundFull } from '../../../lib/data/golf';
import { currentOutbox, isOnline, sentOrQueued, useOutboxSnapshot } from '../../../lib/data/client';
import { useLeagueCtx } from '../../../lib/league';
import { useWakeLock } from '../../../court';
import { saveErrorMessage, useFeedback } from '../../../components/feedback';
import { Badge, Button, Card, Empty, cx } from '../../../components/ui';
import {
  canWriteCard,
  groupHolesDone,
  groupOrder,
  holeDone,
  mergeCard,
  nextGroupHole,
  reconcile,
  sendPending,
  setHole,
  shouldPublish,
  unsentCount,
  useCourtLog,
  type CardWriter,
} from './courtLog';
import { ToPar } from './bits';
import { FieldModeButton, FieldScreen, useFieldMode } from './FieldScreen';
import { cardHoles, golfRoundOf, hcpText, startIndex } from './logic';

const MAX_PUTT_CHIPS = 5;

/**
 * La tarjeta del grupo en el campo: un teléfono anota a los 1–4 jugadores del grupo. Hoyo actual en grande
 * con su par y SI, un +/− por jugador que arranca en el par, putts opcionales y «recogió». «Hoyo listo» pone
 * el par a quien no se tocó y pasa solo al siguiente hoyo del orden de juego del grupo.
 *
 * Todo se guarda en el teléfono al momento (sirve sin señal) y se publica por la cola cada 3 hoyos terminados
 * (o al tocar «Enviar»), nunca golpe por golpe, una operación por tarjeta y solo de las tarjetas que la cuenta
 * puede escribir. Una tarjeta con la firma en la cola ya no se cambia en este teléfono (salvo el admin).
 *
 * En el campo (una ronda son unas 4 horas al sol): con la tarjeta abierta la pantalla no se apaga, y «Modo campo»
 * la pone en pantalla completa con modo sol (piezas de src/court). «Hoyo listo» siempre está a la vista: fijo
 * abajo (encima de la barra de la app) o en el pie de la pantalla completa.
 */
export function GolfCourt({
  round,
  cards,
  nameOf,
  myCard,
  staff,
  isAdmin,
  onSign,
}: {
  round: GolfRoundFull;
  /** Tarjetas del servidor (sin lo del teléfono). */
  cards: GolfCardDoc[];
  nameOf: (playerId: string) => string;
  myCard: GolfCardDoc | null;
  /** Admin o anotador: lleva cualquier grupo. */
  staff: boolean;
  isAdmin: boolean;
  onSign: (card: GolfCardDoc) => void;
}) {
  const { lid } = useLeagueCtx();
  const { toast, confirm } = useFeedback();
  const eventId = round.eventId;
  const [log, update] = useCourtLog(eventId);
  const [sending, setSending] = useState(false);
  const field = useFieldMode('campo', { tab: 'tarjeta' });
  // Entre hoyo y hoyo la pantalla no se apaga (nadie quiere desbloquear el teléfono en cada hoyo).
  useWakeLock(true);
  // Se vuelve a dibujar cuando cambia la cola (p. ej. la firma pendiente llegó al servidor).
  useOutboxSnapshot();

  const who: CardWriter = useMemo(() => ({ isAdmin, staff, myCard }), [isAdmin, staff, myCard]);
  const writable = useCallback(
    (cardId: string) => {
      const c = cards.find((x) => x.id === cardId);
      return !!c && canWriteCard(c, who);
    },
    [cards, who],
  );

  // El servidor ya trae lo enviado: se limpia del teléfono. Lo de una tarjeta ya firmada tampoco se queda
  // (solo el admin la cambia).
  useEffect(() => {
    if (cards.length) update((l) => reconcile(l, cards, Date.now(), (c) => isAdmin || !c.signed));
  }, [cards, update, isAdmin]);

  const merged = useMemo(() => cards.map((c) => mergeCard(c, log)), [cards, log]);

  const scopes = useMemo(() => {
    if (staff) {
      const groups = [...new Set(cards.map((c) => c.groupNo).filter((g): g is number => g != null))].sort((a, b) => a - b);
      return [
        ...groups.map((g) => ({ key: `g:${g}`, label: `Grupo ${g}` })),
        ...cards.filter((c) => c.groupNo == null).map((c) => ({ key: `c:${c.id}`, label: nameOf(c.playerId) })),
      ];
    }
    if (!myCard) return [];
    return [myCard.groupNo != null ? { key: `g:${myCard.groupNo}`, label: `Grupo ${myCard.groupNo}` } : { key: `c:${myCard.id}`, label: 'Mi tarjeta' }];
  }, [staff, cards, myCard, nameOf]);

  const mine = myCard ? (myCard.groupNo != null ? `g:${myCard.groupNo}` : `c:${myCard.id}`) : null;
  const scope = log.scope && scopes.some((s) => s.key === log.scope) ? log.scope : mine && scopes.some((s) => s.key === mine) ? mine : (scopes[0]?.key ?? null);
  const inScope = useCallback(
    (c: GolfCardDoc) => (scope?.startsWith('g:') ? c.groupNo === Number(scope.slice(2)) : c.id === scope?.slice(2)),
    [scope],
  );
  const group = useMemo(
    () =>
      merged
        .filter(inScope)
        .sort((a, b) => (a.id === myCard?.id ? -1 : b.id === myCard?.id ? 1 : nameOf(a.playerId).localeCompare(nameOf(b.playerId)))),
    [merged, inScope, myCard, nameOf],
  );
  const serverGroup = useMemo(() => cards.filter(inScope), [cards, inScope]);

  const n = group[0]?.strokes.length ?? round.holes;
  const order = useMemo(() => groupOrder(n, startIndex(round, group[0]?.startHole ?? 1)), [n, round, group]);
  const pendingHole = nextGroupHole(group, order);
  const current = log.hole != null && log.hole >= 0 && log.hole < n ? log.hole : (pendingHole ?? order[0] ?? 0);
  const unsent = unsentCount(log, writable);
  const doneCount = groupHolesDone(group, n);

  const publish = useCallback(() => {
    try {
      const wait = sendPending(lid, eventId, cards, who);
      if (!wait) {
        // Todo lo que falta ya está en la cola: que salga ya (sin esperar el próximo reintento).
        void currentOutbox()?.flush();
        return;
      }
      wait.catch((e) => toast(saveErrorMessage(e), 'error'));
      if (!isOnline()) return;
      // Con señal se espera un poco al servidor; si tarda (señal mala), queda en la cola y sale sola.
      setSending(true);
      void sentOrQueued(wait)
        .catch(() => undefined)
        .finally(() => setSending(false));
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    }
  }, [cards, eventId, lid, toast, who]);

  if (!scopes.length) {
    return (
      <Empty icon={<Hand className="size-8" />} title={staff ? 'Todavía no hay inscritos' : 'No llevas ninguna tarjeta'}>
        {staff ? 'Inscribe a los jugadores en la pestaña Jugadores.' : 'Inscríbete en la ronda (pestaña Jugadores) para anotar la de tu grupo.'}
      </Empty>
    );
  }

  const holesOf = (c: GolfCardDoc) => cardHoles(round, c.teeId);
  const head = group[0] ? holesOf(group[0])[current] : null;
  const signing = (c: GolfCardDoc) => !c.signed && pendingGolfSign(lid, c.id);
  const canEdit = (c: GolfCardDoc) => isAdmin || (!c.signed && !signing(c));

  function set(c: GolfCardDoc, value: { s: number | null; p: number | null; u: boolean }) {
    update((l) => setHole(l, c.id, current, value));
  }

  function goTo(i: number | null) {
    update((l) => ({ ...l, hole: i }));
  }

  function finishHole() {
    const before = doneCount;
    let publishNow = false;
    update((l) => {
      let x = l;
      for (const c of group) {
        if (!canEdit(c) || holeDone(c, current)) continue;
        x = setHole(x, c.id, current, { s: holesOf(c)[current]?.par ?? 4, p: c.putts[current] ?? null, u: false });
      }
      const now = serverGroup.map((c) => mergeCard(c, x));
      publishNow = shouldPublish(before, groupHolesDone(now, n), n);
      return { ...x, hole: nextGroupHole(now, order, current) ?? current };
    });
    if (publishNow) publish();
  }

  const finished = pendingHole == null && group.length > 0;
  const step = (dir: 1 | -1) => {
    const pos = order.indexOf(current);
    goTo(order[(pos + dir + order.length) % order.length]);
  };
  const scopeLabel = scopes.find((x) => x.key === scope)?.label ?? '';
  const nextNum = (() => {
    const nx = nextGroupHole(
      group.map((c) => (holeDone(c, current) ? c : { ...c, strokes: c.strokes.map((v, i) => (i === current ? 1 : v)) })),
      order,
      current,
    );
    return nx != null && group[0] ? holesOf(group[0])[nx]?.number : null;
  })();
  const mineInGroup = myCard ? (group.find((c) => c.id === myCard.id) ?? null) : null;
  const canSignMine = !!mineInGroup && !mineInGroup.signed && !signing(mineInGroup);

  const chips: ReactNode =
    scopes.length > 1 ? (
      <div className={cx('no-scrollbar flex gap-1.5 overflow-x-auto', !field.on && '-mx-4 px-4')} role="group" aria-label="Qué grupo anotas">
        {scopes.map((sc) => (
          <button
            key={sc.key}
            type="button"
            onClick={() => update((l) => ({ ...l, scope: sc.key, hole: null }))}
            aria-pressed={scope === sc.key}
            className={cx('shrink-0 rounded-full px-3 py-1.5 text-sm font-medium', scope === sc.key ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted')}
          >
            {sc.label}
          </button>
        ))}
      </div>
    ) : null;

  const hole: ReactNode = (
    <Card className="overflow-hidden">
      <div className={cx('flex items-center gap-2 bg-accent-soft px-2', field.on ? 'py-2' : 'py-3')}>
        <button type="button" className="flex size-12 items-center justify-center rounded-xl hover:bg-surface-2 active:scale-95" aria-label="Hoyo anterior" onClick={() => step(-1)}>
          <ChevronLeft className="size-6" />
        </button>
        <div className="flex-1 text-center">
          <div className="text-xs font-semibold tracking-wide text-accent uppercase">Hoyo</div>
          <div className="text-5xl leading-none font-black tabular-nums">{head?.number ?? current + 1}</div>
          <div className="mt-1 text-sm">
            Par <b>{head?.par ?? '–'}</b> · SI <b>{head?.si ?? '–'}</b>
          </div>
        </div>
        <button type="button" className="flex size-12 items-center justify-center rounded-xl hover:bg-surface-2 active:scale-95" aria-label="Hoyo siguiente" onClick={() => step(1)}>
          <ChevronRight className="size-6" />
        </button>
      </div>
      <div className="no-scrollbar flex gap-1 overflow-x-auto border-t border-line px-2 py-2" aria-label="Hoyos">
        {Array.from({ length: n }, (_, i) => {
          const all = group.every((c) => holeDone(c, i));
          const some = group.some((c) => holeDone(c, i));
          const num = group[0] ? holesOf(group[0])[i]?.number : i + 1;
          return (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Hoyo ${num}`}
              aria-current={i === current ? 'step' : undefined}
              className={cx(
                'flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold tabular-nums',
                i === current ? 'bg-accent text-accent-fg' : all ? 'bg-ok-soft text-ok' : some ? 'bg-warn-soft text-warn' : 'bg-surface-2 text-muted',
              )}
            >
              {num}
            </button>
          );
        })}
      </div>
    </Card>
  );

  const players: ReactNode = (
    <div className="flex flex-col gap-2">
      {group.map((c) => {
        const holes = holesOf(c);
        const h = holes[current];
        const rec = strokesReceived(c.playingHcp, holes.map((x) => x.si))[current] ?? 0;
        const s = c.strokes[current];
        const picked = !!c.pickedUp[current];
        const shown = s ?? h?.par ?? 4;
        const score = scoreRound(golfRoundOf(round, c), round.competition);
        const editable = canEdit(c);
        const setStrokes = (v: number) => {
          const p = c.putts[current];
          set(c, { s: v, p: p != null && p < v ? p : null, u: false });
        };
        return (
          <Card key={c.id} className="px-3 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate font-semibold">{nameOf(c.playerId)}</span>
                  {c.signed ? <Badge tone="ok">Firmada</Badge> : signing(c) && <Badge tone="ok">Firmada · por enviar</Badge>}
                  {h && group[0] && h.par !== holesOf(group[0])[current]?.par && <Badge>Par {h.par}</Badge>}
                </div>
                <div className="text-xs text-muted">
                  Hcp {hcpText(c.playingHcp)}
                  {rec > 0 && <span className="text-accent"> · {rec === 1 ? 'recibe 1 golpe aquí' : `recibe ${rec} golpes aquí`}</span>}
                  {rec < 0 && <span> · devuelve {Math.abs(rec)} aquí</span>}
                </div>
              </div>
              <div className="shrink-0 text-right text-sm">
                {round.competition.format === 'stableford' ? (
                  <b className="tabular-nums">{score.points} pts</b>
                ) : (
                  <b>
                    <ToPar value={round.competition.basis === 'net' ? score.netToPar : score.toPar} />
                  </b>
                )}
                <div className="text-xs text-muted">{score.thru} hoyos</div>
              </div>
            </div>

            {picked ? (
              <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-warn-soft px-3 py-3 text-warn">
                <span className="font-semibold">Recogió en este hoyo</span>
                <Button size="sm" disabled={!editable} icon={<Undo2 className="size-4" />} onClick={() => set(c, { s: h?.par ?? 4, p: null, u: false })}>
                  Deshacer
                </Button>
              </div>
            ) : (
              <div className="mt-3 flex items-center justify-between gap-3">
                <button
                  type="button"
                  aria-label={`Un golpe menos a ${nameOf(c.playerId)}`}
                  disabled={!editable || shown <= 1}
                  onClick={() => setStrokes(Math.max(1, shown - 1))}
                  className="flex size-16 items-center justify-center rounded-2xl bg-surface-2 text-fg active:scale-95 disabled:opacity-40"
                >
                  <Minus className="size-7" />
                </button>
                <button
                  type="button"
                  disabled={!editable}
                  onClick={() => s == null && setStrokes(shown)}
                  aria-label={s == null ? `Poner el par a ${nameOf(c.playerId)}` : `${s} golpes`}
                  className={cx('flex h-16 flex-1 flex-col items-center justify-center rounded-2xl', s == null ? 'border-2 border-dashed border-line text-muted' : 'bg-surface-2')}
                >
                  <span className="text-4xl leading-none font-black tabular-nums">{shown}</span>
                  <span className="text-[11px]">{s == null ? 'par (toca para dejarlo)' : s - (h?.par ?? 0) === 0 ? 'par' : ''}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Un golpe más a ${nameOf(c.playerId)}`}
                  disabled={!editable || shown >= 20}
                  onClick={() => setStrokes(Math.min(20, shown + 1))}
                  className="flex size-16 items-center justify-center rounded-2xl bg-accent text-accent-fg active:scale-95 disabled:opacity-40"
                >
                  <Plus className="size-7" />
                </button>
              </div>
            )}

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              {log.putts && !picked ? (
                <div className="flex items-center gap-1" role="group" aria-label="Putts">
                  <span className="mr-1 text-xs text-muted">Putts</span>
                  {Array.from({ length: MAX_PUTT_CHIPS }, (_, p) => {
                    const active = c.putts[current] === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        disabled={!editable || p >= shown}
                        aria-pressed={active}
                        onClick={() => set(c, { s: s ?? shown, p: active ? null : p, u: false })}
                        className={cx('size-9 rounded-lg text-sm font-semibold disabled:opacity-30', active ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted')}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <span />
              )}
              {!picked && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!editable}
                  onClick={async () => {
                    if (round.competition.format === 'stroke') {
                      const ok = await confirm({
                        title: '¿Recogió la bola?',
                        message: 'En stroke play no terminar un hoyo descalifica de la ronda (no hay total). Si fue un error, se deshace.',
                        confirmText: 'Sí, recogió',
                      });
                      if (!ok) return;
                    }
                    set(c, { s: null, p: null, u: true });
                  }}
                >
                  Recogió
                </Button>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );

  const signMine: ReactNode = canSignMine && mineInGroup && (
    <Button variant="primary" className="h-12 w-full text-base" icon={<Signature className="size-5" />} onClick={() => onSign(mineInGroup)}>
      Revisar y firmar mi tarjeta
    </Button>
  );

  const doneCard: ReactNode = finished && (
    <Card className="flex flex-col gap-2 px-4 py-4 text-center">
      <p className="font-semibold">¡Terminaron los {n} hoyos!</p>
      <p className="text-sm text-muted">Envía las tarjetas y que cada jugador revise y firme la suya.</p>
      {!field.on && signMine}
    </Card>
  );

  const holeReady: ReactNode = !finished && (
    <Button variant="primary" className="h-14 w-full text-base" icon={<Check className="size-5" />} onClick={finishHole}>
      Hoyo listo
      {nextNum ? ` → hoyo ${nextNum}` : ''}
    </Button>
  );

  const unsentText: ReactNode =
    unsent > 0 ? (
      <span className="flex items-center gap-1 text-xs text-muted">
        {!isOnline() && <CloudOff className="size-4" />}
        {unsent === 1 ? '1 hoyo por enviar' : `${unsent} hoyos por enviar`}
      </span>
    ) : (
      <span className="text-xs text-ok">Todo enviado</span>
    );
  const sendButton = (
    <Button size="sm" icon={<Send className="size-4" />} loading={sending} disabled={!unsent} onClick={publish}>
      Enviar
    </Button>
  );
  const puttsToggle = (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={log.putts} onChange={(e) => update((l) => ({ ...l, putts: e.target.checked }))} />
      Anotar putts
    </label>
  );

  if (field.on) {
    return (
      <FieldScreen
        title={round.courseName || 'Tarjeta'}
        subtitle={[scopeLabel, `${doneCount} de ${n} hoyos`].filter(Boolean).join(' · ')}
        onExit={field.exit}
        exitLabel="Salir del modo campo"
        top={
          <>
            {chips}
            {hole}
          </>
        }
        footer={
          <>
            {finished ? signMine : holeReady}
            <div className="flex items-center justify-between gap-2">
              {unsentText}
              {sendButton}
            </div>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {players}
          {doneCard}
          {puttsToggle}
        </div>
      </FieldScreen>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <FieldModeButton label="Modo campo" onClick={field.enter} />
      {chips}
      {hole}
      {players}
      {finished ? (
        doneCard
      ) : (
        // Siempre a la vista: fijo abajo, encima de la barra de la app en el teléfono.
        <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 rounded-2xl border border-line bg-surface/95 p-2 shadow-lg backdrop-blur sm:bottom-2">
          {holeReady}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        {puttsToggle}
        <div className="flex items-center gap-2">
          {unsentText}
          {sendButton}
        </div>
      </div>
      <p className="text-xs text-muted">
        Se guarda en este teléfono al momento y sale solo cada 3 hoyos, aunque no haya señal (se envía al volver).
      </p>
    </div>
  );
}
