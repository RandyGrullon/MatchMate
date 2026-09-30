/**
 * Registro de deportes: lo que la app sabe de cada deporte (nombre, familia, icono, cómo se llama el lugar,
 * unidades, reglas por defecto, tipos de evento, si sus pantallas ya están listas y su animación de apertura).
 *
 * Es el ÚNICO sitio donde la app pregunta «¿de qué deporte es esto?». LeagueShell y EventPage desvían las
 * pantallas con `dispatchSport`:
 * - listo (hoy solo el boliche): sus pantallas de siempre;
 * - conocido pero sin pantallas todavía: «Pronto» (src/pages/sports/SportComingSoon.tsx) hasta su fase;
 * - un deporte que esta versión no conoce (la base ya tiene uno nuevo): «Actualiza la app».
 *
 * Qué deportes se pueden CREAR no lo dice este archivo: lo dice la base (`sport_status`, ver status.ts).
 * Las reglas por defecto salen de los motores de cada familia (src/sports/racket, team, golf, swimming) y se
 * guardan en `leagues.rules` (jsonb) al crear la liga: tienen que ser JSON plano.
 */
import { CircleDashed, CircleDot, Goal, Grid2x2, LandPlot, Waves, createLucideIcon, type LucideIcon } from 'lucide-react';
import type { SceneId } from '../components/splash/scenes';
import { DEFAULT_ALLOWANCE } from './golf/course';
import { DEFAULT_MERIT_POINTS } from './golf/leaderboard';
import { defaultRules as racketDefaultRules, validateRules as validateRacketRules, type RacketRules, type RacketSport } from './racket/rules';
import { POINTS_6_LANES } from './swimming/results';
import { basketballConfig } from './team/basketball';
import { DEFAULT_DISCIPLINE } from './team/discipline';
import { footballConfig } from './team/football';
import { FIBA_TABLE, FOOTBALL_TABLE } from './team/standings';
import { SPORT_FAMILY, type SportFamily, type SportId } from './types';

/** Reglas de la liga tal como se guardan en `leagues.rules` (objeto JSON). */
export type SportRules = Record<string, unknown>;

/** Tipo de evento que admite un deporte (el `events.type` de la base). */
export interface EventTypeMeta {
  id: string;
  label: string;
  plural: string;
}

/** Singular y plural: ['partido', 'partidos']. */
export type UnitPair = readonly [string, string];

export interface SportMeta {
  id: SportId;
  /** Nombre del deporte. Fútbol de campo y sala comparten «Fútbol» (se eligen con la modalidad). */
  name: string;
  /** Otro nombre del deporte («Tenis de mesa»): sale debajo del nombre en la portada y en el selector. */
  alias?: string;
  /** Modalidad dentro del deporte: solo el fútbol ('Campo' | 'Sala'). */
  modality: string | null;
  /** Nombre completo: «Pádel», «Fútbol de campo», «Fútbol sala». */
  label: string;
  /** Para insignias y filtros: «Pádel», «Fútbol», «Fútbol sala». */
  short: string;
  /** En minúscula para frases: «Esta liga es de fútbol sala». */
  lower: string;
  /** Deportes del mismo grupo salen como uno solo en el selector, con selector de modalidad (fútbol). */
  group: string;
  family: SportFamily;
  icon: LucideIcon;
  /** Cómo se llama el lugar donde juegan: Bolera, Club, Cancha, Campo, Piscina. */
  venue: string;
  /** Ejemplo para el campo del lugar. */
  venueHint: string;
  units: {
    /** Lo que se juega: juego (boliche), partido, ronda (golf), prueba (natación). */
    match: UnitPair;
    /** Lo que se cuenta: pinos, sets, puntos, goles, golpes, tiempo. */
    score: string;
    /** Quién compite: jugador, pareja, equipo, nadador. */
    side: UnitPair;
  };
  /** Reglas por defecto de una liga nueva (copia nueva cada vez). */
  defaultRules: () => SportRules;
  /** Errores de unas reglas en español (vacío = bien). Sirve también para lo que venga de la base. */
  validateRules: (rules: unknown) => string[];
  /** Tipos de evento que se pueden crear en esta versión. Vacío = todavía no (llegan con su fase). */
  eventTypes: readonly EventTypeMeta[];
  /** Foto del marcador (y lectura con IA): solo el boliche. */
  photos: boolean;
  /** Sus pantallas ya están en esta versión. Si no, la liga muestra «Pronto». */
  ready: boolean;
  /** Fase del plan (docs/plan/plan.json) en que llegan sus pantallas. */
  phase: number;
  /** Animación de apertura (src/components/splash/scenes.ts; el futsal usa la del fútbol). */
  scene: SceneId;
  /** Orden en listas y en el selector (el mismo de `sport_status.sort_order`). */
  order: number;
  /**
   * Color de sus ligas (hex): la portada, las pestañas y los botones dentro de la liga (src/components/league/
   * SportTheme.tsx; los tonos para claro y oscuro salen de lib/theme.ts). null = el color de la app (el boliche,
   * que es el morado de siempre). El fútbol de campo y el de sala comparten el suyo.
   */
  color: string | null;
}

