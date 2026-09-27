/**
 * Formas de lo que entra a la migración (respaldo de BowlingX y `firebase auth:export`) y de lo que sale
 * (cuentas, filas por tabla y archivos para Storage).
 *
 * Entrada: el «Respaldo completo» del superadmin de BowlingX (src/lib/backup.ts de BowlingX: `leagues[]` con
 * sus colecciones y `users[]`), el respaldo de una liga (`league` + colecciones), o lo que saca
 * `exportar` (lo mismo, más `photos[]`, `inviteCode` e `invites[]`). Las fechas de Firestore vienen en texto ISO.
 */

// ---------- Entrada: Firestore ----------

/** Fecha de Firestore ya pasada a texto ISO (o lo que haya quedado). */
export type FsTime = string | null | undefined;

export interface FsGameFrames {
  rolls: number[];
  masks?: (number | null)[];
}

export interface FsUser {
  id: string;
  email?: string | null;
  name?: string | null;
  superadmin?: boolean;
  createdAt?: FsTime;
}

export interface FsMember {
  id?: string;
  leagueId?: string;
  uid: string;
  name?: string | null;
  role?: string;
  playerId?: string | null;
  scorer?: boolean;
  joinedAt?: FsTime;
}

export interface FsPlayer {
  id: string;
  name?: string | null;
  averageOverride?: number | null;
  uid?: string | null;
  createdAt?: FsTime;
}

export interface FsEvent {
  id: string;
  type?: string;
  name?: string | null;
  date?: string | null;
  games?: number;
  hcpBase?: number;
  hcpPercent?: number;
  teams?: Record<string, { name?: string | null; order?: number } | null> | null;
  playerCount?: number;
  individualRankBy?: string | null;
  teamRankBy?: string | null;
  categoryCuts?: number[] | null;
  teamSize?: number | null;
  announcement?: string | null;
  rsvp?: Record<string, boolean> | null;
  createdAt?: FsTime;
}

export interface FsEntry {
  id: string;
  eventId: string;
  playerId: string;
  teamId?: string | null;
  average?: number | null;
  handicapOverride?: number | null;
  scores?: (number | null)[] | null;
  photos?: (string | null)[] | null;
  frames?: Record<string, FsGameFrames> | null;
  createdAt?: FsTime;
}

export interface FsSubmission {
  id: string;
  playerId: string;
  eventId?: string | null;
  date?: string | null;
  scores?: (number | null)[] | null;
  scanned?: (number | null)[] | null;
  scannedName?: string | null;
  frames?: Record<string, FsGameFrames> | null;
  photoId?: string | null;
  status?: string;
  note?: string | null;
  createdAt?: FsTime;
  reviewedAt?: FsTime;
  reviewedBy?: string | null;
}

export interface FsReaction {
  id: string;
  entryId?: string;
  eventId?: string;
  playerId?: string;
  uid: string;
  name?: string | null;
  type?: string;
  createdAt?: FsTime;
}

export interface FsComment {
  id: string;
  entryId?: string;
  eventId?: string;
  playerId?: string;
  uid: string;
  name?: string | null;
  text?: string | null;
  createdAt?: FsTime;
}

export interface FsSuggestion {
  id: string;
  text?: string | null;
  read?: boolean;
  createdAt?: FsTime;
}

/**
 * Foto del marcador. En Firestore `data` es un data URL JPEG; `exportar` la guarda aparte en `file`
 * (ruta relativa a la carpeta de la exportación) para no hacer un JSON de cientos de MB.
 */
export interface FsPhoto {
  id: string;
  data?: string | null;
  file?: string | null;
  bytes?: number | null;
  contentType?: string | null;
  width?: number | null;
  height?: number | null;
  eventId?: string | null;
  createdAt?: FsTime;
}

export interface FsLeague {
  id: string;
  name?: string | null;
  kind?: string;
  visibility?: string;
  ownerUid?: string;
  venue?: string | null;
  schedule?: string | null;
  seasonStart?: string | null;
  seasonEnd?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  requirePhoto?: boolean;
  createdAt?: FsTime;
  players?: FsPlayer[];
  events?: FsEvent[];
  entries?: FsEntry[];
  submissions?: FsSubmission[];
  reactions?: FsReaction[];
  comments?: FsComment[];
  suggestions?: FsSuggestion[];
  members?: FsMember[];
  /** Solo en la exportación completa (el respaldo de la app no trae fotos). */
  photos?: FsPhoto[];
  /** leagues/{id}/private/invite.code (solo en la exportación). */
  inviteCode?: string | null;
}

