import type { Match, MatchSide } from '../../lib/data/matches';
import type { Side } from '../../sports/types';
import { matchShareText, roundLabel, scoreColumns, sideName, statusInfo, whenText } from '../match/format';
import type { ShareResultSide, ShareResultSpec, ShareScoreCell } from './cards';

/** Lo que hace falta del partido (igual que matchShareText, más la hora). */
export type ShareMatch = Pick<Match, 'status' | 'score' | 'winner' | 'walkoverSide' | 'round' | 'court' | 'stage' | 'proposedAt' | 'scheduledAt'> & {
  sides: readonly Pick<MatchSide, 'side' | 'label'>[];
};

export interface ResultShareOptions {
  /** Nombre de la liga, de la noche o del torneo. */
  title: string;
  /** «Jornada» / «Ronda». */
  roundWord?: string;
  /** Zona de la liga para la fecha. */
  tz?: string;
  /** Link (va en el texto que acompaña la imagen). */
  url?: string;
  /** Color y línea chica de cada lado (equipos). */
  sideExtra?: (side: Side) => Pick<ShareResultSide, 'dot' | 'sub'> | undefined;
  now?: number;
}

/** Lo que va entre paréntesis con letras en el marcador: «(pen. 4-3)», «(pr.)», «(W.O.)», «(forfeit)». */
const TAGS = /\(([^()]*\p{L}[^()]*)\)/gu;

/** «pen. 4-3» → «Penales 4-3», «pr.» → «Con prórroga». El W.O. ya sale en el estado. */
function tagText(tag: string): string | null {
  const t = tag.trim();
  const pens = /^pen\.?\s*(.+)$/i.exec(t);
  if (pens) return `Penales ${pens[1]}`;
  if (/^pr\.?$/i.test(t)) return 'Con prórroga';
  if (/^w\.?\s*o\.?$/i.test(t) || /^forfeit$/i.test(t)) return null;
  return t;
}

/**
 * Tarjeta de un partido para compartir como imagen: estado, los dos lados (el ganador marcado) y el marcador,
 * grande si es un solo número (78-72, 2-1, 24-18) o por sets (6-4 3-6 7-6 con el tie-break chiquito).
 */
export function resultShare(m: ShareMatch, o: ResultShareOptions): ShareResultSpec {
  const now = o.now ?? Date.now();
  const raw = typeof m.score?.text === 'string' ? m.score.text : '';
  const notes = [...raw.matchAll(TAGS)].map((x) => tagText(x[1])).filter((x): x is string => !!x);
  const cols = scoreColumns(m.score ? { ...m.score, text: raw.replace(TAGS, ' ') } : null);
  const big = cols.length <= 1;

  const status = statusInfo(m, now);
  const side = (s: Side): ShareResultSide => {
    const absent = m.status === 'walkover' && (m.walkoverSide === 0 || m.walkoverSide === s);
    const cells: ShareScoreCell[] = cols.map((c) => {
      const mine = s === 1 ? c.a : c.b;
      const theirs = s === 1 ? c.b : c.a;
      return {
        text: String(mine),
        strong: big ? m.winner === s : mine > theirs,
        // El tie-break se anota al que perdió el set: 7-6(5) → el 6 lleva el 5.
        ...(c.tb && mine < theirs ? { sup: c.tb } : {}),
      };
    });
    const extra = o.sideExtra?.(s);
    return {
      name: sideName(m.sides.find((x) => x.side === s) ?? { label: '' }),
      ...extra,
      ...(absent ? { sub: 'No se presentó' } : {}),
      winner: m.winner === s,
      cells,
    };
  };

  const subtitle = [m.stage || roundLabel(m.round, o.roundWord ?? 'Ronda'), m.court, whenText(m.scheduledAt, o.tz)].filter(Boolean).join(' · ');
  return {
    kind: 'result',
    title: o.title,
    subtitle: subtitle || undefined,
    status: { label: status.label, tone: status.tone },
    sides: [side(1), side(2)],
    big,
    note: notes.join(' · ') || undefined,
    caption: matchShareText({ match: m, title: o.title, roundWord: o.roundWord, now }),
  };
}
