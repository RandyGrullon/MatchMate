import { describe, expect, it } from 'vitest';
import { autoDraft, groupsDraft, groupsPayload, groupsState, playersToAdd } from './groups';

const card = (id: string, playingHcp: number, groupNo: number | null = null, startHole = 1) => ({ id, playerId: `p-${id}`, playingHcp, groupNo, startHole });

/** Inscribir y armar los grupos de una ronda. */
describe('grupos de la ronda', () => {
  it('quiénes quedan por inscribir, con lo buscado', () => {
    const players = [
      { id: 'p-a', name: 'Golfista Uno' },
      { id: 'p-b', name: 'Golfista Dos' },
      { id: 'p-c', name: 'Jugador Tres' },
    ];
    expect(playersToAdd(players, [card('a', 10)], '').map((p) => p.id)).toEqual(['p-b', 'p-c']);
    expect(playersToAdd(players, [card('a', 10)], ' golf ').map((p) => p.id)).toEqual(['p-b']);
  });

  it('al abrir: el grupo de cada tarjeta y por dónde sale cada grupo', () => {
    const d = groupsDraft([card('a', 10, 1, 10), card('b', 5, null)]);
    expect(d).toEqual({ groupOf: { a: 1, b: null }, startOf: { 1: 10 } });
  });

  it('repartir de a 4 por handicap; con salida simultánea, cada grupo por un hoyo de dos en dos', () => {
    const cards = Array.from({ length: 6 }, (_, i) => card(`c${i}`, 20 - i));
    const holes = Array.from({ length: 18 }, (_, i) => i + 1);
    const plain = autoDraft(cards, holes, false);
    expect(plain.startOf).toBeNull();
    expect(plain.groupOf.c5).toBe(1);
    const shotgun = autoDraft(cards, holes, true);
    expect(shotgun.startOf).toEqual({ 1: 1, 2: 3 });
  });

  it('hasta qué grupo se ofrece, los que se usan y si alguno tiene más de 4', () => {
    expect(groupsState(3, { a: null, b: null, c: null })).toEqual({ maxGroup: 2, used: [], tooBig: false });
    expect(groupsState(5, { a: 1, b: 1, c: 1, d: 1, e: 1 }).tooBig).toBe(true);
    expect(groupsState(2, { a: 7, b: 2 })).toEqual({ maxGroup: 7, used: [2, 7], tooBig: false });
  });

  it('lo que se guarda: con salida simultánea el hoyo del grupo (o el primero); sin grupo, nada', () => {
    const cards = [card('a', 1), card('b', 2), card('c', 3)];
    const draft = { groupOf: { a: 1, b: 2, c: null }, startOf: { 1: 5 } };
    expect(groupsPayload(cards, draft, true, 1)).toEqual([
      { cardId: 'a', groupNo: 1, startHole: 5 },
      { cardId: 'b', groupNo: 2, startHole: 1 },
      { cardId: 'c', groupNo: null, startHole: null },
    ]);
    expect(groupsPayload(cards, draft, false, 1)[0]).toEqual({ cardId: 'a', groupNo: 1, startHole: null });
  });
});
