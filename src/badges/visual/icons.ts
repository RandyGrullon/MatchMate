/**
 * Íconos de las insignias en formato lucide (grilla de 24, trazo 2, puntas redondas): los 53 que ofrece el creador
 * (§5.4), que son también los emblemas de las oficiales, y los de estado (candado, reloj de arena, ojo tachado).
 * Los de lucide se copiaron de lucide-react 1.47 (licencia ISC): no se importan sus rutas internas porque
 * `__iconData` no se reexporta. Los glifos nuevos (boliche, pádel, pickleball, fútbol y el golf compuesto) siguen su
 * mismo trazo; tenis, baloncesto y ping pong son los de src/sports/registry.ts. React los pinta como `<g>` y el canvas los pasa
 * a caminos con `iconToPath`.
 */
import type { SportId } from '../../sports/types';

export type IconTag = 'path' | 'circle' | 'ellipse' | 'rect' | 'line' | 'polyline' | 'polygon';
/** Lista de figuras de un ícono, como `__iconData.node` de lucide (sin las `key`). */
export type IconNode = readonly (readonly [IconTag, Readonly<Record<string, string>>])[];
/** Pestañas del selector de íconos del creador. */
export type IconTab = 'deporte' | 'premios' | 'esfuerzo' | 'comunidad' | 'tierra';

export interface BadgeIconDef {
  tab: IconTab;
  /** Nombre en español (título del botón y búsqueda). */
  label: string;
  /** Palabras para buscar, sin tildes. */
  tags: readonly string[];
  node: IconNode;
}

