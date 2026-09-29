/**
 * El reporte del torneo (lo que se baja al final: PDF para WhatsApp o imprimir, y Excel), sin pantalla ni librerías.
 * Cada deporte arma su `TournamentReport` con sus funciones de siempre (sus clasificaciones y los podios de los premios:
 * nada de rankings nuevos) y los dos dibujantes lo pasan a su formato:
 * - pdf.ts: la página «General» (el torneo con todo: campeones, premios, resumen y resultados) y después las páginas
 *   «Individual»;
 * - excel.ts: las hojas «General» e «Individual» y, detrás, las hojas de detalle del deporte (`sheets`).
 *
 * El adaptador de cada deporte (report/bowling.ts es el del boliche) devuelve el reporte sin los premios entregados: esos
 * los pone la hoja del botón (components/tournamentReport) con `prizesFrom`, porque se leen de la base.
 */
import { formatDate, formatDateLong, sportLabel, venueLabel } from '../format';
import type { League } from '../types';
import type { PrizePlace } from '../data/prizes';
import { namesLine } from '../../prizes/award';
import type { CardModel } from '../../prizes/card';
import { PLACE_LABEL, prizeCategories, type PrizeComp } from '../../prizes/catalog';
import type { PodiumProvider } from '../../prizes/providers';
import type { ExcelSheet } from './sheets';

/** Una celda: texto o número (null = vacía). Los números salen con separador de miles en el PDF y como número en el Excel. */
export type ReportCell = string | number | null;

export interface ReportColumn {
  label: string;
  /** Por defecto a la izquierda (los números conviene ponerlos a la derecha). */
  align?: 'left' | 'center' | 'right';
  /** Ancho en el Excel (caracteres). */
  width?: number;
  /** Lo que ordena la tabla: en negrita. */
  strong?: boolean;
  /** La columna del puesto: 1, 2 y 3 con oro, plata y bronce en el PDF. */
  place?: boolean;
  /** Solo en un formato: 'excel' = no sale en el PDF (que va más apretado). */
  only?: ReportFormat;
}

export type ReportFormat = 'pdf' | 'excel';

/** Una fila: sus celdas; o un subtítulo que ocupa todo el ancho («Con menos de 6 juegos…», «Ronda 2»). */
export type ReportRow = readonly ReportCell[] | { readonly group: string } | { readonly cells: readonly ReportCell[]; readonly strong?: boolean };

export interface ReportTable {
  /** «Equipos (scratch)». */
  title?: string;
  /** Una línea debajo del título. */
  note?: string;
  columns: readonly ReportColumn[];
  rows: readonly ReportRow[];
  /** Lo que se dice si no hay filas (sin esto, la tabla vacía no sale). */
  empty?: string;
  /** Solo en un formato. */
  only?: ReportFormat;
}

/** «Fecha: domingo, 12 de octubre de 2026». */
export interface ReportFact {
  label: string;
  value: string;
}

export interface ReportWinner {
  /** El equipo, la pareja, el club o el jugador. */
  name: string;
  /** Sus jugadores («Ana, Luis y Pedro»), si es un equipo. */
  members?: string;
  /** «1,234 pinos», «6-3 6-4»… */
  detail?: string;
}

export interface ReportPlace {
  place: PrizePlace;
  /** «1.er lugar». */
  label: string;
  /** Empatados en ese lugar (vacío: nadie). */
  winners: ReportWinner[];
  /** «Nadie en este lugar», «Empate»… */
  note?: string;
}

/** Los campeones de una categoría: «Equipos (scratch)», «Individual (handicap)», «Parejas · Categoría A»… */
export interface ReportPodium {
  title: string;
  places: ReportPlace[];
}

/** Un lugar premiado con su insignia, y quién la recibió (o «Por entregar»). */
export interface ReportPrizeRow {
  place: PrizePlace;
  label: string;
  badge: string;
  delivered: boolean;
  winners: string[];
}

export interface ReportPrizeSection {
  title: string;
  rows: ReportPrizeRow[];
}

