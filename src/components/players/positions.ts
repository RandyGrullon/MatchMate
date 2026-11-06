/**
 * Las posiciones de los deportes de equipo (las mismas de las plantillas), sin pantallas: las usa «Agregar jugador» en
 * la web y en la app del teléfono. Las plantillas de la web las leen de src/pages/sports/basketball/bits.tsx y
 * football/bits.tsx (que traen pantallas de la web y no entran en la app); positions.test.ts revisa que sean las mismas.
 */

/** Posiciones del baloncesto para la plantilla. */
export const BASKETBALL_POSITIONS = ['Base', 'Escolta', 'Alero', 'Ala-pívot', 'Pívot'] as const;

/** Posiciones del fútbol para la plantilla. */
export const FOOTBALL_POSITIONS = ['Portero', 'Defensa', 'Medio', 'Delantero'] as const;
