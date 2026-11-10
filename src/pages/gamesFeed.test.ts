/**
 * La lógica de «Resultados anteriores» (gamesFeed.ts, la comparten la web y la app): las fechas jugadas, el evento del
 * juego abierto, quiénes jugaron con sus distinciones y las líneas de cada fila. Datos de mentira.
 */
import { describe, expect, it } from 'vitest';
import type { BowlingEvent, Entry, Player } from '../lib/types';
import { feedEventIds, feedEventUrl, feedPeople, feedPosts, openEventIdOf, playedEvents, postCountsLabel, postLabel, todayLine } from './gamesFeed';

const event = (id: string, date: string, extra: Partial<BowlingEvent> = {}): BowlingEvent =>
  ({ id, type: 'practica', name: '', date, games: 3, hcpBase: 220, hcpPercent: 0, teams: {}, playerCount: 0, ...extra }) as BowlingEvent;
const entry = (eventId: string, playerId: string, scores: (number | null)[]): Entry => ({
  id: `${eventId}_${playerId}`,
  eventId,
  playerId,
  teamId: null,
  average: 0,
  handicapOverride: null,
  scores,
  photos: scores.map((s) => (s == null ? null : 'NO_PHOTO')),
});

describe('resultados anteriores: la lógica', () => {
  it('lo jugado hasta hoy, del más nuevo al más viejo, con lo de hoy aparte', () => {
    const { played, todays, past } = playedEvents([event('a', '2026-09-29'), event('hoy', '2026-10-07'), event('b', '2026-10-06'), event('luego', '2026-10-14')], '2026-10-07');
    expect(played.map((e) => e.id)).toEqual(['hoy', 'b', 'a']);
    expect(todays.map((e) => e.id)).toEqual(['hoy']);
    expect(past.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('el juego abierto carga su evento aunque no se vea', () => {
    expect(openEventIdOf('e9_p1')).toBe('e9');
    expect(openEventIdOf(null)).toBeNull();
    // Supabase: el juego es un uuid; el evento viene aparte (Social) o no viene (el aviso al teléfono).
    expect(openEventIdOf('00000000-0000-7000-8000-000000000001', '00000000-0000-7000-8000-0000000000e1')).toBe('00000000-0000-7000-8000-0000000000e1');
    expect(openEventIdOf('00000000-0000-7000-8000-000000000001')).toBeNull();
    expect(openEventIdOf('00000000-0000-7000-8000-000000000001', null)).toBeNull();
    expect(feedEventIds([event('e1', '2026-10-06')], 'e9')).toEqual(['e1', 'e9']);
    expect(feedEventIds([event('e1', '2026-10-06')], 'e1')).toEqual(['e1']);
  });

  it('los nombres y las cuentas (un menor no tiene perfil)', () => {
    const { nameOf, uidOf } = feedPeople([
      { id: 'p1', name: 'Jugador Uno', uid: 'u1' } as Player,
      { id: 'p2', name: 'Jugadora Dos', uid: 'u2', isMinor: true } as Player,
      { id: 'p3', name: 'Jugador Tres' } as Player,
    ]);
    expect(nameOf.get('p2')).toBe('Jugadora Dos');
    expect([...uidOf.keys()]).toEqual(['p1']);
  });

  it('de la mejor serie a la peor, con «Mejor juego», «Mejor serie» y el juego perfecto', () => {
    const ev = event('e1', '2026-10-06');
    const names = new Map([
      ['p1', 'Jugador Uno'],
      ['p2', 'Jugadora Dos'],
    ]);
    const posts = feedPosts(ev, [entry('e1', 'p1', [176, 195, 203]), entry('e1', 'p2', [227, 199, 236]), entry('e1', 'p9', [150, null, null])], names, new Map([['p2', 'u2']]), false);
    expect(posts.map((p) => p.name)).toEqual(['Jugadora Dos', 'Jugador Uno', '(jugador borrado)']);
    expect(posts[0].badges).toEqual(['Mejor juego', 'Mejor serie']);
    expect(posts[0].uid).toBe('u2');
    expect(posts[1].badges).toEqual([]);
    expect(feedPosts(ev, [entry('e1', 'p1', [300, 200, 180])], names, new Map(), false)[0].badges).toEqual(['¡Juego perfecto!']);
    // Solo uno: sin distinciones.
    expect(feedPosts(ev, [entry('e1', 'p1', [180, 200, 190])], names, new Map(), false)[0].badges).toEqual([]);
  });

  it('las líneas de cada fila y de lo de hoy', () => {
    const ev = event('e1', '2026-10-06');
    const [serie] = feedPosts(ev, [entry('e1', 'p1', [176, 195, 203])], new Map([['p1', 'Jugador Uno']]), new Map(), false);
    expect(postLabel(serie)).toBe('Ver el juego de Jugador Uno: serie 574');
    const [one] = feedPosts(ev, [entry('e1', 'p1', [188, null, null])], new Map([['p1', 'Jugador Uno']]), new Map(), false);
    expect(postLabel(one)).toBe('Ver el juego de Jugador Uno: 188 pinos');
    expect(postCountsLabel(2, 1)).toBe('2 reacciones, 1 comentarios');
    expect(postCountsLabel(0, 3)).toBe('3 comentarios');
    expect(todayLine({ live: true, startLabel: null }, 3)).toEqual({ live: true, text: 'En juego · 3 jugando' });
    expect(todayLine({ live: true, startLabel: null }, 0)).toEqual({ live: true, text: 'En juego' });
    expect(todayLine({ live: false, startLabel: '7:00 p. m.' }, 0)).toEqual({ live: false, text: 'Hoy a las 7:00 p. m.' });
    expect(todayLine({ live: false, startLabel: null }, 0)).toEqual({ live: false, text: 'Hoy' });
    expect(feedEventUrl({ kind: 'liga' }, '/l/L1', ev)).toBe('/l/L1/e/e1');
    expect(feedEventUrl({ kind: 'torneo' }, '/l/L1', ev)).toBe('/l/L1');
  });
});
