import { useCallback, useId, useRef, useState } from 'react';
import { CloudUpload, Grid3x3, Loader2, Plus, Target, Trash2 } from 'lucide-react';
import {
  SOLO_MAX_GAMES,
  SOLO_MAX_YEARS,
  SOLO_NOTE_MAX,
  SOLO_VENUE_MAX,
  deleteSoloSession,
  saveSoloSession,
  soloErrorText,
  soloMinDate,
  type SoloSession,
} from '../../lib/data/solo';
import { ballsByGame, ballsChanged, commonBall, compactBalls, keepBalls, knownBalls, lastBall, sameBall, type GameBall } from '../../lib/balls';
import { queuedGameBalls, rememberBall, useMyBallGames } from '../../lib/data/balls';
import { getUserId } from '../../lib/data/client';
import { uuidv7 } from '../../lib/db/ids';
import { isValidScore } from '../../lib/stats';
import type { GameFrames } from '../../lib/types';
import { AllGamesBall, GameBallChip, GameBallSelect, useBallChoice } from '../balls/BallPicker';
import { useFeedback } from '../feedback';
import { clearGameDraft, clearGameDrafts, gameKey, soloPlace } from '../frames/draftMemory';
import { framesMode, type ScoreValue } from '../frames/FrameEditor';
import { ScoreEntryModal } from '../frames/ScoreEntryModal';
import { Button, Field, Input, Sheet, Textarea, cx } from '../ui';

/** Casillas con las que arranca uno nuevo (una serie de 3). */
const NEW_SLOTS = 3;

/** Lo que dicen las casillas: los juegos válidos en orden (sin huecos), sus cuadros y si alguna está mal. */
export function slotsToGames(values: readonly string[], frames: Readonly<Record<number, GameFrames>>) {
  const scores: number[] = [];
  const out: Record<string, GameFrames> = {};
  let invalid = false;
  values.forEach((v, i) => {
    if (!v.trim()) return;
    const n = Number(v);
    if (!isValidScore(n)) {
      invalid = true;
      return;
    }
    if (frames[i]) out[String(scores.length)] = frames[i];
    scores.push(n);
  });
  return { scores, frames: Object.keys(out).length ? out : null, invalid };
}

/** Las casillas de un juego que ya existe (sus juegos y cuadros; al menos 3). */
function initialSlots(session: SoloSession | null): { values: string[]; frames: Record<number, GameFrames> } {
  if (!session) return { values: Array.from({ length: NEW_SLOTS }, () => ''), frames: {} };
  const values = session.scores.map(String);
  while (values.length < Math.min(NEW_SLOTS, SOLO_MAX_GAMES)) values.push('');
  const frames: Record<number, GameFrames> = {};
  for (const [k, f] of Object.entries(session.frames ?? {})) frames[Number(k)] = f;
  return { values, frames };
}

/** Una casilla como juego para la hoja de cuadros: el total (si es válido) y sus cuadros. */
function slotGame(slots: { values: readonly string[]; frames: Readonly<Record<number, GameFrames>> }, i: number | null): ScoreValue {
  const v = i != null ? (slots.values[i]?.trim() ?? '') : '';
  return { score: v && isValidScore(Number(v)) ? Number(v) : null, frames: i != null ? (slots.frames[i] ?? null) : null };
}

/** Lo que dice la fecha cuando no sirve (vacía, del futuro o de hace más de 10 años). */
const DATE_HINT = `Elige la fecha (de hoy hacia atrás, hasta ${SOLO_MAX_YEARS} años).`;

/** Lo que se edita en la hoja. */
export interface SoloSheetValues {
  date: string;
  venue: string;
  note: string;
  shared: boolean;
  slots: { values: string[]; frames: Record<number, GameFrames> };
}

/** ¿Cambió algo desde que se abrió? (Cerrarla así pregunta antes: se perderían los juegos anotados.) */
export function soloSheetChanged(a: SoloSheetValues, b: SoloSheetValues): boolean {
  return (
    a.date !== b.date ||
    a.venue !== b.venue ||
    a.note !== b.note ||
    a.shared !== b.shared ||
    JSON.stringify(a.slots.values) !== JSON.stringify(b.slots.values) ||
    JSON.stringify(a.slots.frames) !== JSON.stringify(b.slots.frames)
  );
}

