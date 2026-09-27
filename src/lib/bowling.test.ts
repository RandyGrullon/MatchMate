import { describe, expect, it } from 'vitest';
import { frameStats, maxNextRoll, replaceRoll, scoreGame, standingMask, standingNow, validRolls, ALL_PINS } from './bowling';

const rep = (n: number, ...rolls: number[]) => Array.from({ length: n }, () => rolls).flat();

describe('puntaje', () => {
  it('juego perfecto = 300', () => {
    const g = scoreGame(rep(12, 10));
    expect(g.score).toBe(300);
    expect(g.complete).toBe(true);
    expect(g.frames[9].marks).toEqual(['X', 'X', 'X']);
    expect(g.frames.map((f) => f.total)).toEqual([30, 60, 90, 120, 150, 180, 210, 240, 270, 300]);
  });

  it('todo 5 y spare = 150', () => {
    const g = scoreGame(rep(21, 5));
    expect(g.score).toBe(150);
    expect(g.complete).toBe(true);
    expect(g.frames[0].marks).toEqual(['5', '/']);
  });

  it('todo en el canal = 0', () => {
    const g = scoreGame(rep(20, 0));
    expect(g.score).toBe(0);
    expect(g.complete).toBe(true);
    expect(g.frames[0].marks).toEqual(['-', '-']);
  });

  it('9 y fallo en todos = 90', () => {
    const g = scoreGame(rep(10, 9, 0));
    expect(g.score).toBe(90);
    expect(g.complete).toBe(true);
  });

  it('strike deja el acumulado pendiente hasta tener dos tiros más', () => {
    expect(scoreGame([10]).frames[0].total).toBeNull();
    expect(scoreGame([10, 3]).frames[0].total).toBeNull();
    const g = scoreGame([10, 3, 4]);
    expect(g.frames.map((f) => f.total)).toEqual([17, 24]);
    expect(g.complete).toBe(false);
  });

  it('spare en el 10 da un tiro más', () => {
    const rolls = [...rep(9, 0, 0), 7, 3];
    expect(scoreGame(rolls).complete).toBe(false);
    expect(maxNextRoll(rolls)).toBe(10);
    const g = scoreGame([...rolls, 10]);
    expect(g.score).toBe(20);
    expect(g.frames[9].marks).toEqual(['7', '/', 'X']);
    expect(g.complete).toBe(true);
  });

  it('en el 10: X y luego 7 deja solo 3 para el último tiro', () => {
    const rolls = [...rep(9, 0, 0), 10, 7];
    expect(maxNextRoll(rolls)).toBe(3);
    expect(scoreGame([...rolls, 3]).frames[9].marks).toEqual(['X', '7', '/']);
  });

  it('en el 10 sin marca no hay tercer tiro', () => {
    expect(scoreGame([...rep(9, 0, 0), 4, 4]).complete).toBe(true);
    expect(maxNextRoll([...rep(9, 0, 0), 4, 4])).toBe(-1);
  });
});

describe('tiros posibles', () => {
  it('después de 8 solo quedan 2', () => {
    expect(maxNextRoll([8])).toBe(2);
    expect(standingNow([8])).toMatchObject({ standing: 2, fresh: false, frame: 0, roll: 1 });
  });
  it('después de un strike vuelve a haber 10', () => {
    expect(standingNow([10])).toMatchObject({ standing: 10, fresh: true, frame: 1, roll: 0 });
  });
  it('valida la lista completa', () => {
    expect(validRolls([8, 2, 10, 3])).toBe(true);
    expect(validRolls([8, 3])).toBe(false);
    expect(validRolls(rep(13, 10))).toBe(false);
  });
});

describe('estadísticas de cuadros', () => {
  it('cuenta strikes, spares y abiertos', () => {
    // X, 7/, 9-, X, X, 8/, 7-, X, 9/, X X 8
    const rolls = [10, 7, 3, 9, 0, 10, 10, 8, 2, 7, 0, 10, 9, 1, 10, 10, 8];
    const s = frameStats(rolls);
    expect(s.strikes).toBe(6);
    expect(s.spares).toBe(3);
    expect(s.opens).toBe(2);
    expect(scoreGame(rolls).complete).toBe(true);
  });
});

