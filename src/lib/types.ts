export type EventType = 'torneo' | 'practica';

/** Cómo se ordena una clasificación: con handicap o solo pinos (scratch). */
export type RankBy = 'hcp' | 'scratch';

/** Marca de juegos cargados del Excel histórico: cuentan como verificados aunque no tengan foto. */
export const IMPORTED = 'importado';

/** Marca de juegos anotados en una liga que no exige foto: cuentan sin foto. */
export const NO_PHOTO = 'sin-foto';

export type Visibility = 'public' | 'private';

/** Liga (temporada con torneos y prácticas) o torneo suelto, sin liga. */
export type LeagueKind = 'liga' | 'torneo';

/** Liga (club): todo lo demás vive dentro de una liga. Un torneo sin liga es una "liga" de un solo torneo. */
export interface League {
  id: string;
  name: string;
  /** Sin valor = liga. */
  kind?: LeagueKind;
  visibility: Visibility;
  ownerUid: string;
  /** Bolera donde juegan. */
  venue: string;
  /** Cuándo juegan, en texto libre: "Martes 7:00 pm". */
  schedule: string;
  /** Temporada (YYYY-MM-DD); vacío = sin definir. */
  seasonStart: string;
  seasonEnd: string;
  /** A quién escribir por los torneos (sale en los anuncios). */
  contactName: string;
  /** WhatsApp del contacto, solo dígitos con código de país. */
  contactPhone: string;
  /** Si es true, un juego solo cuenta con la foto del marcador. */
  requirePhoto: boolean;
}

export type LeagueRole = 'owner' | 'admin' | 'member';

/** Pertenencia de una cuenta a una liga. id = `${leagueId}_${uid}`. */
export interface Member {
  id: string;
  leagueId: string;
  uid: string;
  /** Nombre de la cuenta al unirse (para listas de miembros). */
  name: string;
  role: LeagueRole;
  /** Jugador de la liga vinculado a esta cuenta. */
  playerId: string | null;
  /** Anotador (solo en torneos sin liga): anota los juegos de todos. Se suma a su rol y a ser jugador. */
  scorer?: boolean;
}

/** Código de invitación a una liga privada (el id del documento es el código). */
export interface Invite {
  id: string;
  leagueId: string;
  leagueName: string;
}

export interface Player {
  id: string;
  name: string;
  /** Promedio fijado a mano; null = se calcula con sus juegos verificados. */
  averageOverride: number | null;
  /** Cuenta vinculada; sin cuenta = null o ausente (jugadores que anota el admin). */
  uid?: string | null;
}

/** Cuenta de la app (users/{uid}). */
export interface UserProfile {
  id: string;
  email: string;
  name: string;
  /** Superadmin: administra todas las ligas y las cuentas. */
  superadmin?: boolean;
}

export interface Team {
  name: string;
  order: number;
}

export interface BowlingEvent {
  id: string;
  type: EventType;
  name: string;
  /** YYYY-MM-DD */
  date: string;
  games: number;
  /** Handicap = (hcpBase - promedio) * hcpPercent / 100. Solo torneos. */
  hcpBase: number;
  hcpPercent: number;
  teams: Record<string, Team>;
  playerCount: number;
  /** Torneo 2025: individual con handicap y equipos por scratch. */
  individualRankBy?: RankBy;
  teamRankBy?: RankBy;
  /** Promedio mínimo para categoría A, B y C (debajo es D). */
  categoryCuts?: [number, number, number];
  /** Jugadores por equipo (torneo): límite al armar equipos. */
  teamSize?: number;
  /** Mensaje del anuncio del torneo para los miembros de la liga. */
  announcement?: string;
  /** Asistencia confirmada por los jugadores (práctica): playerId → true. */
  rsvp?: Record<string, boolean>;
  /** Cuándo se creó (para los avisos de "nuevo torneo"). */
  createdAt?: { toMillis(): number } | null;
}

/**
 * Juego anotado por cuadros: los pinos de cada tiro en orden y, si se anotó tocando los pines,
 * qué pines cayeron en cada tiro (bit 0 = pin 1 … bit 9 = pin 10).
 */
