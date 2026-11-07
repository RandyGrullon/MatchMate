import { describe, expect, it } from 'vitest';
import type { LeagueFeed } from '../../lib/data';
import type { BowlingEvent, League, Submission, Suggestion } from '../../lib/types';
import type { BoardRow } from '../event/board';
import { approveLine, liveGames, liveShownRows, shortDay, suggestionsText, teamsLine, toDoOf, weekBusy, weekDays, weekTitle } from './proHome';

// Datos de mentira: «Liga de Ejemplo», «Jugador Uno»…
const TODAY = '2026-10-14'; // miércoles
const league: League = {
  id: 'L1',
  name: 'Liga de Ejemplo',
  visibility: 'private',
  ownerUid: 'u1',
  venue: 'Bolera de Ejemplo',
  schedule: '',
  seasonStart: '2026-09-01',
  seasonEnd: '2026-12-15',
  contactName: '',
  contactPhone: '',
  requirePhoto: false,
  sport: 'bowling',
};
const ev = (p: Partial<BowlingEvent>): BowlingEvent => ({ id: 'E1', type: 'practica', name: 'Práctica', date: TODAY, games: 3, hcpBase: 0, hcpPercent: 0, teams: {}, playerCount: 0, ...p });
const sub = (playerId: string, photoId: string | null): Submission => ({
  id: `s-${playerId}`,
  playerId,
  eventId: 'E1',
  scores: [180],
  scanned: null,
  photoId,
  status: 'pendiente',
  note: null,
  createdAt: { toMillis: () => 0 },
});
const feed = (p: Partial<LeagueFeed> = {}): LeagueFeed => ({
  lid: 'L1',
  uid: 'u1',
  playerId: 'p-uno',
  isAdmin: true,
  isScorer: false,
  events: [ev({})],
  mySubs: [],
  pending: [],
  reactions: [],
  comments: [],
  suggestions: [],
  ...p,
});
const row = (playerId: string, pos: number, cells: BoardRow['cells'], total = 0): BoardRow => ({ playerId, entry: null, cells, total, counted: 0, pos });

describe('Por hacer (Pro)', () => {
  it('lo pendiente de las ligas que organizas: aprobar sin los tuyos, el buzón y los torneos sin equipos', () => {
    const copa = ev({ id: 'T1', type: 'torneo', name: '  ', date: '2026-10-24', teamSize: 4 });
    const lejos = ev({ id: 'T2', type: 'torneo', name: 'Copa de Ejemplo', date: '2026-12-30', teamSize: 4 });
    const note = { id: 'n1' } as Suggestion;
    const todo = toDoOf(
      [
        feed({ pending: [sub('p-dos', 'f'), sub('p-uno', null)], suggestions: [note], events: [copa, lejos] }),
        feed({ lid: 'L2', isAdmin: false, pending: [sub('p-tres', null)] }),
        feed({ lid: 'L3' }),
      ],
      TODAY,
    );
    expect(todo).toHaveLength(1);
    expect(todo[0]).toMatchObject({ lid: 'L1', approvals: 1, suggestions: 1, teams: [{ id: 'T1', name: 'Torneo', date: '2026-10-24' }] });
  });

  it('las líneas de cada tarea', () => {
    expect(approveLine([sub('a', 'f'), sub('b', 'f')], ['Jugador Uno', 'Jugadora Dos'], null)).toBe('Jugador y Jugadora · con foto');
    expect(approveLine([sub('a', 'f'), sub('b', null)], ['Jugador Uno', 'Jugadora Dos'], 'Liga de Ejemplo')).toBe('Jugador y Jugadora · 1 con foto · Liga de Ejemplo');
    expect(approveLine([sub('a', null)], [''], null)).toBe('sin foto');
    expect(suggestionsText(1)).toBe('1 sugerencia nueva');
    expect(suggestionsText(3)).toBe('3 sugerencias nuevas');
    expect(shortDay('2026-10-24')).toBe('sáb 24 oct');
    expect(teamsLine('2026-10-24', 'Liga de Ejemplo')).toBe('Faltan los equipos · sáb 24 oct · Liga de Ejemplo');
    expect(teamsLine('2026-10-24', null)).toBe('Faltan los equipos · sáb 24 oct');
  });
});

describe('En vivo (Pro)', () => {
  it('los 3 primeros y tú si vas más abajo', () => {
    const rows = ['a', 'b', 'c', 'd', 'yo'].map((id, i) => row(id, i + 1, []));
    expect(liveShownRows(rows, 'yo').map((r) => r.playerId)).toEqual(['a', 'b', 'c', 'yo']);
    expect(liveShownRows(rows, 'b').map((r) => r.playerId)).toEqual(['a', 'b', 'c']);
    expect(liveShownRows(rows, null)).toHaveLength(3);
  });

  it('tus juegos: lo aprobado, lo que espera aprobación aparte y el que llevas a medias', () => {
    const r = row('yo', 1, [
      { kind: 'ok', score: 187 },
      { kind: 'pend', score: 210 },
      { kind: 'play', score: 74, partial: true },
    ]);
    expect(liveGames(r, 'yo', 74)).toEqual([
      { text: '187', pend: false },
      { text: '210', pend: true },
      { text: '74…', pend: false },
    ]);
    expect(liveGames(r, 'otro', 74)).toHaveLength(2);
  });
});

describe('Esta semana (Pro)', () => {
  it('de lunes a domingo, con el mes y los días con algo', () => {
    expect(weekDays(TODAY)).toEqual(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']);
    expect(weekTitle(TODAY)).toBe('Esta semana · octubre');
    const busy = weekBusy([feed({ events: [ev({ date: '2026-10-17', type: 'torneo', name: 'Copa de Ejemplo' })] })], [league], [], TODAY);
    expect(busy.has('2026-10-17')).toBe(true);
    expect(busy.has('2026-10-13')).toBe(false);
  });
});
