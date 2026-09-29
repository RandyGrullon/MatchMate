import { describe, expect, it } from 'vitest';
import { rowCells, visibleColumns, type ReportRow, type ReportTable } from './model';
import { bowlingReport } from './bowling';
import { bowlingEvent, ENTRIES, entry, LEAGUE, PLAYERS } from './fixtures';

const make = (over: Partial<Parameters<typeof bowlingReport>[0]> = {}) =>
  bowlingReport({ lid: 'L1', league: LEAGUE, event: bowlingEvent(), entries: ENTRIES, players: PLAYERS, today: '2026-10-13', ...over });

/** Las filas de una tabla como las ve un formato (solo sus columnas). */
const view = (t: ReportTable, format: 'pdf' | 'excel') => {
  const cols = visibleColumns(t, format);
  return {
    head: cols.map((c) => c.col.label),
    rows: t.rows.map((r: ReportRow) => ('group' in r ? r.group : cols.map((c) => rowCells(r)[c.index] ?? null))),
  };
};

describe('reporte del boliche', () => {
  it('arriba: título, liga, fecha, bolera, formato y la regla de cada tabla', () => {
    const r = make();
    expect(r.title).toBe('Copa Aniversario');
    expect(r.subtitle).toBe('Liga Norte · Boliche');
    expect(r.sport).toBe('bowling');
    expect(r.facts.map((f) => f.label)).toEqual(['Fecha', 'Bolera', 'Formato', 'Clasificación']);
    expect(r.facts[0].value).toMatch(/^Lunes, 12 de octubre de 2026$/i);
    expect(r.facts[1].value).toBe('Bowling Center');
    expect(r.facts[2].value).toBe('3 juegos · Hcp 80% de 220 · Equipos de 2');
    expect(r.facts[3].value).toBe('Equipos (scratch) · Individual (handicap)');
  });

  it('campeones con el podio de los premios: equipos por scratch e individual con handicap', () => {
    const r = make();
    expect(r.podiums.map((p) => p.title)).toEqual(['Equipos (scratch)', 'Individual (handicap)']);
    const [teams, individual] = r.podiums;
    expect(teams.places.map((p) => [p.label, p.winners.map((w) => [w.name, w.members, w.detail])])).toEqual([
      ['1.er lugar', [['Strikers', 'Ana y Beto', '1125 pinos']]],
      ['2.º lugar', [['Spares', 'Carla y Dani', '930 pinos']]],
    ]);
    expect(individual.places.map((p) => [p.place, p.winners.map((w) => [w.name, w.members, w.detail])])).toEqual([
      [1, [['Ana', undefined, '648 pinos']]],
      [2, [['Carla', undefined, '624 pinos']]],
      [3, [['Beto', undefined, '621 pinos']]],
    ]);
  });

  it('un juego sin verificar: aviso y «Resultados parciales»', () => {
    const r = make();
    expect(r.final).toBe(false);
    expect(r.notes).toEqual(['Hay 1 juego por verificar: puede cambiar el podio.']);
    // Todo verificado y ya pasó el día: finales.
    const done = make({ entries: ENTRIES.slice(0, 4) });
    expect(done.final).toBe(true);
    expect(done.notes).toEqual([]);
    // El mismo día, con juegos que faltan: todavía parciales.
    const sameDay = make({ entries: [...ENTRIES.slice(0, 3), entry('d', 'T2', 150, [140, null, null])], today: '2026-10-12' });
    expect(sameDay.final).toBe(false);
  });

  it('resumen: jugadores, equipos, juegos, promedio, mejor juego y mejor serie', () => {
    const r = make();
    expect(r.highlights).toEqual([
      { label: 'Jugadores', value: '4' },
      { label: 'Equipos', value: '2' },
      { label: 'Juegos verificados', value: '12' },
      // (600 + 525 + 480 + 450) / 12 = 171,25
      { label: 'Promedio del torneo', value: '171' },
      { label: 'Mejor juego', value: '210 · Ana' },
      { label: 'Mejor serie (scratch)', value: '600 · Ana' },
    ]);
  });

  it('General: la tabla de equipos con el total de cada juego (por scratch, la regla de los equipos)', () => {
    const [teams] = make().general;
    expect(teams.title).toBe('Equipos (scratch)');
    const pdf = view(teams, 'pdf');
    expect(pdf.head).toEqual(['Lugar', 'Equipo', 'J1', 'J2', 'J3', 'Scratch', 'Hcp', 'Total']);
    expect(pdf.rows).toEqual([
      [1, 'Strikers\nAna, Beto', 390, 360, 375, 1125, 144, 1269],
      [2, 'Spares\nCarla, Dani', 290, 310, 330, 930, 312, 1242],
    ]);
    const excel = view(teams, 'excel');
    expect(excel.head).toEqual(['Lugar', 'Equipo', 'Integrantes', 'J1', 'J2', 'J3', 'Scratch', 'Hcp', 'Total']);
    expect(excel.rows[0].slice(0, 3)).toEqual([1, 'Strikers', 'Ana, Beto']);
    // Lo que ordena, en negrita: el scratch.
    expect(teams.columns.find((c) => c.label === 'Scratch')?.strong).toBe(true);
    expect(teams.columns.find((c) => c.label === 'Total')?.strong).toBeFalsy();
  });

  it('con los equipos por handicap, cada juego lleva el handicap de sus jugadores', () => {
    const [teams] = make({ event: bowlingEvent({ teamRankBy: 'hcp' }) }).general;
    expect(teams.title).toBe('Equipos (handicap)');
    // Strikers: 390 + 16 + 32 = 438; Spares: 290 + 48 + 56 = 394 (y ahora gana Strikers igual: 1269 contra 1242).
    expect(view(teams, 'pdf').rows.map((r) => (r as unknown[]).slice(0, 5))).toEqual([
      [1, 'Strikers\nAna, Beto', 438, 408, 423],
      [2, 'Spares\nCarla, Dani', 394, 414, 434],
    ]);
  });

  it('Individual: juegos, serie, handicap, total, promedio y mejor juego; los que esperan verificación, debajo', () => {
    const r = make();
    const [ind] = r.individual;
    expect(ind.title).toBe('Individual (handicap)');
    const pdf = view(ind, 'pdf');
    expect(pdf.head).toEqual(['#', 'Jugador', 'Equipo', 'J1', 'J2', 'J3', 'Serie', 'Hcp', 'Total', 'Prom.', 'Mejor']);
    expect(pdf.rows).toEqual([
      [1, 'Ana', 'Strikers', 210, 190, 200, 600, 48, 648, 200, 210],
      [2, 'Carla', 'Spares', 150, 160, 170, 480, 144, 624, 160, 170],
      [3, 'Beto', 'Strikers', 180, 170, 175, 525, 96, 621, 175, 180],
      [4, 'Dani', 'Spares', 140, 150, 160, 450, 168, 618, 150, 160],
      'Con juegos por verificar (todavía no cuentan)',
      [null, 'Eva', '', null, null, null, null, null, null, null, null],
    ]);
    const excel = view(ind, 'excel');
    expect(excel.head).toEqual(['#', 'Jugador', 'Equipo', 'Categoría', 'Promedio de entrada', 'Hcp por juego', 'J1', 'J2', 'J3', 'Juegos', 'Serie', 'Hcp', 'Total', 'Prom.', 'Mejor']);
    expect(excel.rows[0]).toEqual([1, 'Ana', 'Strikers', 'A', 200, 16, 210, 190, 200, 3, 600, 48, 648, 200, 210]);
    expect(ind.columns.find((c) => c.label === 'Total')?.strong).toBe(true);
    expect(r.individualLandscape).toBe(false);
  });

  it('sin handicap ni equipos: solo scratch, sin la tabla de equipos', () => {
    const r = make({ event: bowlingEvent({ hcpPercent: 0, teams: {}, teamSize: 0 }), entries: ENTRIES.map((e) => ({ ...e, teamId: null })) });
    expect(r.podiums.map((p) => p.title)).toEqual(['Individual (scratch)']);
    expect(r.general).toEqual([]);
    expect(view(r.individual[0], 'pdf').head).toEqual(['#', 'Jugador', 'J1', 'J2', 'J3', 'Serie', 'Prom.', 'Mejor']);
    expect(r.facts.find((f) => f.label === 'Formato')?.value).toBe('3 juegos · Sin handicap');
  });

  it('más de 6 juegos: las páginas «Individual» van acostadas', () => {
    expect(make({ event: bowlingEvent({ games: 7 }) }).individualLandscape).toBe(true);
  });

  it('Excel: la hoja «Equipos» de siempre como detalle (la «Individual» de antes va en la nueva)', () => {
    expect(make().sheets.map((s) => s.sheet)).toEqual(['Equipos']);
  });

  it('torneo sin liga y sin nombre: el nombre del torneo', () => {
    const r = make({ league: { ...LEAGUE, kind: 'torneo', name: 'Open de Verano' }, event: bowlingEvent({ name: '' }) });
    expect(r.title).toBe('Open de Verano');
    expect(r.subtitle).toBe('Boliche');
  });

  it('sin juegos verificados: sin campeones y con aviso', () => {
    const r = make({ entries: [ENTRIES[4]] });
    expect(r.podiums).toEqual([]);
    expect(r.notes).toContain('Todavía no hay juegos verificados.');
    expect(r.highlights).toEqual([]);
  });
});
