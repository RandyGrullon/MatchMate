import type { ReactNode } from 'react';
import type { StandingRow } from '../../sports/types';
import type { ShareColumn, ShareRow, ShareSection, ShareTableSpec } from './cards';

/**
 * De las tablas de la app (StandingsTable, LeadersTable) a una tabla para compartir. Las columnas de la app
 * devuelven ReactNode: aquí solo sirve lo que es texto o número.
 */

/** Texto de una celda (lo que no sea texto ni número queda vacío). */
export function plain(v: ReactNode): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'bigint') return String(v);
  return '';
}

/** La forma de StandingsColumn (components/match) sin atarse a ella. */
export interface TableColumnLike<R> {
  label: string;
  value: (row: R) => ReactNode;
  /** En la app sale solo en la computadora: aquí se quita si no cabe. */
  wide?: boolean;
}

/** La forma de LeaderColumn (pages/sports/team/LeadersTable). */
export interface LeaderColumnLike<R> {
  label: string;
  value: (row: R) => number;
  show?: (row: R) => ReactNode;
  wide?: boolean;
}

export interface StandingsShareInput {
  title: string;
  subtitle?: string;
  /** Una tabla sola, o varias con título (grupos). */
  sections: readonly { heading?: string; rows: readonly StandingRow[] }[];
  columns: readonly TableColumnLike<StandingRow>[];
  nameOf: (id: string) => string;
  /** Punto de color y línea chica de cada fila (equipo, club). */
  rowExtra?: (id: string) => Pick<ShareRow, 'dot' | 'sub'>;
  nameLabel?: string;
  pointsLabel?: string;
  note?: string;
  caption?: string;
}

/** Tabla de posiciones: las columnas de la app y los puntos al final, en negrita. */
export function standingsShare(o: StandingsShareInput): ShareTableSpec {
  const columns: ShareColumn[] = [...o.columns.map((c) => ({ label: c.label, optional: !!c.wide })), { label: o.pointsLabel ?? 'Pts', strong: true }];
  const sections: ShareSection[] = o.sections.map((s) => ({
    heading: s.heading,
    rows: s.rows.map((r) => ({
      rank: r.rank,
      name: o.nameOf(r.id),
      ...o.rowExtra?.(r.id),
      values: [...o.columns.map((c) => plain(c.value(r))), r.points],
    })),
  }));
  return { kind: 'table', title: o.title, subtitle: o.subtitle, nameLabel: o.nameLabel, columns, sections, note: o.note, caption: o.caption };
}

/** «12», «7,5» (coma decimal, como en la app). */
export const pointsText = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','));

/** Fila de puntos con medallas (puntos por club de natación, de la temporada o de un encuentro). */
export interface MedalPointsLike {
  id: string;
  rank: number;
  points: number;
  gold: number;
  silver: number;
  bronze: number;
}

export interface MedalPointsShareInput {
  title: string;
  subtitle?: string;
  rows: readonly MedalPointsLike[];
  /** Nombre y color (club borrado: null). */
  who: (id: string) => { name: string; color?: string | null } | null | undefined;
  nameLabel?: string;
  note?: string;
  caption?: string;
}

/** Puntos con oro, plata y bronce (las medallas se quitan si no caben; los puntos, al final y en negrita). */
export function medalPointsShare(o: MedalPointsShareInput): ShareTableSpec {
  return {
    kind: 'table',
    title: o.title,
    subtitle: o.subtitle,
    nameLabel: o.nameLabel ?? 'Club',
    columns: [{ label: 'Oro', optional: true }, { label: 'Plata', optional: true }, { label: 'Bronce', optional: true }, { label: 'Pts', strong: true }],
    sections: [
      {
        rows: o.rows.map((r) => {
          const w = o.who(r.id);
          return { rank: r.rank, name: w?.name ?? '(borrado)', dot: w?.color ?? null, values: [r.gold, r.silver, r.bronze, pointsText(r.points)] };
        }),
      },
    ],
    note: o.note,
    caption: o.caption,
  };
}

export interface LeadersShareInput<R extends { player: string; team: string }> {
  title: string;
  subtitle?: string;
  rows: readonly R[];
  columns: readonly LeaderColumnLike<R>[];
  nameOf: (playerId: string) => string;
  teamOf?: (teamKey: string) => { name: string; color?: string | null } | null | undefined;
  nameLabel?: string;
  limit?: number;
  caption?: string;
}

/**
 * Líderes (anotadores, goleadores): el mismo orden que LeadersTable sin tocar (por la primera columna, luego
 * el nombre) y el mismo puesto compartido cuando empatan. La primera columna va en negrita.
 */
export function leadersShare<R extends { player: string; team: string }>(o: LeadersShareInput<R>): ShareTableSpec {
  const first = o.columns[0];
  const sorted = [...o.rows].sort((a, b) => (first ? first.value(b) - first.value(a) : 0) || o.nameOf(a.player).localeCompare(o.nameOf(b.player), 'es'));
  let rank = 0;
  const rows: ShareRow[] = sorted.slice(0, o.limit ?? sorted.length).map((r, i) => {
    if (i === 0 || !first || first.value(r) !== first.value(sorted[i - 1])) rank = i + 1;
    const team = o.teamOf?.(r.team);
    return {
      rank,
      name: o.nameOf(r.player),
      ...(team ? { sub: team.name, dot: team.color ?? null } : {}),
      values: o.columns.map((c) => (c.show ? plain(c.show(r)) : String(c.value(r)))),
    };
  });
  return {
    kind: 'table',
    title: o.title,
    subtitle: o.subtitle,
    nameLabel: o.nameLabel ?? 'Jugador',
    columns: o.columns.map((c, i) => ({ label: c.label, strong: i === 0, optional: !!c.wide })),
    sections: [{ rows }],
    caption: o.caption,
  };
}
