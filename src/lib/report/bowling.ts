import { pendingWarning } from '../../components/event/EventPrizes';
import { bowlingComp, bowlingTitle } from '../../prizes/catalog';
import { bowlingPodium } from '../../prizes/providers';
import { bowlingFinished } from '../../prizes/ready';
import { bowlingEventSheets } from '../exportExcel';
import { eventLabel, num } from '../format';
import { bowlingStandings, category, entryLine, individualRule, teamRule, type Line } from '../stats';
import type { BowlingEvent, Entry, Player } from '../types';
import { podiumsFrom, reportHeader, type ReportColumn, type ReportFact, type ReportLeague, type ReportRow, type TournamentReport } from './model';

/**
 * El reporte de un torneo del boliche, con la clasificación oficial de la app (`bowlingStandings`: solo juegos
 * verificados; equipos e individual, cada uno con su regla) y los podios de los premios (`bowlingPodium`):
 * - General: campeones «Equipos (scratch)» e «Individual (handicap)», resumen y la tabla de equipos con el total de cada
 *   juego;
 * - Individual: cada jugador con sus juegos, serie (scratch), handicap, total con handicap, promedio y mejor juego
 *   (acostada con más de 6 juegos);
 * - Excel: además, la hoja «Equipos» de siempre (exportExcel.ts).
 */

export interface BowlingReportInput {
  lid: string;
  league: ReportLeague;
  event: BowlingEvent;
  entries: readonly Entry[];
  players: readonly Player[];
  /** Hoy en la zona de la liga ('YYYY-MM-DD'): si el torneo ya terminó. */
  today: string;
}

const right = (label: string, extra: Partial<ReportColumn> = {}): ReportColumn => ({ label, align: 'right', width: 9, ...extra });