export interface TournamentReport {
  /** El deporte ('bowling'): el color del PDF. */
  sport: string;
  /** «Copa Aniversario». */
  title: string;
  /** «Liga Norte · Boliche». */
  subtitle: string;
  /** Fecha, lugar, formato… */
  facts: ReportFact[];
  /** Logo de la liga (bucket público `logos`), si tiene. */
  logoPath: string | null;
  /** Zona de la liga (la fecha del pie). */
  tz?: string;
  /** El torneo ya terminó: «Resultados finales»; si no, «Resultados parciales». */
  final: boolean;
  /** Avisos arriba («Hay 3 juegos por verificar: pueden cambiar el podio.»). */
  notes: string[];
  /** Los campeones y podios, como los calcula la app (los de los premios). */
  podiums: ReportPodium[];
  /** Los premios elegidos y entregados (los pone la hoja del botón con `prizesFrom`). */
  prizes: ReportPrizeSection[];
  /** «Jugadores: 24», «Mejor juego: 268 · Ana»… */
  highlights: ReportFact[];
  /** Tablas de la página «General» (equipos, resultados, llaves…). */
  general: ReportTable[];
  /** Tablas de las páginas «Individual». */
  individual: ReportTable[];
  /** Las páginas «Individual» van acostadas (muchas columnas). Sin valor: según las columnas. */
  individualLandscape?: boolean;
  /** Hojas de detalle del Excel, después de «General» e «Individual». */
  sheets: ExcelSheet[];
  /** Nombre del archivo, sin extensión ni fecha («Copa Aniversario»). */
  fileName: string;
}

// ---------- Lo común del encabezado ----------

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Los días distintos, en orden (un playoff pasa un día por juego y el golf uno por ronda: se repiten). */
function dayList(dates: string | readonly string[]): string[] {
  return [...new Set((typeof dates === 'string' ? [dates] : dates).filter((d) => /^\d{4}-\d{2}-\d{2}/.test(d)))].sort();
}

/** «Domingo, 12 de octubre de 2026»; con varias fechas, «12 oct 2026 – 14 oct 2026». */
export function datesText(dates: string | readonly string[]): string {
  const list = dayList(dates);
  if (!list.length) return '';
  if (list.length === 1) return capitalize(formatDateLong(list[0]));
  return `${formatDate(list[0])} – ${formatDate(list[list.length - 1])}`;
}

export type ReportLeague = Pick<League, 'name' | 'kind' | 'sport' | 'venue' | 'logoPath' | 'tz'>;

/**
 * Lo de arriba del reporte, igual en todos los deportes: el título, «Liga · Deporte» (en un torneo sin liga, solo el
 * deporte), la fecha (o las fechas), el lugar de la liga («Bolera: …») y lo que agregue el deporte.
 */
export function reportHeader(
  league: ReportLeague,
  o: { title: string; dates: string | readonly string[]; facts?: readonly ReportFact[] },
): Pick<TournamentReport, 'sport' | 'title' | 'subtitle' | 'facts' | 'logoPath' | 'tz' | 'fileName'> {
  const sport = league.sport || 'bowling';
  const title = o.title.trim() || league.name;
  const standalone = league.kind === 'torneo' || league.name.trim() === title;
  const when = datesText(o.dates);
  const facts: ReportFact[] = [];
  // «Fechas» solo con días distintos: todos los juegos el mismo día es «Fecha».
  if (when) facts.push({ label: dayList(o.dates).length > 1 ? 'Fechas' : 'Fecha', value: when });
  if (league.venue?.trim()) facts.push({ label: venueLabel(sport), value: league.venue.trim() });
  facts.push(...(o.facts ?? []));
  return {
    sport,
    title,
    subtitle: [standalone ? null : league.name, sportLabel(sport)].filter(Boolean).join(' · '),
    facts,
    logoPath: league.logoPath || null,
    tz: league.tz,
    fileName: title,
  };
}

// ---------- Campeones ----------

const PLACES: readonly PrizePlace[] = [1, 2, 3];

/**
 * El equipo se llama como sus jugadores («Luis / Ana», la pareja sin nombre propio), en cualquier orden: los jugadores
 * vienen por nombre y la pareja en el orden en que se armó.
 */
function namedAfterPlayers(name: string, names: readonly string[]): boolean {
  const parts = name.split('/').map((n) => n.trim()).filter(Boolean);
  const sorted = (xs: readonly string[]) => [...xs].sort((a, b) => a.localeCompare(b)).join('\n');
  return parts.length > 1 && parts.length === names.length && sorted(parts) === sorted(names);
}

/** Un equipo con sus jugadores; un jugador solo (o la pareja que se llama como ellos), su nombre (como `unitLine`). */
function winnerOf(unit: { name: string; players: readonly { name: string }[]; detail?: string }): ReportWinner {
  const names = unit.players.map((p) => p.name.trim()).filter(Boolean);
  const solo = names.length <= 1 && (!unit.name || names.length === 0 || unit.name === names[0]);
  return {
    name: unit.name || names[0] || '',
    ...(solo || namedAfterPlayers(unit.name, names) ? {} : { members: namesLine(names, 10) }),
    ...(unit.detail ? { detail: unit.detail } : {}),
  };
}

