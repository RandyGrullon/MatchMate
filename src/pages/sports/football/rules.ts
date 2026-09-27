import { footballConfig, type FootballConfig, type FootballPreset, type FootballVariant } from '../../../sports/team/football';
import { DEFAULT_DISCIPLINE, type DisciplineConfig } from '../../../sports/team/discipline';
import { FAIR_PLAY_FIFA, FOOTBALL_TABLE, type FootballTableConfig, type FootballTieBreak } from '../../../sports/team/standings';
import { teamRules, type TeamRules } from '../../../lib/data/teamSports';

/**
 * Reglas de una liga de fútbol de campo (football) o de sala (futsal), tal como se guardan en `leagues.rules` y se
 * copian en cada partido al crearlo:
 * - `match`: la configuración del motor (src/sports/team/football.ts). La variante es SIEMPRE la de la liga (la base
 *   no deja guardar partidos de la otra modalidad): campo y sala nunca se mezclan;
 * - `table`: puntos (3-1-0), W.O., puntos por penales y el orden de desempate;
 * - `discipline`: suspensiones automáticas (roja = 1 partido, 3 amarillas = 1 partido…);
 * - `teams`: mínimo para la convocatoria (7 en campo, 5 en fútbol 7, 3 en sala), refuerzos y la plantilla elegida.
 * Las plantillas: «Liga de campo ida y vuelta», «Fútbol 7», «Liga de sala», «Liga de sala amateur» y
 * «Torneo relámpago (grupos + final)» (una por modalidad).
 */

export type FootballTemplateId = 'campo' | 'campo7' | 'sala' | 'sala_amateur' | 'relampago';

/** Cómo se juega la temporada: liga (todos contra todos) o torneo relámpago (grupos y eliminatoria). */
export type FootballFormat = 'liga' | 'relampago';

export interface FootballTemplate {
  id: FootballTemplateId;
  variant: FootballVariant;
  name: string;
  description: string;
  preset: FootballPreset;
  overrides?: Partial<FootballConfig>;
  format: FootballFormat;
  /** Ida y vuelta al armar el calendario (lo que sale marcado). */
  double: boolean;
  teams: Omit<TeamRules, 'template'>;
}

export const FOOTBALL_TEMPLATES: readonly FootballTemplate[] = [
  {
    id: 'campo',
    variant: 'football',
    name: 'Liga de campo ida y vuelta',
    description: '11 contra 11, 2 tiempos de 45 minutos con reloj corrido y añadido. 5 cambios. Todos contra todos, de ida y de vuelta.',
    preset: 'football',
    format: 'liga',
    double: true,
    teams: { minPlayers: 7, reinforcements: 0, runningClock: true },
  },
  {
    id: 'campo7',
    variant: 'football',
    name: 'Fútbol 7',
    description: '7 contra 7, 2 tiempos de 30 minutos. Cambios ilimitados y con reingreso. Todos contra todos.',
    preset: 'football7',
    format: 'liga',
    double: false,
    teams: { minPlayers: 5, reinforcements: 0, runningClock: true },
  },
  {
    id: 'relampago',
    variant: 'football',
    name: 'Torneo relámpago (grupos + final)',
    description: 'Partidos cortos de 2 × 20 minutos en grupos (todos contra todos) y después semifinal o final. En la eliminatoria, si empatan, penales (5 y luego muerte súbita).',
    preset: 'football',
    overrides: { halfMinutes: 20 },
    format: 'relampago',
    double: false,
    teams: { minPlayers: 7, reinforcements: 0, runningClock: true },
  },
  {
    id: 'sala',
    variant: 'futsal',
    name: 'Liga de sala',
    description: '5 contra 5, 2 tiempos de 20 minutos con reloj parado. Faltas acumuladas (desde la 6.ª, tiro libre desde 10 m), 1 tiempo muerto por mitad y 2 minutos con uno menos tras una roja.',
    preset: 'futsal',
    format: 'liga',
    double: false,
    teams: { minPlayers: 3, reinforcements: 0, runningClock: false },
  },
  {
    id: 'sala_amateur',
    variant: 'futsal',
    name: 'Liga de sala amateur (reloj corrido)',
    description: 'Como la liga de sala, pero el reloj no se para en cada falta ni cuando sale la pelota.',
    preset: 'futsal_amateur',
    format: 'liga',
    double: false,
    teams: { minPlayers: 3, reinforcements: 0, runningClock: true },
  },
  {
    id: 'relampago',
    variant: 'futsal',
    name: 'Torneo relámpago (grupos + final)',
    description: 'Partidos de 2 × 15 minutos con reloj corrido en grupos y después semifinal o final. En la eliminatoria, si empatan, 3 penales y luego muerte súbita.',
    preset: 'futsal_amateur',
    overrides: { halfMinutes: 15, shootoutKicks: 3 },
    format: 'relampago',
    double: false,
    teams: { minPlayers: 3, reinforcements: 0, runningClock: true },
  },
];

