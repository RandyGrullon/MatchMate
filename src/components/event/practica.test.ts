/**
 * La Práctica del rediseño («Calma y foco»), sin navegador: la tabla de «Cómo van todos» (Lite) y la Planilla (Pro) son
 * la misma (boardRows): solo suma lo aprobado; lo enviado y lo que falta por la foto es «por aprobar» (gris en Lite,
 * ámbar en Pro), lo del teléfono y tu juego a medias, «jugando» («74…»). Arriba de la Planilla, «Por aprobar» con
 * Rechazar / Aprobar y «Aprobar todo». La línea de «Tus juegos» y la de la fecha.
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { LeagueContext, type LeagueCtx } from '../../lib/league';
import type { BowlingEvent, Entry, League, LiveScore, Player, Submission } from '../../lib/types';
import { FeedbackProvider } from '../feedback';
import { approvalTitle, ApprovalCard, quickApproval } from './ApprovalCard';
import { boardLine, boardRows, gamesList, shortName } from './board';
import { EventBoard } from './EventBoard';
import { eventDay, eventMeta, eventTime } from './EventHeader';
import { GamesTab } from './GamesTab';
import { myGamesStatus } from './MyGamesPanel';

vi.mock('../../lib/data/client', async (orig) => ({
  ...(await orig<typeof import('../../lib/data/client')>()),
  getUserId: () => 'u-practica',
  currentOutbox: () => null,
}));
// Usan useSyncExternalStore sin la versión del servidor (renderToString no puede) y aquí no se abren.
vi.mock('../ScanModal', () => ({ ScanModal: () => null }));
vi.mock('../PhotoModal', () => ({ PhotoModal: () => null }));
vi.mock('./AddPlayersModal', () => ({ AddPlayersModal: () => null }));
vi.mock('../../lib/photos', () => ({ usePhoto: () => ({ data: null, loading: true, error: null }) }));

const TODAY = '2026-10-07';
const league: League = {
  id: 'L1',
  name: 'Liga de los martes',
  visibility: 'private',
  ownerUid: 'u1',
  venue: 'Bolera Sambil',
  schedule: 'Martes 7:30 pm',
  seasonStart: '',
  seasonEnd: '',
  contactName: '',
  contactPhone: '',
  requirePhoto: false,
};
const ctx: LeagueCtx = { lid: 'L1', league, member: null, isAdmin: true, isOwner: true, isScorer: false, canScore: true, myPlayerId: 'ana', base: '/l/L1' };
const practice: BowlingEvent = { id: 'E1', type: 'practica', name: '', date: TODAY, games: 3, hcpBase: 0, hcpPercent: 0, teams: {}, playerCount: 6 };

const entry = (playerId: string, scores: (number | null)[], photos: (string | null)[] = scores.map((s) => (s == null ? null : 'sin-foto'))): Entry => ({
  id: `e-${playerId}`,
  eventId: 'E1',
  playerId,
  teamId: null,
  average: 180,
  handicapOverride: null,
  scores,
  photos,
});
const sub = (id: string, playerId: string, scores: (number | null)[], extra: Partial<Submission> = {}): Submission => ({
  id,
  playerId,
  eventId: 'E1',
  scores,
  scanned: scores,
  photoId: `foto-${id}`,
  status: 'pendiente',
  note: null,
  ...extra,
});
const players: Player[] = [
  { id: 'pedro', name: 'Pedro Gómez', averageOverride: null },
  { id: 'luis', name: 'Luis Martínez', averageOverride: null },
  { id: 'ana', name: 'Ana Pérez', averageOverride: null },
  { id: 'carmen', name: 'Carmen Díaz', averageOverride: null },
  { id: 'sofia', name: 'Sofía Rodríguez', averageOverride: null },
  { id: 'jose', name: 'José Ramírez', averageOverride: null },
];
/** El día del mockup: Ana con el 3 a medias, Carmen y Sofía con uno por aprobar. */
const entries = [
  entry('pedro', [212, 245, 201]),
  entry('luis', [199, 182, 224]),
  entry('ana', [187, 210, null]),
  entry('carmen', [143, 171, null]),
  entry('sofia', [168, null, null]),
  entry('jose', [156, null, null]),
];
const subs = [sub('s1', 'sofia', [null, 181, null]), sub('s2', 'carmen', [null, null, 199])];
const anaHalf = (playerId: string, _e: Entry | null, game: number) => (playerId === 'ana' && game === 2 ? { score: 74 } : null);

