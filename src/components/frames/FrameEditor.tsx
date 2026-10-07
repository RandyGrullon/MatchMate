import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Eraser, Hash, Keyboard, Minus, Plus, SlidersHorizontal, Target, Undo2 } from 'lucide-react';
import { bitCount, maxPossibleScore, maxPossibleWithHole, replaceRoll, scoreGame, standingMask, standingNow } from '../../lib/bowling';
import { isValidScore } from '../../lib/stats';
import type { GameFrames } from '../../lib/types';
import { cx } from '../ui';
import { FramesSheet } from './FramesGrid';
import { PinDeck } from './PinDeck';

export interface ScoreValue {
  score: number | null;
  /** Tiros del juego si se anotó por cuadros. */
  frames: GameFrames | null;
}

export type ScoreMode = 'pines' | 'teclado' | 'total';
type Mode = ScoreMode;

/**
 * Lo que hay en el editor, para seguir después donde se dejó (ver draftMemory): la forma de anotar, los tiros (aunque esté
 * mirando «Total»), el total escrito (aunque haya vuelto a los tiros) y el tiro vacío que falta escribir al corregir.
 */
export interface EditorWork {
  mode: ScoreMode;
  rolls: number[];
  masks: (number | null)[];
  total: string;
  /** Teclado: el tiro que quedó vacío esperando el valor ('borrado' o 'falta', como `hole` del editor). */
  hole: { roll: number; kind: 'borrado' | 'falta' } | null;
}

/** Las piezas del editor para armar la hoja de anotar (ScoreEntryModal las pone en su encabezado, su cuerpo y su pie). */
export interface EditorParts {
  /** «Teclado ▾»: elegir la forma de anotar (y «Empezar de nuevo»). */
  modeMenu: ReactNode;
  /** El progreso, la hoja de cuadros, lo que llevas y el teclado (o los pines, o el total). */
  body: ReactNode;
  /** «Deshacer» (al corregir: «Listo» o «Dejar como estaba»); null en «Total». */
  undo: ReactNode;
  /** Lo que se guardaría ahora (`ready`: el juego está completo, o el total es válido). */
  value: ScoreValue & { ready: boolean };
  mode: ScoreMode;
}

const MODE_KEY = 'mm:modo-anotar';

function savedMode(): Mode | null {
  try {
    const m = localStorage.getItem(MODE_KEY);
    return m === 'pines' || m === 'teclado' || m === 'total' ? m : null;
  } catch {
    return null;
  }
}

/** La forma de anotar que eligió el jugador (la próxima vez se abre así). */
export const preferredMode = (): ScoreMode => savedMode() ?? 'teclado';

/**
 * Cómo se abre el editor desde el botón de cuadros junto a una casilla del total (ahí el total ya se escribe a mano):
 * pines si es la preferida y, si no, teclado.
 */
export const framesMode = (): Exclude<ScoreMode, 'total'> => (savedMode() === 'pines' ? 'pines' : 'teclado');
export function setPreferredMode(m: ScoreMode) {
  try {
    localStorage.setItem(MODE_KEY, m);
  } catch {
    // sin almacenamiento
  }
}

/**
 * Lo que el editor devuelve en cada cambio. Por cuadros sin ningún tiro, un juego que ya tenía solo el total se queda con
 * ese total (listo para guardar): así se abre «cuadros» para cambiar otra cosa (la bola) sin anotar los tiros ni pasar a
 * Total.
 */
export function editorValue(
  mode: ScoreMode,
  st: { rolls: readonly number[]; masks: readonly (number | null)[]; total: string; hole: boolean },
  initial: ScoreValue,
): ScoreValue & { ready: boolean } {
  if (mode === 'total') {
    const n = st.total.trim() === '' ? null : Number(st.total);
    return { score: n, frames: null, ready: n != null && isValidScore(n) };
  }
  if (!st.rolls.length && initial.score != null && !initial.frames?.rolls?.length) {
    return { score: initial.score, frames: null, ready: isValidScore(initial.score) };
  }
  const game = scoreGame(st.rolls);
  const withMasks = st.masks.some((m) => m != null);
  return {
    score: game.complete ? game.score : null,
    frames: st.rolls.length ? { rolls: [...st.rolls], ...(withMasks ? { masks: [...st.masks] } : {}) } : null,
    // Con un tiro borrado sin volver a escribir, el juego no está listo.
    ready: game.complete && !st.hole,
  };
}