const ICON_DATA = {
  bowling: {
    tab: 'deporte',
    label: 'Boliche',
    tags: ['boliche', 'bolos', 'pino', 'bola'],
    node: [
      ['path', { d: 'M7.5 2C6.1 2 5.5 3.2 5.5 4.5c0 1.4.9 2.3.9 3.5 0 1.4-1.9 3.2-1.9 6.5 0 3 .9 5.6 1.5 7.5h3c.6-1.9 1.5-4.5 1.5-7.5 0-3.3-1.9-5.1-1.9-6.5 0-1.2.9-2.1.9-3.5C9.5 3.2 8.9 2 7.5 2Z' }],
      ['path', { d: 'M6.7 9.8h1.6' }],
      ['circle', { cx: '17.5', cy: '17', r: '5' }],
      ['path', { d: 'M16.2 15.2h.01' }],
      ['path', { d: 'M18.7 14.7h.01' }],
      ['path', { d: 'M18.5 17.3h.01' }],
    ],
  },
  padel: {
    tab: 'deporte',
    label: 'Pádel',
    tags: ['padel', 'pala', 'raqueta'],
    node: [
      ['path', { d: 'M12 2a6.5 6.5 0 0 0-6.5 6.5c0 3.1 2 5.3 4.5 6.3l.5 3.2h3l.5-3.2c2.5-1 4.5-3.2 4.5-6.3A6.5 6.5 0 0 0 12 2Z' }],
      ['path', { d: 'M12 18v4' }],
      ['path', { d: 'M9.8 7h.01' }],
      ['path', { d: 'M14.2 7h.01' }],
      ['path', { d: 'M9.8 10.8h.01' }],
      ['path', { d: 'M14.2 10.8h.01' }],
    ],
  },
  tennis: {
    tab: 'deporte',
    label: 'Tenis',
    tags: ['tenis', 'pelota'],
    node: [
      ['circle', { cx: '12', cy: '12', r: '10' }],
      ['path', { d: 'M4.9 5a9.5 9.5 0 0 1 0 14' }],
      ['path', { d: 'M19.1 5a9.5 9.5 0 0 0 0 14' }],
    ],
  },
  pickleball: {
    tab: 'deporte',
    label: 'Pickleball',
    tags: ['pickleball', 'paleta', 'pelota'],
    node: [
      ['path', { d: 'M3.98 2.88L5.86 2.2A4.5 4.5 0 0 1 11.63 4.89L12.83 8.18A4.5 4.5 0 0 1 10.14 13.95L8.26 14.63A4.5 4.5 0 0 1 2.49 11.94L1.29 8.65A4.5 4.5 0 0 1 3.98 2.88Z' }],
      ['path', { d: 'M9.2 14.29L11.42 20.4' }],
      ['circle', { cx: '18.2', cy: '17.6', r: '3.8' }],
      ['path', { d: 'M17.2 16.8h.01' }],
      ['path', { d: 'M19.2 18.5h.01' }],
    ],
  },
  basketball: {
    tab: 'deporte',
    label: 'Baloncesto',
    tags: ['baloncesto', 'basket', 'balon'],
    node: [
      ['circle', { cx: '12', cy: '12', r: '10' }],
      ['path', { d: 'M12 2v20' }],
      ['path', { d: 'M2 12h20' }],
      ['path', { d: 'M4.93 4.93c3.9 3.9 3.9 10.24 0 14.14' }],
      ['path', { d: 'M19.07 4.93c-3.9 3.9-3.9 10.24 0 14.14' }],
    ],
  },
  football: {
    tab: 'deporte',
    label: 'Fútbol y sala',
    tags: ['futbol', 'sala', 'futsal', 'balon', 'gol'],
    node: [
      ['circle', { cx: '12', cy: '12', r: '10' }],
      ['path', { d: 'M12 7l4.3 3.1-1.6 5.1H9.3L7.7 10.1Z' }],
      ['path', { d: 'M12 7V2' }],
      ['path', { d: 'M16.3 10.1l4.8-1.6' }],
      ['path', { d: 'M14.7 15.2l3 4.1' }],
      ['path', { d: 'M9.3 15.2l-3 4.1' }],
      ['path', { d: 'M7.7 10.1 2.9 8.5' }],
    ],
  },
  golf: {
    tab: 'deporte',
    label: 'Golf',
    tags: ['golf', 'hoyo', 'bandera', 'green'],
    node: [
      ['path', { d: 'M8 20V2' }],
      ['path', { d: 'M8 2l9 4.5L8 11' }],
      ['ellipse', { cx: '12', cy: '20', rx: '8', ry: '2' }],
    ],
  },
  swimming: { // lucide: waves-ladder
    tab: 'deporte',
    label: 'Natación',
    tags: ['natacion', 'piscina', 'nadar', 'escalera'],
    node: [
      ['path', { d: 'M19 5a2 2 0 0 0-2 2v11' }],
      ['path', { d: 'M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1' }],
      ['path', { d: 'M7 13h10' }],
      ['path', { d: 'M7 9h10' }],
      ['path', { d: 'M9 5a2 2 0 0 0-2 2v11' }],
    ],
  },
  // La paleta de ping pong de src/sports/registry.ts (la clave con guion: el check es ^[a-z0-9-]{1,32}$).
  'ping-pong': {
    tab: 'deporte',
    label: 'Ping pong',
    tags: ['pingpong', 'mesa', 'paleta', 'pelota'],
    node: [
      ['circle', { cx: '9.5', cy: '14.5', r: '6.5' }],
      ['path', { d: 'M13 8.8l3.2-3.2a1.5 1.5 0 0 1 2.1 2.1L15.2 11' }],
      ['circle', { cx: '4.3', cy: '4.3', r: '1.8' }],
    ],
  },
  whistle: {
    tab: 'deporte',
    label: 'Silbato',
    tags: ['silbato', 'arbitro', 'pito'],
    node: [
      ['path', { d: 'M10 6v4' }],
      ['path', { d: 'M21 6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-5.675A7 7 0 1 1 9 6z' }],
    ],
  },
  timer: {
    tab: 'deporte',
    label: 'Cronómetro',
    tags: ['cronometro', 'tiempo', 'reloj'],
    node: [
      ['line', { x1: '10', x2: '14', y1: '2', y2: '2' }],
      ['line', { x1: '12', x2: '15', y1: '14', y2: '11' }],
      ['circle', { cx: '12', cy: '14', r: '8' }],
    ],
  },
  target: {
    tab: 'deporte',
    label: 'Diana',
    tags: ['diana', 'punteria', 'objetivo', 'blanco'],
    node: [
      ['circle', { cx: '12', cy: '12', r: '10' }],
      ['circle', { cx: '12', cy: '12', r: '6' }],
      ['circle', { cx: '12', cy: '12', r: '2' }],
    ],
  },
  goal: {
    tab: 'deporte',
    label: 'Meta',
    tags: ['meta', 'objetivo'],
    node: [
      ['path', { d: 'M12 13V2l8 4-8 4' }],
      ['path', { d: 'M20.561 10.222a9 9 0 1 1-12.55-5.29' }],
      ['path', { d: 'M8.002 9.997a5 5 0 1 0 8.9 2.02' }],
    ],
  },
  'flag-triangle-right': {
    tab: 'deporte',
    label: 'Banderín',
    tags: ['banderin', 'bandera'],
    node: [
      ['path', { d: 'M6 22V2.8a.8.8 0 0 1 1.17-.71l11.38 5.69a.8.8 0 0 1 0 1.44L6 15.5' }],
    ],
  },
  trophy: {
    tab: 'premios',
    label: 'Trofeo',
    tags: ['trofeo', 'copa', 'campeon', 'campeona'],
    node: [
      ['path', { d: 'M10 14.66V17a1 1 0 0 1-1 1 2 2 0 0 0-2 2v2' }],
      ['path', { d: 'M14 14.66V17a1 1 0 0 0 1 1 2 2 0 0 1 2 2v2' }],
      ['path', { d: 'M17.916 10H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 0-1-1h-3' }],
      ['path', { d: 'M4 22h16' }],
      ['path', { d: 'M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z' }],
      ['path', { d: 'M6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3' }],
    ],
  },
  medal: {
    tab: 'premios',
    label: 'Medalla',
    tags: ['medalla', 'podio'],
    node: [
      ['path', { d: 'M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15' }],
      ['path', { d: 'M11 12 5.12 2.2' }],
      ['path', { d: 'm13 12 5.88-9.8' }],
      ['path', { d: 'M8 7h8' }],
      ['circle', { cx: '12', cy: '17', r: '5' }],
      ['path', { d: 'M12 18v-2h-.5' }],
    ],
  },
  award: {
    tab: 'premios',
    label: 'Premio',
    tags: ['premio', 'galardon'],
    node: [
      ['path', { d: 'm15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526' }],
      ['circle', { cx: '12', cy: '8', r: '6' }],
    ],
  },
  crown: {
    tab: 'premios',
    label: 'Corona',
    tags: ['corona', 'rey', 'reina', 'mvp'],
    node: [
      ['path', { d: 'M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z' }],
      ['path', { d: 'M5 21h14' }],
    ],
  },
  star: {
    tab: 'premios',
    label: 'Estrella',
    tags: ['estrella'],
    node: [
      ['path', { d: 'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z' }],
    ],
  },
  gem: {
    tab: 'premios',
    label: 'Gema',
    tags: ['gema', 'diamante', 'joya'],
    node: [
      ['path', { d: 'M10.5 3 8 9l4 13 4-13-2.5-6' }],
      ['path', { d: 'M17 3a2 2 0 0 1 1.6.8l3 4a2 2 0 0 1 .013 2.382l-7.99 10.986a2 2 0 0 1-3.247 0l-7.99-10.986A2 2 0 0 1 2.4 7.8l2.998-3.997A2 2 0 0 1 7 3z' }],
      ['path', { d: 'M2 9h20' }],
    ],
  },
  ribbon: {
    tab: 'premios',
    label: 'Lazo',
    tags: ['lazo', 'cinta'],
    node: [
      ['path', { d: 'M12 11.22C11 9.997 10 9 10 8a2 2 0 0 1 4 0c0 1-.998 2.002-2.01 3.22' }],
      ['path', { d: 'm12 18 2.57-3.5' }],
      ['path', { d: 'M6.243 9.016a7 7 0 0 1 11.507-.009' }],
      ['path', { d: 'M9.35 14.53 12 11.22' }],
      ['path', { d: 'M9.35 14.53C7.728 12.246 6 10.221 6 7a6 5 0 0 1 12 0c-.005 3.22-1.778 5.235-3.43 7.5l3.557 4.527a1 1 0 0 1-.203 1.43l-1.894 1.36a1 1 0 0 1-1.384-.215L12 18l-2.679 3.593a1 1 0 0 1-1.39.213l-1.865-1.353a1 1 0 0 1-.203-1.422z' }],
    ],
  },
  'badge-check': {
    tab: 'premios',
    label: 'Sello',
    tags: ['sello', 'verificada', 'check'],
    node: [
      ['path', { d: 'M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z' }],
      ['path', { d: 'm16 9-5.5 5.5L8 12' }],
    ],
  },
  sparkles: {
    tab: 'premios',
    label: 'Destellos',
    tags: ['destellos', 'brillo', 'magia'],
    node: [
      ['path', { d: 'M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z' }],
      ['path', { d: 'M20 2v4' }],
      ['path', { d: 'M22 4h-4' }],
      ['circle', { cx: '4', cy: '20', r: '2' }],
    ],
  },
  flame: {
    tab: 'esfuerzo',
    label: 'Fuego',
    tags: ['fuego', 'llama', 'racha'],
    node: [
      ['path', { d: 'M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4' }],
    ],
  },
  zap: {
    tab: 'esfuerzo',
    label: 'Rayo',
    tags: ['rayo', 'energia'],
    node: [
      ['path', { d: 'M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z' }],
    ],
  },
  'trending-up': {
    tab: 'esfuerzo',
    label: 'Subiendo',
    tags: ['subiendo', 'progreso', 'mejora'],
    node: [
      ['path', { d: 'M16 7h6v6' }],
      ['path', { d: 'm22 7-8.5 8.5-5-5L2 17' }],
    ],
  },
  rocket: {
    tab: 'esfuerzo',
    label: 'Cohete',
    tags: ['cohete', 'despegue', 'arranque'],
    node: [
      ['path', { d: 'M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5' }],
      ['path', { d: 'M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09' }],
      ['path', { d: 'M9 12a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.4 22.4 0 0 1-4 2z' }],
      ['path', { d: 'M9 12H4s.55-3.03 2-4c1.62-1.08 5 .05 5 .05' }],
    ],
  },
  mountain: {
    tab: 'esfuerzo',
    label: 'Montaña',
    tags: ['montana', 'pico', 'cima'],
    node: [
      ['path', { d: 'm8 3 4 8 5-5 5 15H2L8 3z' }],
    ],
  },
  footprints: {
    tab: 'esfuerzo',
    label: 'Huellas',
    tags: ['huellas', 'pasos', 'camino'],
    node: [
      ['path', { d: 'M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z' }],
      ['path', { d: 'M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z' }],
      ['path', { d: 'M16 17h4' }],
      ['path', { d: 'M4 13h4' }],
    ],
  },
  crosshair: {
    tab: 'esfuerzo',
    label: 'Mira',
    tags: ['mira', 'precision'],
    node: [
      ['circle', { cx: '12', cy: '12', r: '10' }],
      ['line', { x1: '22', x2: '18', y1: '12', y2: '12' }],
      ['line', { x1: '6', x2: '2', y1: '12', y2: '12' }],
      ['line', { x1: '12', x2: '12', y1: '6', y2: '2' }],
      ['line', { x1: '12', x2: '12', y1: '22', y2: '18' }],
    ],
  },
  hourglass: {
    tab: 'esfuerzo',
    label: 'Reloj de arena',
    tags: ['reloj', 'arena', 'paciencia'],
    node: [
      ['path', { d: 'M5 22h14' }],
      ['path', { d: 'M5 2h14' }],
      ['path', { d: 'M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22' }],
      ['path', { d: 'M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2' }],
    ],
  },
  repeat: {
    tab: 'esfuerzo',
    label: 'Repetir',
    tags: ['repetir', 'constancia'],
    node: [
      ['path', { d: 'm17 2 4 4-4 4' }],
      ['path', { d: 'M3 11v-1a4 4 0 0 1 4-4h14' }],
      ['path', { d: 'm7 22-4-4 4-4' }],
      ['path', { d: 'M21 13v1a4 4 0 0 1-4 4H3' }],
    ],
  },
  infinity: {
    tab: 'esfuerzo',
    label: 'Infinito',
    tags: ['infinito', 'siempre'],
    node: [
      ['path', { d: 'M6 16c5 0 7-8 12-8a4 4 0 0 1 0 8c-5 0-7-8-12-8a4 4 0 1 0 0 8' }],
    ],
  },
  'calendar-check': {
    tab: 'esfuerzo',
    label: 'Calendario',
    tags: ['calendario', 'asistencia', 'fecha'],
    node: [
      ['path', { d: 'M8 2v3' }],
      ['path', { d: 'M16 2v3' }],
      ['rect', { x: '3', y: '3', width: '18', height: '18', rx: '2' }],
      ['path', { d: 'M3 9h18' }],
      ['path', { d: 'm9 15 2 2 4-4' }],
    ],
  },
  handshake: {
    tab: 'comunidad',
    label: 'Apretón de manos',
    tags: ['manos', 'acuerdo', 'respeto', 'juego', 'limpio'],
    node: [
      ['path', { d: 'm11 17 2 2a1 1 0 1 0 3-3' }],
      ['path', { d: 'm14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4' }],
      ['path', { d: 'm21 3 1 11h-2' }],
      ['path', { d: 'M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3' }],
      ['path', { d: 'M3 4h8' }],
    ],
  },
  'heart-handshake': {
    tab: 'comunidad',
    label: 'Corazón y manos',
    tags: ['corazon', 'apoyo', 'manos'],
    node: [
      ['path', { d: 'M19.414 14.414C21 12.828 22 11.5 22 9.5a5.5 5.5 0 0 0-9.591-3.676.6.6 0 0 1-.818.001A5.5 5.5 0 0 0 2 9.5c0 2.3 1.5 4 3 5.5l5.535 5.362a2 2 0 0 0 2.879.052 2.12 2.12 0 0 0-.004-3 2.124 2.124 0 1 0 3-3 2.124 2.124 0 0 0 3.004 0 2 2 0 0 0 0-2.828l-1.881-1.882a2.41 2.41 0 0 0-3.409 0l-1.71 1.71a2 2 0 0 1-2.828 0 2 2 0 0 1 0-2.828l2.823-2.762' }],
    ],
  },
  'hand-heart': {
    tab: 'comunidad',
    label: 'Mano amiga',
    tags: ['mano', 'ayuda', 'corazon'],
    node: [
      ['path', { d: 'M11 14h2a2 2 0 0 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 16' }],
      ['path', { d: 'm14.45 13.39 5.05-4.694C20.196 8 21 6.85 21 5.75a2.75 2.75 0 0 0-4.797-1.837.276.276 0 0 1-.406 0A2.75 2.75 0 0 0 11 5.75c0 1.2.802 2.248 1.5 2.946L16 11.95' }],
      ['path', { d: 'm2 15 6 6' }],
      ['path', { d: 'm7 20 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a1 1 0 0 0-2.75-2.91' }],
    ],
  },
  'users-round': {
    tab: 'comunidad',
    label: 'Grupo',
    tags: ['grupo', 'equipo', 'gente'],
    node: [
      ['path', { d: 'M18 21a8 8 0 0 0-16 0' }],
      ['circle', { cx: '10', cy: '8', r: '5' }],
      ['path', { d: 'M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3' }],
    ],
  },
  smile: { // lucide: face-slightly-smiling
    tab: 'comunidad',
    label: 'Sonrisa',
    tags: ['sonrisa', 'alegria', 'vibra'],
    node: [
      ['path', { d: 'M15 10V9' }],
      ['path', { d: 'M16.472 15a6 6 0 01-8.943 0' }],
      ['path', { d: 'M9 10V9' }],
      ['circle', { cx: '12', cy: '12', r: '10' }],
    ],
  },
  'thumbs-up': {
    tab: 'comunidad',
    label: 'Pulgar arriba',
    tags: ['pulgar', 'bien', 'like'],
    node: [
      ['path', { d: 'M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z' }],
      ['path', { d: 'M7 10v12' }],
    ],
  },
  megaphone: {
    tab: 'comunidad',
    label: 'Megáfono',
    tags: ['megafono', 'anuncio', 'voz'],
    node: [
      ['path', { d: 'M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z' }],
      ['path', { d: 'M6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14' }],
      ['path', { d: 'M8 6v8' }],
    ],
  },
  'party-popper': {
    tab: 'comunidad',
    label: 'Fiesta',
    tags: ['fiesta', 'celebracion'],
    node: [
      ['path', { d: 'M5.8 11.3 2 22l10.7-3.79' }],
      ['path', { d: 'M4 3h.01' }],
      ['path', { d: 'M22 8h.01' }],
      ['path', { d: 'M15 2h.01' }],
      ['path', { d: 'M22 20h.01' }],
      ['path', { d: 'm22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10' }],
      ['path', { d: 'm22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11c-.11.7-.72 1.22-1.43 1.22H17' }],
      ['path', { d: 'm11 2 .33.82c.34.86-.2 1.82-1.11 1.98C9.52 4.9 9 5.52 9 6.23V7' }],
      ['path', { d: 'M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z' }],
    ],
  },
  cake: {
    tab: 'comunidad',
    label: 'Bizcocho',
    tags: ['bizcocho', 'cumpleanos', 'aniversario'],
    node: [
      ['path', { d: 'M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8' }],
      ['path', { d: 'M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1' }],
      ['path', { d: 'M2 21h20' }],
      ['path', { d: 'M7 8v3' }],
      ['path', { d: 'M12 8v3' }],
      ['path', { d: 'M17 8v3' }],
      ['path', { d: 'M7 4h.01' }],
      ['path', { d: 'M12 4h.01' }],
      ['path', { d: 'M17 4h.01' }],
    ],
  },
  gift: {
    tab: 'comunidad',
    label: 'Regalo',
    tags: ['regalo', 'sorpresa'],
    node: [
      ['path', { d: 'M12 7v14' }],
      ['path', { d: 'M20 11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8' }],
      ['path', { d: 'M7.5 7a1 1 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5 1 1 0 0 1 0 5' }],
      ['rect', { x: '3', y: '7', width: '18', height: '4', rx: '1' }],
    ],
  },
  sun: {
    tab: 'tierra',
    label: 'Sol',
    tags: ['sol', 'verano', 'calor'],
    node: [
      ['circle', { cx: '12', cy: '12', r: '4' }],
      ['path', { d: 'M12 2v2' }],
      ['path', { d: 'M12 20v2' }],
      ['path', { d: 'm4.93 4.93 1.41 1.41' }],
      ['path', { d: 'm17.66 17.66 1.41 1.41' }],
      ['path', { d: 'M2 12h2' }],
      ['path', { d: 'M20 12h2' }],
      ['path', { d: 'm6.34 17.66-1.41 1.41' }],
      ['path', { d: 'm19.07 4.93-1.41 1.41' }],
    ],
  },
  sunrise: {
    tab: 'tierra',
    label: 'Amanecer',
    tags: ['amanecer', 'madrugada'],
    node: [
      ['path', { d: 'M12 2v8' }],
      ['path', { d: 'm4.93 10.93 1.41 1.41' }],
      ['path', { d: 'M2 18h2' }],
      ['path', { d: 'M20 18h2' }],
      ['path', { d: 'm19.07 10.93-1.41 1.41' }],
      ['path', { d: 'M22 22H2' }],
      ['path', { d: 'm8 6 4-4 4 4' }],
      ['path', { d: 'M16 18a4 4 0 0 0-8 0' }],
    ],
  },
  'tree-palm': {
    tab: 'tierra',
    label: 'Palma',
    tags: ['palma', 'cocotero', 'playa'],
    node: [
      ['path', { d: 'M13 8c0-2.76-2.46-5-5.5-5S2 5.24 2 8h2l1-1 1 1h4' }],
      ['path', { d: 'M13 7.14A5.82 5.82 0 0 1 16.5 6c3.04 0 5.5 2.24 5.5 5h-3l-1-1-1 1h-3' }],
      ['path', { d: 'M5.89 9.71c-2.15 2.15-2.3 5.47-.35 7.43l4.24-4.25.7-.7.71-.71 2.12-2.12c-1.95-1.96-5.27-1.8-7.42.35' }],
      ['path', { d: 'M11 15.5c.5 2.5-.17 4.5-1 6.5h4c2-5.5-.5-12-1-14' }],
    ],
  },
  waves: { // lucide: waves-horizontal
    tab: 'tierra',
    label: 'Olas',
    tags: ['olas', 'mar', 'playa'],
    node: [
      ['path', { d: 'M2 12q2.5 2 5 0t5 0 5 0 5 0' }],
      ['path', { d: 'M2 19q2.5 2 5 0t5 0 5 0 5 0' }],
      ['path', { d: 'M2 5q2.5 2 5 0t5 0 5 0 5 0' }],
    ],
  },
  sprout: {
    tab: 'tierra',
    label: 'Brote',
    tags: ['brote', 'novato', 'nuevo', 'revelacion'],
    node: [
      ['path', { d: 'M14 9.536V7a4 4 0 0 1 4-4h1.5a.5.5 0 0 1 .5.5V5a4 4 0 0 1-4 4 4 4 0 0 0-4 4c0 2 1 3 1 5a5 5 0 0 1-1 3' }],
      ['path', { d: 'M4 9a5 5 0 0 1 8 4 5 5 0 0 1-8-4' }],
      ['path', { d: 'M5 21h14' }],
    ],
  },
  bird: {
    tab: 'tierra',
    label: 'Cigua palmera',
    tags: ['ave', 'cigua', 'pajaro', 'palmera'],
    node: [
      ['path', { d: 'M16 7h.01' }],
      ['path', { d: 'M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20' }],
      ['path', { d: 'm20 7 2 .5-2 .5' }],
      ['path', { d: 'M10 18v3' }],
      ['path', { d: 'M14 17.75V21' }],
      ['path', { d: 'M7 18a6 6 0 0 0 3.84-10.61' }],
    ],
  },
  shell: {
    tab: 'tierra',
    label: 'Caracol',
    tags: ['caracol', 'concha', 'mar'],
    node: [
      ['path', { d: 'M14 11a2 2 0 1 1-4 0 4 4 0 0 1 8 0 6 6 0 0 1-12 0 8 8 0 0 1 16 0 10 10 0 1 1-20 0 11.93 11.93 0 0 1 2.42-7.22 2 2 0 1 1 3.16 2.44' }],
    ],
  },
  anchor: {
    tab: 'tierra',
    label: 'Ancla',
    tags: ['ancla', 'puerto', 'mar'],
    node: [
      ['path', { d: 'M12 6v16' }],
      ['path', { d: 'm19 13 2-1a9 9 0 0 1-18 0l2 1' }],
      ['path', { d: 'M9 11h6' }],
      ['circle', { cx: '12', cy: '4', r: '2' }],
    ],
  },
  'moon-star': {
    tab: 'tierra',
    label: 'Luna',
    tags: ['luna', 'noche', 'estrella'],
    node: [
      ['path', { d: 'M18 5h4' }],
      ['path', { d: 'M20 3v4' }],
      ['path', { d: 'M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401' }],
    ],
  },
} satisfies Record<string, BadgeIconDef>;

