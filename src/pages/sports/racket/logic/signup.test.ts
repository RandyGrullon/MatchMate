import { describe, expect, it } from 'vitest';
import type { EventSignup } from '../../../../lib/data/racket';
import { newNightConfig, nightConfigJson, parseNightConfig } from './night';
import {
  deadlineText,
  joinedText,
  mySignup,
  newSignup,
  parseSignup,
  signupBlurb,
  signupCap,
  signupCount,
  signupErrorText,
  signupJson,
  signupList,
  signupPhase,
  waitlistMoves,
} from './signup';
import { newCategory, parseTourneyConfig, tourneyConfigJson, tourneyStarted, type TourneyConfig } from './tourney';

const row = (entrantId: string, status: 'in' | 'wait', queue: number, category: string | null = null): EventSignup => ({
  eventId: 'E',
  entrantId,
  playerId: entrantId,
  teamId: null,
  category,
  status,
  queue,
  queuedAt: '2026-10-01T00:00:00Z',
  promotedAt: null,
  createdBy: null,
});

describe('ajustes de la inscripción', () => {
  it('se leen saneados (y sin objeto no hay inscripción)', () => {
    expect(parseSignup({ open: true, cap: 16, until: '2030-10-08T00:00:00.000Z', rev: 3 })).toEqual({ open: true, cap: 16, until: '2030-10-08T00:00:00.000Z', rev: 3 });
    expect(parseSignup({ open: 'si', cap: 1, until: 'mañana', rev: -2 })).toEqual({ open: false, cap: null, until: null, rev: 0 });
    expect(parseSignup({ cap: 65 })?.cap).toBeNull();
    expect(parseSignup(null)).toBeNull();
    expect(parseSignup([])).toBeNull();
    expect(signupJson({ open: true, cap: null, until: null, rev: 7 })).toEqual({ open: true, cap: null, until: null, rev: 7 });
    expect(newSignup(100)).toEqual({ open: true, cap: 64, until: null, rev: 0 });
    expect(newSignup(null).cap).toBeNull();
    expect(signupCap(null)).toBe(64);
    expect(signupCap({ open: true, cap: 12, until: null, rev: 0 })).toBe(12);
  });

  it('la noche y el torneo la guardan con el rev que se leyó (ida y vuelta)', () => {
    const night = { ...newNightConfig('americano', { players: ['a'], courts: ['C1'], seed: 's' }), signup: { open: true, cap: 8, until: null, rev: 4 } };
    expect(parseNightConfig(nightConfigJson(night))).toEqual(night);
    expect(nightConfigJson(newNightConfig('americano', { players: [], courts: [], seed: 's' }))).not.toHaveProperty('signup');
    const t: TourneyConfig = { v: 1, format: 'torneo', categories: [newCategory('A')], courts: [], points: 'standard', signup: { open: false, cap: 6, until: null, rev: 2 } };
    expect(parseTourneyConfig(tourneyConfigJson(t))).toEqual(t);
    expect(tourneyConfigJson({ ...t, signup: undefined })).not.toHaveProperty('signup');
    expect(tourneyStarted(t)).toBe(false);
    expect(tourneyStarted({ categories: [{ ...newCategory('A'), groupsOf: [['x', 'y']] }] })).toBe(true);
  });
});

describe('en qué está', () => {
  const s = { open: true, cap: 4, until: '2030-10-07T22:00:00.000Z', rev: 0 };
  const at = (o: Partial<{ started: boolean; date: string; today: string; now: number }>) =>
    signupPhase(s, { started: false, date: '2030-10-08', today: '2030-10-01', now: Date.parse('2030-10-01T12:00:00Z'), ...o });
  it('abierta, cerrada, fecha límite, empezada y pasada (como la base)', () => {
    expect(at({})).toBe('open');
    expect(signupPhase({ ...s, open: false }, { started: false, date: '2030-10-08', today: '2030-10-01', now: 0 })).toBe('closed');
    expect(at({ now: Date.parse('2030-10-07T22:00:00Z') })).toBe('deadline');
    expect(at({ started: true })).toBe('started');
    expect(at({ today: '2030-10-09' })).toBe('past');
    expect(waitlistMoves('deadline')).toBe(true);
    expect(waitlistMoves('closed')).toBe(true);
    expect(waitlistMoves('started')).toBe(false);
    expect(waitlistMoves('past')).toBe(false);
  });
});

