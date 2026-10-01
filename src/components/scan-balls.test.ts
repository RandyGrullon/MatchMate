/**
 * La bola de cada juego al verificar con foto (renderToString con las bolas de la cuenta en la caché): solo la fila de
 * quien verifica (su jugador) tiene la bola de cada juego que cabe en el evento (también sin bolas: con un + para agregar
 * una), con la que tenía el juego (la del servidor con la cola encima, como en la hoja del evento) o la última que usó;
 * la fila de otro jugador, una fila sin marcar y unas bolas que no se saben no tienen bola.
 */
import { createElement as h, useState } from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ball, BallGame } from '../lib/balls';
import { ballKeys, type MyBalls } from '../lib/data/balls';
import { queryClient } from '../lib/data/client';
import type { BowlingEvent, Entry } from '../lib/types';
import { ScanGames, useOwnBalls } from './ScanModal';

/** La cuenta que entró y lo que está en la cola sin salir (sin abrir la cola de verdad: aquí no hay servidor). */
const session = vi.hoisted(() => ({ uid: null as string | null, queued: [] as Record<string, unknown>[] }));
vi.mock('../lib/data/client', async (orig) => ({
  ...(await orig<typeof import('../lib/data/client')>()),
  getUserId: () => session.uid,
  currentOutbox: () => ({
    listPending: () => session.queued.map((args, seq) => ({ fn: 'set_game_balls', args, seq, status: 'pending' })),
    listFailed: () => [],
  }),
}));

const UID = 'u-foto';
/** El jugador de quien verifica (el admin que también juega) y otro. */
const ME = 'p-yo';
const OTHER = 'p-otro';

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');
const count = (html: string, re: RegExp) => html.match(new RegExp(re.source, 'g'))?.length ?? 0;
const noop = () => undefined;

const ball = (id: string, name: string, color: string, extra: Partial<Ball> = {}): Ball => ({
  id,
  name,
  brand: '',
  weight: 15,
  color,
  cover: null,
  drilledOn: null,
  resurfacedOn: null,
  retired: false,
  createdAt: null,
  updatedAt: null,
  ...extra,
});
const phaze = ball('a', 'Phaze II', '#1d4ed8');
const spare = ball('b', 'Spare', '#f8fafc', { weight: 14 });

const event = (id: string): BowlingEvent => ({ id, type: 'practica', name: '', date: '2026-09-28', games: 3, hcpBase: 0, hcpPercent: 0, teams: {}, playerCount: 2 });

const entry = (eventId: string, playerId: string, scores: (number | null)[]): Entry => ({
  id: `${eventId}-${playerId}`,
  eventId,
  playerId,
  teamId: null,
  average: 180,
  handicapOverride: null,
  scores,
  photos: scores.map(() => null),
});

interface Row {
  key: string;
  playerId: string;
  start: number;
  values: string[];
  include: boolean;
}
const row = (key: string, playerId: string, extra: Partial<Row> = {}): Row => ({ key, playerId, start: 0, values: ['200', '190', '180'], include: true, ...extra });

/** Las filas de la hoja como las dibuja ScanModal (cada una en su <section data-row>), con las bolas de quien verifica. */
function Rows({ ev, entries, rows, me }: { ev: BowlingEvent; entries: Entry[]; rows: Row[]; me: string | null }) {
  const own = useOwnBalls(true, ev, entries, rows, me);
  return h(
    'div',
    null,
    rows.map((r) =>
      h(
        'section',
        { key: r.key, 'data-row': r.key },
        h(ScanGames, { row: r, games: ev.games, entry: entries.find((e) => e.playerId === r.playerId) ?? null, own, onValues: noop }),
      ),
    ),
  );
}

const render = (ev: BowlingEvent, rows: Row[], entries: Entry[] = [], me: string | null = ME) => renderToString(h(Rows, { ev, entries, rows, me }));

/** Lo de una fila. */
const rowOf = (html: string, key: string) => html.match(new RegExp(`<section data-row="${key}">([\\s\\S]*?)</section>`))?.[1] ?? '';

const CHIP = /aria-label="Bola del juego \d+: [^"]*"/;

const seed = (mine: MyBalls, eventId?: string, games: BallGame[] = []) => {
  queryClient.setQueryData(ballKeys.list(UID), mine);
  if (eventId) queryClient.setQueryData(ballKeys.games(UID, eventId), games);
};

const tag = (eventId: string, game: number, b: string): BallGame => ({ ball: b, kind: 'event', ref: eventId, game, date: '2026-09-28', score: 190, frames: null, counted: true });

beforeEach(() => {
  session.uid = UID;
  session.queued = [];
});