/**
 * Hoja para anotar o cambiar un juego suelto: la fecha (hoy si es nuevo), la bolera (con las que ya puso), de 1 a 10
 * juegos (el total o, con «cuadros», tiro por tiro), una nota y si sale en el perfil. «Guardar» se puede tocar con al
 * menos un juego válido; va por la cola (sin señal queda en el teléfono y sale solo). «Borrar» pregunta antes, y
 * cerrarla con algo cambiado (el fondo, la X o Esc) también.
 *
 * Se monta abierta (la página la quita al cerrar): cada vez empieza de lo guardado. Uno nuevo tiene su id desde que
 * se abre: tocar «Guardar» otra vez (p. ej. después de que el servidor dijo que no) reemplaza lo que no salió en la
 * cola en lugar de crear otro.
 */
export function SoloGameSheet({
  session,
  venues,
  today,
  onClose,
}: {
  /** null = uno nuevo. */
  session: SoloSession | null;
  /** Boleras que ya puso (para sugerir). */
  venues: readonly string[];
  /** YYYY-MM-DD. */
  today: string;
  onClose: () => void;
}) {
  const { toast, confirm } = useFeedback();
  const listId = useId();
  // Cómo empezó (para saber si hay algo sin guardar) y el id con el que se guarda (el suyo, o uno nuevo desde ya).
  const [start] = useState<SoloSheetValues & { id: string }>(() => ({
    id: session?.id ?? uuidv7(),
    date: session?.playedOn ?? today,
    venue: session?.venue ?? '',
    note: session?.note ?? '',
    shared: session?.shared ?? true,
    slots: initialSlots(session),
  }));
  const [date, setDate] = useState(start.date);
  const [venue, setVenue] = useState(start.venue);
  const [note, setNote] = useState(start.note);
  const [shared, setShared] = useState(start.shared);
  const [slots, setSlots] = useState(start.slots);
  const [framesFor, setFramesFor] = useState<number | null>(null);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  // Con qué bola tiró cada juego (son sus juegos: sale aunque la cuenta no tenga bolas, con «Agregar bola»). `picked`: lo
  // que eligió por juego; `bulk`: la de «todos los juegos» (también para los que agregue después); si no, la que ya tenía
  // el juego y, en uno nuevo, la última que usó.
  const choice = useBallChoice();
  const tagged = useMyBallGames(session?.id ?? null, !!session && choice.balls.length > 0);
  // Las que ya tenía: las del servidor (null si no se pudieron leer; ninguna si la cuenta no tiene bolas) con lo que está
  // en la cola encima (guardado sin señal). null = no se sabe: la bola no sale y al guardar solo se dice cómo se movieron
  // los juegos (el servidor les pasa las que tenían). Si la cuenta no tenía bolas al abrir, sus juegos no tenían ninguna:
  // al agregar la primera aquí no pasa a «no se sabe» mientras se leen (se perdería la que eligió).
  const serverHad = !session
    ? {}
    : choice.balls.length
      ? !tagged.loading && !tagged.error
        ? ballsByGame(tagged.data, 'solo', session.id)
        : choice.noBallsAtStart
          ? {}
          : null
      : choice.loaded
        ? {}
        : null;
  const queued = session ? queuedGameBalls('solo', session.id) : null;
  const known = session ? knownBalls(session.scores.length, serverHad, queued) : {};
  const ballsReady = known != null;
  const showBalls = choice.canPick && ballsReady;
  // No se pudieron leer las bolas de estos juegos (sin señal): no se cambian y se dice por qué.
  const ballsUnread = choice.canPick && !ballsReady && !!tagged.error;
  const [picked, setPicked] = useState<Record<number, string | null>>({});
  const [bulk, setBulk] = useState<string | null | undefined>(undefined);
  const ballPick = useRef<string | null>(null);
  // Eligió la bola de un juego o la de todos (la de todos reemplaza la que eligió en cada uno). Siempre la misma
  // función: los botones de las bolas no se vuelven a dibujar con cada tecla.
  const pickBall = useCallback((game: number | 'all', id: string | null) => {
    if (game === 'all') {
      setBulk(id);
      setPicked({});
    } else setPicked((p) => ({ ...p, [game]: id }));
  }, []);

  const { values, frames } = slots;
  const games = slotsToGames(values, frames);
  const minDate = soloMinDate(today);
  const dateOk = !!date && date >= minDate && date <= today;
  const canSave = games.scores.length > 0 && !games.invalid && dateOk && !busy;
  const series = games.scores.reduce((a, b) => a + b, 0);
  const dirty = soloSheetChanged(start, { date, venue, note, shared, slots }) || Object.keys(picked).length > 0 || bulk !== undefined;
  const had = known ?? {};
  const auto = session ? commonBall(Object.values(had)) : choice.auto;
  const ballOf = (i: number): string | null =>
    i in picked ? picked[i] : bulk !== undefined ? bulk : i in had ? had[i] : session && i < session.scores.length ? null : auto;
  const scored = values.flatMap((v, i) => (v.trim() ? [i] : []));
  // La bola de «todos los juegos» (undefined: los juegos tienen bolas distintas).
  const allBall = sameBall((scored.length ? scored : values.map((_, i) => i)).map(ballOf));
  // El botón de cada juego abre por cuadros o pino por pino (la forma preferida; el total se escribe en la casilla).
  const byPins = framesMode() === 'pines';
  // Lo que va anotando por cuadros queda en el teléfono (por cuenta, juego suelto y casilla) aunque cierre esa hoja sin
  // «Listo» y también después de «Listo», que solo lo pasa a la casilla: hasta «Guardar», «Borrar» o «Salir». Uno nuevo
  // usa «nuevo»: así lo encuentra también después de cerrar la app.
  const memoryBase = soloPlace(getUserId(), session?.id);
  const forgetGames = () => clearGameDrafts(memoryBase);

  /** Cerrar sin guardar: si cambió algo, pregunta antes (se perderían los juegos anotados, también lo de la memoria). */
  async function close() {
    if (dirty && !busy) {
      const ok = await confirm({
        title: '¿Salir sin guardar?',
        message: 'Se pierde lo que anotaste en este juego.',
        confirmText: 'Salir',
        danger: true,
      });
      if (!ok) return;
      forgetGames();
    }
    onClose();
  }

  function setValue(i: number, v: string) {
    // Si cambia el total a mano, los cuadros de ese juego ya no valen (tampoco lo que quedó a medias en la hoja).
    clearGameDraft(gameKey(memoryBase, i));
    setSlots((s) => {
      const nextFrames = { ...s.frames };
      delete nextFrames[i];
      return { values: s.values.map((x, j) => (j === i ? v : x)), frames: nextFrames };
    });
  }

  function addSlot() {
    setSlots((s) => (s.values.length >= SOLO_MAX_GAMES ? s : { ...s, values: [...s.values, ''] }));
  }

  async function save() {
    if (!canSave) return;
    setBusy('save');
    try {
      const balls = ballsToSave();
      await saveSoloSession({ id: start.id, playedOn: date, venue, note, scores: games.scores, frames: games.frames, shared, balls }, today);
      // La próxima vez se pone sola la última que eligió: en uno nuevo, la de sus juegos; en uno viejo, solo si la cambió.
      const changed = Object.keys(picked)
        .map(Number)
        .sort((a, b) => a - b)
        .flatMap((i) => (picked[i] !== (had[i] ?? null) ? [picked[i]] : []));
      rememberBall(lastBall(!session ? Object.values(balls ?? {}) : bulk !== undefined ? [bulk] : changed));
      forgetGames();
      toast(session ? 'Juego guardado' : 'Juego anotado');
      onClose();
    } catch (e) {
      toast(soloErrorText(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  /**
   * Las bolas de cada juego al guardar (sin los huecos, como los juegos), o undefined si no hay nada que mandar: ninguna
   * antes ni ahora, o las mismas (así un juego viejo no pasa a ser «la última que usé»). Si hay unas en la cola, van
   * siempre (detrás de este guardado). Sin saber las que tenía (sin señal), solo cómo se movieron los juegos.
   */
  function ballsToSave(): Record<string, GameBall> | undefined {
    if (!session) {
      const out = compactBalls(values, Object.fromEntries(values.map((_, i) => [i, ballOf(i)])));
      return Object.values(out).some(Boolean) ? out : undefined;
    }
    if (known == null) return keepBalls(values, session.scores.length) ?? undefined;
    const out = compactBalls(values, Object.fromEntries(values.map((_, i) => [i, ballOf(i)])));
    return queued || ballsChanged(out, known) ? out : undefined;
  }

  async function remove() {
    if (!session || busy) return;
    const ok = await confirm({
      title: '¿Borrar este juego suelto?',
      message: 'Se borran sus juegos y sus me gusta. No se puede deshacer.',
      confirmText: 'Borrar',
      danger: true,
    });
    if (!ok) return;
    setBusy('delete');
    try {
      await deleteSoloSession(session);
      forgetGames();
      toast('Juego borrado');
      onClose();
    } catch (e) {
      toast(soloErrorText(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Sheet
        open
        onClose={() => void close()}
        title={session ? 'Juego suelto' : 'Anotar juego suelto'}
        subtitle="Boliche sin liga ni torneo"
        footer={
          <div className="flex items-center gap-2">
            {session && (
              <button
                type="button"
                disabled={!!busy}
                aria-busy={busy === 'delete' || undefined}
                onClick={() => void remove()}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium text-danger transition select-none hover:bg-danger-soft active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50"
              >
                {busy === 'delete' ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Trash2 className="size-4" aria-hidden="true" />}
                Borrar
              </button>
            )}
            <Button variant="primary" className="h-11 flex-1" loading={busy === 'save'} disabled={!canSave} onClick={() => void save()}>
              Guardar
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {session?.pending && (
            <p className="flex items-start gap-2 rounded-xl bg-accent-soft px-3 py-2.5 text-sm text-accent">
              <CloudUpload className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> Guardado en este teléfono: sale solo cuando haya señal.
            </p>
          )}

          <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
            <Field label="Fecha" hint={dateOk ? undefined : <span className="text-danger">{DATE_HINT}</span>}>
              <Input type="date" required min={minDate} max={today} value={date} onChange={(e) => setDate(e.target.value)} className="h-11" />
            </Field>
            <Field label="Bolera">
              <Input
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
                maxLength={SOLO_VENUE_MAX}
                list={venues.length ? listId : undefined}
                placeholder="Dónde jugaste"
                autoComplete="off"
                className="h-11"
              />
            </Field>
            {venues.length > 0 && (
              <datalist id={listId}>
                {venues.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            )}
          </div>

          {showBalls ? (
            <AllGamesBall balls={choice.balls} value={allBall} onPick={pickBall} today={today} />
          ) : (
            ballsUnread && (
              <p className="text-xs text-muted">Sin señal no se ven las bolas de estos juegos (se quedan como estaban). Ábrelo con señal para cambiarlas.</p>
            )
          )}

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted">Tus juegos</span>
            <div className="flex flex-wrap gap-2">
              {values.map((v, i) => {
                const bad = !!v.trim() && !isValidScore(Number(v));
                return (
                  <div key={i} className="flex w-16 flex-col items-center gap-0.5">
                    <span className="text-[11px] text-muted">J{i + 1}</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={300}
                      value={v}
                      aria-label={`Juego ${i + 1}`}
                      aria-invalid={bad || undefined}
                      onChange={(e) => setValue(i, e.target.value)}
                      className={cx(
                        'h-11 w-full rounded-lg border bg-surface text-center text-base font-semibold tabular-nums',
                        bad ? 'border-danger text-danger' : frames[i] ? 'border-accent' : 'border-line',
                      )}
                    />
                    {/* La bola de este juego (también al escribir solo el total). */}
                    {showBalls && <GameBallChip game={i} balls={choice.balls} value={ballOf(i)} onPick={pickBall} today={today} className="mt-0.5" />}
                    <button
                      type="button"
                      onClick={() => setFramesFor(i)}
                      aria-label={`Anotar el juego ${i + 1} ${byPins ? 'pino por pino' : 'por cuadros'}`}
                      className={cx(
                        'flex min-h-11 w-full items-center justify-center gap-0.5 rounded-lg text-[11px] font-medium',
                        frames[i] ? 'text-accent' : 'text-muted hover:text-fg',
                      )}
                    >
                      {byPins ? <Target className="size-3" aria-hidden="true" /> : <Grid3x3 className="size-3" aria-hidden="true" />}
                      {byPins ? 'pines' : 'cuadros'}
                    </button>
                  </div>
                );
              })}
              {values.length < SOLO_MAX_GAMES && (
                <button
                  type="button"
                  onClick={addSlot}
                  aria-label="Agregar otro juego"
                  className="mt-[1.1rem] flex h-11 items-center gap-1 rounded-lg border border-dashed border-line px-3 text-sm font-medium text-muted hover:text-fg"
                >
                  <Plus className="size-4" aria-hidden="true" /> Juego
                </button>
              )}
            </div>
            {/* Lo que falta para «Guardar» (también la fecha: su aviso queda arriba, fuera de la vista al anotar). */}
            <span className={cx('text-xs', games.invalid || (games.scores.length > 0 && !dateOk) ? 'text-danger' : 'text-muted')} aria-live="polite">
              {games.invalid
                ? 'Cada juego va de 0 a 300.'
                : !games.scores.length
                  ? byPins
                    ? 'Anota al menos un juego. Toca «pines» para anotarlo pino por pino.'
                    : 'Anota al menos un juego. Toca «cuadros» para anotarlo tiro por tiro.'
                  : !dateOk
                    ? DATE_HINT
                    : `${games.scores.length} ${games.scores.length === 1 ? 'juego' : 'juegos'} · serie ${series} · promedio ${Math.floor(series / games.scores.length)}`}
            </span>
          </div>

          <Field label="Nota (opcional)">
            <Textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={SOLO_NOTE_MAX}
              placeholder="Con quién jugaste, cómo te fue…"
            />
          </Field>

          <SharedSwitch value={shared} onChange={setShared} />
        </div>
      </Sheet>

      {/* Afuera de la hoja: Esc en el editor de cuadros no cierra también la hoja. */}
      <ScoreEntryModal
        open={framesFor != null}
        onClose={() => setFramesFor(null)}
        title={`Juego ${(framesFor ?? 0) + 1}`}
        resetKey={String(framesFor)}
        memoryKey={framesFor != null ? gameKey(memoryBase, framesFor) : undefined}
        stored={slotGame(start.slots, framesFor)}
        startMode={framesMode()}
        top={
          showBalls && framesFor != null ? (
            <GameBallSelect key={framesFor} balls={choice.balls} initial={ballOf(framesFor)} choice={ballPick} game={framesFor} today={today} />
          ) : undefined
        }
        initial={slotGame(slots, framesFor)}
        saveText="Listo"
        onSave={(v) => {
          if (framesFor == null) return;
          const i = framesFor;
          setSlots((s) => {
            const nextFrames = { ...s.frames };
            if (v.frames) nextFrames[i] = v.frames;
            else delete nextFrames[i];
            return { values: s.values.map((x, j) => (j === i ? (v.score == null ? '' : String(v.score)) : x)), frames: nextFrames };
          });
          if (showBalls) setPicked((p) => ({ ...p, [i]: ballPick.current }));
          setFramesFor(null);
        }}
      />
    </>
  );
}

/** «Que salga en mi perfil»: el interruptor y lo que significa. */
function SharedSwitch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const labelId = useId();
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line p-3">
      <div className="min-w-0 flex-1 text-sm">
        <span id={labelId} className="block font-medium">
          Que salga en mi perfil
        </span>
        <span className="block text-muted">{value ? 'Lo ven quienes ven tu perfil y te siguen.' : 'Solo lo ves tú (igual cuenta en tu promedio).'}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-labelledby={labelId}
        onClick={() => onChange(!value)}
        className="flex h-11 w-14 shrink-0 items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {/* Apagado: la pista en gris oscuro (muted), que se ve contra la hoja en claro y en oscuro. */}
        <span className={cx('flex h-7 w-12 items-center rounded-full p-0.5 transition-colors', value ? 'bg-accent' : 'bg-muted')}>
          <span className={cx('size-6 rounded-full bg-surface shadow-sm transition-transform', value && 'translate-x-5')} />
        </span>
      </button>
    </div>
  );
}
