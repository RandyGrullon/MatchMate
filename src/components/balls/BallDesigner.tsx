import { memo, useCallback, useId, useState, type MouseEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, RotateCcw, Trash2 } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { BALL_COLORS, type Ball } from '../../lib/balls';
import {
  BALL_PATTERNS,
  BALL_STICKER_SHAPES,
  BALL_STICKER_TEXT_MAX,
  BALL_STICKERS_MAX,
  ballDesignOf,
  cleanColor,
  cleanStickerText,
  defaultBallDesign,
  initialsOf,
  newSticker,
  patternInfo,
  readableOn,
  sameBallDesign,
  stickerInfo,
  type BallDesign,
  type BallPattern,
  type BallSticker,
  type BallStickerShape,
} from '../../lib/ballDesign';
import { ballDesignErrorText, setBallDesign } from '../../lib/data/balls';
import { useFeedback } from '../feedback';
import { Button, Input, Sheet, cx } from '../ui';
import { BallArt, StickerArt } from './BallArt';
import {
  COLOR_SLOTS,
  STICKER_STEP,
  ballTap,
  designNeedsSave,
  designToSave,
  moveSticker,
  percent,
  resetWarning,
  sampleText,
  slotColor,
  stickerName,
  stickerRing,
  tapToBall,
  withSlotColor,
  type ColorSlot,
  type DesignTab,
} from './designer';

/** La bola grande: 160 px (128 en una pantalla bajita, para que quepan los controles debajo). */
const PREVIEW = 160;

/** Las pestañas (44 px de alto para el dedo). */
const DESIGN_TABS: readonly { key: DesignTab; label: string }[] = [
  { key: 'colores', label: 'Colores' },
  { key: 'dibujo', label: 'Dibujo' },
  { key: 'figuras', label: 'Figuras' },
];

/**
 * «Diseñar» en Mis bolas: el creador de la bola (en la hoja de abajo). Arriba la bola grande, que cambia con cada toque
 * (se queda a la vista al bajar); abajo tres pestañas: «Colores» (la base y, en los dibujos, dos colores más: de la
 * paleta, uno propio o el automático que sale de la base), «Dibujo» (perlada, jaspeada, galaxia…, con tamaño, suavidad
 * y ángulo; brillo y huecos) y «Figuras» (hasta 5: estrella, llama, número, iniciales…, con su color, moverlas con las
 * flechas o tocando la bola, agrandarlas, girarlas y quitarlas). «Restablecer» la deja lisa, de su color; «Guardar»
 * la guarda (setBallDesign: se ve enseguida en la lista). Restablecer y cerrar con cambios preguntan antes. Se monta
 * abierta: la página la quita al cerrar.
 *
 * El diseño es el de src/lib/ballDesign.ts: todo sale de listas y rangos (nada libre), y el texto del número y de las
 * iniciales se limpia al escribirlo (solo cifras o letras).
 */
