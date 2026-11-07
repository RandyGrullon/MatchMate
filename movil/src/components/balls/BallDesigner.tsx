import { memo, useRef, useState, type ReactNode } from 'react';
import { Pressable, View, useWindowDimensions, type GestureResponderEvent, type StyleProp, type TextStyle } from 'react-native';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, RotateCcw, Trash2 } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import type { Ball } from '@mm/lib/balls';
import {
  BALL_PATTERNS,
  BALL_STICKER_SHAPES,
  BALL_STICKER_TEXT_MAX,
  BALL_STICKERS_MAX,
  ballDesignOf,
  cleanStickerText,
  defaultBallDesign,
  initialsOf,
  newSticker,
  patternInfo,
  sameBallDesign,
  stickerInfo,
  type BallDesign,
  type BallPattern,
  type BallSticker,
  type BallStickerShape,
} from '@mm/lib/ballDesign';
import { ballDesignErrorText, setBallDesign } from '@mm/lib/data/balls';
import {
  COLOR_SLOTS,
  DESIGN_LEAVE,
  DESIGN_PREVIEW,
  DESIGN_PREVIEW_SHORT,
  DESIGN_RESET,
  DESIGN_SHORT_SCREEN,
  DESIGN_SWITCHES,
  DESIGN_TABS,
  PATTERN_SLIDERS,
  SOLID_NO_SLIDERS,
  STICKER_ARROWS,
  STICKER_MOVE_HINT,
  STICKER_PICK_HINT,
  STICKER_SLIDERS,
  STICKERS_FULL,
  addStickerColor,
  ballTap,
  colorsHint,
  designNeedsSave,
  designToSave,
  moveSticker,
  patternThumb,
  resetWarning,
  sampleText,
  slotColor,
  stickerName,
  stickerRing,
  stickerTextError,
  stickerTextLabel,
  stickersLegend,
  tapToBall,
  withSlotColor,
  type ColorSlot,
  type DesignTab,
} from '@mm/components/balls/designer';
import { SwitchRow } from '@/components/prizes/parts';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { confirmAsync, toast } from '../feedback';
import { Button, Input, Txt } from '../ui';
import { BallArt, StickerArt } from './BallArt';
import { ColorPicker, DesignSlider, Swatch } from './DesignControls';
import { DesignerSheet, useKeyboardOpen } from './DesignerSheet';

/**
 * «Diseñar» en Mis bolas (BallDesigner de la web, con la misma lógica: src/components/balls/designer.ts y
 * src/lib/ballDesign.ts): el creador de la bola en la hoja de abajo. Arriba la bola grande, que cambia con cada toque (se
 * queda a la vista al bajar, menos con el teclado abierto); abajo tres pestañas: «Colores» (la base y, en los dibujos,
 * dos colores más: de la paleta, uno propio o el automático que sale de la base), «Dibujo» (perlada, jaspeada,
 * galaxia…, con tamaño, suavidad y ángulo; brillo y huecos) y «Figuras» (hasta 5: estrella, llama, número, iniciales…,
 * con su color, moverlas con las flechas o tocando la bola, agrandarlas, girarlas y quitarlas). «Restablecer» la deja
 * lisa, de su color; «Guardar» la guarda (setBallDesign: se ve enseguida en la lista). Restablecer y cerrar con cambios
 * preguntan antes. Se monta abierta: la pantalla la quita al cerrar.
 *
 * «Otro color» (el selector del navegador en la web) es en el teléfono un tablero de tono y brillo (DesignControls.tsx).
 */