describe('la bola de cada juego al verificar con foto', () => {
  it('mi fila: un botón de bola en cada juego, con la que tenía, sin bola o la última que usé; la de otro, ninguno', () => {
    const ev = event('e1');
    // J1 anotado sin bola aquí (lo anotó el admin), J2 con la Spare, J3 sin jugar.
    seed({ balls: [phaze, spare], lastUsed: 'a' }, 'e1', [tag('e1', 1, 'b')]);
    const out = render(ev, [row('otro', OTHER), row('yo', ME)], [entry('e1', ME, [200, 190, null]), entry('e1', OTHER, [150, null, null])]);
    const mine = rowOf(out, 'yo');
    expect(count(mine, CHIP)).toBe(3);
    expect(mine).toContain('aria-label="Bola del juego 1: sin bola"');
    expect(mine).toContain('aria-label="Bola del juego 2: Spare (14 lb)"');
    expect(mine).toContain('aria-label="Bola del juego 3: Phaze II (15 lb)"');
    // Dibujadas con su diseño (BallArt), con 44 px para el dedo.
    expect(mine).toContain('fill="#f8fafc"');
    expect(mine).toContain('fill="#1d4ed8"');
    expect(mine).toContain('h-11');
    expect(text(mine)).toContain('Son tus juegos: debajo de cada uno, anota con qué bola lo tiraste.');
    // La fila de otro jugador: sus juegos no son de esta cuenta (set_game_balls anotaría los míos).
    const other = rowOf(out, 'otro');
    expect(other).toContain('aria-label="Juego 1"');
    expect(count(other, CHIP)).toBe(0);
    expect(text(other)).not.toContain('Son tus juegos');
  });

  it('los juegos que no caben en el evento (fuera) no llevan bola', () => {
    seed({ balls: [phaze, spare], lastUsed: 'a' }, 'e1', []);
    const out = rowOf(render(event('e1'), [row('yo', ME, { start: 1 })]), 'yo');
    // Desde J2: J2 y J3 caben, el tercero queda fuera.
    expect(text(out)).toContain('fuera');
    expect(count(out, CHIP)).toBe(2);
    expect(out).toContain('aria-label="Bola del juego 2: Phaze II (15 lb)"');
    expect(out).toContain('aria-label="Bola del juego 3: Phaze II (15 lb)"');
    expect(out).not.toContain('Bola del juego 4');
  });

  it('sin bolas en la cuenta: igual sale, con un + para agregar una (sin esperar a leer las de los juegos)', () => {
    // Las bolas de los juegos de e3 no están en la caché: sin bolas no hace falta leerlas (ninguno tenía).
    seed({ balls: [], lastUsed: null });
    const out = rowOf(render(event('e3'), [row('yo', ME)], [entry('e3', ME, [200, null, null])]), 'yo');
    expect(count(out, CHIP)).toBe(3);
    expect(out).toContain('aria-label="Bola del juego 1: sin bola. Toca para agregar una"');
    expect(out).toContain('lucide-plus');
    // Todas retiradas: lo mismo (no hay ninguna para elegir), pero sí hay que leer las de los juegos.
    seed({ balls: [ball('v', 'Vieja', '#111827', { retired: true })], lastUsed: 'v' }, 'e3', []);
    const retired = rowOf(render(event('e3'), [row('yo', ME)]), 'yo');
    expect(retired).toContain('aria-label="Bola del juego 3: sin bola. Toca para agregar una"');
  });

  it('si no se saben las bolas que tenían mis juegos (o mis bolas), no sale: guardar no las pisa', () => {
    seed({ balls: [phaze, spare], lastUsed: 'a' });
    // Las de e2 no se han leído.
    const unknown = render(event('e2'), [row('yo', ME)], [entry('e2', ME, [200, null, null])]);
    expect(count(unknown, CHIP)).toBe(0);
    expect(unknown).toContain('aria-label="Juego 1"');
    expect(text(unknown)).not.toContain('Son tus juegos');
    // Otra cuenta cuyas bolas no se han leído.
    session.uid = 'u-sin-leer';
    expect(count(render(event('e1'), [row('yo', ME)]), CHIP)).toBe(0);
  });

  it('sin jugador propio (un anotador) o con mi fila sin marcar, ninguna fila lleva bola', () => {
    seed({ balls: [phaze, spare], lastUsed: 'a' }, 'e1', []);
    expect(count(render(event('e1'), [row('yo', ME), row('otro', OTHER)], [], null), CHIP)).toBe(0);
    expect(count(render(event('e1'), [row('yo', ME, { include: false })]), CHIP)).toBe(0);
    // Sin sesión tampoco.
    session.uid = null;
    expect(count(render(event('e1'), [row('yo', ME)]), CHIP)).toBe(0);
  });

  it('lo que está en la cola sin llegar va encima de lo del servidor: elegir la del servidor también se guarda', () => {
    // En el servidor el J2 tiene la Spare; en la hoja del evento le puso la Phaze II y eso está en la cola.
    seed({ balls: [phaze, spare], lastUsed: 'a' }, 'e1', [tag('e1', 1, 'b')]);
    session.queued = [{ p_kind: 'event', p_ref: 'e1', p_balls: { 1: 'a' } }];
    const entries = [entry('e1', ME, [200, 190, null])];
    expect(rowOf(render(event('e1'), [row('yo', ME)], entries), 'yo')).toContain('aria-label="Bola del juego 2: Phaze II (15 lb)"');
    // Vuelve a elegir la Spare (la del servidor): va a la cola (si no, llegaría la Phaze II de la cola).
    let update: Record<string, string | null> | null = null;
    function Picks() {
      const own = useOwnBalls(true, event('e1'), entries, [row('yo', ME)], ME);
      const [step, setStep] = useState(0);
      if (step === 0) {
        own.onPick(1, 'b');
        setStep(1);
      }
      update = own.update({ 0: 200, 1: 190, 2: 180 });
      return null;
    }
    renderToString(h(Picks));
    // El J1 (anotado sin bola) no cambia; el J3 lleva la última que usó.
    expect(update).toEqual({ 1: 'b', 2: 'a' });
  });
});
