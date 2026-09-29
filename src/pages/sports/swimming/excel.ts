import type { SheetData } from 'write-excel-file/browser';
import { excelHead as head, type ExcelSheet } from '../../../lib/report/sheets';
import { formatSwimTime, GENDER_LABEL, STATUS_LABEL } from '../../../sports/swimming';
import { eventResults, groupLabel, meetScores, publishedHeats, raceName, raceDetail, scores } from './logic';
import type { MeetData } from './MeetPage';

const time = (cs: number | null) => (cs ? formatSwimTime(cs) : 'NT');

/** Lo que usan las hojas del encuentro. */
export type MeetSheetData = Pick<MeetData, 'meet' | 'events' | 'entries' | 'clubs' | 'name'>;

/**
 * Las hojas del Excel del encuentro: hoja de series, resultados por prueba y categoría, y puntos por club. Puro: el
 * reporte del torneo (src/lib/report/swimming.ts) las pone de detalle, después de «General» e «Individual».
 */
export function meetSheets(data: MeetSheetData): ExcelSheet[] {
  const { meet, events, entries, clubs, name } = data;
  const club = (id: string | null) => (id ? (clubs.get(id)?.name ?? '') : '');
  const sheets: ExcelSheet[] = [];

  const heatRows: SheetData = [head(['Prueba', 'Distancia y estilo', 'Sexo y categorías', 'Serie', 'Carril', 'Nadador', 'Club', 'Categoría', 'Siembra'])];
  for (const ev of events) {
    const { heats, unassigned } = publishedHeats(ev, entries, meet.lanes);
    for (const h of heats)
      for (const l of h.lanes)
        if (l.entry)
          heatRows.push([
            { value: ev.num },
            { value: raceName(ev) },
            { value: raceDetail(ev) },
            { value: h.n },
            { value: l.lane },
            { value: name(l.entry.playerId) },
            { value: club(l.entry.clubId) },
            { value: groupLabel(l.entry.ageGroup) },
            { value: time(l.entry.seed) },
          ]);
    for (const e of unassigned)
      heatRows.push([
        { value: ev.num },
        { value: raceName(ev) },
        { value: raceDetail(ev) },
        { value: 'Sin serie' },
        { value: undefined },
        { value: name(e.playerId) },
        { value: club(e.clubId) },
        { value: groupLabel(e.ageGroup) },
        { value: time(e.seed) },
      ]);
  }
  sheets.push({
    sheet: 'Series',
    stickyRowsCount: 1,
    columns: [{ width: 8 }, { width: 18 }, { width: 24 }, { width: 8 }, { width: 8 }, { width: 28 }, { width: 22 }, { width: 12 }, { width: 10 }],
    data: heatRows,
  });

  const points = scores(meet);
  const resRows: SheetData = [head(['Prueba', 'Distancia y estilo', 'Sexo', 'Categoría', 'Puesto', 'Nadador', 'Club', 'Tiempo', 'Estado', ...(points ? ['Puntos'] : [])])];
  for (const ev of events)
    for (const g of eventResults(ev, entries, meet.points))
      for (const r of g.rows)
        resRows.push([
          { value: ev.num },
          { value: raceName(ev) },
          { value: GENDER_LABEL[g.gender] },
          { value: groupLabel(g.ageGroup) },
          { value: r.place ?? undefined },
          { value: name(r.swimmerId) },
          { value: club(r.teamId) },
          { value: r.time ? formatSwimTime(r.time) : '' },
          { value: r.status === 'ok' ? '' : r.status === 'dq' ? 'DQ' : STATUS_LABEL[r.status] },
          ...(points ? [{ value: r.points || undefined }] : []),
        ]);
  sheets.push({
    sheet: 'Resultados',
    stickyRowsCount: 1,
    columns: [{ width: 8 }, { width: 18 }, { width: 12 }, { width: 12 }, { width: 8 }, { width: 28 }, { width: 22 }, { width: 10 }, { width: 12 }, ...(points ? [{ width: 8 }] : [])],
    data: resRows,
  });

  if (points) {
    const s = meetScores(events, entries, meet.points);
    sheets.push({
      sheet: 'Clubes',
      stickyRowsCount: 1,
      columns: [{ width: 8 }, { width: 28 }, { width: 10 }, { width: 8 }, { width: 8 }, { width: 8 }],
      data: [
        head(['Puesto', 'Club', 'Puntos', 'Oro', 'Plata', 'Bronce']),
        ...s.clubs.map((c) => [
          { value: c.rank },
          { value: club(c.teamId) },
          { value: c.points, fontWeight: 'bold' as const },
          { value: c.gold },
          { value: c.silver },
          { value: c.bronze },
        ]),
      ],
    });
  }

  return sheets;
}
