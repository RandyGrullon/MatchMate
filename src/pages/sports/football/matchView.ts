import { isSnapshot } from '../../../court/session';
import type { MatchScore } from '../../../lib/data/matchCore';
import { football, type FootballEvent, type FootballState, type TimelineItem } from '../../../sports/team/football';
import type { Side } from '../../../sports/types';
import { pensFromScore, periodsFromScore, type ScoreEvent, type ScoreLine } from './adapter';

/**
 * Lo puro del partido de fútbol y sala (MatchDetail.tsx y bits.tsx): el acta completa desde lo que guardó el anotador,
 * los textos de cada jugada y de goles y tarjetas, y los goles por tiempo. Lo usan la web y la app del teléfono.
 */

/** El estado del acta desde lo que guardó el anotador (matches.state); null si no hay o no se puede leer. */
export function stateFromSnapshot(raw: unknown): FootballState | null {
  if (!isSnapshot(raw)) return null;
  try {
    const snap = raw as { config: unknown; base: FootballState | null; log: FootballEvent[] };
    const start = snap.base ?? football.init(snap.config as never);
    return snap.log.reduce((s, ev) => football.apply(s, ev), start);
  } catch {
    return null;
  }
}

/** El nombre de cada jugada del acta completa. */
export const ITEM_TEXT: Record<TimelineItem['kind'], string> = {
  goal: 'Gol',
  own_goal: 'Autogol',
  yellow: 'Amarilla',
  second_yellow: 'Doble amarilla (roja)',
  red: 'Roja directa',
  sub: 'Cambio',
  goalkeeper: 'Portero',
  timeout: 'Tiempo muerto',
  period_end: 'Fin del tiempo',
  shootout: 'Penal',
};

/** El nombre de cada cosa de «Goles y tarjetas» (cuando no hay jugador). */
export const KIND_TEXT: Record<ScoreEvent['kind'], string> = { goal: 'Gol', own_goal: 'Autogol', yellow: 'Amarilla', second_yellow: 'Doble amarilla (roja)', red: 'Roja' };

/** Una fila del acta completa: el minuto («23'», «2T»), qué fue, de qué equipo y el detalle (quién, el cambio, el penal). */
export interface ActaRow {
  when: string;
  kind: TimelineItem['kind'];
  title: string;
  team: string | null;
  detail: string;
}

/** Las filas del acta completa. `who(side, id)` = «#10 Jugador Uno» (vacío sin id). */
export function actaRows(items: readonly TimelineItem[], names: readonly [string, string], who: (side: Side, id?: string) => string): ActaRow[] {
  return items.map((it) => {
    const side = it.side;
    const playerSide = it.kind === 'own_goal' && side ? (side === 1 ? 2 : 1) : side;
    let detail = '';
    if (it.kind === 'sub' && side) detail = `sale ${who(side, it.player)}, entra ${who(side, it.in)}`;
    else if (it.kind === 'shootout' && side) detail = `${who(side, it.player) || names[side - 1]}: ${it.scored ? 'gol' : 'fallado'}`;
    else if (playerSide && it.player) detail = who(playerSide, it.player);
    if (it.assist && side) detail += ` (asistencia de ${who(side, it.assist)})`;
    return {
      when: it.minute ? `${it.minute}'` : it.kind === 'period_end' ? '' : `${it.period}T`,
      kind: it.kind,
      title: ITEM_TEXT[it.kind],
      team: side ? names[side - 1] : null,
      detail,
    };
  });
}

/** El lado del jugador de un gol o una tarjeta (en un autogol, el del rival del que suma). */
export const eventPlayerSide = (e: Pick<ScoreEvent, 'kind' | 'side'>): Side => (e.kind === 'own_goal' ? (e.side === 1 ? 2 : 1) : e.side);

/** Goles por tiempo («1T: 1-0», «Pr.1: 0-0») y los penales; vacío si hay un solo tiempo y sin penales. */
export function periodsLineParts(score: MatchScore | null | undefined): { periods: string[]; pens: string | null } {
  const periods = periodsFromScore(score);
  const pens = pensFromScore(score);
  if (periods.length < 2 && !pens) return { periods: [], pens: null };
  const label = (i: number) => (i < 2 ? `${i + 1}T` : `Pr.${i - 1}`);
  return { periods: periods.map((p, i) => `${label(i)}: ${p[0]}-${p[1]}`), pens: pens ? `Penales: ${pens[0]}-${pens[1]}` : null };
}

/**
 * Los jugadores de un lado en la tabla «Jugadores» del partido (Pro: goles, asistencias y tarjetas de cada uno), por
 * dorsal; sin dorsal, al final. `jersey`: el dorsal del partido o el de su equipo.
 */
export function sidePlayerLines(lines: readonly ScoreLine[], side: Side, jersey: (l: ScoreLine) => number | null | undefined): ScoreLine[] {
  return lines.filter((l) => l.side === side).sort((a, b) => (jersey(a) ?? 1000) - (jersey(b) ?? 1000));
}

/** Lo de un jugador junto a su nombre en esa tabla: «(portero, 2 rec.)» o «(portero)» si no jugó, y «(banco)». */
export function playerLineNotes(l: Pick<ScoreLine, 'keeper' | 'played' | 'conceded'>): string[] {
  return [l.keeper ? `(portero${l.played ? `, ${l.conceded} rec.` : ''})` : null, !l.played ? '(banco)' : null].filter((x): x is string => !!x);
}