// ---------- Validación de reglas ----------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const isNum = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const isPoints = (v: unknown, max = 100) => Array.isArray(v) && v.length > 0 && v.length <= 50 && v.every((x) => isNum(x, 0, max));

/**
 * Envoltorio común: las reglas tienen que ser un objeto; el resto lo revisa cada deporte. `check` anota los
 * errores en `e`, o devuelve uno solo si ni siquiera se puede seguir revisando.
 */
function validator(check: (r: Record<string, unknown>, e: string[]) => string | void) {
  return (rules: unknown): string[] => {
    if (!isObj(rules)) return ['Las reglas no son válidas.'];
    const e: string[] = [];
    const fatal = check(rules, e);
    return fatal ? [fatal] : e;
  };
}

/** Raqueta: `{ match: reglas del motor }` (ver src/sports/racket/rules.ts). */
function racketValidator(sport: RacketSport) {
  return validator((r, e) => {
    const m = r.match;
    if (!isObj(m) || m.sport !== sport) return 'Faltan las reglas del partido.';
    e.push(...validateRacketRules(m as unknown as RacketRules));
  });
}

function checkTable(t: unknown, e: string[], draws: boolean) {
  if (!isObj(t)) {
    e.push('Faltan los puntos de la tabla.');
    return;
  }
  if (!isNum(t.win, 0, 10) || !isNum(t.loss, -10, 10) || Number(t.win) <= Number(t.loss)) e.push('Ganar tiene que dar más puntos que perder.');
  if (draws && (!isNum(t.draw, -10, 10) || Number(t.draw) < Number(t.loss) || Number(t.draw) > Number(t.win))) e.push('El empate va entre perder y ganar.');
}

const validateBasketball = validator((r, e) => {
  const m = r.match;
  if (!isObj(m) || (m.variant !== '5x5' && m.variant !== '3x3')) return 'Faltan las reglas del partido.';
  if (!isInt(m.periods, 1, 8)) e.push('Los periodos van de 1 a 8.');
  if (!isInt(m.periodMinutes, 1, 60)) e.push('Cada periodo dura de 1 a 60 minutos.');
  if (!isInt(m.overtimeMinutes, 0, 30)) e.push('La prórroga dura de 0 a 30 minutos.');
  if (!isInt(m.bonusFrom, 1, 20)) e.push('Los tiros libres por faltas de equipo van desde la 1.ª hasta la 20.ª.');
  if (!isInt(m.forfeitScore, 0, 100)) e.push('El marcador del forfeit va de 0 a 100.');
  checkTable(r.table, e, false);
});

