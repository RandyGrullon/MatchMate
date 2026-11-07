/**
 * La lógica de Organizar › Aprobar juegos (approvals.ts), la misma en la web y en la app del teléfono: el orden, qué
 * envío está listo para «Aprobar todo», cómo quedan sus juegos, los textos de la confirmación y del aviso, y lo que se
 * ve de la lectura de la foto con IA. Datos ficticios.
 */
import { describe, expect, it } from 'vitest';
import type { BowlingEvent, Entry, Player, Submission } from '../lib/types';
import {
  approvalDraft,
  approveAllPrompt,
  approvedAllText,
  approvedText,
  defaultStart,
  gameRows,
  gamesLine,
  isGone,
  isReady,
  isUnverified,
  listTitle,
  proposalOf,
  readDiffers,
  readOutcome,
  readingView,
  scanRowLabel,
  showEventOf,
  sortSubmissions,
  tableRows,
  targetEvent,
  targetGames,
  whereText,
} from './approvals';

const at = (ms: number) => ({ toMillis: () => ms });
const sub = (p: Partial<Submission> = {}): Submission => ({
  id: 's1',
  playerId: 'p1',
  eventId: 'e1',
  date: null,
  scores: [181, 204],
  scanned: null,
  photoId: 'f1',
  status: 'pendiente',
  note: null,
  createdAt: at(1000),
  ...p,
});
const event = (p: Partial<BowlingEvent> = {}) => ({ id: 'e1', type: 'practica', name: '', date: '2026-11-03', games: 3, ...p }) as BowlingEvent;
const player = { id: 'p1', name: 'Jugador Uno' } as Player;
const entry = (photos: (string | null)[]) => ({ scores: [], photos }) as unknown as Entry;

describe('la lista', () => {
  it('el más viejo primero y, de más de un evento o fecha, cada uno dice de cuál es', () => {
    const list = sortSubmissions([sub({ id: 'b', createdAt: at(2000) }), sub({ id: 'a', createdAt: at(1000) })]);
    expect(list.map((s) => s.id)).toEqual(['a', 'b']);
    expect(showEventOf(list)).toBe(false);
    expect(showEventOf([...list, sub({ eventId: null, date: '2026-11-01' })])).toBe(true);
  });

  it('el encabezado con las fotos', () => {
    expect(listTitle([sub(), sub()])).toBe('Por aprobar · 2 con foto');
    expect(listTitle([sub(), sub({ photoId: null })])).toBe('Por aprobar · 1 con foto, 1 sin foto');
  });

  it('por fecha va a la práctica de ese día si ya existe; si no, se crea al aprobar', () => {
    const events = [event({ id: 'e9', date: '2026-11-01' })];
    expect(targetEvent(sub({ eventId: null, date: '2026-11-01' }), events)?.id).toBe('e9');
    expect(targetEvent(sub({ eventId: null, date: '2026-11-02' }), events)).toBeUndefined();
    expect(whereText(undefined, '2026-11-02')).toMatch(/^Práctica .+ · se crea al aprobar$/);
  });
});

describe('un envío', () => {
  it('propone lo leído por la IA y, si no hay, lo anotado; marca lo que no coincide', () => {
    const rows = gameRows(sub({ scores: [181, 204], scanned: [181, 210, 190] }));
    expect(proposalOf(rows)).toEqual(['181', '210', '190']);
    const table = tableRows(rows, 0, 3, entry(['ok', null, null]));
    expect(table.map((r) => [r.slot, r.mismatch, r.replaces, r.outside])).toEqual([
      [0, false, true, false],
      [1, true, false, false],
      [2, false, false, false],
    ]);
  });

  it('en un evento cada juego va en su lugar; por fecha, en los primeros libres; una práctica nueva tiene al menos 3', () => {
    expect(defaultStart(sub(), entry(['ok', null, null]), 3, 2)).toBe(0);
    expect(defaultStart(sub({ eventId: null, date: '2026-11-01' }), entry(['ok', null, null]), 3, 2)).toBe(1);
    expect(targetGames(undefined, 2)).toBe(3);
    expect(targetGames(event({ games: 4 }), 2)).toBe(4);
  });

  it('lo que se guarda: solo lo que cabe en el evento, y si algún número no vale', () => {
    expect(approvalDraft(['181', '', '204'], 1, 3)).toEqual({ invalid: false, toSave: 1, values: { 1: 181 } });
    expect(approvalDraft(['181', '400'], 0, 3).invalid).toBe(true);
  });

  it('la línea de los juegos', () => {
    expect(gamesLine(['', '181'], 0)).toEqual([{ slot: 2, v: '181' }]);
    expect(gamesLine(['187', '210'], 0).length).toBe(2);
    expect(gamesLine([' '], 0)).toEqual([]);
  });

  it('listo para «Aprobar todo»: con jugador y evento, sin errores, con juegos y con la foto que se exige', () => {
    const base = { gone: false, invalid: false, toSave: 2, unverified: false };
    expect(isReady(base)).toBe(true);
    expect(isReady({ ...base, unverified: true })).toBe(false);
    expect(isReady({ ...base, toSave: 0 })).toBe(false);
    expect(isUnverified(sub({ photoId: null }), { requirePhoto: true })).toBe(true);
    expect(isUnverified(sub({ photoId: null }), { requirePhoto: false })).toBe(false);
    expect(isGone(sub(), undefined, player)).toBe(true);
    expect(isGone(sub({ eventId: null, date: '2026-11-01' }), undefined, player)).toBe(false);
    expect(isGone(sub(), event(), undefined)).toBe(true);
  });

  it('lo que llegó leído y no coincide con lo que se va a guardar', () => {
    expect(readDiffers(true, ['181', '204'], ['181', '200'])).toBe(true);
    expect(readDiffers(true, ['181'], ['181'])).toBe(false);
    expect(readDiffers(false, ['181'], ['1'])).toBe(false);
  });
});

