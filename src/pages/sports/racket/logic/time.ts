/**
 * Fechas y horas en la zona de la liga (leagues.tz). Los partidos guardan `scheduled_at` en UTC; el admin escribe
 * la fecha y la hora de la liga ('2026-10-08' y '20:00' en Santo Domingo). Sin librerías: Intl.
 */

export const DEFAULT_TZ = 'America/Santo_Domingo';

const parts = (ts: number, tz: string): Record<string, number> => {
  const out: Record<string, number> = {};
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  for (const p of fmt.formatToParts(ts)) if (p.type !== 'literal') out[p.type] = Number(p.value);
  return out;
};

/** Diferencia (ms) entre la hora de la zona y UTC en ese instante. */
function offsetMs(ts: number, tz: string): number {
  const p = parts(ts, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  return asUtc - Math.floor(ts / 1000) * 1000;
}

const safeTz = (tz: string | null | undefined) => {
  const z = tz || DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: z });
    return z;
  } catch {
    return DEFAULT_TZ;
  }
};

/** '2026-10-08' + '20:00' en la zona → ISO UTC ('2026-10-09T00:00:00.000Z' en Santo Domingo). null si no se entiende. */
export function zonedIso(date: string, time: string, tz?: string | null): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? '');
  const t = /^(\d{1,2}):(\d{2})/.exec(time ?? '');
  if (!d || !t) return null;
  const zone = safeTz(tz);
  const guess = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
  if (!Number.isFinite(guess)) return null;
  let ts = guess - offsetMs(guess, zone);
  // Cerca de un cambio de horario la primera cuenta puede quedar corrida una hora.
  const second = offsetMs(ts, zone);
  if (guess - second !== ts) ts = guess - second;
  return new Date(ts).toISOString();
}

/** ISO → fecha y hora de la zona: { date: '2026-10-08', time: '20:00' }. */
export function localParts(iso: string | null | undefined, tz?: string | null): { date: string; time: string } | null {
  if (!iso) return null;
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return null;
  const p = parts(ts, safeTz(tz));
  const two = (n: number) => String(n).padStart(2, '0');
  return { date: `${p.year}-${two(p.month)}-${two(p.day)}`, time: `${two(p.hour % 24)}:${two(p.minute)}` };
}

/** Fecha 'YYYY-MM-DD' más n días. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Hoy en la zona de la liga ('YYYY-MM-DD'). */
export const todayIn = (tz?: string | null, now = Date.now()) => localParts(new Date(now).toISOString(), tz)!.date;

/** '20:00' → '8:00 pm'. */
export function timeLabel(hhmm: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? '');
  if (!m) return '';
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? 'am' : 'pm'}`;
}
