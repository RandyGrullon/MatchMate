import { compareMatches, isOpen, setMatchSides, type Match } from '../../../lib/data/matches';
import type { MatchOfficial } from '../../../lib/data/teamSports';
import { formatDateLong, toIsoDate } from '../../../lib/format';
import type { Clash } from '../../../sports/formats/roundRobin';
import type { ScorerCandidate } from './logic';
import { isPlayoffMatch } from './playoffs';
import { isIsoDate, parseCourts, parseTimes, planSchedule, type SchedulePlan } from './schedule';
import { advanceTournament, groupName, planTournament, tournamentErrors, tournamentSetupOf, type SideChange, type TournamentPlan } from './tournament';
import { matchWhen, vsTitle } from './view';

/**
 * Lo que deciden Armar el calendario, Partido suelto, Torneo relámpago, «Pasar a la fase final» y el anotador de mesa
 * de Organizar › Equipos, sin pantalla (lo comparten la web, ScheduleBuilder.tsx, TournamentBuilder.tsx y
 * OfficialsList.tsx, y la app del teléfono).
 */

/** Partidos por lote al guardar el calendario. */
export const MAX_BATCH = 200;

/** El próximo día `day` (0 = domingo … 6 = sábado) después de hoy, en 'YYYY-MM-DD' (si hoy es ese día, el de la otra semana). */
export function nextWeekday(day: number, now: number = Date.now()): string {
  const d = new Date(now);
  d.setDate(d.getDate() + ((day - d.getDay() + 7) % 7 || 7));
  return toIsoDate(d);
}

/** La jornada que sigue a las que ya hay (1 si no hay partidos). */
export const nextRound = (matches: readonly Pick<Match, 'round'>[]) => Math.max(0, ...matches.map((m) => m.round ?? 0)) + 1;

/** Los partidos del calendario por jornada, en orden. */
export function scheduleByRound(plan: Pick<SchedulePlan, 'matches'> | null): [number, SchedulePlan['matches']][] {
  const map = new Map<number, SchedulePlan['matches']>();
  for (const m of plan?.matches ?? []) map.set(m.round, [...(map.get(m.round) ?? []), m]);
  return [...map.entries()].sort((a, b) => a[0] - b[0]);
}

/** «3 choques: Cancha 1 ocupada · Tigres con dos partidos.» (hasta 3 distintos). */
export function clashSummary(clashes: readonly Clash[], name: (teamId: string) => string): string {
  return `${clashes.length} choques: ${[...new Set(clashes.map((c) => (c.kind === 'court' ? `${c.who} ocupada` : `${name(c.who)} con dos partidos`)))].slice(0, 3).join(' · ')}.`;
}

/** «Equipos (n)»: marcar o desmarcar uno (sin lista propia, todos están marcados). */
export function toggleTeam(picked: readonly string[] | null, all: readonly string[], id: string): string[] {
  const base = picked ?? all;
  return base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
}

/** El partido suelto se puede crear: dos equipos distintos, la fecha y la hora. */
export function singleMatchValid(o: { home: string; away: string; date: string; time: string }): boolean {
  return !!o.home && !!o.away && o.home !== o.away && isIsoDate(o.date) && /^\d{2}:\d{2}$/.test(o.time);
}

/** Torneo relámpago: 1 grupo con pocos equipos (final entre los 2 primeros), 2 grupos desde 6 (semifinales). */
export const defaultGroups = (teamCount: number) => (teamCount >= 6 ? 2 : 1);
/** Torneo relámpago: hasta cuántos grupos se pueden armar (de 1 a 8, al menos 2 equipos por grupo). */
export const maxGroupsFor = (teamCount: number) => Math.max(1, Math.min(8, Math.floor(teamCount / 2)));
/** Las opciones de «Grupos». */
export const groupOptions = (teamCount: number) =>
  Array.from({ length: maxGroupsFor(teamCount) }, (_, i) => i + 1).map((n) => ({ key: String(n), label: n === 1 ? '1 grupo (todos contra todos)' : `${n} grupos` }));
/** Las opciones de «Clasifican por grupo». */
export const PER_GROUP_OPTIONS = [1, 2, 3, 4].map((n) => ({ key: String(n), label: n === 1 ? 'El 1.º' : `Los ${n} primeros` }));

/** Lo que se escribe en «Torneo relámpago» (los números como texto, como en el formulario). */
export interface TournamentForm {
  teams: readonly string[];
  groups: number;
  perGroup: number;
  thirdPlace: boolean;
  date: string;
  start: string;
  /** «Un turno cada (min)». */
  slot: string;
  /** Los minutos por turno del deporte (si `slot` no se entiende). */
  slotMinutes: number;
  courtsText: string;
  tz: string;
  firstRound: number;
}

/** El torneo relámpago armado (grupos y partidos) o null si falta algo o no se puede. */
export function tournamentPlanOf(f: TournamentForm): TournamentPlan | null {
  if (tournamentErrors({ teams: f.teams, groups: f.groups, perGroup: f.perGroup }).length || !isIsoDate(f.date) || !/^\d{2}:\d{2}$/.test(f.start)) return null;
  try {
    return planTournament({
      teams: f.teams,
      groups: f.groups,
      perGroup: f.perGroup,
      thirdPlace: f.thirdPlace,
      date: f.date,
      start: f.start,
      slotMinutes: Math.max(5, Math.min(240, Number(f.slot) || f.slotMinutes)),
      courts: parseCourts(f.courtsText),
      tz: f.tz,
      firstRound: f.firstRound,
    });
  } catch {
    return null;
  }
}

