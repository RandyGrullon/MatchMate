import type { TourStep } from '../components/Tour';

/**
 * Textos de los tours guiados. El del Home es de toda la app y no habla de ningún deporte (lo ve el de fútbol igual
 * que el de boliche); los de la liga, el evento y Admin del boliche son de sus pantallas, y las ligas de los otros
 * deportes tienen el suyo (`sportLeagueTour`, con los nombres de sus pestañas).
 * El color de la app se puede cambiar: los textos dicen «el botón del centro», no su color.
 */

/**
 * Tour del Home: lo principal de la app (sale la primera vez que se entra, en el Home de todos o en el de un
 * deporte; los pasos que no están en esa pantalla se saltan). Sirve para cualquier deporte.
 */
export const HOME_TOUR: TourStep[] = [
  {
    target: 'nav',
    title: 'Bienvenido a MatchMate',
    body: 'Abajo tienes lo principal: Home (lo tuyo de hoy), Eventos (tus ligas y torneos, y las públicas para unirte), el botón del centro para crear, tus Avisos y tu Perfil (tus juegos, seguidores y likes).',
  },
  {
    target: 'deporte',
    title: 'El deporte en que estás',
    body: 'Arriba siempre dice en qué deporte estás. Tócalo para cambiar: el Home y Eventos muestran solo lo de ese deporte. Elige «Todos los deportes» para ver todo.',
  },
  {
    target: 'deportes',
    title: 'Tus deportes',
    body: 'Toca un deporte para entrar a su Home. Estando ahí, toca Home abajo otra vez para volver a todos los deportes.',
  },
  {
    target: 'portada-deporte',
    title: 'El Home del deporte',
    body: 'Todo lo de este deporte: tus ligas, lo que viene y las públicas para unirte. Desde aquí creas una liga de este deporte.',
  },
  {
    target: 'en-juego',
    title: 'En juego ahora',
    body: 'Lo que se está jugando ahora en tus ligas sale aquí. Tócalo para anotar mientras juegas o para ver cómo va.',
  },
  {
    target: 'proximos',
    title: 'Lo que viene',
    body: 'Semana por semana, lo que viene en tus ligas: partidos, rondas, encuentros, prácticas y torneos. Cuando te pidan confirmar, toca "Voy".',
  },
  {
    target: 'siguiendo',
    title: 'Siguiendo',
    body: 'Los juegos de la gente que sigues salen aquí. Dale like para felicitarlos.',
  },
  {
    target: 'campana',
    title: 'Avisos',
    body: 'Avisos de tus ligas, resultados por confirmar, seguidores nuevos, likes y comentarios… El número rojo son los nuevos.',
  },
  {
    target: 'config',
    title: 'Configuración',
    body: 'Tu nombre, modo claro u oscuro, el color de la app, las notificaciones del teléfono y repetir este tour.',
  },
  {
    target: 'crear',
    title: 'El botón del centro: crear',
    body: 'Crea tu liga del deporte que juegues (con su calendario y su tabla) o un torneo suelto, o únete con un código de invitación.',
  },
  {
    target: 'unirse',
    title: '¿Te invitaron?',
    body: 'Pon aquí el código de invitación para entrar a una liga privada. Al entrar ya eres jugador.',
  },
];

/** Tour de la liga de boliche (Calendario): sus secciones. */
export const LEAGUE_TOUR: TourStep[] = [
  {
    target: 'secciones',
    title: 'Las secciones de la liga',
    body: 'Calendario, Juegos, Ranking, Mis juegos y, si organizas, Admin. Desliza para ver todas.',
  },
  {
    target: 'tab-juegos',
    title: 'Juegos: el muro de la liga',
    body: 'Los juegos de todos, de hoy y pasados. Si faltaste, mira cómo les fue. Dale "Me gusta", felicita y comenta.',
  },
  {
    target: 'tab-ranking',
    title: 'Ranking',
    body: 'Quién va mejor en la temporada: promedio, mejor juego, mejor serie y asistencia. También se descarga en Excel.',
  },
  {
    target: 'tab-perfil',
    title: 'Mis juegos',
    body: 'Tu perfil en esta liga: tus promedios, tus juegos y cómo vas mejorando.',
  },
  {
    target: 'tablero',
    title: 'En juego ahora',
    body: 'Cuando se está jugando, aquí se ve en vivo cómo va cada uno. Toca un juego para felicitar.',
  },
  {
    target: 'proxima-practica',
    title: 'La próxima práctica',
    body: 'Confirma si vas: el organizador sabe cuántos van.',
  },
  {
    target: 'buzon',
    title: 'Buzón de sugerencias',
    body: 'Deja una idea o una queja a los organizadores. Es anónimo: solo ven el mensaje.',
  },
  {
    target: 'cambiar-liga',
    title: 'Cambia de liga',
    body: 'Si estás en varias ligas o torneos, cámbiate desde aquí.',
  },
];

