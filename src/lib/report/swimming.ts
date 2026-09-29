import { num } from '../format';
import { meetSheets, type MeetSheetData } from '../../pages/sports/swimming/excel';
import { eventResults, groupLabel, meetScores, placedMeet, raceName, scores } from '../../pages/sports/swimming/logic';
import { swimComp, swimProvider } from '../../prizes/sports';
import { GENDER_LABEL, STATUS_LABEL, formatSwimTime, swimmerPoints } from '../../sports/swimming';
import type { SwimStatus } from '../../sports/swimming';
import { numCol } from './matches';
import { podiumsFrom, reportHeader, type ReportColumn, type ReportFact, type ReportLeague, type ReportRow, type ReportTable, type TournamentReport } from './model';

/**
 * El reporte de un encuentro de natación (MeetPage), con los puestos y puntos de la app (`eventResults`,
 * `meetScores`, `swimmerPoints`) y los podios de los premios (`swimProvider`: clubes y nadador del encuentro, general,
 * femenino y masculino). El control de marcas no tiene premios ni puntos: solo tiempos.
 * - General: campeones, los puntos por club con sus medallas y los resultados de cada prueba por sexo y categoría;
 * - Individual: el nadador del encuentro (puntos y medallas) y los resultados de cada nadador;
 * - Excel: además, las hojas de siempre (series, resultados y clubes).
 */

export interface SwimReportInput {
  lid: string;
  league: ReportLeague;
  /** El nombre de la pantalla (`meetTitle`). */
  title: string;
  data: MeetSheetData;
}

const MEET_TYPE: Record<string, string> = { encuentro: 'Encuentro', torneo: 'Torneo', control: 'Control de marcas' };

const timeText = (cs: number | null) => (cs ? formatSwimTime(cs) : null);
const statusText = (s: SwimStatus) => (s === 'ok' ? null : s === 'dq' ? 'DQ' : STATUS_LABEL[s]);
const round2 = (n: number) => Math.round(n * 100) / 100;

