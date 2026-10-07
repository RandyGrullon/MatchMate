import { describe, expect, it } from 'vitest';
import type { RankingRow } from '../../../lib/bowlingSeason';
import type { GameCell, NextGame } from '../../../lib/useNextGame';
import { OWN_BAR_BOWLING, dateLine, leagueBar, leagueLine, nextDates, nowLine, pastLine, peopleLine, scoresSoFar, shortDate, tableTop } from './logic';

describe('la línea de la liga', () => {
  it('«Martes 7:30 pm · Bolera Sambil»: el horario sin el punto del medio y el lugar', () => {
    expect(leagueLine({ schedule: 'Martes · 7:30 pm', venue: 'Bolera Sambil' })).toBe('Martes 7:30 pm · Bolera Sambil');
    expect(leagueLine({ schedule: 'Martes y jueves · 7:00 pm', venue: '' })).toBe('Martes y jueves 7:00 pm');
    expect(leagueLine({ schedule: 'Sábado', venue: 'Club Naco' })).toBe('Sábado · Club Naco');
  });

  it('un horario escrito a mano va tal cual; sin nada, null', () => {
    expect(leagueLine({ schedule: 'Todos los días después del trabajo', venue: 'Bolera' })).toBe('Todos los días después del trabajo · Bolera');
    expect(leagueLine({ schedule: '', venue: '  ' })).toBeNull();
    expect(leagueLine({})).toBeNull();
  });
});

describe('«En juego ahora»: lo tuyo en una línea', () => {
  const tabla = (score: number): GameCell => ({ kind: 'tabla', score, counted: true });
  const medias: GameCell = { kind: 'medias', score: 48, progress: 0.3 };
  const vacio: GameCell = { kind: 'vacio' };
  const to = '/l/L1/e/E1?anotar=1';

  it('lo que llevas y el juego a medias (el diseño)', () => {
    const cells = [tabla(187), tabla(210), medias];
    expect(scoresSoFar(cells)).toEqual([187, 210]);
    expect(nowLine(cells, { kind: 'medias', game: 3, progress: 0.3, to })).toBe('Llevas 187 y 210 · el juego 3 va a medias');
    expect(nowLine([medias, vacio, vacio], { kind: 'medias', game: 1, progress: 0.3, to })).toBe('El juego 1 va a medias');
  });

  it('el que sigue, enviar, y ya enviados o en la tabla', () => {
    expect(nowLine([tabla(187), vacio, vacio], { kind: 'anotar', game: 2, to })).toBe('Llevas 187 · te falta el juego 2');
    expect(nowLine([vacio, vacio, vacio], { kind: 'anotar', game: 1, to })).toBe('Todavía no anotas tus juegos');
    const phone: GameCell[] = [
      { kind: 'telefono', score: 150 },
      { kind: 'telefono', score: 160 },
      { kind: 'telefono', score: 170 },
    ];
    expect(nowLine(phone, { kind: 'enviar', count: 3, to })).toBe('Llevas 150, 160 y 170 · falta enviarlos');
    expect(nowLine([tabla(150), tabla(160), { kind: 'enviado', score: 170 }], { kind: 'ver', pending: true, to })).toBe('Serie 480 · por aprobar');
    expect(nowLine([tabla(150), tabla(160), tabla(170)], { kind: 'ver', pending: false, to })).toBe('Serie 480 · ya cuentan');
  });

  it('quien no juega: preparar su jugador o la planilla', () => {
    const preparar: NextGame = { kind: 'preparar', to: '/l/L1/perfil' };
    expect(nowLine([vacio], preparar)).toBe('Prepara tu jugador para anotar tus juegos');
    expect(nowLine([vacio], { kind: 'planilla', to: '/l/L1/e/E1?tab=juegos' })).toBe('Anotas los juegos de todos');
  });
});

