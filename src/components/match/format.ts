import { isFinal, type Match, type MatchScore, type MatchSide } from '../../lib/data/matches';
import type { Side } from '../../sports/types';

/**
 * Textos de los partidos (sin React): estado, cuándo, rondas, columnas del marcador y la tarjeta para WhatsApp.
 */

export type Tone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger';

type StatusPart = Pick<Match, 'status' | 'proposedAt'>;

/** Insignia del estado: «En vivo», «Por confirmar», «Final», «En disputa», «W.O.», «Aplazado»… */
export function statusInfo(m: StatusPart, now: number = Date.now()): { label: string; tone: Tone; live: boolean } {
  switch (m.status) {
    case 'scheduled':
      return { label: 'Programado', tone: 'neutral', live: false };
    case 'live':
      return { label: 'En vivo', tone: 'ok', live: true };
    case 'suspended':
      return { label: 'Suspendido', tone: 'warn', live: false };
    case 'finished':
      return isFinal(m, now) ? { label: 'Final', tone: 'accent', live: false } : { label: 'Por confirmar', tone: 'warn', live: false };
    case 'confirmed':
      return { label: 'Final', tone: 'accent', live: false };
    case 'disputed':
      return { label: 'En disputa', tone: 'danger', live: false };
    case 'walkover':
      return { label: 'W.O.', tone: 'neutral', live: false };
    case 'void':
      return { label: 'Anulado', tone: 'neutral', live: false };
    case 'postponed':
      return { label: 'Aplazado', tone: 'warn', live: false };
  }
}

/** «Se confirma solo en 31 h» / «en 25 min» (null si no está por confirmar). */
export function autoConfirmText(m: StatusPart, now: number = Date.now()): string | null {
  if (m.status !== 'finished' || !m.proposedAt || isFinal(m, now)) return null;
  const left = Date.parse(m.proposedAt) + 48 * 3600 * 1000 - now;
  const h = Math.floor(left / 3600_000);
  return h >= 1 ? `Se confirma solo en ${h} h` : `Se confirma solo en ${Math.max(1, Math.ceil(left / 60_000))} min`;
}

/** «Jornada 3» / «Ronda 3» (o el texto que dé el deporte). */
export const roundLabel = (round: number | null | undefined, word = 'Ronda') => (round == null ? '' : `${word} ${round}`);

/** «jue 5 oct · 7:00 p. m.» en la zona de la liga (null = sin fecha). */
export function whenText(iso: string | null | undefined, tz = 'America/Santo_Domingo', withDate = true): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const time = new Intl.DateTimeFormat('es-DO', { hour: 'numeric', minute: '2-digit', timeZone: tz }).format(d);
  if (!withDate) return time;
  const date = new Intl.DateTimeFormat('es-DO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz }).format(d).replace(/\./g, '');
  return `${date} · ${time}`;
}

/** Fecha (YYYY-MM-DD) del partido en la zona de la liga, para agrupar por día. */
export function dayKey(iso: string | null | undefined, tz = 'America/Santo_Domingo'): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: tz }).format(d);
}

const PAIR = /(\d{1,3})\s*[-–:]\s*(\d{1,3})(\(\d{1,2}\))?/g;

/**
 * Columnas del marcador por lado: "6-4 3-6 10-7" → [[6,4],[3,6],[10,7]] (con el tie-break aparte); "78-72" → [[78,72]].
 * Sin texto, usa `sides` (el número grande).
 */
export function scoreColumns(score: MatchScore | null | undefined): { a: number; b: number; tb?: string }[] {
  if (!score) return [];
  const text = typeof score.text === 'string' ? score.text : '';
  const out: { a: number; b: number; tb?: string }[] = [];
  for (const m of text.matchAll(PAIR)) {
    const col: { a: number; b: number; tb?: string } = { a: Number(m[1]), b: Number(m[2]) };
    if (m[3]) col.tb = m[3].slice(1, -1);
    out.push(col);
  }
  if (!out.length && Array.isArray(score.sides) && score.sides.length === 2) out.push({ a: score.sides[0], b: score.sides[1] });
  return out;
}

/** El marcador visto desde el otro lado: "4-6 3-6" → "6-4 6-3" (el tie-break entre paréntesis no cambia). */
export const flipScoreText = (text: string) => text.replace(/(\d{1,3})(\s*[-–:]\s*)(\d{1,3})/g, (_, a: string, sep: string, b: string) => `${b}${sep}${a}`);

/** Nombre del lado (el copiado en el partido). */
export const sideName = (s: Pick<MatchSide, 'label'>) => s.label || 'Por definir';

export interface ShareInput {
  match: Pick<Match, 'status' | 'score' | 'winner' | 'walkoverSide' | 'round' | 'court' | 'stage' | 'proposedAt'> & { sides: readonly Pick<MatchSide, 'side' | 'label'>[] };
  /** Nombre de la liga o del evento. */
  title?: string;
  /** «Jornada» / «Ronda» (por defecto «Ronda»). */
  roundWord?: string;
  /** Link al partido o a la liga. */
  url?: string;
  now?: number;
}

/**
 * Texto para compartir por WhatsApp:
 *   Pádel del jueves · Ronda 3 · Cancha 2
 *   Ganan Ana / Luis 6-4 6-3 a Otra / Nuevo
 *   (por confirmar)
 *   https://…
 */
export function matchShareText({ match: m, title, roundWord = 'Ronda', url, now = Date.now() }: ShareInput): string {
  const name = (side: Side) => sideName(m.sides.find((s) => s.side === side) ?? { label: '' });
  const head = [title, m.stage || roundLabel(m.round, roundWord), m.court].filter(Boolean).join(' · ');
  const text = typeof m.score?.text === 'string' ? m.score.text.trim() : '';
  let line: string;
  if (m.status === 'walkover') {
    line =
      m.walkoverSide === 0 ? `${name(1)} y ${name(2)} no se presentaron (W.O.)` : `Gana ${name(m.winner ?? 1)} por W.O.: ${name(m.walkoverSide === 1 ? 1 : 2)} no se presentó`;
  } else if (m.winner) {
    const loser: Side = m.winner === 1 ? 2 : 1;
    const shown = m.winner === 1 ? text : flipScoreText(text);
    line = `Gana ${name(m.winner)}${shown ? ` ${shown}` : ''} a ${name(loser)}`;
  } else if (text) {
    line = `${name(1)} ${text} ${name(2)}${m.status === 'confirmed' || m.status === 'finished' ? ' (empate)' : ''}`;
  } else {
    line = `${name(1)} vs. ${name(2)}`;
  }
  const status = statusInfo(m, now);
  const extra = m.status === 'live' ? '(en vivo)' : status.label === 'Por confirmar' ? '(por confirmar)' : m.status === 'disputed' ? '(en disputa)' : null;
  return [head, line, extra, url].filter(Boolean).join('\n');
}

/** Link de WhatsApp para compartir un texto (el teléfono elige el chat). */
export const whatsappShareUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;
