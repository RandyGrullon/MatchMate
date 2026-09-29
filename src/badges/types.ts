/**
 * Insignias automáticas: tipos que comparten el catálogo, las reglas, los evaluadores, el motor y las pantallas
 * (docs/insignias.md §3.1). Todo puro: sin React ni backend, así entra en el bundle de Deno. La forma y el ícono
 * son los del sistema visual (src/badges/visual); aquí solo se importan sus tipos.
 */
import type { SportId } from '../sports/types';
import type { BadgeIconKey } from './visual/icons';
import type { BadgeShape } from './visual/types';

export type { BadgeIconKey, BadgeShape };

// ---------------------------------------------------------------------------------------------------------
// Niveles, rareza y deporte

/** 0 único, 1 bronce, 2 plata, 3 oro, 4 platino, 5 diamante. En los podios: oro = 1.º, plata = 2.º, bronce = 3.º. */
export type Level = 0 | 1 | 2 | 3 | 4 | 5;

/** Rareza estimada (§1.7.9): común, poco común, rara, épica, legendaria. */
export type Rarity = 'C' | 'PC' | 'R' | 'E' | 'L';

/** Rareza de un nivel en el catálogo: 'cerrada' = conjunto cerrado, sin meta (`bowlingx_roots`). */
export type RarityTarget = Rarity | 'cerrada';

/** Deporte de una fila otorgada: 'all' = de cuenta, sin deporte (suma todos). */
export type BadgeSport = SportId | 'all';

/**
 * Variante que cambia umbrales o textos dentro de un deporte: baloncesto 3x3 y rondas de golf de 9 hoyos.
 * Se busca de lo más específico a lo general (`['basketball3x3', 'basketball']`) y al final `default`.
 */
export type Variant = SportId | 'basketball3x3' | 'golf9';

/** Un valor igual para todos o distinto por deporte o variante (`{ football: 5, futsal: 10 }`). */
export type ByVariant<T> = T | Readonly<Partial<Record<Variant | 'default', T>>>;

// ---------------------------------------------------------------------------------------------------------
// Definición del catálogo

export type BadgeGroup =
  | 'general'
  | 'bowling'
  | 'racket'
  | 'team'
  | 'basketball'
  | 'football'
  | 'golf'
  | 'swimming'
  | 'mensual'
  | 'anual'
  | 'temporada'
  | 'comunidad';

/** `cuenta` suma todas las ligas de la cuenta (sin cuenta: el jugador en su liga, §1.6); `liga` va al jugador. */
export type BadgeScope = 'cuenta' | 'liga';

/** Cuándo se cuenta (§1.7.1). `cajas` = mes de una liga por cajas; `liga` = la vida de una liga (organización). */
export type BadgePeriod = 'siempre' | 'evento' | 'mes' | 'cajas' | 'temporada' | 'anio' | 'aniversario' | 'liga';

export type BadgeCategory =
  | 'bienvenida'
  | 'hitos'
  | 'marcas'
  | 'mejora'
  | 'constancia'
  | 'asistencia'
  | 'resultados'
  | 'juego_limpio'
  | 'multideporte'
  | 'lealtad'
  | 'organizacion'
  | 'voluntariado'
  | 'liderazgo'
  | 'companerismo'
  | 'historia';

/** Ícono del catálogo: uno de la lista curada, o 'sport' = el emblema del deporte de la fila (`SPORT_EMBLEM`). */
export type CatalogIcon = BadgeIconKey | 'sport';

/**
 * Cómo se lee el umbral de los niveles:
 * - `gte`: el valor llega al umbral (contadores, marcas, mejoras);
 * - `lt`: el valor queda por debajo del umbral (golf: «ronda por debajo de 90»);
 * - `place`: el umbral es el puesto (1.º oro, 2.º plata, 3.º bronce);
 * - `none`: sin número (se da o no se da).
 */
export type LevelCompare = 'gte' | 'lt' | 'place' | 'none';