/** Tour del evento de boliche con el panel del jugador: anotar mientras se juega. */
export const EVENT_TOUR: TourStep[] = [
  {
    target: 'modo',
    title: 'Elige cómo anotas',
    body: 'Pines: tocas los pines que cayeron. Teclado: escribes cada tiro (X, /, números). Total: solo el puntaje. La app recuerda tu forma.',
  },
  {
    target: 'juegos',
    title: 'Tus juegos',
    body: 'Toca un juego para anotarlo. Se guarda en tu teléfono (sirve sin señal) y los demás lo ven en vivo. Abajo va tu promedio de la sesión.',
  },
  {
    target: 'otro-juego',
    title: '¿Siguieron jugando?',
    body: 'En las prácticas puedes sumar otro juego a la sesión.',
  },
  {
    target: 'enviar',
    title: 'Envíalo a revisión',
    body: 'Al terminar, envía tus juegos. La foto del marcador es opcional: sirve para que el admin los verifique.',
  },
  {
    target: 'anotar',
    title: 'Anota tu primer juego',
    body: 'Empieza por aquí: se abre el juego que te toca.',
  },
  {
    target: 'compartir',
    title: 'Comparte',
    body: 'Manda el link del evento por WhatsApp a quien quieras.',
  },
];

/** Tour de Admin (boliche): lo que maneja el organizador. */
export const ADMIN_TOUR: TourStep[] = [
  {
    target: 'admin-secciones',
    title: 'Administrar la liga',
    body: 'Pendientes (lo que espera por ti y «Suspender un día»), Jugadores (la lista y sus promedios), Aprobar (los juegos que suben los jugadores), Miembros (permisos: admins y anotadores), Buzón (sugerencias anónimas) y los datos de la liga.',
  },
  {
    target: 'tab-admin',
    title: 'El número rojo',
    body: 'Te avisa cuántas cosas esperan por ti (juegos por aprobar, reclamos, resultados) y cuántas sugerencias nuevas hay.',
  },
];

/** Nombres de las pestañas de la liga (los del deporte; null = no la tiene). */
export interface LeagueTabNames {
  home: string;
  feed: string | null;
  standings: string | null;
  profile: string;
  /** La cuenta administra la liga (ve «Admin»). */
  admin: boolean;
}

/**
 * Tour de la liga de un deporte que no es el boliche: la portada, sus secciones con los nombres de sus pestañas
 * (Calendario, Partidos, Tabla, Mi equipo; Rondas y Orden de mérito en golf; Encuentros y Puntos en natación…) y el
 * buzón. Sin pines, prácticas ni fotos del marcador.
 */
export function sportLeagueTour(t: LeagueTabNames): TourStep[] {
  const list = [t.home, t.feed, t.standings, t.profile, t.admin ? 'Admin' : null].filter(Boolean) as string[];
  const names = list.length > 1 ? `${list.slice(0, -1).join(', ')} y ${list.at(-1)}` : (list[0] ?? '');
  const steps: TourStep[] = [
    {
      target: 'portada',
      title: 'Tu liga',
      body: 'De qué deporte es, dónde juegan y cuántos son. Con "Invitar" mandas el link por WhatsApp.',
    },
    { target: 'secciones', title: 'Las secciones de la liga', body: `${names}. Desliza para ver todas.` },
  ];
  if (t.feed) steps.push({ target: 'tab-juegos', title: t.feed, body: 'Los resultados de todos, los de hoy y los pasados.' });
  if (t.standings) steps.push({ target: 'tab-ranking', title: t.standings, body: 'Cómo va la temporada: quién va arriba y por cuánto.' });
  steps.push(
    { target: 'tab-perfil', title: t.profile, body: 'Lo tuyo en esta liga: tus resultados y tus números.' },
    { target: 'buzon', title: 'Buzón de sugerencias', body: 'Deja una idea o una queja a los organizadores. Es anónimo: solo ven el mensaje.' },
    { target: 'cambiar-liga', title: 'Cambia de liga', body: 'Si estás en varias ligas o torneos, cámbiate desde aquí.' },
  );
  return steps;
}
