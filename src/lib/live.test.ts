import { describe, expect, it } from 'vitest';
import type { LeagueFeed } from './data';
import { liveGames, liveInfo, liveRows } from './live';
import type { BowlingEvent, Entry, League, LiveScore, Submission } from './types';

const at = (h: number, m = 0) => new Date(2026, 8, 29, h, m);
const today = { date: '2026-09-29' };
const league = (schedule: string) => ({ schedule });

describe('en juego ahora', () => {
  it('solo el día del evento', () => {
    expect(liveInfo({ date: '2026-09-30' }, league('Martes · 7:30 pm'), at(20)).live).toBe(false);
    expect(liveInfo({ date: '2026-09-28' }, league('Martes · 7:30 pm'), at(20)).live).toBe(false);
  });

  it('desde 30 minutos antes de la hora de la liga hasta la medianoche', () => {
    expect(liveInfo(today, league('Martes · 7:30 pm'), at(18, 59)).live).toBe(false);
    expect(liveInfo(today, league('Martes · 7:30 pm'), at(19, 0))).toEqual({ live: true, startLabel: '7:30 pm', startsSoon: true });
    expect(liveInfo(today, league('Martes · 7:30 pm'), at(21, 15))).toEqual({ live: true, startLabel: '7:30 pm', startsSoon: false });
    expect(liveInfo(today, league('Martes · 7:30 pm'), at(23, 59)).live).toBe(true);
  });

  it('un evento en otro día que el de la liga (torneo el sábado) está en juego todo el día', () => {
    const sabado = new Date(2026, 9, 3, 10, 0);
    expect(liveInfo({ date: '2026-10-03' }, league('Martes · 7:30 pm'), sabado)).toEqual({ live: true, startLabel: null, startsSoon: false });
  });

  it('sin hora en la liga, todo el día', () => {
    expect(liveInfo(today, league(''), at(8))).toEqual({ live: true, startLabel: null, startsSoon: false });
    expect(liveInfo(today, league('Martes'), at(8)).live).toBe(true);
  });
});

describe('en juego ahora en el home', () => {
  const ev = (id: string, date: string) => ({ id, date, type: 'practica', games: 3 }) as BowlingEvent;
  const lg = (id: string, name: string, schedule: string) => ({ id, name, schedule }) as League;
  const feed = (lid: string, events: BowlingEvent[]): LeagueFeed => ({
    lid,
    uid: 'u1',
    playerId: 'p1',
    isAdmin: false,
    isScorer: false,
    events,
    mySubs: [],
    pending: [],
    reactions: [],
    comments: [],
    suggestions: [],
  });

  it('solo los eventos de hoy que ya empezaron (o están por empezar)', () => {
    const feeds = [
      feed('a', [ev('hoy', '2026-09-29'), ev('manana', '2026-09-30')]),
      feed('b', [ev('tarde', '2026-09-29')]),
      feed('c', [ev('sin-liga', '2026-09-29')]),
    ];
    const leagues = [lg('a', 'Liga A', 'Martes · 7:30 pm'), lg('b', 'Liga B', 'Martes · 9:00 pm')];
    const games = liveGames(feeds, leagues, at(19, 45));
    expect(games.map((g) => g.event.id)).toEqual(['hoy']);
    expect(liveGames(feeds, leagues, at(20, 40)).map((g) => g.event.id)).toEqual(['hoy', 'tarde']);
  });

  it('los que ya empezaron van antes que los que están por empezar', () => {
    const feeds = [feed('a', [ev('a1', '2026-09-29')]), feed('b', [ev('b1', '2026-09-29')])];
    const leagues = [lg('a', 'A', 'Martes · 9:00 pm'), lg('b', 'B', 'Martes · 7:00 pm')];
    expect(liveGames(feeds, leagues, at(20, 45)).map((g) => g.event.id)).toEqual(['b1', 'a1']);
  });
});

describe('tablero en vivo', () => {
  const entry = (playerId: string, scores: (number | null)[], photos: (string | null)[]) =>
    ({ id: `hoy_${playerId}`, eventId: 'hoy', playerId, scores, photos }) as Entry;
  const sub = (playerId: string, scores: (number | null)[], status: Submission['status'] = 'pendiente') =>
    ({ id: `s-${playerId}`, playerId, eventId: 'hoy', scores, status }) as Submission;
  const phone = (playerId: string, scores: (number | null)[]) => ({ id: `hoy_${playerId}`, eventId: 'hoy', playerId, scores }) as LiveScore;

  it('junta la tabla, lo enviado y lo del teléfono, y ordena por serie', () => {
    const rows = liveRows(
      { games: 3, type: 'practica' },
      [entry('ana', [200, 180, null], ['f', null, null])],
      [sub('juan', [190, 200]), sub('ana', [999, 999, 170], 'rechazado')],
      [phone('juan', [190, 200, 210]), phone('luis', [150])],
    );
    expect(rows.map((r) => [r.playerId, r.total, r.played])).toEqual([
      ['juan', 600, 3],
      ['ana', 380, 2],
      ['luis', 150, 1],
    ]);
    expect(rows[0].games.map((g) => g.source)).toEqual(['enviado', 'enviado', 'jugador']);
    expect(rows[1].games.map((g) => g.source)).toEqual(['tabla', 'sin-verificar', null]);
    expect(rows[1].entryId).toBe('hoy_ana');
    expect(rows[2].entryId).toBeNull();
  });

  it('sin juegos no sale, y un puntaje imposible del teléfono no cuenta', () => {
    expect(liveRows({ games: 3, type: 'practica' }, [entry('ana', [null, null, null], [null, null, null])], [], [phone('luis', [450])])).toEqual([]);
  });

  it('en un torneo solo salen los inscritos', () => {
    const rows = liveRows({ games: 3, type: 'torneo' }, [entry('ana', [200, null, null], ['f', null, null])], [sub('juan', [190])], [phone('luis', [300, 300, 300])]);
    expect(rows.map((r) => r.playerId)).toEqual(['ana']);
  });

  it('lo corregido en el teléfono después de enviarlo es lo que se ve', () => {
    const at = (t: number) => ({ toMillis: () => t });
    const sent = { ...sub('juan', [150]), createdAt: at(1000) } as Submission;
    const later = { ...phone('juan', [180]), updatedAt: at(2000) } as LiveScore;
    const earlier = { ...phone('juan', [180]), updatedAt: at(500) } as LiveScore;
    expect(liveRows({ games: 3, type: 'practica' }, [], [sent], [later])[0].games[0]).toEqual({ score: 180, source: 'jugador' });
    expect(liveRows({ games: 3, type: 'practica' }, [], [sent], [earlier])[0].games[0]).toEqual({ score: 150, source: 'enviado' });
  });
});
