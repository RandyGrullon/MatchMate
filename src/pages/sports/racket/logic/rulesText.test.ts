import { describe, expect, it } from 'vitest';
import { resolveRules, RULE_PRESETS } from '../../../../sports/racket';
import { historyLines } from '../match/history';
import { presetOf, rulesText } from './rulesText';

describe('reglas en palabras', () => {
  it('pádel, tenis y pickleball', () => {
    expect(rulesText(resolveRules('padel', {}))).toBe('Punto de oro · al mejor de 3 · el 3.º a súper tie-break a 10');
    expect(rulesText(resolveRules('padel', { deuce: 'star', finalSet: 'set' }))).toBe('Star Point (2 ventajas) · al mejor de 3');
    expect(rulesText(resolveRules('tennis', { gamesPerSet: 4 }))).toBe('Con ventaja · al mejor de 3 · sets a 4');
    expect(rulesText(resolveRules('pickleball', {}))).toBe('Dobles · un juego a 11 · ganando por 2 · solo puntúa el que saca');
  });

  it('la plantilla de esas reglas', () => {
    expect(presetOf('padel', resolveRules('padel', {}))?.id).toBe('amateur');
    expect(presetOf('padel', RULE_PRESETS.padel[2].rules)?.id).toBe('star');
    expect(presetOf('padel', resolveRules('padel', { finalTiebreakTo: 7 }))).toBeNull();
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
});
