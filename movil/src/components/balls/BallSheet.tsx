import { useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import { Palette, Trash2 } from 'lucide-react-native';
import { BALL_BRANDS, catalogBall, type CatalogBall } from '@mm/lib/ballCatalog';
import type { BallDesign } from '@mm/lib/ballDesign';
import {
  BALL_BRAND_MAX,
  BALL_COLORS,
  BALL_COVERS,
  BALL_NAME_MAX,
  RESURFACE_EVERY,
  ballDraftProblem,
  ballProblemText,
  catalogLook,
  cleanLayout,
  draftFromCatalog,
  layoutProblem,
  layoutProblemText,
  type Ball,
  type BallCover,
  type BallDraft,
} from '@mm/lib/balls';
import { ballErrorText, deleteBall } from '@mm/lib/data/balls';
import { BALL_WEIGHTS, ballDraftKey, ballToDraft, newBallDraft, saveBallSheet } from '@mm/components/balls/sheet';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { confirmAsync, toast } from '../feedback';
import { Button, Field, Input, Sheet, Txt } from '../ui';
import { BallArt } from './BallArt';
import { CatalogPick } from './BallCatalog';
import { BallLayoutFields } from './BallLayoutFields';
import { BallDot } from './bits';
import { ChoiceChips, DayField } from './inputs';

/** Cuántas marcas del catálogo se sugieren mientras se escribe (el <datalist> de la web). */
const BRAND_HINTS = 6;

/**
 * Hoja para registrar o cambiar una bola (BallSheet de la web, con la misma lógica: src/components/balls/sheet.ts):
 * arriba, cómo se ve y «Diseñar» (`onDesign`, en una que ya existe: el creador está en la web); «Buscar en el catálogo»;
 * nombre, marca (con las del catálogo para elegir), peso, color, cubierta, cuándo se perforó y se pulió por última vez y
 * la perforación. Todo opcional menos el nombre y el peso. Una bola con diseño no elige el color aquí. «Borrar»
 * pregunta antes. Se monta abierta: la pantalla la quita al cerrar. `catalog` (solo en una nueva): el modelo con que se
 * abre ya llena («Agregar a mi arsenal»).
 */
export function BallSheet({
  ball,
  today,
  catalog,
  onClose,
  onDesign,
  onSaved,
}: {
  ball: Ball | null;
  today: string;
  catalog?: string | null;
  onClose: () => void;
  onDesign?: () => void;
  onSaved?: (id: string) => void;
}) {
  const c = useColors();
  const [draft, setDraft] = useState<BallDraft>(() => (ball ? ballToDraft(ball) : newBallDraft(catalog)));
  // El diseño que se propone a una nueva con los colores del modelo (se le pone al guardarla).
  const [look, setLook] = useState<BallDesign | null>(() => {
    const cb = ball ? null : catalogBall(catalog);
    return cb ? catalogLook(cb) : null;
  });
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const [tried, setTried] = useState(false);
  const [brandFocus, setBrandFocus] = useState(false);
  const nameRef = useRef<ComponentRef<typeof TextInput>>(null);
  const problem = ballDraftProblem(draft, today);
  const layoutIssue = layoutProblem(cleanLayout(draft.layout));
  const set = <K extends keyof BallDraft>(k: K, v: BallDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  function pickCatalog(cb: CatalogBall) {
    setDraft((d) => draftFromCatalog(d, cb, !ball));
    if (!ball) setLook(catalogLook(cb));
  }

  function pickColor(hex: string) {
    set('color', hex);
    setLook(null);
  }

  async function save() {
    setTried(true);
    // La perforación está abajo: que se vea por qué no se guarda.
    if (layoutIssue && !problem) toast(layoutProblemText(layoutIssue), 'error');
    if (problem || layoutIssue || busy) return;
    setBusy('save');
    try {
      await saveBallSheet(draft, today, {
        toast,
        onSaved,
        onClose,
        before: ball,
        look: ball ? null : look,
        onKept: (id) => setDraft((d) => ({ ...d, id })),
      });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!ball || busy) return;
    const ok = await confirmAsync({
      title: `¿Borrar la ${ball.name}?`,
      message: 'Se borra la bola y con cuál juego la usaste (tus juegos quedan). Si ya no la usas, mejor retírala: sus números se quedan.',
      confirmText: 'Borrar',
      danger: true,
    });
    if (!ok) return;
    setBusy('delete');
    try {
      await deleteBall(ball.id);
      toast('Bola borrada');
      onClose();
    } catch (e) {
      toast(ballErrorText(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  const show = (p: typeof problem) => tried && problem === p;
  const designed = ball?.design != null;

  /** «Diseñar»: lo que se cambió aquí sin guardar se pierde (pregunta antes). */
  async function design() {
    if (!ball || !onDesign || busy) return;
    if (ballDraftKey(draft) !== ballDraftKey(ballToDraft(ball))) {
      const ok = await confirmAsync({
        title: '¿Diseñarla sin guardar?',
        message: 'Lo que cambiaste aquí se pierde. Si lo quieres, guarda primero y después la diseñas.',
        confirmText: 'Diseñar sin guardar',
      });
      if (!ok) return;
    }
    onDesign();
  }

  // Las marcas del catálogo que van con lo escrito (como las sugerencias del <datalist> de la web).
  const typed = draft.brand.trim().toLowerCase();
  const brandHints = brandFocus && typed ? BALL_BRANDS.filter((b) => b.toLowerCase().includes(typed) && b.toLowerCase() !== typed).slice(0, BRAND_HINTS) : [];

  return (
    <Sheet
      open
      onClose={onClose}
      title={ball ? ball.name : 'Agregar bola'}
      subtitle="Solo tú ves tus bolas"
      footer={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {ball && (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !!busy, busy: busy === 'delete' }}
              disabled={!!busy}
              onPress={() => void remove()}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                height: 56,
                paddingHorizontal: 16,
                borderRadius: 16,
                backgroundColor: pressed ? c.dangerSoft : 'transparent',
                opacity: busy ? 0.5 : 1,
              })}
            >
              {busy === 'delete' ? <ActivityIndicator color={c.danger} /> : <Trash2 size={20} color={c.danger} />}
              <Txt style={{ fontSize: 15, fontFamily: font.semibold, color: c.danger }}>Borrar</Txt>
            </Pressable>
          )}
          <View style={{ flex: 1 }}>
            <Button variant="primary" size="xl" full loading={busy === 'save'} disabled={!!busy} onPress={() => void save()}>
              Guardar
            </Button>
          </View>
        </View>
      }
    >
      <View style={{ gap: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 24, backgroundColor: c.surface2, paddingVertical: 12, paddingLeft: 14, paddingRight: 12 }}>
          <BallArt design={ball ? (ball.design ?? null) : look} color={draft.color} cover={draft.cover} size={64} />
          <Txt tone="fg2" style={{ flex: 1, minWidth: 0, fontSize: 14 }}>
            {!ball
              ? look
                ? 'Así se verá, con los colores del catálogo. Cuando la agregues la puedes diseñar a tu gusto.'
                : 'Así se verá. Cuando la agregues la puedes diseñar: colores, dibujo y figuras.'
              : designed
                ? 'Su color y su dibujo se cambian en «Diseñar».'
                : 'Hazla como la tuya: colores, dibujo y figuras.'}
          </Txt>
          {ball && onDesign && (
            <Button variant="soft" icon={<Palette size={16} color={c.accent} />} disabled={!!busy} onPress={() => void design()}>
              Diseñar
            </Button>
          )}
        </View>

        <CatalogPick
          value={draft.catalog ?? null}
          brand={draft.brand}
          name={draft.name}
          fresh={!ball}
          onPick={pickCatalog}
          onClear={() => {
            // Sin el modelo, tampoco sus colores (en una nueva): queda lisa, de su color.
            set('catalog', null);
            setLook(null);
          }}
          onManual={() => nameRef.current?.focus()}
        />

        <Field label="Nombre" hint={show('name') ? ballProblemText('name') : undefined} error={show('name')}>
          <Input
            ref={nameRef}
            accessibilityLabel="Nombre"
            value={draft.name}
            onChangeText={(t) => set('name', t)}
            maxLength={BALL_NAME_MAX}
            placeholder="Ej.: Phaze II, la azul"
            autoComplete="off"
            invalid={show('name')}
          />
        </Field>

        <Field label="Marca (opcional)">
          <Input
            accessibilityLabel="Marca (opcional)"
            value={draft.brand}
            onChangeText={(t) => set('brand', t)}
            onFocus={() => setBrandFocus(true)}
            // Un momento después: en la vista previa web el campo se suelta antes de que llegue el toque a la marca.
            onBlur={() => setTimeout(() => setBrandFocus(false), 200)}
            maxLength={BALL_BRAND_MAX}
            placeholder="Storm, Hammer…"
            autoComplete="off"
          />
          {brandHints.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {brandHints.map((b) => (
                <Pressable
                  key={b}
                  accessibilityRole="button"
                  onPress={() => set('brand', b)}
                  style={({ pressed }) => ({ height: 36, borderRadius: 18, paddingHorizontal: 14, justifyContent: 'center', backgroundColor: c.surface2, opacity: pressed ? 0.85 : 1 })}
                >
                  <Txt style={{ fontSize: 14, fontFamily: font.medium, color: c.fg }}>{b}</Txt>
                </Pressable>
              ))}
            </View>
          )}
        </Field>

        <Field label="Peso">
          <ChoiceChips<number> label="Peso" value={draft.weight} onChange={(w) => set('weight', w)} options={BALL_WEIGHTS.map((w) => ({ key: w, label: `${w} lb` }))} />
        </Field>

        {!designed && (
          <Field label="Color">
            <View accessibilityRole="radiogroup" accessibilityLabel="Color de la bola" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
              {BALL_COLORS.map((col) => {
                const on = draft.color.toLowerCase() === col.hex;
                return (
                  <Pressable
                    key={col.hex}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={col.label}
                    onPress={() => pickColor(col.hex)}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: on ? c.accentSoft : 'transparent',
                      borderWidth: on ? 2 : 0,
                      borderColor: c.accent,
                    }}
                  >
                    <BallDot color={col.hex} size={on ? 32 : 28} />
                  </Pressable>
                );
              })}
            </View>
          </Field>
        )}

        <Field label="Cubierta (opcional)">
          <ChoiceChips<string>
            label="Cubierta (opcional)"
            value={draft.cover ?? ''}
            onChange={(k) => set('cover', (k || null) as BallCover | null)}
            options={[{ key: '', label: 'No sé' }, ...BALL_COVERS.map((cv) => ({ key: cv.key, label: cv.label }))]}
          />
        </Field>

        <Field label="Perforada el (opcional)">
          <DayField label="Perforada el (opcional)" value={draft.drilledOn} max={today} onChange={(v) => set('drilledOn', v)} />
        </Field>
        <Field label="Última pulida (opcional)">
          <DayField label="Última pulida (opcional)" value={draft.resurfacedOn} max={today} onChange={(v) => set('resurfacedOn', v)} />
        </Field>
        {(show('dates') || show('weight') || show('color') || show('brand')) && problem && (
          <Txt variant="meta" tone="danger" accessibilityLiveRegion="polite">
            {ballProblemText(problem)}
          </Txt>
        )}
        <Txt tone="muted" style={{ fontSize: 13 }}>
          {`Desde la última pulida contamos tus juegos: cada ${RESURFACE_EVERY} juegos, más o menos, toca pulirla.`}
        </Txt>

        <BallLayoutFields value={draft.layout} onChange={(l) => set('layout', l)} />
      </View>
    </Sheet>
  );
}
