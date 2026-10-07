import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Camera, CheckCircle2, Clock, PencilLine, Plus, Send, Smartphone, Trash2, XCircle, type LucideIcon } from 'lucide-react';
import { addEventGame } from '../../lib/data';
import { ballKeys, ballTags, fetchMyBallGames, queuedBallsByGame, useMyBallGames } from '../../lib/data/balls';
import { getUserId, queryClient, type Live } from '../../lib/data/client';
import { saveDraft, useDraft } from '../../lib/draft';
import { useLeagueCtx } from '../../lib/league';
import type { LiveInfo } from '../../lib/live';
import { ballForGame, ballLabel, ballsByGame, draftBallsAfter, type BallGame } from '../../lib/balls';
import type { GameMark } from '../../lib/bowlingSeason';
import { slots } from '../../lib/stats';
import type { BowlingEvent, Entry, Submission } from '../../lib/types';
import { BallArt } from '../balls/BallArt';
import { GameBallSelect, useBallChoice } from '../balls/BallPicker';
import { BusyIcon } from '../busy';
import { useFeedback } from '../feedback';
import { type ScoreValue } from '../frames/FrameEditor';
import { clearGameDraft, gameKey, myGamesPlace, readGameDraft } from '../frames/draftMemory';
import { ScoreEntryModal } from '../frames/ScoreEntryModal';
import { eventLabel } from '../../lib/format';
import { nextGameLabel, partialGame, useMemoryTick, type PartialGame } from '../../lib/useNextGame';
import { todayTitle } from '../home/logic';
import { Button, Card, GameTile, cx } from '../ui';
import { gamesList } from './board';
import { MarksLine } from './GameMarks';

type Cell =
  | { kind: 'tabla'; score: number; counted: boolean }
  | { kind: 'telefono'; score: number }
  | { kind: 'enviado'; score: number }
  | { kind: 'vacio' };

const sentAt = (s: Submission) => s.createdAt?.toMillis() ?? Number.MAX_SAFE_INTEGER;

const NO_GAMES: BallGame[] = [];

/** La línea de estado de «Tus juegos». */
export interface GamesStatus {
  tone: 'ok' | 'muted' | 'accent';
  text: string;
}

/**
 * Lo que se sabe de los juegos en una línea (solo las excepciones llevan marca): «Los juegos 1 y 2 ya cuentan en la
 * liga», «El juego 3 está por aprobar», «El juego 2 está en tu teléfono, sin enviar», o varias juntas («Los juegos 1 y 2
 * ya cuentan · el 3, por aprobar»). Lo que la liga todavía no tiene (por aprobar: enviado o en la tabla sin la foto que
 * exige) no cuenta. null = nada que decir (todavía no anota ninguno).
 */
export function myGamesStatus(cells: readonly Cell[]): GamesStatus | null {
  const counted: number[] = [];
  const pending: number[] = [];
  const phone: number[] = [];
  cells.forEach((c, i) => {
    if (c.kind === 'tabla') (c.counted ? counted : pending).push(i);
    else if (c.kind === 'enviado') pending.push(i);
    else if (c.kind === 'telefono') phone.push(i);
  });
  if (counted.length && counted.length === cells.length) return { tone: 'ok', text: 'Tus juegos ya cuentan en la liga' };
  // Cada cosa: completa si va sola («ya cuentan en la liga»), corta si va primera de varias («ya cuentan») y, detrás,
  // «el 3, por aprobar».
  const all: { idx: number[]; alone: [string, string]; first: [string, string]; after: string; tone: GamesStatus['tone'] }[] = [
    { idx: counted, alone: ['ya cuenta en la liga', 'ya cuentan en la liga'], first: ['ya cuenta', 'ya cuentan'], after: 'ya cuenta', tone: 'ok' },
    { idx: pending, alone: ['está por aprobar', 'están por aprobar'], first: ['está por aprobar', 'están por aprobar'], after: 'por aprobar', tone: 'muted' },
    {
      idx: phone,
      alone: ['está en tu teléfono, sin enviar', 'están en tu teléfono, sin enviar'],
      first: ['está en tu teléfono', 'están en tu teléfono'],
      after: 'en tu teléfono',
      tone: 'accent',
    },
  ];
  const parts = all.filter((p) => p.idx.length);
  if (!parts.length) return null;
  const [first, ...rest] = parts;
  const many = first.idx.length > 1 ? 1 : 0;
  const lead = `${many ? 'Los juegos' : 'El juego'} ${gamesList(first.idx)}`;
  if (!rest.length) return { tone: first.tone, text: `${lead} ${first.alone[many]}` };
  const others = rest.map((p) => `${p.idx.length === 1 ? 'el' : 'los'} ${gamesList(p.idx)}, ${p.after}`);
  return { tone: first.tone, text: [`${lead} ${first.first[many]}`, ...others].join(' · ') };
}

