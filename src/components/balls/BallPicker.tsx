import { memo, useCallback, useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Plus } from 'lucide-react';
import { BALL_MAX, ballDetail, ballLabel, defaultBall, gameBallTitle, pickableBalls, type Ball } from '../../lib/balls';
import { ballAddedHere, storedBall, useMyBalls } from '../../lib/data/balls';
import { getUserId } from '../../lib/data/client';
import { toIsoDate } from '../../lib/format';
import { Button, Sheet, cx } from '../ui';
import { BallArt } from './BallArt';
import { BallSheet } from './BallSheet';

/** Las bolas para elegir al anotar (useBallChoice). */
export interface BallChoice {
  /** Todas las de la cuenta, también las retiradas (en el orden de my_balls). */
  balls: Ball[];
  /**
   * Se puede anotar la bola: hay sesión y la lista se leyó (del servidor o de la copia del teléfono), aunque no tenga
   * ninguna (sale «Agregar bola»). Sin señal y sin copia: false (no se sabe qué tiene).
   */
  canPick: boolean;
  /** La que se pone sola en un juego nuevo (la última que usó; null si ninguna). */
  auto: string | null;
  /** La lista se leyó (del servidor o de la copia del teléfono). Ojo: sin sesión también es true (no hay nada que leer). */
  loaded: boolean;
  /**
   * La cuenta no tenía ninguna bola (ni retirada) la primera vez que se supo la lista en esta pantalla, y sigue así
   * aunque agregue una aquí mismo: los juegos que ya estaban no tenían bola (no hace falta esperar a leer sus bolas, que
   * al agregar la primera pasan a «leyendo» y la bola elegida se perdería). Deja de valer si llega una que no se agregó
   * en este teléfono: la lista que se vio al abrir era la copia vieja del teléfono.
   */
  noBallsAtStart: boolean;
}

/**
 * Las bolas para elegir al anotar: todas las de la cuenta, si se puede elegir (con sesión y la lista leída, aunque no
 * tenga ninguna: sale «Agregar bola») y la que se pone sola en un juego nuevo.
 */
export function useBallChoice(): BallChoice {
  const mine = useMyBalls();
  const balls = mine.data.balls;
  const loaded = !mine.loading && !mine.error;
  const uid = getUserId();
  const canPick = !!uid && loaded;
  // Se anota una sola vez (por cuenta): la primera vez que se sabe la lista.
  const start = useRef<{ uid: string; none: boolean } | null>(null);
  if (canPick && start.current?.uid !== uid) start.current = { uid, none: balls.length === 0 };
  return {
    balls,
    canPick,
    auto: defaultBall(balls, storedBall(), mine.data.lastUsed),
    loaded,
    noBallsAtStart: !!uid && start.current?.uid === uid && start.current.none && balls.every((b) => ballAddedHere(b.id)),
  };
}

/** Las hojas que se abren desde un botón van al final de la página (no dentro de un <label> o un <button>). */
const inBody = (node: ReactNode) => (typeof document !== 'undefined' ? createPortal(node, document.body) : node);

/** Lo que dice al llegar al máximo de bolas (el mismo de «Mis bolas»). */
const FULL_TEXT = `Ya tienes ${BALL_MAX} bolas: borra una que ya no uses para agregar otra.`;

/** Sin bola: un círculo punteado del tamaño de la bola dibujada (con un + si toca agregar una). */
function NoBallMark({ size, add }: { size: 24 | 40; add?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'flex shrink-0 items-center justify-center rounded-full border-2 border-dashed border-muted text-muted',
        size === 24 ? 'size-6' : 'size-10',
      )}
    >
      {add && <Plus className={size === 24 ? 'size-3' : 'size-4'} />}
    </span>
  );
}

/** «Phaze II (15 lb)», y si está retirada (solo sale la que ya tenía el juego). */
const ballName = (b: Ball) => `${ballLabel(b)}${b.retired ? ' · retirada' : ''}`;

