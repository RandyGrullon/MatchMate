import { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, Clock, Grid3x3, PencilLine, Plus, Send, SlidersHorizontal, Smartphone, Target, Trash2, XCircle } from 'lucide-react';
import { addEventGame } from '../../lib/data';
import { ballKeys, ballTags, fetchMyBallGames, queuedBallsByGame, useMyBallGames } from '../../lib/data/balls';
import { getUserId, queryClient, type Live } from '../../lib/data/client';
import { saveDraft, useDraft } from '../../lib/draft';
import { useLeagueCtx } from '../../lib/league';
import type { LiveInfo } from '../../lib/live';
import { ballForGame, ballLabel, ballsByGame, draftBallsAfter, type BallGame } from '../../lib/balls';
import { hasMark, type GameMark } from '../../lib/bowlingSeason';
import { slots } from '../../lib/stats';
import type { BowlingEvent, Entry, Submission } from '../../lib/types';
import { BallArt } from '../balls/BallArt';
import { GameBallSelect, useBallChoice } from '../balls/BallPicker';
import { BusyIcon } from '../busy';
import { useFeedback } from '../feedback';
import { preferredMode, setPreferredMode, type ScoreMode, type ScoreValue } from '../frames/FrameEditor';
import { clearGameDraft, gameKey, myGamesPlace } from '../frames/draftMemory';
import { ScoreEntryModal } from '../frames/ScoreEntryModal';
import { Badge, Button, Card, cx } from '../ui';
import { MarkIcon, MarksLine } from './GameMarks';

type Cell =
  | { kind: 'tabla'; score: number; counted: boolean }
  | { kind: 'telefono'; score: number }
  | { kind: 'enviado'; score: number }
  | { kind: 'vacio' };

const sentAt = (s: Submission) => s.createdAt?.toMillis() ?? Number.MAX_SAFE_INTEGER;

const MODES: { key: ScoreMode; label: string; icon: typeof Target }[] = [
  { key: 'pines', label: 'Pines', icon: Target },
  { key: 'teclado', label: 'Teclado', icon: Grid3x3 },
  { key: 'total', label: 'Total', icon: SlidersHorizontal },
];

const NO_GAMES: BallGame[] = [];

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

/**
 * El jugador anota sus juegos del evento uno a uno mientras juega, de la forma que elija (pines, teclado o
 * total): cada juego se guarda en su teléfono y al final los envía a revisión. La foto del marcador es
 * opcional y sirve para verificar. En una práctica puede sumar un juego más si siguen jugando.
 */