export const templatesFor = (variant: FootballVariant) => FOOTBALL_TEMPLATES.filter((t) => t.variant === variant);

/** Variante de la liga por su deporte: 'futsal' es sala; todo lo demás, campo. */
export const variantOf = (sport: string | null | undefined): FootballVariant => (sport === 'futsal' ? 'futsal' : 'football');

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const int = (v: unknown, min: number, max: number): number | undefined => (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : undefined);
const num = (v: unknown, min: number, max: number, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : d);

/** Configuración del motor desde las reglas (de la liga o del partido). Lo que falte o venga raro toma el valor de su variante. */
export function footballConfigFrom(rules: unknown, variant: FootballVariant): FootballConfig {
  const m = isObj(rules) && isObj(rules.match) ? rules.match : {};
  const out: FootballConfig = footballConfig(variant === 'futsal' ? 'futsal' : 'football');
  const set = <K extends keyof FootballConfig>(k: K, v: FootballConfig[K] | undefined) => {
    if (v !== undefined) out[k] = v;
  };
  set('halfMinutes', int(m.halfMinutes, 1, 60));
  if (m.clock === 'running' || m.clock === 'stopped' || m.clock === 'none') out.clock = m.clock;
  if (typeof m.extraTime === 'boolean') out.extraTime = m.extraTime;
  set('extraTimeMinutes', int(m.extraTimeMinutes, 1, 30));
  if (typeof m.shootout === 'boolean') out.shootout = m.shootout;
  set('shootoutKicks', int(m.shootoutKicks, 1, 11));
  if (isObj(m.subs)) {
    const s = m.subs;
    if (s.max === null) out.subs.max = null;
    else {
      const max = int(s.max, 0, 30);
      if (max !== undefined) out.subs.max = max;
    }
    if (typeof s.reentry === 'boolean') out.subs.reentry = s.reentry;
    const bonus = int(s.extraTimeBonus, 0, 5);
    if (bonus !== undefined) out.subs.extraTimeBonus = bonus;
  }
  if (m.accumulatedFouls === null) out.accumulatedFouls = null;
  else if (isObj(m.accumulatedFouls)) {
    const a = int(m.accumulatedFouls.alertAt, 1, 30);
    const p = int(m.accumulatedFouls.penaltyFrom, 1, 30);
    if (a !== undefined && p !== undefined) out.accumulatedFouls = { alertAt: a, penaltyFrom: p };
  }
  set('timeoutsPerHalf', int(m.timeoutsPerHalf, 0, 5));
  if (m.powerPlayMs === null) out.powerPlayMs = null;
  else set('powerPlayMs', int(m.powerPlayMs, 0, 600_000));
  set('players', int(m.players, 3, 11));
  set('walkoverScore', int(m.walkoverScore, 0, 20));
  return out;
}

const TIEBREAKS: readonly FootballTieBreak[] = ['diff', 'for', 'wins', 'h2h', 'h2h_points', 'h2h_diff', 'h2h_for', 'fair_play', 'lot'];

/** Nombre de cada desempate (para el admin y la explicación de la tabla). */
export const TIEBREAK_LABEL: Record<FootballTieBreak, string> = {
  diff: 'Diferencia de goles',
  for: 'Goles a favor',
  wins: 'Partidos ganados',
  h2h: 'Enfrentamiento directo (puntos, diferencia y goles entre ellos)',
  h2h_points: 'Puntos entre ellos',
  h2h_diff: 'Diferencia de goles entre ellos',
  h2h_for: 'Goles a favor entre ellos',
  fair_play: 'Juego limpio (menos tarjetas)',
  lot: 'Sorteo',
};

