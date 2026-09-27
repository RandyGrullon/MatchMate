import { basketballConfig, type BasketballConfig, type BasketballPreset } from '../../../sports/team/basketball';
import { FIBA_TABLE, type BasketballTableConfig } from '../../../sports/team/standings';
import { teamRules, type TeamRules } from '../../../lib/data/teamSports';

/**
 * Reglas de una liga de baloncesto (leagues.rules, copiadas en cada partido al crearlo):
 * - `match`: la configuración del motor (src/sports/team/basketball.ts);
 * - `table`: puntos de la tabla FIBA (ganar 2, perder 1, forfeit 0, default 1);
 * - `teams`: refuerzos por partido, mínimo de jugadores de la convocatoria, reloj corrido y la plantilla elegida.
 * Las plantillas: «Liga 5x5 FIBA 4×10», «Liga de barrio a 2 mitades con reloj corrido» y «Torneo 3x3 a 21».
 */

export type BasketballTemplateId = 'fiba' | 'barrio' | '3x3';

export interface BasketballTemplate {
  id: BasketballTemplateId;
  name: string;
  description: string;
  preset: BasketballPreset;
  teams: Omit<TeamRules, 'template'>;
}

export const BASKETBALL_TEMPLATES: readonly BasketballTemplate[] = [
  {
    id: 'fiba',
    name: 'Liga 5x5 FIBA 4×10',
    description: '4 cuartos de 10 minutos y prórrogas de 5. Desde la 5.ª falta de equipo del cuarto, tiros libres. Tiempos muertos: 2 en la 1.ª mitad y 3 en la 2.ª.',
    preset: 'fiba',
    teams: { minPlayers: 5, reinforcements: 2, runningClock: false },
  },
  {
    id: 'barrio',
    name: 'Liga de barrio a 2 mitades (reloj corrido)',
    description: '2 mitades de 20 minutos con reloj corrido (no se para en cada falta). Desde la 7.ª falta de equipo de la mitad, tiros libres.',
    preset: 'halves',
    teams: { minPlayers: 5, reinforcements: 2, runningClock: true },
  },
  {
    id: '3x3',
    name: 'Torneo 3x3 a 21',
    description: 'Un periodo de 10 minutos: gana quien llegue a 21 antes. Canastas de 1 y 2. Desde la 7.ª falta de equipo, 2 tiros libres; desde la 10.ª, también la posesión.',
    preset: '3x3',
    teams: { minPlayers: 3, reinforcements: 1, runningClock: false },
  },
];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const int = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : undefined;
const intOrNull = (v: unknown, min: number, max: number): number | null | undefined => (v === null ? null : int(v, min, max));

/**
 * Configuración del motor desde las reglas (de la liga o del partido). Lo que falte o venga raro toma el valor de
 * la plantilla de su variante (FIBA 5x5 o 3x3), así un partido viejo o unas reglas a medias igual se juegan.
 */
export function basketballConfigFrom(rules: unknown): BasketballConfig {
  const m = isObj(rules) && isObj(rules.match) ? rules.match : {};
  const base = basketballConfig(m.variant === '3x3' ? '3x3' : 'fiba');
  const out: BasketballConfig = structuredClone(base);
  const set = <K extends keyof BasketballConfig>(k: K, v: BasketballConfig[K] | undefined) => {
    if (v !== undefined) out[k] = v;
  };
  set('periods', int(m.periods, 1, 8));
  set('periodMinutes', int(m.periodMinutes, 1, 60));
  set('overtimeMinutes', int(m.overtimeMinutes, 0, 30));
  if (typeof m.clock === 'boolean') out.clock = m.clock;
  set('bonusFrom', int(m.bonusFrom, 1, 20));
  const dbl = intOrNull(m.doubleBonusFrom, 1, 30);
  if (dbl !== undefined) out.doubleBonusFrom = dbl;
  set('forfeitScore', int(m.forfeitScore, 0, 100));
  const target = intOrNull(m.target, 1, 100);
  if (target !== undefined) out.target = target;
  const otTarget = intOrNull(m.overtimeTarget, 1, 20);
  if (otTarget !== undefined) out.overtimeTarget = otTarget;
  if (isObj(m.ejection)) {
    const e = m.ejection;
    const fouls = intOrNull(e.fouls, 1, 10);
    if (fouls !== undefined) out.ejection.fouls = fouls;
    const tech = intOrNull(e.technicals, 1, 10);
    if (tech !== undefined) out.ejection.technicals = tech;
    const unsp = intOrNull(e.unsportsmanlike, 1, 10);
    if (unsp !== undefined) out.ejection.unsportsmanlike = unsp;
    if (typeof e.mixed === 'boolean') out.ejection.mixed = e.mixed;
  }
  if (isObj(m.timeouts)) {
    const t = m.timeouts;
    for (const k of ['firstHalf', 'secondHalf', 'lastTwoMinutes', 'overtime'] as const) {
      const v = int(t[k], 0, 10);
      if (v !== undefined) out.timeouts[k] = v;
    }
    const pg = intOrNull(t.perGame, 0, 10);
    if (pg !== undefined) out.timeouts.perGame = pg;
  }
  return out;
}

