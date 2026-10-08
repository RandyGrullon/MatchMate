/**
 * Lo que no es pantalla del inicio y de la ronda del golf (rediseño «Calma y foco»): qué dice la tarjeta «Hoy» y qué hace
 * su único botón, los 3 de arriba del orden de mérito y la línea debajo del título de una ronda. Funciones puras, con
 * pruebas en golf-home.test.ts.
 */
import { toParText } from './logic';

/** Lo tuyo en la ronda de hoy (null si no tienes tarjeta). */
export interface MyRoundState {
  /** Hoyos terminados. */
  holes: number;
  complete: boolean;
  signed: boolean;
  /** «21 pts» o «+2» (lo que manda en la competencia). */
  score: string;
  /** El número del hoyo que sigue (null si no hay). */
  nextHole: number | null;
}

/** El botón de la tarjeta «Hoy»: qué dice y a qué parte de la ronda lleva. */
export interface NowAction {
  label: string;
  tab: 'tarjeta' | 'jugadores' | 'leaderboard';
}

/**
 * La línea y el botón de la tarjeta «Hoy» del golf, lo tuyo en pocas palabras: «Llevas 7 hoyos · 21 pts» con «Seguir en
 * el hoyo 8»; sin tarjeta, «Inscribirme»; quien anota los grupos (admin o anotador), «Anotar los grupos». Quien mira la
 * liga sin ser miembro no tiene botón.
 */
export function golfNow(i: { mine: MyRoundState | null; hasCourse: boolean; staff: boolean; member: boolean }): { line: string; action: NowAction | null } {
  if (!i.hasCourse) return { line: 'Falta elegir el campo', action: null };
  const m = i.mine;
  if (m) {
    if (m.signed) return { line: `Tarjeta firmada · ${m.score}`, action: null };
    if (m.complete) return { line: `Terminaste · ${m.score}`, action: { label: 'Revisar y firmar', tab: 'tarjeta' } };
    if (m.holes > 0) return { line: `Llevas ${m.holes} ${m.holes === 1 ? 'hoyo' : 'hoyos'} · ${m.score}`, action: { label: m.nextHole ? `Seguir en el hoyo ${m.nextHole}` : 'Seguir anotando', tab: 'tarjeta' } };
    return { line: 'Todavía no anotas', action: { label: 'Anotar mi tarjeta', tab: 'tarjeta' } };
  }
  if (i.staff) return { line: 'Anotas las tarjetas de los grupos', action: { label: 'Anotar los grupos', tab: 'tarjeta' } };
  if (i.member) return { line: 'Todavía no te inscribes', action: { label: 'Inscribirme', tab: 'jugadores' } };
  return { line: 'Mira cómo van', action: null };
}

/** Lo que manda en la competencia: «21 pts» en Stableford; los golpes contra el par («+2», «E») en las demás. */
export function scoreText(s: { points: number; toPar: number | null; netToPar: number | null }, comp: { format: string; basis: string }): string {
  if (comp.format === 'stableford') return `${s.points} pts`;
  return toParText(comp.basis === 'net' ? s.netToPar : s.toPar);
}

/** Una fila del orden de mérito en el inicio. */
export interface MeritTopRow<T> {
  row: T;
  me: boolean;
}

/**
 * Los 3 de arriba del orden de mérito (con puntos). Si la cuenta va más abajo, su fila toma el último lugar («1, 2 y
 * tú, 5.º»): su lugar siempre a la vista.
 */
export function meritTop<T extends { id: string; rank: number; points: number }>(merit: readonly T[], me: string | null | undefined, max = 3): MeritTopRow<T>[] {
  const ranked = merit.filter((m) => m.points > 0);
  const top = ranked.slice(0, max);
  const mine = me ? ranked.find((m) => m.id === me) : undefined;
  const shown = mine && !top.includes(mine) ? [...ranked.slice(0, max - 1), mine] : top;
  return shown.map((row) => ({ row, me: !!me && row.id === me }));
}

/** El nombre corto del resultado de un hoyo contra el par (debajo de los golpes, en la tarjeta del campo). */
export function holeWord(strokes: number, par: number): string {
  const d = strokes - par;
  if (d <= -3) return 'albatros';
  if (d === -2) return 'eagle';
  if (d === -1) return 'birdie';
  if (d === 0) return 'par';
  if (d === 1) return 'bogey';
  if (d === 2) return 'doble bogey';
  return `+${d}`;
}

/** «Vas 3.º de 6, con 41 pts» y quién te lleva («Pedro te lleva 9 pts»), para la tarjeta de tu lugar en el orden de mérito. */
export function meritPlace<T extends { id: string; rank: number; points: number }>(
  merit: readonly T[],
  me: string | null | undefined,
  nameOf: (id: string) => string,
): { big: string; title: string; subtitle: string } | null {
  const ranked = merit.filter((m) => m.points > 0);
  const mine = me ? ranked.find((m) => m.id === me) : undefined;
  if (!mine) return null;
  const pts = (n: number) => `${n.toLocaleString('es-DO')} ${n === 1 ? 'punto' : 'pts'}`;
  const ahead = ranked.filter((m) => m.rank < mine.rank).at(-1);
  const first = ranked[0];
  return {
    big: `${mine.rank}.º`,
    title: `Vas ${mine.rank}.º de ${ranked.length}, con ${pts(mine.points)}`,
    subtitle:
      mine.rank === 1
        ? ranked.filter((m) => m.rank === 1).length > 1
          ? 'Empatas en el primer lugar'
          : ranked[1]
            ? `Le llevas ${pts(mine.points - ranked[1].points)} a ${nameOf(ranked[1].id)}`
            : 'Vas primero'
        : `${nameOf((ahead ?? first).id)} te lleva ${pts((ahead ?? first).points - mine.points)}`,
  };
}
