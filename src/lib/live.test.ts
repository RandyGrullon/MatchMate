import { describe, expect, it } from 'vitest';
import type { LeagueFeed } from './data';
import { liveGames, liveInfo, liveMatches, liveRows, liveScoreText, type LiveMatchLike } from './live';
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

  it('solo las ligas del boliche: un americano o una ronda de hoy no es «anotar mis juegos»', () => {
    const other = (id: string, type: string) => ({ id, date: '2026-09-29', type, games: 0 }) as unknown as BowlingEvent;
    const feeds = [
      feed('bol', [ev('practica-hoy', '2026-09-29')]),
      feed('padel', [other('americano-hoy', 'americano')]),
      feed('golf', [other('ronda-hoy', 'ronda')]),
      feed('tenis', [ev('practica-tenis', '2026-09-29')]),
    ];
    const leagues = [
      lg('bol', 'Boliche', 'Martes · 7:00 pm'),
      { ...lg('padel', 'Pádel', 'Martes · 7:00 pm'), sport: 'padel' },
      { ...lg('golf', 'Golf', ''), sport: 'golf' },
      { ...lg('tenis', 'Tenis', ''), sport: 'tennis' },
    ];
    expect(liveGames(feeds, leagues, at(19, 45)).map((g) => g.event.id)).toEqual(['practica-hoy']);
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

describe('partidos en vivo en el home', () => {
  const stamp = (iso: string) => ({ toMillis: () => Date.parse(iso) });
  const now = Date.parse('2026-09-29T23:00:00Z');
  const lg = (id: string, name: string, sport: string) => ({ id, name, schedule: '', sport }) as League;
  const leagues = [lg('fut', 'Fútbol Norte', 'football'), lg('pad', 'Pádel Club', 'padel'), lg('bol', 'Boliche', 'bowling')];
  const m = (id: string, leagueId: string, extra: Partial<LiveMatchLike> = {}): LiveMatchLike => ({
    id,
    leagueId,
    eventId: null,
    scheduledAt: '2026-09-29T22:00:00Z',
    status: 'live',
    round: 3,
    stage: '',
    court: 'Cancha 1',
    sides: [
      { side: 1, label: 'Tigres' },
      { side: 2, label: 'Leones' },
    ],
    score: { text: '2-1', sides: [2, 1] },
    leaseUntil: null,
    version: 1,
    updatedAt: stamp('2026-09-29T22:50:00Z'),
    ...extra,
  });

  it('los en vivo de tus ligas de raqueta y equipos, los tuyos primero, con marcador, dónde y el link', () => {
    const items = liveMatches(
      [m('a', 'fut', { scheduledAt: '2026-09-29T21:00:00Z' }), m('b', 'pad', { eventId: 'noche', score: { text: '6-4 3-2' }, stage: 'Grupo A' })],
      [m('b', 'pad', { eventId: 'noche', mySide: 2, score: { text: '6-4 3-2' }, stage: 'Grupo A' })],
      leagues,
      now,
    );
    expect(items.map((i) => [i.match.id, i.mine, i.title, i.score, i.detail, i.href])).toEqual([
      ['b', true, 'Tigres vs. Leones', '6-4 3-2', 'Grupo A · Cancha 1', '/l/pad/e/noche?partido=b'],
      ['a', false, 'Tigres vs. Leones', '2-1', 'Jornada 3 · Cancha 1', '/l/fut/juegos?partido=a'],
    ]);
  });

  it('de un mismo partido manda la copia más nueva; los que ya no están en vivo no salen', () => {
    const items = liveMatches([m('a', 'fut', { version: 5, score: { text: '3-1' } })], [m('a', 'fut', { version: 2, mySide: 1 })], leagues, now);
    expect(items.map((i) => [i.match.id, i.mine, i.score])).toEqual([['a', true, '3-1']]);
    // Terminó (la lista del Home todavía no se releyó): la copia más nueva manda.
    expect(liveMatches([m('a', 'fut', { version: 1 })], [m('a', 'fut', { version: 3, status: 'finished' })], leagues, now)).toEqual([]);
    expect(liveMatches([m('s', 'fut', { status: 'suspended' }), m('p', 'fut', { status: 'scheduled' })], [], leagues, now)).toEqual([]);
  });

  it('un «en vivo» que no publica hace más de 3 horas se quedó así y no sale', () => {
    const old = m('viejo', 'fut', { updatedAt: stamp('2026-09-29T19:30:00Z') });
    expect(liveMatches([old], [], leagues, now)).toEqual([]);
    // Si el anotador sigue publicando (su turno se renueva), sale aunque la fila sea vieja.
    expect(liveMatches([{ ...old, leaseUntil: '2026-09-29T23:03:00Z' }], [], leagues, now)).toHaveLength(1);
    // Sin horas conocidas no se esconde.
    expect(liveMatches([{ ...old, updatedAt: null }], [], leagues, now)).toHaveLength(1);
  });

  it('solo ligas tuyas de raqueta o equipos', () => {
    expect(liveMatches([m('x', 'otra'), m('y', 'bol')], [], leagues, now)).toEqual([]);
  });

  it('el marcador corto: el texto o el número grande de cada lado', () => {
    expect(liveScoreText({ text: ' 78-72 ' })).toBe('78-72');
    expect(liveScoreText({ sides: [1, 0] })).toBe('1-0');
    expect(liveScoreText({})).toBeNull();
    expect(liveScoreText(null)).toBeNull();
  });
});