function footballValidator(variant: 'football' | 'futsal') {
  return validator((r, e) => {
    const m = r.match;
    if (!isObj(m) || m.variant !== variant) return 'Faltan las reglas del partido.';
    if (!isInt(m.halfMinutes, 1, 60)) e.push('Cada tiempo dura de 1 a 60 minutos.');
    if (m.clock !== 'running' && m.clock !== 'stopped' && m.clock !== 'none') e.push('El reloj es corrido, parado o sin reloj.');
    if (!isInt(m.players, 3, 11)) e.push('En cancha van de 3 a 11 jugadores por equipo.');
    if (!isInt(m.shootoutKicks, 1, 11)) e.push('La tanda de penales es de 1 a 11 por equipo.');
    checkTable(r.table, e, true);
    const d = r.discipline;
    if (!isObj(d) || !isInt(d.redMatches, 0, 20) || !isInt(d.yellowsForSuspension, 0, 20)) e.push('Faltan las reglas de tarjetas.');
  });
}

const validateGolf = validator((r, e) => {
  const c = r.competition;
  if (!isObj(c) || (c.format !== 'stroke' && c.format !== 'stableford' && c.format !== 'maxScore')) return 'Falta el formato del torneo.';
  if (c.basis !== 'net' && c.basis !== 'gross') e.push('El resultado es neto o bruto.');
  if (c.allowance !== undefined && !isNum(c.allowance, 0, 100)) e.push('El % de handicap va de 0 a 100.');
  if (!isPoints(r.meritPoints)) e.push('Faltan los puntos del orden de mérito.');
});

const validateSwimming = validator((r, e) => {
  if (r.pool !== 25 && r.pool !== 50) e.push('La piscina es de 25 o de 50 metros.');
  if (!isInt(r.lanes, 1, 10)) e.push('Los carriles van de 1 a 10.');
  if (!isPoints(r.points)) e.push('Faltan los puntos por puesto.');
  if (r.ageGroups !== undefined && r.ageGroups !== 'cccan' && r.ageGroups !== 'masters' && r.ageGroups !== 'none')
    e.push('Las categorías por edad no son válidas.');
});

// ---------- Iconos ----------
// Lucide no trae pelota de tenis ni balón de baloncesto: se dibujan con su mismo trazo (24×24, línea de 2) con
// createLucideIcon, así se ven igual que los demás y reciben las mismas props (className, size, strokeWidth).

/** Pelota de tenis: el círculo y las dos costuras curvas. */
export const TennisBall: LucideIcon = createLucideIcon('tennis-ball', [
  ['circle', { cx: '12', cy: '12', r: '10', key: 'ball' }],
  ['path', { d: 'M4.9 5a9.5 9.5 0 0 1 0 14', key: 'seam-l' }],
  ['path', { d: 'M19.1 5a9.5 9.5 0 0 0 0 14', key: 'seam-r' }],
]);

/** Balón de baloncesto: el círculo, la cruz y las dos curvas de los lados. */
export const Basketball: LucideIcon = createLucideIcon('basketball', [
  ['circle', { cx: '12', cy: '12', r: '10', key: 'ball' }],
  ['path', { d: 'M12 2v20', key: 'v' }],
  ['path', { d: 'M2 12h20', key: 'h' }],
  ['path', { d: 'M4.93 4.93c3.9 3.9 3.9 10.24 0 14.14', key: 'l' }],
  ['path', { d: 'M19.07 4.93c-3.9 3.9-3.9 10.24 0 14.14', key: 'r' }],
]);

/**
 * Paleta de ping pong: la cara redonda abajo, el mango corto y grueso hacia arriba (así no parece una lupa) y la
 * pelota en el aire.
 */
export const PingPong: LucideIcon = createLucideIcon('ping-pong', [
  ['circle', { cx: '9.5', cy: '14.5', r: '6.5', key: 'blade' }],
  ['path', { d: 'M13 8.8l3.2-3.2a1.5 1.5 0 0 1 2.1 2.1L15.2 11', key: 'handle' }],
  ['circle', { cx: '4.3', cy: '4.3', r: '1.8', key: 'ball' }],
]);

// ---------- Los deportes ----------

const BOWLING_EVENTS: readonly EventTypeMeta[] = [
  { id: 'torneo', label: 'Torneo', plural: 'Torneos' },
  { id: 'practica', label: 'Práctica', plural: 'Prácticas' },
];

const PLAYER: UnitPair = ['jugador', 'jugadores'];
const TEAM: UnitPair = ['equipo', 'equipos'];
const MATCH: UnitPair = ['partido', 'partidos'];
const copy = <T>(v: T): T => structuredClone(v);

