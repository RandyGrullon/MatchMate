/**
 * Natación: lo que las pantallas calculan con el motor (src/sports/swimming), sin React ni backend.
 * Puestos y puntos por prueba y categoría, puntos por club y medallero del encuentro y de la temporada,
 * hoja de series (armada o publicada), plantillas de encuentro y quién se puede inscribir en qué.
 */
import {
  CCCAN_AGE_GROUPS,
  GENDER_LABEL,
  STROKE_LABEL,
  defaultPoints,
  formatSwimTime,
  mastersAgeGroups,
  parseSwimTime,
  medalTable,
  placeResults,
  seedHeats,
  teamPoints,
  type AgeGroup,
  type Heat,
  type MedalRow,
  type Placed,
  type SwimGender,
  type SwimResult,
  type SwimStroke,
  type TeamScore,
} from '../../../sports/swimming';
import type { AgeScheme, SwimClub, SwimEntry, SwimEventItem, SwimEventInput, SwimMeet, SwimSeason, SwimmerInfo, SwimmerPrivate } from '../../../lib/data/swimming';

/** Lo que comparten las pestañas del encuentro (MeetPage; también la app del teléfono). */
export interface MeetData {
  lid: string;
  meet: SwimMeet;
  events: SwimEventItem[];
  entries: SwimEntry[];
  clubs: Map<string, SwimClub>;
  clubList: SwimClub[];
  name: (playerId: string) => string;
}

// ---------- Categorías ----------

const MASTERS = mastersAgeGroups();

export function ageGroupsOf(scheme: AgeScheme): AgeGroup[] {
  return scheme === 'cccan' ? CCCAN_AGE_GROUPS : scheme === 'masters' ? MASTERS : [];
}

/** «9-10», «8 y menos», «40-44»; sin categoría: «Abierta». */
export function groupLabel(id: string | null | undefined): string {
  if (!id) return 'Abierta';
  return CCCAN_AGE_GROUPS.find((g) => g.id === id)?.label ?? MASTERS.find((g) => g.id === id)?.label ?? id;
}

export const SCHEME_LABEL: Record<AgeScheme, string> = {
  cccan: 'Por edad (8 y menos … 18 y más)',
  masters: 'Másters (de 5 en 5 desde 25)',
  none: 'Sin categorías',
};

// ---------- Menores ----------

/** Desde esta edad (cumplida este año) ya no es menor. La base cuenta igual (private.minor_by_birth_year). */
export const ADULT_AGE = 18;

/** Año de hoy en la zona de la liga (como la base; sin zona, la de siempre de las ligas). */
export function leagueYear(tz?: string | null, now: number = Date.now()): number {
  const year = (timeZone: string) => Number(new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone }).format(now));
  try {
    return year(tz || 'America/Santo_Domingo');
  } catch {
    return year('UTC');
  }
}

/** ¿Menor por su año de nacimiento? (año de la liga − año < 18; sin año no se sabe: no). */
export const minorByBirthYear = (birthYear: number | null | undefined, year: number): boolean => birthYear != null && year - birthYear < ADULT_AGE;

/**
 * Por qué no se puede guardar el nadador por su edad (null = se puede). Con año de nacimiento de menor tiene que
 * estar registrado como menor (sin cuenta) en una liga con menores; si no, la base lo rechaza ('invalido').
 */
export function minorAgeProblem(o: {
  birthYear: number | null;
  year: number;
  isMinor: boolean;
  /** Cambiando un nadador que ya existe (ahí la marca de menor no se cambia). */
  editing: boolean;
  hasAccount: boolean;
  minorsOk: boolean;
}): string | null {
  if (!minorByBirthYear(o.birthYear, o.year) || o.isMinor) return null;
  if (o.editing) {
    return o.hasAccount
      ? 'Con ese año de nacimiento sería menor de edad, y los menores no tienen cuenta. Revisa el año.'
      : 'Con ese año de nacimiento sería menor de edad, pero no está registrado como menor. Revisa el año.';
  }
  return o.minorsOk
    ? 'Por el año de nacimiento es menor de edad: márcalo como menor.'
    : 'Por el año de nacimiento es menor de edad y esta liga no admite menores (un admin lo activa en Admin › Liga, «Liga con menores»; la liga queda privada).';
}

// ---------- Pruebas ----------

/** «50 m Libre». */
export const raceName = (ev: { distance: number; stroke: SwimStroke }) => `${ev.distance} m ${STROKE_LABEL[ev.stroke]}`;

