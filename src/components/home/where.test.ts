import { describe, expect, it } from 'vitest';
import type { RecentEvent } from '../../lib/useNextGame';
import { anotarLinkOf, whereTitle } from './where';

// Datos ficticios.
const TODAY = '2026-10-06';
const recent = (date: string, over: Partial<RecentEvent['event']> = {}): RecentEvent =>
  ({ lid: 'l1', leagueName: 'Liga de Ejemplo', playerId: 'p1', event: { id: `e-${date}`, type: 'practica', name: '', date, games: 3, ...over } }) as unknown as RecentEvent;

describe('¿Dónde jugaste?', () => {
  it('el nombre de cada evento: el de hoy como la tarjeta, el de ayer con su nombre o «Práctica de ayer»', () => {
    expect(whereTitle(recent(TODAY), TODAY)).toBe('Práctica de hoy');
    expect(whereTitle(recent('2026-10-05'), TODAY)).toBe('Práctica de ayer');
    expect(whereTitle(recent('2026-10-05', { type: 'torneo' }), TODAY)).toBe('Torneo');
    expect(whereTitle(recent('2026-10-05', { name: ' Copa de Ejemplo ' }), TODAY)).toBe('Copa de Ejemplo');
  });

  it('el link para anotar: seguir el juego a medias, «Anotar un juego» o nada', () => {
    const r = recent('2026-10-05');
    expect(anotarLinkOf({ lid: 'l1', eventId: 'e1', game: 2, recent: r }, [r], TODAY)).toEqual({
      kind: 'resume',
      label: 'Seguir mi juego 2 de ayer',
      lid: 'l1',
      eventId: 'e1',
      game: 2,
    });
    expect(anotarLinkOf({ lid: 'l1', eventId: 'e1', game: 1, recent: recent(TODAY) }, [], TODAY)?.label).toBe('Seguir mi juego 1');
    expect(anotarLinkOf(null, [r], TODAY)).toEqual({ kind: 'where', label: 'Anotar un juego' });
    expect(anotarLinkOf(null, [], TODAY)).toBeNull();
  });
});