export function BallDesigner({ ball, onClose }: { ball: Ball; onClose: () => void }) {
  const c = useColors();
  const auth = useAuth();
  const keyboard = useKeyboardOpen();
  // 128 en una pantalla bajita, para que quepan los controles debajo (como la web).
  const preview = useWindowDimensions().height < DESIGN_SHORT_SCREEN ? DESIGN_PREVIEW_SHORT : DESIGN_PREVIEW;
  const [initial] = useState(() => ballDesignOf(ball));
  const [draft, setDraft] = useState<BallDesign>(initial);
  const [tab, setTab] = useState<DesignTab>('colores');
  const [slot, setSlot] = useState<ColorSlot>('base');
  const [picked, setPicked] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  // Dónde empezó el toque sobre la bola.
  const touch = useRef({ x: Number.NaN, y: Number.NaN });

  const sticker = picked != null ? (draft.stickers[picked] ?? null) : null;
  const plain = defaultBallDesign(ball.color, ball.cover);
  const initials = initialsOf(auth.profile?.name);

  const change = (patch: Partial<BallDesign>) => setDraft((d) => ({ ...d, ...patch }));
  const changeSticker = (i: number, fn: (s: BallSticker) => BallSticker) =>
    setDraft((d) => ({ ...d, stickers: d.stickers.map((s, j) => (j === i ? fn(s) : s)) }));
  const pickPattern = (pattern: BallPattern) => setDraft((d) => ({ ...d, pattern }));

  async function close() {
    if (busy) return;
    if (!sameBallDesign(draft, initial)) {
      const ok = await confirmAsync({ ...DESIGN_LEAVE, danger: true });
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
    const ok = await confirmAsync({ ...DESIGN_RESET, message: warning, danger: true });
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
   * donde no hay otra la pone ahí. Dónde: lo que dice el toque al empezar (al soltar, se hace).
   */
  function tap({ x, y }: { x: number; y: number }) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const p = tapToBall(x, y, preview, preview, preview);
    const act = ballTap(draft.stickers, picked, p, tab === 'figuras' && sticker != null);
    if (act == null) return;
    if ('move' in act) {
      changeSticker(act.move, (s) => ({ ...s, x: act.x, y: act.y }));
      return;
    }
    setPicked(act.pick);
    setTab('figuras');
  }

  const ring = tab === 'figuras' && sticker ? stickerRing(sticker, preview) : null;
  const ringSize = ring ? (ring.diameter / 100) * preview : 0;

  const ballView = (
    <View style={{ alignItems: 'center', borderRadius: 24, backgroundColor: c.surface2, paddingVertical: 12 }}>
      {/* El lector de pantalla lee la bola (con su nombre); tocarla es para el dedo (el lugar sale de los eventos del
          toque: el onPress de un Pressable en la vista previa web no lo trae). */}
      <View
        onStartShouldSetResponder={() => true}
        onResponderGrant={(e: GestureResponderEvent) => {
          touch.current = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY };
        }}
        onResponderRelease={() => tap(touch.current)}
        style={{ width: preview, height: preview }}
      >
        <BallArt design={draft} size={preview} label={`Así se ve la ${ball.name}`} style={{ pointerEvents: 'none' }} />
        {ring && (
          <View
            aria-hidden
            style={{
              pointerEvents: 'none',
              position: 'absolute',
              left: (ring.left / 100) * preview - ringSize / 2 - 1.5,
              top: (ring.top / 100) * preview - ringSize / 2 - 1.5,
              width: ringSize + 3,
              height: ringSize + 3,
              borderRadius: ringSize,
              borderWidth: 1.5,
              borderColor: 'rgba(0,0,0,0.6)',
            }}
          >
            <View style={{ flex: 1, borderRadius: ringSize, borderWidth: 2, borderStyle: 'dashed', borderColor: '#ffffff' }} />
          </View>
        )}
      </View>
    </View>
  );

  return (
    <DesignerSheet
      title={`Diseñar la ${ball.name}`}
      subtitle="Colores, dibujo y figuras"
      onClose={() => void close()}
      // La bola se queda arriba al bajar (menos con el teclado abierto: taparía lo que se escribe).
      top={keyboard ? null : ballView}
      footer={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Button variant="quiet" size="xl" icon={<RotateCcw size={16} color={c.fg} />} disabled={busy || sameBallDesign(draft, plain)} onPress={() => void reset()}>
            Restablecer
          </Button>
          <View style={{ flex: 1 }}>
            <Button variant="primary" size="xl" full loading={busy} disabled={busy} onPress={() => void save()}>
              Guardar
            </Button>
          </View>
        </View>
      }
    >
      {keyboard && ballView}
      <DesignTabs value={tab} onChange={setTab} count={draft.stickers.length} />
      {tab === 'colores' && <DesignColors draft={draft} slot={slot} onSlot={setSlot} onColor={(k, hex) => setDraft((d) => withSlotColor(d, k, hex))} />}
      {tab === 'dibujo' && <DesignPattern draft={draft} onPattern={pickPattern} onChange={change} />}
      {tab === 'figuras' && (
        <DesignStickers draft={draft} picked={picked} initials={initials} onPick={setPicked} onAdd={add} onRemove={remove} onSticker={changeSticker} />
      )}
    </DesignerSheet>
  );
}