export interface GameFrames {
  rolls: number[];
  masks?: (number | null)[];
}

/** Participación de un jugador en un evento. id = `${eventId}_${playerId}`. */
export interface Entry {
  id: string;
  eventId: string;
  playerId: string;
  teamId: string | null;
  /** Promedio con el que entró al evento (congelado para el handicap del torneo). */
  average: number;
  handicapOverride: number | null;
  /** Pinos por juego (índice = juego - 1). */
  scores: (number | null)[];
  /** Foto que verifica cada juego (o IMPORTED / NO_PHOTO). null = borrador: no cuenta en estadísticas. */
  photos: (string | null)[];
  /** Cuadros de los juegos que se anotaron tiro por tiro (clave = índice del juego). */
  frames?: Record<string, GameFrames>;
}

export type SubmissionStatus = 'pendiente' | 'aprobado' | 'rechazado';

/** Juegos que un jugador sube desde su página; esperan aprobación del admin de la liga. */
export interface Submission {
  id: string;
  playerId: string;
  /** Evento donde jugó; null si lo subió por fecha (no había evento creado). */
  eventId: string | null;
  /** Día que jugó (YYYY-MM-DD) cuando no hay evento: se aprueba en la práctica de ese día. */
  date?: string | null;
  /** Lo que anotó el jugador. */
  scores: (number | null)[];
  /** Lo que leyó la IA en la foto para ese jugador (null si no pudo). */
  scanned: (number | null)[] | null;
  /** Nombre de la fila de la foto que se tomó como la del jugador (si se leyó después de enviar). */
  scannedName?: string | null;
  /** Cuadros de los juegos anotados tiro por tiro (clave = índice del juego). */
  frames?: Record<string, GameFrames> | null;
  /** Foto del marcador; null si se envió sin foto (el admin decide si la acepta). */
  photoId: string | null;
  status: SubmissionStatus;
  note: string | null;
  createdAt?: { toMillis(): number } | null;
  /** Cuándo lo aprobó o rechazó un admin. */
  reviewedAt?: { toMillis(): number } | null;
  /** Qué cuenta lo revisó (un admin que aprueba sus propios juegos no recibe aviso). */
  reviewedBy?: string | null;
}

/**
 * leagues/{lid}/live/{eventId}_{playerId}: los juegos que el jugador va anotando en su teléfono,
 * publicados para que todos los vean en vivo. No cuentan hasta que los envía y un admin los aprueba.
 */
export interface LiveScore {
  id: string;
  eventId: string;
  playerId: string;
  scores: (number | null)[];
  updatedAt?: { toMillis(): number } | null;
}

/**
 * leagues/{lid}/suggestions/{id}: nota del buzón de sugerencias. Es anónima: la nota no guarda quién la
 * escribió, solo el mensaje; la marca de ritmo (limits/{uid}) no la puede leer nadie desde la app.
 * La leen los organizadores (dueño y admins).
 */
export interface Suggestion {
  id: string;
  text: string;
  /** Ya la vio un organizador. */
  read: boolean;
  createdAt?: { toMillis(): number } | null;
}

/** Reacción al juego de alguien: me gusta o felicitar (una por persona y juego). */
export type ReactionType = 'like' | 'felicitar';

/** leagues/{lid}/reactions/{entryId}_{uid} */
export interface Reaction {
  id: string;
  /** Participación (juego de un jugador en un evento). */
  entryId: string;
  eventId: string;
  /** Dueño del juego (a quien le llega el aviso). */
  playerId: string;
  /** Quien reacciona. */
  uid: string;
  name: string;
  type: ReactionType;
  createdAt?: { toMillis(): number } | null;
}

/** leagues/{lid}/comments/{id}: comentario en el juego de alguien. */
export interface GameComment {
  id: string;
  entryId: string;
  eventId: string;
  playerId: string;
  uid: string;
  name: string;
  text: string;
  createdAt?: { toMillis(): number } | null;
}

export interface Photo {
  id: string;
  /** data URL JPEG comprimida */
  data: string;
  width: number;
  height: number;
}
