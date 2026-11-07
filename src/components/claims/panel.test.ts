/** Organizar › Reclamos: lo que arma la lista y la hoja de aprobar o rechazar (src/components/claims/panel.ts). */
import { describe, expect, it } from 'vitest';
import { BackendError } from '../../lib/backend/types';
import type { PlayerClaim } from '../../lib/data/claims';
import { CLAIM_CONFLICT_TEXT, claimAccounts, claimMeta, conflictsProblem, decideCopy, decideDoneText, decideProblem, ownPlayerOf } from './panel';

const NOW = Date.parse('2026-09-28T15:00:00Z');
const DAY = 86400_000;

const claim = (extra: Partial<PlayerClaim> = {}): PlayerClaim => ({
  id: 'c1',
  leagueId: 'l1',
  playerId: 'p-uno',
  userId: 'u-cuenta',
  status: 'pending',
  note: null,
  claimantName: 'Cuenta de Prueba',
  playerName: 'Jugador Uno',
  requestedAt: new Date(NOW - 2 * DAY).toISOString(),
  changedAt: new Date(NOW - 2 * DAY).toISOString(),
  decidedBy: null,
  decidedAt: null,
  decisionNote: null,
  ...extra,
});

describe('de quién es cada pedido', () => {
  const members = [
    { uid: 'u-cuenta', name: 'Cuenta de Prueba', playerId: 'p-propio' },
    { uid: 'u-otra', name: 'Jugadora Dos', playerId: null },
  ];

  it('la cuenta con su jugador y el correo solo si se pudo leer', () => {
    const none = claimAccounts(members, []);
    expect(none.get('u-cuenta')).toEqual({ name: 'Cuenta de Prueba', email: null, playerId: 'p-propio' });
    const withMail = claimAccounts(members, [{ id: 'u-cuenta', email: 'correo@ejemplo.com' }]);
    expect(withMail.get('u-cuenta')?.email).toBe('correo@ejemplo.com');
    expect(withMail.get('u-nadie')).toBeUndefined();
  });

  it('la línea debajo del nombre', () => {
    const account = { name: 'Cuenta de Prueba', email: null, playerId: 'p-propio' };
    expect(claimMeta(claim(), account, NOW)).toBe('hace 2 días');
    expect(claimMeta(claim(), { ...account, name: 'Otro Nombre', email: 'correo@ejemplo.com' }, NOW)).toBe('Cuenta: Otro Nombre · correo@ejemplo.com · hace 2 días');
    expect(claimMeta(claim(), null, NOW)).toBe('hace 2 días');
  });

  it('lo que ya jugó con su cuenta: solo si su jugador es otro', () => {
    expect(ownPlayerOf(claim(), { name: 'x', email: null, playerId: 'p-propio' })).toBe('p-propio');
    expect(ownPlayerOf(claim(), { name: 'x', email: null, playerId: 'p-uno' })).toBeNull();
    expect(ownPlayerOf(claim(), { name: 'x', email: null, playerId: null })).toBeNull();
    expect(ownPlayerOf(claim(), null)).toBeNull();
  });
});

describe('aprobar o rechazar', () => {
  it('los textos de la hoja', () => {
    expect(decideCopy(claim(), true)).toEqual({
      title: 'Aprobar reclamo',
      message: 'Cuenta de Prueba queda como Jugador Uno: lo que jugó cada uno se junta en un solo jugador y su cuenta sigue con él. Esto no se puede deshacer.',
      noteLabel: 'Nota para Cuenta de Prueba (opcional)',
      placeholder: 'Bienvenido',
      confirmText: 'Aprobar',
    });
    expect(decideCopy(claim(), false)).toMatchObject({
      title: 'Rechazar reclamo',
      message: 'Cuenta de Prueba no queda como Jugador Uno y sigue con su propio jugador. Le avisamos.',
      placeholder: 'Ese no eres tú: habla conmigo',
      confirmText: 'Rechazar',
    });
  });

  it('el aviso de después (y si otro admin ya lo decidió)', () => {
    expect(decideDoneText(claim(), true, 'approved')).toBe('Listo: Cuenta de Prueba ahora es Jugador Uno.');
    expect(decideDoneText(claim(), false, 'rejected')).toBe('Rechazado. Cuenta de Prueba sigue con su propio jugador.');
    expect(decideDoneText(claim(), true, 'rejected')).toBe('Otro admin ya lo había decidido.');
    expect(decideDoneText(claim(), false, 'cancelled')).toBe('Otro admin ya lo había decidido.');
  });

  it('cuando los dos jugaron lo mismo', () => {
    expect(conflictsProblem([])).toBeNull();
    expect(conflictsProblem([{ what: 'entries', label: 'Juegos en el mismo evento', count: 1 }])).toEqual({ text: CLAIM_CONFLICT_TEXT, list: ['Juegos en el mismo evento (1)'] });
    expect(decideProblem(new Error('conflicto: Juegos en el mismo evento (2), Partidos (1)'))).toEqual({
      text: CLAIM_CONFLICT_TEXT,
      list: ['Juegos en el mismo evento (2)', 'Partidos (1)'],
    });
    expect(decideProblem(new BackendError('no_permitido', 'permission', 'no_permitido'))).toEqual({ text: 'Solo el dueño o un admin de la liga puede hacer eso.', list: null });
  });
});
