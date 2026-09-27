/**
 * Contrato del backend de MatchMate. La app nunca habla directo con Supabase ni con PGlite: habla con esto.
 *
 * - `supabase`: producción (Postgres + RLS + Realtime Broadcast + Storage + Edge Functions).
 * - `local`: PGlite (Postgres en el navegador o en Node) con LAS MISMAS migraciones y políticas RLS,
 *   para desarrollo, pruebas y demo sin cuenta de Supabase.
 *
 * Reglas del contrato:
 * - Lecturas con `select` sobre tablas o vistas (la RLS decide qué ve cada quien).
 * - TODAS las escrituras son `rpc` a funciones de Postgres (validan permisos y son atómicas).
 * - Tiempo real por temas: `event:<uuid>`, `league:<uuid>`, `user:<uuid>`. Los triggers de la base
 *   llaman a `private.emit(topic, event, payload)`; en Supabase eso es Broadcast y en local es NOTIFY.
 */

export interface Session {
  userId: string;
  email: string | null;
  /** Nombre del perfil (profiles.name). */
  name: string | null;
}

export type AuthEvent = 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED' | 'USER_UPDATED' | 'PASSWORD_RECOVERY';

/**
 * `captchaToken`: el de Cloudflare Turnstile (src/components/Turnstile.tsx) cuando el proyecto de Supabase tiene
 * «Captcha protection» activado. Sin eso, se omite. El backend local lo ignora.
 */
export interface BackendAuth {
  getSession(): Promise<Session | null>;
  onChange(cb: (event: AuthEvent, session: Session | null) => void): () => void;
  /**
   * Crea la cuenta. Devuelve null si hay que confirmar el correo antes de entrar.
   * `meta`: datos extra del registro que guarda el perfil (p. ej. `{ adult: true }` = marcó «tengo 18 años o más»).
   */
  signUp(email: string, password: string, name: string, meta?: Record<string, unknown>, captchaToken?: string): Promise<Session | null>;
  signIn(email: string, password: string, captchaToken?: string): Promise<Session>;
  /** Google: en Supabase redirige (o usa Google Identity Services); en local no está disponible. */
  signInWithGoogle(): Promise<void>;
  signOut(): Promise<void>;
  resetPassword(email: string, captchaToken?: string): Promise<void>;
  /** Vuelve a mandar el correo para confirmar la cuenta (p. ej. cuentas traídas de BowlingX sin confirmar). */
  resendConfirmation(email: string, captchaToken?: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
}

export type FilterOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'is' | 'contains';

export interface Filter {
  col: string;
  op: FilterOp;
  /** `in`: arreglo de valores; `is`: null o boolean; `contains`: arreglo que la columna (array) contiene. */
  value: unknown;
}

export interface SelectQuery {
  /** Tabla o vista de `public`. */
  table: string;
  /** Columnas separadas por coma; por defecto `*`. Sin joins anidados (se leen por separado). */
  columns?: string;
  filters?: Filter[];
  order?: { col: string; asc?: boolean }[];
  limit?: number;
}

export type BackendErrorKind =
  | 'permission' // 42501, RLS, no autorizado
  | 'validation' // 23514 check, 22xxx datos inválidos, P0001 con mensaje de validación
  | 'not_found'
  | 'conflict' // 23505 único
  | 'rate_limited' // P0001 'rate_limited'
  | 'auth' // sesión vencida o credenciales malas
  | 'network' // sin señal o servidor caído: se reintenta
  | 'unknown';

/** Error normalizado. `retryable` = vale la pena reintentar (red, 5xx); si no, es definitivo. */
export class BackendError extends Error {
  constructor(
    message: string,
    readonly kind: BackendErrorKind,
    readonly code: string | null = null,
    readonly retryable = kind === 'network',
  ) {
    super(message);
    this.name = 'BackendError';
  }
}

export interface RealtimeMessage {
  event: string;
  payload: unknown;
}

export interface BackendStorage {
  upload(bucket: string, path: string, data: Blob, contentType: string): Promise<void>;
  /** URL temporal para ver el archivo (en local, un blob: o data: URL). */
  signedUrl(bucket: string, path: string, expiresInSeconds?: number): Promise<string>;
  remove(bucket: string, paths: string[]): Promise<void>;
}

export interface Backend {
  readonly mode: 'supabase' | 'local';
  readonly auth: BackendAuth;
  select<T = Record<string, unknown>>(q: SelectQuery): Promise<T[]>;
  rpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T>;
  /** Suscribirse a un tema de tiempo real. Devuelve la función para cancelar. */
  subscribe(topic: string, onMessage: (msg: RealtimeMessage) => void): () => void;
  readonly storage: BackendStorage;
  /** Edge Functions (p. ej. `scan-bowling`). En local, una implementación de prueba o un error claro. */
  invoke<T = unknown>(fn: string, body: unknown): Promise<T>;
  /** Hay conexión con el backend (en local siempre true). */
  online(): boolean;
}
