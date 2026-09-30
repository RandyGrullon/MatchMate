import { describe, expect, it } from 'vitest';
import { resolveRules, RULE_PRESETS } from '../../../../sports/racket';
import { historyLines } from '../match/history';
import { presetOf, rulesText } from './rulesText';

describe('reglas en palabras', () => {
  it('pádel, tenis, pickleball y ping pong', () => {
    expect(rulesText(resolveRules('padel', {}))).toBe('Punto de oro · al mejor de 3 · el 3.º a súper tie-break a 10');
    expect(rulesText(resolveRules('padel', { deuce: 'star', finalSet: 'set' }))).toBe('Star Point (2 ventajas) · al mejor de 3');
    expect(rulesText(resolveRules('tennis', { gamesPerSet: 4 }))).toBe('Con ventaja · al mejor de 3 · sets a 4');
    expect(rulesText(resolveRules('pickleball', {}))).toBe('Dobles · un juego a 11 · ganando por 2 · solo puntúa el que saca');
    expect(rulesText(resolveRules('table_tennis', {}))).toBe('Individual · al mejor de 5 juegos a 11 · ganando por 2 · saque cada 2 puntos');
    expect(rulesText(resolveRules('table_tennis', { doubles: true, bestOf: 7 }))).toBe('Dobles · al mejor de 7 juegos a 11 · ganando por 2 · saque cada 2 puntos');
  });

  it('la plantilla de esas reglas', () => {
    expect(presetOf('padel', resolveRules('padel', {}))?.id).toBe('amateur');
    expect(presetOf('padel', RULE_PRESETS.padel[2].rules)?.id).toBe('star');
    expect(presetOf('padel', resolveRules('padel', { finalTiebreakTo: 7 }))).toBeNull();
    expect(presetOf('table_tennis', resolveRules('table_tennis', {}))?.id).toBe('bo5');
    expect(presetOf('table_tennis', resolveRules('table_tennis', { doubles: true, bestOf: 3 }))?.id).toBe('dobles-bo3');
    expect(presetOf('table_tennis', resolveRules('table_tennis', { doubles: true, bestOf: 7 }))?.id).toBe('dobles-bo7');
  });
});

describe('historial del partido', () => {
  it('en palabras, el más nuevo primero, con quién y la nota', () => {
    const lines = historyLines(
      [
        { at: '2026-10-08T23:00:00Z', by: 'u1', a: 'reschedule', to: { at: '2026-10-10T00:00:00Z', court: 'Cancha 3' } },
        { at: '2026-10-09T01:00:00Z', by: 'u2', a: 'finish', score: '6-4 6-3' },
        { at: '2026-10-09T02:00:00Z', by: 'u1', a: 'correct', from: '6-4 6-3', score: '6-4 6-2', note: 'Se anotó mal' },
        { at: '2026-10-09T03:00:00Z', by: null, a: 'walkover', absent: 2 },
      ],
      (uid) => (uid === 'u1' ? 'Sofi' : null),
      'America/Santo_Domingo',
    );
    expect(lines.map((l) => [l.text, l.who, l.note])).toEqual([
      ['W.O.: no vino el lado 2', null, null],
      ['Resultado corregido: 6-4 6-3 → 6-4 6-2', 'Sofi', 'Se anotó mal'],
      ['Resultado anotado: 6-4 6-3', null, null],
      ['Reprogramado: 09/10 8:00 pm, Cancha 3', 'Sofi', null],
    ]);
  });

  it('el cambio de hora o de lugar con la palabra del deporte («mesa» en ping pong)', () => {
    const items = [{ at: '2026-10-08T23:00:00Z', by: null, a: 'schedule', to: { at: '2026-10-10T00:00:00Z', court: 'Mesa 2' } }];
    expect(historyLines(items, () => null, 'America/Santo_Domingo')[0].text).toBe('Cambió la hora o la cancha: 09/10 8:00 pm, Mesa 2');
    expect(historyLines(items, () => null, 'America/Santo_Domingo', 'mesa')[0].text).toBe('Cambió la hora o la mesa: 09/10 8:00 pm, Mesa 2');
  });
});