/** Los desempates que se ofrecen al admin (los h2h_* sueltos quedan para reglas escritas a mano). */
export const TIEBREAK_CHOICES: readonly FootballTieBreak[] = ['diff', 'for', 'h2h', 'wins', 'fair_play', 'lot'];

/** Puntos y desempates de la tabla (3-1-0 y dif. → goles → directo → juego limpio → sorteo por defecto). */
export function footballTableFrom(rules: unknown): FootballTableConfig {
  const t = isObj(rules) && isObj(rules.table) ? rules.table : {};
  const tb = Array.isArray(t.tiebreak) ? [...new Set(t.tiebreak.filter((x): x is FootballTieBreak => TIEBREAKS.includes(x as FootballTieBreak)))] : [];
  const so = isObj(t.shootout) ? { win: num(t.shootout.win, 0, 10, 2), loss: num(t.shootout.loss, 0, 10, 1) } : null;
  const fp = isObj(t.fairPlay) ? t.fairPlay : {};
  return {
    win: num(t.win, 0, 10, FOOTBALL_TABLE.win),
    draw: num(t.draw, -10, 10, FOOTBALL_TABLE.draw),
    loss: num(t.loss, -10, 10, FOOTBALL_TABLE.loss),
    walkoverLoss: num(t.walkoverLoss, -10, 10, FOOTBALL_TABLE.walkoverLoss),
    walkoverScore: num(t.walkoverScore, 0, 20, FOOTBALL_TABLE.walkoverScore),
    shootout: so,
    tiebreak: tb.length ? tb : [...FOOTBALL_TABLE.tiebreak],
    fairPlay: {
      yellow: num(fp.yellow, -20, 0, FAIR_PLAY_FIFA.yellow),
      secondYellow: num(fp.secondYellow, -20, 0, FAIR_PLAY_FIFA.secondYellow),
      red: num(fp.red, -20, 0, FAIR_PLAY_FIFA.red),
      yellowRed: num(fp.yellowRed, -20, 0, FAIR_PLAY_FIFA.yellowRed),
    },
    lot: Array.isArray(t.lot) ? t.lot.filter((x): x is string => typeof x === 'string') : [],
    lotSeed: typeof t.lotSeed === 'string' ? t.lotSeed : null,
  };
}

/** Suspensiones automáticas (roja = 1 partido, 3 amarillas = 1 partido por defecto). */
export function disciplineFrom(rules: unknown): DisciplineConfig {
  const d = isObj(rules) && isObj(rules.discipline) ? rules.discipline : {};
  const n = (v: unknown, dflt: number) => int(v, 0, 20) ?? dflt;
  return {
    redMatches: n(d.redMatches, DEFAULT_DISCIPLINE.redMatches),
    secondYellowMatches: n(d.secondYellowMatches, DEFAULT_DISCIPLINE.secondYellowMatches),
    yellowsForSuspension: n(d.yellowsForSuspension, DEFAULT_DISCIPLINE.yellowsForSuspension),
    yellowMatches: n(d.yellowMatches, DEFAULT_DISCIPLINE.yellowMatches),
    secondYellowCounts: typeof d.secondYellowCounts === 'boolean' ? d.secondYellowCounts : DEFAULT_DISCIPLINE.secondYellowCounts,
    walkoverServes: typeof d.walkoverServes === 'boolean' ? d.walkoverServes : DEFAULT_DISCIPLINE.walkoverServes,
  };
}

/** Mínimo para jugar según los jugadores en cancha: 11 → 7, 7 → 5, 5 → 3. */
export function defaultMinPlayers(players: number): number {
  if (players >= 11) return 7;
  if (players >= 7) return 5;
  return Math.max(1, players - 2);
}

/** Mínimo de la convocatoria, refuerzos y reloj corrido. */
export function footballTeamRules(rules: unknown, variant: FootballVariant): TeamRules {
  const cfg = footballConfigFrom(rules, variant);
  return teamRules(rules, { minPlayers: defaultMinPlayers(cfg.players), reinforcements: 0, runningClock: cfg.clock !== 'stopped' });
}

/** Liga o torneo relámpago (sale de la plantilla elegida). */
export function formatOf(rules: unknown): FootballFormat {
  return isObj(rules) && isObj(rules.teams) && rules.teams.template === 'relampago' ? 'relampago' : 'liga';
}