describe('los textos', () => {
  it('la confirmación de «Aprobar todo» y el aviso final', () => {
    expect(approveAllPrompt(1, 1, 0)).toEqual({ title: '¿Aprobar el envío?', message: 'Se guardan 1 juego como están ahora y cuenta en la tabla.', confirmText: 'Aprobar todo' });
    expect(approveAllPrompt(2, 3, 2).message).toBe('Se guardan 3 juegos como están ahora y cuentan en la tabla. 2 quedan para que los revises uno por uno (sin foto o con algo por corregir).');
    expect(approveAllPrompt(3, 4, 1).title).toBe('¿Aprobar los 3 envíos?');
    expect(approveAllPrompt(3, 4, 1).message).toContain(' Uno queda para que lo revises uno por uno');
    expect(approvedAllText(3, 2)).toBe('Aprobados: 3 juegos de 2 jugadores');
    expect(approvedText(1, 'Jugador Uno')).toBe('Aprobado: 1 juego de Jugador Uno');
  });
});

describe('la lectura de la foto', () => {
  const rows = [
    { name: 'Jugador Uno', handicap: null, games: [181, 204, null], total: null, matchesTotal: null },
    { name: 'Jugadora Dos', handicap: null, games: [190, null, null], total: null, matchesTotal: null },
  ];
  const view = (p: Partial<Parameters<typeof readingView>[0]>) => readingView({ job: null, read: null, saving: false, hasRead: false, fresh: false, hasPhoto: true, name: 'Jugador Uno', ...p });

  it('sin leer: recién enviada espera al teléfono del jugador; si no, «Leer con IA»', () => {
    expect(view({ fresh: true }).line?.text).toBe('Puede que el teléfono de Jugador Uno todavía esté leyendo la foto.');
    expect(view({}).line?.kind).toBe('sin-leer');
    expect(view({}).button).toBe('Leer con IA');
    expect(view({ hasPhoto: false }).button).toBeNull();
  });

  it('ya leída: solo «Leer de nuevo o elegir otra fila»', () => {
    expect(view({ hasRead: true }).again).toBe(true);
  });

  it('leyendo, con error y para elegir la fila', () => {
    const read = { jobId: 'lectura-1', pick: true };
    expect(view({ read, job: { status: 'leyendo' } }).button).toBeNull();
    expect(view({ read, job: { status: 'error', message: 'No se pudo escanear la foto.' }, hasRead: true })).toMatchObject({
      line: { kind: 'error', text: 'No se pudo escanear la foto. Revísala tú.' },
      button: 'Intentar de nuevo',
    });
    expect(view({ read, job: { status: 'listo', rows } }).line?.text).toBe('¿Cuál fila de la foto es la de Jugador Uno?');
    expect(view({ read: { ...read, pick: false }, job: { status: 'listo', rows }, name: 'Jugador Tres' }).line?.text).toBe('No encontramos a Jugador Tres en la foto. ¿Cuál fila es?');
  });

  it('al terminar: su fila se pone sola, se propone para elegir o la elige el admin', () => {
    expect(readOutcome('Jugador Uno', rows, false)).toEqual({ apply: rows[0] });
    expect(readOutcome('Jugadora Dos', rows, true)).toEqual({ picked: 1 });
    expect(readOutcome('Jugador Tres', rows, false)).toBeNull();
    expect(scanRowLabel(rows[0])).toBe('Jugador Uno: 181 · 204 · –');
  });
});
