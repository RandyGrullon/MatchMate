import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, ChevronLeft, ChevronRight, CloudOff, Flag, Hand, Minus, Plus, Send, Signature, Undo2 } from 'lucide-react';
import { strokesReceived } from '../../../sports/golf/course';
import { scoreRound } from '../../../sports/golf/scoring';
import { pendingGolfSign, type GolfCardDoc, type GolfRoundFull } from '../../../lib/data/golf';
import { currentOutbox, isOnline, sentOrQueued, useOutboxSnapshot } from '../../../lib/data/client';
import { useLeagueCtx } from '../../../lib/league';
import { useWakeLock } from '../../../court';
import { useHoldBadgeUnlock } from '../../../components/badges/hold';
import { saveErrorMessage, useFeedback } from '../../../components/feedback';
import { PillSelect } from '../../../components/ranking/parts';
import { Badge, Button, Card, RowIcon, Segmented, Sheet, cx } from '../../../components/ui';
import { EmptyCard, STICKY_ABOVE_NAV } from '../FieldChrome';
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
import { holeWord } from './home';
import { cardHoles, golfRoundOf, hcpText, startIndex } from './logic';

const MAX_PUTT_CHIPS = 5;

/** Las teclas grandes de la tarjeta (− y +): 58 px, como las de anotar del boliche. */
const keyClass = 'grid h-key place-items-center rounded-key transition active:scale-95 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-accent';

