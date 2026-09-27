/**
 * Marca de MatchMate, concepto «Dúo»: dos compañeros tomados de la mano forman la M. Las piernas son los
 * cuerpos, la V del centro son los brazos y los dos puntos son las cabezas (docs/plan/investigacion-brand.md).
 *
 * Sin React ni navegador: lo usan Logo.tsx, las escenas de apertura y scripts/icons/generate.mjs (los iconos).
 * Todo en un cuadro de 512×512.
 */

/** La M en un solo trazo (se puede «dibujar» con pathLength=1). */
export const DUO_M = 'M150 384V218L256 324L362 218V384';
export const DUO_STROKE = 48;
/** Las dos cabezas: [cx, cy]. */
export const DUO_HEADS: readonly (readonly [number, number])[] = [
  [150, 138],
  [362, 138],
];
export const DUO_HEAD_R = 36;
/** Esquinas del icono (el maskable y el de Apple van con 0: el sistema pone su propia forma). */
export const DUO_RX = 112;

/**
 * Colores de la marca (siempre van juntos). En oscuro el dibujo es oscuro: blanco sobre #8b8cf6 no llega al contraste.
 * Deben coincidir con index.css (--accent, --accent-fg, --fg, --bg).
 */
export const BRAND = {
  light: { accent: '#4338ca', onAccent: '#ffffff', text: '#151822', bg: '#f4f5f8' },
  dark: { accent: '#8b8cf6', onAccent: '#0d0f15', text: '#eceef3', bg: '#0d0f15' },
} as const;

export interface DuoSvgOptions {
  /** Fondo del cuadro; null = sin cuadro (versión de un color). */
  tile: string | null;
  /** Color de la M y las cabezas. */
  ink: string;
  rx?: number;
  /** Para recortar (p. ej. el icono de las notificaciones, sin cuadro, va más grande). */
  viewBox?: string;
}

/** SVG suelto del icono con colores fijos (para los PNG). */
export function duoSvg({ tile, ink, rx = DUO_RX, viewBox = '0 0 512 512' }: DuoSvgOptions): string {
  const heads = DUO_HEADS.map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="${DUO_HEAD_R}" fill="${ink}"/>`).join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">` +
    (tile ? `<rect width="512" height="512" rx="${rx}" fill="${tile}"/>` : '') +
    `<path d="${DUO_M}" fill="none" stroke="${ink}" stroke-width="${DUO_STROKE}" stroke-linecap="round" stroke-linejoin="round"/>` +
    heads +
    '</svg>'
  );
}

/** Favicon: sigue el modo claro/oscuro del sistema (como archivo suelto no ve el color elegido en la app). */
export function duoFaviconSvg(): string {
  const { light: l, dark: d } = BRAND;
  const heads = DUO_HEADS.map(([cx, cy]) => `<circle class="i" cx="${cx}" cy="${cy}" r="${DUO_HEAD_R}"/>`).join('');
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">' +
    `<style>.t{fill:${l.accent}}.i{fill:${l.onAccent}}.s{stroke:${l.onAccent}}` +
    `@media (prefers-color-scheme:dark){.t{fill:${d.accent}}.i{fill:${d.onAccent}}.s{stroke:${d.onAccent}}}</style>` +
    `<rect class="t" width="512" height="512" rx="${DUO_RX}"/>` +
    `<path class="s" d="${DUO_M}" fill="none" stroke-width="${DUO_STROKE}" stroke-linecap="round" stroke-linejoin="round"/>` +
    heads +
    '</svg>'
  );
}
