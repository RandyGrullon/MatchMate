/**
 * Lo poco de la pantalla del evento que cambia entre claro y oscuro más allá de los tokens (como la hoja de anotar,
 * src/components/frames/ScoreEntryModal.tsx): en claro, la etiqueta «Tú», tus casillas de la Planilla, la casilla
 * «Jugando» y «Tu pista» van en blanco (surface); en oscuro no hay blanco que valga: acento transparente, un gris apenas
 * más claro, sin fondo y surface-2. Va en los tres sitios del modo oscuro (el del sistema y el elegido en la app).
 */
const LIGHT: Record<string, string> = {
  'mm-ev-tag': 'background:var(--surface)',
  'mm-ev-mine': 'background:var(--surface)',
  'mm-ev-play': 'background:var(--surface)',
  'mm-ev-chip': 'background:var(--surface)',
};
const DARK: Record<string, string> = {
  'mm-ev-tag': 'background:color-mix(in srgb,var(--accent) 18%,transparent)',
  'mm-ev-mine': 'background:rgb(255 255 255/0.06)',
  'mm-ev-play': 'background:transparent',
  'mm-ev-chip': 'background:var(--surface-2)',
};

const rules = (map: Record<string, string>, scope = '') =>
  Object.entries(map)
    .map(([cls, css]) => `${scope}.${cls}{${css}}`)
    .join('');

export const EVENT_CSS = [
  rules(LIGHT),
  `@media (prefers-color-scheme:dark){${rules(DARK, ':root:not([data-theme=light]) ')}}`,
  rules(DARK, ':root[data-theme=dark] '),
].join('\n');

/** Las reglas de arriba, una vez en la pantalla del evento. */
export function EventTheme() {
  return <style>{EVENT_CSS}</style>;
}