const racket = (sport: RacketSport) => ({
  family: SPORT_FAMILY[sport],
  venue: 'Club',
  venueHint: 'Club o canchas donde juegan',
  defaultRules: (): SportRules => ({ match: racketDefaultRules(sport) }),
  validateRules: racketValidator(sport),
  photos: false,
  ready: true,
});

// Liga por cajas y escalera: los cuatro deportes de raqueta (src/pages/sports/racket-formats).
const RACKET_FORMATS: readonly EventTypeMeta[] = [
  { id: 'liga', label: 'Liga', plural: 'Ligas' },
  { id: 'torneo', label: 'Torneo', plural: 'Torneos' },
  { id: 'cajas', label: 'Liga por cajas', plural: 'Ligas por cajas' },
  { id: 'escalera', label: 'Escalera', plural: 'Escaleras' },
];

/** Todos los deportes. TypeScript obliga a que estén todos los SportId. */
export const SPORTS: Readonly<Record<SportId, SportMeta>> = {
  bowling: {
    id: 'bowling',
    name: 'Boliche',
    modality: null,
    label: 'Boliche',
    short: 'Boliche',
    lower: 'boliche',
    group: 'bowling',
    family: SPORT_FAMILY.bowling,
    icon: CircleDot,
    venue: 'Bolera',
    venueHint: 'Dónde juegan',
    units: { match: ['juego', 'juegos'], score: 'pinos', side: PLAYER },
    // El boliche guarda su configuración en cada evento (juegos, handicap, cortes), como en BowlingX.
    defaultRules: () => ({}),
    validateRules: validator(() => undefined),
    eventTypes: BOWLING_EVENTS,
    photos: true,
    ready: true,
    phase: 0,
    scene: 'bowling',
    order: 1,
    color: null,
  },
  padel: {
    ...racket('padel'),
    id: 'padel',
    name: 'Pádel',
    modality: null,
    label: 'Pádel',
    short: 'Pádel',
    lower: 'pádel',
    group: 'padel',
    icon: Grid2x2,
    units: { match: MATCH, score: 'sets', side: ['pareja', 'parejas'] },
    eventTypes: [
      { id: 'americano', label: 'Americano', plural: 'Americanos' },
      { id: 'mexicano', label: 'Mexicano', plural: 'Mexicanos' },
      { id: 'liga', label: 'Liga de parejas', plural: 'Ligas de parejas' },
      { id: 'torneo', label: 'Torneo', plural: 'Torneos' },
      { id: 'cajas', label: 'Liga por cajas', plural: 'Ligas por cajas' },
      { id: 'escalera', label: 'Escalera', plural: 'Escaleras' },
    ],
    phase: 1,
    scene: 'padel',
    order: 2,
    color: '#0d9488',
  },
  tennis: {
    ...racket('tennis'),
    id: 'tennis',
    name: 'Tenis',
    modality: null,
    label: 'Tenis',
    short: 'Tenis',
    lower: 'tenis',
    group: 'tennis',
    icon: TennisBall,
    units: { match: MATCH, score: 'sets', side: PLAYER },
    eventTypes: RACKET_FORMATS,
    phase: 3,
    scene: 'tennis',
    order: 3,
    color: '#2563eb',
  },
  pickleball: {
    ...racket('pickleball'),
    id: 'pickleball',
    name: 'Pickleball',
    modality: null,
    label: 'Pickleball',
    short: 'Pickleball',
    lower: 'pickleball',
    group: 'pickleball',
    icon: CircleDashed,
    units: { match: MATCH, score: 'puntos', side: PLAYER },
    eventTypes: [
      { id: 'americano', label: 'Round robin', plural: 'Round robins' },
      { id: 'mexicano', label: 'Mexicano', plural: 'Mexicanos' },
      ...RACKET_FORMATS,
    ],
    phase: 3,
    scene: 'pickleball',
    order: 4,
    color: '#db2777',
  },
  basketball: {
    id: 'basketball',
    name: 'Baloncesto',
    modality: null,
    label: 'Baloncesto',
    short: 'Baloncesto',
    lower: 'baloncesto',
    group: 'basketball',
    family: SPORT_FAMILY.basketball,
    icon: Basketball,
    venue: 'Cancha',
    venueHint: 'Cancha o club donde juegan',
    units: { match: MATCH, score: 'puntos', side: TEAM },
    defaultRules: () => ({ match: basketballConfig('fiba'), table: copy(FIBA_TABLE) }),
    validateRules: validateBasketball,
    eventTypes: [],
    photos: false,
    ready: true,
    phase: 4,
    scene: 'basketball',
    order: 5,
    color: '#ea580c',
  },
  football: {
    id: 'football',
    name: 'Fútbol',
    modality: 'Campo',
    label: 'Fútbol de campo',
    short: 'Fútbol',
    lower: 'fútbol de campo',
    group: 'football',
    family: SPORT_FAMILY.football,
    icon: Goal,
    venue: 'Cancha',
    venueHint: 'Cancha o estadio donde juegan',
    units: { match: MATCH, score: 'goles', side: TEAM },
    defaultRules: () => ({ match: footballConfig('football'), table: copy(FOOTBALL_TABLE), discipline: copy(DEFAULT_DISCIPLINE) }),
    validateRules: footballValidator('football'),
    eventTypes: [],
    photos: false,
    ready: true,
    phase: 5,
    scene: 'football',
    order: 6,
    color: '#15803d',
  },
  futsal: {
    id: 'futsal',
    name: 'Fútbol',
    modality: 'Sala',
    label: 'Fútbol sala',
    short: 'Fútbol sala',
    lower: 'fútbol sala',
    group: 'football',
    family: SPORT_FAMILY.futsal,
    icon: Goal,
    venue: 'Cancha',
    venueHint: 'Cancha techada donde juegan',
    units: { match: MATCH, score: 'goles', side: TEAM },
    defaultRules: () => ({ match: footballConfig('futsal'), table: copy(FOOTBALL_TABLE), discipline: copy(DEFAULT_DISCIPLINE) }),
    validateRules: footballValidator('futsal'),
    eventTypes: [],
    photos: false,
    ready: true,
    phase: 5,
    scene: 'football',
    order: 7,
    color: '#15803d',
  },
  golf: {
    id: 'golf',
    name: 'Golf',
    modality: null,
    label: 'Golf',
    short: 'Golf',
    lower: 'golf',
    group: 'golf',
    family: SPORT_FAMILY.golf,
    icon: LandPlot,
    venue: 'Campo',
    venueHint: 'Campo o club de golf',
    units: { match: ['ronda', 'rondas'], score: 'golpes', side: PLAYER },
    defaultRules: () => ({ competition: { format: 'stroke', basis: 'net', allowance: DEFAULT_ALLOWANCE }, meritPoints: [...DEFAULT_MERIT_POINTS] }),
    validateRules: validateGolf,
    eventTypes: [
      { id: 'ronda', label: 'Ronda', plural: 'Rondas' },
      { id: 'torneo', label: 'Torneo', plural: 'Torneos' },
    ],
    photos: false,
    ready: true,
    phase: 6,
    scene: 'golf',
    order: 8,
    color: '#4d7c0f',
  },
  swimming: {
    id: 'swimming',
    name: 'Natación',
    modality: null,
    label: 'Natación',
    short: 'Natación',
    lower: 'natación',
    group: 'swimming',
    family: SPORT_FAMILY.swimming,
    icon: Waves,
    venue: 'Piscina',
    venueHint: 'Dónde nadan',
    units: { match: ['prueba', 'pruebas'], score: 'tiempo', side: ['nadador', 'nadadores'] },
    defaultRules: () => ({ pool: 25, lanes: 6, points: [...POINTS_6_LANES], ageGroups: 'cccan' }),
    validateRules: validateSwimming,
    eventTypes: [
      { id: 'encuentro', label: 'Encuentro', plural: 'Encuentros' },
      { id: 'control', label: 'Control de marcas', plural: 'Controles de marcas' },
      { id: 'torneo', label: 'Torneo', plural: 'Torneos' },
    ],
    photos: false,
    ready: true,
    phase: 7,
    scene: 'swimming',
    order: 9,
    color: '#0891b2',
  },
  table_tennis: {
    ...racket('table_tennis'),
    id: 'table_tennis',
    name: 'Ping pong',
    alias: 'Tenis de mesa',
    modality: null,
    label: 'Ping pong',
    short: 'Ping pong',
    lower: 'ping pong',
    group: 'table_tennis',
    icon: PingPong,
    venueHint: 'Club o salón donde están las mesas',
    units: { match: MATCH, score: 'juegos', side: PLAYER },
    eventTypes: RACKET_FORMATS,
    phase: 3, // llega con el motor de raqueta de la fase 3
    scene: 'table_tennis',
    order: 10,
    // Fucsia: ni el rojo de --danger ni el ámbar de --warn (registry.test.ts), lejos del morado de la marca y del rosa
    // del pickleball.
    color: '#b01cbd',
  },
};

