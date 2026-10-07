import { describe, expect, it } from 'vitest';
import { toLeaguePending } from '../../lib/data/organizer';
import type { League, Member } from '../../lib/types';
import {
  adminScreenTitle,
  approveLine,
  dayShort,
  gamesLine,
  leagueOf,
  leagueRows,
  organizeUrl,
  photosLine,
  pickOrganizeLeague,
  scheduleWords,
  seasonRange,
  shortName,
  teamsToBuild,
  toDoItems,
  toDoLine,
  toDoTotal,
  type LeagueRowsInput,
  type ToDoInput,
} from './hubLogic';

const L = 'L1';
const empty = (url: string) => ({ count: 0, url, items: [] });
const raw = (over: Record<string, unknown> = {}) => ({
  submissions: empty(`/l/${L}/admin?tab=aprobar`),
  disputes: empty(`/l/${L}/juegos`),
  overdue: empty(`/l/${L}/juegos`),
  claims: empty(`/l/${L}/admin?tab=reclamos`),
  waitlists: empty(`/l/${L}`),
  checklist: null,
  ...over,
});

const input = (over: Partial<ToDoInput> = {}): ToDoInput => ({
  lid: L,
  kind: 'liga',
  pending: toLeaguePending(raw(), L),
  submissions: [],
  claims: 0,
  suggestions: [],
  reports: 0,
  reviews: 0,
  teams: [],
  now: Date.parse('2026-10-07T16:00:00.000Z'),
  ...over,
});

describe('palabras de Organizar', () => {
  it('fechas con el mes en letras y la temporada corta', () => {
    expect(dayShort('2026-10-24')).toBe('sábado 24 oct');
    expect(dayShort('2026-09-01')).toBe('martes 1 sep');
    expect(seasonRange('2026-09-01', '2026-12-15')).toBe('1 sep – 15 dic');
    expect(seasonRange('2026-09-01', '')).toBe('');
    expect(seasonRange(undefined, '2026-12-15')).toBe('');
  });

  it('el horario después de las fechas: el día en minúscula y sin otro punto', () => {
    expect(scheduleWords('Martes · 7:30 pm')).toBe('martes 7:30 pm');
    expect(scheduleWords('Martes 7:30 pm')).toBe('martes 7:30 pm');
    expect(scheduleWords('Lunes, 8 pm')).toBe('lunes 8 pm');
    expect(scheduleWords('Sábados en la mañana')).toBe('sábados en la mañana');
    expect(scheduleWords('Cada 15 días')).toBe('Cada 15 días');
    expect(scheduleWords('')).toBe('');
    expect(scheduleWords(undefined)).toBe('');
  });

  it('nombres cortos', () => {
    expect(shortName('Sofía Rodríguez')).toBe('Sofía R.');
    expect(shortName('Ana María de la Cruz')).toBe('Ana C.');
    expect(shortName('Pedro')).toBe('Pedro');
  });

  it('la línea de los envíos: dos nombres con sus juegos, «y N más» y la foto', () => {
    const sofia = { name: 'Sofía Rodríguez', scores: [null, 181], hasPhoto: true };
    const carmen = { name: 'Carmen Díaz', scores: [null, null, 199], hasPhoto: true };
    expect(approveLine([sofia, carmen])).toBe('Sofía 181 · Carmen 199 · con foto');
    expect(approveLine([sofia, { ...carmen, hasPhoto: false }])).toBe('Sofía 181 · Carmen 199 · 1 sin foto');
    expect(approveLine([{ ...sofia, hasPhoto: false }])).toBe('Sofía 181 · sin foto');
    expect(approveLine([sofia, carmen, { name: 'Luis Martínez', scores: [190, 201], hasPhoto: true }, sofia])).toBe('Sofía 181 · Carmen 199 y 2 más · con foto');
    expect(approveLine([{ name: 'Pedro Gómez', scores: [212, 245], hasPhoto: true }])).toBe('Pedro 212, 245 · con foto');
    expect(approveLine([])).toBe('');
    expect(photosLine([{ hasPhoto: true }, { hasPhoto: true }])).toBe('2 con foto');
    expect(photosLine([{ hasPhoto: false }])).toBe('1 sin foto');
    expect(photosLine([{ hasPhoto: true }, { hasPhoto: false }])).toBe('1 con foto, 1 sin foto');
  });

  it('los juegos de un envío como quedan', () => {
    expect(gamesLine(['', '181'], 0)).toBe('Juego 2 · 181');
    expect(gamesLine(['187', '210'], 0)).toBe('J1 187 · J2 210');
    expect(gamesLine(['199'], 2)).toBe('Juego 3 · 199');
    expect(gamesLine(['', ' '], 0)).toBe('Sin juegos');
  });
});

