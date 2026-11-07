import { eventLabel, formatDate } from './format';
import { excelHead as head, type ExcelSheet } from './report/sheets';
import type { Season } from './seasons';
import { entryLine, MIN_RANK_GAMES, playerStats, rank } from './stats';
import type { BowlingEvent, Entry, League, Player } from './types';

/**
 * El Excel de la liga (Tabla › «Excel» en Pro), sin escribir el archivo: qué se puede bajar (la temporada elegida o
 * toda la liga), las hojas (Ranking, Juegos y Eventos) y el nombre del archivo. Lo escriben la web
 * (exportExcel.ts › exportLeagueToExcel, con write-excel-file) y la app del teléfono (sin Blob: movil/…/shareExcel.ts).
 */

/** Qué parte de la liga se descarga: una temporada (fechas) o toda la historia. */
export interface LeagueScope {
  /** "Temporada 2026", "Toda la liga"… (va en el nombre del archivo). */
  label: string;
  from?: string;
  to?: string;
}

/** Un botón de la hoja «Descargar en Excel». */
export interface LeagueExcelScope extends LeagueScope {
  key: 'temporada' | 'todo';
}

export const LEAGUE_EXCEL_TITLE = 'Descargar en Excel';
export const LEAGUE_EXCEL_TEXT = 'La tabla de jugadores, todos los juegos y el resumen de cada práctica y torneo (solo juegos aprobados).';
export const LEAGUE_EXCEL_NOTE = 'Cada práctica o torneo por separado se descarga desde su página (botón de Excel arriba).';
export const EXCEL_DONE = 'Excel descargado';

/**
 * Los botones de la hoja: la temporada elegida en la tabla (sus fechas; la que sigue abierta, hasta hoy) o, sin
 * temporadas, las fechas de la liga; y siempre «Toda la liga».
 */
export function leagueExcelScopes(season: Season | null, league: Pick<League, 'seasonStart' | 'seasonEnd'>): LeagueExcelScope[] {
  return [
    ...(season
      ? [{ key: 'temporada' as const, label: season.name, from: season.startsOn, to: season.status === 'active' ? undefined : (season.endsOn ?? undefined) }]
      : league.seasonStart && league.seasonEnd
        ? [{ key: 'temporada' as const, label: `Temporada (${formatDate(league.seasonStart)} – ${formatDate(league.seasonEnd)})`, from: league.seasonStart, to: league.seasonEnd }]
        : []),
    { key: 'todo', label: 'Toda la liga', from: undefined, to: undefined },
  ];
}

const inScope = (scope: LeagueScope) => (e: Pick<BowlingEvent, 'date'>) => (!scope.from || e.date >= scope.from) && (!scope.to || e.date <= scope.to);

/** Los eventos de esas fechas (solo de esos se traen los juegos, no toda la historia de la liga). */
export function scopeEventIds(events: readonly Pick<BowlingEvent, 'id' | 'date'>[], scope: LeagueScope): string[] {
  return events.filter(inScope(scope)).map((e) => e.id);
}