/** Los deportes en orden (el de `sport_status.sort_order`). */
export const SPORT_LIST: readonly SportMeta[] = Object.values(SPORTS).sort((a, b) => a.order - b.order);

export const SPORT_IDS: readonly SportId[] = SPORT_LIST.map((s) => s.id);

/** Deporte por defecto: el de BowlingX (una liga sin deporte es de boliche). */
export const DEFAULT_SPORT: SportId = 'bowling';

export function isSportId(v: unknown): v is SportId {
  return typeof v === 'string' && Object.hasOwn(SPORTS, v);
}

/** Lo que se sabe de un deporte; null si esta versión no lo conoce. */
export function sportMeta(sport: string | null | undefined): SportMeta | null {
  return isSportId(sport) ? SPORTS[sport] : null;
}

export function getSport(sport: SportId): SportMeta {
  return SPORTS[sport];
}

/** Deporte de una liga tal como llega de la base (texto). Sin deporte = boliche (datos de BowlingX). */
export function leagueSport(league: { id: string; sport?: string | null }): string {
  return league.sport || DEFAULT_SPORT;
}

/** Deportes distintos de una lista de ligas, en el orden del registro (los desconocidos al final). */
export function sportsOf(leagues: readonly { id: string; sport?: string | null }[]): string[] {
  const set = new Set(leagues.map(leagueSport));
  const known = SPORT_IDS.filter((s) => set.has(s));
  const unknown = [...set].filter((s) => !isSportId(s)).sort();
  return [...known, ...unknown];
}

