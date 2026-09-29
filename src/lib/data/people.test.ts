import { describe, expect, it } from 'vitest';
import { BLOCKED_MESSAGE } from '../backend/errors';
import { BackendError } from '../backend/types';
import {
  USERNAME_RE,
  USERNAME_RULES,
  checkUsername,
  fetchPeople,
  normalizeUsername,
  peopleQuery,
  peopleSearchKey,
  peopleSearchTags,
  usernameErrorText,
  usernameProblem,
  usernameProblemText,
} from './people';

/** Lo mismo que el CHECK de profiles.username (20260929000200_invitaciones.sql). */
const sqlOk = (v: string) => USERNAME_RE.test(v) && !v.includes('..');

describe('@usuario (sin base)', () => {
  it('normaliza como la base: sin espacios alrededor, en minúsculas y sin una @ al principio', () => {
    expect(normalizeUsername('  @Ana.Perez ')).toBe('ana.perez');
    expect(normalizeUsername('@@ana')).toBe('@ana');
    expect(normalizeUsername('ANA_01')).toBe('ana_01');
    expect(normalizeUsername(null)).toBe('');
    expect(normalizeUsername(undefined)).toBe('');
  });

  it('el formato: 3 a 20, minúsculas, números, _ y puntos solo por dentro y sin dos seguidos', () => {
    for (const ok of ['ana', 'ana.perez', 'a_b', '_ana_', 'x'.repeat(20), '123', 'a.b.c', '@Ana']) {
      expect(usernameProblem(ok), ok).toBeNull();
      expect(sqlOk(normalizeUsername(ok)), ok).toBe(true);
    }
    expect(usernameProblem('')).toBe('corto');
    expect(usernameProblem('ab')).toBe('corto');
    expect(usernameProblem('@ab')).toBe('corto');
    expect(usernameProblem('x'.repeat(21))).toBe('largo');
    expect(usernameProblem('ana pérez')).toBe('caracteres');
    expect(usernameProblem('niño')).toBe('caracteres');
    expect(usernameProblem('ana-p')).toBe('caracteres');
    expect(usernameProblem('ana@x')).toBe('caracteres');
    expect(usernameProblem('.ana')).toBe('puntos');
    expect(usernameProblem('ana.')).toBe('puntos');
    expect(usernameProblem('an..a')).toBe('puntos');
    // Lo que dice que está mal, la base tampoco lo acepta.
    for (const bad of ['ab', 'x'.repeat(21), 'ana pérez', '.ana', 'ana.', 'an..a', 'a-b-c']) expect(sqlOk(normalizeUsername(bad)), bad).toBe(false);
  });

  it('textos de cada problema', () => {
    expect(usernameProblemText('corto')).toBe('Usa al menos 3 caracteres.');
    expect(usernameProblemText('largo')).toBe('Usa 20 caracteres o menos.');
    expect(usernameProblemText('caracteres')).toBe('Usa solo letras sin acentos, números, _ y puntos.');
    expect(usernameProblemText('puntos')).toBe('Los puntos van solo por dentro, y nunca dos seguidos.');
  });

  it('errores de set_username en palabras simples', () => {
    expect(usernameErrorText(new BackendError('duplicado', 'conflict', 'P0001'))).toBe('Ese usuario ya lo tiene otra persona.');
    expect(usernameErrorText(new BackendError('reservado', 'validation', 'P0001'))).toBe('Ese usuario no está disponible.');
    expect(usernameErrorText(new BackendError('rate_limited', 'rate_limited', 'P0001'))).toBe('Cambiaste tu usuario muchas veces hoy. Prueba mañana.');
    expect(usernameErrorText(new BackendError('invalido', 'validation', 'P0001'))).toBe(USERNAME_RULES);
    expect(usernameErrorText(new BackendError('invalido', 'validation', 'P0001'), 'a.')).toBe('Usa al menos 3 caracteres.');
    expect(usernameErrorText(new BackendError(BLOCKED_MESSAGE, 'permission', 'bloqueada'))).toBe(BLOCKED_MESSAGE);
    expect(usernameErrorText(new BackendError('Sin conexión', 'network'))).toBe('Sin conexión. Prueba otra vez cuando tengas señal.');
    expect(usernameErrorText(new Error('otra cosa'))).toBe('No se pudo guardar tu usuario. Prueba otra vez.');
  });

  it('con mal formato ni pregunta a la base', async () => {
    // Sin backend: si llamara a la base, fallaría.
    await expect(checkUsername('a')).resolves.toBe('invalid');
    await expect(checkUsername('ana pérez')).resolves.toBe('invalid');
  });
});

describe('buscar personas (sin base)', () => {
  it('la búsqueda como la mira la base', () => {
    expect(peopleQuery('  @Ana ')).toBe('ana');
    expect(peopleQuery('@')).toBe('');
    expect(peopleQuery(null)).toBe('');
    expect(peopleQuery(`${'x'.repeat(60)}yyy`)).toBe('x'.repeat(60));
  });

  it('clave por liga y búsqueda; etiquetas con las invitaciones de la liga', () => {
    expect(peopleSearchKey('ana', 'L1')).toBe('people:search:L1:ana');
    expect(peopleSearchKey('', null)).toBe('people:search:-:');
    expect(peopleSearchTags('L1')).toEqual(['people', 'people:search', 'invites:L1']);
    expect(peopleSearchTags(null)).toEqual(['people', 'people:search']);
  });

  it('con una sola letra no busca (ni pregunta a la base)', async () => {
    await expect(fetchPeople('a')).resolves.toEqual([]);
    await expect(fetchPeople('@b', 'L1')).resolves.toEqual([]);
  });
});
