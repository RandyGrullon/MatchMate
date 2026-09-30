import { useState } from 'react';
import { Loader2, Palette, Trash2 } from 'lucide-react';
import {
  BALL_BRAND_MAX,
  BALL_COLORS,
  BALL_COVERS,
  BALL_MAX_WEIGHT,
  BALL_MIN_WEIGHT,
  BALL_NAME_MAX,
  DEFAULT_BALL_COLOR,
  RESURFACE_EVERY,
  ballDraftProblem,
  ballProblemText,
  type Ball,
  type BallCover,
  type BallDraft,
} from '../../lib/balls';
import { ballErrorText, deleteBall, saveBall } from '../../lib/data/balls';
import { useFeedback } from '../feedback';
import { Button, Field, Input, Select, Sheet, cx } from '../ui';
import { BallArt } from './BallArt';
import { BallDot } from './BallPicker';

/** Peso con el que arranca una nueva (el más común en adultos). */
const NEW_WEIGHT = 15;

const WEIGHTS = Array.from({ length: BALL_MAX_WEIGHT - BALL_MIN_WEIGHT + 1 }, (_, i) => BALL_MIN_WEIGHT + i);

/** Lo que se edita, desde la bola (o una nueva). */
export function ballToDraft(ball: Ball | null): BallDraft {
  return {
    id: ball?.id ?? null,
    name: ball?.name ?? '',
    brand: ball?.brand ?? '',
    weight: ball?.weight ?? NEW_WEIGHT,
    color: ball?.color ?? DEFAULT_BALL_COLOR,
    cover: ball?.cover ?? null,
    drilledOn: ball?.drilledOn ?? null,
    resurfacedOn: ball?.resurfacedOn ?? null,
    retired: ball?.retired ?? false,
  };
}

/**
 * Hoja para registrar o cambiar una bola: nombre, marca, peso, color (para reconocerla al anotar), cubierta y cuándo se
 * perforó y se pulió por última vez (todo opcional menos el nombre y el peso). Arriba, cómo se ve (con el color y la
 * cubierta que se eligen) y «Diseñar» (`onDesign`, en una que ya existe). Una bola con diseño no elige el color aquí:
 * sale de su diseño (set_ball_design lo copia; si se cambiara aquí, el dibujo seguiría con el de antes). «Borrar»
 * pregunta antes (mejor retirarla: sus números se quedan). Se monta abierta: la página la quita al cerrar.
 */
export function BallSheet({ ball, today, onClose, onDesign }: { ball: Ball | null; today: string; onClose: () => void; onDesign?: () => void }) {
  const { toast, confirm } = useFeedback();
  const [draft, setDraft] = useState<BallDraft>(() => ballToDraft(ball));
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const [tried, setTried] = useState(false);
  const problem = ballDraftProblem(draft, today);
  const set = <K extends keyof BallDraft>(k: K, v: BallDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  async function save() {
    setTried(true);
    if (problem || busy) return;
    setBusy('save');
    try {
      await saveBall(draft, today);
      toast(ball ? 'Bola guardada' : 'Bola agregada');
      onClose();
    } catch (e) {
      toast(ballErrorText(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!ball || busy) return;
    const ok = await confirm({
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
    if (JSON.stringify(draft) !== JSON.stringify(ballToDraft(ball))) {
      const ok = await confirm({
        title: '¿Diseñarla sin guardar?',
        message: 'Lo que cambiaste aquí se pierde. Si lo quieres, guarda primero y después la diseñas.',
        confirmText: 'Diseñar sin guardar',
      });
      if (!ok) return;
    }
    onDesign();
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={ball ? ball.name : 'Agregar bola'}
      subtitle="Solo tú ves tus bolas"
      footer={
        <div className="flex items-center gap-2">
          {ball && (
            <button
              type="button"
              disabled={!!busy}
              onClick={() => void remove()}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium text-danger transition select-none hover:bg-danger-soft active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50"
            >
              {busy === 'delete' ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Trash2 className="size-4" aria-hidden="true" />}
              Borrar
            </button>
          )}
          <Button variant="primary" className="h-11 flex-1" loading={busy === 'save'} disabled={!!busy} onClick={() => void save()}>
            Guardar
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
          <BallArt design={ball?.design ?? null} color={draft.color} cover={draft.cover} size={64} className="shrink-0" />
          <p className="min-w-0 flex-1 text-sm text-muted">
            {!ball
              ? 'Así se verá. Cuando la agregues la puedes diseñar: colores, dibujo y figuras.'
              : designed
                ? 'Su color y su dibujo se cambian en «Diseñar».'
                : 'Hazla como la tuya: colores, dibujo y figuras.'}
          </p>
          {ball && onDesign && (
            <Button className="h-11 shrink-0" icon={<Palette className="size-4" />} disabled={!!busy} onClick={() => void design()}>
              Diseñar
            </Button>
          )}
        </div>

        <Field label="Nombre" hint={show('name') ? <span className="text-danger">{ballProblemText('name')}</span> : undefined}>
          <Input
            value={draft.name}
            onChange={(e) => set('name', e.target.value)}
            maxLength={BALL_NAME_MAX}
            placeholder="Ej.: Phaze II, la azul"
            autoComplete="off"
            aria-invalid={show('name') || undefined}
            className="h-11"
          />
        </Field>

        <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
          <Field label="Marca (opcional)">
            <Input value={draft.brand} onChange={(e) => set('brand', e.target.value)} maxLength={BALL_BRAND_MAX} placeholder="Storm, Hammer…" autoComplete="off" className="h-11" />
          </Field>
          <Field label="Peso">
            <Select value={draft.weight} onChange={(e) => set('weight', Number(e.target.value))} className="h-11">
              {WEIGHTS.map((w) => (
                <option key={w} value={w}>
                  {`${w} lb`}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {!designed && (
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-xs font-medium text-muted">Color</legend>
            <div role="radiogroup" aria-label="Color de la bola" className="flex flex-wrap gap-1">
              {BALL_COLORS.map((c) => {
                const on = draft.color.toLowerCase() === c.hex;
                return (
                  <button
                    key={c.hex}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={c.label}
                    title={c.label}
                    onClick={() => set('color', c.hex)}
                    className={cx(
                      'flex size-11 items-center justify-center rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                      on ? 'bg-accent-soft ring-2 ring-accent' : 'hover:bg-surface-2',
                    )}
                  >
                    <BallDot color={c.hex} className={on ? 'size-8' : 'size-7'} />
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        <Field label="Cubierta (opcional)">
          <Select value={draft.cover ?? ''} onChange={(e) => set('cover', (e.target.value || null) as BallCover | null)} className="h-11">
            <option value="">No sé</option>
            {BALL_COVERS.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
          <Field label="Perforada el (opcional)">
            <Input type="date" max={today} value={draft.drilledOn ?? ''} onChange={(e) => set('drilledOn', e.target.value || null)} className="h-11" />
          </Field>
          <Field label="Última pulida (opcional)">
            <Input type="date" max={today} value={draft.resurfacedOn ?? ''} onChange={(e) => set('resurfacedOn', e.target.value || null)} className="h-11" />
          </Field>
        </div>
        {(show('dates') || show('weight') || show('color') || show('brand')) && problem && (
          <p className="text-sm text-danger" aria-live="polite">
            {ballProblemText(problem)}
          </p>
        )}
        <p className="text-xs text-muted">
          Desde la última pulida contamos tus juegos con ella: cada {RESURFACE_EVERY} juegos, más o menos, toca pulirla otra vez.
        </p>
      </div>
    </Sheet>
  );
}