export function BallDesigner({ ball, onClose }: { ball: Ball; onClose: () => void }) {
  const { toast, confirm } = useFeedback();
  const auth = useAuth();
  const [initial] = useState(() => ballDesignOf(ball));
  const [draft, setDraft] = useState<BallDesign>(initial);
  const [tab, setTab] = useState<DesignTab>('colores');
  const [slot, setSlot] = useState<ColorSlot>('base');
  const [picked, setPicked] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const sticker = picked != null ? (draft.stickers[picked] ?? null) : null;
  const plain = defaultBallDesign(ball.color, ball.cover);
  const initials = initialsOf(auth.profile?.name);

  const change = (patch: Partial<BallDesign>) => setDraft((d) => ({ ...d, ...patch }));
  const changeSticker = (i: number, fn: (s: BallSticker) => BallSticker) =>
    setDraft((d) => ({ ...d, stickers: d.stickers.map((s, j) => (j === i ? fn(s) : s)) }));
  const pickPattern = useCallback((pattern: BallPattern) => setDraft((d) => ({ ...d, pattern })), []);

  async function close() {
    if (busy) return;
    if (!sameBallDesign(draft, initial)) {
      const ok = await confirm({ title: '¿Salir sin guardar?', message: 'Lo que cambiaste en el diseño se pierde.', confirmText: 'Salir sin guardar', danger: true });
      if (!ok) return;
    }
    onClose();
  }

  async function save() {
    if (busy) return;
    if (!designNeedsSave(draft, ball)) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      await setBallDesign(ball.id, designToSave(draft, ball));
      toast('Diseño guardado');
      onClose();
    } catch (e) {
      toast(ballDesignErrorText(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  /** «Restablecer»: pregunta antes (se pierde todo lo del borrador, figuras incluidas) y la deja como sin diseño. */
  async function reset() {
    if (busy) return;
    const warning = resetWarning(draft, plain);
    if (warning == null) return;
    const ok = await confirm({ title: '¿Restablecer la bola?', message: warning, confirmText: 'Restablecer', danger: true });
    if (!ok) return;
    setDraft(plain);
    setPicked(null);
    setSlot('base');
  }

  function add(shape: BallStickerShape) {
    if (draft.stickers.length >= BALL_STICKERS_MAX) return;
    // El mismo texto que se ve en su botón (sampleText).
    const s = newSticker(shape, draft, sampleText(shape, initials));
    setDraft((d) => ({ ...d, stickers: [...d.stickers, s] }));
    setPicked(draft.stickers.length);
  }

  function remove(i: number) {
    setDraft((d) => ({ ...d, stickers: d.stickers.filter((_, j) => j !== i) }));
    setPicked(null);
  }

  /**
   * Tocar la bola (ballTap): tocar una figura la elige (y abre «Figuras»); con una elegida en «Figuras», tocar la bola
   * donde no hay otra la pone ahí.
   */
  function tap(e: MouseEvent<HTMLDivElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const p = tapToBall(e.clientX - box.left, e.clientY - box.top, box.width, box.height, PREVIEW);
    const act = ballTap(draft.stickers, picked, p, tab === 'figuras' && sticker != null);
    if (act == null) return;
    if ('move' in act) {
      changeSticker(act.move, (s) => ({ ...s, x: act.x, y: act.y }));
      return;
    }
    setPicked(act.pick);
    setTab('figuras');
  }

  const ring = tab === 'figuras' && sticker ? stickerRing(sticker, PREVIEW) : null;

  return (
    <Sheet
      open
      onClose={() => void close()}
      title={`Diseñar la ${ball.name}`}
      subtitle="Colores, dibujo y figuras"
      footer={
        <div className="flex items-center gap-2">
          <Button variant="ghost" className="h-11" icon={<RotateCcw className="size-4" />} disabled={busy || sameBallDesign(draft, plain)} onClick={() => void reset()}>
            Restablecer
          </Button>
          <Button variant="primary" className="h-11 flex-1" loading={busy} disabled={busy} onClick={() => void save()}>
            Guardar
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {/* La bola se queda arriba al bajar (menos con el teclado abierto: taparía lo que se escribe). */}
        <div className="sticky top-0 z-10 -mx-5 bg-surface px-5 pb-1 [dialog[data-kb]_&]:static">
          <div className="flex justify-center rounded-3xl bg-surface-2 py-3">
            <div className={cx('relative', tab === 'figuras' && sticker ? 'cursor-crosshair' : draft.stickers.length > 0 && 'cursor-pointer')} onClick={tap}>
              <BallArt design={draft} size={PREVIEW} label={`Así se ve la ${ball.name}`} className="block size-32 [@media(min-height:740px)]:size-40" />
              {ring && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-white shadow-[0_0_0_1.5px_rgb(0_0_0/0.6)]"
                  style={{ left: `${ring.left}%`, top: `${ring.top}%`, width: `${ring.diameter}%`, height: `${ring.diameter}%` }}
                />
              )}
            </div>
          </div>
        </div>

        <div role="tablist" aria-label="Qué cambias" className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
          {DESIGN_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cx(
                'flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                tab === t.key ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
              )}
            >
              {t.label}
              {t.key === 'figuras' && draft.stickers.length > 0 && (
                <span className="rounded-full bg-accent px-1.5 text-[11px] leading-4 text-accent-fg">{draft.stickers.length}</span>
              )}
            </button>
          ))}
        </div>

        {tab === 'colores' && <DesignColors draft={draft} slot={slot} onSlot={setSlot} onColor={(k, hex) => setDraft((d) => withSlotColor(d, k, hex))} />}
        {tab === 'dibujo' && <DesignPattern draft={draft} onPattern={pickPattern} onChange={change} />}
        {tab === 'figuras' && (
          <DesignStickers
            draft={draft}
            picked={picked}
            initials={initials}
            onPick={setPicked}
            onAdd={add}
            onRemove={remove}
            onSticker={changeSticker}
          />
        )}
      </div>
    </Sheet>
  );
}