const STATUS_ICON: Record<GamesStatus['tone'], { icon: LucideIcon; className: string }> = {
  ok: { icon: CheckCircle2, className: 'text-ok' },
  muted: { icon: Clock, className: 'text-muted' },
  accent: { icon: Smartphone, className: 'text-accent' },
};

/** Una línea discreta de la tarjeta (la foto del marcador, enviar, otro juego): 44 px para el dedo. */
function QuietAction({
  icon: Icon,
  onClick,
  busy,
  accent,
  children,
}: {
  icon: LucideIcon;
  onClick: () => void;
  busy?: boolean;
  accent?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-busy={busy || undefined}
      className={cx(
        'flex h-11 w-full min-w-0 items-center justify-center gap-1.5 text-meta font-[550] transition active:opacity-70 disabled:opacity-60',
        'focus-visible:outline-2 focus-visible:outline-accent',
        accent ? 'text-accent' : 'text-fg-2',
      )}
    >
      <BusyIcon busy={!!busy} icon={<Icon aria-hidden="true" className="size-[18px] shrink-0" />} className="size-[18px] shrink-0" />
      <span className="truncate">{children}</span>
    </button>
  );
}

/**
 * Mis juegos con bola de esos envíos, en una sola lectura (useMyBallGames lee un solo lugar y aquí puede haber más de
 * un envío pendiente). `enabled = false` no pide nada.
 */
function useSubBallGames(subIds: readonly string[], enabled: boolean): Live<BallGame[]> {
  const uid = getUserId();
  const refs = [...subIds].sort().join('+');
  return queryClient.useQuery<BallGame[]>(
    uid && enabled && refs ? ballKeys.games(uid, refs) : null,
    async () => (await Promise.all(refs.split('+').map((id) => fetchMyBallGames(id)))).flat(),
    { initial: NO_GAMES, tags: uid ? [ballTags.all, ballTags.user(uid)] : [], staleMs: 30_000 },
  );
}

/** Cómo se ve «Tus juegos»: grande (Lite), compacta (Pro) o solo la hoja de anotar (Pro, quien lleva la Planilla). */
export type MyGamesLook = 'lite' | 'pro' | 'sheet';

/**
 * «Tus juegos» (rediseño «Calma y foco»): el jugador anota sus juegos del evento uno a uno mientras juega (pines,
 * teclado o total, en «Teclado ▾» dentro de la hoja): cada juego se guarda en su teléfono y al final los envía a
 * revisión. Arriba la serie y el promedio; las fichas en grande (el que dejó a medias, «A medias»); una línea con lo que
 * ya cuenta y lo que falta («Los juegos 1 y 2 ya cuentan en la liga»); UN botón («Seguir mi juego 3», «Anotar juego 3»
 * o «Enviar mis juegos») y, a la vista, «Anotar con foto del marcador». En una práctica puede sumar otro juego.
 *
 * `look`: 'lite' (por defecto), 'pro' (la misma, más compacta: J1 J2 J3 Serie) o 'sheet' (Pro con Planilla: sin
 * tarjeta, solo la hoja, que se abre desde «?anotar=1» o con `openRequest`; si tiene juegos en el teléfono sin enviar,
 * sale la tarjeta compacta para enviarlos).
 */