/** Con qué arranca el editor: lo que quedó sin guardar (`resume`) o el juego guardado (`initial`). */
function startState(initial: ScoreValue, startMode: ScoreMode | undefined, resume: EditorWork | null | undefined) {
  const mode: Mode = resume
    ? resume.mode
    : initial.frames?.rolls?.length
      ? initial.frames.masks?.some((m) => m != null)
        ? 'pines'
        : 'teclado'
      : (startMode ?? (initial.score != null ? 'total' : (savedMode() ?? 'teclado')));
  const rolls = resume?.rolls ?? initial.frames?.rolls ?? [];
  // Al seguir donde se dejó, el tiro que faltaba sigue faltando (no se guarda el 0 de mientras como si fuera el tiro).
  const hole = resume?.mode === 'teclado' ? resume.hole : null;
  return {
    mode,
    rolls,
    masks: resume?.masks ?? initial.frames?.masks ?? initial.frames?.rolls?.map(() => null) ?? [],
    total: resume?.total ?? (initial.score != null ? String(initial.score) : ''),
    sel: hole?.roll ?? null,
    hole: hole?.kind ?? null,
  };
}

/** Las formas de anotar del menú «Teclado ▾». */
const MODES: readonly { key: ScoreMode; label: string; hint: string; icon: typeof Target }[] = [
  { key: 'pines', label: 'Pines', hint: 'Tocas los pinos que cayeron', icon: Target },
  { key: 'teclado', label: 'Teclado', hint: 'Cada tiro: X, / o el número', icon: Keyboard },
  { key: 'total', label: 'Total', hint: 'Solo el puntaje final', icon: SlidersHorizontal },
];

const pinos = (n: number) => (n === 1 ? '1 pino' : `${n} pinos`);

/**
 * Anotar un juego de 3 formas (se elige en «Teclado ▾», que recuerda la última):
 * - Pines: se tocan los pines que cayeron en cada tiro y la hoja se calcula sola.
 * - Teclado: se escribe cada tiro (X Strike, / Spare, 0 Fallo y los números); solo se encienden las teclas que valen (tras
 *   un 9 solo 0 o spare). Se toca un cuadro de la hoja para corregir ese tiro y se deja presionado para borrarlo.
 * - Total: solo el puntaje final, con la barra o escribiéndolo.
 *
 * Sin `children` se dibuja todo junto (el menú, la hoja y «Deshacer»); con `children` quien lo usa arma la pantalla con las
 * piezas (ScoreEntryModal: el menú en el encabezado y «Deshacer» junto a «Guardar»). `resetToken` vuelve a empezar (otro
 * juego, o se descartó lo de la memoria) sin desmontar lo de alrededor (la bola elegida arriba no se pierde).
 */
