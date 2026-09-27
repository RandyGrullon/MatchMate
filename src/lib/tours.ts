import type { TourStep } from '../components/Tour';

/** Tour del Home: lo principal de la app (sale la primera vez que se entra). */
export const HOME_TOUR: TourStep[] = [
  {
    target: 'nav',
    title: 'Bienvenido a BowlingX',
    body: 'Abajo tienes lo principal: Home (lo tuyo de hoy), Eventos (tus ligas y torneos, y las públicas para unirte), el botón morado para crear, tus notificaciones y tu Perfil (tus números en todas las ligas).',
  },
  {
    target: 'en-juego',
    title: 'En juego ahora',
    body: 'Cuando empieza una práctica o un torneo de tu liga, aparece aquí. Toca "Anotar mis juegos" y anótalos mientras juegas.',
  },
  {
    target: 'proximos',
    title: 'Tus próximas prácticas y torneos',
    body: 'Semana por semana, de todas tus ligas. Las prácticas de cada semana salen solas según el horario. Toca "Voy" para confirmar que vas.',
  },
  {
    target: 'campana',
    title: 'Notificaciones',
    body: 'Felicitaciones y comentarios a tus juegos, cuando aprueban lo que subiste, torneos nuevos… El número rojo son los nuevos.',
  },
  {
    target: 'config',
    title: 'Configuración',
    body: 'Tu nombre, modo claro u oscuro, el color de la app, las notificaciones del teléfono y repetir este tour.',
  },
  {
    target: 'crear',
    title: 'El botón morado: crear',
    body: 'Crea tu liga (prácticas, torneos y ranking) o un torneo suelto con equipos y clasificación, o únete con un código de invitación.',
  },
  {
    target: 'unirse',
    title: '¿Te invitaron?',
    body: 'Pon aquí el código de invitación para entrar a una liga privada. Al entrar ya eres jugador.',
  },
];

/** Tour de la liga (Calendario): sus secciones. */
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

/** Tour del evento con el panel del jugador: anotar mientras se juega. */
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

/** Tour de Admin: lo que maneja el organizador. */
export const ADMIN_TOUR: TourStep[] = [
  {
    target: 'admin-secciones',
    title: 'Administrar la liga',
    body: 'Jugadores (la lista y sus promedios), Aprobar (los juegos que suben los jugadores), Miembros (permisos: admins y anotadores), Buzón (sugerencias anónimas) y los datos de la liga.',
  },
  {
    target: 'tab-admin',
    title: 'El número rojo',
    body: 'Te avisa cuántos juegos esperan tu aprobación y cuántas sugerencias nuevas hay.',
  },
];