// ---------- Las pestañas ----------

/**
 * «Colores»: en los dibujos, cuál de los tres se cambia (la base, el segundo o el tercero; esos dos pueden ser el
 * automático) y la paleta; en la sólida, solo la base.
 */
export function DesignColors({
  draft,
  slot,
  onSlot,
  onColor,
}: {
  draft: BallDesign;
  slot: ColorSlot;
  onSlot: (s: ColorSlot) => void;
  onColor: (slot: ColorSlot, hex: string | null) => void;
}) {
  const three = patternInfo(draft.pattern).colors === 3;
  const active: ColorSlot = three ? slot : 'base';
  return (
    <div role="tabpanel" aria-label="Colores" className="flex flex-col gap-4">
      {three && (
        <div role="radiogroup" aria-label="Qué color cambias" className="grid grid-cols-3 gap-2">
          {COLOR_SLOTS.map((s) => {
            const on = active === s.key;
            const auto = s.key !== 'base' && draft[s.key] == null;
            return (
              <button
                key={s.key}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={`${s.title}${auto ? ' (automático)' : ''}`}
                onClick={() => onSlot(s.key)}
                className={cx(
                  'flex min-h-11 min-w-0 flex-col items-center gap-1 rounded-xl border px-1 py-1.5 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                  on ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2',
                )}
              >
                <Swatch color={slotColor(draft, s.key)} className="size-7">
                  {auto ? 'A' : undefined}
                </Swatch>
                <span className={cx('w-full truncate text-center text-xs leading-tight font-medium', on && 'text-accent')}>{s.label}</span>
              </button>
            );
          })}
        </div>
      )}
      <ColorPicker
        label={three ? COLOR_SLOTS.find((s) => s.key === active)!.title : 'Color de la bola'}
        value={active === 'base' ? draft.base : draft[active]}
        auto={active === 'base' ? undefined : slotColor({ ...draft, [active]: null }, active)}
        onChange={(hex) => onColor(active, hex)}
      />
      <p className="text-xs text-muted">
        {three
          ? 'La «A» es el automático: sale de la base (más claro en una bola oscura, más oscuro en una clara).'
          : 'La sólida es de un solo color. Los dibujos (en «Dibujo») usan dos colores más.'}
      </p>
    </div>
  );
}

/** «Dibujo»: los dibujos (con la bola chica de cada uno), tamaño, suavidad y ángulo (menos en la sólida), brillo y huecos. */
export function DesignPattern({
  draft,
  onPattern,
  onChange,
}: {
  draft: BallDesign;
  onPattern: (p: BallPattern) => void;
  onChange: (patch: Partial<BallDesign>) => void;
}) {
  return (
    <div role="tabpanel" aria-label="Dibujo" className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="Dibujo" className="grid grid-cols-4 gap-2">
        {BALL_PATTERNS.map((p) => (
          <PatternChip
            key={p.key}
            pattern={p.key}
            label={p.label}
            on={draft.pattern === p.key}
            base={draft.base}
            second={draft.second}
            third={draft.third}
            onPick={onPattern}
          />
        ))}
      </div>
      {patternInfo(draft.pattern).sliders ? (
        <div className="flex flex-col gap-2">
          <Slider label="Tamaño del dibujo" value={draft.scale} min={0.5} max={2} step={0.05} text={percent(draft.scale)} onChange={(scale) => onChange({ scale })} />
          <Slider label="Suavidad de los bordes" value={draft.softness} min={0} max={1} step={0.05} text={percent(draft.softness)} onChange={(softness) => onChange({ softness })} />
          <Slider label="Ángulo" value={draft.angle} min={0} max={359} step={1} text={`${Math.round(draft.angle)}°`} onChange={(angle) => onChange({ angle })} />
        </div>
      ) : (
        <p className="text-xs text-muted">La sólida no tiene dibujo: elige otro para cambiarle el tamaño, la suavidad y el ángulo.</p>
      )}
      <div className="flex flex-col gap-2">
        <SwitchRow label="Brillo" hint="Pulida y brillante; sin brillo se ve mate." on={draft.shine} onChange={(shine) => onChange({ shine })} />
        <SwitchRow label="Huecos" hint="Los dos de los dedos y el del pulgar." on={draft.holes} onChange={(holes) => onChange({ holes })} />
      </div>
    </div>
  );
}