describe('pines parados', () => {
  it('con máscara quedan los pines que no cayeron', () => {
    // cayeron del 1 al 8
    const knocked = 0b00_1111_1111;
    expect(standingMask([8], [knocked])).toBe(ALL_PINS & ~knocked);
  });
  it('rack nuevo después de un strike', () => {
    expect(standingMask([10], [ALL_PINS])).toBe(ALL_PINS);
  });
});

describe('corregir un tiro', () => {
  const nulls = (n: number) => Array<number | null>(n).fill(null);

  it('cambia el número sin tocar los cuadros siguientes', () => {
    const r = replaceRoll([7, 2, 10, 5, 3], nulls(5), 1, 1, null);
    expect(r.rolls).toEqual([7, 1, 10, 5, 3]);
    expect(r.next).toBeNull();
  });

  it('un tiro que pasa a strike quita el segundo tiro del cuadro', () => {
    const r = replaceRoll([7, 2, 5, 3], nulls(4), 0, 10, null);
    expect(r.rolls).toEqual([10, 5, 3]);
    expect(scoreGame(r.rolls).frames[1].marks).toEqual(['5', '3']);
    expect(validRolls(r.rolls)).toBe(true);
  });

  it('una X que pasa a ser 7 deja el segundo tiro en 0 para corregirlo, y lo demás igual', () => {
    const r = replaceRoll([10, 5, 3], nulls(3), 0, 7, null);
    expect(r.rolls).toEqual([7, 0, 5, 3]);
    expect(r.next).toBe(1);
    expect(scoreGame(r.rolls).frames[1].marks).toEqual(['5', '3']);
  });

  it('si el segundo tiro ya no cabe, queda en 0 para corregirlo', () => {
    const r = replaceRoll([3, 6, 4, 4], nulls(4), 0, 7, null);
    expect(r.rolls).toEqual([7, 0, 4, 4]);
    expect(r.next).toBe(1);
  });

  it('en el último cuadro anotado, una X que pasa a 7 espera el segundo tiro', () => {
    const r = replaceRoll([5, 3, 10], nulls(3), 2, 7, null);
    expect(r.rolls).toEqual([5, 3, 7]);
    expect(r.next).toBeNull();
  });

  it('en el cuadro 10 se quita el tercer tiro si ya no hay spare', () => {
    const nine = rep(9, 10);
    const r = replaceRoll([...nine, 5, 5, 8], nulls(12), 10, 4, null);
    expect(r.rolls).toEqual([...nine, 5, 4]);
    expect(scoreGame(r.rolls).complete).toBe(true);
  });

  it('un spare sigue siendo spare y un cuadro abierto no se vuelve spare', () => {
    expect(replaceRoll([7, 3, 10, 10], nulls(4), 0, 6, null)).toEqual({ rolls: [6, 4, 10, 10], extra: nulls(4), next: null });
    // 7 2 → 8: el 2 ya no deja el cuadro abierto; se pide de nuevo el segundo tiro.
    expect(replaceRoll([7, 2, 5, 3], nulls(4), 0, 8, null)).toEqual({ rolls: [8, 0, 5, 3], extra: nulls(4), next: 1 });
    expect(replaceRoll([7, 1, 5, 3], nulls(4), 0, 8, null).rolls).toEqual([8, 1, 5, 3]);
  });

  it('en el cuadro 10 el spare se conserva con su tiro extra', () => {
    const nine = rep(9, 10);
    const r = replaceRoll([...nine, 7, 3, 5], nulls(12), 9, 6, null);
    expect(r.rolls).toEqual([...nine, 6, 4, 5]);
    expect(scoreGame(r.rolls).complete).toBe(true);
  });

  it('en el cuadro 10, X que pasa a número (o al revés) deja volver a anotar lo que sigue', () => {
    const nine = rep(9, 10);
    expect(replaceRoll([...nine, 10, 7, 2], nulls(12), 10, 10, null).rolls).toEqual([...nine, 10, 10]);
    expect(replaceRoll([...nine, 10, 10, 10], nulls(12), 9, 8, null).rolls).toEqual([...nine, 8]);
    expect(replaceRoll([...nine, 10, 6, 4], nulls(12), 11, 3, null).rolls).toEqual([...nine, 10, 6, 3]);
  });

  it('los pines marcados siguen alineados con los tiros', () => {
    const r = replaceRoll([7, 2, 5, 3], [1, 2, 3, 4], 0, 10, null);
    expect(r.extra).toEqual([null, 3, 4]);
  });
});
