/**
 * Colores de «Crear o unirme» y del asistente que cambian distinto en claro y en oscuro (no hay un token para eso en
 * index.css): la sombra de atrás (sin desenfoque, como el diseño), la hoja flotante (blanca con sombra; en oscuro un
 * gris un poco más claro con borde), la caja del código (blanca; en oscuro, el fondo), los campos y días del asistente
 * (blancos con sombra; en oscuro surface-2) y la barra de pasos. Todo dentro de `.mm-create`; React pone el <style>
 * una sola vez en el <head>.
 */
const DARK = '--mm-scrim:rgb(0 0 0/.62);--mm-sheet:#1a1d27;--mm-sheet-shadow:0 0 0 1px var(--line);--mm-code:var(--bg);--mm-field:var(--surface-2);--mm-field-shadow:none;--mm-track:var(--line);';

export const CREATE_CSS =
  '.mm-create{--mm-scrim:rgb(21 24 34/.42);--mm-sheet:var(--surface);--mm-sheet-shadow:0 20px 60px rgb(0 0 0/.18);--mm-code:var(--surface);--mm-field:var(--surface);' +
  '--mm-field-shadow:var(--shadow-card);--mm-track:var(--surface-2)}' +
  `@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .mm-create{${DARK}}}` +
  `:root[data-theme="dark"] .mm-create{${DARK}}`;

export function CreateStyles() {
  return (
    <style href="mm-create" precedence="default">
      {CREATE_CSS}
    </style>
  );
}

/** Campo del asistente (y de la caja del código): 56 px, redondeado, blanco con sombra (en oscuro, surface-2). */
export const wizardField =
  'flex h-14 w-full min-w-0 items-center gap-3 rounded-2xl bg-(--mm-field) px-4 text-[16.5px] font-[550] text-fg shadow-(--mm-field-shadow) ' +
  'focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-accent';

/** La etiqueta de un campo del asistente («Día», «Hora», «Bolera»). */
export const wizardLabel = 'mx-1 mt-6 mb-2.5 block text-sm font-[650] text-fg-2';

/** Lo mismo para el título de un grupo (<legend>): el espacio de arriba va en el <fieldset> (mt-6). */
export const wizardLegend = 'mb-2.5 block px-1 text-sm font-[650] text-fg-2';