const wrap = (el: ReturnType<typeof h>, c: Partial<LeagueCtx> = {}) =>
  renderToString(h(MemoryRouter, null, h(FeedbackProvider, null, h(LeagueContext.Provider, { value: { ...ctx, ...c } }, el))));
const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('Cómo van todos / la Planilla: solo suma lo aprobado', () => {
  const rows = boardRows(practice, entries, subs, [], { partial: anaHalf, all: true });

  it('ordena por lo que cuenta, y lo por aprobar o a medias no suma', () => {
    expect(rows.map((r) => [r.playerId, r.total, r.pos])).toEqual([
      ['pedro', 658, 1],
      ['luis', 605, 2],
      ['ana', 397, 3],
      ['carmen', 314, 4],
      ['sofia', 168, 5],
      ['jose', 156, 6],
    ]);
    const kinds = (id: string) => rows.find((r) => r.playerId === id)!.cells.map((c) => c.kind + (c.partial ? '…' : ''));
    expect(kinds('ana')).toEqual(['ok', 'ok', 'play…']);
    expect(kinds('carmen')).toEqual(['ok', 'ok', 'pend']);
    expect(kinds('sofia')).toEqual(['ok', 'pend', 'empty']);
    expect(kinds('jose')).toEqual(['ok', 'empty', 'empty']);
  });

  it('en la tabla sin la foto que la liga exige: por aprobar; lo del teléfono: jugando; lo corregido después de enviar manda', () => {
    const at = (ms: number) => ({ toMillis: () => ms }) as Submission['createdAt'];
    const live: LiveScore[] = [{ id: 'l1', eventId: 'E1', playerId: 'luis', scores: [null, null, 230], updatedAt: at(2000) }];
    const r = boardRows(
      practice,
      [entry('pedro', [212, 245], ['foto', null]), entry('luis', [199, 182, null])],
      [sub('s3', 'luis', [null, null, 224], { createdAt: at(1000) })],
      live,
    );
    expect(r.find((x) => x.playerId === 'pedro')!.cells.map((c) => c.kind)).toEqual(['ok', 'pend', 'empty']);
    expect(r.find((x) => x.playerId === 'pedro')!.total).toBe(212);
    expect(r.find((x) => x.playerId === 'luis')!.cells[2]).toEqual({ kind: 'play', score: 230 });
  });

  it('en la práctica salen también los que solo enviaron; en un torneo, solo los inscritos; sin nada, solo con `all`', () => {
    const extra = [sub('s4', 'nuevo', [190])];
    expect(boardRows(practice, [entry('jose', [])], extra, []).map((r) => r.playerId)).toEqual(['nuevo']);
    expect(boardRows(practice, [entry('jose', [])], extra, [], { all: true }).map((r) => r.playerId)).toEqual(['nuevo', 'jose']);
    expect(boardRows({ ...practice, type: 'torneo' }, [entry('jose', [150])], extra, []).map((r) => r.playerId)).toEqual(['jose']);
  });

  it('los empates comparten puesto', () => {
    const r = boardRows(practice, [entry('a', [200]), entry('b', [200]), entry('c', [100])], [], []);
    expect(r.map((x) => x.pos)).toEqual([1, 1, 3]);
  });

  it('la línea de cada uno: lo que no cuenta aparte, «jugando el 3» y sin los vacíos del final', () => {
    expect(boardLine(rows[2].cells)).toEqual([
      { text: '187', faint: false },
      { text: '210', faint: false },
      { text: 'jugando el 3', faint: false },
    ]);
    expect(boardLine(rows.find((r) => r.playerId === 'sofia')!.cells)).toEqual([
      { text: '168', faint: false },
      { text: '181', faint: true },
    ]);
    expect(shortName('Pedro Gómez')).toBe('Pedro G.');
    expect(shortName('Ana María Pérez')).toBe('Ana P.');
    expect(shortName('Cher')).toBe('Cher');
    expect([gamesList([0]), gamesList([0, 1]), gamesList([0, 1, 2])]).toEqual(['1', '1 y 2', '1, 2 y 3']);
  });
});