/** «Femenino · 9-10, 11-12» (sin categorías: solo el sexo). */
export function raceDetail(ev: Pick<SwimEventItem, 'gender' | 'ageGroups'>): string {
  const parts = [GENDER_LABEL[ev.gender]];
  if (ev.ageGroups.length) parts.push(ev.ageGroups.map(groupLabel).join(', '));
  return parts.join(' · ');
}

/** «Prueba 3 · 50 m Libre · Femenino · 9-10». */
export const raceTitle = (ev: SwimEventItem) => `Prueba ${ev.num} · ${raceName(ev)} · ${raceDetail(ev)}`;

/** Los encuentros «de verdad» dan puntos y medallas; el control de marcas solo tiempos. */
export const scores = (meet: Pick<SwimMeet, 'type'>) => meet.type !== 'control';

// ---------- Plantillas ----------

/**
 * «Encuentro de club (finales por tiempo)»: por sexo, 50 de cada estilo, 100 libre y el combinado (100 en piscina
 * de 25, 200 en la de 50); con categorías por edad, además 25 libre para los de 8 y menos (solo piscina de 25).
 * Todas abiertas: las series mezclan categorías y el puesto se calcula por categoría.
 */
export function clubMeetTemplate(pool: 25 | 50, scheme: AgeScheme): SwimEventInput[] {
  const out: SwimEventInput[] = [];
  const genders: SwimGender[] = ['F', 'M'];
  if (pool === 25 && scheme === 'cccan') for (const g of genders) out.push({ distance: 25, stroke: 'libre', gender: g, ageGroups: ['8-'] });
  const races: [number, SwimStroke][] = [
    [50, 'libre'],
    [50, 'espalda'],
    [50, 'pecho'],
    [50, 'mariposa'],
    [100, 'libre'],
    [pool === 25 ? 100 : 200, 'combinado'],
  ];
  for (const [distance, stroke] of races) for (const g of genders) out.push({ distance, stroke, gender: g, ageGroups: [] });
  return out.map((e, k) => ({ ...e, num: k + 1 }));
}

/** «Control de marcas»: mixtas y abiertas, una por estilo más el 100 libre. */
export function timeTrialTemplate(): SwimEventInput[] {
  const races: [number, SwimStroke][] = [
    [50, 'libre'],
    [50, 'espalda'],
    [50, 'pecho'],
    [50, 'mariposa'],
    [100, 'libre'],
  ];
  return races.map(([distance, stroke], k) => ({ num: k + 1, distance, stroke, gender: 'X', ageGroups: [] }));
}

/** Puntos por puesto por defecto según los carriles (6-4-3-2-1 o 9-7-6-5-4-3-2-1). */
export const pointsFor = (lanes: number) => [...defaultPoints(lanes)];

// ---------- Resultados ----------

export interface ResultRow extends SwimResult {
  entryId: string;
  swimmerId: string;
  teamId: string | null;
  swimEventId: string;
  heat: number | null;
  lane: number | null;
}

/** Inscripción → fila del motor. El sexo del puesto es el de la prueba (en las mixtas, todos juntos). */
export function toResult(e: SwimEntry, ev: Pick<SwimEventItem, 'gender'>): ResultRow {
  return {
    entryId: e.id,
    swimmerId: e.playerId,
    teamId: e.clubId,
    swimEventId: e.swimEventId,
    gender: ev.gender,
    ageGroup: e.ageGroup,
    time: e.time,
    status: e.status,
    heat: e.heat,
    lane: e.lane,
  };
}

/** La inscripción ya tiene resultado (un tiempo, o DQ, DNS, DNF). */
export const hasResult = (e: SwimEntry) => e.resultAt != null || e.time != null || e.status !== 'ok';

export interface ResultGroup {
  /** «Femenino · 9-10». */
  key: string;
  gender: SwimGender;
  ageGroup: string | null;
  rows: Placed<ResultRow>[];
}