export function swimReport(input: SwimReportInput): TournamentReport {
  const { lid, league, data } = input;
  const { meet, events, entries, clubs, name } = data;
  const club = (id: string | null | undefined) => (id ? (clubs.get(id)?.name ?? '(club borrado)') : '');
  const points = scores(meet);
  const final = !!meet.finalizedAt;
  const ordered = [...events].sort((a, b) => a.num - b.num);
  const placed = placedMeet(events, entries, meet.points);
  const swum = entries.filter((e) => e.resultAt != null || e.time != null || e.status !== 'ok');
  const comp = swimComp(lid, meet);

  const facts: ReportFact[] = [
    { label: 'Tipo', value: MEET_TYPE[meet.type] ?? 'Encuentro' },
    // La piscina de la liga con sus medidas (en una sola línea).
    { label: 'Piscina', value: [league.venue?.trim(), `${meet.pool} m`, `${meet.lanes} carriles`].filter(Boolean).join(' · ') },
    { label: 'Pruebas', value: num(events.length) },
    ...(points && meet.points.length ? [{ label: 'Puntos por puesto', value: meet.points.join('-') }] : []),
  ];

  const highlights: ReportFact[] = [
    { label: 'Nadadores', value: num(new Set(swum.map((e) => e.playerId)).size) },
    { label: 'Clubes', value: num(new Set(swum.map((e) => e.clubId).filter(Boolean)).size) },
    { label: 'Salidas con resultado', value: num(swum.length) },
  ];

  // General: los clubes (puntos y medallas) y los resultados de cada prueba, por sexo y categoría.
  const general: ReportTable[] = [];
  if (points) {
    general.push({
      title: 'Clubes',
      note: 'Puntos de todas las pruebas; empates en un puesto reparten los puntos.',
      columns: [
        { label: 'Lugar', align: 'center', place: true, width: 7 },
        { label: 'Club', width: 30 },
        numCol('Puntos', { strong: true, width: 10 }),
        numCol('Oro'),
        numCol('Plata'),
        numCol('Bronce'),
      ],
      rows: meetScores(events, entries, meet.points).clubs.map((c) => [c.rank, club(c.teamId), round2(c.points), c.gold, c.silver, c.bronze]),
      empty: 'Todavía no hay resultados.',
    });
  }
  const resultColumns: ReportColumn[] = [
    { label: 'Lugar', align: 'center', place: true, width: 7 },
    { label: 'Nadador', width: 28 },
    { label: 'Club', width: 22 },
    { label: 'Tiempo', align: 'right', width: 10 },
    ...(points ? [numCol('Pts', { width: 7 })] : []),
    { label: 'Estado', width: 12 },
    numCol('Serie', { only: 'excel' }),
    numCol('Carril', { only: 'excel' }),
  ];
  const resultRows: ReportRow[] = [];
  for (const ev of ordered) {
    for (const g of eventResults(ev, entries, meet.points)) {
      resultRows.push({ group: [`Prueba ${ev.num}`, raceName(ev), GENDER_LABEL[g.gender], groupLabel(g.ageGroup)].join(' · ') });
      for (const r of g.rows) {
        resultRows.push([r.place, name(r.swimmerId), club(r.teamId) || null, timeText(r.time), ...(points ? [r.place != null ? round2(r.points) : null] : []), statusText(r.status), r.heat, r.lane]);
      }
    }
  }
  general.push({ title: 'Resultados', note: 'Puesto por tiempo dentro de cada sexo y categoría.', columns: resultColumns, rows: resultRows, empty: 'Todavía no hay resultados.' });

  // Individual: el nadador del encuentro y lo de cada nadador, prueba por prueba.
  const individual: ReportTable[] = [];
  const clubOf = new Map<string, string | null>();
  for (const e of entries) if (!clubOf.has(e.playerId) || (!clubOf.get(e.playerId) && e.clubId)) clubOf.set(e.playerId, e.clubId);
  if (points) {
    const list = swimmerPoints(placed);
    const count = (id: string) => placed.filter((r) => r.swimmerId === id).length;
    individual.push({
      title: 'Nadador del encuentro',
      note: 'Puntos de todas sus pruebas; desempate por oros y luego platas.',
      columns: [
        { label: '#', align: 'center', place: true, width: 6 },
        { label: 'Nadador', width: 28 },
        { label: 'Club', width: 22 },
        numCol('Pruebas', { width: 9 }),
        numCol('Oro'),
        numCol('Plata'),
        numCol('Bronce'),
        numCol('Puntos', { strong: true, width: 10 }),
      ],
      rows: list.map((s) => [s.rank, name(s.swimmerId), club(clubOf.get(s.swimmerId)) || null, count(s.swimmerId), s.gold, s.silver, s.bronze, round2(s.points)]),
      empty: 'Todavía no hay resultados.',
    });
  }
  const bySwimmer = new Map<string, ReportRow[]>();
  const evById = new Map(events.map((e) => [e.id, e] as const));
  for (const r of [...placed].sort((a, b) => (evById.get(a.swimEventId)?.num ?? 0) - (evById.get(b.swimEventId)?.num ?? 0))) {
    const ev = evById.get(r.swimEventId);
    if (!ev || !r.swimmerId) continue;
    const rows = bySwimmer.get(r.swimmerId) ?? [];
    rows.push([`${ev.num}. ${raceName(ev)}`, groupLabel(r.ageGroup), timeText(r.time), r.place, ...(points ? [r.place != null ? round2(r.points) : null] : []), statusText(r.status)]);
    bySwimmer.set(r.swimmerId, rows);
  }
  const swimmers = [...bySwimmer.keys()].sort((a, b) => name(a).localeCompare(name(b), 'es'));
  individual.push({
    title: 'Resultados por nadador',
    columns: [
      { label: 'Prueba', width: 26 },
      { label: 'Categoría', width: 12 },
      { label: 'Tiempo', align: 'right', width: 10 },
      { label: 'Lugar', align: 'center', place: true, width: 7 },
      ...(points ? [numCol('Pts', { width: 7 })] : []),
      { label: 'Estado', width: 12 },
    ],
    rows: swimmers.flatMap((id): ReportRow[] => [{ group: [name(id), club(clubOf.get(id))].filter(Boolean).join(' · ') }, ...(bySwimmer.get(id) ?? [])]),
    empty: 'Todavía no hay resultados.',
  });

  return {
    ...reportHeader({ ...league, venue: '' }, { title: input.title, dates: meet.date, facts }),
    final,
    notes: final ? [] : ['El encuentro todavía no se finaliza: los resultados pueden cambiar.'],
    podiums: comp ? podiumsFrom(comp, swimProvider(placed, { swimmer: name, club: (id) => club(id) })) : [],
    prizes: [],
    highlights,
    general,
    individual,
    // El detalle de siempre: la hoja de series, los resultados y los clubes.
    sheets: meetSheets(data),
  };
}
