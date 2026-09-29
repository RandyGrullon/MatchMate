/**
 * Entrada del motor para la Edge Function `insignias` (docs/insignias.md §3.1). Es lo único que entra en
 * supabase/functions/_shared/badges-engine.gen.js (`pnpm badges:bundle`, scripts/badges/bundle.mjs): un solo ESM sin
 * imports que Deno carga tal cual. Todo puro, sin E/S; la función solo pide la foto, llama `evaluateJob` y aplica.
 *
 * Además del motor, pone en cada insignia que se da (o que pide aval) cómo se llama para el push: `context.name`
 * («Primera línea», «Tu 2026») y, con nivel, `context.level_name` (el propio, «Pavo», o el metal: «oro»). Los lee
 * `private.badge_push_label`; sin ellos el aviso dice «Insignia». Si el evaluador ya los puso, no se tocan.
 */
import { LEVEL_TIER, badgeDef, fillText, nameOf, pickVariant, variantsOf, type Placeholder } from './catalog';
import { decide } from './engine';
import type { BadgeSnapshot } from './snapshot';
import type { AwardDecision, BadgeJob, EngineDecision, ReviewDecision } from './types';

/**
 * Lo que decide el motor (`decide`: `evaluate` más las copias de respaldo que pasan a la cuenta) con los nombres para
 * el push. `now` en milisegundos o ISO (por defecto, la hora de la foto).
 */
export function evaluateJob(job: BadgeJob, snapshot: BadgeSnapshot, now?: number | string): EngineDecision[] {
  return withPushLabels(decide(job, snapshot, now ?? snapshot.now));
}

/** Valores del contexto que sirven para rellenar un nombre con `{…}` (`year_recap`: «Tu {anio}»). */
function textVars(d: AwardDecision | ReviewDecision): Partial<Record<Placeholder, string | number>> {
  const vars: Partial<Record<Placeholder, string | number>> = {};
  for (const [k, v] of Object.entries(d.context.values ?? {})) {
    if (typeof v === 'string' || typeof v === 'number') vars[k as Placeholder] = v;
  }
  const c = d.context;
  if (c.league?.name) vars.liga ??= c.league.name;
  if (c.event?.name) vars.evento ??= c.event.name;
  if (c.season?.name) vars.temporada ??= c.season.name;
  if (c.team?.name) vars.equipo ??= c.team.name;
  if (vars.anio === undefined && /^\d{4}$/.test(d.period_key)) vars.anio = d.period_key;
  return vars;
}

/** Quita lo que quedó sin rellenar («Tu {anio}» sin año → «Tu») y los espacios de más. */
const tidy = (text: string) =>
  text
    .replace(/\{[a-z_]+\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Cómo se nombra la insignia en el push: {name, level_name?}; null si la key no está en el catálogo. */
export function pushLabel(d: AwardDecision | ReviewDecision): { name: string; level_name?: string } | null {
  const def = badgeDef(d.badge_key);
  if (!def) return null;
  const variants = variantsOf(d.sport);
  const name = tidy(fillText(nameOf(def, { variants, alt: typeof d.context.alt === 'string' ? d.context.alt : null }), textVars(d))) || def.key;
  if (d.level === 0) return { name };
  const own = pickVariant(def.levelNames?.[d.level], variants);
  return { name, level_name: own ? tidy(fillText(own, textVars(d))) : LEVEL_TIER[d.level] };
}

/** Pone `context.name` y `context.level_name` en lo que se da o pide aval (sin cambiar lo que ya traían). */
export function withPushLabels(decisions: readonly EngineDecision[]): EngineDecision[] {
  return decisions.map((d) => {
    if (d.kind !== 'award' && d.kind !== 'review') return d;
    const label = pushLabel(d);
    if (!label) return d;
    const context = { ...d.context };
    if (typeof context.name !== 'string' || !context.name.trim()) context.name = label.name;
    if (label.level_name && (typeof context.level_name !== 'string' || !context.level_name.trim())) context.level_name = label.level_name;
    return { ...d, context };
  });
}
