import { mostImproved, rankingRows, totalsByPlayer, type Improvement, type RankingRow } from '../lib/bowlingSeason';
import type { Season } from '../lib/seasons';
import { MIN_RANK_GAMES } from '../lib/stats';
import type { Entry, Player } from '../lib/types';
import type { ShareTableSpec } from '../components/share/cards';
import { cellText, hcpFormula, playedEvents, type Hcp, type Metric, type SortKey, type TableRow } from '../components/ranking/logic';

/**
 * Lo de la Tabla de la liga (RankingPage) que no es pantalla: los números de la temporada con el más mejorado, la
 * píldora «Temporada ▾», el vacío «Todavía no sale nadie» y la imagen de la tabla de Pro para compartir. Lo usa también
 * la app del teléfono (movil/src/components/bowling/RankingPro.tsx).
 */

/** Las columnas que van en la imagen para compartir la tabla de Pro (las que no caben se quitan, menos la ordenada). */
export const SHARE_COLUMNS: readonly { key: SortKey; label: string }[] = [
  { key: 'juegos', label: 'J' },
  { key: 'promedio', label: 'Prom.' },
  { key: 'hcp', label: 'Hcp' },
  { key: 'juego', label: 'Alto' },
  { key: 'serie', label: 'Serie' },
  { key: 'asistencia', label: 'Asist.' },
];

/** La última opción de «Temporada 2026 ▾»: lleva al historial de temporadas (campeones y tablas guardadas). */
export const ALL_SEASONS = 'todas';

/** Las opciones de «Temporada ▾» (Pro): cada temporada («(en curso)» la de ahora) y «Ver todas las temporadas…». */
export function seasonPillOptions(seasons: readonly Pick<Season, 'id' | 'name' | 'status'>[]): { key: string; label: string; option: string }[] {
  return [
    ...seasons.map((s) => ({ key: s.id, label: s.name, option: `${s.name}${s.status === 'active' ? ' (en curso)' : ''}` })),
    { key: ALL_SEASONS, label: 'Temporadas', option: 'Ver todas las temporadas…' },
  ];
}

/**
 * Los números de la temporada: las filas de la tabla (solo los juegos de la temporada), el más mejorado contra la
 * anterior (con su nombre; los jugadores borrados no salen) y cuántas fechas se jugaron (el «/3» de la asistencia).
 */
export function seasonTables({
  entries,
  players,
  seasonIds,
  prevIds,
  hasPrev,
}: {
  entries: readonly Entry[];
  players: readonly Pick<Player, 'id' | 'name'>[];
  seasonIds: readonly string[];
  prevIds: readonly string[];
  hasPrev: boolean;
}): { rows: RankingRow[]; improved: (Improvement & { name: string })[]; played: number } {
  const inSeason = new Set(seasonIds);
  const inPrev = new Set(prevIds);
  const current = entries.filter((e) => inSeason.has(e.eventId));
  const names = new Map(players.map((p) => [p.id, p.name]));
  const up = hasPrev ? mostImproved(totalsByPlayer(current), totalsByPlayer(entries.filter((e) => inPrev.has(e.eventId)))) : [];
  return {
    rows: rankingRows(current, players),
    improved: up.filter((u) => names.has(u.playerId)).map((u) => ({ ...u, name: names.get(u.playerId)! })),
    played: playedEvents(current),
  };
}

/** El vacío dice el mínimo de juegos si la lista va por promedio (en Pro, también por handicap y por nombre). */
export function byMinimumOf(pro: boolean, sort: SortKey, metric: Metric): boolean {
  return pro ? sort === 'promedio' || sort === 'hcp' || sort === 'nombre' : metric === 'promedio';
}

/** La línea de «Todavía no sale nadie». */
export function emptyRankingText(byMinimum: boolean, seasonName: string): string {
  return byMinimum ? `Hace falta tener al menos ${MIN_RANK_GAMES} juegos aprobados en ${seasonName}.` : 'Aún no hay juegos aprobados.';
}

/** Imagen de la tabla que se ve (temporada, columna ordenada y con o sin hcp) para mandar al grupo. */
export function rankingShareCard({
  leagueName,
  season,
  sort,
  withHcp,
  hcp,
  table,
  played,
}: {
  leagueName: string;
  season: Pick<Season, 'name'> | null;
  sort: SortKey;
  withHcp: boolean;
  hcp: Hcp;
  table: readonly TableRow[];
  played: number;
}): ShareTableSpec {
  const strong: SortKey = sort === 'nombre' ? 'promedio' : sort;
  const byAverage = strong === 'promedio' || strong === 'hcp';
  return {
    kind: 'table',
    title: leagueName,
    subtitle: `Tabla${season ? ` · ${season.name}` : ''}${withHcp ? ' · Con hcp' : ''}`,
    nameLabel: 'Jugador',
    columns: SHARE_COLUMNS.map((c) => ({ label: c.label, strong: c.key === strong, optional: c.key !== strong && c.key !== 'juegos' })),
    sections: [{ rows: table.map((t) => ({ rank: t.pos, name: t.row.name, values: SHARE_COLUMNS.map((c) => cellText(t, c.key, played)) })) }],
    note: ['Solo juegos aprobados.', byAverage ? `Mínimo ${MIN_RANK_GAMES} juegos en la temporada.` : null, withHcp ? `${hcpFormula(hcp)}.` : null].filter(Boolean).join(' '),
  };
}