/**
 * «Figuras»: agregar (hasta 5; las iniciales con las de la cuenta), elegir una de las que tiene y cambiar la elegida
 * (StickerEditor).
 */
export function DesignStickers({
  draft,
  picked,
  initials,
  onPick,
  onAdd,
  onRemove,
  onSticker,
}: {
  draft: BallDesign;
  picked: number | null;
  initials: string;
  onPick: (i: number | null) => void;
  onAdd: (shape: BallStickerShape) => void;
  onRemove: (i: number) => void;
  onSticker: (i: number, fn: (s: BallSticker) => BallSticker) => void;
}) {
  const full = draft.stickers.length >= BALL_STICKERS_MAX;
  const sticker = picked != null ? (draft.stickers[picked] ?? null) : null;
  // El color con que saldría una nueva: el de los botones para agregar.
  const addColor = newSticker('estrella', draft).color;
  return (
    <div role="tabpanel" aria-label="Figuras" className="flex flex-col gap-4">
      <fieldset className="flex min-w-0 flex-col gap-1.5">
        <legend className="mb-1.5 text-xs font-medium text-muted">{`Agregar una figura (${draft.stickers.length} de ${BALL_STICKERS_MAX})`}</legend>
        <div className="grid grid-cols-4 gap-2">
          {BALL_STICKER_SHAPES.map((s) => (
            <button
              key={s.key}
              type="button"
              disabled={full}
              onClick={() => onAdd(s.key)}
              aria-label={`Agregar: ${s.label}`}
              className="flex min-h-11 min-w-0 flex-col items-center gap-1 rounded-xl border border-line px-1 py-2 text-[11px] font-medium transition hover:bg-surface-2 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50"
            >
              <StickerArt shape={s.key} color={addColor} text={sampleText(s.key, initials)} size={28} />
              <span className="w-full truncate text-center">{s.label}</span>
            </button>
          ))}
        </div>
        {full && <p className="text-xs text-muted">{`Ya tiene ${BALL_STICKERS_MAX} figuras: quita una para agregar otra.`}</p>}
      </fieldset>

      {draft.stickers.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">Sus figuras</span>
          <div role="radiogroup" aria-label="Sus figuras" className="flex flex-wrap gap-2">
            {draft.stickers.map((s, i) => (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={picked === i}
                onClick={() => onPick(picked === i ? null : i)}
                className={cx(
                  'inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-2.5 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                  picked === i ? 'border-accent bg-accent-soft text-accent' : 'border-line hover:bg-surface-2',
                )}
              >
                <StickerArt shape={s.shape} color={s.color} text={s.text} size={24} />
                {stickerName(s)}
              </button>
            ))}
          </div>
        </div>
      )}

      {sticker && picked != null ? (
        <StickerEditor key={picked} sticker={sticker} onChange={(fn) => onSticker(picked, fn)} onRemove={() => onRemove(picked)} />
      ) : (
        draft.stickers.length > 0 && <p className="text-xs text-muted">Elige una figura (o tócala en la bola) para cambiarle el color, moverla, agrandarla o girarla.</p>
      )}
    </div>
  );
}

// ---------- Piezas ----------

/**
 * Un círculo de color. El borde oscuro se ve sobre el fondo claro (una blanca) y el aro claro sobre el oscuro (una
 * negra): así se ven todos en los dos temas.
 */
function Swatch({ color, className, children }: { color: string; className?: string; children?: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full border border-black/20 text-[11px] font-bold shadow-[0_0_0_1px_rgb(255_255_255/0.3),inset_-2px_-2px_4px_rgb(0_0_0/0.25)]',
        className,
      )}
      style={{ backgroundColor: color, color: readableOn(color) }}
    >
      {children}
    </span>
  );
}

/**
 * Elegir un color: la paleta de las bolas (y el automático, si hay), el selector del teléfono y el código #rrggbb.
 * `value` null = el automático (`auto` es cómo se ve).
 */
