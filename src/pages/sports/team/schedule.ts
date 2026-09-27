import { assignSlots, findClashes, roundRobin, type Clash, type ClashInput } from '../../../sports/formats/roundRobin';
import { dayKey } from '../../../components/match/format';
import type { Match, MatchDraft } from '../../../lib/data/matches';

/**
 * Calendario entre equipos (pantallas de los deportes de equipo): todos contra todos de ida o de ida y vuelta
 * (src/sports/formats/roundRobin), una jornada cada N días, repartida en horas × canchas, con aviso de choques
 * (misma cancha a la misma hora, o un equipo en dos partidos a la vez) contra lo nuevo y lo que ya estaba.
 * Puro: sin React ni backend. Las horas se escriben en la zona de la liga y se guardan en ISO.
 */

export interface ScheduleInput {
  /** Ids de los equipos, en el orden en que salen (el primero es local en la 1.ª jornada). */
  teams: readonly string[];
  /** Ida y vuelta. */
  double: boolean;
  /** 'YYYY-MM-DD' de la primera jornada. */
  startDate: string;
  /** Días entre jornadas (7 = una por semana). */
  everyDays: number;
  /** Horas de juego de cada jornada ('HH:MM'), en la zona de la liga. */
  times: readonly string[];
  /** Canchas ('Cancha 1'); vacío = una sin nombre. */
  courts: readonly string[];
  /** Número de la primera jornada (si ya hay partidos, la que sigue). */
  firstRound: number;
  /** Zona de la liga (IANA). */
  tz: string;
  /** Fechas que se saltan (feriados): la jornada pasa a la fecha siguiente. */
  skip?: readonly string[];
}

export interface PlannedMatch {
  round: number;
  date: string;
  /** 'HH:MM' o null si no cupo en las horas × canchas de la jornada. */
  time: string | null;
  court: string | null;
  home: string;
  away: string;
  /** ISO (hora del servidor) o null sin hora. */
  scheduledAt: string | null;
}

export interface SchedulePlan {
  matches: PlannedMatch[];
  /** Los que no cupieron (sin hora): hay que agregar horas o canchas. */
  unassigned: PlannedMatch[];
  /** Quién descansa en cada jornada (número impar de equipos). */
  byes: { round: number; team: string }[];
  /** Fecha de cada jornada. */
  dates: string[];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export const isIsoDate = (s: string) => DATE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Fechas de las jornadas: una cada `everyDays` días, saltando los feriados. */
export function roundDates(start: string, count: number, everyDays: number, skip: readonly string[] = []): string[] {
  const out: string[] = [];
  const skipSet = new Set(skip);
  let d = start;
  const step = Math.max(1, Math.floor(everyDays));
  while (out.length < count) {
    while (skipSet.has(d)) d = addDays(d, 1);
    out.push(d);
    d = addDays(d, step);
  }
  return out;
}

/** «19:00, 8:30 pm, 20.30» → ['19:00', '20:30', …] en orden; lo que no se entiende sale en `bad`. */
export function parseTimes(text: string): { times: string[]; bad: string[] } {
  const times = new Set<string>();
  const bad: string[] = [];
  for (const raw of text.split(/[,;\n]+/)) {
    const t = raw.trim().toLowerCase().replace(/\./g, ':').replace(/\s+/g, ' ');
    if (!t) continue;
    const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a m|p m)?$/.exec(t);
    if (!m) {
      bad.push(raw.trim());
      continue;
    }
    let h = Number(m[1]);
    const min = Number(m[2] ?? '0');
    const ampm = m[3]?.replace(' ', '');
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    const s = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    if (!TIME.test(s)) bad.push(raw.trim());
    else times.add(s);
  }
  return { times: [...times].sort(), bad };
}

/** «Cancha 1, Cancha 2» → ['Cancha 1', 'Cancha 2'] (sin repetidos, hasta 40 letras). */
export function parseCourts(text: string): string[] {
  return [...new Set(text.split(/[,;\n]+/).map((c) => c.trim().slice(0, 40)).filter(Boolean))];
}

function tzOffsetMs(ms: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return asUtc - Math.floor(ms / 1000) * 1000;
}

const validTz = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'America/Santo_Domingo';
  }
};