/** Puntos de la tabla desde las reglas (FIBA por defecto). */
export function basketballTableFrom(rules: unknown): BasketballTableConfig {
  const t = isObj(rules) && isObj(rules.table) ? rules.table : {};
  const num = (v: unknown, min: number, max: number, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : d);
  return {
    win: num(t.win, 0, 10, FIBA_TABLE.win),
    loss: num(t.loss, -10, 10, FIBA_TABLE.loss),
    forfeitLoss: num(t.forfeitLoss, -10, 10, FIBA_TABLE.forfeitLoss),
    defaultLoss: num(t.defaultLoss, -10, 10, FIBA_TABLE.defaultLoss),
    forfeitScore: num(t.forfeitScore, 0, 100, FIBA_TABLE.forfeitScore),
    lot: Array.isArray(t.lot) ? t.lot.filter((x): x is string => typeof x === 'string') : [],
    lotSeed: typeof t.lotSeed === 'string' ? t.lotSeed : null,
  };
}

/** Refuerzos, mínimo de la convocatoria y reloj corrido (el 3x3 pide 3 jugadores). */
export function basketballTeamRules(rules: unknown): TeamRules {
  const cfg = basketballConfigFrom(rules);
  return teamRules(rules, { minPlayers: cfg.variant === '3x3' ? 3 : 5 });
}

/** Las reglas completas de una plantilla, conservando lo demás que tenga la liga. */
export function templateRules(id: BasketballTemplateId, current: Record<string, unknown> = {}): Record<string, unknown> {
  const t = BASKETBALL_TEMPLATES.find((x) => x.id === id) ?? BASKETBALL_TEMPLATES[0];
  return {
    ...current,
    match: basketballConfig(t.preset),
    table: { ...FIBA_TABLE, ...(isObj(current.table) ? current.table : {}) },
    teams: { ...t.teams, template: t.id },
  };
}

/** Plantilla que coincide con la configuración (null = reglas propias). */
export function templateOf(rules: unknown): BasketballTemplate | null {
  const cfg = basketballConfigFrom(rules);
  const named = isObj(rules) && isObj(rules.teams) && typeof rules.teams.template === 'string' ? rules.teams.template : null;
  const same = (t: BasketballTemplate) => JSON.stringify(basketballConfig(t.preset)) === JSON.stringify(cfg);
  return BASKETBALL_TEMPLATES.find((t) => t.id === named && same(t)) ?? BASKETBALL_TEMPLATES.find(same) ?? null;
}

/** «4 cuartos de 10 min · prórroga de 5 · tiros libres desde la 5.ª falta». */
export function describeConfig(cfg: BasketballConfig): string {
  const periods =
    cfg.periods === 4 ? `4 cuartos de ${cfg.periodMinutes} min` : cfg.periods === 2 ? `2 mitades de ${cfg.periodMinutes} min` : `${cfg.periods} × ${cfg.periodMinutes} min`;
  const parts = [cfg.variant === '3x3' ? `3x3 · ${periods}${cfg.target ? ` o a ${cfg.target}` : ''}` : periods];
  if (cfg.variant === '5x5') parts.push(cfg.overtimeMinutes ? `prórroga de ${cfg.overtimeMinutes}` : 'prórroga sin reloj');
  parts.push(`tiros libres desde la ${cfg.bonusFrom}.ª falta`);
  if (!cfg.clock) parts.push('sin reloj');
  return parts.join(' · ');
}