/** Un nivel del catálogo. Cada nivel es una fila propia en `badge_awards`. */
export interface LevelDef {
  level: Level;
  threshold?: ByVariant<number>;
  rarity: ByVariant<RarityTarget>;
  /** El nivel pide la validación alta del deporte (B2 en boliche, G2 en golf). */
  strict?: boolean;
  /** Requisitos extra de este nivel que lee el evaluador (p. ej. `{ rivals: 3 }`, `{ months: 6 }`). */
  req?: Readonly<Record<string, number>>;
}

/** Otra cara de la misma insignia según lo que pasó (albatros en `golf_eagle`, torneo suelto en `season_podium`). */
export interface BadgeAlt {
  name?: string;
  description?: string;
  /** Esta cara pide aval (§1.7.5). */
  aval?: boolean;
}

/** Quién evalúa la insignia en el motor: las que salen de los mismos datos comparten evaluador. */
export type EvaluatorId =
  | 'debut'
  | 'account_activity'
  | 'month_streak'
  | 'climbing'
  | 'event_podium'
  | 'bowling_career'
  | 'bowling_game'
  | 'bowling_event'
  | 'racket_career'
  | 'racket_match'
  | 'racket_night'
  | 'team_career'
  | 'team_match'
  | 'basketball_career'
  | 'basketball_match'
  | 'football_career'
  | 'football_match'
  | 'golf_career'
  | 'golf_card'
  | 'swim_career'
  | 'swim_meet'
  | 'month_league'
  | 'month_account'
  | 'box_month'
  | 'ladder_month'
  | 'year_account'
  | 'year_league'
  | 'season_league'
  | 'season_staff'
  | 'community';

/**
 * Una insignia automática. Los textos son plantillas con `{n}`, `{liga}`, `{mes}`… (ver `PLACEHOLDERS` en
 * catalog.ts) y pueden cambiar por deporte o variante.
 */
export interface BadgeDef {
  key: string;
  group: BadgeGroup;
  /** Deportes donde existe; 'all' = de cuenta, sin deporte (la fila lleva `sport = 'all'`). */
  sports: readonly SportId[] | 'all';
  scope: BadgeScope;
  period: BadgePeriod;
  category: BadgeCategory;
  shape: BadgeShape;
  icon: CatalogIcon;
  name: ByVariant<string>;
  /** Nombre propio de un nivel ('Pavo', 'Hat-trick', 'Primer lugar'). Si falta, el metal. */
  levelNames?: Readonly<Partial<Record<Level, ByVariant<string>>>>;
  /** Lo que lee quien la ganó. */
  description: ByVariant<string>;
  /** Texto propio de un nivel (manda sobre `description`). */
  levelDescriptions?: Readonly<Partial<Record<Level, ByVariant<string>>>>;
  /** Cómo se gana, en palabras simples (la ve el dueño en las bloqueadas). `{n}` = el umbral del nivel. */
  how: ByVariant<string>;
  /** Unidad del progreso ('juego', 'juegos'): «Te faltan 3 juegos». */
  unit?: ByVariant<readonly [string, string]>;
  compare: LevelCompare;
  /** En orden de nivel, de menor a mayor. Las de un solo nivel usan el nivel 0. */
  levels: readonly LevelDef[];
  alts?: Readonly<Record<string, BadgeAlt>>;
  /** Constantes del criterio que lee el evaluador (mínimos, ventanas, topes); se calibran aquí (§3.8). */
  params?: Readonly<Record<string, ByVariant<number>>>;
  /** Se gana una vez por evento o periodo y sale con ×N (§1.7.10). */
  repeatable?: boolean;
  /** De un periodo se guarda solo el nivel más alto (`monthly_regular`, `season_attendance`, `year_recap`). */
  highestOnly?: boolean;
  /** Una sola vez en la vida por deporte (`season_rookie`). */
  oncePerSport?: boolean;
  /** Se inserta oculta (`hidden = true`) y no avisa (§1.7.10). */
  privateByDefault?: boolean;
  /** Queda `en_revision` hasta que la confirme alguien que no está en el juego (§1.7.5). */
  aval?: boolean;
  /** Compara con otros: se apaga con `badges_auto = 'sin_titulos'` (§1.7.4). Son 24. */
  title?: boolean;
  /** Pide cuenta: un jugador sin cuenta nunca la gana (aniversario, organización, comunidad). */
  accountOnly?: boolean;
  /** Conjunto cerrado: nadie la gana después de la migración (`bowlingx_roots`). */
  closed?: boolean;
  /** No existe en ligas con menores. */
  noMinors?: boolean;
  /** Variantes donde no existe (baloncesto 3x3 en las de triples). */
  excludeVariants?: readonly Variant[];
  evaluator: EvaluatorId;
}

