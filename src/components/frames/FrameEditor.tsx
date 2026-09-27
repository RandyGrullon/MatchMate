import { useEffect, useState } from 'react';
import { Delete, Eraser, Grid3x3, Hash, Minus, Plus, SlidersHorizontal, Target, X } from 'lucide-react';
import { bitCount, replaceRoll, scoreGame, standingMask, standingNow } from '../../lib/bowling';
import { isValidScore } from '../../lib/stats';
import type { GameFrames } from '../../lib/types';
import { Button, Input, cx } from '../ui';
import { FramesGrid } from './FramesGrid';
import { PinDeck } from './PinDeck';

export interface ScoreValue {
  score: number | null;
  /** Tiros del juego si se anotó por cuadros. */
  frames: GameFrames | null;
}

export type ScoreMode = 'pines' | 'teclado' | 'total';
type Mode = ScoreMode;
const MODE_KEY = 'bowlinx:modo-anotar';

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
export function setPreferredMode(m: ScoreMode) {
  try {
    localStorage.setItem(MODE_KEY, m);
  } catch {
    // sin almacenamiento
  }
}

/**
 * Anotar un juego de 3 formas:
 * - Pines: se tocan los pines que cayeron en cada tiro y la hoja se calcula sola.
 * - Teclado: se escribe cada tiro (X, /, números); se bloquea lo imposible (tras un 8 solo 0, 1 o spare).
 *   Se toca un tiro de la hoja para corregirlo y se deja presionado para borrarlo.
 * - Total: solo el puntaje final, con la barra o escribiéndolo.
 */