/** «268 · Ana» (con empate, «268 · Ana y Luis»). */
function bestOf(lines: readonly Line[], value: (l: Line) => number, nameOf: (id: string) => string): string | null {
  const best = Math.max(0, ...lines.map(value));
  if (!best) return null;
  const who = lines.filter((l) => value(l) === best).map((l) => nameOf(l.entry.playerId));
  const names = who.length <= 3 ? who : [...who.slice(0, 3), `${who.length - 3} más`];
  return `${num(best)} · ${names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}` : names[0]}`;
}

export function bowlingReport({ lid, league, event, entries, players, today }: BowlingReportInput): TournamentReport {
  const names = new Map(players.map((p) => [p.id, p.name] as const));
  const nameOf = (id: string) => names.get(id) ?? '(jugador borrado)';
  const mine = entries.filter((e) => e.eventId === event.id);
  const standings = bowlingStandings(event, mine);
  const comp = bowlingComp(lid, event);
  const indRule = individualRule(event);
  const tRule = teamRule(event);
  const hasHcp = event.type === 'torneo' && event.hcpPercent > 0;
  const hasTeams = !!comp.bowling?.hasTeams;
  const teamName = (id: string | null) => (id && event.teams?.[id]?.name) || '';
  const games = Array.from({ length: event.games }, (_, i) => i);
  const lines = standings.individual.map((r) => r.row);

  // Arriba: el formato y con qué se ordena cada tabla (la regla efectiva del torneo).
  const format = [
    `${event.games} ${event.games === 1 ? 'juego' : 'juegos'}`,
    hasHcp ? `Hcp ${event.hcpPercent}% de ${event.hcpBase}` : 'Sin handicap',
    event.teamSize ? `Equipos de ${event.teamSize}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const facts: ReportFact[] = [
    { label: 'Formato', value: format },
    { label: 'Clasificación', value: [hasTeams ? bowlingTitle('equipo', tRule) : null, bowlingTitle('individual', indRule)].filter(Boolean).join(' · ') },
  ];

  const warning = pendingWarning(standings.pending);
  const notes = [...(warning ? [warning] : []), ...(lines.length ? [] : ['Todavía no hay juegos verificados.'])];

  const verifiedGames = lines.reduce((n, l) => n + l.games, 0);
  const pins = lines.reduce((n, l) => n + l.scratch, 0);
  const highlights: ReportFact[] = [];
  if (lines.length) {
    highlights.push({ label: 'Jugadores', value: num(lines.length) });
    if (standings.teams.length) highlights.push({ label: 'Equipos', value: num(standings.teams.length) });
    highlights.push({ label: 'Juegos verificados', value: num(verifiedGames) });
    highlights.push({ label: 'Promedio del torneo', value: num(Math.floor(pins / Math.max(1, verifiedGames))) });
    const high = bestOf(lines, (l) => l.high, nameOf);
    if (high) highlights.push({ label: 'Mejor juego', value: high });
    const series = bestOf(lines, (l) => l.scratch, nameOf);
    if (series && event.games > 1) highlights.push({ label: 'Mejor serie (scratch)', value: series });
  }

  // General: los equipos con el total de cada juego (con la regla de los equipos).
  const teamHcp = tRule === 'hcp';
  const teamColumns: ReportColumn[] = [
    { label: 'Lugar', align: 'center', place: true, width: 7 },
    { label: 'Equipo', width: 24, only: 'excel' },
    { label: 'Integrantes', width: 50, only: 'excel' },
    { label: 'Equipo', only: 'pdf' },
    ...games.map((g) => right(`J${g + 1}`, { width: 8 })),
    right('Scratch', { strong: !teamHcp, width: 10 }),
    ...(hasHcp ? [right('Hcp', { width: 8 }), right('Total', { strong: teamHcp, width: 10 })] : []),
  ];
  const teamRows: ReportRow[] = standings.teams.map(({ row: t, pos }) => {
    const members = t.members.map((m) => nameOf(m.entry.playerId)).join(', ');
    const perGame = games.map((g) => {
      const played = t.members.some((m) => m.scores[g] != null);
      if (!played) return null;
      return teamHcp ? t.perGame[g] : t.members.reduce((s, m) => s + (m.scores[g] ?? 0), 0);
    });
    return [pos, t.name, members, `${t.name}\n${members}`, ...perGame, t.scratch, ...(hasHcp ? [t.hcpTotal, t.total] : [])];
  });

  // Individual: cada jugador con sus juegos y números (las columnas de más, solo en el Excel).
  const indHcp = indRule === 'hcp';
  const individualColumns: ReportColumn[] = [
    { label: '#', align: 'center', place: true, width: 6 },
    { label: 'Jugador', width: 28 },
    ...(hasTeams ? [{ label: 'Equipo', width: 20 }] : []),
    { label: 'Categoría', align: 'center', width: 10, only: 'excel' },
    right('Promedio de entrada', { width: 12, only: 'excel' }),
    ...(hasHcp ? [right('Hcp por juego', { width: 10, only: 'excel' })] : []),
    ...games.map((g) => right(`J${g + 1}`, { width: 7 })),
    right('Juegos', { width: 8, only: 'excel' }),
    right('Serie', { strong: !indHcp, width: 9 }),
    ...(hasHcp ? [right('Hcp', { width: 7 }), right('Total', { strong: indHcp, width: 9 })] : []),
    right('Prom.', { width: 8 }),
    right('Mejor', { width: 8 }),
  ];
  const individualRow = (l: Line, pos: number | null): ReportRow => [
    pos,
    nameOf(l.entry.playerId),
    ...(hasTeams ? [teamName(l.entry.teamId)] : []),
    category(l.entry.average, event.categoryCuts),
    l.entry.average || null,
    ...(hasHcp ? [l.hcp] : []),
    ...games.map((g) => l.scores[g] ?? null),
    l.games,
    l.scratch,
    ...(hasHcp ? [l.hcpTotal, l.total] : []),
    l.avg,
    l.high,
  ];
  // Los que tienen juegos anotados pero ninguno verificado: salen debajo, sin números (todavía no cuentan).
  const waiting = mine
    .map((e) => entryLine(e, event))
    .filter((l) => l.games === 0 && l.pending > 0)
    .sort((a, b) => nameOf(a.entry.playerId).localeCompare(nameOf(b.entry.playerId), 'es'));
  const individualRows: ReportRow[] = [
    ...standings.individual.map(({ row, pos }) => individualRow(row, pos)),
    ...(waiting.length
      ? [
          { group: 'Con juegos por verificar (todavía no cuentan)' },
          ...waiting.map((l) => [null, nameOf(l.entry.playerId), ...(hasTeams ? [teamName(l.entry.teamId)] : [])] as ReportRow),
        ]
      : []),
  ];

  const title = event.name.trim() || (league.kind === 'torneo' ? league.name : eventLabel(event));
  return {
    ...reportHeader(league, { title, dates: event.date, facts }),
    final: bowlingFinished(event, mine, today),
    notes,
    podiums: podiumsFrom(comp, bowlingPodium(event, mine, nameOf, { ready: true, standings })),
    prizes: [],
    highlights,
    general: hasTeams
      ? [
          {
            title: bowlingTitle('equipo', tRule),
            note: `Cada juego suma los pinos de sus jugadores${teamHcp ? ' con su handicap' : ' (sin handicap)'}.`,
            columns: teamColumns,
            rows: teamRows,
            empty: 'Todavía no hay juegos verificados.',
          },
        ]
      : [],
    individual: [
      {
        title: bowlingTitle('individual', indRule),
        note: hasHcp ? 'Serie: los pinos (scratch). Hcp: el handicap de todos sus juegos. Total: serie + handicap.' : 'Serie: los pinos de todos sus juegos.',
        columns: individualColumns,
        rows: individualRows,
        empty: 'Todavía no hay juegos verificados.',
      },
    ],
    individualLandscape: event.games > 6,
    // El detalle de siempre: la hoja «Equipos» (la «Individual» de antes ya va entera en la nueva).
    sheets: bowlingEventSheets(event, mine, players).filter((s) => s.sheet !== 'Individual'),
  };
}