describe('«Cómo van todos» (Lite)', () => {
  const rows = boardRows(practice, entries, subs, [], { partial: anaHalf });
  const out = wrap(h(EventBoard, { rows, players, me: 'ana', live: true, past: false }));
  const t = text(out);

  it('cada uno con su puesto, sus juegos y el total; tú con «Tú»; lo por aprobar en gris con la nota', () => {
    expect(t).toContain('Cómo van todos En vivo');
    expect(t).toContain('1 PG Pedro Gómez 212 · 245 · 201 658');
    expect(t).toContain('3 AP Ana Pérez Tú 187 · 210 · jugando el 3 397');
    expect(t).toContain('4 CD Carmen Díaz 143 · 171 · 199 314');
    expect(out).toMatch(/<span class="text-faint">199<\/span>/);
    expect(t).toContain('En gris, los que faltan por aprobar · solo suman los aprobados');
  });

  it('ya pasada: «Resultados», sin «En vivo»; sin nada por aprobar, sin la nota', () => {
    const past = text(wrap(h(EventBoard, { rows: boardRows(practice, entries.slice(0, 2), [], []), players, me: null, live: false, past: true })));
    expect(past).toContain('Resultados');
    expect(past).not.toContain('En vivo');
    expect(past).not.toContain('En gris');
  });
});

describe('La Planilla (Pro)', () => {
  const render = (p: { readOnly?: boolean; quick?: boolean } = {}) =>
    wrap(h(GamesTab, { event: practice, entries, players, subs, live: [], onOpen: () => undefined, onOpenMine: () => undefined, ...p }));

  it('ordenada por total, con lo por aprobar en ámbar (no suma) y las vacías con contorno', () => {
    const out = render();
    const t = text(out);
    expect(t).toContain('Jugador J1 J2 J3 Total');
    expect(t.indexOf('Pedro G.')).toBeLessThan(t.indexOf('Luis M.'));
    expect(t.indexOf('Luis M.')).toBeLessThan(t.indexOf('Ana P.'));
    expect(t.indexOf('Sofía R.')).toBeLessThan(t.indexOf('José R.'));
    expect(t).toContain('Carmen D. 143 171 199 314');
    expect(t).toContain('Sofía R. 168 181 168');
    expect(out).toMatch(/aria-label="Carmen Díaz, juego 3: 199, por aprobar" class="[^"]*bg-warn-soft text-warn/);
    expect(out).toMatch(/aria-label="José Ramírez, juego 2: sin anotar" class="[^"]*shadow-\[inset_0_0_0_1\.5px_var\(--line\)\]/);
    expect(t).toContain('Por aprobar (aún no suma) Jugando');
  });

  it('las herramientas con texto (Jugador, Juego 4, Leer foto) y «Escribir los puntajes a mano»; la planilla de siempre no sale', () => {
    const out = render();
    const t = text(out);
    expect(t).toContain('Jugador Juego 4 Leer foto');
    expect(t).toContain('Escribir los puntajes a mano');
    expect(out).not.toContain('aria-label="Pedro Gómez juego 1"');
    // «Escribir a mano»: la de siempre, con una casilla por juego (Enter baja al siguiente).
    const quick = render({ quick: true });
    expect(quick).toContain('aria-label="Pedro Gómez juego 1"');
    expect(text(quick)).toContain('Escribir a mano Ver la planilla');
  });

  it('solo mirar (quien no organiza): sin herramientas ni casillas que se toquen', () => {
    const out = render({ readOnly: true });
    expect(text(out)).not.toContain('Leer foto');
    expect(text(out)).not.toContain('Escribir los puntajes a mano');
    expect(out).not.toMatch(/<button[^>]*aria-label="Pedro Gómez, juego 1/);
  });
});