// ---------------------------------------------------------------------------------------------------------
// Filas de la base

export type AwardStatus = 'provisional' | 'firme' | 'en_revision' | 'revocada';
export type RevokeReason = 'evidencia' | 'aval' | 'fraude';

/** `leagues.badges_auto` (§1.7.4). */
export type BadgesAuto = 'todas' | 'sin_titulos' | 'ninguna';

/** Evidencia guardada en `badge_awards.context` (< 4 KB). */
export interface BadgeContext {
  v: 1;
  /** Valores que explican la insignia: `{ avg: 187, games: 12, base: 178 }`. */
  values?: Record<string, number | string | boolean | null>;
  /** El nombre se copia porque la liga puede cambiarlo o borrarse. */
  league?: { id: string; name: string };
  event?: { id: string; name: string };
  season?: { id: string; name: string };
  team?: { id: string; name: string };
  /** Ventana de fechas evaluada ('YYYY-MM-DD'). */
  window?: [string, string];
  /** Solo contó el historial verificado (reclamo que aprobó la misma cuenta, §1.6). */
  verified_only?: boolean;
  /** La cara que se ganó (`BadgeDef.alts`). */
  alt?: string;
  /** Salió de la plantilla y no de la alineación («según plantilla»). */
  by_roster?: boolean;
  [key: string]: unknown;
}

/** Una fila de `badge_awards` tal como la leen las pantallas. */
export interface BadgeAwardRow extends BadgeHolder {
  id: string;
  badge_key: string;
  sport: BadgeSport;
  level: Level;
  period_key: string;
  status: AwardStatus;
  awarded_at: string;
  firm_at: string | null;
  refs: string[];
  context: BadgeContext;
  hidden: boolean;
  seen_at: string | null;
  notified_at: string | null;
  revoked_at: string | null;
  revoke_reason: RevokeReason | null;
  updated_at: string;
}

/** Progreso hacia el siguiente nivel (`badge_progress`, solo lo ve su dueño). */
export interface BadgeProgressRow extends BadgeHolder {
  badge_key: string;
  sport: BadgeSport;
  value: number;
  target: number;
  next_level: Level;
  updated_at: string;
}

/** Rareza medida cada noche (`badge_stats`, §3.8). */
export interface BadgeStatsRow {
  badge_key: string;
  sport: BadgeSport;
  level: Level;
  holders: number;
  base: number;
  pct: number;
  rarity: 'nueva' | 'comun' | 'poco_comun' | 'rara' | 'epica' | 'legendaria';
  computed_at: string;
}

// ---------------------------------------------------------------------------------------------------------
// Cola del motor y decisiones

/** `private.badge_queue.kind` (§3.2). `aviso` lo resuelve SQL solo (`badge_notices`). */
export type JobKind =
  | 'resultado'
  | 'revisar'
  | 'evento'
  | 'cajas'
  | 'escalera'
  | 'mes'
  | 'anio'
  | 'temporada'
  | 'noche'
  | 'cuenta'
  | 'vinculo'
  | 'historial'
  | 'aviso';

export const JOB_KINDS: readonly JobKind[] = [
  'resultado',
  'revisar',
  'evento',
  'cajas',
  'escalera',
  'mes',
  'anio',
  'temporada',
  'noche',
  'cuenta',
  'vinculo',
  'historial',
  'aviso',
];