/** Una bola de la lista de la hoja (o «Sin bola», con `noneText` debajo): dibujada, con su nombre y lo que se sabe de ella. */
function BallOptionRow({ ball, checked, noneText, onSelect }: { ball: Ball | null; checked: boolean; noneText?: string; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={cx(
        'flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left text-sm transition focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
        checked ? 'bg-accent-soft' : 'hover:bg-surface-2',
      )}
    >
      {ball ? <BallArt ball={ball} size={40} className="shrink-0" /> : <NoBallMark size={40} />}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-fg">{ball?.name ?? 'Sin bola'}</span>
        <span className="block truncate text-xs text-muted">{ball ? `${ballDetail(ball)}${ball.retired ? ' · retirada' : ''}` : noneText}</span>
      </span>
      {checked && <Check className="size-5 shrink-0 text-accent" aria-hidden="true" />}
    </button>
  );
}

/** Las casillas de la fila de bolas (64 px de ancho: caben el dedo y la bola con su nombre). */
const TILE =
  'flex w-16 shrink-0 flex-col items-center gap-1 rounded-xl p-1 pt-1.5 transition focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent';

/** Una bola de la fila (o «Sin bola»): dibujada a 40 px con su nombre debajo. */
function BallTile({ ball, checked, onSelect }: { ball: Ball | null; checked: boolean; onSelect: () => void }) {
  const name = ball ? ballName(ball) : 'Sin bola';
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-label={name}
      title={name}
      onClick={onSelect}
      className={cx(TILE, 'text-fg', checked ? 'bg-accent-soft ring-2 ring-accent' : 'hover:bg-surface-2')}
    >
      {ball ? <BallArt ball={ball} size={40} className="shrink-0" /> : <NoBallMark size={40} />}
      <span aria-hidden="true" className="w-full truncate text-center text-[11px] leading-tight font-medium">
        {ball?.name ?? 'Sin bola'}
      </span>
    </button>
  );
}

/** «Agregar» al final de la fila: abre la hoja de una bola nueva. */
function AddTile({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" aria-label="Agregar bola" title="Agregar bola" onClick={onClick} className={cx(TILE, 'text-muted hover:bg-surface-2 hover:text-fg')}>
      <NoBallMark size={40} add />
      <span aria-hidden="true" className="w-full truncate text-center text-[11px] leading-tight font-medium">
        Agregar
      </span>
    </button>
  );
}

export interface BallPickSheetProps {
  /** El juego (desde 0) o 'all' (todos los juegos). */
  game: number | 'all';
  /** Todas las de la cuenta (useBallChoice().balls). */
  balls: readonly Ball[];
  /** La bola ahora (null = sin bola; undefined solo con 'all' = los juegos tienen bolas distintas). */
  value: string | null | undefined;
  /** Eligió (o agregó) una. La hoja se cierra sola después. */
  onPick: (id: string | null) => void;
  onClose: () => void;
  /** YYYY-MM-DD para la hoja de «Agregar bola» (por defecto, hoy). */
  today?: string;
}

/**
 * Hoja para elegir la bola de un juego (o de todos): «Sin bola» y las que no están retiradas (y la que ya tenía, aunque
 * esté retirada), cada una dibujada con su nombre. Elegir cierra la hoja. «Agregar bola» abre la hoja de una bola nueva
 * encima (lo anotado no se pierde) y, al guardarla, queda elegida. Se monta abierta: quien la abre la quita al cerrar.
 */