/**
 * La tarjeta del grupo en el campo (rediseño «Calma y foco», como la hoja de anotar del boliche): un teléfono anota a los
 * 1–4 jugadores del grupo. Arriba el hoyo en grande con su par y SI, las flechas y la barra de cuántos hoyos van (tocar
 * el número abre «Ir al hoyo»); un − / + por jugador que arranca en el par, putts opcionales y «Recogió». «Hoyo listo»
 * pone el par a quien no se tocó y pasa solo al siguiente hoyo del orden de juego del grupo.
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
  const [picking, setPicking] = useState(false);
  const field = useFieldMode('campo', { tab: 'tarjeta' });
  // Entre hoyo y hoyo la pantalla no se apaga (nadie quiere desbloquear el teléfono en cada hoyo).
  useWakeLock(true);
  // Tarjeta a medio anotar: el aviso de una insignia espera a que se cierre (§6.4).
  useHoldBadgeUnlock();
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
      <EmptyCard
        icon={<Hand className="size-5" />}
        title={staff ? 'Todavía no hay inscritos' : 'No llevas ninguna tarjeta'}
        text={staff ? 'Inscribe a los jugadores en «Jugadores».' : 'Inscríbete en la ronda (en «Jugadores») para anotar la de tu grupo.'}
      />
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
  const holeNum = head?.number ?? current + 1;
  const pct = n ? Math.round((doneCount / n) * 100) : 0;

  // Qué grupo anota (quien lleva varios): segmentado con 2 o 3; con más, «Grupo 1 ▾».
  const scopeOptions = scopes.map((s) => ({ key: s.key, label: s.label }));
  const chips: ReactNode =
    scopes.length > 1 ? (
      scopes.length <= 3 ? (
        <Segmented full label="Qué grupo anotas" options={scopeOptions} value={scope ?? ''} onChange={(k) => update((l) => ({ ...l, scope: k, hole: null }))} />
      ) : (
        <PillSelect label="Qué grupo anotas" className="self-start" options={scopeOptions} value={scope ?? ''} onChange={(k) => update((l) => ({ ...l, scope: k, hole: null }))} />
      )
    ) : null;

  const arrow = 'grid size-12 shrink-0 place-items-center rounded-2xl bg-surface-2 text-fg-2 transition active:scale-95 focus-visible:outline-2 focus-visible:outline-accent';
  const hole: ReactNode = (
    <Card className={cx('px-3', field.on ? 'pt-2 pb-3' : 'pt-3 pb-4')}>
      <div className="flex items-center gap-2">
        <button type="button" className={arrow} aria-label="Hoyo anterior" onClick={() => step(-1)}>
          <ChevronLeft aria-hidden="true" className="size-6" />
        </button>
        <button
          type="button"
          onClick={() => setPicking(true)}
          aria-haspopup="dialog"
          className="min-w-0 flex-1 rounded-2xl py-1 text-center transition active:opacity-70 focus-visible:outline-2 focus-visible:outline-accent"
        >
          <span className="block text-[13px] font-semibold tracking-[0.08em] text-accent uppercase">Hoyo</span>{' '}
          <b className={cx('num block', field.on ? 'text-[44px] leading-none' : 'text-hero-sm')}>{holeNum}</b>
          <span className="mt-1.5 block text-meta text-fg-2">
            Par <b className="text-fg">{head?.par ?? '–'}</b> · SI <b className="text-fg">{head?.si ?? '–'}</b>
          </span>
        </button>
        <button type="button" className={arrow} aria-label="Hoyo siguiente" onClick={() => step(1)}>
          <ChevronRight aria-hidden="true" className="size-6" />
        </button>
      </div>
      <div className="mt-3 px-2">
        <div className="flex items-center justify-between gap-3 text-[13px] text-muted">
          <span>
            {doneCount} de {n} hoyos{scopes.length === 1 && scopeLabel ? ` · ${scopeLabel}` : ''}
          </span>
          <button type="button" onClick={() => setPicking(true)} className="-my-3 inline-flex min-h-11 items-center font-[550] text-accent">
            Ir al hoyo
          </button>
        </div>
        <div aria-hidden="true" className="mt-1 h-1.5 overflow-hidden rounded-full bg-accent/15">
          <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </Card>
  );

  const picker = (
    <Sheet open={picking} onClose={() => setPicking(false)} title="Ir al hoyo" subtitle={`${doneCount} de ${n} hoyos listos`}>
      <div className="grid grid-cols-6 gap-2 pb-2">
        {Array.from({ length: n }, (_, i) => {
          const all = group.every((c) => holeDone(c, i));
          const some = group.some((c) => holeDone(c, i));
          const num = group[0] ? holesOf(group[0])[i]?.number : i + 1;
          return (
            <button
              key={i}
              type="button"
              onClick={() => {
                goTo(i);
                setPicking(false);
              }}
              aria-label={`Hoyo ${num}${all ? ', listo' : some ? ', a medias' : ''}`}
              aria-current={i === current ? 'step' : undefined}
              className={cx(
                'num grid h-12 place-items-center rounded-xl text-[17px] font-[650] transition active:scale-95',
                i === current ? 'bg-accent text-accent-fg' : all ? 'bg-accent-soft text-accent' : some ? 'border-[1.5px] border-dashed border-accent text-accent' : 'bg-surface-2 text-fg-2',
              )}
            >
              {num}
            </button>
          );
        })}
      </div>
      <p className="pb-1 text-[13px] text-muted">En color, los hoyos listos; punteados, los que van a medias.</p>
    </Sheet>
  );

  const players: ReactNode = (
    <div className="flex flex-col gap-3">
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
        const pickUp = async () => {
          if (round.competition.format === 'stroke') {
            const ok = await confirm({
              title: '¿Recogió la bola?',
              message: 'En stroke play no terminar un hoyo descalifica de la ronda (no hay total). Si fue un error, se deshace.',
              confirmText: 'Sí, recogió',
            });
            if (!ok) return;
          }
          set(c, { s: null, p: null, u: true });
        };
        return (
          <Card key={c.id} className="px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-body font-semibold">{nameOf(c.playerId)}</span>
                  {c.signed ? <Badge tone="ok">Firmada</Badge> : signing(c) && <Badge tone="ok">Firmada · por enviar</Badge>}
                  {h && group[0] && h.par !== holesOf(group[0])[current]?.par && <Badge>Par {h.par}</Badge>}
                </div>
                <div className="text-[13px] text-muted">
                  Hcp {hcpText(c.playingHcp)}
                  {rec > 0 && <span className="font-[550] text-accent"> · {rec === 1 ? 'recibe 1 golpe aquí' : `recibe ${rec} golpes aquí`}</span>}
                  {rec < 0 && <span> · devuelve {Math.abs(rec)} aquí</span>}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end">
                <b className="num block text-row-num-pro" title={`${score.thru} hoyos`}>
                  {round.competition.format === 'stableford' ? `${score.points} pts` : <ToPar value={round.competition.basis === 'net' ? score.netToPar : score.toPar} />}
                </b>
                {/* «Recogió» arriba, junto a lo que lleva: no ocupa una fila entera debajo de las teclas. */}
                {!picked && (
                  <button
                    type="button"
                    disabled={!editable}
                    onClick={() => void pickUp()}
                    className="-mr-2 -mb-2.5 inline-flex min-h-11 items-center rounded-xl px-2 text-[13px] font-[550] text-fg-2 transition active:opacity-70 disabled:opacity-40"
                  >
                    Recogió
                  </button>
                )}
              </div>
            </div>

            {picked ? (
              <div className="mt-3.5 flex items-center justify-between gap-2 rounded-2xl bg-warn-soft py-2 pr-2 pl-4 text-warn">
                <span className="font-semibold">Recogió en este hoyo</span>
                <Button variant="quiet" className="h-11" disabled={!editable} icon={<Undo2 className="size-4" />} onClick={() => set(c, { s: h?.par ?? 4, p: null, u: false })}>
                  Deshacer
                </Button>
              </div>
            ) : (
              <div className="mt-3.5 grid grid-cols-[3.625rem_1fr_3.625rem] gap-2.5">
                <button
                  type="button"
                  aria-label={`Un golpe menos a ${nameOf(c.playerId)}`}
                  disabled={!editable || shown <= 1}
                  onClick={() => setStrokes(Math.max(1, shown - 1))}
                  className={cx(keyClass, 'bg-surface-2 text-fg')}
                >
                  <Minus aria-hidden="true" className="size-6" />
                </button>
                <button
                  type="button"
                  disabled={!editable}
                  onClick={() => s == null && setStrokes(shown)}
                  aria-label={s == null ? `Poner el par a ${nameOf(c.playerId)}` : `${s} golpes`}
                  className={cx(
                    'flex h-key flex-col items-center justify-center rounded-key transition',
                    s == null ? 'border-[1.5px] border-dashed border-faint text-muted' : 'bg-surface-2',
                  )}
                >
                  <span className="num text-[30px] leading-none font-[650]">{shown}</span>
                  <span className="mt-0.5 text-[11px] font-medium text-muted">{s == null ? 'par (toca para dejarlo)' : holeWord(s, h?.par ?? s)}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Un golpe más a ${nameOf(c.playerId)}`}
                  disabled={!editable || shown >= 20}
                  onClick={() => setStrokes(Math.min(20, shown + 1))}
                  className={cx(keyClass, 'bg-accent-soft text-accent')}
                >
                  <Plus aria-hidden="true" className="size-6" strokeWidth={2.4} />
                </button>
              </div>
            )}

            {!picked && log.putts && (
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5" role="group" aria-label="Putts">
                    <span className="mr-0.5 text-[13px] text-muted">Putts</span>
                    {Array.from({ length: MAX_PUTT_CHIPS }, (_, p) => {
                      const active = c.putts[current] === p;
                      return (
                        <button
                          key={p}
                          type="button"
                          disabled={!editable || p >= shown}
                          aria-pressed={active}
                          onClick={() => set(c, { s: s ?? shown, p: active ? null : p, u: false })}
                          className={cx('num size-10 rounded-xl text-[15px] font-semibold transition active:scale-95 disabled:opacity-30', active ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-fg-2')}
                        >
                          {p}
                        </button>
                      );
                    })}
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );

  const signMine: ReactNode = canSignMine && mineInGroup && (
    <Button variant="primary" size="xl" className="w-full" icon={<Signature className="size-5" />} onClick={() => onSign(mineInGroup)}>
      Revisar y firmar mi tarjeta
    </Button>
  );

  const doneCard: ReactNode = finished && (
    <Card soft className="flex flex-col gap-4 px-5 py-5 text-center">
      <div>
        <p className="text-[19px] leading-[1.3] font-[650]">¡Terminaron los {n} hoyos!</p>
        <p className="mt-1 text-meta text-fg-2">Envía las tarjetas y que cada uno revise y firme la suya.</p>
      </div>
      {!field.on && signMine}
    </Card>
  );

  const holeReady: ReactNode = !finished && (
    <Button variant="primary" size="xl" className="w-full" icon={<Check className="size-5" />} onClick={finishHole}>
      Hoyo listo{nextNum ? ` → hoyo ${nextNum}` : ''}
    </Button>
  );

  const offline = !isOnline();
  const sendRow = (
    <div className="mm-row relative flex min-h-row items-center gap-3.5 py-2.5 pr-3 pl-5">
      <RowIcon tone={unsent ? 'accent' : 'neutral'}>{offline && unsent ? <CloudOff className="size-5" /> : <Send className="size-5" />}</RowIcon>
      <span className="min-w-0 flex-1">
        <span className={cx('block font-semibold', !unsent && 'text-ok')}>{unsent ? (unsent === 1 ? '1 hoyo por enviar' : `${unsent} hoyos por enviar`) : 'Todo enviado'}</span>
        <span className="block text-[13px] text-muted">Guardado en tu teléfono · sale solo cada 3 hoyos</span>
      </span>
      {(unsent > 0 || sending) && (
        <Button variant="quiet" className="h-11" icon={<Send className="size-4" />} loading={sending} onClick={publish}>
          Enviar
        </Button>
      )}
    </div>
  );
  const puttsRow = (
    <label className="mm-row relative flex min-h-row cursor-pointer items-center gap-3.5 py-2.5 pr-[18px] pl-5">
      <RowIcon>
        <Flag className="size-5" />
      </RowIcon>
      <span className="min-w-0 flex-1 font-semibold">Anotar putts</span>
      <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={log.putts} onChange={(e) => update((l) => ({ ...l, putts: e.target.checked }))} />
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
              <span className={cx('flex items-center gap-1.5 text-[13px]', unsent ? 'text-muted' : 'text-ok')}>
                {offline && unsent > 0 && <CloudOff aria-hidden="true" className="size-4" />}
                {unsent ? (unsent === 1 ? '1 hoyo por enviar' : `${unsent} hoyos por enviar`) : 'Todo enviado'}
              </span>
              {(unsent > 0 || sending) && (
                <Button variant="quiet" className="h-11" icon={<Send className="size-4" />} loading={sending} onClick={publish}>
                  Enviar
                </Button>
              )}
            </div>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {players}
          {doneCard}
          <Card className="overflow-hidden">{puttsRow}</Card>
        </div>
        {picker}
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
        <div className={cx(STICKY_ABOVE_NAV, 'card-shadow rounded-[26px] bg-surface/95 p-2 backdrop-blur')}>{holeReady}</div>
      )}
      <Card className="overflow-hidden">
        {sendRow}
        {puttsRow}
      </Card>
      {picker}
    </div>
  );
}