/**
 * Un trabajo de la cola (fila de `private.badge_queue`). `ref` dice qué tocó: 'entry:<id>', 'match:<id>',
 * 'card:<id>', 'meet:<event>', 'season:<id>', '2026-10'… `payload` guarda lo que después no se puede leer (la
 * foto del mes de cajas, los jugadores de un borrado). Si un jugador se vinculó él mismo, lo dice la foto
 * (`players[].verified_only`), no el trabajo.
 */
export interface BadgeJob {
  id: number;
  kind: JobKind;
  league_id: string | null;
  user_id: string | null;
  ref: string;
  payload: Record<string, unknown>;
  run_after: string;
  attempts: number;
  created_at: string;
}

/**
 * A quién va una fila: la cuenta (ámbito cuenta: `user_id`, sin liga) o el jugador en su liga (ámbito liga y copia
 * de respaldo sin cuenta: `player_id` + `league_id`). Siempre uno de los dos, como el check de `badge_awards`.
 */
export interface BadgeHolder {
  player_id: string | null;
  user_id: string | null;
  league_id: string | null;
}

export const userHolder = (userId: string): BadgeHolder => ({ player_id: null, user_id: userId, league_id: null });
export const playerHolder = (playerId: string, leagueId: string): BadgeHolder => ({ player_id: playerId, user_id: null, league_id: leagueId });

/** Las decisiones van planas (sin objetos anidados) para que `badge_apply` las lea con `->>` directo. */
interface DecisionBase extends BadgeHolder {
  badge_key: string;
  sport: BadgeSport;
}

/** Dar (o reactivar) una insignia. `status` provisional pone `firm_at = awarded_at + 7 días` en SQL. */
export interface AwardDecision extends DecisionBase {
  kind: 'award';
  level: Level;
  period_key: string;
  status: 'provisional' | 'firme';
  refs: string[];
  context: BadgeContext;
  /** Privada por defecto: se inserta oculta y no avisa. */
  hidden?: boolean;
}

/** Pedir aval: la fila nace `en_revision` y se avisa a los revisores elegibles (§1.7.5). */
export interface ReviewDecision extends DecisionBase {
  kind: 'review';
  level: Level;
  period_key: string;
  refs: string[];
  context: BadgeContext;
  /** Cuentas que pueden confirmarla (owner o admin fuera del juego). Vacío = va a la cola del superadmin. */
  reviewers: string[];
}

/** Retirar una provisional (o en revisión) que ya no cumple. Las firmes no se tocan. */
export interface RevokeDecision extends DecisionBase {
  kind: 'revoke';
  level: Level;
  period_key: string;
  reason: 'evidencia';
}

/** Progreso hacia el siguiente nivel. `next_level = null` borra la fila (ya tiene el más alto). */
export interface ProgressDecision extends DecisionBase {
  kind: 'progress';
  value: number;
  target: number;
  next_level: Level | null;
}

/** Lo que devuelven los evaluadores; `evaluate` lo asienta y lo aplica `private.badge_apply` en una transacción. */
export type BadgeDecision = AwardDecision | ReviewDecision | RevokeDecision | ProgressDecision;

/**
 * Pasar la copia de respaldo de una insignia de cuenta (la que ganó el jugador cuando no tenía cuenta, §1.6) a la
 * cuenta que ahora lo tiene. `badge_apply` la mueve (`player_id` y `league_id` nulos, `user_id` la cuenta) o, si la
 * cuenta ya tenía la misma fila, deja una sola (la mejor, con el `awarded_at` más viejo) sin aviso nuevo. Solo la
 * arma el motor (`adoptions` en engine.ts), nunca un evaluador.
 */
export interface AdoptDecision {
  kind: 'adopt';
  badge_key: string;
  sport: BadgeSport;
  level: Level;
  period_key: string;
  player_id: string;
  league_id: string;
  user_id: string;
}

/** Lo que devuelve `evaluate(job, snapshot, now)`: las adopciones primero y después lo de los evaluadores. */
export type EngineDecision = BadgeDecision | AdoptDecision;
