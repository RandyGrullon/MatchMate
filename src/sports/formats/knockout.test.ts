import { describe, expect, it } from 'vitest';
import { champion, createBracket, podium, roundName, seedOrder, setWinner, type Bracket } from './knockout';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `s${i + 1}`);
const round = (b: Bracket, r: number) => b.matches.filter((m) => m.round === r && !m.thirdPlace);
const byes = (b: Bracket) => round(b, 1).filter((m) => m.bye).map((m) => m.winner);

describe('siembra', () => {
  it('orden estándar', () => {
    expect(seedOrder(2)).toEqual([1, 2]);
    expect(seedOrder(4)).toEqual([1, 4, 2, 3]);
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    expect(seedOrder(16)).toEqual([1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11]);
    expect(() => seedOrder(6)).toThrow('potencia de 2');
  });

  it('nombres de ronda', () => {
    expect([1, 2, 3, 4].map((r) => roundName(r, 4))).toEqual(['Octavos de final', 'Cuartos de final', 'Semifinal', 'Final']);
    expect(roundName(1, 6)).toBe('Ronda de 64');
  });
});

describe('cuadro con byes', () => {
  it('5 participantes: cuadro de 8, pase directo para los sembrados 1, 2 y 3', () => {
    const b = createBracket(ids(5));
    expect(b.size).toBe(8);
    expect(b.rounds).toBe(3);
    expect(byes(b)).toEqual(['s1', 's2', 's3']);
    const real = round(b, 1).filter((m) => !m.bye);
    expect(real.map((m) => [m.side1, m.side2])).toEqual([['s4', 's5']]);
    // Los del bye ya están en la segunda ronda: 1 espera al ganador de 4-5; 2 contra 3.
    expect(round(b, 2).map((m) => [m.side1, m.side2])).toEqual([
      ['s1', null],
      ['s2', 's3'],
    ]);
  });

  it('6 participantes: byes para 1 y 2; 3-6 y 4-5 juegan', () => {
    const b = createBracket(ids(6));
    expect(byes(b)).toEqual(['s1', 's2']);
    expect(round(b, 1).filter((m) => !m.bye).map((m) => [m.seed1, m.seed2])).toEqual([
      [4, 5],
      [3, 6],
    ]);
  });

  it('11 participantes: cuadro de 16 con byes para los 5 mejores', () => {
    const b = createBracket(ids(11));
    expect(b.size).toBe(16);
    expect(byes(b).slice().sort()).toEqual(['s1', 's2', 's3', 's4', 's5']);
    expect(round(b, 1).filter((m) => !m.bye).map((m) => [m.seed1, m.seed2])).toEqual([
      [8, 9],
      [7, 10],
      [6, 11],
    ]);
    // 1 y 2 solo se pueden cruzar en la final.
    expect(round(b, 3).map((m) => [m.side1, m.side2])).toEqual([
      [null, null],
      [null, null],
    ]);
  });

  it('potencia de 2 exacta: sin byes', () => {
    const b = createBracket(ids(8));
    expect(byes(b)).toEqual([]);
    expect(round(b, 1).map((m) => [m.seed1, m.seed2])).toEqual([
      [1, 8],
      [4, 5],
      [2, 7],
      [3, 6],
    ]);
  });
});

describe('avanzar ganadores', () => {
  const play = (b: Bracket, key: string, winner: string) => setWinner(b, key, winner);

  it('el ganador pasa al siguiente partido, con 3.er lugar para los perdedores de semifinal', () => {
    let b = createBracket(ids(6), { thirdPlace: true });
    b = play(b, 'R1-2', 's4');
    b = play(b, 'R1-4', 's6');
    const semis = round(b, 2);
    expect(semis.map((m) => [m.side1, m.side2])).toEqual([
      ['s1', 's4'],
      ['s2', 's6'],
    ]);
    b = play(b, 'R2-1', 's4');
    b = play(b, 'R2-2', 's2');
    const p3 = b.matches.find((m) => m.key === 'P3')!;
    expect([p3.side1, p3.side2]).toEqual(['s1', 's6']);
    b = play(b, 'R3-1', 's2');
    b = play(b, 'P3', 's1');
    expect(champion(b)).toBe('s2');
    expect(podium(b)).toEqual(['s2', 's4', 's1', 's6']);
  });

  it('corregir un ganador borra lo que dependía de él', () => {
    let b = createBracket(ids(4), { thirdPlace: true });
    b = play(b, 'R1-1', 's1');
    b = play(b, 'R1-2', 's2');
    b = play(b, 'R2-1', 's1');
    b = play(b, 'P3', 's3');
    expect(champion(b)).toBe('s1');
    b = play(b, 'R1-1', 's4');
    expect(champion(b)).toBeNull();
    const final = b.matches.find((m) => m.key === 'R2-1')!;
    expect([final.side1, final.side2]).toEqual(['s4', 's2']);
    // El 3.er lugar ahora es s1 contra s3: el ganador anotado (s3) sigue valiendo.
    const p3 = b.matches.find((m) => m.key === 'P3')!;
    expect([p3.side1, p3.side2, p3.winner]).toEqual(['s1', 's3', 's3']);
    expect(b.winners).toEqual({ 'R1-1': 's4', 'R1-2': 's2', P3: 's3' });
    expect(setWinner(b, 'R1-1', null).matches.find((m) => m.key === 'R2-1')!.side1).toBeNull();
  });

  it('errores: ganador ajeno, partido sin lados, bye, partido inexistente', () => {
    const b = createBracket(ids(5));
    expect(() => setWinner(b, 'R1-2', 's1')).toThrow('El ganador tiene que ser uno de los dos lados.');
    expect(() => setWinner(b, 'R2-1', 's1')).toThrow('Todavía no se sabe quién juega ese partido.');
    expect(() => setWinner(b, 'R1-1', 's1')).toThrow('Ese partido es un pase directo.');
    expect(() => setWinner(b, 'R9-1', 's1')).toThrow('Ese partido no existe en el cuadro.');
    expect(() => createBracket(['a'])).toThrow('al menos 2');
    expect(() => createBracket(['a', 'a'])).toThrow('repetidos');
  });

  it('el 3.er lugar solo existe con 4 o más', () => {
    expect(createBracket(ids(3), { thirdPlace: true }).matches.some((m) => m.thirdPlace)).toBe(false);
    expect(createBracket(ids(4), { thirdPlace: true }).matches.some((m) => m.thirdPlace)).toBe(true);
  });
});
