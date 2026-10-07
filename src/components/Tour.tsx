/**
 * Tours guiados: retirados en el rediseño («Calma y foco»). Ya no se oscurece la pantalla con pasos encima de lo que
 * se está usando: cada pantalla se entiende sola y, si hay algo que decir, va en su único aviso (NoticeSlot). `Tour`
 * queda sin dibujar nada para las pantallas que todavía lo montan (se quita al rehacer cada una); los textos que le
 * pasan (src/lib/tours.ts) ya no salen en ningún lado.
 */
export interface TourStep {
  /** Valor de data-tour del elemento a resaltar. */
  target: string;
  title: string;
  body: string;
}

/** Retirado: nunca arranca ni dibuja nada. */
export function Tour(_props: { name: string; steps: TourStep[]; when?: boolean }): null {
  return null;
}
