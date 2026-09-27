/**
 * Natación: tiempos. Se guardan como ENTEROS en centésimas (1:05.32 = 6532) y se muestran como m:ss.hh.
 * Gana el menor. null = sin tiempo (NT).
 */

export const MAX_TIME = 100 * 60 * 100 - 1; // 99:59.99

/**
 * Lee «mm:ss.hh», «m:ss.hh», «ss.hh» o «ss.h» (también con coma: «1:05,32»). Sin centésimas vale «1:05».
 * Con minutos, los segundos van con 2 cifras. Los segundos no pasan de 59. Devuelve null si no se entiende o es 0.
 */
export function parseSwimTime(text: string): number | null {
  const m = /^(?:(\d{1,2}):)?(\d{1,2})(?:[.,](\d{1,2}))?$/.exec(text.trim());
  if (!m) return null;
  const [, min, sec, frac] = m;
  if (min != null && sec.length !== 2) return null;
  const s = Number(sec);
  if (s > 59) return null;
  const hundredths = frac == null ? 0 : frac.length === 1 ? Number(frac) * 10 : Number(frac);
  const total = Number(min ?? 0) * 6000 + s * 100 + hundredths;
  return total > 0 ? total : null;
}

/**
 * Tiempo desde el teclado numérico: las cifras se llenan desde la derecha (centésimas, segundos, minutos).
 * «2845» = 28.45; «10532» = 1:05.32. null si los segundos pasan de 59 o no hay cifras.
 */
export function timeFromDigits(digits: string): number | null {
  if (!/^\d{1,6}$/.test(digits)) return null;
  const n = digits.padStart(6, '0');
  const min = Number(n.slice(0, 2));
  const sec = Number(n.slice(2, 4));
  const hun = Number(n.slice(4));
  if (sec > 59) return null;
  const total = min * 6000 + sec * 100 + hun;
  return total > 0 ? total : null;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * «28.45», «1:05.32», «16:32.10»; null = «NT». Con `full`, siempre «mm:ss.hh» («00:28.45»).
 */
export function formatSwimTime(cs: number | null | undefined, opts: { full?: boolean } = {}): string {
  if (cs == null || !Number.isFinite(cs) || cs <= 0) return 'NT';
  const t = Math.round(cs);
  const min = Math.floor(t / 6000);
  const sec = Math.floor((t % 6000) / 100);
  const hun = t % 100;
  if (opts.full) return `${pad2(min)}:${pad2(sec)}.${pad2(hun)}`;
  return min > 0 ? `${min}:${pad2(sec)}.${pad2(hun)}` : `${sec}.${pad2(hun)}`;
}

export function isValidSwimTime(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n > 0 && n <= MAX_TIME;
}

/**
 * Tiempo oficial con varios cronómetros manuales en un carril:
 * 1 → ese; 3 → el del medio; 2 → el promedio (las milésimas se cortan, no se redondean).
 */
export function officialTime(watches: readonly (number | null)[]): number | null {
  const ts = watches.filter((t): t is number => t != null && t > 0).sort((a, b) => a - b);
  if (!ts.length) return null;
  const mid = Math.floor(ts.length / 2);
  return ts.length % 2 ? ts[mid] : Math.floor((ts[mid - 1] + ts[mid]) / 2);
}
