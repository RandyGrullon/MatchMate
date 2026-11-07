/**
 * Los números del boliche de la cuenta sin pantallas (bowlingNumbers.ts, los de Yo en la web y en la app del teléfono):
 * separar el boliche de los otros deportes y sumar las ligas con los juegos sueltos. Datos ficticios.
 */
import { describe, expect, it } from 'vitest';
import type { SoloSession } from '../lib/data/solo';
import type { BowlingEvent, Entry, League, Member } from '../lib/types';
import { bowlingNumbers, splitBySport } from './bowlingNumbers';

const league = (id: string, name: string, sport?: string): League =>
  ({ id, name, kind: 'liga', visibility: 'private', ownerUid: 'o', venue: '', schedule: '', seasonStart: '', seasonEnd: '', contactName: '', contactPhone: '', requirePhoto: false, ...(sport ? { sport } : {}) }) as League;
const member = (lid: string): Member => ({ id: `${lid}_u1`, leagueId: lid, uid: 'u1', name: 'Jugador Uno', role: 'member', playerId: `p-${lid}` });
const ev = (id: string, date: string): BowlingEvent => ({ id, type: 'practica', name: '', date, games: 3, hcpBase: 0, hcpPercent: 0, teams: {}, playerCount: 1 }) as BowlingEvent;
const en = (eventId: string, scores: number[]): Entry =>
  ({ id: `en-${eventId}`, eventId, playerId: 'p', teamId: null, average: 0, handicapOverride: null, scores, photos: scores.map(() => 'f') }) as Entry;

describe('bowlingNumbers.ts', () => {
  it('splitBySport: el boliche (y las ligas que no se leyeron) por un lado y los otros deportes por otro', () => {
    const leagues = [league('bol', 'Liga de Ejemplo', 'bowling'), league('pad', 'Pádel de Ejemplo', 'padel')];
    const { bowling, others } = splitBySport([member('pad'), member('bol'), member('borrada')], leagues);
    expect(bowling.map((m) => m.leagueId)).toEqual(['bol', 'borrada']);
    expect(others).toEqual([{ lid: 'pad', name: 'Pádel de Ejemplo', sport: 'padel', kind: 'liga' }]);
  });

  it('bowlingNumbers: la liga y los juegos sueltos suman juntos; la fila de la liga lleva solo lo suyo', () => {
    const solo = [{ id: 's1', playedOn: '2026-10-02', venue: 'Bolera de Ejemplo', scores: [300] }] as unknown as SoloSession[];
    const n = bowlingNumbers({
      across: [{ lid: 'bol', entries: [en('e1', [180, 200])], events: [ev('e1', '2026-10-01')] }],
      links: [{ lid: 'bol' }],
      names: new Map([['bol', 'Liga de Ejemplo']]),
      solo,
      today: '2026-10-07',
    });
    expect(n.all.games).toBe(3);
    expect(n.all.high).toBe(300);
    expect(n.games.map((g) => g.score)).toEqual([180, 200, 300]);
    expect(n.perLeague).toEqual([{ lid: 'bol', name: 'Liga de Ejemplo', stats: expect.objectContaining({ games: 2, autoAverage: 190 }) }]);
    expect(n.solo?.games).toBe(1);
  });
});