describe('torneos con equipos por armar', () => {
  const ev = (over: Record<string, unknown>) => ({ id: 'T1', type: 'torneo', name: 'Copa de octubre', date: '2026-10-24', teamSize: 3, teams: {}, ...over });

  it('los que vienen en 30 días, de equipos y sin ninguno armado, el más cercano primero', () => {
    const out = teamsToBuild(
      [
        ev({}),
        ev({ id: 'T0', name: '  ', date: '2026-10-10' }),
        ev({ id: 'armado', teams: { a: {} } }),
        ev({ id: 'individual', teamSize: 1 }),
        ev({ id: 'lejos', date: '2026-12-20' }),
        ev({ id: 'pasado', date: '2026-10-01' }),
        ev({ id: 'practica', type: 'practica' }),
      ],
      '2026-10-07',
    );
    expect(out).toEqual([
      { id: 'T0', name: 'Torneo', date: '2026-10-10' },
      { id: 'T1', name: 'Copa de octubre', date: '2026-10-24' },
    ]);
  });
});

describe('«Por hacer»', () => {
  it('nada pendiente: vacío (la sección no sale)', () => {
    expect(toDoItems(input())).toEqual([]);
    expect(toDoTotal([])).toBe(0);
  });

  it('como el diseño: aprobar (en vivo), buzón con la última nota y el torneo por armar', () => {
    const items = toDoItems(
      input({
        submissions: [
          { name: 'Sofía Rodríguez', scores: [null, 181], hasPhoto: true },
          { name: 'Carmen Díaz', scores: [null, null, 199], hasPhoto: true },
        ],
        suggestions: [{ text: '¿Podemos  jugar a las 8?' }, { text: 'vieja' }],
        teams: [{ id: 'T1', name: 'Copa de octubre', date: '2026-10-24' }],
      }),
    );
    expect(items.map((i) => [i.title, i.subtitle, i.count, i.to])).toEqual([
      ['Aprobar juegos', 'Sofía 181 · Carmen 199 · con foto', 2, '/l/L1/admin?tab=aprobar'],
      ['Buzón', '«¿Podemos jugar a las 8?»', 2, '/l/L1/admin?tab=buzon'],
      ['Copa de octubre', 'Armar equipos · sábado 24 oct', 0, '/l/L1/e/T1?tab=equipos'],
    ]);
    expect(toDoTotal(items)).toBe(4);
  });

  it('todo lo demás en su orden, con uno solo directo a él y varios a la lista', () => {
    const p = toLeaguePending(
      raw({
        submissions: { count: 3, url: `/l/${L}/admin?tab=aprobar`, items: [] },
        disputes: { count: 1, url: `/l/${L}/juegos`, items: [{ id: 'm1', label: 'Tigres vs Águilas', url: `/l/${L}/juegos?partido=m1` }] },
        overdue: {
          count: 3,
          url: `/l/${L}/juegos`,
          items: [{ id: 'm2', label: 'Ana / Luis vs Beto / Carla', status: 'scheduled', url: `/l/${L}/juegos?partido=m2` }],
        },
        claims: { count: 1, url: `/l/${L}/admin?tab=reclamos`, items: [{ id: 'c1', playerName: 'Pedro', claimantName: 'pedrito' }] },
        waitlists: { count: 1, url: `/l/${L}`, items: [{ eventId: 'e9', name: 'Noche de americano', date: '2026-10-09', waiting: 4, url: `/l/${L}/e/e9` }] },
      }),
      L,
    );
    // Sin envíos en vivo (otro deporte): el número de league_pending.
    const items = toDoItems(input({ pending: p, submissions: null, claims: null, reports: 2, reviews: 1 }));
    expect(items.map((i) => i.kind)).toEqual(['aprobar', 'disputes', 'overdue', 'reclamos', 'waitlists', 'reportes', 'confirmar']);
    const by = Object.fromEntries(items.map((i) => [i.kind, i]));
    expect(by.aprobar.subtitle).toBe('3 juegos por aprobar');
    expect(by.disputes).toMatchObject({ subtitle: 'Tigres vs Águilas', count: 1, to: '/l/L1/juegos?partido=m1' });
    expect(by.overdue).toMatchObject({ subtitle: 'Ana / Luis vs Beto / Carla y 2 más', count: 3, to: '/l/L1/juegos' });
    expect(by.reclamos).toMatchObject({ subtitle: 'pedrito dice que es Pedro', to: '/l/L1/admin?tab=reclamos' });
    expect(by.waitlists).toMatchObject({ subtitle: 'Noche de americano · 4 en espera', to: '/l/L1/e/e9' });
    expect(by.reportes).toMatchObject({ subtitle: '2 cosas reportadas por revisar', to: '/l/L1/admin?tab=reportes' });
    expect(by.confirmar).toMatchObject({ title: 'Insignias por confirmar', subtitle: '1 hazaña por confirmar', to: '/l/L1/admin?tab=confirmar' });
    // Los reclamos en vivo mandan sobre league_pending.
    expect(toDoItems(input({ pending: p, claims: 0 })).some((i) => i.kind === 'reclamos')).toBe(false);
    expect(toDoItems(input({ pending: p, claims: 2 })).find((i) => i.kind === 'reclamos')?.subtitle).toBe('2 cuentas dicen ser un jugador');
  });

  it('una liga nueva: los primeros pasos que faltan, a la pantalla de este deporte', () => {
    const p = toLeaguePending(
      raw({
        checklist: {
          steps: [
            { key: 'invite', label: 'Invita a alguien a la liga', done: false, url: `/l/${L}/admin?tab=miembros` },
            { key: 'players', label: 'Agrega a los jugadores', done: false, url: `/l/${L}/admin?tab=jugadores` },
            { key: 'schedule', label: 'Crea el primer evento', done: true, url: `/l/${L}` },
          ],
        },
      }),
      L,
    );
    const items = toDoItems(input({ pending: p, playersTab: 'parejas' }));
    expect(items.map((i) => [i.title, i.subtitle, i.to, i.count])).toEqual([
      ['Invita a alguien a la liga', 'Primeros pasos · 1 de 3', '/l/L1/admin?tab=liga', 0],
      ['Agrega a los jugadores', 'Primeros pasos · 1 de 3', '/l/L1/admin?tab=parejas', 0],
    ]);
    expect(toDoItems(input({ pending: p, kind: 'torneo' }))[0].subtitle).toBe('Tu torneo nuevo · 1 de 3');
  });

  it('la línea de la hoja de ligas: lo de league_pending, el buzón, reportes e insignias', () => {
    const p = toLeaguePending(raw({ submissions: { count: 2, url: '', items: [] } }), L);
    expect(toDoLine(p, { notes: 1, reports: 0, reviews: 0 })).toBe('2 juegos por aprobar · 1 nota en el buzón');
    expect(toDoLine(p, { notes: 2, reports: 1, reviews: 3 })).toBe('2 juegos por aprobar · 2 notas en el buzón · 1 reporte y más');
    expect(toDoLine(toLeaguePending(raw(), L), { notes: 0, reports: 0, reviews: 0 })).toBe('');
    expect(toDoLine(null, { notes: 1, reports: 0, reviews: 0 })).toBe('1 nota en el buzón');
  });
});