/** Lo que se escribe en «Armar el calendario». */
export interface ScheduleForm {
  teams: readonly string[];
  double: boolean;
  start: string;
  every: string;
  timesText: string;
  courtsText: string;
  skipText: string;
  firstRound: string;
  tz: string;
}

/** El calendario armado (null con menos de 2 equipos o sin fecha), con las horas que se entendieron y las que no. */
export function schedulePlanOf(f: ScheduleForm): { plan: SchedulePlan | null; times: { times: string[]; bad: string[] } } {
  const times = parseTimes(f.timesText);
  if (f.teams.length < 2 || !isIsoDate(f.start)) return { plan: null, times };
  const plan = planSchedule({
    teams: f.teams,
    double: f.double,
    startDate: f.start,
    everyDays: Math.max(1, Math.min(60, Number(f.every) || 7)),
    times: times.times,
    courts: parseCourts(f.courtsText),
    firstRound: Math.max(1, Math.min(999, Number(f.firstRound) || 1)),
    tz: f.tz,
    skip: f.skipText.split(/[,;\s]+/).filter(isIsoDate),
  });
  return { plan, times };
}

/** Las opciones de «Vueltas» y «Una jornada cada» de Armar el calendario. */
export const ROUNDS_OPTIONS = [
  { key: '1', label: 'Solo ida (todos contra todos una vez)' },
  { key: '2', label: 'Ida y vuelta' },
];
export const EVERY_OPTIONS = [
  { key: '7', label: 'Semana (7 días)' },
  { key: '14', label: 'Dos semanas' },
  { key: '3', label: '3 días' },
  { key: '1', label: 'Todos los días (torneo)' },
];

/** Lo que necesita «Pasar a la fase final» de la liga. */
export interface AdvanceLeague {
  rules: { data: unknown };
  matches: { data: readonly Match[] };
}

/** Los cambios de la eliminatoria que ya se pueden poner (grupos terminados, ganadores que cuentan). */
export function tournamentChanges(tl: AdvanceLeague, rankGroup: (stage: string) => string[] | null, now = Date.now()): SideChange[] {
  const setup = tournamentSetupOf(tl.rules.data);
  if (!setup) return [];
  // Solo el cuadro del torneo (los juegos del playoff tienen su propia llave).
  const knockout = tl.matches.data.filter((m) => !!m.bracketKey && !isPlayoffMatch(m));
  if (!knockout.length) return [];
  const rankings = Array.from({ length: setup.groups }, (_, i) => rankGroup(groupName(i)));
  try {
    return advanceTournament({ ...setup, rankings, knockout, now });
  } catch {
    return [];
  }
}

/** «Semifinal 1: Tigres vs. Leones» de un cambio de la fase final. */
export function changeText(c: SideChange, matches: readonly Pick<Match, 'id' | 'stage'>[], teamName: (teamId: string) => string | null | undefined): string {
  const m = matches.find((x) => x.id === c.matchId);
  const nm = (i: 0 | 1) => (c.sides[i].teamId ? (teamName(c.sides[i].teamId!) ?? '¿?') : (c.sides[i].label ?? 'Por definir'));
  return `${m?.stage || c.bracketKey}: ${nm(0)} vs. ${nm(1)}`;
}

/** Pone en la eliminatoria los equipos que ya se saben, uno por uno. */
export async function applyTournamentChanges(lid: string, changes: readonly SideChange[]): Promise<void> {
  for (const c of changes) await setMatchSides(lid, c.matchId, c.sides);
}

/** «Torneo relámpago · sábado, 14 de noviembre de 2026» (el día del torneo, si se sabe). */
export const tournamentMetaLine = (day: string | null | undefined) => ['Torneo relámpago', day ? formatDateLong(day) : null].filter(Boolean).join(' · ');

/** La línea del paso «Los equipos» del torneo relámpago. */
export const teamsStepLine = (n: number) => (n >= 2 ? `${n} equipos listos` : n === 1 ? 'Hay 1: hacen falta al menos 2' : 'Cada uno con su color y su plantilla');

/** Organizar › Anotador de mesa: los partidos por jugar (y los aplazados), en orden. */
export const officialMatches = (matches: readonly Match[]) => matches.filter((m) => isOpen(m) || m.status === 'postponed').sort(compareMatches);

/** «Jornada 3 · sáb. 7:00 p. m.» (o «Aplazado») de un partido en la lista del anotador. */
export function officialRowWhen(m: Pick<Match, 'stage' | 'round' | 'status' | 'scheduledAt'>, tz: string, today: string): string {
  return [m.stage || (m.round != null ? `Jornada ${m.round}` : ''), m.status === 'postponed' ? 'Aplazado' : matchWhen(m.scheduledAt, tz, today)].filter(Boolean).join(' · ');
}

/** «Anota: Ana Pérez» o «Sin anotador designado». */
export const officialRowWho = (official: Pick<MatchOfficial, 'name'> | null) => (official ? `Anota: ${official.name || 'designado'}` : 'Sin anotador designado');

/** El título de la fila del anotador de un partido. */
export const officialRowTitle = (names: readonly [string, string]) => vsTitle(names);

/**
 * Las opciones para el anotador de mesa: «Sin designar», el designado aunque ya no sea candidato y los candidatos
 * (admins, anotadores de la liga y capitanes o delegados de los dos equipos).
 */
export function officialChoices(official: MatchOfficial | null, candidates: readonly ScorerCandidate[]): ScorerCandidate[] {
  return [
    { uid: '', name: 'Sin designar', why: 'Cualquiera que pueda abre la mesa' },
    ...(official && !candidates.some((c) => c.uid === official.userId) ? [{ uid: official.userId, name: official.name || 'Designado', why: 'Designado' }] : []),
    ...candidates,
  ];
}