export function BallPickSheet({ game, balls, value, onPick, onClose, today }: BallPickSheetProps) {
  const [adding, setAdding] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const options = pickableBalls(balls, value ?? null);
  const full = balls.length >= BALL_MAX;
  const title = gameBallTitle(game);
  // «Sin bola» también si la que tenía ya no existe (se borró): así se dibuja en el botón.
  const noBall = value === null || (value !== undefined && !balls.some((b) => b.id === value));
  const pick = (id: string | null) => {
    onPick(id);
    onClose();
  };
  // La que agregó aquí: primero se cierra su hoja (el foco vuelve a «Agregar bola») y después esta (vuelve al botón de
  // la bola). Las dos juntas dejarían el foco perdido.
  useEffect(() => {
    if (adding || !saved) return;
    setSaved(null);
    pick(saved);
    // Solo cuando se cierra la hoja de la nueva.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adding, saved]);

  return (
    <>
      <Sheet open onClose={onClose} title={title} subtitle={game === 'all' ? 'La misma para todos tus juegos' : '¿Con cuál bola lo tiraste?'}>
        <div className="flex flex-col gap-3 text-sm">
          {!options.length && (
            <p className="rounded-xl bg-surface-2 px-3 py-2.5 text-muted">
              {balls.length
                ? 'Tus bolas están retiradas. Agrega otra o vuelve a usar una en «Mis bolas».'
                : 'Todavía no tienes bolas. Agrega la tuya y anota con cuál tiras cada juego: verás con cuál te va mejor.'}
            </p>
          )}
          <div role="radiogroup" aria-label={title} className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl border border-line">
            <BallOptionRow
              ball={null}
              checked={noBall}
              noneText={game === 'all' ? 'No la anoto en estos juegos' : 'No la anoto en este juego'}
              onSelect={() => pick(null)}
            />
            {options.map((b) => (
              <BallOptionRow key={b.id} ball={b} checked={value === b.id} onSelect={() => pick(b.id)} />
            ))}
          </div>
          <Button className="h-11" icon={<Plus className="size-4" />} disabled={full} onClick={() => setAdding(true)}>
            Agregar bola
          </Button>
          <p className="text-xs text-muted">{full ? FULL_TEXT : 'Queda en «Mis bolas». Necesitas señal para agregarla.'}</p>
        </div>
      </Sheet>
      {adding && <BallSheet ball={null} today={today ?? toIsoDate(new Date())} onSaved={setSaved} onClose={() => setAdding(false)} />}
    </>
  );
}

export interface GameBallChipProps {
  /** El juego (desde 0) o 'all' (la de todos los juegos). */
  game: number | 'all';
  /** Todas las de la cuenta (useBallChoice().balls). */
  balls: readonly Ball[];
  /** La bola del juego (null = sin bola; undefined solo con 'all' = los juegos tienen bolas distintas). */
  value: string | null | undefined;
  /** Eligió una para ese juego (o 'all'). Que sea siempre la misma función (useCallback): si no, `memo` no sirve. */
  onPick: (game: number | 'all', id: string | null) => void;
  /**
   * 'compact' (así viene): la bola dibujada y ▾ con su nombre debajo (cortado), del ancho de su columna. 'full': la bola
   * con su nombre al lado.
   */
  variant?: 'compact' | 'full';
  /** YYYY-MM-DD para la hoja de «Agregar bola» (por defecto, hoy). */
  today?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * La bola de un juego al anotar: un botón con la bola dibujada (o el círculo punteado sin bola, con un + si la cuenta no
 * tiene ninguna) y su nombre (dos bolas lisas del mismo color se ven iguales) que abre la hoja para elegirla o agregar
 * una. Su nombre para el lector de pantalla dice el juego y la bola («Bola del juego 3: Phaze II (15 lb)»). Con `memo`:
 * la hoja de anotar se vuelve a dibujar con cada tecla.
 */
export const GameBallChip = memo(function GameBallChip({ game, balls, value, onPick, variant = 'compact', today, disabled, className }: GameBallChipProps) {
  const [open, setOpen] = useState(false);
  // De todas (también una retirada que ya tenía el juego).
  const current = value ? (balls.find((b) => b.id === value) ?? null) : null;
  const none = !current && !pickableBalls(balls).length;
  const what = current ? ballLabel(current) : value === undefined ? 'varias bolas' : 'sin bola';
  const label = `${gameBallTitle(game)}: ${what}${none ? '. Toca para agregar una' : ''}`;
  const pick = useCallback((id: string | null) => onPick(game, id), [onPick, game]);
  const close = useCallback(() => setOpen(false), []);
  const full = variant === 'full';
  const art = current ? (
    <BallArt ball={current} size={24} className="shrink-0" />
  ) : value === undefined ? (
    <BallIcon className="size-6 shrink-0 text-muted" />
  ) : (
    <NoBallMark size={24} add={none} />
  );
  const chevron = <ChevronDown className="size-3 shrink-0 text-muted" aria-hidden="true" />;
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        title={label}
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cx(
          'flex min-w-11 items-center border border-line bg-surface transition hover:bg-surface-2 active:scale-[0.97]',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50',
          full
            ? 'h-11 max-w-full justify-start gap-2 rounded-xl pr-3 pl-2 text-sm text-fg'
            : 'min-h-11 w-full flex-col justify-center gap-0.5 rounded-lg px-1 py-1',
          className,
        )}
      >
        {full ? (
          <>
            {art}
            <span className="min-w-0 truncate font-medium">{current?.name ?? (value === undefined ? 'Varias bolas' : 'Sin bola')}</span>
            {chevron}
          </>
        ) : (
          <>
            <span className="flex items-center gap-0.5">
              {art}
              {chevron}
            </span>
            {/* El nombre ya va en el del botón: aquí solo se ve. */}
            <span aria-hidden="true" className={cx('w-full truncate text-center text-[11px] leading-tight font-medium', current ? 'text-fg' : 'text-muted')}>
              {current?.name ?? (value === undefined ? 'Varias' : 'Sin bola')}
            </span>
          </>
        )}
      </button>
      {open && !disabled && inBody(<BallPickSheet game={game} balls={balls} value={value} today={today} onPick={pick} onClose={close} />)}
    </>
  );
});

/**
 * La bola de todos los juegos en una hoja de varios juegos (juegos sueltos, «Subir mis juegos»): el botón con la bola
 * (o «Varias bolas») y cómo se cambia la de uno solo, con las mismas palabras en las dos hojas.
 */
export function AllGamesBall({ balls, value, onPick, today }: Pick<GameBallChipProps, 'balls' | 'value' | 'onPick' | 'today'>) {
  return (
    <div className="flex flex-col gap-1.5">
      {/* El botón ya dice «Bola de todos los juegos» al lector de pantalla. */}
      <span aria-hidden="true" className="text-xs font-medium text-muted">
        Bola para todos los juegos
      </span>
      <GameBallChip game="all" variant="full" balls={balls} value={value} onPick={onPick} today={today} className="self-start" />
      <span className="text-xs text-muted">Toca la bola de un juego para cambiar solo esa.</span>
    </div>
  );
}

/** Una bola de boliche (con sus tres huecos), del color del texto: el ícono de «Mis bolas». */
export function BallIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className={className ?? 'size-5'}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="10" cy="8.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="14" cy="8.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12.5" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * La bola de un juego dentro de la hoja de anotar (arriba del editor): un chip «Bola: Phaze II 15 lb ▾» que abre debajo la
 * fila de bolas dibujadas («Sin bola», las que no están retiradas y la que ya tenía), que se desliza de lado sola (no la
 * hoja) y, al final, «Agregar» (la hoja de una bola nueva encima; al guardarla queda elegida). Elegir una cierra la fila.
 * Se monta con la del juego (`key` = el juego) y deja lo elegido en `choice`: quien abre la hoja lo aplica al guardar el
 * juego (cancelar no cambia nada).
 */
export function GameBallSelect({
  balls,
  initial,
  choice,
  game,
  today,
}: {
  balls: readonly Ball[];
  initial: string | null;
  choice: RefObject<string | null>;
  /** El juego (desde 0), para el nombre de la fila («Bola del juego 3»). */
  game?: number;
  /** YYYY-MM-DD para la hoja de «Agregar bola» (por defecto, hoy). */
  today?: string;
}) {
  const [value, setValue] = useState(initial);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const row = useRef<HTMLDivElement>(null);
  const chip = useRef<HTMLButtonElement>(null);
  const rowId = useId();
  useEffect(() => {
    choice.current = initial;
    // Solo al abrir este juego (la hoja la vuelve a montar con otro `key`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const set = (id: string | null) => {
    setValue(id);
    choice.current = id;
  };
  /** Eligió una: se cierra la fila y el foco vuelve al chip (la casilla tocada ya no se ve). */
  const pick = (id: string | null) => {
    set(id);
    setOpen(false);
    chip.current?.focus();
  };
  // La retirada que tenía el juego sigue en la fila aunque toque otra (hasta guardar todavía es la suya: se puede volver).
  const options = pickableBalls(balls, value, initial);
  const current = value ? (balls.find((b) => b.id === value) ?? null) : null;
  // «Sin bola» también si la que tenía ya no existe (se borró).
  const noBall = !current;
  // La cuenta no tiene ninguna para elegir: el círculo punteado lleva un + («Agregar» está en la fila).
  const none = noBall && !pickableBalls(balls).length;
  // La elegida a la vista al abrir la fila (con muchas bolas no caben todas). Solo se desliza la fila: scrollIntoView
  // movería también la hoja. En el siguiente cuadro: la fila recién se muestra.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const box = row.current;
      const el = box?.querySelector<HTMLElement>('[aria-checked="true"]');
      if (!box || !el) return;
      // `left` desde el borde de la fila (es `relative`), con su margen de 20 px.
      const left = el.offsetLeft;
      if (left < box.scrollLeft || left + el.offsetWidth > box.scrollLeft + box.clientWidth) box.scrollTo({ left: left - 20 });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, value, options.length]);
  return (
    <div className="flex flex-col items-center">
      {/* 38 px a la vista, 44 para el dedo. El nombre que se lee es el del chip («Bola: Phaze II 15 lb»). */}
      <button
        ref={chip}
        type="button"
        aria-expanded={open}
        aria-controls={rowId}
        onClick={() => setOpen((o) => !o)}
        className="group -my-[3px] flex min-h-11 max-w-full items-center focus-visible:outline-none"
      >
        <span className="inline-flex h-[38px] max-w-full min-w-0 items-center gap-2 rounded-full bg-surface-2 pr-3 pl-1.5 text-[15px] font-semibold text-fg transition group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-accent group-active:scale-[0.97]">
          {current ? <BallArt ball={current} size={28} className="shrink-0" /> : <NoBallMark size={24} add={none} />}
          <span className="shrink-0 font-medium text-muted">Bola:</span>
          <span className="min-w-0 truncate">{current ? `${current.name} ${current.weight} lb` : 'Sin bola'}</span>
          <ChevronDown className={cx('size-4 shrink-0 text-muted transition', open && 'rotate-180')} aria-hidden="true" />
        </span>
      </button>
      {/* -mx-5 px-5: lo mismo que el margen de la hoja (si no, la hoja también se deslizaría de lado). */}
      <div
        id={rowId}
        ref={row}
        hidden={!open}
        className="no-scrollbar relative -mx-5 flex w-[calc(100%+2.5rem)] gap-1 overflow-x-auto overscroll-x-contain px-5 py-1"
      >
        <div role="radiogroup" aria-label={game != null ? gameBallTitle(game) : 'Bola de este juego'} className="flex shrink-0 gap-1">
          <BallTile ball={null} checked={noBall} onSelect={() => pick(null)} />
          {options.map((b) => (
            <BallTile key={b.id} ball={b} checked={value === b.id} onSelect={() => pick(b.id)} />
          ))}
        </div>
        {balls.length < BALL_MAX && <AddTile onClick={() => setAdding(true)} />}
      </div>
      {adding && inBody(<BallSheet ball={null} today={today ?? toIsoDate(new Date())} onSaved={pick} onClose={() => setAdding(false)} />)}
    </div>
  );
}