/** La fecha y hora de la zona de la liga en ISO (UTC). También en los cambios de horario. */
export function zonedIso(date: string, time: string, tz: string): string {
  const zone = validTz(tz);
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const off = tzOffsetMs(guess, zone);
  let ms = guess - off;
  const off2 = tzOffsetMs(ms, zone);
  if (off2 !== off) ms = guess - off2;
  return new Date(ms).toISOString();
}

/** 'HH:MM' de una hora ISO en la zona de la liga. */
export function localTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: validTz(tz) }).format(new Date(iso));
}

/** Arma el calendario: jornadas, fechas, horas y canchas. */
export function planSchedule(input: ScheduleInput): SchedulePlan {
  const rounds = roundRobin(input.teams, { double: input.double });
  const dates = roundDates(input.startDate, rounds.length, input.everyDays, input.skip);
  const courts = input.courts.length ? input.courts : [''];
  const times = input.times.length ? input.times : [];
  const { fixtures } = assignSlots(rounds, { courts, times, dates });
  const shift = input.firstRound - 1;
  const matches = fixtures.map(
    (f): PlannedMatch => ({
      round: f.round + shift,
      date: f.date ?? input.startDate,
      time: f.time,
      court: f.time ? f.court || null : null,
      home: f.home,
      away: f.away,
      scheduledAt: f.time && f.date ? zonedIso(f.date, f.time, input.tz) : null,
    }),
  );
  return {
    matches,
    unassigned: matches.filter((m) => !m.time),
    byes: rounds.filter((r) => r.bye).map((r) => ({ round: r.round + shift, team: r.bye! })),
    dates,
  };
}

/** Borradores para `createMatches` (un lote; los ids los pone el teléfono). */
export function planDrafts(plan: SchedulePlan, opts: { format?: string } = {}): MatchDraft[] {
  return plan.matches.map((m) => ({
    round: m.round,
    court: m.court ?? '',
    scheduledAt: m.scheduledAt,
    format: opts.format,
    sides: [
      { side: 1, teamId: m.home },
      { side: 2, teamId: m.away },
    ],
  }));
}

/** Lo que ya tiene hora y sigue en pie (para los choques). */
const counts = (m: Pick<Match, 'status'>) => m.status !== 'void' && m.status !== 'walkover';

/**
 * Choques del calendario nuevo entre sí y con los partidos que ya existen: misma cancha a la misma hora, o un
 * equipo en dos partidos que se pisan. `minutes` = lo que dura un partido.
 */
export function planClashes(plan: Pick<SchedulePlan, 'matches'>, existing: readonly Pick<Match, 'id' | 'status' | 'scheduledAt' | 'court' | 'sides'>[], minutes: number, tz: string): Clash[] {
  const inputs: ClashInput[] = [];
  plan.matches.forEach((m, i) => {
    if (m.time) inputs.push({ id: `nuevo:${i}`, date: m.date, time: m.time, minutes, court: m.court, participants: [m.home, m.away] });
  });
  for (const m of existing) {
    if (!m.scheduledAt || !counts(m)) continue;
    const date = dayKey(m.scheduledAt, validTz(tz));
    if (!date) continue;
    inputs.push({
      id: m.id,
      date,
      time: localTime(m.scheduledAt, tz),
      minutes,
      court: m.court || null,
      participants: m.sides.map((s) => s.teamId).filter((x): x is string => !!x),
    });
  }
  // Solo los choques donde hay algo nuevo (lo viejo contra lo viejo ya se avisó antes).
  return findClashes(inputs, minutes).filter((c) => c.a.startsWith('nuevo:') || c.b.startsWith('nuevo:'));
}

/** Choques de un partido suelto (o reprogramado) contra el resto. */
export function matchClashes(
  m: { id?: string; date: string; time: string; court: string | null; teams: readonly string[] },
  existing: readonly Pick<Match, 'id' | 'status' | 'scheduledAt' | 'court' | 'sides'>[],
  minutes: number,
  tz: string,
): Clash[] {
  const plan = { matches: [{ round: 0, date: m.date, time: m.time, court: m.court, home: m.teams[0] ?? '', away: m.teams[1] ?? '', scheduledAt: null }] };
  return planClashes(
    plan,
    existing.filter((x) => x.id !== m.id),
    minutes,
    tz,
  );
}
