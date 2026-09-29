import { describe, expect, it } from 'vitest';
import type { PrizeSlot, TournamentPrize } from '../lib/data/prizes';
import type { BowlingEvent, Entry } from '../lib/types';
import type { LeagueBadge } from '../lib/data/leagueBadges';
import { cardModel, correctionWindow } from './card';
import { bowlingComp } from './catalog';
import { bowlingPodium, placeOf, refsOf } from './providers';
import { bowlingReady } from './ready';

const event: BowlingEvent = {
  id: 'E1',
  type: 'torneo',
  name: 'Copa',
  date: '2026-10-12',
  games: 3,
  hcpBase: 230,
  hcpPercent: 80,
  teams: { A: { name: 'Los Strikers', order: 1 }, B: { name: 'Los Spares', order: 2 } },
  playerCount: 4,
};

const entry = (id: string, playerId: string, teamId: string | null, average: number, scores: (number | null)[], photos: (string | null)[] = ['f', 'f', 'f']): Entry => ({
  id,
  eventId: 'E1',
  playerId,
  teamId,
  average,
  handicapOverride: null,
  scores,
  photos,
});

// Scratch: Strikers 600 + 450 = 1050, Spares 570 + 540 = 1110. Handicap (80 % de 230 − prom.): ana 24, luis 64, pedro 32, rosa 40.
const entries = [
  entry('e1', 'ana', 'A', 200, [200, 200, 200]),
  entry('e2', 'luis', 'A', 150, [150, 150, 150]),
  entry('e3', 'pedro', 'B', 190, [190, 190, 190]),
  entry('e4', 'rosa', 'B', 180, [180, 180, 180]),
  entry('e5', 'tono', null, 150, [299, null, null], [null, null, null]),
];
const names: Record<string, string> = { ana: 'Ana', luis: 'Luis', pedro: 'Pedro', rosa: 'Rosa', tono: 'Toño' };
const nameOf = (id: string) => names[id] ?? 'Jugador';

describe('el podio del boliche en el teléfono (el mismo que el del servidor)', () => {
  it('equipos por scratch e individual con handicap, con quiénes jugaron y los pinos', () => {
    const podium = bowlingPodium(event, entries, nameOf);
    expect(podium({ category: 'equipo', division: '', place: 1 })).toEqual({
      status: 'listo',
      units: [{ ref: 't:B', name: 'Los Spares', teamId: 'B', players: [{ id: 'pedro', name: 'Pedro' }, { id: 'rosa', name: 'Rosa' }], detail: '1110 pinos' }],
    });
    expect(podium({ category: 'equipo', division: '', place: 2 })?.units.map((u) => u.ref)).toEqual(['t:A']);
    // Individual con handicap: ana 672, pedro 666, rosa 660, luis 642 (el borrador de Toño no cuenta).
    expect([1, 2, 3].map((place) => refsOf(podium({ category: 'individual', division: '', place: place as 1 | 2 | 3 })!.units))).toEqual([['p:ana'], ['p:pedro'], ['p:rosa']]);
    expect(podium({ category: 'individual', division: 'A', place: 1 })).toBeNull();
    expect(podium({ category: 'pareja', division: '', place: 1 })).toBeNull();
  });

  it('antes del día del torneo, o sin juegos verificados: sin resultado', () => {
    expect(bowlingPodium(event, entries, nameOf, { ready: false })({ category: 'individual', division: '', place: 1 })).toEqual({ status: 'sin_resultado', units: [] });
    expect(bowlingPodium(event, [], nameOf)({ category: 'equipo', division: '', place: 1 })?.status).toBe('sin_resultado');
    expect(bowlingReady(event, entries, '2026-10-11')).toEqual({ ready: false, waitText: 'Se entregan cuando termine el torneo' });
    expect(bowlingReady(event, entries, '2026-10-12').ready).toBe(true);
    expect(bowlingReady(event, [entries[4]], '2026-10-13')).toEqual({ ready: false, waitText: 'Se entregan cuando haya juegos verificados' });
  });

  it('empates: el lugar de abajo queda vacío; más de 3, empate múltiple', () => {
    const rows = [1, 1, 3, 3, 3, 3].map((pos, i) => ({ row: `x${i}`, pos }));
    const u = (r: string) => ({ ref: `p:${r}`, name: r, teamId: null, players: [] });
    expect(placeOf(rows, 1, u)).toMatchObject({ status: 'listo', units: [{ ref: 'p:x0' }, { ref: 'p:x1' }] });
    expect(placeOf(rows, 2, u)).toEqual({ status: 'vacio', units: [] });
    expect(placeOf(rows, 3, u).status).toBe('empate_multiple');
    expect(placeOf([], 1, u).status).toBe('sin_resultado');
  });
});

