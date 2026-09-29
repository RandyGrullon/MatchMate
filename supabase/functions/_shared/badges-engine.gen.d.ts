// GENERADO por scripts/badges/bundle.mjs (pnpm badges:bundle): no se edita a mano.
// Tipos de badges-engine.gen.js. Los completos están en src/badges (types.ts, snapshot.ts); aquí van sueltos para
// que Deno no tenga que importar nada.

/** Una decisión del motor (BadgeDecision de src/badges/types.ts): plana, como la lee private.badge_apply. */
export interface EngineDecision {
  kind: 'award' | 'review' | 'revoke' | 'progress' | 'adopt';
  badge_key: string;
  sport: string;
  player_id: string | null;
  user_id: string | null;
  league_id: string | null;
  [key: string]: unknown;
}

/** Hash del código fuente con que se generó (el mismo de la cabecera). */
export declare const SOURCE_HASH: string;
/** evaluate(job, snapshot, now) con los nombres para el push (context.name y context.level_name). */
export declare function evaluateJob(job: unknown, snapshot: unknown, now?: number | string): EngineDecision[];
export declare function withPushLabels(decisions: readonly EngineDecision[]): EngineDecision[];
export declare function pushLabel(decision: EngineDecision): { name: string; level_name?: string } | null;
