/**
 * Las puertas de toda insignia (docs/insignias.md §1.7.4, §1.7.7, §1.7.8): cuentas establecidas, ligas reales y
 * ligas con peso, topes diarios y por rival, mínimos, tamaño del podio y empates.
 */
import type { SnapLeague, SnapMember, SnapProfile, LeagueMonthActivity } from '../snapshot';
import { addDays, addMonths, monthRange } from './periods';

// ---------------------------------------------------------------------------------------------------------
// Cuentas establecidas (CE)

/** Una cuenta cuenta como establecida 7 días después de creada. */
export const ESTABLISHED_DAYS = 7;

/**
 * Desde qué fecha la cuenta es establecida: 7 días después de `created_at` ('YYYY-MM-DD' en UTC, basta para un
 * margen de días). Las de BowlingX, desde su primer juego importado si es antes.
 */
export function establishedFrom(p: Pick<SnapProfile, 'created_at' | 'bowlingx' | 'first_import_on'>): string {
  const byAge = addDays(p.created_at.slice(0, 10), ESTABLISHED_DAYS);
  return p.bowlingx && p.first_import_on && p.first_import_on < byAge ? p.first_import_on : byAge;
}

/** ¿Establecida para un periodo que termina en `periodEnd` ('YYYY-MM-DD')? Nunca si está bloqueada. */
export function isEstablished(p: SnapProfile | undefined, periodEnd: string): boolean {
  return !!p && !p.blocked_at && establishedFrom(p) <= periodEnd;
}

// ---------------------------------------------------------------------------------------------------------
// Ligas reales (LR) y ligas con peso

/** Mínimo de CE con actividad en la ventana de 3 meses. */
export const REAL_LEAGUE_ACCOUNTS = 4;
/** Ligas con menores: cuentas de staff (owner o admin) y jugadores activos en la ventana (§1.5). */
export const MINORS_STAFF = 2;
export const MINORS_PLAYERS = 6;

export interface RealLeagueInput {
  league: Pick<SnapLeague, 'id' | 'kind' | 'has_minors'>;
  /** Actividad por mes de esa liga (`leagueMonths` de activity.ts o `snapshot.league_months`). */
  months: readonly LeagueMonthActivity[];
  profiles: ReadonlyMap<string, SnapProfile>;
  /** Owner y admins (para las ligas con menores). */
  members?: readonly SnapMember[];
  /** La cuenta que se evalúa no cuenta entre las 4 (insignias de cuenta). */
  exclude?: string | null;
}

/**
 * ¿La liga es real en el mes `month`? Al menos 4 CE (establecidas al cierre del mes) con actividad válida en ese mes
 * o en los dos anteriores. En una liga `kind='torneo'` se cuenta todo el torneo hasta ese mes. Sin retroactivo: solo
 * mira hasta el cierre del mes, y una cuenta creada después nunca es establecida para ese mes.
 */
export function isRealLeagueMonth(input: RealLeagueInput, month: string): boolean {
  const { league, months, profiles, exclude } = input;
  const end = monthRange(month)[1];
  const from = league.kind === 'torneo' ? '0000-00' : addMonths(month, -2);
  const window = months.filter((m) => m.league_id === league.id && m.month >= from && m.month <= month);
  const users = new Set<string>();
  const players = new Set<string>();
  for (const m of window) {
    m.users.forEach((u) => users.add(u));
    m.players.forEach((p) => players.add(p));
  }
  if (league.has_minors) {
    // La cuenta que se evalúa tampoco cuenta entre el staff (como entre las 4 cuentas): un dueño con otra cuenta de
    // admin y menores inventados no hace real su propia liga.
    const staff = (input.members ?? []).filter(
      (x) => x.league_id === league.id && (x.role === 'owner' || x.role === 'admin') && x.user_id !== exclude && isEstablished(profiles.get(x.user_id), end),
    );
    return staff.length >= MINORS_STAFF && players.size >= MINORS_PLAYERS;
  }
  let n = 0;
  for (const u of users) if (u !== exclude && isEstablished(profiles.get(u), end)) n++;
  return n >= REAL_LEAGUE_ACCOUNTS;
}

