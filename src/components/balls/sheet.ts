import { catalogBall } from '../../lib/ballCatalog';
import type { BallDesign } from '../../lib/ballDesign';
import {
  BALL_MAX_WEIGHT,
  BALL_MIN_WEIGHT,
  DEFAULT_BALL_COLOR,
  ballDetailsChanged,
  cleanCatalogId,
  cleanLayout,
  draftFromCatalog,
  type Ball,
  type BallDraft,
  type BallLayout,
} from '../../lib/balls';
import { ballDetailsErrorText, ballErrorText, saveBall, setBallDesign, setBallDetails } from '../../lib/data/balls';

/*
 * La hoja de una bola sin la pantalla (agregar o cambiar una bola): lo que se edita y «Guardar». Lo usan BallSheet.tsx
 * de la web (que lo reexporta) y la hoja de la app del teléfono (movil/src/components/balls/BallSheet.tsx).
 */

/** Peso con el que arranca una nueva (el más común en adultos). */
const NEW_WEIGHT = 15;

/** Los pesos para elegir (de 6 a 16 libras). */
export const BALL_WEIGHTS: readonly number[] = Array.from({ length: BALL_MAX_WEIGHT - BALL_MIN_WEIGHT + 1 }, (_, i) => BALL_MIN_WEIGHT + i);

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
    catalog: ball?.catalog ?? null,
    layout: ball?.layout ?? null,
  };
}

/** Lo que se edita en una nueva, ya llena con ese modelo del catálogo (si la clave no está, vacía). */
export function newBallDraft(catalog?: string | null): BallDraft {
  const c = catalogBall(catalog);
  return c ? draftFromCatalog(ballToDraft(null), c, true) : ballToDraft(null);
}

/** Para comparar si se cambió algo (la perforación, limpia: el orden de sus claves no cuenta). */
export const ballDraftKey = (d: BallDraft) => JSON.stringify({ ...d, catalog: cleanCatalogId(d.catalog), layout: cleanLayout(d.layout) });

/**
 * «Guardar» de la hoja de una bola: la guarda (necesita señal), le pone el diseño que se propuso (`look`: los colores
 * del modelo del catálogo, en una nueva) y el modelo y la perforación si cambiaron (respecto de `before`, la bola como
 * estaba; set_ball_details va después de la bola: una nueva necesita su id), lo dice, le pasa su id a `onSaved` (al
 * anotar, la que se agrega queda elegida para ese juego) y después cierra. Si la bola no se pudo guardar (sin señal, el
 * cupo lleno…), lo dice y la hoja sigue abierta, sin elegir nada (lo escrito no se pierde). Si se guardó la bola pero
 * no su perforación, lo dice, la elige igual y la hoja sigue abierta con su id (`onKept`: otro «Guardar» no la repite).
 * El diseño es solo una propuesta: si no se pudo poner, la bola queda de su color. true si se guardó todo. `save`,
 * `details` y `design` son saveBall, setBallDetails y setBallDesign (otras en las pruebas).
 */
export async function saveBallSheet(
  draft: BallDraft,
  today: string,
  {
    toast,
    onSaved,
    onClose,
    onKept,
    before = null,
    look = null,
    save = saveBall,
    details = setBallDetails,
    design = setBallDesign,
  }: {
    toast: (message: string, tone?: 'error') => void;
    onSaved?: (id: string) => void;
    onClose: () => void;
    onKept?: (id: string) => void;
    before?: Pick<Ball, 'catalog' | 'layout'> | null;
    look?: BallDesign | null;
    save?: (draft: BallDraft, today: string) => Promise<string>;
    details?: (id: string, catalog: string | null, layout: BallLayout | null) => Promise<void>;
    design?: (id: string, design: BallDesign | null) => Promise<unknown>;
  },
): Promise<boolean> {
  let id: string;
  try {
    id = await save(draft, today);
  } catch (e) {
    toast(ballErrorText(e), 'error');
    return false;
  }
  if (look) {
    try {
      await design(id, look);
    } catch (e) {
      console.warn('[bolas] no se puso el diseño del catálogo', e);
    }
  }
  if (ballDetailsChanged(before, draft)) {
    try {
      await details(id, cleanCatalogId(draft.catalog), cleanLayout(draft.layout));
    } catch (e) {
      toast(`La bola se guardó, pero no su perforación. ${ballDetailsErrorText(e)}`, 'error');
      onKept?.(id);
      onSaved?.(id);
      return false;
    }
  }
  toast(draft.id ? 'Bola guardada' : 'Bola agregada');
  onSaved?.(id);
  onClose();
  return true;
}