describe('Por aprobar (arriba de la Planilla)', () => {
  it('con un toque: lo leído (o lo anotado) en su juego; si no coincide, no cabe o falta la foto exigida, se revisa', () => {
    expect(quickApproval({ scores: [null, 181], scanned: [null, 181], photoId: 'f' }, 3, true)).toEqual({ values: { 1: 181 }, games: [1] });
    expect(quickApproval({ scores: [187, 210], scanned: null, photoId: null }, 3, false)).toEqual({ values: { 0: 187, 1: 210 }, games: [0, 1] });
    expect(quickApproval({ scores: [187], scanned: [178], photoId: 'f' }, 3, true)).toBeNull();
    expect(quickApproval({ scores: [null, null, null, 200], scanned: null, photoId: 'f' }, 3, true)).toBeNull();
    expect(quickApproval({ scores: [187], scanned: null, photoId: null }, 3, true)).toBeNull();
    expect(quickApproval({ scores: [400], scanned: null, photoId: 'f' }, 3, true)).toBeNull();
  });

  it('el encabezado dice cuántos y con foto', () => {
    expect(approvalTitle([{ photoId: 'a' }, { photoId: 'b' }])).toBe('Por aprobar · 2 con foto');
    expect(approvalTitle([{ photoId: 'a' }, { photoId: null }])).toBe('Por aprobar · 2 · 1 con foto');
    expect(approvalTitle([{ photoId: null }])).toBe('Por aprobar · 1 sin foto');
  });

  it('cada envío con su foto, quién y qué juego, Rechazar / Aprobar; arriba «Aprobar todo»', () => {
    const out = wrap(h(ApprovalCard, { event: practice, subs, entries, players }));
    const t = text(out);
    expect(t).toContain('Por aprobar · 2 con foto Aprobar todo');
    // «Juego 2» y, para un teléfono angosto, «J2» (se ve uno u otro según el ancho).
    expect(t).toContain('Sofía R. Juego 2 J2 · 181 Rechazar Aprobar');
    expect(t).toContain('Carmen D. Juego 3 J3 · 199 Rechazar Aprobar');
    expect(out).toContain('aria-label="Ver la foto de Sofía Rodríguez"');
  });

  it('el que hay que revisar lleva «Revisar» (Organizar › Aprobar); sin nada pendiente no sale', () => {
    const mismatch = [sub('s9', 'sofia', [null, 181], { scanned: [null, 171] })];
    const t = text(wrap(h(ApprovalCard, { event: practice, subs: mismatch, entries, players })));
    expect(t).toContain('Sofía R. Juego 2 J2 · 181 Rechazar Revisar');
    expect(t).not.toContain('Aprobar todo');
    expect(text(wrap(h(ApprovalCard, { event: practice, subs: [], entries, players })))).not.toContain('Por aprobar');
  });
});

describe('«Tus juegos»: una línea con lo que ya cuenta y lo que falta', () => {
  const tabla = (score: number, counted = true) => ({ kind: 'tabla' as const, score, counted });
  it('solo las excepciones llevan marca', () => {
    expect(myGamesStatus([tabla(187), tabla(210), { kind: 'vacio' }])).toEqual({ tone: 'ok', text: 'Los juegos 1 y 2 ya cuentan en la liga' });
    expect(myGamesStatus([tabla(187), tabla(210), tabla(190)])).toEqual({ tone: 'ok', text: 'Tus juegos ya cuentan en la liga' });
    expect(myGamesStatus([tabla(187), tabla(210), { kind: 'enviado', score: 199 }])?.text).toBe('Los juegos 1 y 2 ya cuentan · el 3, por aprobar');
    expect(myGamesStatus([{ kind: 'enviado', score: 199 }, { kind: 'vacio' }, { kind: 'vacio' }])?.text).toBe('El juego 1 está por aprobar');
    expect(myGamesStatus([tabla(150, false), { kind: 'telefono', score: 200 }, { kind: 'vacio' }])?.text).toBe('El juego 1 está por aprobar · el 2, en tu teléfono');
    expect(myGamesStatus([{ kind: 'telefono', score: 200 }, { kind: 'vacio' }])).toEqual({ tone: 'accent', text: 'El juego 1 está en tu teléfono, sin enviar' });
    expect(myGamesStatus([{ kind: 'vacio' }, { kind: 'vacio' }])).toBeNull();
  });
});

describe('La fecha del evento', () => {
  it('«Miércoles 7 oct» (Lite) o «Mié 7 oct» (Pro), con el año si no es este', () => {
    expect(eventDay('2026-10-07', TODAY)).toBe('Miércoles 7 oct');
    expect(eventDay('2026-10-07', TODAY, true)).toBe('Mié 7 oct');
    expect(eventDay('2025-03-11', TODAY)).toBe('Martes 11 mar 2025');
  });

  it('la hora: la del evento, o la de la liga si cae en uno de sus días', () => {
    expect(eventTime({ date: '2026-10-06', startTime: null }, league)).toBe('7:30 pm');
    expect(eventTime({ date: '2026-10-07', startTime: null }, league)).toBeNull();
    expect(eventTime({ date: '2026-10-07', startTime: '20:00:00' }, league)).toBe('8:00 pm');
  });

  it('Lite con la bolera; Pro con los juegos; el torneo con su handicap', () => {
    const tue = { ...practice, date: '2026-10-06' };
    expect(eventMeta(tue, league, TODAY, false)).toBe('Martes 6 oct · 7:30 pm · Bolera Sambil');
    expect(eventMeta(tue, league, TODAY, true)).toBe('Mar 6 oct · 7:30 pm · 3 juegos');
    expect(eventMeta({ ...tue, type: 'torneo', hcpPercent: 80, hcpBase: 230, teamSize: 3 }, league, TODAY, false)).toBe(
      'Martes 6 oct · 7:30 pm · 3 juegos · Hcp 80 % de 230 · Equipos de 3',
    );
  });
});