/**
 * Los campeones con el podio de los premios (el mismo `PodiumProvider` de la tarjeta «Premios»): cada categoría que
 * premia la competencia (`prizeCategories`), lugares 1 a 3. Una categoría sin resultado todavía no sale.
 */
export function podiumsFrom(comp: Pick<PrizeComp, 'kind' | 'bowling' | 'racket'>, provider: PodiumProvider): ReportPodium[] {
  const out: ReportPodium[] = [];
  for (const cat of prizeCategories(comp)) {
    const places: ReportPlace[] = [];
    for (const place of PLACES) {
      const r = provider({ category: cat.category, division: cat.division, place });
      if (!r || r.status === 'sin_resultado') continue;
      if (r.status === 'vacio' || !r.units.length) {
        places.push({ place, label: PLACE_LABEL[place], winners: [], note: 'Nadie en este lugar' });
        continue;
      }
      places.push({
        place,
        label: PLACE_LABEL[place],
        winners: r.units.map(winnerOf),
        ...(r.units.length > 1 ? { note: 'Empate' } : {}),
      });
    }
    // Los lugares vacíos del final no dicen nada (2 equipos: no hay 3.º); uno en medio sí (el empate de arriba lo tomó).
    while (places.length && !places[places.length - 1].winners.length) places.pop();
    if (places.length) out.push({ title: cat.title, places });
  }
  return out;
}

// ---------- Premios ----------

/**
 * Los premios de la tarjeta (`cardModel` sin admin: los lugares con su insignia a la vista) en filas: el lugar, la
 * insignia y quién la recibió («Los Strikers · Ana, Luis y Pedro»), o nada si todavía no se entregó.
 */
export function prizesFrom(model: Pick<CardModel, 'state' | 'sections'>, nameOf: (playerId: string) => string): ReportPrizeSection[] {
  if (model.state === 'sin_premios') return [];
  return model.sections
    .map((s) => ({
      title: s.title,
      rows: s.rows.map((r) => ({
        place: r.slot.place,
        label: PLACE_LABEL[r.slot.place],
        badge: r.design?.name ?? 'Insignia',
        delivered: r.delivered,
        winners: r.delivered
          ? r.winners.map((w) => {
              const solo = w.players.length === 1 && !w.teamId && !w.ref.startsWith('c:');
              if (solo) return w.name || nameOf(w.players[0]);
              const names = w.players.map(nameOf);
              return [w.name, names.length > 6 ? namesLine(names, 5) : namesLine(names, names.length)].filter(Boolean).join(' · ');
            })
          : [],
      })),
    }))
    .filter((s) => s.rows.length);
}

// ---------- Tablas ----------

/** Las columnas que salen en un formato, con su posición en las filas. */
export function visibleColumns(table: Pick<ReportTable, 'columns'>, format: ReportFormat): { col: ReportColumn; index: number }[] {
  return table.columns.map((col, index) => ({ col, index })).filter(({ col }) => !col.only || col.only === format);
}

export const isGroupRow = (row: ReportRow): row is { readonly group: string } => !Array.isArray(row) && 'group' in row;

/** Las celdas de una fila (vacío en un subtítulo). */
export const rowCells = (row: ReportRow): readonly ReportCell[] => (Array.isArray(row) ? row : 'cells' in row ? row.cells : []);

/** La fila va en negrita entera. */
export const rowStrong = (row: ReportRow): boolean => !Array.isArray(row) && 'cells' in row && !!row.strong;

/** Las tablas de un formato (sin las vacías que no dicen nada). */
export const tablesFor = (tables: readonly ReportTable[], format: ReportFormat): ReportTable[] =>
  tables.filter((t) => (!t.only || t.only === format) && (t.rows.length > 0 || !!t.empty));

/** «Resultados finales» o «Resultados parciales». */
export const statusText = (report: Pick<TournamentReport, 'final'>): string => (report.final ? 'Resultados finales' : 'Resultados parciales');

/** El reporte con los premios que se leyeron. */
export const withPrizes = (report: TournamentReport, prizes: readonly ReportPrizeSection[]): TournamentReport => ({ ...report, prizes: [...prizes] });