export function MyGamesPanel({
  event,
  playerId,
  entry,
  subs,
  today,
  autoStart,
  onAutoStarted,
  onOpenEntry,
  onSend,
  marks,
  onAutoDone,
  look = 'lite',
  openRequest,
  className,
}: {
  event: BowlingEvent;
  playerId: string;
  entry: Entry | null;
  /** Envíos del jugador en este evento. */
  subs: Submission[];
  /** Si se está jugando (ya lo dicen la pantalla y «Cómo van todos»: aquí no se repite). */
  live?: LiveInfo;
  today: string;
  /** Abrir el próximo juego sin anotar al entrar (desde "En juego ahora"). */
  autoStart: boolean;
  onAutoStarted: () => void;
  onOpenEntry: () => void;
  onSend: () => void;
  /** «Récord personal» y «+15 sobre tu promedio» de los juegos que ya están en la tabla. */
  marks?: (GameMark | null)[] | null;
  /**
   * Se cerró la hoja que se abrió sola (autoStart): quien abrió Anotar desde otra pantalla (Hoy, la Liga) vuelve allá
   * al cerrarla, al guardar el juego o con «Guardar y salir».
   */
  onAutoDone?: () => void;
  look?: MyGamesLook;
  /** Abrir la hoja de ese juego (desde la Planilla: su propio juego a medias). `at` distingue dos pedidos iguales. */
  openRequest?: { game: number; at: number } | null;
  /** De la tarjeta (el espacio de arriba): en 'sheet' sin tarjeta no ocupa nada. */
  className?: string;
}) {
  const { lid } = useLeagueCtx();
  const { toast, confirm } = useFeedback();
  const draft = useDraft(lid, playerId, event.id);
  const [adding, setAdding] = useState(false);
  // La bola de cada juego: la que ya eligió en el teléfono, la del juego anterior o la última que usó. Se elige arriba
  // del editor (aunque la cuenta no tenga ninguna: «Agregar») y se envía con los juegos («Enviar a revisión»).
  const choice = useBallChoice();
  const ballPick = useRef<string | null>(null);
  const ballOf = (i: number) => ballForGame(draft?.balls, i, choice.auto);

  const count = Math.max(event.games, draft?.values.length ?? 0);
  const scores = slots(entry?.scores, count, null);
  const photos = slots(entry?.photos, count, null);
  const newestFirst = [...subs].sort((a, b) => sentAt(b) - sentAt(a));
  const pending = newestFirst.filter((s) => s.status === 'pendiente');
  const last = newestFirst[0];

  const cells: Cell[] = Array.from({ length: count }, (_, i) => {
    if (scores[i] != null) return { kind: 'tabla', score: scores[i]!, counted: photos[i] != null };
    const typed = draft?.values[i]?.trim();
    if (typed) return { kind: 'telefono', score: Number(typed) };
    const sent = pending.find((s) => s.scores[i] != null)?.scores[i];
    if (sent != null) return { kind: 'enviado', score: sent };
    return { kind: 'vacio' };
  });
  // Solo cuentan los juegos del teléfono que todavía no están en la tabla.
  const inPhone = cells.filter((c) => c.kind === 'telefono').length;
  // Promedio de la sesión con todo lo que ya se sabe (tabla, enviado y lo del teléfono).
  const known = cells.flatMap((c) => (c.kind === 'vacio' ? [] : [c.score]));
  const series = known.reduce((a, b) => a + b, 0);
  const average = known.length ? Math.floor(series / known.length) : null;
  const nextEmpty = cells.findIndex((c) => c.kind === 'vacio');
  const notYet = event.date > today;
  // Desde "En juego ahora" (autoStart) el próximo juego por anotar ya sale abierto al dibujar la primera vez.
  const [editing, setEditing] = useState<number | null>(() => (autoStart && !notYet && nextEmpty >= 0 ? nextEmpty : null));
  // La hoja que se abrió sola (autoStart): al cerrarla se avisa (onAutoDone) para volver a la pantalla de donde vino.
  const autoOpened = useRef(editing != null);
  // Lo que quedó a medias en la hoja de anotar (draftMemory) en cada juego sin número: «A medias» y «Seguir mi juego 3»,
  // igual que en Hoy (useNextGame). Se vuelve a leer al volver a la app o cuando el teléfono guarda algo.
  useMemoryTick();
  const place = myGamesPlace(getUserId(), lid, playerId, event.id);
  const halfway: (PartialGame | null)[] = cells.map((c, i) => (c.kind === 'vacio' ? partialGame(readGameDraft(gameKey(place, i))) : null));
  // El que sigue, si quedó a medias: «Seguir mi juego 3» (los textos de Hoy, useNextGame).
  const nextHalf = nextEmpty >= 0 ? halfway[nextEmpty] : null;

  // La bola de cada juego, en su casilla y al abrirlo. Los del teléfono: ballOf (la misma que se envía). Los que ya
  // salieron del teléfono (en la tabla o enviados): lo de la cola encima de lo del servidor. Sin bolas en la cuenta no se
  // lee nada: ningún juego tiene.
  const hasBalls = choice.balls.length > 0;
  /** El envío pendiente de un juego enviado (el más nuevo que lo trae). */
  const subOf = (i: number) => pending.find((s) => s.scores[i] != null)!;
  const tableBalls = useMyBallGames(event.id, hasBalls && cells.some((c) => c.kind === 'tabla'));
  const subBalls = useSubBallGames([...new Set(cells.flatMap((c, i) => (c.kind === 'enviado' ? [subOf(i).id] : [])))], hasBalls);
  /** null = sin bola; undefined = falta anotarlo o no se sabe (sin leer y sin señal). */
  function ballAt(c: Cell, i: number): string | null | undefined {
    if (c.kind === 'vacio') return undefined;
    if (c.kind === 'telefono') return ballOf(i);
    const [kind, ref, server] = c.kind === 'tabla' ? (['event', event.id, tableBalls] as const) : (['sub', subOf(i).id, subBalls] as const);
    const queued = queuedBallsByGame(kind, ref)?.[String(i)];
    if (queued !== undefined) return typeof queued === 'string' ? queued : null;
    if (!hasBalls) return choice.canPick ? null : undefined;
    return server.loading || server.error ? undefined : (ballsByGame(server.data, kind, ref)[i] ?? null);
  }
  const gameBalls = cells.map(ballAt);
  // La que se dibuja en cada casilla (una que ya no existe, no).
  const tileBalls = gameBalls.map((id) => (id ? choice.balls.find((b) => b.id === id) : undefined));

  // Solo en la práctica de hoy (no en una vieja ni en una que todavía no llega).
  const canAddGame = event.type === 'practica' && event.date === today && event.games < 10 && count === event.games;
  // El que se acaba de agregar con «Otro juego» (desde 0), hasta que la sesión lo tiene.
  const [openAdded, setOpenAdded] = useState<number | null>(null);

  async function addGame() {
    const n = event.games + 1;
    const ok = await confirm({
      title: `¿Agregar el juego ${n}?`,
      message: 'Si siguieron jugando, la práctica de hoy pasa a tener un juego más (para todos).',
      confirmText: 'Agregar juego',
    });
    if (!ok) return;
    setAdding(true);
    setOpenAdded(event.games);
    const added = addEventGame(lid, event);
    added.catch((e) => {
      console.error(e);
      setOpenAdded(null);
      toast('No se pudo agregar el juego. Intenta de nuevo.', 'error');
    });
    // Sin señal queda en cola y sale solo: no se espera al servidor.
    const done = await Promise.race([added.then(() => true, () => false), new Promise<null>((r) => setTimeout(() => r(null), 1500))]);
    setAdding(false);
    if (done !== false) toast(`Juego ${n} agregado a la sesión`);
  }

  const allInTable = cells.every((c) => c.kind === 'tabla');

  // Lo que ya llegó a la tabla (lo anotó el admin o el anotador) sale del teléfono: no se vuelve a enviar.
  const stale = draft?.values.some((v, i) => v.trim() !== '' && scores[i] != null) ?? false;
  useEffect(() => {
    if (!draft || !stale) return;
    // No se publica en vivo: la tabla ya manda en esos juegos (y no se pisa lo de otro dispositivo).
    saveDraft(
      lid,
      playerId,
      event.id,
      {
        ...draft,
        values: draft.values.map((v, i) => (scores[i] != null ? '' : v)),
        frames: Object.fromEntries(Object.entries(draft.frames ?? {}).filter(([i]) => scores[+i] == null)),
      },
      { live: false },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stale]);

  const edit = (i: number) => setEditing(i);

  // El juego que se agregó se abre para anotarlo (con su bola arriba) en cuanto la sesión lo tiene: sin señal también, el
  // juego nuevo se ve enseguida. Si mientras tanto abrió otro, se queda en ese.
  useEffect(() => {
    if (openAdded == null || count <= openAdded) return;
    setOpenAdded(null);
    setEditing((e) => e ?? openAdded);
  }, [openAdded, count]);

  /** Se cierra la hoja (la X, «Guardar y salir», guardar o borrar el juego). */
  function closeSheet() {
    setEditing(null);
    if (autoOpened.current) {
      autoOpened.current = false;
      onAutoDone?.();
    }
  }

  function save(i: number, v: ScoreValue | null) {
    const values = Array.from({ length: count }, (_, j) => draft?.values[j] ?? '');
    values[i] = v?.score == null ? '' : String(v.score);
    const frames = { ...(draft?.frames ?? {}) };
    if (v?.frames && v.score != null) frames[i] = v.frames;
    else delete frames[i];
    // La bola solo si salió arriba (con la lista de bolas leída): si no, la de ese juego no se toca.
    const balls = draftBallsAfter(draft?.balls, i, v, choice.canPick ? ballPick.current : undefined);
    saveDraft(lid, playerId, event.id, { values, frames, balls });
    toast(v ? `Juego ${i + 1} guardado en tu teléfono` : `Juego ${i + 1} borrado`);
    closeSheet();
  }

  // Desde "En juego ahora": abre directo el próximo juego por anotar (al entrar ya salió abierto; si llega estando aquí,
  // se abre ahora, salvo que esté anotando otro).
  const started = useRef(false);
  useEffect(() => {
    if (!autoStart || started.current) return;
    started.current = true;
    onAutoStarted();
    const first = cells.findIndex((c) => c.kind === 'vacio');
    if (editing == null && !notYet && first >= 0) {
      autoOpened.current = true;
      edit(first);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  // Desde la Planilla (Pro): su propio juego, en esta hoja (la misma memoria del teléfono que «Seguir mi juego 3»).
  useEffect(() => {
    if (openRequest && !notYet && openRequest.game < count) edit(openRequest.game);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest?.at]);

  const editingCell = editing != null ? cells[editing] : null;
  // Un juego ya enviado se abre con lo que se envió (también sus cuadros).
  const initial: ScoreValue =
    editingCell?.kind === 'telefono'
      ? { score: editingCell.score, frames: draft?.frames?.[editing!] ?? null }
      : editingCell?.kind === 'enviado'
        ? { score: editingCell.score, frames: pending.find((s) => s.scores[editing!] != null)?.frames?.[editing!] ?? null }
        : { score: null, frames: null };
  // Y con su bola: la que ya tiene un juego enviado (si se sabe); si no, la del teléfono (ballOf).
  const sentBall = editingCell?.kind === 'enviado' ? gameBalls[editing!] : undefined;
  const editBall = sentBall !== undefined ? sentBall : editing != null ? ballOf(editing) : null;
  // Lo que va anotando en la hoja queda en el teléfono aunque la cierre sin guardar: por cuenta, jugador, evento y juego
  // (la misma que «Subir mis juegos» de ese evento: es el mismo juego en el teléfono).
  const memoryKey = editing != null ? gameKey(place, editing) : undefined;

  const pro = look !== 'lite';
  const phoneGames = cells.flatMap((c, i) => (c.kind === 'telefono' ? [i] : []));
  const status = myGamesStatus(cells);
  const rejected = !pending.length && last?.status === 'rechazado' && inPhone === 0 && !allInTable ? last : null;
  // Las fichas: hasta 3 juegos en grande («Juego 1»); con más (o en Pro), compactas («J1») y en Pro con la serie al final.
  const dense = pro || count > 3;
  const columns = Math.max(3, Math.min(count + (pro ? 1 : 0), 5));
  // El botón principal: el juego que sigue (o el que quedó a medias); con todos anotados y en el teléfono, enviarlos.
  const primary =
    notYet || allInTable
      ? null
      : nextEmpty >= 0
        ? {
            label: nextHalf
              ? nextGameLabel({ kind: 'medias', game: nextEmpty + 1, progress: nextHalf.progress, to: '' }, { pro })
              : nextGameLabel({ kind: 'anotar', game: nextEmpty + 1, to: '' }),
            icon: PencilLine,
            onClick: () => edit(nextEmpty),
          }
        : inPhone > 0
          ? { label: nextGameLabel({ kind: 'enviar', count: inPhone, to: '' }), icon: Send, onClick: onSend }
          : null;

  const sheet = (
    <>
      {/* La bola de este juego va arriba del editor (en las tres formas de anotar) en cuanto se sabe la lista de bolas,
          aunque no tenga ninguna («Agregar»). Si el juego se abrió antes de leerla (desde "En juego ahora"), sale al leerla
          y arranca con la última que usó. Se vuelve a montar con cada juego. */}
      <ScoreEntryModal
        open={editing != null}
        onClose={closeSheet}
        title={editing != null ? `Juego ${editing + 1}` : ''}
        subtitle={event.date === today ? todayTitle(event, today) : eventLabel(event)}
        resetKey={String(editing)}
        memoryKey={memoryKey}
        initial={initial}
        top={
          editing != null && choice.canPick ? (
            <GameBallSelect key={editing} balls={choice.balls} initial={editBall} choice={ballPick} game={editing} today={today} />
          ) : undefined
        }
        saveText="Guardar"
        onSave={(v) => save(editing!, v)}
        // «Guardado en tu teléfono» ya sale arriba: abajo solo «Borrar» el juego que está en el teléfono.
        note={
          editingCell?.kind === 'telefono' && (
            <div className="flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                className="text-danger"
                icon={<Trash2 className="size-4" />}
                onClick={() => {
                  // Borrado: lo que tenía a medias en la hoja tampoco se queda.
                  if (memoryKey) clearGameDraft(memoryKey);
                  save(editing!, null);
                }}
              >
                Borrar este juego
              </Button>
            </div>
          )
        }
      />
    </>
  );

  // Pro con Planilla: solo la hoja (su fila de la Planilla y «?anotar=1» la abren); con juegos sin enviar, la tarjeta.
  if (look === 'sheet' && inPhone === 0) return sheet;

  const statusIcon = status ? STATUS_ICON[status.tone] : null;
  return (
    <Card className={cx(pro ? 'p-[18px]' : 'px-5 pt-5 pb-1.5', className)}>
      <section aria-label="Tus juegos">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className={pro ? 'text-[17px] leading-tight font-[650] tracking-[-0.015em]' : 'text-section'}>Tus juegos</h2>
          {average != null && (
            <span className={cx('min-w-0 truncate text-muted', pro ? 'text-[13px]' : 'text-sm')}>
              Serie <b className="num font-[650] text-fg">{series}</b> · Prom. <b className="num font-[650] text-fg">{average}</b>
            </span>
          )}
        </div>

        {notYet ? (
          <p className="mt-2 mb-3.5 text-meta text-muted">El día del evento podrás anotar aquí tus juegos mientras juegas.</p>
        ) : (
          <>
            <div className={cx('grid', dense ? 'mt-3.5 mb-3 gap-2' : 'mt-4 mb-3 gap-2.5')} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
              {cells.map((c, i) => {
                const label = dense ? `J${i + 1}` : `Juego ${i + 1}`;
                const spoken = `Juego ${i + 1}${c.kind === 'vacio' ? (halfway[i] ? ': a medias' : ': anotar') : `: ${c.score}`}${tileBalls[i] ? `, bola ${ballLabel(tileBalls[i])}` : ''}`;
                const open = () => (c.kind === 'tabla' ? onOpenEntry() : edit(i));
                // Lo que todavía no cuenta (enviado, o en la tabla sin la foto que se exige) va en gris.
                const faint = c.kind === 'enviado' || (c.kind === 'tabla' && !c.counted);
                return (
                  <div key={i} className="relative min-w-0">
                    {c.kind !== 'vacio' ? (
                      <GameTile label={label} score={c.score} dense={dense} onClick={open} ariaLabel={spoken} className={faint ? 'text-faint' : undefined} />
                    ) : halfway[i] ? (
                      // A medias: la barrita con lo que lleva (en Pro, «74…»).
                      <GameTile
                        label={label}
                        state="draft"
                        progress={halfway[i]!.progress}
                        score={dense && halfway[i]!.score ? halfway[i]!.score : null}
                        dense={dense}
                        onClick={open}
                        ariaLabel={spoken}
                      />
                    ) : i === nextEmpty ? (
                      <GameTile label={label} state="next" dense={dense} onClick={open} ariaLabel={spoken} />
                    ) : (
                      <GameTile label={label} dense={dense} onClick={open} ariaLabel={spoken} className="text-faint" />
                    )}
                    {/* Con qué bola lo tiró: solo se ve (se cambia al abrir el juego). */}
                    {tileBalls[i] && (
                      <BallArt ball={tileBalls[i]} size={18} className={cx('pointer-events-none absolute', dense ? 'top-1.5 right-1.5' : 'top-2.5 right-2.5')} />
                    )}
                  </div>
                );
              })}
              {pro && <GameTile label="Serie" score={series || null} state="total" dense />}
            </div>

            {status && statusIcon && (
              <p className={cx('mx-0.5 flex items-center gap-[7px] text-fg-2', pro ? 'mb-3 text-[13px]' : 'mb-4 text-sm')}>
                <statusIcon.icon aria-hidden="true" className={cx('size-[17px] shrink-0', statusIcon.className)} />
                <span className="min-w-0">{status.text}</span>
              </p>
            )}
            <MarksLine marks={marks} className={cx('mx-0.5 -mt-2', pro ? 'mb-3' : 'mb-4')} />
            {rejected && (
              <p className="mx-0.5 mb-4 flex items-start gap-[7px] text-sm text-danger">
                <XCircle aria-hidden="true" className="mt-px size-[17px] shrink-0" />
                <span>
                  El admin no aceptó tu envío{rejected.note ? `: ${rejected.note}` : '.'} Anota de nuevo y vuelve a enviarlo.
                </span>
              </p>
            )}

            {primary && (
              <Button variant="primary" size={pro ? 'lg' : 'xl'} className="w-full" icon={<primary.icon className={pro ? 'size-[18px]' : 'size-5'} />} onClick={primary.onClick}>
                {primary.label}
              </Button>
            )}
            <div className={cx('flex flex-col', primary && 'mt-0.5', !primary && !allInTable && '-mt-1')}>
              {nextEmpty >= 0 && phoneGames.length > 0 && (
                <QuietAction icon={Send} onClick={onSend} accent>
                  {phoneGames.length === 1 ? 'Enviar mi juego' : 'Enviar mis juegos'} {gamesList(phoneGames)}
                </QuietAction>
              )}
              {canAddGame && nextEmpty < 0 && (
                <QuietAction icon={Plus} onClick={() => void addGame()} busy={adding}>
                  Otro juego
                </QuietAction>
              )}
              {!allInTable && inPhone === 0 && (
                <QuietAction icon={Camera} onClick={onSend}>
                  Anotar con foto del marcador
                </QuietAction>
              )}
            </div>
            {allInTable && !pro && <div className="h-3.5" />}
          </>
        )}
      </section>
      {sheet}
    </Card>
  );
}