/** Puestos y puntos de una prueba, agrupados por sexo y categoría (en orden de categoría). Solo quien ya nadó. */
export function eventResults(ev: SwimEventItem, entries: readonly SwimEntry[], table: readonly number[]): ResultGroup[] {
  const rows = entries.filter((e) => e.swimEventId === ev.id && hasResult(e)).map((e) => toResult(e, ev));
  const placed = placeResults(rows, table);
  const groups = new Map<string, ResultGroup>();
  for (const r of placed) {
    const key = `${r.gender ?? ''}|${r.ageGroup ?? ''}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { key, gender: (r.gender ?? ev.gender) as SwimGender, ageGroup: r.ageGroup ?? null, rows: [] }));
    g.rows.push(r);
  }
  const order = (id: string | null) => {
    const i = [...CCCAN_AGE_GROUPS, ...MASTERS].findIndex((g) => g.id === id);
    return i < 0 ? 999 : i;
  };
  return [...groups.values()].sort((a, b) => order(a.ageGroup) - order(b.ageGroup) || a.gender.localeCompare(b.gender));
}

/** Las pruebas que ya tienen resultados, cada una con sus categorías (la pestaña Resultados). */
export function resultsByEvent(events: readonly SwimEventItem[], entries: readonly SwimEntry[], table: readonly number[]): { ev: SwimEventItem; groups: ResultGroup[] }[] {
  return events.map((ev) => ({ ev, groups: eventResults(ev, entries, table) })).filter((x) => x.groups.length > 0);
}

/** Todas las filas con puesto de un encuentro (cada prueba con su tabla de puntos). */
export function placedMeet(events: readonly SwimEventItem[], entries: readonly SwimEntry[], table: readonly number[]): Placed<ResultRow>[] {
  return events.flatMap((ev) => eventResults(ev, entries, table).flatMap((g) => g.rows));
}

export interface MeetScores {
  clubs: TeamScore[];
  medals: MedalRow[];
}

/** Puntos por club y medallero de un encuentro. */
export function meetScores(events: readonly SwimEventItem[], entries: readonly SwimEntry[], table: readonly number[]): MeetScores {
  const rows = placedMeet(events, entries, table);
  return { clubs: teamPoints(rows), medals: medalTable(rows) };
}

export interface SeasonClub {
  clubId: string;
  points: number;
  gold: number;
  silver: number;
  bronze: number;
  rank: number;
  /** Puntos por encuentro (id del encuentro → puntos). */
  byMeet: Record<string, number>;
}

export interface SeasonTable {
  /** Encuentros que cuentan (con al menos un tiempo), del más viejo al más nuevo. */
  meets: SwimMeet[];
  clubs: SeasonClub[];
}

/**
 * Tabla de clubes de la temporada: suma de los puntos de cada encuentro (el control de marcas no cuenta). `year`
 * (ligas sin temporadas) o `within` (la temporada: qué fechas entran).
 */
export function seasonTable(season: SwimSeason, year?: string, within?: (date: string) => boolean): SeasonTable {
  const meets = season.meets.filter((m) => scores(m) && (!year || m.date.startsWith(year)) && (!within || within(m.date)));
  const acc = new Map<string, SeasonClub>();
  const counted: SwimMeet[] = [];
  for (const m of [...meets].sort((a, b) => a.date.localeCompare(b.date))) {
    const events = season.events.filter((e) => e.meetId === m.id);
    const entries = season.entries.filter((e) => e.meetId === m.id);
    if (!entries.length) continue;
    counted.push(m);
    for (const t of teamPoints(placedMeet(events, entries, m.points))) {
      const c = acc.get(t.teamId) ?? { clubId: t.teamId, points: 0, gold: 0, silver: 0, bronze: 0, rank: 0, byMeet: {} };
      c.points += t.points;
      c.gold += t.gold;
      c.silver += t.silver;
      c.bronze += t.bronze;
      c.byMeet[m.id] = t.points;
      acc.set(t.teamId, c);
    }
  }
  const clubs = [...acc.values()].map((c) => ({ ...c, points: Math.round(c.points * 100) / 100 }));
  clubs.sort((a, b) => b.points - a.points || b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze);
  clubs.forEach((c, k) => (c.rank = k > 0 && c.points === clubs[k - 1].points ? clubs[k - 1].rank : k + 1));
  return { meets: counted, clubs };
}

/** Los años con encuentros (el más nuevo primero): la temporada de una liga sin temporadas. */
export const seasonYears = (season: Pick<SwimSeason, 'meets'>) => [...new Set(season.meets.map((m) => m.date.slice(0, 4)))].sort().reverse();

/** Los clubes que sumaron en un encuentro de la temporada, del que más sumó al que menos. */
export const clubsOfMeet = (clubs: readonly SeasonClub[], meetId: string) =>
  clubs.filter((c) => c.byMeet[meetId] != null).sort((a, b) => b.byMeet[meetId] - a.byMeet[meetId]);

/** Puntos para mostrar: «6», «4,5». */
export const pointsText = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','));

/** Un porcentaje para mostrar: «1,25 %». */
export const pctText = (n: number) => `${n.toFixed(2).replace('.', ',')} %`;

// ---------- Hoja de series ----------

export interface SheetLane {
  lane: number;
  entry: SwimEntry | null;
}

export interface SheetHeat {
  n: number;
  lanes: SheetLane[];
}

/** Carriles de 1 a `lanes`, con quien va en cada uno (o vacío). */
function fill(n: number, lanes: number, list: { lane: number; entry: SwimEntry }[]): SheetHeat {
  return {
    n,
    lanes: Array.from({ length: lanes }, (_, k) => ({ lane: k + 1, entry: list.find((l) => l.lane === k + 1)?.entry ?? null })),
  };
}

/** La hoja publicada de una prueba (serie y carril de la base) y quienes quedaron sin serie. */
export function publishedHeats(ev: Pick<SwimEventItem, 'id'>, entries: readonly SwimEntry[], lanes: number): { heats: SheetHeat[]; unassigned: SwimEntry[] } {
  const mine = entries.filter((e) => e.swimEventId === ev.id);
  const nums = [...new Set(mine.filter((e) => e.heat != null).map((e) => e.heat!))].sort((a, b) => a - b);
  const width = Math.max(lanes, ...mine.map((e) => e.lane ?? 0));
  return {
    heats: nums.map((n) => fill(n, width, mine.filter((e) => e.heat === n).map((e) => ({ lane: e.lane!, entry: e })))),
    unassigned: mine.filter((e) => e.heat == null),
  };
}

/** Borrador de series de una prueba con el motor (todos sus inscritos). */
export function draftHeats(ev: Pick<SwimEventItem, 'id'>, entries: readonly SwimEntry[], lanes: number): SheetHeat[] {
  const mine = entries.filter((e) => e.swimEventId === ev.id);
  const heats: Heat[] = seedHeats(
    mine.map((e) => ({ id: e.id, seed: e.seed })),
    { lanes },
  );
  const byId = new Map(mine.map((e) => [e.id, e] as const));
  return heats.map((h) => fill(h.n, lanes, h.lanes.map((l) => ({ lane: l.lane, entry: byId.get(l.entryId)! }))));
}

/** Mueve (o intercambia) lo que hay en dos carriles del borrador. Devuelve un borrador nuevo. */
export function swapLanes(heats: readonly SheetHeat[], a: { heat: number; lane: number }, b: { heat: number; lane: number }): SheetHeat[] {
  const at = (h: number, l: number) => heats.find((x) => x.n === h)?.lanes.find((x) => x.lane === l)?.entry ?? null;
  const ea = at(a.heat, a.lane);
  const eb = at(b.heat, b.lane);
  return heats.map((h) => ({
    n: h.n,
    lanes: h.lanes.map((l) =>
      h.n === a.heat && l.lane === a.lane ? { lane: l.lane, entry: eb } : h.n === b.heat && l.lane === b.lane ? { lane: l.lane, entry: ea } : l,
    ),
  }));
}

/** Borrador → lo que manda publishHeats. */
export const sheetAssignments = (heats: readonly SheetHeat[]) =>
  heats.flatMap((h) => h.lanes.filter((l) => l.entry).map((l) => ({ entryId: l.entry!.id, heat: h.n, lane: l.lane })));

/** La prueba ya tiene tiempos (no se puede volver a armar). */
export const eventHasResults = (evId: string, entries: readonly SwimEntry[]) => entries.some((e) => e.swimEventId === evId && hasResult(e));

/** Series de una prueba que todavía no tienen ningún resultado (la próxima a cronometrar es la primera). */
export function pendingHeats(ev: Pick<SwimEventItem, 'id'>, entries: readonly SwimEntry[]): number[] {
  const mine = entries.filter((e) => e.swimEventId === ev.id && e.heat != null);
  const nums = [...new Set(mine.map((e) => e.heat!))].sort((a, b) => a - b);
  return nums.filter((n) => !mine.some((e) => e.heat === n && hasResult(e)));
}

// ---------- Estado del encuentro ----------

export type MeetStage = 'programa' | 'inscripciones' | 'series' | 'final';

export function meetStage(meet: Pick<SwimMeet, 'finalizedAt' | 'heatsPublishedAt'>, events: number): MeetStage {
  if (meet.finalizedAt) return 'final';
  if (meet.heatsPublishedAt) return 'series';
  return events ? 'inscripciones' : 'programa';
}

export const STAGE_LABEL: Record<MeetStage, string> = {
  programa: 'Armando el programa',
  inscripciones: 'Inscripciones abiertas',
  series: 'Hoja de series lista',
  final: 'Finalizado',
};

// ---------- Inscripciones ----------

/**
 * ¿Puede entrar en la prueba? (lo que se sabe en el teléfono; la base lo vuelve a revisar).
 * `sex` y `group` pueden ser null si no se saben (quien no es admin no ve el sexo).
 */
export function canEnter(ev: Pick<SwimEventItem, 'gender' | 'ageGroups'>, swimmer: { sex: 'F' | 'M' | 'X' | null; group: string | null }): boolean {
  if ((ev.gender === 'F' || ev.gender === 'M') && (swimmer.sex === 'F' || swimmer.sex === 'M') && swimmer.sex !== ev.gender) return false;
  if (ev.ageGroups.length && (!swimmer.group || !ev.ageGroups.includes(swimmer.group))) return false;
  return true;
}

/** Categoría del nadador en el año del encuentro con su año de nacimiento (admin) o la pública si es de ese año. */
export function groupForMeet(
  meetDate: string,
  scheme: AgeScheme,
  info: { birthYear?: number | null; category?: string | null; categoryYear?: number | null },
): string | null {
  const year = Number(meetDate.slice(0, 4));
  if (info.birthYear) {
    const age = year - info.birthYear;
    return ageGroupsOf(scheme).find((g) => (g.min == null || age >= g.min) && (g.max == null || age <= g.max))?.id ?? null;
  }
  return info.categoryYear === year ? (info.category ?? null) : null;
}

/** Inscritos de una prueba por su siembra (los NT al final). */
export const bySeed = (a: SwimEntry, b: SwimEntry) => (a.seed ?? Infinity) - (b.seed ?? Infinity);

/** Quién inscribe y cambia inscripciones: el admin (a cualquiera), el entrenador (a los de su club) y quien nada con cuenta (a sí mismo). */
export interface EntryWho {
  isAdmin: boolean;
  myPlayerId: string | null;
  coachOf: ReadonlySet<string>;
}

/** ¿Puede inscribir a alguien en el encuentro? (cerrado, nadie). */
export const canEnterSome = (closed: boolean, who: EntryWho) => !closed && (who.isAdmin || who.coachOf.size > 0 || !!who.myPlayerId);

/** ¿Puede cambiar la siembra o sacar a este inscrito? Solo antes de que nade y con el encuentro abierto. */
export const canManageEntry = (e: Pick<SwimEntry, 'playerId' | 'clubId' | 'resultAt' | 'time'>, closed: boolean, who: EntryWho) =>
  !closed && (who.isAdmin || e.playerId === who.myPlayerId || (!!e.clubId && who.coachOf.has(e.clubId))) && e.resultAt == null && e.time == null;

export interface EnterCandidate {
  playerId: string;
  name: string;
  info: SwimmerInfo | undefined;
  priv: SwimmerPrivate | undefined;
  group: string | null;
  /** Cumple el sexo y la categoría de la prueba (lo que se sabe en el teléfono). */
  ok: boolean;
}

/**
 * A quién puede inscribir en una prueba (sin los que ya están en ella), con su categoría del encuentro: primero los que
 * cumplen el sexo y la categoría, por nombre.
 */
export function enterCandidates(o: {
  players: readonly { id: string; name: string }[];
  entered: ReadonlySet<string>;
  who: EntryWho;
  info: ReadonlyMap<string, SwimmerInfo>;
  privBy: ReadonlyMap<string, SwimmerPrivate>;
  meet: Pick<SwimMeet, 'date' | 'ageGroups'>;
  ev: Pick<SwimEventItem, 'gender' | 'ageGroups'>;
}): EnterCandidate[] {
  const { players, entered, who, info, privBy, meet, ev } = o;
  return players
    .filter((p) => !entered.has(p.id))
    .filter((p) => who.isAdmin || p.id === who.myPlayerId || (!!info.get(p.id)?.clubId && who.coachOf.has(info.get(p.id)!.clubId!)))
    .map((p) => {
      const i = info.get(p.id);
      const pr = privBy.get(p.id);
      const group = groupForMeet(meet.date, meet.ageGroups, { birthYear: pr?.birthYear, category: i?.category, categoryYear: i?.categoryYear });
      return { playerId: p.id, name: p.name, info: i, priv: pr, group, ok: canEnter(ev, { sex: pr?.sex ?? null, group }) };
    })
    .sort((a, b) => Number(b.ok) - Number(a.ok) || a.name.localeCompare(b.name));
}

/** Lo escrito en el campo de siembra: centésimas (vacío = NT, null) y si no se entiende. */
export function readSeed(text: string): { cs: number | null; invalid: boolean } {
  const t = text.trim();
  const cs = t ? parseSwimTime(t) : null;
  return { cs, invalid: t !== '' && cs == null };
}

/** El texto del campo de siembra cuando cambia el tiempo de afuera: si ya dice ese tiempo, se deja como se escribió. */
export const seedText = (current: string, value: number | null) => (parseSwimTime(current) === value ? current : value ? formatSwimTime(value) : '');

// ---------- Las partes del encuentro ----------

export type MeetTabKey = 'programa' | 'inscritos' | 'series' | 'cronometro' | 'resultados' | 'puntos';

export const MEET_TAB_LABEL: Record<MeetTabKey, string> = {
  programa: 'Programa',
  inscritos: 'Inscritos',
  series: 'Series',
  cronometro: 'Cronometrar',
  resultados: 'Resultados',
  puntos: 'Puntos',
};

/**
 * Qué partes tiene el encuentro y cuál se ve (MeetPage):
 * - Lite: Pruebas (inscribirse) · Series (publicadas) · Resultados.
 * - Pro: Programa, Inscritos, Series (publicadas, o para el admin), Cronometrar (admin y cronometristas, con las series
 *   publicadas y el encuentro abierto), Resultados y Puntos (si el encuentro da puntos).
 * - En Lite, un link de Pro (`?ver=`, p. ej. cronometrar) para quien organiza o cronometra abre lo de Pro igual (`pro`).
 * Sin pedir una parte: cronometrar si falta (Pro y cronometrista), resultados si hay, las series si están, y si no el
 * programa (Pro) o las pruebas (Lite).
 */
export function meetTabs(o: {
  meet: Pick<SwimMeet, 'type' | 'heatsPublishedAt' | 'finalizedAt'>;
  events: readonly SwimEventItem[];
  entries: readonly SwimEntry[];
  isPro: boolean;
  isAdmin: boolean;
  isTimer: boolean;
  /** La parte pedida (`?ver=`). */
  requested: string | null;
}): { tabs: { key: MeetTabKey; label: string }[]; tab: MeetTabKey; pro: boolean; timing: boolean } {
  const { meet, events, entries, isPro, isAdmin, isTimer } = o;
  const requested = o.requested as MeetTabKey | null;
  const published = !!meet.heatsPublishedAt;
  const hasResults = entries.some((e) => e.resultAt != null);
  const toTime = published && events.some((ev) => pendingHeats(ev, entries).length > 0);
  const timing = isTimer && published && !meet.finalizedAt;
  const proKeys: MeetTabKey[] = [
    'programa',
    'inscritos',
    ...(published || isAdmin ? ['series' as const] : []),
    ...(timing ? ['cronometro' as const] : []),
    'resultados',
    ...(scores(meet) ? ['puntos' as const] : []),
  ];
  // Lite: lo del nadador (inscribirse, su serie y carril, los resultados).
  const liteTabs: { key: MeetTabKey; label: string }[] = [
    { key: 'inscritos', label: 'Pruebas' },
    ...(published ? [{ key: 'series' as const, label: 'Series' }] : []),
    { key: 'resultados', label: 'Resultados' },
  ];
  // Pro, o un link de Pro (cronometrar, el programa) para quien organiza o cronometra: lo de Pro se abre igual.
  const pro = isPro || (isTimer && !!requested && proKeys.includes(requested) && !liteTabs.some((t) => t.key === requested));
  const tabs = pro ? proKeys.map((key) => ({ key, label: MEET_TAB_LABEL[key] })) : liteTabs;
  const fallback: MeetTabKey = pro && isTimer && toTime && !meet.finalizedAt ? 'cronometro' : hasResults ? 'resultados' : published ? 'series' : pro ? 'programa' : 'inscritos';
  const tab: MeetTabKey = requested && tabs.some((t) => t.key === requested) ? requested : tabs.some((t) => t.key === fallback) ? fallback : tabs[0].key;
  return { tabs, tab, pro, timing };
}
