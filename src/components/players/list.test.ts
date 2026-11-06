/**
 * Lo puro de Organizar › Jugadores (list.ts y los textos de «Agregar» en logic.ts), que usan la web y la app del
 * teléfono: buscar, los miembros sin jugador, con qué cuenta se vincula, si cambió lo de menor y los textos.
 */
import { describe, expect, it } from 'vitest';
import type { Member } from '../../lib/types';
import {
  accountOptionLabel,
  averageHint,
  deletePlayerMessage,
  filterPlayers,
  handicapSubtitle,
  linkCandidates,
  linkMessage,
  membersWithoutPlayer,
  minorChanged,
  peopleInOwnTab,
  unlinkMessage,
} from './list';
import { emptyGuardian, manyAddedToast, manyCountLine, oneAddedToast } from './logic';

const member = (id: string, name: string, playerId: string | null, extra: Partial<Member> = {}): Member =>
  ({ id, uid: `u-${id}`, leagueId: 'L1', name, role: 'member', playerId, scorer: false, ...extra }) as Member;
const nameOf = (id: string | null) => (id === 'p1' ? 'Jugador Uno' : id === 'p2' ? 'Jugadora Dos' : null);

describe('la lista', () => {
  it('busca sin importar mayúsculas ni espacios de más', () => {
    const list = [{ name: 'Jugador Uno' }, { name: 'Jugadora Dos' }];
    expect(filterPlayers(list, '  uno ')).toEqual([{ name: 'Jugador Uno' }]);
    expect(filterPlayers(list, '')).toHaveLength(2);
  });

  it('los miembros sin jugador no incluyen a quien solo anota', () => {
    const list = [member('a', 'Uno', null), member('b', 'Dos', 'p1'), member('c', 'Tres', null, { scorerOnly: true })];
    expect(membersWithoutPlayer(list).map((m) => m.id)).toEqual(['a']);
    expect(linkCandidates(list, 'p1').map((m) => m.id)).toEqual(['a', 'c']);
  });
});

describe('la cuenta', () => {
  it('«(hoy: …)» solo si ya juega con otro nombre', () => {
    expect(accountOptionLabel(member('a', 'Usuario Uno', 'p1'), nameOf)).toBe('Usuario Uno (hoy: Jugador Uno)');
    expect(accountOptionLabel(member('a', 'Jugador Uno', 'p1'), nameOf)).toBe('Jugador Uno');
    expect(accountOptionLabel(member('a', 'Usuario Uno', null), nameOf)).toBe('Usuario Uno');
  });

  it('vincular y desvincular dicen qué pasa', () => {
    expect(linkMessage('Jugadora Dos', member('a', 'Usuario Uno', null), nameOf)).toBe('Jugadora Dos pasa a ser el jugador de Usuario Uno: sus juegos cuentan en su perfil.');
    expect(linkMessage('Jugadora Dos', member('a', 'Usuario Uno', 'p1'), nameOf)).toContain('De su jugador de ahora (Jugador Uno), lo pendiente');
    expect(unlinkMessage(undefined, 'Jugador Uno')).toMatch(/^La cuenta deja de estar vinculada a Jugador Uno/);
  });
});

describe('la hoja', () => {
  it('eliminar cuenta los juegos en el boliche', () => {
    expect(deletePlayerMessage(true, { games: 5, pending: 1 })).toBe('Se borran también sus 6 juegos en torneos y prácticas. No se puede deshacer.');
    expect(deletePlayerMessage(false, { games: 0, pending: 0 })).toBe('Se borran también sus resultados en esta liga. No se puede deshacer.');
  });

  it('el promedio del handicap, solo si tiene', () => {
    expect(handicapSubtitle({ average: 182, source: 'fijo' })).toBe('Promedio del handicap: 182 (fijo por el admin)');
    expect(handicapSubtitle({ average: 0, source: 'ninguno' })).toBeUndefined();
    expect(averageHint({ average: 182, source: 'fijo' })).toMatch(/ Hoy su handicap usa 182 \(fijo por el admin\)\.$/);
  });

  it('lo de menor cambia al marcarlo o al tocar su tutor', () => {
    const guardian = { guardianName: 'Tutor Uno', guardianPhone: '809-000-0000', consent: true };
    const saved = { guardianName: 'Tutor Uno', guardianPhone: '8090000000', consentAt: '2026-11-01T00:00:00Z' };
    expect(minorChanged({ minorsOk: true, isMinor: true, wasMinor: true, guardian, saved })).toBe(false);
    expect(minorChanged({ minorsOk: true, isMinor: true, wasMinor: true, guardian: { ...guardian, guardianName: 'Tutor Dos' }, saved })).toBe(true);
    expect(minorChanged({ minorsOk: true, isMinor: false, wasMinor: true, guardian: emptyGuardian, saved })).toBe(true);
    expect(minorChanged({ minorsOk: false, isMinor: true, wasMinor: false, guardian, saved: undefined })).toBe(false);
  });

  it('natación y raqueta llevan a su gente en su pestaña', () => {
    expect(peopleInOwnTab('swimming')).toBe(true);
    expect(peopleInOwnTab('tennis')).toBe(true);
    expect(peopleInOwnTab('bowling')).toBe(false);
    expect(peopleInOwnTab('golf')).toBe(false);
    expect(peopleInOwnTab('football')).toBe(false);
  });
});

describe('agregar', () => {
  it('cuántos se agregan y los avisos', () => {
    expect(manyCountLine({ count: 0, existing: [], repeated: 0 })).toBe('Escribe o pega la lista.');
    expect(manyCountLine({ count: 2, existing: ['Jugador Uno'], repeated: 1 })).toBe('Se agregan 2. Ya están en la liga (no se repiten): Jugador Uno. 1 repetido en la lista.');
    expect(manyCountLine({ count: 61, existing: [], repeated: 0 })).toBe('Son 61: agrega hasta 60 a la vez.');
    expect(manyAddedToast({ added: 1, failed: [] })).toEqual({ text: '1 jugador agregado', tone: 'ok' });
    expect(manyAddedToast({ added: 2, failed: ['Jugadora Dos'] }).tone).toBe('error');
    expect(oneAddedToast(' Jugador Uno ', false, 'su promedio').text).toBe('Jugador Uno se agregó, pero no se guardó su promedio. Tócalo en la lista para ponerlo.');
  });
});