describe('«Próximas fechas»', () => {
  const it_ = (key: string, date: string, type: string) => ({ key, date, type });
  const items = [
    it_('L1:E0', '2026-10-07', 'practica'),
    it_('L1:horario:2026-10-13', '2026-10-13', 'practica'),
    it_('L1:horario:2026-10-20', '2026-10-20', 'practica'),
    it_('L1:E9', '2026-10-24', 'torneo'),
    it_('L1:horario:2026-10-27', '2026-10-27', 'practica'),
  ];

  it('la próxima práctica (una) y los torneos, sin lo que ya sale en «En juego ahora»', () => {
    expect(nextDates(items, new Set(['L1:E0'])).map((i) => i.date)).toEqual(['2026-10-13', '2026-10-24']);
    // Sin nada en juego, la de hoy es la próxima.
    expect(nextDates(items).map((i) => i.date)).toEqual(['2026-10-07', '2026-10-24']);
  });

  it('hasta 3', () => {
    const many = [...items, it_('L1:T2', '2026-11-01', 'torneo'), it_('L1:T3', '2026-11-08', 'torneo')];
    expect(nextDates(many, new Set(['L1:E0']))).toHaveLength(3);
  });

  it('la línea: día · hora, y en un torneo «torneo · 6 inscritos»', () => {
    expect(dateLine({ date: '2026-10-13', time: '7:30 pm', type: 'practica' }, '2026-10-07')).toBe('Martes · 7:30 pm');
    expect(dateLine({ date: '2026-10-08', time: '7:30 pm', type: 'practica' }, '2026-10-07')).toBe('Mañana · 7:30 pm');
    expect(dateLine({ date: '2026-10-24', time: '7:30 pm', type: 'torneo' }, '2026-10-07', 6)).toBe('Sábado · torneo · 6 inscritos');
    expect(dateLine({ date: '2026-10-24', time: null, type: 'torneo' }, '2026-10-07', 1)).toBe('Sábado · torneo · 1 inscrito');
    expect(dateLine({ date: '2026-10-24', time: null, type: 'torneo' }, '2026-10-07', 0)).toBe('Sábado · torneo');
  });
});

describe('Tabla: los 3 de arriba', () => {
  const row = (playerId: string, average: number, games = 9): RankingRow => ({ playerId, name: playerId, average, games, pins: average * games, high: 0, series: 0, events: 3 });
  const rows = [row('ana', 195), row('pedro', 219), row('luis', 194), row('sofia', 167), row('carmen', 157), row('nuevo', 250, 2)];

  it('por promedio, entre los que tienen el mínimo de juegos; tu fila marcada', () => {
    const top = tableTop(rows, 'ana');
    expect(top.map((t) => [t.pos, t.row.playerId, t.me])).toEqual([
      [1, 'pedro', false],
      [2, 'ana', true],
      [3, 'luis', false],
    ]);
  });

  it('si vas más abajo, tu fila toma el tercer lugar con tu puesto', () => {
    expect(tableTop(rows, 'carmen').map((t) => [t.pos, t.row.playerId])).toEqual([
      [1, 'pedro'],
      [2, 'ana'],
      [5, 'carmen'],
    ]);
    // Sin el mínimo de juegos no sale (ni el que todavía no entra).
    expect(tableTop(rows, 'nuevo').map((t) => t.row.playerId)).toEqual(['pedro', 'ana', 'luis']);
    expect(tableTop([], 'ana')).toEqual([]);
  });
});

describe('las filas de abajo', () => {
  it('«29 sep · 6 oct»: las dos últimas fechas jugadas, de la más vieja a la más nueva', () => {
    const events = [{ date: '2026-09-22' }, { date: '2026-10-06' }, { date: '2026-09-29' }, { date: '2026-10-07' }, { date: '2026-10-13' }];
    expect(pastLine(events, '2026-10-07')).toBe('29 sep · 6 oct');
    expect(pastLine([{ date: '2026-10-07' }], '2026-10-07')).toBeNull();
    expect(shortDate('2026-01-05')).toBe('5 ene');
  });

  it('«6 en la liga»', () => {
    expect(peopleLine(6)).toBe('6 en la liga');
    expect(peopleLine(12, true)).toBe('12 en el torneo');
  });
});

describe('la barra de arriba', () => {
  const base = '/l/L1';
  it('«‹ Ligas» en el inicio y «‹ Liga de los martes» adentro', () => {
    expect(leagueBar('/l/L1', base)).toBe('home');
    expect(leagueBar('/l/L1/', base)).toBe('home');
    expect(leagueBar('/l/L1/juegos', base)).toBe('back');
    expect(leagueBar('/l/L1/perfil', base)).toBe('back');
    expect(leagueBar('/l/L1/temporadas', base)).toBe('back');
    expect(leagueBar('/l/L1/ranking', base)).toBe('back');
  });

  it('la práctica, Organizar, un jugador (y en el boliche la Tabla) traen la suya; fuera de la liga, nada', () => {
    expect(leagueBar('/l/L1/e/E1', base)).toBeNull();
    expect(leagueBar('/l/L1/admin', base)).toBeNull();
    expect(leagueBar('/l/L1/j/p1', base)).toBeNull();
    expect(leagueBar('/l/L1/ranking', base, OWN_BAR_BOWLING)).toBeNull();
    expect(leagueBar('/l/L12', base)).toBeNull();
    expect(leagueBar('/ligas', base)).toBeNull();
  });
});
