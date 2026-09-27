/**
 * Liga por cajas (box league) mensual: cajas de 4 a 6 jugadores o parejas por nivel; todos contra todos en el
 * mes; al cerrar, suben los mejores y bajan los peores de cada caja. Hay que jugar un mínimo de partidos para
 * subir o para salvarse. La caja 0 es la de arriba.
 */

import type { StandingRow } from '../types';

export interface BoxOptions {
  /** Tamaño mínimo y máximo de caja (4 y 6). */
  min?: number;
  max?: number;
  /** Tamaño preferido; sin él se usan las menos cajas posibles. */
  target?: number;
}

/**
 * Tamaños de caja para `n` participantes: lo más parejo posible, las de arriba con uno más si no divide exacto.
 * Si no hay forma de cumplir el mínimo y el máximo a la vez (p. ej. 7 con 4–6), gana el máximo: [4, 3].
 */
export function boxSizes(n: number, opts: BoxOptions = {}): number[] {
  const min = opts.min ?? 4;
  const max = opts.max ?? 6;
  if (n <= 0) return [];
  if (n <= max) return [n];
  const lo = Math.ceil(n / max);
  const hi = Math.max(lo, Math.floor(n / min));
  let k = opts.target ? Math.round(n / opts.target) : lo;
  k = Math.min(hi, Math.max(lo, k));
  const base = Math.floor(n / k);
  const extra = n % k;
  return Array.from({ length: k }, (_, i) => base + (i < extra ? 1 : 0));
}

/** Arma las cajas con los ids ya ordenados por nivel (mejor primero). */
export function makeBoxes(seeded: readonly string[], opts: BoxOptions = {}): string[][] {
  const out: string[][] = [];
  let i = 0;
  for (const size of boxSizes(seeded.length, opts)) {
    out.push(seeded.slice(i, i + size));
    i += size;
  }
  return out;
}

export interface CloseBoxOptions extends BoxOptions {
  /** Cuántos suben de cada caja (2) y cuántos bajan (2). */
  up?: number;
  down?: number;
  /** Partidos mínimos para poder subir (2) y para salvarse (2): quien juega menos, baja. */
  minToPromote?: number;
  minToStay?: number;
  /** Se van de la liga. */
  withdrawn?: readonly string[];
  /** Nuevos: entran en la última caja. */
  newcomers?: readonly string[];
}

export interface BoxMove {
  id: string;
  /** Caja del mes que cierra (null = nuevo). */
  from: number | null;
  /** Caja del mes que viene. */
  to: number;
  /** Sube, baja, se queda o entra. */
  move: 'sube' | 'baja' | 'queda' | 'nuevo';
  /** Bajó por no llegar al mínimo de partidos. */
  reason?: 'pocos-partidos';
}

/**
 * Cierra el mes. `standings[b]` es la tabla ya ordenada de la caja b (la de su deporte: racketStandings,
 * pickleballStandings…) y debe traer a todos los de la caja.
 *
 * - Suben los `up` mejores que jugaron al menos `minToPromote` (no en la caja de arriba).
 * - Bajan los `down` últimos y cualquiera con menos de `minToStay` partidos (no en la última caja).
 * - Las cajas nuevas se arman en este orden: los que se quedan (por su puesto), los que bajan de la caja de
 *   arriba y los que suben de la de abajo, y se cortan con los mismos tamaños de antes (o `boxSizes` si
 *   cambió la cantidad). Si una caja quedó corta porque bajó más gente, sube el mejor que se quedaba abajo.
 */
export function closeBoxMonth(boxes: readonly (readonly string[])[], standings: readonly (readonly StandingRow[])[], opts: CloseBoxOptions = {}): { boxes: string[][]; moves: BoxMove[] } {
  const up = opts.up ?? 2;
  const down = opts.down ?? 2;
  const minUp = opts.minToPromote ?? 2;
  const minStay = opts.minToStay ?? 2;
  const gone = new Set(opts.withdrawn ?? []);
  const last = boxes.length - 1;
  const fromBox = new Map<string, number>();
  boxes.forEach((b, i) => b.forEach((id) => fromBox.set(id, i)));

  const stay: string[][] = boxes.map(() => []);
  const promoted: string[][] = boxes.map(() => []);
  const relegated: string[][] = boxes.map(() => []);
  const lowPlay = new Set<string>();

  boxes.forEach((box, b) => {
    const inBox = new Set(box);
    const table = standings[b].filter((r) => inBox.has(r.id));
    const listed = new Set(table.map((r) => r.id));
    // Los que no salen en la tabla van al final, como si no hubieran jugado.
    const rows = [...table.map((r) => ({ id: r.id, played: r.played })), ...box.filter((id) => !listed.has(id)).map((id) => ({ id, played: 0 }))].filter(
      (r) => !gone.has(r.id),
    );
    const goDown = new Set<string>();
    if (b < last) {
      for (const r of rows) {
        if (r.played < minStay) {
          goDown.add(r.id);
          lowPlay.add(r.id);
        }
      }
      for (let i = rows.length - 1, n = 0; i >= 0 && n < down; i--, n++) goDown.add(rows[i].id);
    }
    const goUp = new Set<string>();
    if (b > 0) {
      for (const r of rows) {
        if (goUp.size >= up) break;
        if (!goDown.has(r.id) && r.played >= minUp) goUp.add(r.id);
      }
    }
    for (const r of rows) {
      if (goUp.has(r.id)) promoted[b].push(r.id);
      else if (goDown.has(r.id)) relegated[b].push(r.id);
      else stay[b].push(r.id);
    }
  });

  const order: string[] = [];
  boxes.forEach((_, b) => {
    order.push(...stay[b]);
    if (b > 0) order.push(...relegated[b - 1]);
    if (b < last) order.push(...promoted[b + 1]);
  });
  const fresh = (opts.newcomers ?? []).filter((id) => !fromBox.has(id) && !gone.has(id));
  order.push(...fresh);

  const oldSizes = boxes.map((b) => b.length);
  const sameCount = order.length === oldSizes.reduce((a, x) => a + x, 0);
  const sizes = sameCount ? oldSizes : boxSizes(order.length, opts);
  const next: string[][] = [];
  let i = 0;
  for (const size of sizes) {
    next.push(order.slice(i, i + size));
    i += size;
  }

  const moves: BoxMove[] = [];
  next.forEach((box, to) =>
    box.forEach((id) => {
      const from = fromBox.get(id);
      if (from == null) moves.push({ id, from: null, to, move: 'nuevo' });
      else {
        const move = to < from ? 'sube' : to > from ? 'baja' : 'queda';
        moves.push(lowPlay.has(id) && move === 'baja' ? { id, from, to, move, reason: 'pocos-partidos' } : { id, from, to, move });
      }
    }),
  );
  return { boxes: next, moves };
}
