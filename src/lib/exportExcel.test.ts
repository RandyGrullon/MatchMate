import { describe, expect, it, vi } from 'vitest';
import type { BowlingEvent, Entry, Player } from './types';

// Se captura lo que se escribiría en el Excel (sin crear el archivo).
const written: { sheets: { sheet: string; data: { value?: unknown }[][] }[]; file: string }[] = [];
vi.mock('write-excel-file/browser', () => ({
  default: (sheets: { sheet: string; data: { value?: unknown }[][] }[]) => ({
    toFile: async (file: string) => {
      written.push({ sheets, file });
    },
  }),
}));

const { exportLeagueToExcel } = await import('./exportExcel');

const ev = (id: string, date: string, type: BowlingEvent['type'] = 'practica', games = 3) =>
  ({ id, date, type, name: type === 'torneo' ? 'Copa' : '', games, hcpBase: 230, hcpPercent: 0, teams: {}, playerCount: 0 }) as BowlingEvent;
const entry = (eventId: string, playerId: string, scores: (number | null)[], photos: (string | null)[] = scores.map((s) => (s == null ? null : 'sin-foto'))) =>
  ({ id: `${eventId}_${playerId}`, eventId, playerId, teamId: null, average: 180, handicapOverride: null, scores, photos }) as Entry;
const players = [{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Beto' }] as Player[];
const values = (row: { value?: unknown }[]) => row.map((c) => c.value);

describe('Excel de la liga', () => {
  const events = [ev('p1', '2025-12-09'), ev('p2', '2026-02-03'), ev('t1', '2026-03-10', 'torneo')];
  const entries = [
    entry('p1', 'a', [200, 200, 200]),
    entry('p2', 'a', [180, 190, 170]),
    entry('p2', 'b', [150, 160, null]),
    entry('t1', 'b', [210, 220, 230]),
    // Sin verificar: no cuenta.
    entry('t1', 'a', [300, 300, 300], [null, null, null]),
  ];

  it('temporada: solo esos eventos; ranking por promedio con juegos verificados', async () => {
    written.length = 0;
    await exportLeagueToExcel('Liga Norte', { label: 'Temporada 2026', from: '2026-01-01', to: '2026-12-31' }, events, entries, players);
    const { sheets, file } = written[0];
    expect(file).toBe('Liga Norte - Temporada 2026.xlsx');
    expect(sheets.map((s) => s.sheet)).toEqual(['Ranking', 'Juegos', 'Eventos']);
    const ranking = sheets[0].data.slice(1).map(values);
    // Beto: 150,160,210,220,230 = 970/5 = 194; Ana: 180,190,170 = 180 (los 300 sin verificar no cuentan).
    // Ninguno llega a 6 juegos: salen debajo, sin posición (como en el ranking de la app).
    expect(ranking.map((r) => [r[0], r[1], r[2], r[3], r[5], r[6], r[8], r[9]])).toEqual([
      [undefined, 'Con menos de 6 juegos verificados (todavía sin posición)', undefined, undefined, undefined, undefined, undefined, undefined],
      [undefined, 'Beto', 194, 5, 230, 660, 1, 1],
      [undefined, 'Ana', 180, 3, 190, 540, 1, 0],
    ]);
    const juegos = sheets[1].data.slice(1).map(values);
    expect(juegos.map((r) => [r[0], r[3], r[4], r[5], r[6], r[7], r[8]])).toEqual([
      ['2026-02-03', 'Ana', 180, 190, 170, 540, 180],
      ['2026-02-03', 'Beto', 150, 160, undefined, 310, 155],
      ['2026-03-10', 'Beto', 210, 220, 230, 660, 220],
    ]);
    const eventos = sheets[2].data.slice(1).map(values);
    expect(eventos.map((r) => [r[0], r[2], r[3], r[4], r[5], r[6]])).toEqual([
      ['2026-02-03', 'Práctica', 2, 170, 190, 'Ana'],
      ['2026-03-10', 'Torneo', 1, 220, 230, 'Beto'],
    ]);
  });

  it('toda la liga: todos los eventos', async () => {
    written.length = 0;
    // Un jugador que ya se borró de la liga no sale en el ranking.
    await exportLeagueToExcel('Liga/Norte', { label: 'Toda la liga' }, events, [...entries, entry('p1', 'x', [250, 250, 250])], players);
    expect(written[0].file).toBe('Liga Norte - Toda la liga.xlsx');
    expect(written[0].sheets[2].data.length - 1).toBe(3);
    const ranking = written[0].sheets[0].data.slice(1).map(values);
    // Ana: 200×3 + 180+190+170 = 1140 / 6 = 190, con posición; Beto (5 juegos) debajo, sin posición.
    expect(ranking.map((r) => [r[0], r[1], r[2], r[3]])).toEqual([
      [1, 'Ana', 190, 6],
      [undefined, 'Con menos de 6 juegos verificados (todavía sin posición)', undefined, undefined],
      [undefined, 'Beto', 194, 5],
    ]);
  });
});