/** «Liga de Ejemplo - Toda la liga.xlsx» (sin los caracteres que Windows no deja). */
export function leagueExcelFileName(leagueName: string, scope: LeagueScope): string {
  const safe = (s: string) => s.replace(/[/:*?"<>|]+/g, ' ').trim();
  return `${safe(leagueName)} - ${safe(scope.label)}.xlsx`;
}

/**
 * Las hojas de la liga (o una temporada): ranking de jugadores, todos los juegos y el resumen de cada práctica y
 * torneo. Solo cuentan los juegos verificados, igual que el ranking: con posición los que tienen el mínimo de juegos;
 * debajo, sin posición, los que todavía no. Los jugadores borrados no salen.
 */
export function leagueExcelSheets(scope: LeagueScope, allEvents: readonly BowlingEvent[], allEntries: readonly Entry[], players: readonly Player[]): ExcelSheet[] {
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? '(jugador borrado)';
  const events = allEvents.filter(inScope(scope)).sort((a, b) => a.date.localeCompare(b.date));
  const byId = new Map(events.map((e) => [e.id, e]));
  const entries = allEntries.filter((e) => byId.has(e.eventId));
  const lines = entries.map((e) => entryLine(e, byId.get(e.eventId)!)).filter((l) => l.games > 0);
  const maxGames = Math.max(3, ...events.map((e) => e.games));
  const games = Array.from({ length: maxGames }, (_, i) => `J${i + 1}`);

  // Ranking: promedio de la temporada con los juegos verificados.
  const byPlayer = new Map<string, Entry[]>();
  entries.forEach((e) => byPlayer.set(e.playerId, [...(byPlayer.get(e.playerId) ?? []), e]));
  const alive = new Set(players.map((p) => p.id));
  const rows = [...byPlayer.entries()]
    .filter(([playerId]) => alive.has(playerId))
    .map(([playerId, list]) => {
      const s = playerStats(list);
      const played = list.filter((e) => e.scores?.some((sc, i) => sc != null && e.photos?.[i]));
      return {
        playerId,
        stats: s,
        events: played.length,
        practices: played.filter((e) => byId.get(e.eventId)?.type === 'practica').length,
        tournaments: played.filter((e) => byId.get(e.eventId)?.type === 'torneo').length,
      };
    })
    .filter((r) => r.stats.games > 0);
  const average = (r: (typeof rows)[number]) => r.stats.autoAverage ?? 0;
  const ranked = rank(
    rows.filter((r) => r.stats.games >= MIN_RANK_GAMES),
    average,
  );
  const unranked = rows.filter((r) => r.stats.games < MIN_RANK_GAMES).sort((a, b) => average(b) - average(a) || b.stats.games - a.stats.games);
  const rankingRow = (r: (typeof rows)[number], pos: number | undefined) => [
    { value: pos },
    { value: nameOf(r.playerId) },
    { value: average(r), fontWeight: 'bold' as const },
    { value: r.stats.games },
    { value: r.stats.pins },
    { value: r.stats.high },
    { value: r.stats.highSeries || undefined },
    { value: r.events },
    { value: r.practices },
    { value: r.tournaments },
  ];

  return [
    {
      sheet: 'Ranking',
      stickyRowsCount: 1,
      columns: [{ width: 9 }, { width: 28 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 11 }, { width: 10 }, { width: 10 }],
      data: [
        head(['Posición', 'Jugador', 'Promedio', 'Juegos', 'Pinos', 'Mejor juego', 'Mejor serie', 'Eventos', 'Prácticas', 'Torneos']),
        ...ranked.map(({ row: r, pos }) => rankingRow(r, pos)),
        ...(unranked.length
          ? [
              [{ value: undefined }, { value: `Con menos de ${MIN_RANK_GAMES} juegos verificados (todavía sin posición)`, fontWeight: 'bold' as const }],
              ...unranked.map((r) => rankingRow(r, undefined)),
            ]
          : []),
      ],
    },
    {
      sheet: 'Juegos',
      stickyRowsCount: 1,
      columns: [{ width: 12 }, { width: 26 }, { width: 10 }, { width: 28 }, ...games.map(() => ({ width: 8 })), { width: 10 }, { width: 10 }, { width: 8 }],
      data: [
        head(['Fecha', 'Evento', 'Tipo', 'Jugador', ...games, 'Serie', 'Promedio', 'HCP']),
        ...lines
          .sort((a, b) => a.entry.eventId.localeCompare(b.entry.eventId))
          .sort((a, b) => byId.get(a.entry.eventId)!.date.localeCompare(byId.get(b.entry.eventId)!.date) || nameOf(a.entry.playerId).localeCompare(nameOf(b.entry.playerId)))
          .map((l) => {
            const ev = byId.get(l.entry.eventId)!;
            return [
              { value: ev.date },
              { value: eventLabel(ev) },
              { value: ev.type === 'torneo' ? 'Torneo' : 'Práctica' },
              { value: nameOf(l.entry.playerId) },
              ...games.map((_, i) => ({ value: l.scores[i] ?? undefined })),
              { value: l.scratch },
              { value: l.avg, fontWeight: 'bold' as const },
              { value: l.hcp || undefined },
            ];
          }),
      ],
    },
    {
      sheet: 'Eventos',
      stickyRowsCount: 1,
      columns: [{ width: 12 }, { width: 28 }, { width: 10 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 28 }],
      data: [
        head(['Fecha', 'Evento', 'Tipo', 'Jugadores', 'Promedio', 'Mejor juego', 'De quién']),
        ...events.map((ev) => {
          const evLines = lines.filter((l) => l.entry.eventId === ev.id);
          const pins = evLines.reduce((a, l) => a + l.scratch, 0);
          const count = evLines.reduce((a, l) => a + l.games, 0);
          const best = evLines.reduce<(typeof evLines)[number] | null>((b, l) => (!b || l.high > b.high ? l : b), null);
          return [
            { value: ev.date },
            { value: eventLabel(ev) },
            { value: ev.type === 'torneo' ? 'Torneo' : 'Práctica' },
            { value: evLines.length },
            { value: count ? Math.floor(pins / count) : undefined },
            { value: best?.high || undefined },
            { value: best ? nameOf(best.entry.playerId) : '' },
          ];
        }),
      ],
    },
  ];
}
