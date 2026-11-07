/** La Planilla sin pantalla (sheet.ts): los equipos, las casillas, quiénes faltan y los avisos. Datos ficticios. */
import { describe, expect, it } from 'vitest';
import { entryLine } from '../../lib/stats';
import type { BowlingEvent, Entry } from '../../lib/types';
import {
  addPlayersEmptyText,
  addPlayersSearch,
  addPlayersTitle,
  cellSpoken,
  cellText,
  confirmedText,
  emptySheetText,
  enrolledText,
  groupTotalText,
  missingConfirmed,
  nextOpenGame,
  sheetGroups,
} from './sheet';

const event = {
  id: 'e1',
  type: 'torneo',
  name: 'Torneo de Ejemplo',
  date: '2026-11-07',
  games: 3,
  hcpBase: 230,
  hcpPercent: 80,
  teams: { t2: { name: 'Equipo Dos', order: 1 }, t1: { name: 'Equipo Uno', order: 0 } },
  rsvp: { a: true, c: true, z: true },
} as unknown as BowlingEvent;
const entry = (id: string, playerId: string, teamId: string | null, scores: (number | null)[]): Entry =>
  ({ id, eventId: 'e1', playerId, teamId, average: 180, scores, photos: scores.map(() => null) }) as unknown as Entry;

describe('event/sheet', () => {
  const entries = [entry('x1', 'a', 't2', [180, null, null]), entry('x2', 'b', 't1', [200, 190, null]), entry('x3', 'c', null, [])];
  const lines = entries.map((e) => entryLine(e, event, true));

  it('en el torneo, cada equipo en su orden y «Sin equipo» al final; en la práctica, todos juntos', () => {
    expect(sheetGroups(event, lines).map((g) => [g.title, g.lines.map((l) => l.entry.playerId)])).toEqual([
      ['Equipo Uno', ['b']],
      ['Equipo Dos', ['a']],
      ['Sin equipo', ['c']],
    ]);
    expect(sheetGroups({ ...event, type: 'practica' }, lines)).toEqual([{ key: '_all', title: null, lines }]);
  });

  it('las casillas: lo que se ve y lo que se dice', () => {
    expect(cellText({ kind: 'empty', score: null })).toBe('');
    expect(cellText({ kind: 'play', score: 74, partial: true })).toBe('74…');
    expect(cellText({ kind: 'ok', score: 201 })).toBe('201');
    expect(cellSpoken({ kind: 'play', score: null, partial: true })).toBe('jugando, lleva 0');
    expect(cellSpoken({ kind: 'play', score: 190 })).toBe('190, en su teléfono');
    expect(cellSpoken({ kind: 'pend', score: 181 })).toBe('181, por aprobar');
    expect(cellSpoken({ kind: 'empty', score: null })).toBe('sin anotar');
    expect(groupTotalText({ main: 1110, hcp: 1422 })).toBe('Total 1110 · con hcp 1422');
    expect(groupTotalText({ main: 1422, hcp: null })).toBe('Total 1422');
  });

  it('quiénes dijeron «voy» y faltan en la planilla (solo los de la liga)', () => {
    expect(missingConfirmed(event, [entries[0]], new Set(['a', 'b', 'c']))).toEqual(['c']);
    expect(confirmedText(1)).toBe('1 confirmó que va');
    expect(confirmedText(2)).toBe('2 confirmaron que van');
  });

  it('al guardar sigue con el próximo juego sin anotar', () => {
    expect(nextOpenGame([180, null, null], 1)).toBe(2);
    expect(nextOpenGame([180, null, 170], 1)).toBe(-1);
    expect(nextOpenGame([null, 200, null], 2)).toBe(0);
  });

  it('agregar asistentes: lo que queda, lo que coincide y si es un nombre nuevo', () => {
    const players = [
      { id: 'a', name: 'Jugador Uno' },
      { id: 'b', name: 'Jugadora Dos' },
      { id: 'd', name: 'Jugador Tres' },
    ];
    const r = addPlayersSearch(players, [entries[0]], 'jugador');
    expect(r.available.map((p) => p.id)).toEqual(['b', 'd']);
    expect(r.filtered.map((p) => p.id)).toEqual(['b', 'd']);
    expect(r.canCreate).toBe(true);
    expect(addPlayersSearch(players, [], 'jugador uno').canCreate).toBe(false);
    expect(addPlayersSearch(players, [], '  ').canCreate).toBe(false);
    expect(addPlayersTitle('torneo')).toBe('Inscribir jugadores');
    expect(addPlayersTitle('practica')).toBe('Agregar asistentes');
    expect(addPlayersEmptyText(0, 0)).toBe('Todavía no hay jugadores: escribe un nombre arriba para crearlo.');
    expect(addPlayersEmptyText(3, 0)).toBe('Todos los jugadores ya están en este evento.');
    expect(addPlayersEmptyText(3, 2)).toBe('Nadie coincide.');
    expect(enrolledText(1)).toBe('1 inscrito');
    expect(enrolledText(3)).toBe('3 inscritos');
    expect(emptySheetText(false, false)).toEqual({ title: 'Sin asistentes', text: 'El admin todavía no ha inscrito jugadores.' });
  });
});