const templateConfig = (t: FootballTemplate) => footballConfig(t.preset, t.overrides ?? {});

/** Las reglas completas de una plantilla, conservando lo demás que tenga la liga (tabla y disciplina). */
export function templateRules(id: FootballTemplateId, variant: FootballVariant, current: Record<string, unknown> = {}): Record<string, unknown> {
  const t = templatesFor(variant).find((x) => x.id === id) ?? templatesFor(variant)[0];
  return {
    ...current,
    match: templateConfig(t),
    table: { ...FOOTBALL_TABLE, ...(isObj(current.table) ? current.table : {}) },
    discipline: { ...DEFAULT_DISCIPLINE, ...(isObj(current.discipline) ? current.discipline : {}) },
    teams: { ...t.teams, template: t.id },
  };
}

/** Plantilla que coincide con la configuración (null = reglas propias). */
export function templateOf(rules: unknown, variant: FootballVariant): FootballTemplate | null {
  const cfg = footballConfigFrom(rules, variant);
  const named = isObj(rules) && isObj(rules.teams) && typeof rules.teams.template === 'string' ? rules.teams.template : null;
  const same = (t: FootballTemplate) => JSON.stringify(templateConfig(t)) === JSON.stringify(cfg);
  const list = templatesFor(variant);
  return list.find((t) => t.id === named && same(t)) ?? list.find(same) ?? null;
}

/** Reglas de un partido de eliminatoria: si empatan, penales (y prórroga si se pide). */
export function knockoutRules(rules: Record<string, unknown>, variant: FootballVariant, opts: { extraTime?: boolean } = {}): Record<string, unknown> {
  const cfg = footballConfigFrom(rules, variant);
  return { ...rules, match: { ...cfg, shootout: true, extraTime: !!opts.extraTime } };
}

const CLOCK_WORD: Record<FootballConfig['clock'], string> = { running: 'reloj corrido', stopped: 'reloj parado', none: 'sin reloj' };

/** «2 tiempos de 45 min · reloj corrido · 11 por lado · 5 cambios». */
export function describeConfig(cfg: FootballConfig): string {
  const parts = [`2 tiempos de ${cfg.halfMinutes} min`, CLOCK_WORD[cfg.clock], `${cfg.players} por lado`];
  parts.push(cfg.subs.max === null ? (cfg.subs.reentry ? 'cambios ilimitados con reingreso' : 'cambios ilimitados') : `${cfg.subs.max} cambios`);
  if (cfg.accumulatedFouls) parts.push(`faltas acumuladas (10 m desde la ${cfg.accumulatedFouls.penaltyFrom}.ª)`);
  if (cfg.timeoutsPerHalf) parts.push(`${cfg.timeoutsPerHalf} tiempo muerto por mitad`);
  if (cfg.powerPlayMs) parts.push(`${Math.round(cfg.powerPlayMs / 60_000)} min con uno menos tras una roja`);
  if (cfg.extraTime) parts.push(`prórroga de 2 × ${cfg.extraTimeMinutes}`);
  if (cfg.shootout) parts.push(`penales (${cfg.shootoutKicks} y muerte súbita)`);
  return parts.join(' · ');
}

/** «Roja: 1 partido · 3 amarillas: 1 partido». */
export function describeDiscipline(d: DisciplineConfig): string {
  const p = (n: number) => `${n} ${n === 1 ? 'partido' : 'partidos'}`;
  const parts = [`Roja directa: ${p(d.redMatches)}`, `doble amarilla: ${p(d.secondYellowMatches)}`];
  parts.push(d.yellowsForSuspension > 0 ? `${d.yellowsForSuspension} amarillas: ${p(d.yellowMatches)}` : 'las amarillas no se acumulan');
  return parts.join(' · ');
}

/** Minutos que dura un partido (para los choques del calendario): los dos tiempos más 15 de descanso y añadido. */
export const matchMinutes = (cfg: FootballConfig) => 2 * cfg.halfMinutes + 15;

/** Por qué está suspendido (los motivos de src/sports/team/discipline). */
export const REASON_TEXT: Record<string, string> = {
  roja: 'roja directa',
  doble_amarilla: 'doble amarilla',
  amarillas: 'amarillas acumuladas',
  comite: 'sanción del comité',
};