/** Clave de un ícono de la lista curada (es lo que guarda `league_badges.icon`). */
export type BadgeIconKey = keyof typeof ICON_DATA;

/** Los 53 íconos curados, en el orden de las pestañas. */
export const BADGE_ICONS: Readonly<Record<BadgeIconKey, BadgeIconDef>> = ICON_DATA;
export const BADGE_ICON_KEYS = Object.keys(ICON_DATA) as BadgeIconKey[];

export const ICON_TABS: readonly { key: IconTab; label: string }[] = [
  { key: 'deporte', label: 'Deporte' },
  { key: 'premios', label: 'Premios' },
  { key: 'esfuerzo', label: 'Esfuerzo' },
  { key: 'comunidad', label: 'Comunidad' },
  { key: 'tierra', label: 'Nuestra tierra' },
];

/** Íconos de estado de §4.7 (no se ofrecen en el creador). */
export type UiIconKey = 'lock' | 'hourglass' | 'eye-off';
export const UI_ICONS: Readonly<Record<UiIconKey, IconNode>> = {
  lock: [
    ['rect', { width: '18', height: '11', x: '3', y: '11', rx: '2', ry: '2' }],
    ['path', { d: 'M7 11V7a5 5 0 0 1 10 0v4' }],
  ],
  'eye-off': [
    ['path', { d: 'M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49' }],
    ['path', { d: 'M14.084 14.158a3 3 0 0 1-4.242-4.242' }],
    ['path', { d: 'M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143' }],
    ['path', { d: 'm2 2 20 20' }],
  ],
  hourglass: ICON_DATA.hourglass.node,
};