export function FrameEditor({
  initial,
  onChange,
  startMode,
  resume,
  resetToken,
  phoneSaved,
  children,
}: {
  initial: ScoreValue;
  /** Cada cambio: lo que se guardaría y lo que hay en el editor (para recordarlo). */
  onChange: (v: ScoreValue & { ready: boolean }, work: EditorWork) => void;
  /** Con qué forma abrir si el juego no tiene cuadros (p. ej. el botón «cuadros» abre por cuadros aunque haya total). */
  startMode?: ScoreMode;
  /** Seguir donde se dejó (lo que quedó sin guardar) en lugar de arrancar de `initial`. */
  resume?: EditorWork | null;
  /** Al cambiar, el editor vuelve a arrancar de `initial` / `resume`. */
  resetToken?: string;
  /** Lo anotado ya quedó en el teléfono («✓ Guardado en tu teléfono» junto al progreso). */
  phoneSaved?: boolean;
  children?: (parts: EditorParts) => ReactNode;
}) {
  const [start] = useState(() => startState(initial, startMode, resume));
  const [mode, setMode] = useState<Mode>(start.mode);
  const [rolls, setRolls] = useState<number[]>(start.rolls);
  const [masks, setMasks] = useState<(number | null)[]>(start.masks);
  const [total, setTotal] = useState(start.total);
  const [knocked, setKnocked] = useState(0);
  // Teclado: tiro elegido para corregir (null = se anota al final) y si está vacío esperando el valor:
  // 'borrado' = lo borró dejándolo presionado; 'falta' = la corrección pide ese tiro (quedó en 0 por ahora).
  const [sel, setSel] = useState<number | null>(start.sel);
  const [hole, setHole] = useState<'borrado' | 'falta' | null>(start.hole);
  // Otro juego o lo de la memoria se descartó: se vuelve a empezar.
  const [token, setToken] = useState(resetToken);
  if (token !== resetToken) {
    const s = startState(initial, startMode, resume);
    setToken(resetToken);
    setMode(s.mode);
    setRolls(s.rolls);
    setMasks(s.masks);
    setTotal(s.total);
    setKnocked(0);
    setSel(s.sel);
    setHole(s.hole);
  }

  const game = scoreGame(rolls);
  const now = standingNow(rolls);
  const value = editorValue(mode, { rolls, masks, total, hole: !!hole }, initial);

  useEffect(() => {
    onChange(value, {
      mode,
      rolls,
      masks,
      total,
      hole: hole && sel != null ? { roll: sel, kind: hole } : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, rolls, masks, total, hole, sel]);

  function endEdit() {
    setSel(null);
    setHole(null);
  }

  /** Tecla del teclado: anota al final, o corrige el tiro elegido. */
  function typeRoll(pins: number) {
    if (sel == null) return push(pins, null);
    const r = replaceRoll(rolls, masks, sel, pins, null);
    setRolls(r.rolls);
    setMasks(r.extra);
    setSel(r.next);
    setHole(r.next != null ? 'falta' : null);
  }

  /** Tocar un tiro de la hoja: se elige para corregirlo (otra vez, o lo que falta: seguir al final). */
  function selectRoll(i: number | null) {
    if (i == null || i === sel) return endEdit();
    setSel(i);
    setHole(null);
  }

  /** Dejar presionado un tiro: el último se quita; uno de en medio queda vacío para escribir el correcto. */
  function eraseRoll(i: number) {
    if (i === rolls.length - 1) {
      undo();
      endEdit();
      return;
    }
    setSel(i);
    setHole('borrado');
  }

  function pickMode(m: Mode) {
    // Abierto desde el botón de cuadros (`startMode`), el total se escribe en la casilla: pasar a Total aquí es de esta
    // vez y no cambia la forma preferida (pines o teclado).
    if (!(startMode && m === 'total')) setPreferredMode(m);
    if (m === 'total' && game.complete && total.trim() === '') setTotal(String(game.score));
    setKnocked(0);
    endEdit();
    setMode(m);
  }

  function push(pins: number, mask: number | null) {
    setRolls((r) => [...r, pins]);
    setMasks((ms) => [...ms, mask]);
    setKnocked(0);
  }

  function undo() {
    setRolls((r) => r.slice(0, -1));
    setMasks((ms) => ms.slice(0, -1));
    setKnocked(0);
  }

  function clear() {
    setRolls([]);
    setMasks([]);
    setKnocked(0);
    endEdit();
  }

  const standing = standingMask(rolls, masks);
  // Tiro que se corrige: cuadro, número de tiro y qué se puede escribir ahí.
  const editing = sel != null ? game.frames.findIndex((f) => sel >= f.start && sel < f.start + f.rolls.length) : -1;
  const editRoll = editing >= 0 ? sel! - game.frames[editing].start + 1 : 0;
  const at = sel != null ? standingNow(rolls.slice(0, sel)) : now;
  const keyboard = mode === 'teclado';
  // Con un tiro vacío, el puntaje grande es el que se sabe sin él (igual que los acumulados de la hoja).
  const shownScore = hole && sel != null ? scoreGame(rolls.slice(0, sel)).score : game.score;
  // Lo más que se puede hacer todavía (strike o spare en todo lo que falta). Con un tiro vacío, ese tiro con todo lo que
  // cabe ahí y los cuadros de después como están.
  const best = !rolls.length ? null : hole && sel != null ? maxPossibleWithHole(rolls, sel) : game.complete ? null : maxPossibleScore(rolls);
  // La barra: los cuadros que ya pasaron y lo que va del que se anota.
  const progress = game.complete ? 1 : now ? (now.frame + now.roll / (now.frame === 9 ? 3 : 2)) / 10 : 0;
  const onlyTotal = rolls.length === 0 && initial.score != null && !initial.frames?.rolls?.length;

  /** Lo que se escribe debajo de la hoja: cómo corregir, o qué falta al corregir. */
  const hint =
    keyboard && editing >= 0
      ? hole === 'borrado'
        ? `Borraste el tiro ${editRoll} del cuadro ${editing + 1}: escribe el correcto`
        : hole === 'falta'
          ? `Escribe el tiro ${editRoll} del cuadro ${editing + 1}`
          : `Escribe el tiro ${editRoll} · déjalo presionado para borrarlo`
      : keyboard && rolls.length > 0
        ? 'Toca un cuadro para corregirlo'
        : null;

  const progressLine = (
    <div className="mx-[22px] mt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <b className="text-[15px] font-[650]">
          {keyboard && editing >= 0 ? (
            <span className="text-accent">Corrigiendo el cuadro {editing + 1}</span>
          ) : game.complete ? (
            <span className="text-ok">Juego completo</span>
          ) : (
            <>
              Cuadro {(now?.frame ?? 0) + 1} de 10 <span className="font-medium text-muted">· tiro {(now?.roll ?? 0) + 1}</span>
            </>
          )}
        </b>
        {phoneSaved && !(keyboard && editing >= 0) && (
          <small className="inline-flex items-center gap-[5px] text-[13px] font-medium text-muted">
            <Check className="size-3.5 text-ok" strokeWidth={2.6} aria-hidden="true" />
            {/* En un teléfono angosto (360 px) cabe en la misma línea solo «Guardado». */}
            <span>
              Guardado<span className="max-[379px]:sr-only"> en tu teléfono</span>
            </span>
          </small>
        )}
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-[3px] bg-[var(--an-track,var(--surface-2))]"
        role="progressbar"
        aria-label="Cuadros anotados"
        aria-valuemin={0}
        aria-valuemax={10}
        aria-valuenow={Math.round(progress * 10)}
      >
        <i className="block h-full rounded-[3px] bg-accent transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
    </div>
  );

  // El puntaje grande y el máximo: su lugar queda siempre (sin máximo, vacío) y nada se mueve al anotar.
  const scoreLine = (
    <div className="mx-6 mt-2.5 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <span className="block text-sm font-medium text-muted">{game.complete && !hole ? 'Total' : 'Llevas'}</span>
        <b className="block text-hero-sm num" data-score="">
          {shownScore}
        </b>
      </div>
      <div className="min-w-24 shrink-0 text-right" data-max={best ?? undefined}>
        {best != null && (
          <>
            <span className="block text-sm font-medium text-muted">
              <span className="sr-only">Máximo posible </span>
              <span aria-hidden="true">Máx. posible</span>
            </span>
            <b className="block text-[28px] leading-[1.1] font-[650] text-fg-2 num">{best}</b>
          </>
        )}
      </div>
    </div>
  );

  const prompt = (text: ReactNode) => (
    <p className={cx('text-center text-[15.5px] text-fg-2 [&_b]:font-semibold [&_b]:text-fg', mode === 'pines' ? 'my-2.5' : 'my-3')}>{text}</p>
  );

  const body = (
    <div className="flex flex-1 flex-col">
      {mode !== 'total' && (
        <>
          {progressLine}
          <FramesSheet
            className="mx-4 mt-3 min-[380px]:mx-5"
            rolls={rolls}
            masks={masks}
            next={sel == null && now ? { frame: now.frame, roll: now.roll } : null}
            selected={keyboard ? sel : null}
            blank={keyboard && hole ? sel : null}
            onSelect={keyboard ? selectRoll : undefined}
            onLongPress={keyboard ? eraseRoll : undefined}
          />
          {onlyTotal ? (
            <p className="mx-6 mt-2 text-center text-[13px] text-muted">
              Este juego tiene <b className="text-fg">{initial.score}</b> anotado solo con el total. Anota los tiros para agregarle los cuadros, o
              guárdalo así y se queda con el total.
            </p>
          ) : (
            keyboard && <p className={cx('mx-4 mt-2 min-h-[18px] text-center text-[13px]', editing >= 0 ? 'text-accent' : 'text-muted')}>{hint}</p>
          )}
          {scoreLine}
        </>
      )}

      {/* Lo que se toca va abajo, cerca del pulgar (el espacio que sobra queda arriba). El total va arriba: al escribirlo
          sale el teclado del teléfono. */}
      <div className={cx(mode !== 'total' && 'mt-auto')}>
        {mode === 'teclado' &&
          prompt(
            !at ? (
              <>Juego completo: ya puedes guardarlo</>
            ) : at.fresh ? (
              <>
                <b>{pinos(at.standing)}</b> en pie
              </>
            ) : (
              <>
                {at.standing === 1 ? 'Queda' : 'Quedan'} <b>{pinos(at.standing)}</b> en pie
              </>
            ),
          )}
        {mode === 'teclado' && <Keypad standing={at?.standing ?? -1} fresh={at?.fresh ?? false} onRoll={typeRoll} />}

        {mode === 'pines' &&
          prompt(!now ? <>Juego completo: ya puedes guardarlo</> : knocked ? <><b>{pinos(bitCount(knocked))}</b> marcados</> : <>Toca los pinos que cayeron</>)}
        {mode === 'pines' && (
          <div className="flex flex-col gap-3 px-5">
            <PinDeck standing={standing} knocked={knocked} disabled={!now} onToggle={(bit) => setKnocked((k) => k ^ bit)} />
            <div className="grid grid-cols-3 gap-2">
              <Key big="0" small="Fallo" enabled={!!now} onPress={() => push(0, 0)} />
              <Key
                big={now?.fresh === false ? '/' : 'X'}
                small={now?.fresh === false ? 'Spare' : 'Strike'}
                enabled={!!now}
                onPress={() => push(bitCount(standing), standing)}
              />
              <Key
                big={knocked ? String(bitCount(knocked)) : <Check className="size-6" aria-hidden="true" />}
                small="Anotar"
                label={knocked ? `Anotar ${pinos(bitCount(knocked))}` : 'Anotar los pinos marcados'}
                enabled={!!now && knocked !== 0}
                accent
                onPress={() => push(bitCount(knocked), knocked)}
              />
            </div>
          </div>
        )}

        {mode === 'total' && <TotalInput value={total} onChange={setTotal} />}
      </div>
    </div>
  );

  const undoButton =
    mode === 'total' ? null : sel != null ? (
      // Al corregir: «Deshacer» devuelve el tiro borrado; «Dejar en −» deja en 0 el tiro que pedía la corrección.
      <ActionButton icon={hole === 'borrado' ? <Undo2 className="size-[18px]" /> : <Check className="size-[18px]" />} onClick={endEdit}>
        {hole === 'borrado' ? 'Deshacer' : hole === 'falta' ? 'Dejar en −' : 'Listo'}
      </ActionButton>
    ) : (
      <ActionButton icon={<Undo2 className="size-[18px]" />} disabled={!rolls.length} onClick={undo}>
        Deshacer
      </ActionButton>
    );

  const modeMenu = <ModeMenu mode={mode} onPick={pickMode} onRestart={mode !== 'total' && rolls.length > 0 ? clear : null} />;

  if (children) return <>{children({ modeMenu, body, undo: undoButton, value, mode })}</>;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">{modeMenu}</div>
      {body}
      {undoButton}
    </div>
  );
}

/** Los botones del pie de la hoja (52 px): «Deshacer» gris; ScoreEntryModal usa el mismo alto para «Guardar». */
export const ACTION_BUTTON =
  'inline-flex h-[52px] min-w-0 items-center justify-center gap-2 rounded-btn px-3 text-base min-[380px]:gap-2.5 min-[380px]:px-4 font-semibold whitespace-nowrap transition select-none active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50';

function ActionButton({ icon, children, onClick, disabled }: { icon: ReactNode; children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cx(ACTION_BUTTON, 'bg-surface-2 text-fg')}>
      {icon}
      <span className="min-w-0 truncate">{children}</span>
    </button>
  );
}

