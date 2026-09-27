import { describe, expect, it } from 'vitest';
import {
  busy,
  deadlineText,
  isOpenChallenge,
  ladderConfigJson,
  ladderOrder,
  myEntrants,
  outcomeText,
  overdue,
  parseLadderConfig,
  relDays,
  targetsFor,
  toChallenge,
  toRung,
  whyNot,
  type LadderChallenge,
} from './ladder';

const NOW = Date.parse('2026-10-05T12:00:00Z');
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

const ch = (over: Partial<LadderChallenge>): LadderChallenge => ({
  id: 'c1',
  eventId: 'E',
  challenger: 'e',
  challenged: 'b',
  challengerPos: 5,
  challengedPos: 2,
  matchId: 'm1',
  status: 'pending',
  acceptBy: iso(NOW + 2 * DAY),
  playBy: iso(NOW + 6 * DAY),
  acceptedAt: null,
  resolvedAt: null,
  winner: null,
  note: null,
  createdAt: iso(NOW - DAY),
  ...over,
});

describe('configuración de la escalera', () => {
  it('por defecto: hasta 3 arriba, 3 días para aceptar, 7 para jugar, abierta', () => {
    expect(parseLadderConfig({})).toEqual({ v: 1, format: 'escalera', doubles: false, maxUp: 3, acceptDays: 3, playDays: 7, open: true });
    const c = parseLadderConfig({ doubles: true, maxUp: 99, acceptDays: 0, open: false, rules: { match: { sport: 'tennis', doubles: true } } });
    expect(c).toMatchObject({ doubles: true, maxUp: 20, acceptDays: 1, open: false, rules: { match: { doubles: true } } });
    expect(parseLadderConfig(ladderConfigJson(c))).toEqual(c);
  });
});

describe('filas', () => {
  it('puestos y retos de la base', () => {
    const r = toRung({ event_id: 'E', entrant_id: 'p1', position: 2, player_id: 'p1', team_id: null, joined_at: '2026-10-01T00:00:00Z' });
    expect(r).toEqual({ entrantId: 'p1', position: 2, playerId: 'p1', teamId: null, joinedAt: '2026-10-01T00:00:00Z' });
    expect(ladderOrder([{ ...r, position: 2 }, { ...r, entrantId: 'p0', position: 1 }])).toEqual(['p0', 'p1']);
    const c = toChallenge({
      id: 'c',
      event_id: 'E',
      challenger: 'a',
      challenged: 'b',
      challenger_pos: 3,
      challenged_pos: 1,
      match_id: null,
      status: 'raro',
      accept_by: '2026-10-08T00:00:00Z',
      play_by: '2026-10-12T00:00:00Z',
      accepted_at: null,
      resolved_at: null,
      winner: null,
      note: null,
      created_at: '2026-10-05T00:00:00Z',
    });
    expect(c.status).toBe('cancelled');
    expect(isOpenChallenge(c)).toBe(false);
  });
});

describe('a quién puedo retar', () => {
  const order = ['a', 'b', 'c', 'd', 'e', 'f'];
  it('hasta K arriba, sin los que tienen un reto abierto', () => {
    expect(targetsFor(order, 'e', [], 3)).toEqual(['b', 'c', 'd']);
    expect(targetsFor(order, 'e', [ch({ challenger: 'f', challenged: 'c' })], 3)).toEqual(['b', 'd']);
    expect(targetsFor(order, 'a', [], 3)).toEqual([]);
    expect(targetsFor(order, 'e', [ch({})], 3)).toEqual([]);
    expect(targetsFor(order, 'e', [ch({ status: 'played', winner: 'e' })], 1)).toEqual(['d']);
  });

  it('por qué no (texto del motor de formatos)', () => {
    expect(whyNot(order, 'e', 'a', [], 3)).toBe('Solo puedes retar hasta 3 puestos más arriba.');
    expect(whyNot(order, 'b', 'e', [], 3)).toBe('Solo puedes retar a alguien que esté más arriba.');
    expect(whyNot(order, 'e', 'c', [ch({ challenger: 'd', challenged: 'c' })], 3)).toBe('Uno de los dos ya tiene un reto pendiente.');
    expect(whyNot(order, 'x', 'a', [], 3)).toBe('Los dos tienen que estar en la escalera.');
  });

  it('ocupados y mis participantes', () => {
    expect([...busy([ch({}), ch({ id: 'c2', challenger: 'x', challenged: 'y', status: 'cancelled' })])].sort()).toEqual(['b', 'e']);
    expect(myEntrants(['t1', 'p1', 't2'], 'p1', ['t2', 't9'])).toEqual(['p1', 't2']);
    expect(myEntrants(['t1'], null, ['t1'])).toEqual([]);
  });
});

describe('plazos y textos', () => {
  it('días relativos', () => {
    expect(relDays(iso(NOW + 2 * DAY), NOW)).toBe('en 2 días');
    expect(relDays(iso(NOW + DAY), NOW)).toBe('mañana');
    expect(relDays(iso(NOW + 3600_000), NOW)).toBe('hoy');
    expect(relDays(iso(NOW - 3 * DAY), NOW)).toBe('hace 3 días');
  });

  it('plazo del reto y vencido', () => {
    expect(deadlineText(ch({}), NOW)).toBe('Para aceptar: en 2 días');
    expect(deadlineText(ch({ status: 'accepted' }), NOW)).toBe('Para jugar: en 6 días');
    expect(deadlineText(ch({ status: 'played' }), NOW)).toBeNull();
    expect(overdue(ch({ acceptBy: iso(NOW - 1) }), NOW)).toBe(true);
    expect(overdue(ch({ status: 'accepted', acceptBy: iso(NOW - DAY) }), NOW)).toBe(false);
  });

  it('cómo terminó', () => {
    const nameOf = (id: string) => id.toUpperCase();
    expect(outcomeText(ch({ status: 'played', winner: 'e' }), nameOf)).toBe('E ganó y sube al 2.º');
    expect(outcomeText(ch({ status: 'played', winner: 'b' }), nameOf)).toBe('B defendió su puesto');
    expect(outcomeText(ch({ status: 'walkover', winner: 'e' }), nameOf)).toBe('W.O.: E sube al 2.º');
    expect(outcomeText(ch({ status: 'cancelled', note: 'Lluvia' }), nameOf)).toBe('Cancelado: Lluvia');
  });
});