function ColorPicker({ label, value, auto, onChange }: { label: string; value: string | null; auto?: string; onChange: (hex: string | null) => void }) {
  const shown = value ?? auto ?? '#000000';
  const own = value != null && !BALL_COLORS.some((c) => c.hex === value);
  const choice = (key: string, on: boolean, name: string, color: string, pick: () => void, mark?: string) => (
    <button
      key={key}
      type="button"
      role="radio"
      aria-checked={on}
      aria-label={name}
      title={name}
      onClick={pick}
      className={cx(
        'flex size-11 items-center justify-center rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        on ? 'bg-accent-soft ring-2 ring-accent' : 'hover:bg-surface-2',
      )}
    >
      <Swatch color={color} className={on ? 'size-8' : 'size-7'}>
        {mark}
      </Swatch>
    </button>
  );
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5">
      <legend className="mb-1.5 text-xs font-medium text-muted">{label}</legend>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
        {auto && choice('auto', value == null, 'Automático (sale de la base)', auto, () => onChange(null), 'A')}
        {BALL_COLORS.map((c) => choice(c.hex, value === c.hex, c.label, c.hex, () => onChange(c.hex)))}
      </div>
      <HexField value={shown} own={own} onChange={onChange} />
    </fieldset>
  );
}

/** Un color propio: el selector del teléfono y el código (#rrggbb o #rgb; se aplica cuando está completo). */
function HexField({ value, own, onChange }: { value: string; own: boolean; onChange: (hex: string) => void }) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  // Cambió desde afuera (la paleta, el selector): el código lo muestra, salvo que sea lo que se está escribiendo.
  if (seen !== value) {
    setSeen(value);
    if (cleanColor(text) !== value) setText(value);
  }
  const bad = cleanColor(text) == null;
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        aria-label="Elegir otro color"
        value={value}
        onChange={(e) => {
          const c = cleanColor(e.target.value);
          if (c) onChange(c);
        }}
        className={cx('size-11 shrink-0 cursor-pointer rounded-xl border bg-surface p-1', own ? 'border-accent ring-2 ring-accent' : 'border-line')}
      />
      <Input
        value={text}
        maxLength={7}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-label="Código del color (#rrggbb)"
        aria-invalid={bad || undefined}
        placeholder="#1d4ed8"
        className="h-11 max-w-32 font-mono"
        onChange={(e) => {
          setText(e.target.value);
          const c = cleanColor(e.target.value);
          if (c) onChange(c);
        }}
        onBlur={() => {
          if (bad) setText(value);
        }}
      />
      <span className={cx('text-xs', bad ? 'text-danger' : 'text-muted')}>{bad ? 'Usa #rrggbb' : 'Otro color'}</span>
    </div>
  );
}

/** Un dibujo para elegir: la bola chica con ese dibujo y los colores de ahora (solo cambia si cambian los colores). */
const PatternChip = memo(function PatternChip({
  pattern,
  label,
  on,
  base,
  second,
  third,
  onPick,
}: {
  pattern: BallPattern;
  label: string;
  on: boolean;
  base: string;
  second: string | null;
  third: string | null;
  onPick: (p: BallPattern) => void;
}) {
  const thumb: BallDesign = { ...defaultBallDesign(base), second, third, pattern, holes: false };
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      aria-label={label}
      onClick={() => onPick(pattern)}
      className={cx(
        'flex min-h-11 min-w-0 flex-col items-center gap-1 rounded-xl border px-1 py-1.5 transition active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        on ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2',
      )}
    >
      <BallArt design={thumb} size={40} />
      <span className={cx('w-full truncate text-center text-[11px] leading-tight font-medium', on && 'text-accent')}>{label}</span>
    </button>
  );
});

/** Un control deslizable con su nombre y su valor (44 px de alto para el dedo). */
function Slider({ label, value, min, max, step, text, onChange }: { label: string; value: number; min: number; max: number; step: number; text: string; onChange: (v: number) => void }) {
  const id = useId();
  return (
    <div className="flex flex-col">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-xs font-medium text-muted">
          {label}
        </label>
        <span className="text-xs text-muted tabular-nums">{text}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={text}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-11 w-full cursor-pointer accent-[var(--accent)]"
      />
    </div>
  );
}

/** Un interruptor con su texto (44 px de alto). */
function SwitchRow({ label, hint, on, onChange }: { label: string; hint: string; on: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-line px-3 py-2">
      <span className="min-w-0 flex-1 text-sm">
        <span className="block font-medium">{label}</span>
        <span id={`${id}-ayuda`} className="block text-xs text-muted">
          {hint}
        </span>
      </span>
      <input
        id={id}
        type="checkbox"
        role="switch"
        aria-label={label}
        aria-describedby={`${id}-ayuda`}
        checked={on}
        onChange={(e) => onChange(e.target.checked)}
        className="size-5 shrink-0 accent-[var(--accent)]"
      />
    </label>
  );
}

