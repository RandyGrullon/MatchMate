import { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, Clock, Grid3x3, PencilLine, Plus, Send, SlidersHorizontal, Smartphone, Target, Trash2, XCircle } from 'lucide-react';
import { addEventGame } from '../../lib/data';
import { saveDraft, useDraft } from '../../lib/draft';
import { useLeagueCtx } from '../../lib/league';
import type { LiveInfo } from '../../lib/live';
import { slots } from '../../lib/stats';
import type { BowlingEvent, Entry, Submission } from '../../lib/types';
import { useFeedback } from '../feedback';
import { preferredMode, setPreferredMode, type ScoreMode, type ScoreValue } from '../frames/FrameEditor';
import { ScoreEntryModal } from '../frames/ScoreEntryModal';
import { Badge, Button, Card, cx } from '../ui';

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
}) {
  const { lid } = useLeagueCtx();
  const { toast, confirm } = useFeedback();
  const draft = useDraft(lid, playerId, event.id);
  const [editing, setEditing] = useState<number | null>(null);
  const [mode, setMode] = useState<ScoreMode>(preferredMode);
  const [adding, setAdding] = useState(false);

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
  // Solo en la práctica de hoy (no en una vieja ni en una que todavía no llega).
  const canAddGame = event.type === 'practica' && event.date === today && event.games < 10 && count === event.games;

  async function addGame() {
    const n = event.games + 1;
    const ok = await confirm({
      title: `¿Agregar el juego ${n}?`,
      message: 'Si siguieron jugando, la práctica de hoy pasa a tener un juego más (para todos).',
      confirmText: 'Agregar juego',
    });
    if (!ok) return;
    setAdding(true);
    const added = addEventGame(lid, event);
    added.catch((e) => {
      console.error(e);
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
  const notYet = event.date > today;

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

  function save(i: number, v: ScoreValue | null) {
    const values = Array.from({ length: count }, (_, j) => draft?.values[j] ?? '');
    values[i] = v?.score == null ? '' : String(v.score);
    const frames = { ...(draft?.frames ?? {}) };
    if (v?.frames && v.score != null) frames[i] = v.frames;
    else delete frames[i];
    saveDraft(lid, playerId, event.id, { values, frames });
    setEditing(null);
    setMode(preferredMode());
    toast(v ? `Juego ${i + 1} guardado en tu teléfono` : `Juego ${i + 1} borrado`);
  }

  // Desde "En juego ahora": abre directo el próximo juego por anotar.
  const started = useRef(false);
  useEffect(() => {
    if (!autoStart || started.current) return;
    started.current = true;
    onAutoStarted();
    const first = cells.findIndex((c) => c.kind === 'vacio');
    if (!notYet && first >= 0) edit(first);
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
                      'flex items-center justify-center gap-1 rounded-md py-1.5 font-medium transition',
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
                aria-label={`Juego ${i + 1}${c.kind === 'vacio' ? ': anotar' : `: ${c.score}`}`}
                className={cx(
                  'flex min-h-[4.5rem] flex-col items-center justify-center gap-0.5 rounded-xl border px-1 py-2 transition active:scale-95',
                  c.kind === 'tabla' && (c.counted ? 'border-ok/40 bg-ok-soft/50' : 'border-line bg-surface-2'),
                  c.kind === 'telefono' && 'border-accent/50 bg-accent-soft/50',
                  c.kind === 'enviado' && 'border-warn/40 bg-warn-soft/40',
                  c.kind === 'vacio' && 'border-dashed border-line text-muted hover:border-accent hover:text-accent',
                )}
              >
                <span className="text-[11px] font-medium text-muted">J{i + 1}</span>
                {c.kind === 'vacio' ? (
                  <Plus className="size-5" />
                ) : (
                  <span className="text-lg leading-none font-bold tabular-nums">{c.score}</span>
                )}
                <span className="flex items-center gap-0.5 text-[10px] text-muted">
                  {c.kind === 'tabla' ? (
                    c.counted ? (
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
                data-tour="otro-juego"
                aria-label="Agregar otro juego a la sesión"
                className="flex min-h-[4.5rem] flex-col items-center justify-center gap-0.5 rounded-xl border border-dashed border-line px-1 py-2 text-muted transition hover:border-accent hover:text-accent active:scale-95 disabled:opacity-50"
              >
                <Plus className="size-5" />
                <span className="text-[10px]">Otro juego</span>
              </button>
            )}
          </div>

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

      <ScoreEntryModal
        open={editing != null}
        onClose={() => {
          setEditing(null);
          setMode(preferredMode());
        }}
        title={editing != null ? `Juego ${editing + 1}` : ''}
        resetKey={String(editing)}
        initial={initial}
        saveText="Guardar"
        onSave={(v) => save(editing!, v)}
        note={
          <div className="flex items-center gap-2 text-xs text-muted">
            <Smartphone className="size-4 shrink-0" />
            <span className="flex-1">Se guarda en tu teléfono. Al terminar, envíalo a revisión.</span>
            {editingCell?.kind === 'telefono' && (
              <Button variant="ghost" size="sm" className="text-danger" icon={<Trash2 className="size-4" />} onClick={() => save(editing!, null)}>
                Borrar
              </Button>
            )}
          </div>
        }
      />
    </Card>
  );
}