/** Emblema de cada deporte (§4.4): fútbol y sala comparten balón, el color del campo los separa. */
export const SPORT_EMBLEM: Readonly<Record<SportId, BadgeIconKey>> = {
  bowling: 'bowling',
  padel: 'padel',
  tennis: 'tennis',
  pickleball: 'pickleball',
  basketball: 'basketball',
  football: 'football',
  futsal: 'football',
  golf: 'golf',
  swimming: 'swimming',
  table_tennis: 'ping-pong',
};

/** Emblema cuando la clave no se conoce (un diseño viejo o un error): el trofeo. */
export const FALLBACK_ICON: BadgeIconKey = 'trophy';

export const isBadgeIconKey = (key: unknown): key is BadgeIconKey => typeof key === 'string' && Object.hasOwn(ICON_DATA, key);

/** Las figuras de un ícono de la lista o de estado; una clave que no existe da el trofeo. */
export function iconNode(key: string): IconNode {
  if (isBadgeIconKey(key)) return BADGE_ICONS[key].node;
  if (Object.hasOwn(UI_ICONS, key)) return UI_ICONS[key as UiIconKey];
  return BADGE_ICONS[FALLBACK_ICON].node;
}

/** Minúsculas y sin tildes, para buscar «cigua» o «pajaro» con o sin acento. */
export const normalizeSearch = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();