/**
 * «Teclado ▾»: la forma de anotar en un menú (Pines, Teclado, Total; la elegida queda para la próxima vez) y, con algo
 * anotado, «Empezar de nuevo». Se cierra tocando fuera (ese toque no llega a lo de atrás: no anota una tecla por error) o
 * con Esc (Esc no cierra también la hoja: ver ScoreEntryModal).
 */
function ModeMenu({ mode, onPick, onRestart }: { mode: ScoreMode; onPick: (m: ScoreMode) => void; onRestart: (() => void) | null }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const current = MODES.find((m) => m.key === mode) ?? MODES[1];
  const Icon = current.icon;

  useEffect(() => {
    if (!open) return;
    const items = () => [...(box.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
    // Al abrir, el foco va a la forma elegida.
    (items().find((el) => el.getAttribute('aria-checked') === 'true') ?? items()[0])?.focus();
    const keys = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        trigger.current?.focus();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const list = items();
        const i = list.indexOf(document.activeElement as HTMLElement);
        e.preventDefault();
        list[(i + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length]?.focus();
      } else if (e.key === 'Tab') {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', keys, true);
    return () => {
      document.removeEventListener('keydown', keys, true);
    };
  }, [open]);

  const choose = (run: () => void) => {
    setOpen(false);
    trigger.current?.focus();
    run();
  };

  return (
    <>
      {/* Tocar fuera del menú lo cierra y nada más. */}
      {open && <div aria-hidden="true" className="fixed inset-0 z-20" onClick={() => setOpen(false)} />}
      <div ref={box} className={cx('relative', open && 'z-30')} data-menu-open={open ? '' : undefined}>
        <button
          ref={trigger}
          type="button"
          data-mode-trigger=""
          data-mode={mode}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          aria-label={`Forma de anotar: ${current.label}`}
          onClick={() => setOpen((o) => !o)}
          className="group flex h-11 items-center focus-visible:outline-none"
        >
          <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-2 px-[13px] text-sm font-semibold whitespace-nowrap text-fg transition group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-accent group-active:scale-[0.97]">
            <Icon className="size-4" aria-hidden="true" />
            {current.label}
            <ChevronDown className={cx('size-3.5 transition', open && 'rotate-180')} aria-hidden="true" />
          </span>
        </button>
        {open && (
          <div
            id={menuId}
            role="menu"
            aria-label="Forma de anotar"
            className="absolute top-full right-0 z-30 mt-1 w-[17.5rem] overflow-hidden rounded-2xl bg-surface p-1.5 shadow-xl ring-1 ring-line"
          >
            {MODES.map(({ key, label, hint, icon: I }) => (
              <button
                key={key}
                type="button"
                role="menuitemradio"
                aria-checked={mode === key}
                onClick={() => choose(() => key !== mode && onPick(key))}
                className={cx(
                  'flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none',
                  mode === key ? 'text-accent' : 'text-fg',
                )}
              >
                <I className="size-5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">{label}</span>
                  <span className="block text-[13px] text-muted">{hint}</span>
                </span>
                {mode === key && <Check className="size-4 shrink-0" aria-hidden="true" />}
              </button>
            ))}
            {onRestart && (
              <>
                <div role="separator" className="mx-3 my-1 h-px bg-line" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => choose(onRestart)}
                  className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[15px] font-semibold text-danger transition hover:bg-danger-soft focus-visible:bg-danger-soft focus-visible:outline-none"
                >
                  <Eraser className="size-5 shrink-0" aria-hidden="true" />
                  Empezar de nuevo
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}

/**
 * Una tecla (58 px): el número o la letra grande y, debajo, qué es («Strike»). La que no vale queda solo con el contorno
 * tenue (se lee también en oscuro); `accent`, del color del deporte.
 */
function Key({
  big,
  small,
  enabled,
  accent,
  label,
  onPress,
}: {
  big: ReactNode;
  small?: string;
  enabled: boolean;
  accent?: boolean;
  label?: string;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      disabled={!enabled}
      aria-label={label}
      onClick={onPress}
      className={cx(
        'flex h-key min-w-0 flex-col items-center justify-center rounded-key text-2xl leading-none font-semibold tabular-nums transition select-none',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        !enabled ? 'text-faint ring-[1.5px] ring-line ring-inset' : accent ? 'bg-accent text-accent-fg active:scale-95' : 'bg-surface-2 text-fg active:scale-95',
      )}
    >
      {big}
      {small && <small className="mt-[3px] block text-[11px] font-[650] tracking-[0.01em]">{small}</small>}
    </button>
  );
}

/**
 * Teclado de tiros, como el de un teléfono (1–9, y a la derecha X Strike, / Spare y 0 Fallo): solo se encienden las teclas
 * que valen según los pinos que quedan parados (en el segundo tiro, el número igual a los que quedan es el spare «/»).
 */
function Keypad({ standing, fresh, onRoll }: { standing: number; fresh: boolean; onRoll: (n: number) => void }) {
  const over = standing < 0;
  const digit = (d: number) => <Key key={d} big={String(d)} enabled={!over && (fresh ? d <= 9 : d < standing)} onPress={() => onRoll(d)} />;
  return (
    <div className="mx-5 grid grid-cols-4 gap-2">
      {digit(1)}
      {digit(2)}
      {digit(3)}
      <Key big="X" small="Strike" enabled={!over && fresh} accent onPress={() => onRoll(10)} />
      {digit(4)}
      {digit(5)}
      {digit(6)}
      <Key big="/" small="Spare" enabled={!over && !fresh && standing > 0} accent onPress={() => onRoll(standing)} />
      {digit(7)}
      {digit(8)}
      {digit(9)}
      <Key big="0" small="Fallo" enabled={!over} onPress={() => onRoll(0)} />
    </div>
  );
}

/** Puntaje final: escrito o con la barra para arrastrar. */
function TotalInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const n = value.trim() === '' ? null : Number(value);
  const invalid = n != null && !isValidScore(n);
  const set = (v: number) => onChange(String(Math.min(300, Math.max(0, Math.round(v)))));
  const step =
    'flex size-key shrink-0 items-center justify-center rounded-key bg-surface-2 text-fg transition select-none active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
  return (
    <div className="flex flex-col items-center gap-5 px-5 pt-6">
      <p className="text-center text-[15.5px] text-fg-2">
        Escribe el <b className="font-semibold text-fg">puntaje final</b>
      </p>
      <div className="flex items-center gap-3">
        <button type="button" className={step} aria-label="Menos" onClick={() => set((n ?? 150) - 1)}>
          <Minus className="size-6" />
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={300}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Puntaje del juego"
          aria-invalid={invalid || undefined}
          placeholder="0"
          className={cx(
            'h-[76px] w-40 min-w-0 rounded-tile border-0 bg-surface-2 text-center text-hero-sm num text-fg outline-none placeholder:text-faint',
            'focus:ring-2 focus:ring-accent',
            invalid && 'text-danger ring-2 ring-danger',
          )}
        />
        <button type="button" className={step} aria-label="Más" onClick={() => set((n ?? 150) + 1)}>
          <Plus className="size-6" />
        </button>
      </div>
      <input
        type="range"
        min={0}
        max={300}
        step={1}
        value={n != null && !invalid ? n : 150}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Arrastra para el puntaje"
        className="h-11 w-full accent-[var(--accent)]"
      />
      <div className="-mt-4 flex w-full justify-between text-[13px] text-muted tabular-nums">
        <span>0</span>
        <span className="flex items-center gap-1">
          <Hash className="size-3" /> Arrastra o escribe
        </span>
        <span>300</span>
      </div>
      {invalid && <p className="-mt-2 text-sm text-danger">El puntaje va de 0 a 300.</p>}
    </div>
  );
}