export function FrameEditor({ initial, onChange }: { initial: ScoreValue; onChange: (v: ScoreValue & { ready: boolean }) => void }) {
  const [mode, setMode] = useState<Mode>(() =>
    initial.frames?.rolls.length ? (initial.frames.masks?.some((m) => m != null) ? 'pines' : 'teclado') : initial.score != null ? 'total' : (savedMode() ?? 'teclado'),
  );
  const [rolls, setRolls] = useState<number[]>(initial.frames?.rolls ?? []);
  const [masks, setMasks] = useState<(number | null)[]>(initial.frames?.masks ?? initial.frames?.rolls.map(() => null) ?? []);
  const [total, setTotal] = useState(initial.score != null ? String(initial.score) : '');
  const [knocked, setKnocked] = useState(0);
  // Teclado: tiro elegido para corregir (null = se anota al final) y si está vacío esperando el valor:
  // 'borrado' = lo borró dejándolo presionado; 'falta' = la corrección pide ese tiro (quedó en 0 por ahora).
  const [sel, setSel] = useState<number | null>(null);
  const [hole, setHole] = useState<'borrado' | 'falta' | null>(null);

  const game = scoreGame(rolls);
  const now = standingNow(rolls);

  useEffect(() => {
    if (mode === 'total') {
      const n = total.trim() === '' ? null : Number(total);
      onChange({ score: n, frames: null, ready: n != null && isValidScore(n) });
    } else {
      const withMasks = masks.some((m) => m != null);
      onChange({
        score: game.complete ? game.score : null,
        frames: rolls.length ? { rolls, ...(withMasks ? { masks } : {}) } : null,
        // Con un tiro borrado sin volver a escribir, el juego no está listo.
        ready: game.complete && !hole,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, rolls, masks, total, hole]);

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

  /** Tocar un tiro de la hoja: se elige para corregirlo (otra vez, o una casilla vacía: seguir al final). */
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
    setPreferredMode(m);
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

  const remaining = game.frames.length && !game.complete ? 10 - game.frames.filter((f) => f.total != null).length : 0;
  const standing = standingMask(rolls, masks);
  // Tiro que se corrige: cuadro, número de tiro y qué se puede escribir ahí.
  const editing = sel != null ? game.frames.findIndex((f) => sel >= f.start && sel < f.start + f.rolls.length) : -1;
  const at = sel != null ? standingNow(rolls.slice(0, sel)) : now;
  const keyboard = mode === 'teclado';
  // Con un tiro vacío, el puntaje grande es el que se sabe sin él (igual que los acumulados de la hoja).
  const shownScore = hole && sel != null ? scoreGame(rolls.slice(0, sel)).score : game.score;

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
        {(
          [
            ['pines', 'Pines', <Target key="p" className="size-4" />],
            ['teclado', 'Teclado', <Grid3x3 key="t" className="size-4" />],
            ['total', 'Total', <SlidersHorizontal key="s" className="size-4" />],
          ] as const
        ).map(([key, label, icon]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mode === key}
            onClick={() => pickMode(key)}
            className={cx(
              'flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition',
              mode === key ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
            )}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {mode !== 'total' && (
        <>
          <FramesGrid
            rolls={rolls}
            cursor={sel == null ? (now?.frame ?? null) : null}
            selected={keyboard ? sel : null}
            blank={keyboard && hole ? sel : null}
            onSelect={keyboard ? selectRoll : undefined}
            onLongPress={keyboard ? eraseRoll : undefined}
          />
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted">
              {keyboard && sel != null && editing >= 0 ? (
                <span className="text-accent">
                  {hole === 'borrado' ? 'Borraste el' : hole === 'falta' ? 'Escribe el' : 'Corrigiendo el'} tiro{' '}
                  {sel - game.frames[editing].start + 1} del cuadro <b>{editing + 1}</b>
                  {hole === 'borrado' ? ': escribe el correcto' : ''}
                </span>
              ) : game.complete ? (
                <span className="font-medium text-ok">Juego completo</span>
              ) : now ? (
                <>
                  Cuadro <b className="text-fg">{now.frame + 1}</b>, tiro <b className="text-fg">{now.roll + 1}</b>
                  {remaining > 0 && rolls.length > 0 && ` · faltan ${remaining}`}
                </>
              ) : null}
            </span>
            <span className="text-2xl font-bold tabular-nums">{rolls.length ? shownScore : '—'}</span>
          </div>
        </>
      )}

      {mode === 'pines' && (
        <div className="flex flex-col gap-3">
          <PinDeck
            standing={standing}
            knocked={knocked}
            disabled={!now}
            onToggle={(bit) => setKnocked((k) => k ^ bit)}
          />
          <div className="grid grid-cols-2 gap-2">
            <Button disabled={!now} onClick={() => push(0, 0)}>
              Ninguno (−)
            </Button>
            <Button disabled={!now} onClick={() => push(bitCount(standing), standing)}>
              {now?.fresh ? 'Strike (X)' : 'Spare (/)'}
            </Button>
          </div>
          <Button variant="primary" disabled={!now || knocked === 0} onClick={() => push(bitCount(knocked), knocked)}>
            {knocked ? `Anotar ${bitCount(knocked)} ${bitCount(knocked) === 1 ? 'pin' : 'pines'}` : 'Toca los pines que cayeron'}
          </Button>
        </div>
      )}

      {mode === 'teclado' && (
        <>
          <Keypad standing={at?.standing ?? -1} fresh={at?.fresh ?? false} onRoll={typeRoll} />
          {rolls.length > 0 && sel == null && (
            <p className="-mt-2 text-center text-xs text-muted">Toca un tiro de la hoja para corregirlo · déjalo presionado para borrarlo</p>
          )}
        </>
      )}

      {mode !== 'total' && rolls.length > 0 && (
        <div className="flex justify-between gap-2">
          {sel != null ? (
            <Button variant="ghost" size="sm" icon={<X className="size-4" />} onClick={endEdit}>
              {hole === 'borrado' ? 'Dejar como estaba' : hole === 'falta' ? 'Dejarlo en −' : 'Listo'}
            </Button>
          ) : (
            <Button variant="ghost" size="sm" icon={<Delete className="size-4" />} onClick={undo}>
              Deshacer tiro
            </Button>
          )}
          <Button variant="ghost" size="sm" className="text-danger" icon={<Eraser className="size-4" />} onClick={clear}>
            Empezar de nuevo
          </Button>
        </div>
      )}

      {mode === 'total' && <TotalInput value={total} onChange={setTotal} />}
    </div>
  );
}

/** Teclado de tiros: desactiva lo imposible según los pinos que quedan parados. */
function Keypad({ standing, fresh, onRoll }: { standing: number; fresh: boolean; onRoll: (n: number) => void }) {
  const over = standing < 0;
  const key = (label: string, value: number, enabled: boolean, accent?: boolean) => (
    <button
      key={label}
      type="button"
      disabled={!enabled}
      onClick={() => onRoll(value)}
      className={cx(
        'h-12 rounded-xl text-lg font-bold transition select-none active:scale-95 disabled:opacity-25',
        accent ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-fg hover:brightness-95',
      )}
    >
      {label}
    </button>
  );
  // Segundo tiro: solo menos de los que quedan (el que tumba todos es spare "/").
  const digit = (d: number) => key(String(d), d, !over && (fresh ? d <= 9 : d < standing));
  return (
    <div className="grid grid-cols-4 gap-2">
      {digit(7)}
      {digit(8)}
      {digit(9)}
      {key('X', 10, !over && fresh, true)}
      {digit(4)}
      {digit(5)}
      {digit(6)}
      {key('/', standing, !over && !fresh && standing > 0, true)}
      {digit(1)}
      {digit(2)}
      {digit(3)}
      {key('−', 0, !over)}
    </div>
  );
}

/** Puntaje final: barra para arrastrar o número escrito. */
function TotalInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const n = value.trim() === '' ? null : Number(value);
  const invalid = n != null && !isValidScore(n);
  const set = (v: number) => onChange(String(Math.min(300, Math.max(0, Math.round(v)))));
  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="flex items-center justify-center gap-3">
        <Button size="md" aria-label="Menos" icon={<Minus className="size-4" />} onClick={() => set((n ?? 150) - 1)} />
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          max={300}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Puntaje del juego"
          className={cx('h-16 w-32 text-center text-4xl! font-bold tabular-nums', invalid && 'border-danger text-danger')}
          placeholder="0"
        />
        <Button size="md" aria-label="Más" icon={<Plus className="size-4" />} onClick={() => set((n ?? 150) + 1)} />
      </div>
      <input
        type="range"
        min={0}
        max={300}
        step={1}
        value={n != null && !invalid ? n : 150}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Arrastra para el puntaje"
        className="w-full accent-[var(--accent)]"
      />
      <div className="flex justify-between text-xs text-muted tabular-nums">
        <span>0</span>
        <span className="flex items-center gap-1">
          <Hash className="size-3" /> Arrastra o escribe
        </span>
        <span>300</span>
      </div>
    </div>
  );
}