// ---------- Piezas chicas ----------

/** Una línea de ayuda (text-xs text-muted de la web). */
function Hint({ children, tone = 'muted', style }: { children: ReactNode; tone?: 'muted' | 'danger'; style?: StyleProp<TextStyle> }) {
  return (
    <Txt variant="small" tone={tone} style={[{ fontFamily: font.regular }, style]}>
      {children}
    </Txt>
  );
}

/** El nombre de un grupo de controles (el <legend> de la web). */
function Label({ children }: { children: ReactNode }) {
  return (
    <Txt variant="small" tone="muted">
      {children}
    </Txt>
  );
}

/** Colores · Dibujo · Figuras: un segmentado (son 3), con cuántas figuras lleva. */
function DesignTabs({ value, onChange, count }: { value: DesignTab; onChange: (t: DesignTab) => void; count: number }) {
  const c = useColors();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Qué cambias" style={{ flexDirection: 'row', borderRadius: 14, padding: 4, gap: 4, backgroundColor: c.surface2 }}>
      {DESIGN_TABS.map((t) => {
        const on = t.key === value;
        return (
          <Pressable
            key={t.key}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(t.key)}
            style={[
              { flex: 1, height: 40, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
              on && { backgroundColor: c.segOn, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
            ]}
          >
            <Txt variant="bodyStrong" tone={on ? 'fg' : 'muted'} numberOfLines={1}>
              {t.label}
            </Txt>
            {t.key === 'figuras' && count > 0 && (
              <View style={{ minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accent }}>
                <Txt style={{ fontSize: 11, lineHeight: 13, fontFamily: font.bold, color: c.accentFg }}>{count}</Txt>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------- Las pestañas ----------

/**
 * «Colores»: en los dibujos, cuál de los tres se cambia (la base, el segundo o el tercero; esos dos pueden ser el
 * automático) y la paleta; en la sólida, solo la base.
 */
function DesignColors({
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
  const c = useColors();
  const three = patternInfo(draft.pattern).colors === 3;
  const active: ColorSlot = three ? slot : 'base';
  return (
    <View accessibilityLabel="Colores" style={{ gap: 16 }}>
      {three && (
        <View accessibilityRole="radiogroup" accessibilityLabel="Qué color cambias" style={{ flexDirection: 'row', gap: 8 }}>
          {COLOR_SLOTS.map((s) => {
            const on = active === s.key;
            const auto = s.key !== 'base' && draft[s.key] == null;
            return (
              <Pressable
                key={s.key}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${s.title}${auto ? ' (automático)' : ''}`}
                onPress={() => onSlot(s.key)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  minHeight: 44,
                  alignItems: 'center',
                  gap: 4,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: on ? c.accent : c.line,
                  backgroundColor: on ? c.accentSoft : 'transparent',
                  paddingHorizontal: 4,
                  paddingVertical: 6,
                }}
              >
                <Swatch color={slotColor(draft, s.key)} size={28}>
                  {auto ? 'A' : undefined}
                </Swatch>
                <Txt numberOfLines={1} style={{ fontSize: 12, lineHeight: 15, fontFamily: font.medium, color: on ? c.accent : c.fg }}>
                  {s.label}
                </Txt>
              </Pressable>
            );
          })}
        </View>
      )}
      <ColorPicker
        label={three ? (COLOR_SLOTS.find((s) => s.key === active)?.title ?? '') : 'Color de la bola'}
        value={active === 'base' ? draft.base : draft[active]}
        auto={active === 'base' ? undefined : slotColor({ ...draft, [active]: null }, active)}
        onChange={(hex) => onColor(active, hex)}
      />
      <Hint>{colorsHint(three)}</Hint>
    </View>
  );
}

/** «Dibujo»: los dibujos (con la bola chica de cada uno), tamaño, suavidad y ángulo (menos en la sólida), brillo y huecos. */
function DesignPattern({ draft, onPattern, onChange }: { draft: BallDesign; onPattern: (p: BallPattern) => void; onChange: (patch: Partial<BallDesign>) => void }) {
  return (
    <View accessibilityLabel="Dibujo" style={{ gap: 16 }}>
      <View accessibilityRole="radiogroup" accessibilityLabel="Dibujo" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
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
      </View>
      {patternInfo(draft.pattern).sliders ? (
        <View style={{ gap: 8 }}>
          {PATTERN_SLIDERS.map((s) => (
            <DesignSlider key={s.key} label={s.label} value={draft[s.key]} min={s.min} max={s.max} step={s.step} text={s.text(draft[s.key])} onChange={(v) => onChange({ [s.key]: v })} />
          ))}
        </View>
      ) : (
        <Hint>{SOLID_NO_SLIDERS}</Hint>
      )}
      <View style={{ gap: 8 }}>
        {DESIGN_SWITCHES.map((s) => (
          <SwitchRow key={s.key} label={s.label} hint={s.hint} on={draft[s.key]} onChange={(v) => onChange({ [s.key]: v })} />
        ))}
      </View>
    </View>
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
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      onPress={() => onPick(pattern)}
      style={({ pressed }) => ({
        flexBasis: '22%',
        flexGrow: 1,
        minWidth: 0,
        minHeight: 44,
        alignItems: 'center',
        gap: 4,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: on ? c.accent : c.line,
        backgroundColor: on ? c.accentSoft : 'transparent',
        paddingHorizontal: 4,
        paddingVertical: 6,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}
    >
      <BallArt design={patternThumb(pattern, base, second, third)} size={40} />
      <Txt numberOfLines={1} style={{ fontSize: 11, lineHeight: 14, fontFamily: font.medium, color: on ? c.accent : c.fg }}>
        {label}
      </Txt>
    </Pressable>
  );
});

/**
 * «Figuras»: agregar (hasta 5; las iniciales con las de la cuenta), elegir una de las que tiene y cambiar la elegida
 * (StickerEditor).
 */
function DesignStickers({
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
  const c = useColors();
  const full = draft.stickers.length >= BALL_STICKERS_MAX;
  const sticker = picked != null ? (draft.stickers[picked] ?? null) : null;
  // El color con que saldría una nueva: el de los botones para agregar.
  const addColor = addStickerColor(draft);
  return (
    <View accessibilityLabel="Figuras" style={{ gap: 16 }}>
      <View style={{ gap: 6 }}>
        <Label>{stickersLegend(draft.stickers.length)}</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {BALL_STICKER_SHAPES.map((s) => (
            <Pressable
              key={s.key}
              accessibilityRole="button"
              accessibilityLabel={`Agregar: ${s.label}`}
              accessibilityState={{ disabled: full }}
              disabled={full}
              onPress={() => onAdd(s.key)}
              style={({ pressed }) => ({
                flexBasis: '22%',
                flexGrow: 1,
                minWidth: 0,
                minHeight: 44,
                alignItems: 'center',
                gap: 4,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: c.line,
                backgroundColor: pressed ? c.surface2 : 'transparent',
                paddingHorizontal: 4,
                paddingVertical: 8,
                opacity: full ? 0.5 : 1,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              })}
            >
              <StickerArt shape={s.key} color={addColor} text={sampleText(s.key, initials)} size={28} />
              <Txt numberOfLines={1} style={{ fontSize: 11, lineHeight: 14, fontFamily: font.medium, color: c.fg }}>
                {s.label}
              </Txt>
            </Pressable>
          ))}
        </View>
        {full && <Hint>{STICKERS_FULL}</Hint>}
      </View>

      {draft.stickers.length > 0 && (
        <View style={{ gap: 6 }}>
          <Label>Sus figuras</Label>
          <View accessibilityRole="radiogroup" accessibilityLabel="Sus figuras" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {draft.stickers.map((s, i) => {
              const on = picked === i;
              return (
                <Pressable
                  key={i}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  onPress={() => onPick(on ? null : i)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    minHeight: 44,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: on ? c.accent : c.line,
                    backgroundColor: on ? c.accentSoft : 'transparent',
                    paddingHorizontal: 10,
                  }}
                >
                  <StickerArt shape={s.shape} color={s.color} text={s.text} size={24} />
                  <Txt style={{ fontSize: 14, fontFamily: font.medium, color: on ? c.accent : c.fg }}>{stickerName(s)}</Txt>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {sticker && picked != null ? (
        <StickerEditor key={picked} sticker={sticker} onChange={(fn) => onSticker(picked, fn)} onRemove={() => onRemove(picked)} />
      ) : (
        draft.stickers.length > 0 && <Hint>{STICKER_PICK_HINT}</Hint>
      )}
    </View>
  );
}

/** El ícono de cada flecha. */
const ARROW_ICON = { up: ArrowUp, left: ArrowLeft, right: ArrowRight, down: ArrowDown } as const;

/** Lo de la figura elegida: su texto (número o iniciales), su color, moverla, agrandarla, girarla y quitarla. */
function StickerEditor({ sticker: s, onChange, onRemove }: { sticker: BallSticker; onChange: (fn: (s: BallSticker) => BallSticker) => void; onRemove: () => void }) {
  const c = useColors();
  const [up, left, right, down] = STICKER_ARROWS;
  const arrow = (a: (typeof STICKER_ARROWS)[number] | null) => {
    if (!a) return <View style={{ width: 44, height: 44 }} />;
    const Icon = ARROW_ICON[a.key];
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={a.label}
        onPress={() => onChange((x) => moveSticker(x, a.dx, a.dy))}
        style={({ pressed }) => ({
          width: 44,
          height: 44,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: c.line,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed ? c.surface2 : 'transparent',
          transform: [{ scale: pressed ? 0.95 : 1 }],
        })}
      >
        <Icon size={16} color={c.fg} />
      </Pressable>
    );
  };
  const row = (cells: ((typeof STICKER_ARROWS)[number] | null)[]) => (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {cells.map((a, i) => (
        <View key={i}>{arrow(a)}</View>
      ))}
    </View>
  );
  return (
    <View style={{ gap: 16, borderRadius: 16, borderWidth: 1, borderColor: c.line, padding: 12 }}>
      <Label>{stickerName(s)}</Label>
      {stickerInfo(s.shape).text && <StickerText shape={s.shape} value={cleanStickerText(s.shape, s.text)} onChange={(text) => onChange((x) => ({ ...x, text }))} />}
      <ColorPicker
        label="Color de la figura"
        value={s.color}
        onChange={(hex) => {
          if (hex) onChange((x) => ({ ...x, color: hex }));
        }}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View accessibilityLabel="Mover la figura" style={{ gap: 4 }}>
          {row([null, up, null])}
          {row([left, null, right])}
          {row([null, down, null])}
        </View>
        <Hint style={{ flex: 1 }}>{STICKER_MOVE_HINT}</Hint>
      </View>
      {STICKER_SLIDERS.map((k) => (
        <DesignSlider key={k.key} label={k.label} value={s[k.key]} min={k.min} max={k.max} step={k.step} text={k.text(s[k.key])} onChange={(v) => onChange((x) => ({ ...x, [k.key]: v }))} />
      ))}
      <Pressable
        accessibilityRole="button"
        onPress={onRemove}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          height: 44,
          alignSelf: 'flex-start',
          borderRadius: 12,
          paddingHorizontal: 12,
          backgroundColor: pressed ? c.dangerSoft : 'transparent',
          transform: [{ scale: pressed ? 0.97 : 1 }],
        })}
      >
        <Trash2 size={16} color={c.danger} />
        <Txt style={{ fontSize: 14, fontFamily: font.medium, color: c.danger }}>Quitar la figura</Txt>
      </Pressable>
    </View>
  );
}

/** El texto del número o de las iniciales: se limpia al escribirlo (solo cifras o letras, hasta 3) y nunca queda vacío. */
function StickerText({ shape, value, onChange }: { shape: BallStickerShape; value: string; onChange: (text: string) => void }) {
  const digits = stickerInfo(shape).text === 'digits';
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    if (cleanStickerText(shape, text) !== value) setText(value);
  }
  const empty = !text;
  const label = stickerTextLabel(shape);
  return (
    <View style={{ gap: 6 }}>
      <Label>{label}</Label>
      <Input
        value={text}
        maxLength={BALL_STICKER_TEXT_MAX}
        keyboardType={digits ? 'number-pad' : 'default'}
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect={false}
        spellCheck={false}
        accessibilityLabel={label}
        invalid={empty}
        onChangeText={(t) => {
          const clean = cleanStickerText(shape, t);
          setText(clean);
          if (clean) onChange(clean);
        }}
        onBlur={() => {
          if (!text) setText(value);
        }}
        style={{ height: 44, width: 128, borderRadius: 12, paddingHorizontal: 12, textAlign: 'center', fontFamily: font.bold, letterSpacing: 3 }}
      />
      {empty && <Hint tone="danger">{stickerTextError(shape)}</Hint>}
    </View>
  );
}