/** Los meses reales de una liga entre los meses que tuvieron actividad. */
export function realLeagueMonths(input: RealLeagueInput): Set<string> {
  const out = new Set<string>();
  for (const m of input.months) if (m.league_id === input.league.id && isRealLeagueMonth(input, m.month)) out.add(m.month);
  return out;
}

/**
 * Filtro para `inRealLeagues` (activity.ts) con varias ligas: cada (liga, mes) se calcula una vez. Una liga que no
 * viene en `leagues` nunca es real.
 */
export function realLeagueFilter(
  leagues: readonly Pick<SnapLeague, 'id' | 'kind' | 'has_minors'>[],
  rest: Omit<RealLeagueInput, 'league'>,
): (leagueId: string, month: string) => boolean {
  const byId = new Map(leagues.map((l) => [l.id, l]));
  const memo = new Map<string, boolean>();
  return (leagueId, month) => {
    const k = `${leagueId}|${month}`;
    let v = memo.get(k);
    if (v === undefined) {
      const league = byId.get(leagueId);
      v = !!league && isRealLeagueMonth({ ...rest, league }, month);
      memo.set(k, v);
    }
    return v;
  };
}

/** Liga con peso para el mes: LR, 6+ jugadores activos y 3+ CE activas en el mes. */
export function weightyMonth(input: RealLeagueInput, month: string): boolean {
  if (!isRealLeagueMonth(input, month)) return false;
  const end = monthRange(month)[1];
  const row = input.months.find((m) => m.league_id === input.league.id && m.month === month);
  if (!row || row.players.length < 6) return false;
  return row.users.filter((u) => isEstablished(input.profiles.get(u), end)).length >= 3;
}

/**
 * Liga con peso para una temporada o torneo: 6+ competidores que califican y 4+ CE; o 12+ competidores cuyos
 * resultados escribieron 2+ cuentas distintas (`proposed_by`, `confirmed_by`, `recorded_by`, `reviewed_by`).
 */
export function weightySeason(x: { competitors: number; establishedAccounts: number; writers: number }): boolean {
  return (x.competitors >= 6 && x.establishedAccounts >= 4) || (x.competitors >= 12 && x.writers >= 2);
}

/** Liga con peso para el año: 8+ jugadores activos y 4+ CE en el año. */
export function weightyYear(x: { players: number; establishedAccounts: number }): boolean {
  return x.players >= 8 && x.establishedAccounts >= 4;
}

// ---------------------------------------------------------------------------------------------------------
// Topes (§1.7.7)

export const CAPS = {
  /** Boliche: juegos por día. */
  bowlingGamesPerDay: 10,
  /** Raqueta: partidos por día. */
  racketMatchesPerDay: 4,
  /** Raqueta: victorias contra el mismo rival (`entrantKey`) por mes. */
  racketWinsPerRivalMonth: 3,
  /** Equipos: victorias contra el mismo equipo por mes. */
  teamWinsPerTeamMonth: 2,
  /** Golf: tarjetas por día. */
  golfCardsPerDay: 1,
} as const;

/** Deja los primeros `max` de cada día (la lista ya viene en orden de juego). */
export function capPerDay<T>(items: readonly T[], dayOf: (t: T) => string, max: number): T[] {
  const used = new Map<string, number>();
  return items.filter((t) => {
    const d = dayOf(t);
    const n = used.get(d) ?? 0;
    if (n >= max) return false;
    used.set(d, n + 1);
    return true;
  });
}

/** Deja los primeros `max` por (rival, mes) (la lista ya viene en orden). */
export function capPerRivalMonth<T>(items: readonly T[], rivalOf: (t: T) => string, monthOf: (t: T) => string, max: number): T[] {
  return capPerDay(items, (t) => `${rivalOf(t)}|${monthOf(t)}`, max);
}

// ---------------------------------------------------------------------------------------------------------
// Mínimos (§1.7.7) que comparten varias insignias

