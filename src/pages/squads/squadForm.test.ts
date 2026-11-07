/** El formulario de un equipo sin pantallas (squadForm.ts): de entrada, lo que cambió, el tag que sale solo y el primer paso. */
import { describe, expect, it } from 'vitest';
import { changeCreateForm, createGate, createStartStep, emptySquadForm, initialCreateForm, squadFormOf, squadPatchOf, typedTag } from './squadForm';

const squad = { name: 'Equipo de Ejemplo', tag: 'EE', city: 'Santo Domingo', color: '#DC2626', description: 'Jugamos los domingos.', recruiting: false };

describe('squadForm', () => {
  it('arma el formulario del equipo y dice solo lo que cambió', () => {
    const f = squadFormOf(squad);
    expect(f).toEqual({ name: 'Equipo de Ejemplo', tag: 'EE', city: 'Santo Domingo', color: '#dc2626', description: 'Jugamos los domingos.', recruiting: false });
    expect(squadPatchOf(squad, f)).toBeNull();
    expect(squadPatchOf(squad, { ...f, name: ' Equipo Uno ', city: '', recruiting: true })).toEqual({ name: 'Equipo Uno', city: null, recruiting: true });
    expect(squadPatchOf(squad, { ...f, tag: 'ab1', color: null })).toEqual({ tag: 'AB1', color: null });
  });

  it('al crear, el tag sale del nombre hasta que se escribe uno', () => {
    expect(initialCreateForm()).toEqual(emptySquadForm());
    expect(initialCreateForm({ name: 'Los Tigres del Este' }).tag).toBe('TE');
    expect(initialCreateForm({ name: 'Los Tigres', tag: 'TGR' }).tag).toBe('TGR');
    const f = changeCreateForm(emptySquadForm(), { name: 'Equipo de Ejemplo' }, false);
    expect(f.tag).toBe('EE');
    expect(changeCreateForm({ ...f, tag: 'MIO' }, { name: 'Otro Nombre' }, true).tag).toBe('MIO');
    expect(changeCreateForm(f, { city: 'Santiago' }, false)).toEqual({ ...f, city: 'Santiago' });
    expect(typedTag(' ab-c12345 ')).toBe('ABC12');
  });

  it('el primer paso y cuándo deja crear', () => {
    expect(createStartStep('football', 'football')).toBe('datos');
    expect(createStartStep('football', 'basketball')).toBe('deporte');
    expect(createStartStep(null, 'football')).toBe('deporte');
    expect(createGate({ name: '', tag: '' })).toEqual({ problem: 'Ponle un nombre al equipo.', shown: null, canCreate: false });
    expect(createGate({ name: 'Equipo de Ejemplo', tag: 'EE' })).toEqual({ problem: null, shown: null, canCreate: true });
    expect(createGate({ name: 'Equipo de Ejemplo', tag: 'EE' }, true).canCreate).toBe(false);
  });
});
