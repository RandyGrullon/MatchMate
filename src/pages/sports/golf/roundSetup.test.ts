import { describe, expect, it } from 'vitest';
import { DEMO_COURSE } from '../../../sports/golf/demo';
import type { GolfRoundFull } from '../../../lib/data/golf';
import { COMPETITION_TEMPLATES } from './logic';
import { addDate, allowanceOf, courseOption, nineOptions, pickTemplate, roundFormValid, roundPatch, submitLabel, templateOf } from './roundSetup';

const round: GolfRoundFull = {
  eventId: 'e1',
  courseId: 'demo',
  courseName: DEMO_COURSE.name,
  holes: 18,
  nine: 'all',
  competition: { format: 'stroke', basis: 'net', allowance: 95 },
  shotgun: false,
  tournamentId: null,
  roundNo: null,
  closed: false,
  closedAt: null,
  course: DEMO_COURSE,
};

/** Nueva ronda o torneo, y «Campo y formato» de una ronda. */
describe('crear y cambiar una ronda', () => {
  it('el formato: la plantilla elegida; el bruto va al 100 % y el neto se queda con su %', () => {
    const stableford = COMPETITION_TEMPLATES.find((t) => t.key === 'stableford')!;
    const gross = COMPETITION_TEMPLATES.find((t) => t.key === 'stroke-gross')!;
    expect(pickTemplate(stableford, { format: 'stroke', basis: 'net', allowance: 85 })).toEqual({ format: 'stableford', basis: 'net', allowance: 85 });
    expect(pickTemplate(gross, { format: 'stroke', basis: 'net', allowance: 85 }).allowance).toBe(100);
    expect(templateOf({ format: 'maxScore', basis: 'net', allowance: 95 })?.key).toBe('max');
    expect(allowanceOf('120')).toBe(100);
    expect(allowanceOf('x')).toBe(0);
  });

  it('los hoyos que se pueden jugar y el campo en la lista', () => {
    expect(nineOptions(true).map((o) => o.label)).toEqual(['18 hoyos', 'Ida 1–9', 'Vuelta 10–18']);
    expect(nineOptions(false)).toEqual([{ key: 'all', label: '9 hoyos' }]);
    expect(courseOption(DEMO_COURSE)).toBe('Campo de ejemplo · 18 hoyos · par 72');
  });

  it('se guarda con campo; el torneo pide nombre y sus fechas', () => {
    const base = { kind: 'ronda' as const, name: '', date: '2026-11-14', dates: ['2026-11-14'], courseId: 'demo' };
    expect(roundFormValid(base, false)).toBe(true);
    expect(roundFormValid({ ...base, courseId: '' }, false)).toBe(false);
    expect(roundFormValid({ ...base, kind: 'torneo' }, false)).toBe(false);
    expect(roundFormValid({ ...base, kind: 'torneo', name: 'Copa de Ejemplo' }, false)).toBe(true);
    expect(roundFormValid({ ...base, kind: 'torneo', name: 'Copa de Ejemplo', dates: ['2026-11-14', ''] }, false)).toBe(false);
    expect(addDate(['2026-11-14'], '2026-11-07')).toEqual(['2026-11-14', '2026-11-14']);
    expect(addDate([], '2026-11-07')).toEqual(['2026-11-07']);
  });

  it('al cambiar la ronda solo va lo que cambió; con golpes anotados, ni el campo ni los hoyos', () => {
    const form = { courseId: 'otro', nine: 'front' as const, comp: round.competition, shotgun: true, eighteen: true };
    expect(roundPatch(round, form, false)).toEqual({ courseId: 'otro', nine: 'front', shotgun: true });
    expect(roundPatch(round, form, true)).toEqual({ shotgun: true });
    expect(roundPatch(null, { ...form, eighteen: false }, false)).toEqual({ courseId: 'otro', nine: 'all', competition: round.competition, shotgun: true });
  });

  it('el botón de abajo', () => {
    expect(submitLabel(true, 'ronda', 1)).toBe('Guardar');
    expect(submitLabel(false, 'ronda', 1)).toBe('Crear ronda');
    expect(submitLabel(false, 'torneo', 1)).toBe('Crear torneo (1 ronda)');
    expect(submitLabel(false, 'torneo', 3)).toBe('Crear torneo (3 rondas)');
  });
});
