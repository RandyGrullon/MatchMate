import { describe, expect, it } from 'vitest';
import { defaultRules } from '../../sports/racket';
import { autoConfirmText, dayKey, flipScoreText, matchShareText, roundLabel, scoreColumns, statusInfo, whatsappShareUrl, whenText } from './format';
import { pointsResultParser, racketResultParser, tryParse, twoNumbersParser } from './parsers';

const proposed = '2026-10-01T20:00:00.000Z';
const t0 = Date.parse(proposed);

describe('estado del partido', () => {
  it('insignias', () => {
    expect(statusInfo({ status: 'live', proposedAt: null })).toEqual({ label: 'En vivo', tone: 'ok', live: true });
    expect(statusInfo({ status: 'finished', proposedAt: proposed }, t0 + 1000).label).toBe('Por confirmar');
    expect(statusInfo({ status: 'finished', proposedAt: proposed }, t0 + 48 * 3600e3).label).toBe('Final');
    expect(statusInfo({ status: 'disputed', proposedAt: proposed }).tone).toBe('danger');
    expect(statusInfo({ status: 'postponed', proposedAt: null }).label).toBe('Aplazado');
  });

  it('cuenta regresiva de las 48 h', () => {
    expect(autoConfirmText({ status: 'finished', proposedAt: proposed }, t0 + 17 * 3600e3)).toBe('Se confirma solo en 31 h');
    expect(autoConfirmText({ status: 'finished', proposedAt: proposed }, t0 + 48 * 3600e3 - 25 * 60e3)).toBe('Se confirma solo en 25 min');
    expect(autoConfirmText({ status: 'finished', proposedAt: proposed }, t0 + 48 * 3600e3)).toBeNull();
    expect(autoConfirmText({ status: 'confirmed', proposedAt: proposed }, t0)).toBeNull();
  });

  it('fechas en la zona de la liga y rondas', () => {
    // 23:00 UTC = 7:00 p. m. en Santo Domingo.
    expect(whenText('2026-10-05T23:00:00Z', 'America/Santo_Domingo', false)).toMatch(/^7:00\s?p/);
    expect(whenText(null)).toBeNull();
    expect(dayKey('2026-10-06T02:00:00Z')).toBe('2026-10-05');
    expect(roundLabel(3, 'Jornada')).toBe('Jornada 3');
    expect(roundLabel(null)).toBe('');
  });
});

describe('marcador', () => {
  it('columnas por set (con tie-break) o un solo número', () => {
    expect(scoreColumns({ text: '6-4 3-6 7-6(5)' })).toEqual([
      { a: 6, b: 4 },
      { a: 3, b: 6 },
      { a: 7, b: 6, tb: '5' },
    ]);
    expect(scoreColumns({ text: '78-72', sides: [78, 72] })).toEqual([{ a: 78, b: 72 }]);
    expect(scoreColumns({ sides: [2, 1] })).toEqual([{ a: 2, b: 1 }]);
    expect(scoreColumns(null)).toEqual([]);
  });

  it('visto desde el otro lado', () => {
    expect(flipScoreText('4-6 3-6 7-6(5)')).toBe('6-4 6-3 6-7(5)');
  });

  it('texto para WhatsApp', () => {
    const sides = [
      { side: 1 as const, label: 'Ana / Luis' },
      { side: 2 as const, label: 'Otra / Nuevo' },
    ];
    const base = { round: 3, court: 'Cancha 2', stage: '', proposedAt: proposed, walkoverSide: null, sides };
    expect(
      matchShareText({ match: { ...base, status: 'confirmed', score: { text: '4-6 3-6' }, winner: 2 }, title: 'Pádel del jueves', url: 'https://x/l/1' }),
    ).toBe('Pádel del jueves · Ronda 3 · Cancha 2\nGana Otra / Nuevo 6-4 6-3 a Ana / Luis\nhttps://x/l/1');
    expect(matchShareText({ match: { ...base, status: 'finished', score: { text: '6-4 6-3' }, winner: 1 }, now: t0 + 1 })).toBe(
      'Ronda 3 · Cancha 2\nGana Ana / Luis 6-4 6-3 a Otra / Nuevo\n(por confirmar)',
    );
    expect(matchShareText({ match: { ...base, status: 'confirmed', score: { text: '1-1' }, winner: null }, roundWord: 'Jornada' })).toBe(
      'Jornada 3 · Cancha 2\nAna / Luis 1-1 Otra / Nuevo (empate)',
    );
    expect(matchShareText({ match: { ...base, status: 'walkover', score: null, winner: 1, walkoverSide: 2 } })).toBe(
      'Ronda 3 · Cancha 2\nGana Ana / Luis por W.O.: Otra / Nuevo no se presentó',
    );
    expect(whatsappShareUrl('Hola y chao')).toBe('https://wa.me/?text=Hola%20y%20chao');
  });
});

describe('modo «solo resultado»', () => {
  it('dos números (baloncesto, fútbol)', () => {
    const hoops = twoNumbersParser();
    expect(hoops('78-72')).toMatchObject({ score: { text: '78-72', sides: [78, 72] }, winner: 1 });
    expect(hoops(' 70 : 81 ').winner).toBe(2);
    expect(() => hoops('70-70')).toThrow('Aquí no hay empates');
    expect(() => hoops('setenta')).toThrow('Escribe los dos números');
    const football = twoNumbersParser({ allowDraw: true, max: 99 });
    expect(football('2 2')).toMatchObject({ winner: null, summary: 'Empate 2 a 2' });
    expect(() => football('100-1')).toThrow('Cada número va de 0 a 99.');
  });

  it('raqueta con las reglas de la liga (pádel: súper tie-break)', () => {
    const padel = racketResultParser(defaultRules('padel'));
    const r = padel('6-4 3-6 10-7');
    expect(r.winner).toBe(1);
    expect(r.score).toMatchObject({ sides: [2, 1], totals: { sets: [2, 1] } });
    expect(r.score.text).toContain('6-4');
    expect(tryParse(padel, '6-4')).toMatchObject({ ok: false });
    expect(tryParse(padel, 'seis cuatro')).toMatchObject({ ok: false, error: expect.stringContaining('No entiendo') });
    const pickle = racketResultParser(defaultRules('pickleball'));
    expect(pickle('11-7').winner).toBe(1);
  });

  it('americano: los puntos suman el total', () => {
    const p = pointsResultParser({ mode: 'total', target: 24 });
    expect(p('15-9')).toMatchObject({ score: { sides: [15, 9] }, winner: 1 });
    expect(p('12-12').winner).toBeNull();
    expect(() => p('15-10')).toThrow('deben sumar 24');
  });
});