describe('la lista y dónde estoy', () => {
  const rows = [row('ana', 'in', 1), row('w2', 'wait', 9), row('w1', 'wait', 5), row('b1', 'wait', 7, 'B')];

  it('cupos libres, espera en turno y quién vino de la app', () => {
    const l = signupList(['pedro', 'ana'], rows, { open: true, cap: 3, until: null, rev: 0 });
    expect(l.free).toBe(1);
    expect(l.waiting.map((w) => w.entrantId)).toEqual(['w1', 'b1', 'w2']);
    expect([...l.fromApp]).toEqual(['ana']);
    const byCat = signupList([], rows, { open: true, cap: 2, until: null, rev: 0 }, 'B');
    expect(byCat.waiting.map((w) => w.entrantId)).toEqual(['b1']);
    expect(signupList(['x'], [], null).free).toBe(63);
    expect(signupCount(l, { open: true, cap: 3, until: null, rev: 0 })).toBe('2 de 3 cupos · 3 en espera');
    expect(signupCount({ listed: ['a'], waiting: [] }, { open: true, cap: null, until: null, rev: 0 }, ['pareja', 'parejas'])).toBe('1 pareja');
  });

  it('la lista manda (el admin pudo agregarme a mano); si no, mi turno en la espera de mi categoría', () => {
    const lists = [
      { category: 'A', listed: ['x', 'ana'] },
      { category: 'B', listed: ['y'] },
    ];
    expect(mySignup(lists, rows, (id) => id === 'ana')).toEqual({ entrant: 'ana', status: 'in', position: 2, category: 'A' });
    const waits = [row('w1', 'wait', 5, 'A'), row('w2', 'wait', 6, 'B'), row('me', 'wait', 8, 'B')];
    expect(mySignup(lists, waits, (id) => id === 'me')).toEqual({ entrant: 'me', status: 'wait', position: 2, category: 'B' });
    expect(mySignup(lists, waits, () => false)).toBeNull();
  });
});

describe('textos', () => {
  it('fecha límite en la hora de la liga, línea de la lista y resultados', () => {
    // 22:00 UTC = 6:00 pm en Santo Domingo.
    const t = deadlineText('2030-10-07T22:00:00.000Z', 'America/Santo_Domingo');
    expect(t).toMatch(/7/);
    expect(t).toMatch(/6:00 pm$/);
    expect(deadlineText(null)).toBe('');
    expect(signupBlurb({ open: true, cap: 16, until: null, rev: 0 }, 12, 'open')).toBe('inscripción: 12 de 16');
    expect(signupBlurb({ open: true, cap: null, until: null, rev: 0 }, 5, 'open')).toBe('inscripción abierta: 5');
    expect(signupBlurb({ open: true, cap: 16, until: null, rev: 0 }, 12, 'closed')).toBeNull();
    expect(signupBlurb(null, 12, 'open')).toBeNull();
    expect(joinedText({ status: 'in', position: 5 })).toContain('n.º 5');
    expect(joinedText({ status: 'wait', position: 2 })).toContain('espera');
  });

  it('errores de la inscripción en palabras sencillas', () => {
    expect(signupErrorText(new Error('cerrado'))).toContain('se cerró');
    expect(signupErrorText(new Error('duplicado'))).toContain('ya están apuntados');
    expect(signupErrorText(new Error('no_permitido'))).toContain('privada');
    expect(signupErrorText(new Error('invalido: algo'))).toContain('pareja o categoría');
    expect(signupErrorText(new Error('otra cosa'))).toBeNull();
    expect(signupErrorText(null)).toBeNull();
  });
});