describe('«La liga»', () => {
  const base = (over: Partial<LeagueRowsInput> = {}): LeagueRowsInput => ({
    kind: 'liga',
    photos: true,
    schedule: 'Martes · 7:30 pm',
    seasonStart: '2026-09-01',
    seasonEnd: '2026-12-15',
    players: 6,
    accounts: 1,
    members: 2,
    own: [],
    playersMerged: false,
    buzonInToDo: true,
    reportsTab: false,
    ...over,
  });

  it('boliche, como el diseño (las 9 pestañas de antes, agrupadas)', () => {
    const rows = leagueRows(base());
    expect(rows.map((r) => [r.title, r.subtitle ?? '', r.tab ?? '(hoja)'])).toEqual([
      ['Jugadores y miembros', '6 jugadores · 1 con cuenta', 'jugadores'],
      ['Temporada y fechas', '1 sep – 15 dic · martes 7:30 pm', 'temporada'],
      ['Anotadores', 'Quién anota por otros', '(hoja)'],
      ['Avisar a toda la liga', '', 'avisar'],
      ['Insignias', '', 'insignias'],
      ['Ajustes de la liga', 'Foto del marcador, logo, invitar', 'liga'],
    ]);
  });

  it('el buzón y los reportes, al final cuando no salen en «Por hacer»; sin datos todavía, sin números', () => {
    const rows = leagueRows(base({ buzonInToDo: false, reportsTab: true, players: null, accounts: null, seasonStart: '', schedule: '' }));
    expect(rows.slice(-2).map((r) => [r.title, r.tab])).toEqual([
      ['Buzón', 'buzon'],
      ['Reportes', 'reportes'],
    ]);
    expect(rows[0].subtitle).toBeUndefined();
    expect(rows[1].subtitle).toBe('Cerrar la temporada o suspender un día');
  });

  it('otro deporte: lo suyo primero y, si maneja a su gente, «Miembros»; un torneo, sus nombres', () => {
    const rows = leagueRows(base({ photos: false, own: [{ key: 'parejas', label: 'Parejas y niveles' }], playersMerged: true }));
    expect(rows.slice(0, 2).map((r) => [r.title, r.subtitle, r.tab])).toEqual([
      ['Parejas y niveles', undefined, 'parejas'],
      ['Miembros', '2 miembros · permisos y cuentas', 'miembros'],
    ]);
    expect(rows.find((r) => r.kind === 'ajustes')?.subtitle).toBe('Datos, logo, invitar');
    const t = leagueRows(base({ kind: 'torneo' })).map((r) => r.title);
    expect(t).toContain('Fechas');
    expect(t).toContain('Avisar a todo el torneo');
    expect(t).toContain('Ajustes del torneo');
  });

  it('el título de cada pantalla (y null en las que no son de Organizar)', () => {
    expect(adminScreenTitle('miembros')).toBe('Jugadores y miembros');
    expect(adminScreenTitle('reclamos')).toBe('Jugadores y miembros');
    expect(adminScreenTitle('aprobar')).toBe('Aprobar juegos');
    expect(adminScreenTitle('temporada', 'torneo')).toBe('Fechas');
    expect(adminScreenTitle('liga')).toBe('Ajustes de la liga');
    expect(adminScreenTitle('liga', 'torneo')).toBe('Ajustes del torneo');
    expect(adminScreenTitle('pendientes')).toBeNull();
    expect(adminScreenTitle('equipos')).toBeNull();
  });
});

