import type { SheetData } from 'write-excel-file/browser';
import { eventLabel } from './format';
import { category, entryLine, MIN_RANK_GAMES, playerStats, rank, teamLines } from './stats';
import type { BowlingEvent, Entry, Player } from './types';

const head = (labels: string[]) => labels.map((value) => ({ value, fontWeight: 'bold' as const, backgroundColor: '#E8E7FB' }));

/**
 * Descarga el torneo (o la práctica) en Excel, como el del torneo 2025: hoja individual y hoja de equipos.
 * Solo cuentan los juegos verificados, igual que la clasificación.
 */
export async function exportEventToExcel(event: BowlingEvent, entries: Entry[], players: Player[]) {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? '(jugador borrado)';
  const isTorneo = event.type === 'torneo';
  const lines = entries.map((e) => entryLine(e, event)).filter((l) => l.games > 0);
  const games = Array.from({ length: event.games }, (_, i) => `Juego ${i + 1}`);
  const sheets: { data: SheetData; sheet: string; columns: { width: number }[]; stickyRowsCount: number }[] = [];

  if (isTorneo) {
    const useHcp = event.hcpPercent > 0 && (event.individualRankBy ?? 'hcp') === 'hcp';
    const teamName = (id: string | null) => (id && event.teams?.[id]?.name) || '';
    const ranked = rank(lines, (l) => (useHcp ? l.total : l.scratch));
    sheets.push({
      sheet: 'Individual',
      stickyRowsCount: 1,
      columns: [{ width: 9 }, { width: 28 }, { width: 22 }, { width: 10 }, { width: 10 }, { width: 8 }, ...games.map(() => ({ width: 9 })), { width: 14 }, { width: 14 }],
      data: [
        head(['Posición', 'Jugador', 'Equipo', 'Categoría', 'Promedio', 'HCP', ...games, 'Total scratch', 'Total con HCP']),
        ...ranked.map(({ row: l, pos }) => [
          { value: pos },
          { value: nameOf(l.entry.playerId) },
          { value: teamName(l.entry.teamId) },
          { value: category(l.entry.average, event.categoryCuts) },
          { value: l.entry.average },
          { value: l.hcp },
          ...l.scores.map((s) => ({ value: s ?? undefined })),
          { value: l.scratch },
          { value: l.total, fontWeight: 'bold' as const },
        ]),
      ],
    });

    const teamHcp = event.hcpPercent > 0 && (event.teamRankBy ?? 'scratch') === 'hcp';
    const teams = rank(
      teamLines(event, lines).filter((t) => t.members.length),
      (t) => (teamHcp ? t.total : t.scratch),
    );
    if (teams.length) {
      sheets.push({
        sheet: 'Equipos',
        stickyRowsCount: 1,
        columns: [{ width: 9 }, { width: 24 }, { width: 60 }, ...games.map(() => ({ width: 9 })), { width: 14 }, { width: 8 }, { width: 14 }],
        data: [
          head(['Lugar', 'Equipo', 'Integrantes', ...games, 'Total scratch', 'HCP', 'Total con HCP']),
          ...teams.map(({ row: t, pos }) => [
            { value: pos },
            { value: t.name, fontWeight: 'bold' as const },
            { value: t.members.map((m) => nameOf(m.entry.playerId)).join(', ') },
            ...t.perGame.map((_, g) => ({ value: t.members.reduce((s, m) => s + (m.scores[g] ?? 0), 0) })),
            { value: t.scratch, fontWeight: teamHcp ? undefined : ('bold' as const) },
            { value: t.hcpTotal },
            { value: t.total, fontWeight: teamHcp ? ('bold' as const) : undefined },
          ]),
        ],
      });
    }
  } else {
    const ranked = rank(lines, (l) => l.avg);
    sheets.push({
      sheet: 'Resultados',
      stickyRowsCount: 1,
      columns: [{ width: 9 }, { width: 28 }, ...games.map(() => ({ width: 9 })), { width: 10 }, { width: 10 }, { width: 10 }],
      data: [
        head(['Posición', 'Jugador', ...games, 'Total', 'Promedio', 'Mejor']),
        ...ranked.map(({ row: l, pos }) => [
          { value: pos },
          { value: nameOf(l.entry.playerId) },
          ...l.scores.map((s) => ({ value: s ?? undefined })),
          { value: l.scratch },
          { value: l.avg, fontWeight: 'bold' as const },
          { value: l.high },
        ]),
      ],
    });
  }

  await writeExcelFile(sheets).toFile(`${eventLabel(event)} - ${event.date}.xlsx`);
}

/** Qué parte de la liga se descarga: una temporada (fechas) o toda la historia. */
export interface LeagueScope {
  /** "Temporada 2026", "Toda la liga"… (va en el nombre del archivo). */
  label: string;
  from?: string;
  to?: string;
}

/**
 * Descarga la liga (o una temporada) en Excel: ranking de jugadores, todos los juegos y el resumen de
 * cada práctica y torneo. Solo cuentan los juegos verificados, igual que el ranking: con posición los que
 * tienen el mínimo de juegos; debajo, sin posición, los que todavía no. Los jugadores borrados no salen.
 */
export async function exportLeagueToExcel(
  leagueName: string,
  scope: LeagueScope,
  allEvents: BowlingEvent[],
  allEntries: Entry[],
  players: Player[],
) {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? '(jugador borrado)';
  const events = allEvents
    .filter((e) => (!scope.from || e.date >= scope.from) && (!scope.to || e.date <= scope.to))
    .sort((a, b) => a.date.localeCompare(b.date));
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

  const sheets: { data: SheetData; sheet: string; columns: { width: number }[]; stickyRowsCount: number }[] = [
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

  const safe = (s: string) => s.replace(/[\/:*?"<>|]+/g, ' ').trim();
  await writeExcelFile(sheets).toFile(`${safe(leagueName)} - ${safe(scope.label)}.xlsx`);
}
