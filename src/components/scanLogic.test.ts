/** Verificar juegos con foto sin pantalla (scanLogic.ts): emparejar lo leído, filas a mano y lo que se guarda. */
import { describe, expect, it } from 'vitest';
import type { Entry, Player } from '../lib/types';
import { manualScanRow, retargetScanRow, scanGameCells, scanGamesToSave, scanProblems, scanReadLine, scanRowsFrom, scanSaveLabel, scanSavedText, scanValuesOf } from './scanLogic';

const player = (id: string, name: string): Player => ({ id, name, averageOverride: null });
const entry = (playerId: string, scores: (number | null)[], photos: (string | null)[]): Entry => ({
  id: `e-${playerId}`,
  eventId: 'ev-1',
  playerId,
  teamId: null,
  average: 180,
  handicapOverride: null,
  scores,
  photos,
});

describe('scanLogic', () => {
  const uno = player('p1', 'Jugador Uno');
  const dos = player('p2', 'Jugador Dos');
  const tres = player('p3', 'Jugadora Tres');
  const entries = [entry('p1', [150, null, null], ['foto-1', null, null]), entry('p2', [], [])];
  const entryOf = (id: string) => entries.find((e) => e.playerId === id) ?? null;

  it('empareja lo leído con los del evento y después con los demás, sin repetir', () => {
    const found = [
      { name: 'JUGADOR UNO', handicap: null, games: [180, 190], total: 370, matchesTotal: true },
      { name: 'Jugadora Tres', handicap: 10, games: [200, null], total: 200, matchesTotal: false },
    ];
    const rows = scanRowsFrom(found, { participants: [uno, dos], others: [tres], entryOf, games: 3 });
    expect(rows.map((r) => r.playerId)).toEqual(['p1', 'p3']);
    // El primer hueco sin verificar donde caben sus 2 juegos.
    expect(rows[0].start).toBe(1);
    expect(rows[1].values).toEqual(['200', '']);
    expect(rows.every((r) => r.include)).toBe(true);
    expect(scanReadLine(rows[1])).toEqual({ read: 'Jugadora Tres · Hcp 10', check: { ok: false, text: '⚠ la suma no cuadra con el total 200: revisa' } });
  });

  it('con un jugador elegido, solo su fila va marcada', () => {
    const found = [
      { name: 'Jugador Uno', handicap: null, games: [180], total: 180, matchesTotal: null },
      { name: 'Jugador Dos', handicap: null, games: [170], total: 170, matchesTotal: null },
    ];
    const rows = scanRowsFrom(found, { participants: [uno, dos], others: [], entryOf, games: 3, focusPlayerId: 'p2' });
    expect(rows.map((r) => r.include)).toEqual([false, true]);
  });

  it('la fila a mano arranca en el primer juego sin verificar, con lo anotado', () => {
    const row = manualScanRow(entry('p1', [150, 160, null], ['foto-1', null, null]), 3, 'p1');
    expect(row.start).toBe(1);
    expect(row.values).toEqual(['160', '']);
    expect(scanReadLine(row)).toEqual({ read: null, check: null });
    const moved = retargetScanRow(row, 'p2', null, 3);
    expect(moved).toMatchObject({ key: row.key, playerId: 'p2', start: 0, values: ['', '', ''] });
  });

  it('lo que falta, lo que se guarda y los textos', () => {
    const a = { ...manualScanRow(null, 3, 'p1'), values: ['180', '301', ''] };
    const b = { ...manualScanRow(null, 3, 'p1'), values: ['190'] };
    const c = { ...manualScanRow(null, 3, ''), include: false };
    expect(scanProblems([a, b, c])).toEqual(['Hay un jugador repetido en dos filas.', 'Los juegos van de 0 a 300.']);
    expect(scanProblems([{ ...c, include: true }])).toEqual(['Elige el jugador de cada fila marcada.']);
    expect(scanValuesOf({ start: 2, values: ['180', '190'] }, 3)).toEqual({ 2: 180 });
    expect(scanGamesToSave([b, { ...a, values: ['180', '', '200'] }, c], 3)).toBe(3);
    expect(scanSaveLabel(0)).toBe('Guardar');
    expect(scanSaveLabel(1)).toBe('Guardar 1 juego');
    expect(scanSavedText(2)).toBe('2 juegos aprobados');
  });

  it('cada juego de la fila: fuera del evento, distinto de lo anotado y si reemplaza uno verificado', () => {
    const cells = scanGameCells({ start: 1, values: ['200', '210', '220'] }, 3, entry('p1', [150, 190, 210], ['foto-1', 'foto-2', null]));
    expect(cells.map((x) => x.label)).toEqual(['J2', 'J3', 'fuera']);
    expect(cells[0]).toMatchObject({ differs: 'anotado 190', replaces: true });
    expect(cells[1]).toMatchObject({ differs: null, replaces: false });
  });
});
