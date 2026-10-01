import { describe, expect, it } from 'vitest';
import { scanBallUpdate, scanGameBall } from './scanBalls';

describe('la bola de mis juegos al verificar con foto', () => {
  it('la que se ve en cada juego: la elegida aquí y, si no, la del juego o la última que usé', () => {
    // Elegida en esta foto (también «sin bola»): esa, aunque el juego tenga otra.
    expect(scanGameBall({ 0: 'a' }, { 0: 'b' }, 0, true, 'c')).toBe('b');
    expect(scanGameBall({ 0: 'a' }, { 0: null }, 0, true, 'c')).toBeNull();
    // Sin elegir: la que ya tenía el juego.
    expect(scanGameBall({ 0: 'a' }, { 1: 'b' }, 0, true, 'c')).toBe('a');
    // Uno sin jugar: la última que usé.
    expect(scanGameBall({}, {}, 2, false, 'c')).toBe('c');
    // Uno con puntaje y sin bola (lo anotó el admin): sin bola, no se le pone una sola.
    expect(scanGameBall({}, {}, 1, true, 'c')).toBeNull();
  });

  it('lo que va a la cola al guardar: solo las bolas que cambian de los juegos que se guardan', () => {
    const shown: Record<number, string | null> = { 0: 'a', 1: 'b', 2: null };
    const ballOf = (g: number) => shown[g] ?? null;
    // El 0 ya tenía la «a» (no cambia); el 1 pasa a la «b»; el 2 se queda sin bola (no tenía).
    expect(scanBallUpdate({ 0: 'a' }, { 0: 180, 1: 200, 2: 190 }, 3, ballOf)).toEqual({ 1: 'b' });
    // Quitarle la que tenía.
    expect(scanBallUpdate({ 2: 'c' }, { 2: 190 }, 3, ballOf)).toEqual({ 2: null });
    // Nada cambia: nada que mandar.
    expect(scanBallUpdate({ 0: 'a' }, { 0: 180, 2: 190 }, 3, ballOf)).toBeNull();
    expect(scanBallUpdate({}, {}, 3, ballOf)).toBeNull();
  });

  it('un juego que no se guarda (vacío o fuera del evento) no se manda', () => {
    const ballOf = () => 'a';
    // Solo el 1 se guarda: el 0 y el 2 no van aunque se vea la «a».
    expect(scanBallUpdate({}, { 1: 200 }, 3, ballOf)).toEqual({ 1: 'a' });
    // El evento tiene 3 juegos: el 3 y el 4 no caben (set_game_balls diría «invalido»).
    expect(scanBallUpdate({}, { 2: 200, 3: 180, 4: 170 }, 3, ballOf)).toEqual({ 2: 'a' });
    expect(scanBallUpdate({}, { 3: 180 }, 3, ballOf)).toBeNull();
  });
});
