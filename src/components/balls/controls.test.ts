/**
 * Los controles del creador de bolas en el teléfono: el deslizable (valor en su paso, dónde va la bolita, cuánto sube
 * con el lector de pantalla) y «Otro color» (el tablero de tono y brillo y la tira de grises, y dónde se marca un color).
 */
import { describe, expect, it } from 'vitest';
import { BOARD_EDGE, boardColor, boardHue, colorSpot, grayColor, sliderFraction, sliderNudge, sliderValue, snapToStep } from './controls';

describe('el control deslizable', () => {
  it('el valor donde está el dedo, en su paso y dentro del rango', () => {
    // Tamaño del dibujo: de 0.5 a 2, de a 0.05.
    expect(sliderValue(0, 300, 0.5, 2, 0.05)).toBe(0.5);
    expect(sliderValue(300, 300, 0.5, 2, 0.05)).toBe(2);
    expect(sliderValue(100, 300, 0.5, 2, 0.05)).toBe(1);
    // Afuera del riel queda en la punta.
    expect(sliderValue(-40, 300, 0.5, 2, 0.05)).toBe(0.5);
    expect(sliderValue(900, 300, 0.5, 2, 0.05)).toBe(2);
    // Ángulo: de 0 a 359, de a 1.
    expect(sliderValue(150, 300, 0, 359, 1)).toBe(180);
    // Sin ancho todavía: el mínimo.
    expect(sliderValue(10, 0, 0, 1, 0.05)).toBe(0);
  });

  it('sin decimales de más', () => {
    expect(snapToStep(0.1 + 0.2, 0, 1, 0.05)).toBe(0.3);
    expect(snapToStep(0.33, 0.1, 0.6, 0.02)).toBe(0.34);
    expect(snapToStep(359.6, 0, 359, 1)).toBe(359);
  });

  it('dónde va la bolita y cuánto sube con el lector de pantalla', () => {
    expect(sliderFraction(1.25, 0.5, 2)).toBe(0.5);
    expect(sliderFraction(5, 0, 1)).toBe(1);
    expect(sliderFraction(1, 1, 1)).toBe(0);
    expect(sliderNudge(0, 359, 1)).toBe(18);
    expect(sliderNudge(0.1, 0.6, 0.02)).toBe(0.02);
    expect(sliderNudge(0, 1, 0.05)).toBe(0.05);
  });
});

describe('«Otro color»', () => {
  it('el tablero: el tono de izquierda a derecha, claro arriba, puro en el medio y oscuro abajo', () => {
    expect(boardHue(0)).toBe('#ff0000');
    expect(boardHue(1 / 6)).toBe('#ffff00');
    expect(boardHue(1)).toBe('#ff0000');
    expect(boardColor(0, 0.5)).toBe('#ff0000');
    expect(boardColor(4 / 6, 0.5)).toBe('#0000ff');
    // Arriba casi blanco y abajo casi negro, pero con algo de color.
    const top = boardColor(0, 0);
    const bottom = boardColor(0, 1);
    expect(top).not.toBe('#ffffff');
    expect(bottom).not.toBe('#000000');
    expect(top).toBe('#ffd6d6');
    expect(bottom).toBe('#290000');
    // Fuera del tablero queda en el borde.
    expect(boardColor(-1, 2)).toBe(bottom);
  });

  it('la tira de grises: de blanco a negro', () => {
    expect(grayColor(0)).toBe('#ffffff');
    expect(grayColor(1)).toBe('#000000');
    expect(grayColor(0.5)).toBe('#808080');
  });

  it('dónde se marca el color de ahora: un color del tablero cae donde se tocó; un gris, en la tira', () => {
    const spot = colorSpot(boardColor(0.25, 0.3));
    expect(spot?.on).toBe('board');
    if (spot?.on === 'board') {
      expect(spot.x).toBeCloseTo(0.25, 1);
      expect(spot.y).toBeCloseTo(0.3, 1);
    }
    // Uno de la paleta de las bolas (el azul) y el negro.
    expect(colorSpot('#1d4ed8')).toMatchObject({ on: 'board' });
    expect(colorSpot('#111827')).toMatchObject({ on: 'gray' });
    expect(colorSpot('#ffffff')).toEqual({ on: 'gray', x: 0 });
    // El código corto también vale; lo que no es un color, no se marca.
    expect(colorSpot('#000')).toEqual({ on: 'gray', x: 1 });
    expect(colorSpot('rojo')).toBeNull();
    expect(colorSpot(null)).toBeNull();
    expect(BOARD_EDGE).toBeLessThan(1);
  });
});