export function MyGamesPanel({
  event,
  playerId,
  entry,
  subs,
  live,
  today,
  autoStart,
  onAutoStarted,
  onOpenEntry,
  onSend,
  marks,
}: {
  event: BowlingEvent;
  playerId: string;
  entry: Entry | null;
  /** Envíos del jugador en este evento. */
  subs: Submission[];
  live: LiveInfo;
  today: string;
  /** Abrir el próximo juego sin anotar al entrar (desde "En juego ahora"). */
  autoStart: boolean;
  onAutoStarted: () => void;
  onOpenEntry: () => void;
  onSend: () => void;
  /** «Récord personal» y «+15 sobre tu promedio» de los juegos que ya están en la tabla. */
  marks?: (GameMark | null)[] | null;
}) {
  const { lid } = useLeagueCtx();
  const { toast, confirm } = useFeedback();
  const draft = useDraft(lid, playerId, event.id);
  const [mode, setMode] = useState<ScoreMode>(preferredMode);
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

  function pickMode(m: ScoreMode) {
    setPreferredMode(m);
    setMode(m);
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

  function save(i: number, v: ScoreValue | null) {
    const values = Array.from({ length: count }, (_, j) => draft?.values[j] ?? '');
    values[i] = v?.score == null ? '' : String(v.score);
    const frames = { ...(draft?.frames ?? {}) };
    if (v?.frames && v.score != null) frames[i] = v.frames;
    else delete frames[i];
    // La bola solo si salió arriba (con la lista de bolas leída): si no, la de ese juego no se toca.
    const balls = draftBallsAfter(draft?.balls, i, v, choice.canPick ? ballPick.current : undefined);
    saveDraft(lid, playerId, event.id, { values, frames, balls });
    setEditing(null);
    setMode(preferredMode());
    toast(v ? `Juego ${i + 1} guardado en tu teléfono` : `Juego ${i + 1} borrado`);
  }

  // Desde "En juego ahora": abre directo el próximo juego por anotar (al entrar ya salió abierto; si llega estando aquí,
  // se abre ahora, salvo que esté anotando otro).
  const started = useRef(false);
  useEffect(() => {
    if (!autoStart || started.current) return;
    started.current = true;
    onAutoStarted();
    const first = cells.findIndex((c) => c.kind === 'vacio');
    if (editing == null && !notYet && first >= 0) edit(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

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
  const memoryKey = editing != null ? gameKey(myGamesPlace(getUserId(), lid, playerId, event.id), editing) : undefined;

  return (
    <Card className={cx('flex flex-col gap-3 p-4', live.live && !notYet && 'border-ok/40')}>
      <div className="flex items-center gap-2">
        <h2 className="font-semibold">Mis juegos</h2>
        {live.live && !live.startsSoon && (
          <Badge tone="ok">
            <span className="live-dot" /> En juego
          </Badge>
        )}
        {live.live && live.startsSoon && live.startLabel && <Badge tone="accent">Empieza a las {live.startLabel}</Badge>}
      </div>

      {notYet ? (
        <p className="text-sm text-muted">El día del evento podrás anotar aquí tus juegos mientras juegas.</p>
      ) : (
        <>
          {!allInTable && (
            <div className="flex items-center gap-2 text-xs text-muted" data-tour="modo">
              <span className="shrink-0">Anotar con</span>
              <div role="radiogroup" aria-label="Forma de anotar" className="grid flex-1 grid-cols-3 gap-1 rounded-lg bg-surface-2 p-0.5">
                {MODES.map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={mode === key}
                    onClick={() => pickMode(key)}
                    className={cx(
                      'flex min-h-11 items-center justify-center gap-1 rounded-md py-1.5 font-medium transition',
                      mode === key ? 'bg-surface text-fg shadow-sm' : 'hover:text-fg',
                    )}
                  >
                    <Icon className="size-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="grid gap-2" data-tour="juegos" style={{ gridTemplateColumns: `repeat(${Math.min(count + (canAddGame ? 1 : 0), 5)}, minmax(0, 1fr))` }}>
            {cells.map((c, i) => (
              <button
                key={i}
                type="button"
                onClick={() => (c.kind === 'tabla' ? onOpenEntry() : edit(i))}
                aria-label={`Juego ${i + 1}${c.kind === 'vacio' ? ': anotar' : `: ${c.score}`}${tileBalls[i] ? `, bola ${ballLabel(tileBalls[i])}` : ''}`}
                className={cx(
                  'flex min-h-[4.5rem] flex-col items-center justify-center gap-0.5 rounded-xl border px-1 py-2 transition active:scale-95',
                  c.kind === 'tabla' &&
                    (c.counted ? (hasMark(marks?.[i]) ? 'border-accent/50 bg-accent-soft/60' : 'border-ok/40 bg-ok-soft/50') : 'border-line bg-surface-2'),
                  c.kind === 'telefono' && 'border-accent/50 bg-accent-soft/50',
                  c.kind === 'enviado' && 'border-warn/40 bg-warn-soft/40',
                  c.kind === 'vacio' && 'border-dashed border-line text-muted hover:border-accent hover:text-accent',
                )}
              >
                <span className="flex items-center gap-0.5 text-[11px] font-medium text-muted">
                  J{i + 1}
                  {/* Con qué bola lo tiró: solo se ve (se cambia al abrir el juego). */}
                  {tileBalls[i] && <BallArt ball={tileBalls[i]} size={18} className="shrink-0" />}
                </span>
                {c.kind === 'vacio' ? (
                  <Plus className="size-5" />
                ) : (
                  <span className="text-lg leading-none font-bold tabular-nums">{c.score}</span>
                )}
                <span className="flex items-center gap-0.5 text-[10px] text-muted">
                  {c.kind === 'tabla' ? (
                    c.counted && hasMark(marks?.[i]) ? (
                      <span className="flex items-center gap-0.5 font-medium text-accent">
                        <MarkIcon mark={marks?.[i]} /> {marks![i]!.record ? 'Récord' : `+${marks![i]!.over}`}
                      </span>
                    ) : c.counted ? (
                      <>
                        <CheckCircle2 className="size-3 text-ok" /> En la tabla
                      </>
                    ) : (
                      'Sin verificar'
                    )
                  ) : c.kind === 'telefono' ? (
                    <>
                      <Smartphone className="size-3 text-accent" /> Guardado
                    </>
                  ) : c.kind === 'enviado' ? (
                    <>
                      <Clock className="size-3 text-warn" /> Enviado
                    </>
                  ) : (
                    'Anotar'
                  )}
                </span>
              </button>
            ))}
            {canAddGame && (
              <button
                type="button"
                onClick={addGame}
                disabled={adding}
                aria-busy={adding || undefined}
                data-tour="otro-juego"
                aria-label="Agregar otro juego a la sesión"
                className="flex min-h-[4.5rem] flex-col items-center justify-center gap-0.5 rounded-xl border border-dashed border-line px-1 py-2 text-muted transition hover:border-accent hover:text-accent active:scale-95 disabled:opacity-50"
              >
                <BusyIcon busy={adding} icon={<Plus className="size-5" />} className="size-5" />
                <span className="text-[10px]">Otro juego</span>
              </button>
            )}
          </div>

          <MarksLine marks={marks} />

          {average != null && (
            <div className="flex items-baseline justify-between rounded-xl bg-surface-2 px-3 py-2">
              <span className="text-sm text-muted">
                {known.length === count ? 'Promedio de la sesión' : `Promedio (${known.length} de ${count})`}
              </span>
              <span className="text-sm text-muted tabular-nums">
                Serie <b className="text-fg">{series}</b> · <b className="text-lg text-fg">{average}</b>
              </span>
            </div>
          )}

          {pending.length > 0 && inPhone === 0 && (
            <p className="flex items-center gap-1.5 rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">
              <Clock className="size-4 shrink-0" /> Enviado. El admin lo revisa y lo pone en la tabla.
            </p>
          )}
          {!pending.length && last?.status === 'rechazado' && inPhone === 0 && !allInTable && (
            <p className="flex items-start gap-1.5 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
              <XCircle className="mt-0.5 size-4 shrink-0" />
              <span>
                El admin no aceptó tu envío{last.note ? `: ${last.note}` : '.'} Anota de nuevo y vuelve a enviarlo.
              </span>
            </p>
          )}

          {allInTable ? (
            <p className="flex items-center gap-1.5 text-sm text-ok">
              <CheckCircle2 className="size-4" /> Tus juegos ya están en la tabla.
            </p>
          ) : inPhone > 0 ? (
            <>
              <div className="flex gap-2">
                {nextEmpty >= 0 && (
                  <Button icon={<PencilLine className="size-4" />} onClick={() => edit(nextEmpty)}>
                    Juego {nextEmpty + 1}
                  </Button>
                )}
                <Button variant="primary" className="flex-1" icon={<Send className="size-4" />} onClick={onSend} data-tour="enviar">
                  Enviar a revisión ({inPhone})
                </Button>
              </div>
              <p className="text-xs text-muted">
                Se guardan en este teléfono hasta que los envíes. La foto del marcador es opcional: sirve para que el admin lo verifique.
              </p>
            </>
          ) : nextEmpty >= 0 ? (
            <>
              <Button variant="primary" icon={<PencilLine className="size-4" />} onClick={() => edit(nextEmpty)} data-tour="anotar">
                Anotar juego {nextEmpty + 1}
              </Button>
              <button type="button" onClick={onSend} className="flex items-center justify-center gap-1.5 text-xs font-medium text-muted hover:text-fg">
                <Camera className="size-3.5" /> O sube la foto del marcador y se leen solos
              </button>
            </>
          ) : (
            // Todo enviado (o parte en la tabla): la foto del marcador sirve para que el admin lo verifique.
            <Button icon={<Camera className="size-4" />} onClick={onSend}>
              Subir la foto del marcador
            </Button>
          )}
        </>
      )}

      {/* La bola de este juego va arriba del editor (en las tres formas de anotar) en cuanto se sabe la lista de bolas,
          aunque no tenga ninguna («Agregar»). Si el juego se abrió antes de leerla (desde "En juego ahora"), sale al leerla
          y arranca con la última que usó. Se vuelve a montar con cada juego. */}
      <ScoreEntryModal
        open={editing != null}
        onClose={() => {
          setEditing(null);
          setMode(preferredMode());
        }}
        title={editing != null ? `Juego ${editing + 1}` : ''}
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
        note={
          <div className="flex items-center gap-2 text-xs text-muted">
            <Smartphone className="size-4 shrink-0" />
            <span className="flex-1">Se guarda en tu teléfono. Al terminar, envíalo a revisión.</span>
            {editingCell?.kind === 'telefono' && (
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
                Borrar
              </Button>
            )}
          </div>
        }
      />
    </Card>
  );
}
