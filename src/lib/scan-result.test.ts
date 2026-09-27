import { describe, expect, it } from 'vitest';
import { parseScanResult, ScanError } from './scan-result';

const json = (o: unknown) => JSON.stringify(o);

describe('lectura de la foto', () => {
  it('pantalla Results: juegos por posición y la suma cuadra con el total', () => {
    const rows = parseScanResult(
      json({
        esPantallaDeBoliche: true,
        jugadores: [
          { nombre: 'PEDRO SR', handicap: 0, juegos: [190, 155, 172], total: 517 },
          { nombre: 'LUIS', handicap: 0, juegos: [148, 176, 190], total: 514 },
        ],
      }),
    );
    expect(rows.map((r) => [r.name, r.games, r.matchesTotal])).toEqual([
      ['PEDRO SR', [190, 155, 172], true],
      ['LUIS', [148, 176, 190], true],
    ]);
  });

  it('un 0 es un juego que no jugó y conserva la posición de los demás', () => {
    const [carla] = parseScanResult(json({ jugadores: [{ nombre: 'CARLA', juegos: [0, 120, 101], total: 221 }] }));
    expect(carla.games).toEqual([null, 120, 101]);
    expect(carla.matchesTotal).toBe(true);
  });

  it('descarta los puestos vacíos de la máquina (0-0-0)', () => {
    const rows = parseScanResult(
      json({
        jugadores: [
          { nombre: 'Jugador5', juegos: [0, 0, 0], total: 0 },
          { nombre: 'Tomás', juegos: [205, 131, 160], total: 496 },
        ],
      }),
    );
    expect(rows.map((r) => r.name)).toEqual(['Tomás']);
  });

  it('marca cuando la suma no cuadra con el total de la pantalla', () => {
    const [r] = parseScanResult(json({ jugadores: [{ nombre: 'Nelson', juegos: [170, 145, 150], total: 480 }] }));
    expect(r.matchesTotal).toBe(false);
  });

  it('pantalla de solo totales: explica que falta la foto de juegos', () => {
    const run = () =>
      parseScanResult(
        json({
          soloTotales: true,
          jugadores: [
            { nombre: 'PEDRO SR', juegos: [], total: 517 },
            { nombre: 'LUIS', juegos: [], total: 514 },
          ],
        }),
      );
    expect(run).toThrow(ScanError);
    expect(run).toThrow(/solo muestra totales \(PEDRO SR 517, LUIS 514\)/);
  });

  it('foto que no es de boliche', () => {
    expect(() => parseScanResult(json({ esPantallaDeBoliche: false, jugadores: [] }))).toThrow(/no parece una pantalla/);
  });
});