describe('qué liga muestra Organizar', () => {
  it('la pedida si la organizas (el superadmin, cualquiera); si no, la última; si no, la primera', () => {
    expect(pickOrganizeLeague(['A', 'B'], 'B', 'A', false)).toBe('B');
    expect(pickOrganizeLeague(['A', 'B'], 'X', 'B', false)).toBe('B');
    expect(pickOrganizeLeague(['A', 'B'], 'X', null, true)).toBe('X');
    expect(pickOrganizeLeague(['A', 'B'], null, 'Z', false)).toBe('A');
    expect(pickOrganizeLeague([], null, 'Z', false)).toBeNull();
    expect(organizeUrl('a b')).toBe('/organizar?liga=a%20b');
  });

  it('los permisos, como dentro de la liga', () => {
    const league = { id: 'L1', name: 'Liga', kind: 'liga', sport: 'bowling' } as League;
    const member = (role: Member['role'], extra: Partial<Member> = {}) => ({ id: 'm', leagueId: 'L1', uid: 'u', name: 'Ana', role, playerId: 'p1', ...extra }) as Member;
    expect(leagueOf('L1', league, member('owner'), false)).toMatchObject({ isOwner: true, isAdmin: true, myPlayerId: 'p1', base: '/l/L1' });
    expect(leagueOf('L1', league, member('admin'), false)).toMatchObject({ isOwner: false, isAdmin: true });
    expect(leagueOf('L1', league, member('member', { scorer: true }), false)).toMatchObject({ isAdmin: false, isScorer: false, canScore: false });
    expect(leagueOf('L1', { ...league, kind: 'torneo' }, member('member', { scorer: true }), false)).toMatchObject({ isScorer: true, canScore: true });
    expect(leagueOf('L1', league, null, true)).toMatchObject({ isOwner: true, isAdmin: true, myPlayerId: null });
  });
});
