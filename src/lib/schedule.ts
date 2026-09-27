/**
 * "Cuándo juegan" de la liga: días de la semana + hora, guardado como texto legible
 * ("Martes y jueves · 7:00 pm") para que se vea igual en todas partes y no cambien las reglas.
 */

export const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const;
export const WEEKDAY_SHORT = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'] as const;

const plain = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/** "19:00" → "7:00 pm". Vacío si no es una hora válida. */
export function formatTime(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return '';
  const h = +m[1];
  const min = +m[2];
  if (h > 23 || min > 59) return '';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]} ${h < 12 ? 'am' : 'pm'}`;
}

/** Lista en español: "Martes", "Martes y jueves", "Lunes, miércoles y viernes". */
function joinDays(days: number[]): string {
  const names = [...new Set(days)]
    .filter((d) => d >= 0 && d < 7)
    .sort((a, b) => a - b)
    .map((d, i) => (i === 0 ? WEEKDAYS[d] : WEEKDAYS[d].toLowerCase()));
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}

/** Días (0 = lunes) + hora "HH:MM" → "Martes y jueves · 7:00 pm". */
export function formatSchedule(days: number[], time: string): string {
  return [joinDays(days), formatTime(time)].filter(Boolean).join(' · ');
}

/**
 * Lee lo que se guardó (o un texto parecido escrito a mano) para volver a editarlo:
 * días en singular o plural ("sábados"), horas con o sin minutos ("7pm") y rangos ("7:00 a 9:00 pm").
 */
export function parseSchedule(text: string): { days: number[]; time: string } {
  const s = plain(text);
  const days = WEEKDAYS.map((d, i) => (new RegExp(`\\b${plain(d)}s?\\b`).test(s) ? i : -1)).filter((i) => i >= 0);
  // Horas: "7:30", "7:30 pm", "7 pm". Un número suelto (sin ":" ni am/pm) no es una hora.
  const found = [...s.matchAll(/(\d{1,2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?)?/g)]
    .filter((m) => m[2] !== undefined || m[3] !== undefined)
    .map((m) => ({ h: +m[1], min: m[2] ?? '00', ampm: m[3]?.replace(/[\s.]/g, '') }));
  let time = '';
  const first = found[0];
  if (first) {
    // En un rango, la primera hora toma el am/pm de la siguiente si no tiene el suyo.
    const ampm = first.ampm ?? found.slice(1).find((t) => t.ampm)?.ampm;
    let h = first.h;
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    if (h <= 23 && +first.min <= 59) time = `${String(h).padStart(2, '0')}:${first.min}`;
  }
  return { days, time };
}

/** ¿El texto guardado es exactamente lo que armaría el selector? (si no, al tocarlo se reemplaza). */
export const isCanonicalSchedule = (text: string) => {
  const { days, time } = parseSchedule(text);
  return formatSchedule(days, time) === text.trim();
};
