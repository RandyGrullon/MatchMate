import type { ReactNode } from 'react';
import type { StandingRow } from '../../sports/types';

/** Columnas de las tablas de posiciones (StandingsTable.tsx en la web y las tablas de la app del teléfono). */

export interface StandingsColumn {
  key: string;
  /** Encabezado corto: «PJ», «Sets», «Dif.». */
  label: string;
  /** Texto completo (tooltip y lectores de pantalla). */
  title?: string;
  value: (row: StandingRow) => ReactNode;
  /** Se esconde en el teléfono. */
  wide?: boolean;
}

/** Columnas de siempre: PJ, G, E (si `draws`), P, a favor, en contra, diferencia. Los nombres de a favor/en contra los da el deporte. */
export function defaultColumns(opts: { draws?: boolean; forLabel?: string; againstLabel?: string; diffLabel?: string } = {}): StandingsColumn[] {
  const cols: StandingsColumn[] = [
    { key: 'played', label: 'PJ', title: 'Partidos jugados', value: (r) => r.played },
    { key: 'won', label: 'G', title: 'Ganados', value: (r) => r.won },
  ];
  if (opts.draws) cols.push({ key: 'drawn', label: 'E', title: 'Empatados', value: (r) => r.drawn });
  cols.push({ key: 'lost', label: 'P', title: 'Perdidos', value: (r) => r.lost });
  cols.push(
    { key: 'for', label: opts.forLabel ?? 'F', title: 'A favor', value: (r) => r.for, wide: true },
    { key: 'against', label: opts.againstLabel ?? 'C', title: 'En contra', value: (r) => r.against, wide: true },
    { key: 'diff', label: opts.diffLabel ?? 'Dif.', title: 'Diferencia', value: (r) => (r.diff > 0 ? `+${r.diff}` : r.diff) },
  );
  return cols;
}