/** Lo de la figura elegida: su texto (número o iniciales), su color, moverla, agrandarla, girarla y quitarla. */
function StickerEditor({ sticker: s, onChange, onRemove }: { sticker: BallSticker; onChange: (fn: (s: BallSticker) => BallSticker) => void; onRemove: () => void }) {
  const move = (dx: number, dy: number) => onChange((x) => moveSticker(x, dx, dy));
  const arrow = (label: string, icon: ReactNode, dx: number, dy: number, cell: string) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => move(dx, dy)}
      className={cx(
        'inline-flex size-11 items-center justify-center rounded-xl border border-line text-fg transition hover:bg-surface-2 active:scale-[0.95] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        cell,
      )}
    >
      {icon}
    </button>
  );
  return (
    <fieldset className="flex min-w-0 flex-col gap-4 rounded-2xl border border-line p-3">
      <legend className="px-1 text-xs font-medium text-muted">{stickerName(s)}</legend>
      {stickerInfo(s.shape).text && <StickerText shape={s.shape} value={cleanStickerText(s.shape, s.text)} onChange={(text) => onChange((x) => ({ ...x, text }))} />}
      <ColorPicker label="Color de la figura" value={s.color} onChange={(hex) => hex && onChange((x) => ({ ...x, color: hex }))} />
      <div className="flex items-center gap-3">
        <div role="group" aria-label="Mover la figura" className="grid shrink-0 grid-cols-3 gap-1">
          {arrow('Mover arriba', <ArrowUp className="size-4" aria-hidden="true" />, 0, -STICKER_STEP, 'col-start-2')}
          {arrow('Mover a la izquierda', <ArrowLeft className="size-4" aria-hidden="true" />, -STICKER_STEP, 0, 'col-start-1')}
          {arrow('Mover a la derecha', <ArrowRight className="size-4" aria-hidden="true" />, STICKER_STEP, 0, 'col-start-3')}
          {arrow('Mover abajo', <ArrowDown className="size-4" aria-hidden="true" />, 0, STICKER_STEP, 'col-start-2')}
        </div>
        <p className="text-xs text-muted">Muévela con las flechas o toca la bola donde la quieres. Toca otra figura en la bola para elegirla.</p>
      </div>
      <Slider label="Tamaño" value={s.size} min={0.1} max={0.6} step={0.02} text={percent(s.size)} onChange={(size) => onChange((x) => ({ ...x, size }))} />
      <Slider label="Giro" value={s.rotation} min={0} max={359} step={1} text={`${Math.round(s.rotation)}°`} onChange={(rotation) => onChange((x) => ({ ...x, rotation }))} />
      <button
        type="button"
        onClick={onRemove}
        className="inline-flex h-11 items-center gap-2 self-start rounded-xl px-3 text-sm font-medium text-danger transition select-none hover:bg-danger-soft active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <Trash2 className="size-4" aria-hidden="true" /> Quitar la figura
      </button>
    </fieldset>
  );
}

/** El texto del número o de las iniciales: se limpia al escribirlo (solo cifras o letras, hasta 3) y nunca queda vacío. */
function StickerText({ shape, value, onChange }: { shape: BallStickerShape; value: string; onChange: (text: string) => void }) {
  const id = useId();
  const digits = stickerInfo(shape).text === 'digits';
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    if (cleanStickerText(shape, text) !== value) setText(value);
  }
  const empty = !text;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-muted">
        {digits ? `Número (hasta ${BALL_STICKER_TEXT_MAX} cifras)` : `Iniciales (hasta ${BALL_STICKER_TEXT_MAX} letras)`}
      </label>
      <Input
        id={id}
        value={text}
        maxLength={BALL_STICKER_TEXT_MAX}
        inputMode={digits ? 'numeric' : 'text'}
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        aria-invalid={empty || undefined}
        className="h-11 max-w-32 text-center font-bold tracking-widest"
        onChange={(e) => {
          const clean = cleanStickerText(shape, e.target.value);
          setText(clean);
          if (clean) onChange(clean);
        }}
        onBlur={() => {
          if (!text) setText(value);
        }}
      />
      {empty && <span className="text-xs text-danger">{digits ? 'Escribe de 1 a 3 cifras.' : 'Escribe de 1 a 3 letras.'}</span>}
    </div>
  );
}
