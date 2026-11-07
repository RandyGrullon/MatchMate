/**
 * El formulario de la práctica o del torneo sin pantalla (eventForm.ts): con qué nace, lo de un evento que se edita, lo
 * que se guarda y los textos. Datos ficticios.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CUTS } from '../lib/stats';
import type { BowlingEvent } from '../lib/types';
import { cleanEventInput, defaults, eventFormOf, eventFormTitle, eventNamePlaceholder, eventSavedText, hcpExample } from './eventForm';

describe('eventForm', () => {
  it('la práctica nueva cae el próximo martes; el torneo, hoy', () => {
    // Un jueves.
    const now = new Date(2026, 10, 5, 10, 0);
    expect(defaults('practica', now)).toMatchObject({ type: 'practica', date: '2026-11-10', games: 3, hcpPercent: 0, teamSize: 0 });
    expect(defaults('torneo', now)).toMatchObject({ type: 'torneo', date: '2026-11-05', hcpBase: 230, hcpPercent: 80, teamSize: 3 });
  });

  it('un evento que se edita trae lo que falta con lo de siempre', () => {
    const ev = { id: 'e1', type: 'torneo', name: 'Copa de Ejemplo', date: '2026-11-20', games: 4, hcpBase: 220, hcpPercent: 90, announcement: undefined } as unknown as BowlingEvent;
    expect(eventFormOf(ev)).toEqual({
      type: 'torneo',
      name: 'Copa de Ejemplo',
      date: '2026-11-20',
      games: 4,
      hcpBase: 220,
      hcpPercent: 90,
      individualRankBy: 'hcp',
      teamRankBy: 'scratch',
      categoryCuts: DEFAULT_CUTS,
      teamSize: 3,
      announcement: '',
    });
  });

  it('lo que se guarda queda dentro de lo que acepta la base', () => {
    const out = cleanEventInput({ ...defaults('torneo'), name: '  Torneo de Ejemplo  ', games: 14, hcpBase: -3, hcpPercent: 150.4, teamSize: 12, announcement: ` ${'x'.repeat(600)} ` });
    expect(out).toMatchObject({ name: 'Torneo de Ejemplo', games: 10, hcpBase: 0, hcpPercent: 100, teamSize: 10 });
    expect(out.announcement).toHaveLength(500);
    expect(cleanEventInput({ ...defaults('practica'), games: Number.NaN }).games).toBe(1);
  });

  it('el ejemplo del handicap y los textos', () => {
    expect(hcpExample({ hcpBase: 230, hcpPercent: 80 })).toBe(52);
    expect(hcpExample({ hcpBase: 150, hcpPercent: 80 })).toBe(0);
    expect(eventFormTitle(true, 'torneo')).toBe('Configurar');
    expect(eventFormTitle(false, 'torneo')).toBe('Nuevo torneo');
    expect(eventFormTitle(false, 'practica')).toBe('Nueva práctica');
    expect(eventSavedText(false, 'practica')).toBe('Práctica creada');
    expect(eventSavedText(true, 'practica')).toBe('Cambios guardados');
    expect(eventNamePlaceholder({ type: 'torneo', date: '2026-11-20' })).toBe('Torneo 2026');
    expect(eventNamePlaceholder({ type: 'practica', date: '2026-11-20' })).toBe('Práctica del martes');
  });
});