/** Qué pantallas lleva una liga según su deporte (el único punto de desvío). */
export type SportDispatch =
  | { kind: 'ready'; sport: SportId; meta: SportMeta }
  | { kind: 'soon'; sport: SportId; meta: SportMeta }
  | { kind: 'unknown'; sport: string };

export function dispatchSport(sport: string | null | undefined): SportDispatch {
  const id = sport || DEFAULT_SPORT;
  if (!isSportId(id)) return { kind: 'unknown', sport: id };
  const meta = SPORTS[id];
  return { kind: meta.ready ? 'ready' : 'soon', sport: id, meta };
}

/** Grupo del selector de deporte: uno por deporte, salvo el fútbol (campo y sala juntos). */
export interface SportGroup {
  id: string;
  name: string;
  /** Otro nombre del deporte («Tenis de mesa»), si el grupo tiene uno solo. */
  alias?: string;
  icon: LucideIcon;
  sports: readonly SportId[];
}

export function groupSports(ids: readonly SportId[]): SportGroup[] {
  const groups: SportGroup[] = [];
  for (const meta of SPORT_LIST) {
    if (!ids.includes(meta.id)) continue;
    const g = groups.find((x) => x.id === meta.group);
    if (g) {
      g.sports = [...g.sports, meta.id];
      delete g.alias;
    } else groups.push({ id: meta.group, name: meta.name, ...(meta.alias ? { alias: meta.alias } : {}), icon: meta.icon, sports: [meta.id] });
  }
  return groups;
}

export const SPORT_GROUPS: readonly SportGroup[] = groupSports(SPORT_IDS);
