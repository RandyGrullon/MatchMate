/**
 * Lo puro del cuadro de esports (§12.8): las partes (ganadores, perdedores, gran final, 3.er lugar) con sus columnas
 * por ronda, quién ganó cada tarjeta y el nombre de cada lado. Sin React: lo dibujan EsportsBracket (la web) y el
 * cuadro de la app del teléfono.
 */
import type { Match } from '../../../../lib/data/matches';
import { partTitle, type BracketPart, type ResolvedMatch } from '../../../../sports/esports';

export interface Column {
  key: string;
  title: string;
  matches: ResolvedMatch[];
}

export interface Part {
  key: string;
  title: string;
  columns: Column[];
  /** Lleva el campeón al final. */
  final: boolean;
}

/** Ganadores (o el cuadro simple), perdedores y la gran final: cada parte con sus columnas por ronda. */
export function sections(list: readonly ResolvedMatch[]): Part[] {
  const of = (part: BracketPart) => list.filter((m) => m.part === part);
  const w = of('W');
  const l = of('L');
  const gf = [...of('GF'), ...of('GF2')];
  const p3 = of('P3');
  const double = l.length > 0 || gf.length > 0;
  const byRound = (ms: readonly ResolvedMatch[], part: BracketPart): Column[] => {
    const rounds = [...new Set(ms.map((m) => m.round))].sort((a, b) => a - b);
    const last = rounds.at(-1) ?? 1;
    return rounds.map((r) => ({
      key: `${part}${r}`,
      // En la doble, la última de ganadores es «Final de ganadores» (la final es la gran final).
      title: double && part === 'W' && r === last ? 'Final de ganadores' : partTitle(part, r, last),
      matches: ms.filter((m) => m.round === r).sort((a, b) => a.index - b.index),
    }));
  };
  const out: Part[] = [];
  if (w.length) out.push({ key: 'W', title: double ? 'Ganadores' : 'Cuadro', columns: byRound(w, 'W'), final: !double && !p3.length });
  if (l.length) out.push({ key: 'L', title: 'Perdedores', columns: byRound(l, 'L'), final: false });
  if (gf.length)
    out.push({
      key: 'GF',
      title: 'Gran final',
      columns: gf.map((m) => ({ key: m.key, title: partTitle(m.part, 1, 1), matches: [m] })),
      final: true,
    });
  if (p3.length) {
    // Simple con 3.er lugar: el campeón va después de la final (en la primera parte) y el 3.er lugar aparte.
    if (out[0]) out[0].final = true;
    out.push({ key: 'P3', title: '3.er lugar', columns: [{ key: 'P3', title: partTitle('P3', 1, 1), matches: p3 }], final: false });
  }
  return out;
}

/** El lado que ganó la tarjeta (en un W.O., el que sí vino); null si todavía no hay ganador. */
export function cellWinnerSide(match: Pick<Match, 'status' | 'walkoverSide' | 'winner'> | undefined): 1 | 2 | null {
  if (match?.status === 'walkover') return match.walkoverSide === 1 ? 2 : match.walkoverSide === 2 ? 1 : null;
  return match?.winner ?? null;
}

/** El nombre de un lado de la tarjeta: el inscrito, o de dónde viene («Ganador W1-2»), o «Por definir». */
export const cellLabel = (m: Pick<ResolvedMatch, 'known' | 'labels'>, i: 0 | 1, nameOf: (id: string) => string): string => {
  const id = m.known[i];
  return id ? nameOf(id) : m.labels[i] || 'Por definir';
};
