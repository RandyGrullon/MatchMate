/**
 * «Mi reclamo» y «¿Ya jugabas en esta liga? Busca tu nombre» (banner.ts): lo cerrado en el teléfono, a quién se puede
 * pedir y los textos que comparten la web y la app del teléfono. Datos ficticios.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayerClaim } from '../../lib/data/claims';
import type { Player } from '../../lib/types';
import {
  CLAIM_CANCELLED_TEXT,
  bannerCopy,
  claimRequestCopy,
  claimRequestDoneText,
  claimableFree,
  loadDismissed,
  pickConfirmText,
  saveDismissed,
  withDismissed,
} from './banner';

const claim = (extra: Partial<PlayerClaim> = {}): PlayerClaim => ({
  id: 'c1',
  leagueId: 'l1',
  playerId: 'p1',
  userId: 'u1',
  status: 'pending',
  note: null,
  claimantName: 'Jugador Uno',
  playerName: 'Jugador Sin Cuenta',
  requestedAt: '2026-09-28T15:00:00Z',
  changedAt: '2026-09-28T15:00:00Z',
  decidedBy: null,
  decidedAt: null,
  decisionNote: null,
  ...extra,
});

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    raw: m,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('lo cerrado en este teléfono', () => {
  it('se guarda por liga y se vuelve a leer', () => {
    const store = memoryStorage();
    vi.stubGlobal('localStorage', store);
    expect(loadDismissed().size).toBe(0);
    const next = withDismissed(withDismissed(new Set(), 'l1', 'buscar'), 'l2', 'rechazo:c1');
    saveDismissed(next);
    expect(store.raw.get('mm:reclamo-cerrado')).toBe(JSON.stringify(['l1:buscar', 'l2:rechazo:c1']));
    expect([...loadDismissed()]).toEqual(['l1:buscar', 'l2:rechazo:c1']);
  });

  it('no cambia el conjunto de antes y guarda solo los últimos 100', () => {
    const store = memoryStorage();
    vi.stubGlobal('localStorage', store);
    const before = new Set(['l1:buscar']);
    expect(withDismissed(before, 'l2', 'buscar').has('l2:buscar')).toBe(true);
    expect(before.has('l2:buscar')).toBe(false);
    saveDismissed(new Set(Array.from({ length: 120 }, (_, i) => `l${i}:buscar`)));
    const saved = loadDismissed();
    expect(saved.size).toBe(100);
    expect(saved.has('l0:buscar')).toBe(false);
    expect(saved.has('l119:buscar')).toBe(true);
  });

  it('lo guardado roto o sin almacenamiento: vacío, sin romperse', () => {
    const store = memoryStorage();
    vi.stubGlobal('localStorage', store);
    store.setItem('mm:reclamo-cerrado', '{no es json');
    expect(loadDismissed().size).toBe(0);
    store.setItem('mm:reclamo-cerrado', JSON.stringify(['l1:buscar', 5, null]));
    expect([...loadDismissed()]).toEqual(['l1:buscar']);
    vi.stubGlobal('localStorage', undefined);
    expect(loadDismissed().size).toBe(0);
    expect(() => saveDismissed(new Set(['l1:buscar']))).not.toThrow();
  });
});

describe('a quién se puede pedir', () => {
  it('sin cuenta, no menores y no el suyo, por nombre', () => {
    const players: Player[] = [
      { id: 'p3', name: 'Jugadora Dos', averageOverride: null },
      { id: 'p1', name: 'Jugador Uno', averageOverride: null, uid: 'u9' },
      { id: 'p2', name: 'Jugador Menor', averageOverride: null, isMinor: true },
      { id: 'p4', name: 'Cuenta de Prueba', averageOverride: null, uid: null },
      { id: 'p5', name: 'Jugador Tres', averageOverride: null },
    ];
    expect(claimableFree(players, 'p4').map((p) => p.id)).toEqual(['p5', 'p3']);
    expect(claimableFree(players, null).map((p) => p.id)).toEqual(['p4', 'p5', 'p3']);
  });
});

describe('los textos', () => {
  const people = ['jugador', 'jugadores'] as const;

  it('pendiente, rechazado (con y sin nota) y buscar', () => {
    expect(bannerCopy({ kind: 'pending', claim: claim() }, people)).toEqual({
      title: 'Mi reclamo: pendiente de aprobación',
      text: 'Pediste ser Jugador Sin Cuenta. Cuando el admin lo apruebe, tu cuenta queda con sus juegos. Mientras, juegas con tu cuenta.',
    });
    expect(bannerCopy({ kind: 'rejected', claim: claim({ status: 'rejected', decisionNote: 'Habla conmigo' }) }, people)).toEqual({
      title: 'Mi reclamo: no se aprobó',
      text: 'No quedaste como Jugador Sin Cuenta. El admin dice: «Habla conmigo».',
    });
    expect(bannerCopy({ kind: 'rejected', claim: claim({ status: 'rejected' }) }, people)?.text).toBe(
      'No quedaste como Jugador Sin Cuenta. Si es un error, habla con el admin.',
    );
    expect(bannerCopy({ kind: 'search' }, ['nadador', 'nadadores'])).toEqual({
      title: '¿Ya jugabas en esta liga? Busca tu nombre',
      text: 'Si el admin ya te había anotado, pide ese nadador y tus resultados quedan con tu cuenta.',
    });
    expect(bannerCopy({ kind: 'none' }, people)).toBeNull();
  });

  it('la lista, pedirlo y cancelarlo', () => {
    expect(pickConfirmText({ name: 'Jugador Uno' })).toBe('Soy Jugador Uno');
    expect(pickConfirmText(null)).toBe('No estoy en la lista');
    expect(claimRequestCopy('Jugador Uno', false)).toEqual({
      title: '¿Eres Jugador Uno?',
      message: 'El admin de la liga tiene que aprobarlo. Cuando lo apruebe, tu cuenta queda con Jugador Uno y todo lo que jugó. Mientras, juegas con tu cuenta.',
      confirmText: 'Sí, soy yo',
      noteLabel: 'Nota para el admin (opcional)',
      notePlaceholder: 'Soy yo, jugaba los martes',
    });
    expect(claimRequestCopy('Jugador Uno', true).message).toBe('Como eres admin, quedas como Jugador Uno al momento, con todo lo que jugó.');
    expect(claimRequestDoneText('Jugador Uno', false)).toBe('Pediste ser Jugador Uno. Queda pendiente de aprobación del admin.');
    expect(claimRequestDoneText('Jugador Uno', true)).toBe('Listo: ahora eres Jugador Uno.');
    expect(CLAIM_CANCELLED_TEXT).toBe('Cancelaste el pedido.');
  });
});
