/**
 * Lo que dice «Acerca de MatchMate» (/acerca), sin pantalla: lo pintan AboutPage.tsx de la web y la pantalla de la app
 * del teléfono (movil/src/app/acerca.tsx). La frase, qué puedes hacer, cómo empezar y cómo va la grilla de deportes.
 */
import { BellRing, Camera, ChartLine, ClipboardPen, Trophy, Users, type LucideIcon } from 'lucide-react';

export const ABOUT_TAGLINE = 'Tus ligas, tus juegos y tus estadísticas en un solo lugar';

/** La línea chica debajo de la frase. */
export const ABOUT_NOTE = 'Ligas y torneos entre amigos, en español y gratis.';

/** Los títulos de las partes. */
export const ABOUT_HEADINGS = { sports: 'Los deportes', features: 'Qué puedes hacer', steps: 'Cómo empezar' } as const;

/** Qué se puede hacer en la app (corto: se lee en el teléfono). */
export const ABOUT_FEATURES: readonly { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Trophy, title: 'Crear ligas y torneos', text: 'De tu deporte, con su calendario, sus tablas y su ranking.' },
  { icon: Users, title: 'Invitar a tu gente', text: 'Con un link, un código o buscándolos por su @usuario.' },
  { icon: ClipboardPen, title: 'Anotar juegos y resultados', text: 'Desde la cancha o la bolera, y todos lo ven al momento.' },
  { icon: ChartLine, title: 'Estadísticas y promedios', text: 'Tu promedio, tu mejor juego y cómo vas en cada liga.' },
  { icon: Camera, title: 'Leer la foto del marcador', text: 'En el boliche le tomas foto a la pantalla y la app pone los pinos.' },
  { icon: BellRing, title: 'Avisos en tu teléfono', text: 'Tu próximo partido, resultados por confirmar e invitaciones.' },
];

export const ABOUT_STEPS: readonly { title: string; text: string }[] = [
  { title: 'Crea tu cuenta', text: 'Con tu correo o con Google. Es gratis.' },
  { title: 'Crea tu liga o únete a una', text: 'Con el link o el código que te pasen, o entra a una liga pública.' },
  { title: 'Anota y compite', text: 'Tus juegos, la tabla, tus estadísticas y los avisos, todo en el celular.' },
];

/**
 * Cuántas columnas lleva la grilla de deportes: 4 cuando llenan las filas; si no, 3 cuando esas sí (9 grupos = 3 × 3,
 * sin un cuadro solo en la última fila).
 */
export const sportGridColumns = (n: number): 3 | 4 => (n % 4 !== 0 && n % 3 === 0 ? 3 : 4);

/** Las mismas columnas como clase de Tailwind (enteras, para que Tailwind las vea). */
export const sportGridCols = (n: number): string => (sportGridColumns(n) === 3 ? 'grid-cols-3' : 'grid-cols-4');

/**
 * El nombre completo de un deporte en su cuadro: el otro nombre («Tenis de mesa») va en el nombre accesible y en el
 * título (en 12 px solo cabe «Ping pong»). Sin otro nombre, undefined.
 */
export const sportFullName = (g: { name: string; alias?: string | null }): string | undefined => (g.alias ? `${g.name} (${g.alias.toLowerCase()})` : undefined);