export const MINIMUMS = {
  /** Título del mes. Boliche: si la liga tuvo 1–2 fechas oficiales, todas y 6+ juegos. */
  titleMonth: { bowlingGames: 9, bowlingDates: 3, bowlingGamesFewDates: 6, racketMatches: 4, teamMatchesWithLines: 2, teamMatchesAsTeam: 3, golfCards: 2 },
  /** Progreso del mes. */
  progressMonth: { bowlingGames: 9, bowlingBase: 12, racketMatches: 4, racketPrior90: 6, golfCards: 2, golfBase: 4, swimRaces: 2 },
  /** Título de temporada: participación mínima. */
  titleSeason: { bowlingDatesPct: 50, bowlingGames: 12, racketMatchesPct: 50, teamMatchesPct: 30, golfRoundsPct: 50, swimMeetsPct: 50 },
} as const;

// ---------------------------------------------------------------------------------------------------------
// Podios y empates (§1.7.7 y §1.7.8)

/** Empatados que pueden compartir una insignia: más de 3 y nadie se la lleva ese periodo. */
export const MAX_SHARED = 3;

/** Niveles del podio según los competidores que califican: <4 nada; 4–5 oro; 6–9 oro y plata; 10+ los tres. */
export function podiumLevels(qualifying: number): (1 | 2 | 3)[] {
  if (qualifying < 4) return [];
  if (qualifying < 6) return [3];
  if (qualifying < 10) return [3, 2];
  return [3, 2, 1];
}

/** Natación, por grupo: oro con 3+ nadadores W1, plata con 4+, bronce con 5+ (la medalla nunca va al último). */
export function swimPodiumLevels(swimmers: number): (1 | 2 | 3)[] {
  const out: (1 | 2 | 3)[] = [];
  if (swimmers >= 3) out.push(3);
  if (swimmers >= 4) out.push(2);
  if (swimmers >= 5) out.push(1);
  return out;
}

/**
 * Puestos de competición con un comparador (negativo = `a` va antes): los empatados comparten puesto (1, 2, 2, 4).
 * Como `rank` de src/lib/stats.ts, pero con desempates de varias reglas.
 */
export function rankWith<T>(rows: readonly T[], cmp: (a: T, b: T) => number): { row: T; place: number }[] {
  const sorted = [...rows].sort(cmp);
  let place = 0;
  return sorted.map((row, i) => {
    if (i === 0 || cmp(sorted[i - 1], row) !== 0) place = i + 1;
    return { row, place };
  });
}

/**
 * Los primeros después de los desempates. Si comparten más de `MAX_SHARED`, nadie: `multiTie` para que la liga
 * diga «Empate múltiple: este mes no hubo {figura}».
 */
export function topWithTies<T>(rows: readonly T[], cmp: (a: T, b: T) => number): { winners: T[]; multiTie: boolean } {
  const first = rankWith(rows, cmp).filter((r) => r.place === 1);
  if (first.length > MAX_SHARED) return { winners: [], multiTie: true };
  return { winners: first.map((r) => r.row), multiTie: false };
}

/**
 * Oro, plata y bronce de una tabla ya ordenable. `levels` dice qué metales se dan (`podiumLevels`); un puesto que
 * comparten más de 3 no da nada. Con empates, el que sigue salta puestos (1, 1, 3): nunca dos oros y una plata
 * de tercero.
 */
export function podiumAwards<T>(rows: readonly T[], cmp: (a: T, b: T) => number, levels: readonly (1 | 2 | 3)[]): { row: T; place: 1 | 2 | 3; level: 1 | 2 | 3 }[] {
  const ranked = rankWith(rows, cmp);
  const out: { row: T; place: 1 | 2 | 3; level: 1 | 2 | 3 }[] = [];
  for (const place of [1, 2, 3] as const) {
    const level = (4 - place) as 1 | 2 | 3;
    if (!levels.includes(level)) continue;
    const at = ranked.filter((r) => r.place === place);
    if (!at.length || at.length > MAX_SHARED) continue;
    for (const r of at) out.push({ row: r.row, place, level });
  }
  return out;
}
