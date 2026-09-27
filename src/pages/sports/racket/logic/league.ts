/**
 * Liga de parejas (o de jugadores en individual): todos contra todos por jornadas, de ida o de ida y vuelta,
 * con canchas, horas y aviso de choques. Puro: arma los partidos para create_matches con src/sports/formats.
 */
import type { Match, MatchDraft } from '../../../../lib/data/matches';
import { assignSlots, findClashes, roundRobin, type Clash, type ClashInput, type ScheduledFixture } from '../../../../sports/formats';
import { addDays, localParts, zonedIso } from './time';
import type { PointsScheme } from './results';

/** Lo que se guarda en events.config de una liga de parejas. */
export interface PairsLeagueConfig {
  v: 1;
  format: 'liga';
  /** Parejas (equipos de temporada) o jugadores (individual), en el orden del sorteo. */
  pairs: string[];
  /** Ida y vuelta. */
  double: boolean;
  /** Canchas donde se juega cada jornada. */
  courts: string[];
  /** Horas de cada jornada ('HH:MM'): primero todas las canchas a la primera hora, luego la segunda… */
  times: string[];
  /** Fecha de la jornada 1 ('YYYY-MM-DD'). */
  startDate: string;
  /** Días entre jornadas (7 = una por semana). */
  everyDays: number;
  /** Lo que dura un partido (para los choques). */
  minutes: number;
  /** Puntos de la tabla. */
  points: PointsScheme;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const strList = (v: unknown, max = 64) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x).slice(0, max) : []);
const int = (v: unknown, min: number, max: number, dflt: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : dflt;

export function parseLeagueConfig(raw: unknown, fallbackDate = ''): PairsLeagueConfig {
  const c = isObj(raw) ? raw : {};
  const times = strList(c.times, 12).filter((t) => /^\d{1,2}:\d{2}$/.test(t));
  return {
    v: 1,
    format: 'liga',
    pairs: [...new Set(strList(c.pairs, 64))],
    double: c.double === true,
    courts: strList(c.courts, 12).map((x) => x.slice(0, 40)),
    times,
    startDate: typeof c.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.startDate) ? c.startDate : fallbackDate,
    everyDays: int(c.everyDays, 1, 60, 7),
    minutes: int(c.minutes, 20, 300, 90),
    points: c.points === '2-0' ? '2-0' : 'standard',
  };
}

export const leagueConfigJson = (c: PairsLeagueConfig): Record<string, unknown> => ({ ...c });

export interface ScheduleEntrant {
  id: string;
  /** Jugadores de la pareja (van en el partido: las estadísticas son de cada uno). */
  players: string[];
  /** true = el id es una pareja (equipo de temporada); false = un jugador (individual). */
  team: boolean;
}

export interface LeaguePlan {
  drafts: MatchDraft[];
  fixtures: ScheduledFixture[];
  /** Partidos que no cupieron en las canchas y horas (quedan sin hora). */
  unassigned: number;
  jornadas: number;
  clashes: Clash[];
}

/**
 * Calendario de la liga: jornadas por el método del círculo, cada jornada en su fecha (startDate + k·everyDays),
 * cancha y hora; choques entre sí y contra los partidos que ya hay en la liga (misma cancha a la misma hora o
 * alguien en dos a la vez).
 */
export function buildLeagueSchedule(
  cfg: PairsLeagueConfig,
  entrants: readonly ScheduleEntrant[],
  opts: { eventId?: string; tz?: string | null; existing?: readonly Match[]; rules?: Record<string, unknown> } = {},
): LeaguePlan {
  const byId = new Map(entrants.map((e) => [e.id, e]));
  const ids = cfg.pairs.filter((id) => byId.has(id));
  const rounds = roundRobin(ids, { double: cfg.double });
  const dates = cfg.startDate ? rounds.map((_, i) => addDays(cfg.startDate, i * cfg.everyDays)) : undefined;
  // Sin canchas u horas: cada jornada en su fecha, sin hora ni cancha (se ponen después partido por partido).
  const { fixtures, unassigned } =
    cfg.courts.length && cfg.times.length
      ? assignSlots(rounds, { courts: cfg.courts, times: cfg.times, dates })
      : {
          fixtures: rounds.flatMap((r, i) => r.matches.map((f): ScheduledFixture => ({ ...f, round: r.round, date: dates?.[i] ?? null, time: null, court: null }))),
          unassigned: [] as ScheduledFixture[],
        };
  const sideOf = (id: string, side: 1 | 2) => {
    const e = byId.get(id)!;
    return { side, teamId: e.team ? e.id : null, players: e.players.map((playerId) => ({ playerId })) };
  };
  const drafts = fixtures.map(
    (f): MatchDraft => ({
      eventId: opts.eventId ?? null,
      round: f.round,
      court: f.court ?? '',
      scheduledAt: f.date && f.time ? zonedIso(f.date, f.time, opts.tz) : null,
      format: 'sets',
      ...(opts.rules ? { rules: opts.rules } : {}),
      sides: [sideOf(f.home, 1), sideOf(f.away, 2)],
    }),
  );
  const participants = (home: string, away: string) => [home, away, ...(byId.get(home)?.players ?? []), ...(byId.get(away)?.players ?? [])];
  const mine: ClashInput[] = fixtures
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => f.date && f.time)
    .map(({ f, i }) => ({ id: `n${i}`, date: f.date!, time: f.time!, minutes: cfg.minutes, court: f.court, participants: participants(f.home, f.away) }));
  const others: ClashInput[] = (opts.existing ?? [])
    .filter((m) => m.scheduledAt && m.status !== 'void' && m.eventId !== opts.eventId)
    .map((m) => {
      const p = localParts(m.scheduledAt, opts.tz)!;
      return {
        id: `m:${m.id}`,
        date: p.date,
        time: p.time,
        minutes: cfg.minutes,
        court: m.court || null,
        participants: m.sides.flatMap((s) => [...(s.teamId ? [s.teamId] : []), ...s.players.map((x) => x.playerId)]),
      };
    });
  const clashes = findClashes([...mine, ...others], cfg.minutes).filter((c) => !(c.a.startsWith('m:') && c.b.startsWith('m:')));
  return { drafts, fixtures, unassigned: unassigned.length, jornadas: rounds.length, clashes };
}

/** Texto del choque con nombres: «Cancha 1 a las 8:00 pm del 8 oct: dos partidos». */
export function clashText(c: Clash, nameOf: (id: string) => string): string {
  if (c.kind === 'court') return `${c.who}: dos partidos a la misma hora.`;
  return `${nameOf(c.who)} tiene dos partidos a la misma hora.`;
}
