import type { ReactNode } from 'react';

/**
 * Lo que no es pantalla de la tabla de líderes (anotadores del baloncesto, goleadores, tarjetas y vallas del fútbol):
 * las columnas y el orden con el puesto compartido. Sin React (solo el tipo de lo que se muestra): lo usan
 * LeadersTable.tsx de la web y la tabla de la app del teléfono.
 */

export interface LeaderColumn<R> {
  key: string;
  /** Encabezado corto: «PTS», «Prom», «3P». */
  label: string;
  title: string;
  value: (row: R) => number;
  /** Cómo se muestra (por defecto el número). */
  show?: (row: R) => ReactNode;
  /** Se esconde en el teléfono. */
  wide?: boolean;
}

/**
 * Las filas ordenadas por la columna `col` (de mayor a menor; si empatan, por la primera columna y luego por nombre),
 * con su puesto: los que empatan en esa columna comparten el puesto. `limit` corta la lista.
 */
export function rankLeaders<R extends { player: string }>(
  rows: readonly R[],
  columns: readonly LeaderColumn<R>[],
  col: LeaderColumn<R>,
  nameOf: (playerId: string) => string,
  limit?: number,
): { r: R; rank: number }[] {
  const list = [...rows].sort((a, b) => col.value(b) - col.value(a) || columns[0].value(b) - columns[0].value(a) || nameOf(a.player).localeCompare(nameOf(b.player), 'es'));
  let rank = 0;
  return list.slice(0, limit ?? list.length).map((r, i) => {
    if (i === 0 || col.value(r) !== col.value(list[i - 1])) rank = i + 1;
    return { r, rank };
  });
}
