/** El historial del partido (matches.history) en palabras. Puro. */
import type { MatchHistoryItem } from '../../../../lib/data/matches';
import { localParts, timeLabel } from '../logic/time';

/** Lo que hizo cada acción. `schedule` («Cambió la hora o la cancha») lo arma `historyLines` con la palabra del deporte. */
const ACTIONS: Record<string, string> = {
  reschedule: 'Reprogramado',
  postpone: 'Aplazado',
  suspend: 'Suspendido',
  takeover: 'Otro anotador tomó el control',
  handoff: 'Entregó el control de anotar',
  release: 'Dejó de anotar',
  finish: 'Resultado anotado',
  confirm: 'Resultado confirmado',
  dispute: 'Reclamo del resultado',
  resolve: 'Reclamo resuelto',
  correct: 'Resultado corregido',
  walkover: 'W.O.',
  void: 'Anulado',
};

export interface HistoryLine {
  at: string;
  who: string | null;
  text: string;
  note: string | null;
}

const place = (v: unknown, tz?: string | null) => {
  if (!v || typeof v !== 'object') return '';
  const o = v as { at?: string | null; court?: string | null };
  const p = localParts(o.at ?? null, tz);
  return [p ? `${p.date.slice(8, 10)}/${p.date.slice(5, 7)} ${timeLabel(p.time)}` : 'sin fecha', o.court].filter(Boolean).join(', ');
};

/**
 * Líneas del historial, la más nueva primero. `nameOf(uid)` = nombre de la cuenta en la liga; `court` = cómo se llama
 * donde se juega (`courtWords(ext).one`: «cancha» o «mesa»).
 */
export function historyLines(
  items: readonly MatchHistoryItem[] | undefined,
  nameOf: (uid: string) => string | null,
  tz?: string | null,
  court = 'cancha',
): HistoryLine[] {
  return [...(items ?? [])].reverse().map((h) => {
    let text = h.a === 'schedule' ? `Cambió la hora o la ${court}` : (ACTIONS[h.a] ?? h.a);
    if ((h.a === 'finish' || h.a === 'resolve') && typeof h.score === 'string') text += `: ${h.score}`;
    if (h.a === 'correct') text += `: ${typeof h.from === 'string' ? `${h.from} → ` : ''}${typeof h.score === 'string' ? h.score : ''}`;
    if (h.a === 'walkover') text += h.absent === 0 ? ': no vino nadie' : `: no vino el lado ${h.absent}`;
    if ((h.a === 'schedule' || h.a === 'reschedule') && h.to) text += `: ${place(h.to, tz)}`;
    return { at: h.at, who: h.by ? nameOf(h.by) : null, text, note: h.note ?? null };
  });
}