/**
 * Búsqueda del selector del creador («Busca: trofeo, fuego, cigua…»): con texto busca en el nombre, las etiquetas y
 * la clave de todos; sin texto devuelve los de la pestaña.
 */
export function searchIcons(query: string, tab: IconTab = 'deporte'): BadgeIconKey[] {
  const q = normalizeSearch(query);
  return BADGE_ICON_KEYS.filter((k) => {
    const def = BADGE_ICONS[k];
    return q ? normalizeSearch(`${def.label} ${def.tags.join(' ')} ${k}`).includes(q) : def.tab === tab;
  });
}

const num = (a: Readonly<Record<string, string>>, k: string, fallback = 0) => {
  const v = Number(a[k]);
  return Number.isFinite(v) ? v : fallback;
};
const r2 = (v: number) => String(Math.round(v * 1000) / 1000);

/**
 * Una figura del ícono como camino SVG (para `Path2D` en el canvas y para medir): círculos, elipses, rectángulos
 * (con esquinas), líneas y polilíneas pasan a M, L, A y Z.
 */
export function iconToPath([tag, a]: IconNode[number]): string {
  switch (tag) {
    case 'path':
      return a.d ?? '';
    case 'circle':
    case 'ellipse': {
      const cx = num(a, 'cx');
      const cy = num(a, 'cy');
      const rx = tag === 'circle' ? num(a, 'r') : num(a, 'rx');
      const ry = tag === 'circle' ? rx : num(a, 'ry');
      return `M${r2(cx - rx)} ${r2(cy)}A${r2(rx)} ${r2(ry)} 0 1 0 ${r2(cx + rx)} ${r2(cy)}A${r2(rx)} ${r2(ry)} 0 1 0 ${r2(cx - rx)} ${r2(cy)}Z`;
    }
    case 'rect': {
      const x = num(a, 'x');
      const y = num(a, 'y');
      const w = num(a, 'width');
      const h = num(a, 'height');
      const rx = Math.min(num(a, 'rx', num(a, 'ry')), w / 2);
      const ry = Math.min(num(a, 'ry', rx), h / 2);
      if (!rx || !ry) return `M${r2(x)} ${r2(y)}H${r2(x + w)}V${r2(y + h)}H${r2(x)}Z`;
      const arc = (ex: number, ey: number) => `A${r2(rx)} ${r2(ry)} 0 0 1 ${r2(ex)} ${r2(ey)}`;
      return (
        `M${r2(x + rx)} ${r2(y)}H${r2(x + w - rx)}${arc(x + w, y + ry)}V${r2(y + h - ry)}${arc(x + w - rx, y + h)}` +
        `H${r2(x + rx)}${arc(x, y + h - ry)}V${r2(y + ry)}${arc(x + rx, y)}Z`
      );
    }
    case 'line':
      return `M${r2(num(a, 'x1'))} ${r2(num(a, 'y1'))}L${r2(num(a, 'x2'))} ${r2(num(a, 'y2'))}`;
    case 'polyline':
    case 'polygon': {
      const pts = (a.points ?? '').trim().split(/[\s,]+/).map(Number);
      let d = '';
      for (let i = 0; i + 1 < pts.length; i += 2) d += `${i ? 'L' : 'M'}${r2(pts[i])} ${r2(pts[i + 1])}`;
      return tag === 'polygon' && d ? `${d}Z` : d;
    }
  }
}