/** El respaldo completo, ya normalizado (ver `normalizeBackup`). */
export interface FsBackup {
  app?: string;
  exportedAt?: string;
  leagues: FsLeague[];
  users: FsUser[];
  /** invites/{código} → liga (solo en la exportación). */
  invites?: { id: string; leagueId: string }[];
}

// ---------- Entrada: firebase auth:export --format=json ----------

export interface FirebaseAuthUser {
  localId: string;
  email?: string;
  emailVerified?: boolean;
  passwordHash?: string;
  salt?: string;
  displayName?: string;
  disabled?: boolean;
  createdAt?: string;
  lastSignedInAt?: string;
  providerUserInfo?: { providerId: string; rawId?: string; email?: string; displayName?: string }[];
}

export interface FirebaseAuthExport {
  users: FirebaseAuthUser[];
}

// ---------- Salida ----------

/** Tablas en el orden en que se cargan (cada una después de las que referencia). */
export const TABLES = [
  'profiles',
  'leagues',
  'league_secrets',
  'league_members',
  'players',
  'events',
  'teams',
  'event_rsvps',
  'photos',
  'entries',
  'submissions',
  'reactions',
  'comments',
  'suggestions',
] as const;

export type TableName = (typeof TABLES)[number];

/** Clave para el upsert (on conflict) de cada tabla. */
export const CONFLICT_KEYS: Record<TableName, string[]> = {
  profiles: ['id'],
  leagues: ['id'],
  league_secrets: ['league_id'],
  league_members: ['league_id', 'user_id'],
  players: ['id'],
  events: ['id'],
  teams: ['id'],
  event_rsvps: ['event_id', 'player_id'],
  photos: ['id'],
  entries: ['id'],
  submissions: ['id'],
  reactions: ['id'],
  comments: ['id'],
  suggestions: ['id'],
};

export type Row = Record<string, unknown>;

/** Una cuenta para Supabase Auth (auth.admin.createUser). */
export interface UserPlan {
  /** uuid en MatchMate: UUID v5 del uid, o el de la cuenta que ya existía con ese correo. */
  id: string;
  firebaseUid: string;
  email: string;
  name: string;
  /** email_confirm: el correo ya está verificado (Google o verificado en Firebase, o --confiar-correos). */
  emailConfirmed: boolean;
  /** `$fbscrypt$…` para password_hash; null = sin contraseña (Google, o sin los parámetros del hash). */
  passwordHash: string | null;
  /** Proveedores en Firebase ('password', 'google.com'…). */
  providers: string[];
  /** Deshabilitada en Firebase: se crea bloqueada. */
  banned: boolean;
  isSuperadmin: boolean;
  createdAt: string;
  /** Ya existía en MatchMate (se registró antes con el mismo correo): no se crea, solo se marca su firebase_uid. */
  existing: boolean;
}

/** Foto que hay que subir a Storage (bucket scoreboards). */
export interface PhotoFile {
  bucket: 'scoreboards';
  path: string;
  contentType: 'image/jpeg' | 'image/webp';
  bytes: number;
  /** De dónde salen los bytes: un data URL, o un archivo de la carpeta de la exportación. */
  source: { dataUrl: string } | { file: string };
}

/** Algo que se arregló o que no se pudo pasar (para el reporte). */
export interface Issue {
  table: string;
  /** Id de BowlingX (ruta de Firestore) para buscarlo. */
  ref: string;
  message: string;
}

export interface TransformReport {
  counts: Record<TableName | 'users' | 'files', number>;
  users: {
    total: number;
    withPassword: number;
    googleOnly: number;
    withoutPassword: number;
    unconfirmed: number;
    banned: number;
    reused: number;
    superadmins: number;
  };
  photos: { found: number; migrated: number; old: number; tooBig: number; missingData: number; bytes: number };
  /** Datos que se corrigieron para que quepan en las reglas de MatchMate (se migran). */
  fixes: Issue[];
  /** Filas que NO se migran. */
  dropped: Issue[];
}

export interface MigrationPlan {
  users: UserPlan[];
  /** Filas por tabla, listas para upsert en el orden de TABLES (profiles solo de las cuentas nuevas). */
  rows: Record<TableName, Row[]>;
  /** Cuentas que ya existían: solo se les pone firebase_uid (y superadmin si lo eran). */
  profileUpdates: { id: string; firebase_uid: string; is_superadmin: boolean }[];
  files: PhotoFile[];
  /** Ids de BowlingX → MatchMate de ligas y cuentas (para redirigir links viejos). */
  map: { leagues: Record<string, string>; users: Record<string, string> };
  report: TransformReport;
}