describe('la tarjeta con el podio del teléfono', () => {
  const comp = bowlingComp('L1', event);
  const champ: LeagueBadge = {
    id: 'B1', leagueId: 'L1', name: 'Campeón', description: '', shape: 'shield', palette: 'oro', color: null, icon: 'trophy', topText: 'TORNEO', periodText: '',
    template: 'champion', limitKind: 'unica', byTeam: false, status: 'activa', createdBy: null, createdAt: '', updatedAt: '', given: 0, active: 0, locked: false, openReports: null,
  };
  const slot = (id: string, category: PrizeSlot['category'], over: Partial<PrizeSlot> = {}): PrizeSlot => ({
    id, category, division: '', label: '', place: 1, badgeId: 'B1', title: '', winners: [], verified: false, deliveredAt: null, deliveredBy: null, editableUntil: null, updatedAt: '', ...over,
  });
  const prize = (slots: PrizeSlot[], over: Partial<TournamentPrize> = {}): TournamentPrize => ({
    id: 'Z', leagueId: 'L1', scope: 'evento', refId: 'E1', period: 'OCT 2026', closedAt: null, closedBy: null, createdAt: '', updatedAt: '', slots, ...over,
  });
  const podium = bowlingPodium(event, entries, nameOf);

  it('elegidos: «El campeón se lleva…» con dos podios y quién va ganando', () => {
    const m = cardModel(comp, prize([slot('S1', 'equipo'), slot('S2', 'individual')]), [champ], { podium });
    expect(m).toMatchObject({ state: 'elegidos', heading: 'El campeón se lleva…', allDelivered: false, podiumChanged: false });
    expect(m.sections.map((s) => s.title)).toEqual(['Equipos (scratch)', 'Individual (handicap)']);
    expect(m.sections.map((s) => refsOf(s.rows[0].current!.units))).toEqual([['t:B'], ['p:ana']]);
  });

  it('entregados: «Campeones», hasta cuándo se corrige y «El podio cambió» si ya no coincide (solo admins)', () => {
    const delivered = { deliveredAt: '2026-10-12T22:00:00Z', editableUntil: '2026-10-26T22:00:00Z' };
    const p = prize([
      slot('S1', 'equipo', { ...delivered, winners: [{ ref: 't:B', name: 'Los Spares', teamId: 'B', players: ['pedro', 'rosa'] }] }),
      slot('S2', 'individual', { ...delivered, winners: [{ ref: 'p:luis', name: 'Luis', teamId: null, players: ['luis'] }] }),
    ]);
    const m = cardModel(comp, p, [champ], { podium, admin: true });
    expect(m).toMatchObject({ state: 'entregados', heading: 'Campeones', allDelivered: true, podiumChanged: true });
    expect(correctionWindow(m, Date.parse('2026-10-13T00:00:00Z'))).toEqual({ open: true, deadline: '2026-10-26T22:00:00Z', someExpired: false });
    expect(cardModel(comp, p, [champ], { podium }).podiumChanged).toBe(false);
    expect(cardModel(comp, prize(p.slots.slice(0, 1)), [champ], { podium, admin: true }).podiumChanged).toBe(false);
    expect(cardModel(comp, prize(p.slots, { closedAt: '2026-10-13T00:00:00Z' }), [champ], { podium }).state).toBe('cerrados');
  });

  it('un lugar quitado a propósito (entregado y sin ganadores) no es «entregado» ni dispara «El podio cambió»', () => {
    const delivered = { deliveredAt: '2026-10-12T22:00:00Z', editableUntil: '2026-10-26T22:00:00Z' };
    const p = prize([
      slot('S1', 'equipo', { ...delivered, winners: [{ ref: 't:A', name: 'Los Strikers', teamId: 'A', players: ['luis', 'pedro'] }] }),
      slot('S2', 'individual', { ...delivered, winners: [] }),
    ]);
    const m = cardModel(comp, p, [champ], { podium, admin: true });
    expect(m.sections.map((s) => s.rows[0].delivered)).toEqual([true, false]);
    expect(m).toMatchObject({ state: 'entregados', allDelivered: false });
    // S1 ya no coincide con el podio del teléfono (t:B): el aviso sale por él, no por el lugar vacío.
    expect(m.podiumChanged).toBe(true);
    const onlyEmpty = cardModel(comp, prize([p.slots[1]]), [champ], { podium, admin: true });
    expect(onlyEmpty).toMatchObject({ state: 'elegidos', podiumChanged: false });
  });

  it('las correcciones, lugar por lugar: un lugar sin entregar se entrega aunque otro ya pasó sus 14 días', () => {
    const old = { deliveredAt: '2026-10-01T00:00:00Z', editableUntil: '2026-10-15T00:00:00Z', winners: [{ ref: 't:B', name: 'Los Spares', teamId: 'B', players: ['pedro'] }] };
    const late = Date.parse('2026-10-20T00:00:00Z');
    const mixed = cardModel(comp, prize([slot('S1', 'equipo', old), slot('S2', 'individual')]), [champ], { admin: true });
    expect(correctionWindow(mixed, late)).toEqual({ open: true, deadline: null, someExpired: true });
    const allOld = cardModel(comp, prize([slot('S1', 'equipo', old)]), [champ], { admin: true });
    expect(correctionWindow(allOld, late)).toEqual({ open: false, deadline: null, someExpired: true });
    const closed = cardModel(comp, prize([slot('S1', 'equipo', { ...old, editableUntil: '2026-10-30T00:00:00Z' })], { closedAt: '2026-10-02T00:00:00Z' }), [champ], { admin: true });
    expect(correctionWindow(closed, late)).toEqual({ open: false, deadline: null, someExpired: false });
  });

  it('un diseño escondido no se ve (los admins sí ven el lugar); sin premios', () => {
    const p = prize([slot('S1', 'equipo')]);
    expect(cardModel(comp, p, [{ ...champ, status: 'oculta' }]).sections).toEqual([]);
    expect(cardModel(comp, p, [], { admin: true }).sections[0].rows[0].design).toBeNull();
    expect(cardModel(comp, null, [champ])).toMatchObject({ state: 'sin_premios', sections: [] });
  });
});
